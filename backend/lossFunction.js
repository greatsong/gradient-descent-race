/**
 * 공용 Loss Surface 함수 (경사하강법 레이싱)
 * - 8단계 난이도별 맵: 각 레벨이 최적화의 핵심 개념을 가르침
 * - Balance Test V13 검증 완료 (8/8 PASS)
 *
 * 맵 설계 원칙:
 *   1. 포물면(bowl)을 기본으로 글로벌 방향 그래디언트 확보
 *   2. Gaussian well로 글로벌 최솟값 형성
 *   3. 로컬 트랩은 교육적 장애물로 추가
 *   4. SPEED_SCALE × 그래디언트 = 공의 가속도
 */

// ── 8단계 레이스 맵 메타데이터 ──
export const MAP_LEVELS = [
    { level: 1, name: '입문: 학습률의 의미', emoji: '⛳', description: '큰 학습률 = 빠른 하강! 최적 LR을 찾아보세요.', difficulty: '입문' },
    { level: 2, name: '초급: 학습률 조절', emoji: '🏔️', description: 'LR이 너무 크면 진동! 적절한 범위를 찾아보세요.', difficulty: '초급' },
    { level: 3, name: '중급: 로컬 미니마 탈출', emoji: '🌋', description: '모멘텀 없이는 함정에 빠집니다! 모멘텀의 힘을 경험하세요.', difficulty: '중급' },
    { level: 4, name: '고급: 링 장벽 돌파', emoji: '🌊', description: '링 모양 장벽이 중심을 감싸고 있어요. 모멘텀으로 돌파하세요!', difficulty: '고급' },
    { level: 5, name: '마스터: 함정 미로', emoji: '🎯', description: 'LR과 모멘텀 모두 정밀 조절이 필요한 최종 도전!', difficulty: '마스터' },
    { level: 6, name: '중급: 경로 위 함정', emoji: '⚖️', description: '글로벌로 가는 길에 유혹적인 함정이! 모멘텀으로 통과하세요.', difficulty: '중급' },
    { level: 7, name: '고급: 나선 계곡', emoji: '🌀', description: '나선형 장벽과 로컬 함정! 경로 의존성을 체험합니다.', difficulty: '고급' },
    { level: 8, name: '마스터: 절벽과 평원', emoji: '🏜️', description: '절벽 너머 깊은 계곡! 다단계 전략 도전!', difficulty: '마스터' },
];

// 레벨별 맵 크기 (3D 렌더링용)
export const MAP_SIZES = {
    1: 20, 2: 20, 3: 20, 4: 20, 5: 20,
    6: 20, 7: 20, 8: 30,
};

// ════════════════════════════════════════════════════════════════
// Level 1: 입문 — 순수 포물면
// 글로벌 최솟값: (0,0) / 시작: (-7,-7)
// 교육: LR이 클수록 빠르게 도달! M=0도 OK
// ════════════════════════════════════════════════════════════════
function lossLevel1(x, z) {
    return 0.05 * (x * x + z * z);
}

function gradientLevel1(x, z) {
    return { gx: 0.1 * x, gz: 0.1 * z };
}

// ════════════════════════════════════════════════════════════════
// Level 2: 초급 — 포물면 + x방향 채널
// 글로벌 최솟값: (0,0) / 시작: (-5,-4)
// 교육: LR 조절의 중요성 (x방향 추가 경사)
// ════════════════════════════════════════════════════════════════
function lossLevel2(x, z) {
    return 0.04 * (x * x + z * z) + 0.02 * x * x * Math.exp(-(z * z) / 4) + 1.0;
}

function gradientLevel2(x, z) {
    let gx = 0.08 * x, gz = 0.08 * z;
    const e = Math.exp(-(z * z) / 4);
    gx += 0.04 * x * e;
    gz += 0.02 * x * x * (-z / 2) * e;
    return { gx, gz };
}

// ════════════════════════════════════════════════════════════════
// Level 3: 중급 — 포물면 + 글로벌 well + 경로 위 로컬 트랩
// 글로벌 최솟값: (0,0) / 시작: (-5,-4)
// 교육: M=0은 로컬에 갇힘, M>0.8이면 탈출!
// ════════════════════════════════════════════════════════════════
function lossLevel3(x, z) {
    return 0.02 * (x * x + z * z)
        - 2.0 * Math.exp(-(x * x + z * z) / 3.0)
        - 1.5 * Math.exp(-((x + 2) * (x + 2) + (z + 2) * (z + 2)) / 1.5)
        - 0.8 * Math.exp(-((x + 4) * (x + 4) + z * z) / 2.0)
        + 2.5;
}

function gradientLevel3(x, z) {
    let gx = 0.04 * x, gz = 0.04 * z;
    const e1 = Math.exp(-(x * x + z * z) / 3.0);
    gx += (4 / 3) * x * e1; gz += (4 / 3) * z * e1;
    const e2 = Math.exp(-((x + 2) * (x + 2) + (z + 2) * (z + 2)) / 1.5);
    gx += 2 * (x + 2) * e2; gz += 2 * (z + 2) * e2;
    const e3 = Math.exp(-((x + 4) * (x + 4) + z * z) / 2.0);
    gx += 0.8 * (x + 4) * e3; gz += 0.8 * z * e3;
    return { gx, gz };
}

// ════════════════════════════════════════════════════════════════
// Level 4: 고급 — 포물면 + 깊은 well + 링 장벽
// 글로벌 최솟값: (0,0) / 시작: (6,6)
// 교육: r=3.5 링 장벽이 M=0 공을 막음, M>0.8이면 돌파!
// ════════════════════════════════════════════════════════════════
function lossLevel4(x, z) {
    const r2 = x * x + z * z;
    const r = Math.sqrt(r2) + 1e-10;
    return 0.04 * r2
        - 4.0 * Math.exp(-r2 / 1.5)
        + 0.5 * Math.exp(-((r - 3.5) * (r - 3.5)) / 0.5)
        + 4.5;
}

function gradientLevel4(x, z) {
    const r2 = x * x + z * z;
    const r = Math.sqrt(r2) + 1e-10;
    let gx = 0.08 * x, gz = 0.08 * z;
    const ew = Math.exp(-r2 / 1.5);
    gx += (8 / 1.5) * x * ew; gz += (8 / 1.5) * z * ew;
    const er = Math.exp(-((r - 3.5) * (r - 3.5)) / 0.5);
    const rc = -2.0 * (r - 3.5) / r;
    gx += rc * x * er; gz += rc * z * er;
    return { gx, gz };
}

// ════════════════════════════════════════════════════════════════
// Level 5: 마스터 — 포물면 + 글로벌 well + 6개 로컬 트랩
// 글로벌 최솟값: (0,0) / 시작: (-4,-4)
// 교육: LR과 M 모두 정밀하게 맞춰야 함
// ════════════════════════════════════════════════════════════════
function lossLevel5(x, z) {
    return 0.04 * (x * x + z * z)
        - 3.0 * Math.exp(-(x * x + z * z) / 2.0)
        - 0.8 * Math.exp(-((x + 3) * (x + 3) + (z - 2) * (z - 2)) / 1.5)
        - 0.7 * Math.exp(-((x - 1) * (x - 1) + (z + 4) * (z + 4)) / 1.5)
        - 0.6 * Math.exp(-((x - 4) * (x - 4) + (z + 1) * (z + 1)) / 1.5)
        - 0.8 * Math.exp(-((x + 1) * (x + 1) + (z - 4) * (z - 4)) / 1.5)
        - 0.7 * Math.exp(-((x - 3) * (x - 3) + (z - 3) * (z - 3)) / 1.5)
        - 0.6 * Math.exp(-((x + 3) * (x + 3) + (z + 3) * (z + 3)) / 1.5)
        + 3.5;
}

function gradientLevel5(x, z) {
    let gx = 0.08 * x, gz = 0.08 * z;
    const eg = Math.exp(-(x * x + z * z) / 2.0);
    gx += 3 * x * eg; gz += 3 * z * eg;
    const t = [[-3, 2, 0.8, 1.5], [1, -4, 0.7, 1.5], [4, -1, 0.6, 1.5],
               [-1, 4, 0.8, 1.5], [3, 3, 0.7, 1.5], [-3, -3, 0.6, 1.5]];
    for (const [cx, cz, a, s] of t) {
        const e = Math.exp(-((x - cx) * (x - cx) + (z - cz) * (z - cz)) / s);
        gx += (2 * a / s) * (x - cx) * e;
        gz += (2 * a / s) * (z - cz) * e;
    }
    return { gx, gz };
}

// ════════════════════════════════════════════════════════════════
// Level 6: 중급 — 글로벌 방향 포물면 + 경로 위 로컬 트랩
// 글로벌 최솟값: (-3,0) / 시작: (4,3)
// 교육: 가까운 함정 vs 먼 글로벌. 모멘텀으로 함정 통과!
// ════════════════════════════════════════════════════════════════
function lossLevel6(x, z) {
    const bowl = 0.02 * ((x + 3) * (x + 3) + z * z);
    const globalWell = -3.0 * Math.exp(-((x + 3) * (x + 3) + z * z) / 2.0);
    const trap1 = -1.0 * Math.exp(-((x - 1) * (x - 1) + (z - 1) * (z - 1)) / 1.5);
    const trap2 = -0.8 * Math.exp(-((x - 4) * (x - 4) + (z + 2) * (z + 2)) / 2.0);
    return bowl + globalWell + trap1 + trap2 + 3.5;
}

function gradientLevel6(x, z) {
    let gx = 0.04 * (x + 3), gz = 0.04 * z;
    const eG = Math.exp(-((x + 3) * (x + 3) + z * z) / 2.0);
    gx += 3.0 * (x + 3) * eG; gz += 3.0 * z * eG;
    const eT1 = Math.exp(-((x - 1) * (x - 1) + (z - 1) * (z - 1)) / 1.5);
    gx += (2.0 / 1.5) * (x - 1) * eT1; gz += (2.0 / 1.5) * (z - 1) * eT1;
    const eT2 = Math.exp(-((x - 4) * (x - 4) + (z + 2) * (z + 2)) / 2.0);
    gx += 0.8 * (x - 4) * eT2; gz += 0.8 * (z + 2) * eT2;
    return { gx, gz };
}

// ════════════════════════════════════════════════════════════════
// Level 7: 고급 — 포물면 + 나선 각도 장벽 + off-path 로컬
// 글로벌 최솟값: (0,0) / 시작: (6,6)
// 교육: 나선 장벽 + 로컬 함정, 높은 M으로 장벽 돌파
// ════════════════════════════════════════════════════════════════
function lossLevel7(x, z) {
    const r = Math.sqrt(x * x + z * z) + 1e-10;
    const theta = Math.atan2(z, x);
    const bowl = 0.018 * (x * x + z * z);
    const well = -2.5 * Math.exp(-(r * r) / 2.0);
    const angular = 0.5 * Math.sin(3 * theta) * Math.exp(-r * 0.1) * Math.min(r / 2, 1);
    const l1 = -0.6 * Math.exp(-((x - 5) * (x - 5) + (z - 1) * (z - 1)) / 0.8);
    const l2 = -0.5 * Math.exp(-((x - 1) * (x - 1) + (z - 5) * (z - 5)) / 0.8);
    const l3 = -0.4 * Math.exp(-((x + 2) * (x + 2) + (z - 4) * (z - 4)) / 0.8);
    return bowl + well + angular + l1 + l2 + l3 + 3.0;
}

function gradientLevel7(x, z) {
    const r = Math.sqrt(x * x + z * z) + 1e-10;
    const theta = Math.atan2(z, x);
    const drx = x / r, drz = z / r;
    const dtx = -z / (r * r), dtz = x / (r * r);
    let gx = 0.036 * x, gz = 0.036 * z;
    const ew = Math.exp(-(r * r) / 2.0);
    gx += 2.5 * x * ew; gz += 2.5 * z * ew;
    const sinT = Math.sin(3 * theta), cosT = Math.cos(3 * theta);
    const eA = Math.exp(-0.1 * r);
    const cl = Math.min(r / 2, 1), dcl = r / 2 < 1 ? 0.5 : 0;
    gx += 0.5 * (cosT * 3 * dtx * eA * cl + sinT * (-0.1 * drx) * eA * cl + sinT * eA * dcl * drx);
    gz += 0.5 * (cosT * 3 * dtz * eA * cl + sinT * (-0.1 * drz) * eA * cl + sinT * eA * dcl * drz);
    const traps = [[5, 1, 0.6, 0.8], [1, 5, 0.5, 0.8], [-2, 4, 0.4, 0.8]];
    for (const [cx, cz, a, s] of traps) {
        const e = Math.exp(-((x - cx) * (x - cx) + (z - cz) * (z - cz)) / s);
        gx += (2 * a / s) * (x - cx) * e;
        gz += (2 * a / s) * (z - cz) * e;
    }
    return { gx, gz };
}

// ════════════════════════════════════════════════════════════════
// Level 8: 마스터 — 절벽 + 깊은 글로벌 + 로컬 트랩
// 글로벌 최솟값: (-3,-3) / 시작: (5,5)
// 교육: 절벽(sigmoid) 넘어 글로벌 도달, 높은 M+LR 필요
// ════════════════════════════════════════════════════════════════
function lossLevel8(x, z) {
    return 0.008 * ((x + 3) * (x + 3) + (z + 3) * (z + 3))
        - 3.5 * Math.exp(-((x + 3) * (x + 3) + (z + 3) * (z + 3)) / 2.5)
        - 1.0 / (1 + Math.exp(1.5 * (x + z)))
        - 1.2 * Math.exp(-((x + 1) * (x + 1) + (z + 1) * (z + 1)) / 2.0)
        - 1.0 * Math.exp(-((x - 2) * (x - 2) + (z - 2) * (z - 2)) / 2.0)
        + 4.5;
}

function gradientLevel8(x, z) {
    let gx = 0.016 * (x + 3), gz = 0.016 * (z + 3);
    const eg = Math.exp(-((x + 3) * (x + 3) + (z + 3) * (z + 3)) / 2.5);
    gx += (7 / 2.5) * (x + 3) * eg; gz += (7 / 2.5) * (z + 3) * eg;
    const sc = 1 / (1 + Math.exp(1.5 * (x + z)));
    const dc = 1.5 * sc * (1 - sc);
    gx += dc; gz += dc;
    const e1 = Math.exp(-((x + 1) * (x + 1) + (z + 1) * (z + 1)) / 2.0);
    gx += 1.2 * (x + 1) * e1; gz += 1.2 * (z + 1) * e1;
    const e2 = Math.exp(-((x - 2) * (x - 2) + (z - 2) * (z - 2)) / 2.0);
    gx += 1.0 * (x - 2) * e2; gz += 1.0 * (z - 2) * e2;
    return { gx, gz };
}

// ── 레벨별 손실함수 / 그래디언트 디스패치 ──
export function lossFunctionByLevel(x, z, level) {
    switch (level) {
        case 1: return lossLevel1(x, z);
        case 2: return lossLevel2(x, z);
        case 3: return lossLevel3(x, z);
        case 4: return lossLevel4(x, z);
        case 5: return lossLevel5(x, z);
        case 6: return lossLevel6(x, z);
        case 7: return lossLevel7(x, z);
        case 8: return lossLevel8(x, z);
        default: return lossLevel1(x, z);
    }
}

export function gradientByLevel(x, z, level) {
    switch (level) {
        case 1: return gradientLevel1(x, z);
        case 2: return gradientLevel2(x, z);
        case 3: return gradientLevel3(x, z);
        case 4: return gradientLevel4(x, z);
        case 5: return gradientLevel5(x, z);
        case 6: return gradientLevel6(x, z);
        case 7: return gradientLevel7(x, z);
        case 8: return gradientLevel8(x, z);
        default: return gradientLevel1(x, z);
    }
}

// 하위 호환: 기존 lossFunction / gradient (Level 2로 매핑)
export function lossFunction(x, z) {
    return lossLevel2(x, z);
}

export function gradient(x, z) {
    return gradientLevel2(x, z);
}

// 솔로 모드 수렴 판정용 글로벌 최솟값 위치
export const GLOBAL_MINIMA = {
    1: { x: 0, z: 0 },
    2: { x: 0, z: 0 },
    3: { x: 0, z: 0 },
    4: { x: 0, z: 0 },
    5: { x: 0, z: 0 },
    6: { x: -3, z: 0 },
    7: { x: 0, z: 0 },
    8: { x: -3, z: -3 },
};
