import { GLOBAL_MINIMA, MAP_LEVELS, gradientByLevel, lossFunctionByLevel } from './lossFunction.js';

export const START_POSITIONS = {
    1: { x: -7, z: -7 },   // 글로벌(0,0) dist~10 — 입문
    2: { x: -5, z: -4 },   // 글로벌(0,0) dist~6.4 — 초급
    3: { x: -5, z: -4 },   // 글로벌(0,0) dist~6.4 — 중급
    4: { x: 6, z: 6 },     // 글로벌(0,0) dist~8.5 — 고급: 링 장벽
    5: { x: -4, z: -4 },   // 글로벌(0,0) dist~5.7 — 마스터
    6: { x: 4, z: 3 },     // 글로벌(-3,0) dist~7.6 — 경로 위 함정
    7: { x: 6, z: 6 },     // 글로벌(0,0) dist~8.5 — 나선 계곡
    8: { x: 5, z: 5 },     // 글로벌(-3,-3) dist~11.3 — 절벽과 평원
};

export const SPEED_SCALE = {
    1: 0.5,
    2: 0.45,
    3: 0.35,
    4: 0.5,
    5: 0.4,
    6: 0.35,
    7: 0.42,
    8: 0.6,
};

export const CONVERGE_TRAIL = {
    1: 80,
    2: 100,
    3: 150,
    4: 150,
    5: 200,
    6: 150,
    7: 200,
    8: 200,
};

export const MAP_BOUNDARY = {
    1: 20,
    2: 20,
    3: 20,
    4: 20,
    5: 20,
    6: 20,
    7: 20,
    8: 30,
};

export const CONVERGE_SPEED = 0.0005;
export const VEL_CLAMP = 5;
export const MAX_TRAIL_POINTS = 300;
export const RACE_TIMEOUT_MS = 45000;

const VALID_MAP_LEVELS = new Set(MAP_LEVELS.map((map) => map.level));
const RACE_STATUS_PRIORITY = {
    converged: 0,
    local_minimum: 1,
    escaped: 2,
};

export function normalizeMapLevel(level, fallback = 2) {
    const parsed = Number(level);
    if (VALID_MAP_LEVELS.has(parsed)) {
        return parsed;
    }
    return fallback;
}

export function clampLearningRate(value, fallback = 0.1) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.max(0.001, Math.min(2.0, parsed));
}

export function clampMomentum(value, fallback = 0.9) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.max(0, Math.min(0.99, parsed));
}

export function getRaceStartPosition(level) {
    const normalizedLevel = normalizeMapLevel(level);
    return START_POSITIONS[normalizedLevel] || START_POSITIONS[2];
}

export function getRandomizedStartPosition(level, spread = 0.5, random = Math.random) {
    const start = getRaceStartPosition(level);
    return {
        x: start.x + (random() - 0.5) * spread,
        z: start.z + (random() - 0.5) * spread,
    };
}

export function getDistanceToGlobalMinimum(x, z, level) {
    const normalizedLevel = normalizeMapLevel(level);
    const globalMinimum = GLOBAL_MINIMA[normalizedLevel] || GLOBAL_MINIMA[2];
    return Math.hypot(x - globalMinimum.x, z - globalMinimum.z);
}

export function createRaceBall({ level, x, z, lr = 0.1, momentum = 0.9, status = 'racing' }) {
    const normalizedLevel = normalizeMapLevel(level);
    const nextX = Number.isFinite(x) ? x : 0;
    const nextZ = Number.isFinite(z) ? z : 0;
    const nextY = lossFunctionByLevel(nextX, nextZ, normalizedLevel);

    return {
        x: nextX,
        z: nextZ,
        y: nextY,
        vx: 0,
        vz: 0,
        trail: [],
        status,
        loss: nextY,
        lr: clampLearningRate(lr),
        momentum: clampMomentum(momentum),
        cumulativeLoss: 0,
    };
}

export function advanceRaceBall(ball, level) {
    const normalizedLevel = normalizeMapLevel(level);

    ball.lr = clampLearningRate(ball.lr, ball.lr ?? 0.1);
    ball.momentum = clampMomentum(ball.momentum, ball.momentum ?? 0.9);

    const grad = gradientByLevel(ball.x, ball.z, normalizedLevel);
    const speedScale = SPEED_SCALE[normalizedLevel] || SPEED_SCALE[2];

    ball.vx = ball.momentum * ball.vx - ball.lr * grad.gx * speedScale;
    ball.vz = ball.momentum * ball.vz - ball.lr * grad.gz * speedScale;

    ball.vx *= 0.98;
    ball.vz *= 0.98;

    ball.vx = Math.max(-VEL_CLAMP, Math.min(VEL_CLAMP, ball.vx));
    ball.vz = Math.max(-VEL_CLAMP, Math.min(VEL_CLAMP, ball.vz));

    ball.x += ball.vx;
    ball.z += ball.vz;
    ball.y = lossFunctionByLevel(ball.x, ball.z, normalizedLevel);
    ball.loss = ball.y;
    ball.cumulativeLoss = (ball.cumulativeLoss || 0) + (Number.isFinite(ball.loss) ? ball.loss : 100);

    if (Number.isFinite(ball.x) && Number.isFinite(ball.y) && Number.isFinite(ball.z)) {
        ball.trail.push({ x: ball.x, y: ball.y, z: ball.z });
    }
    if (ball.trail.length > MAX_TRAIL_POINTS) {
        ball.trail.shift();
    }

    return ball;
}

export function inspectRaceBall(ball, level, elapsedMs) {
    const normalizedLevel = normalizeMapLevel(level);

    if (!Number.isFinite(ball.x) || !Number.isFinite(ball.z) || !Number.isFinite(ball.y)) {
        return {
            status: 'escaped',
            reason: 'invalid',
            distToGlobal: Number.POSITIVE_INFINITY,
        };
    }

    const boundary = MAP_BOUNDARY[normalizedLevel] || MAP_BOUNDARY[2];
    if (Math.abs(ball.x) > boundary || Math.abs(ball.z) > boundary || ball.y > 15) {
        return {
            status: 'escaped',
            reason: 'boundary',
            distToGlobal: getDistanceToGlobalMinimum(ball.x, ball.z, normalizedLevel),
        };
    }

    const distToGlobal = getDistanceToGlobalMinimum(ball.x, ball.z, normalizedLevel);

    if (elapsedMs > RACE_TIMEOUT_MS) {
        return {
            status: distToGlobal < 1.5 ? 'converged' : 'local_minimum',
            reason: 'timeout',
            distToGlobal,
        };
    }

    const speed = Math.hypot(ball.vx, ball.vz);
    const minTrail = CONVERGE_TRAIL[normalizedLevel] || CONVERGE_TRAIL[2];
    if (speed < CONVERGE_SPEED && ball.trail.length > minTrail) {
        return {
            status: distToGlobal < 1.5 ? 'converged' : 'local_minimum',
            reason: 'stopped',
            distToGlobal,
        };
    }

    return null;
}

export function createRaceResult({
    teamId,
    teamName,
    ball,
    level,
    timeMs,
    status = ball.status,
    lr = ball.lr,
    momentum = ball.momentum,
    finalLoss = ball.loss,
    distToGlobal = getDistanceToGlobalMinimum(ball.x, ball.z, level),
}) {
    return {
        teamId,
        teamName,
        finalLoss,
        status,
        time: timeMs,
        cumulativeLoss: ball.cumulativeLoss || 0,
        lr,
        momentum,
        distToGlobal,
    };
}

export function rankRaceResults(results) {
    return [...results]
        .sort((left, right) => {
            const leftPriority = RACE_STATUS_PRIORITY[left.status] ?? RACE_STATUS_PRIORITY.escaped;
            const rightPriority = RACE_STATUS_PRIORITY[right.status] ?? RACE_STATUS_PRIORITY.escaped;
            if (leftPriority !== rightPriority) {
                return leftPriority - rightPriority;
            }
            if (left.time !== right.time) {
                return left.time - right.time;
            }
            const leftLoss = Number.isFinite(left.cumulativeLoss) ? left.cumulativeLoss : Number.POSITIVE_INFINITY;
            const rightLoss = Number.isFinite(right.cumulativeLoss) ? right.cumulativeLoss : Number.POSITIVE_INFINITY;
            return leftLoss - rightLoss;
        })
        .map((result, index) => ({
            ...result,
            rank: index + 1,
        }));
}
