/**
 * 공용 Loss Surface 함수 (Week 5 경사하강법 레이싱에서 사용)
 * - 5단계 난이도별 맵: 각 레벨이 최적화의 핵심 개념 하나를 가르침
 * - 동일한 함수가 LossSurface.jsx, week5/page.js, backend/server.js에서 사용됨
 */

// ── 기존 기본 맵 (Level 2에서 사용) ──
export function lossFunction(x, z) {
    // Level 2: 학습률 크기 조절 — 글로벌 최솟값 근처 급경사로 높은 LR은 오버슈팅
    const bowl = 0.03 * (x * x + z * z);
    // 글로벌 최솟값 (0, 2): 좁고 깊게 → 높은 LR은 진동/오버슈팅
    const globalMin = -3.0 * Math.exp(-(x * x + (z - 2) * (z - 2)) / 1.5);
    // 로컬 함정: 얕지만 넓어서 빠지기 쉬움
    const localMin1 = -1.2 * Math.exp(-((x + 3) * (x + 3) + (z + 2) * (z + 2)) / 2);
    const localMin2 = -1.5 * Math.exp(-((x - 3) * (x - 3) + (z + 2) * (z + 2)) / 2);
    const noise = 0.15 * Math.sin(x) * Math.cos(z);
    return bowl + globalMin + localMin1 + localMin2 + noise + 3.5;
}

export function gradient(x, z) {
    let gx = 0.06 * x;
    let gz = 0.06 * z;

    // 글로벌 최솟값: -3.0 * exp(-(x² + (z-2)²) / 1.5)
    const expGlobal = Math.exp(-(x * x + (z - 2) * (z - 2)) / 1.5);
    gx += (2 * 3.0 / 1.5) * x * expGlobal;           // = 4.0 * x * exp
    gz += (2 * 3.0 / 1.5) * (z - 2) * expGlobal;     // = 4.0 * (z-2) * exp

    // 로컬1: -1.2 * exp(-((x+3)² + (z+2)²) / 2)
    const expL1 = Math.exp(-((x + 3) * (x + 3) + (z + 2) * (z + 2)) / 2);
    gx += (2 * 1.2 / 2) * (x + 3) * expL1;           // = 1.2 * (x+3) * exp
    gz += (2 * 1.2 / 2) * (z + 2) * expL1;           // = 1.2 * (z+2) * exp

    // 로컬2: -1.5 * exp(-((x-3)² + (z+2)²) / 2)
    const expL2 = Math.exp(-((x - 3) * (x - 3) + (z + 2) * (z + 2)) / 2);
    gx += (2 * 1.5 / 2) * (x - 3) * expL2;           // = 1.5 * (x-3) * exp
    gz += (2 * 1.5 / 2) * (z + 2) * expL2;           // = 1.5 * (z+2) * exp

    // 노이즈: 0.15 * sin(x) * cos(z)
    gx += 0.15 * Math.cos(x) * Math.cos(z);
    gz += 0.15 * Math.sin(x) * -Math.sin(z);

    return { gx, gz };
}

// ── 8단계 레이스 맵 메타데이터 ──
export const MAP_LEVELS = [
    { level: 1, name: '입문: 학습률의 의미', emoji: '⛳', description: '큰 학습률 = 빠른 하강! 최적 LR을 찾아보세요.', difficulty: '입문' },
    { level: 2, name: '초급: 학습률 조절', emoji: '🏔️', description: 'LR이 너무 크면 진동! 적절한 범위를 찾아보세요.', difficulty: '초급' },
    { level: 3, name: '중급: 로컬 미니마 탈출', emoji: '🌋', description: '모멘텀 없이는 함정에 빠집니다! 모멘텀의 힘을 경험하세요.', difficulty: '중급' },
    { level: 4, name: '고급: 계곡 진동', emoji: '🌊', description: 'x방향은 급경사, z방향은 완경사. 진동을 잡아보세요!', difficulty: '고급' },
    { level: 5, name: '마스터: 종합 전략', emoji: '🎯', description: 'LR과 모멘텀 모두 정밀 조절이 필요한 최종 도전!', difficulty: '마스터' },
    { level: 6, name: '중급: 쌍봉 계곡', emoji: '⚖️', description: '같은 깊이의 두 계곡! 어느 쪽이 진짜 최솟값일까요?', difficulty: '중급' },
    { level: 7, name: '고급: 나선 계곡', emoji: '🌀', description: '나선형 계곡을 따라가세요! 경로 의존성을 체험합니다.', difficulty: '고급' },
    { level: 8, name: '마스터: 절벽과 평원', emoji: '🏜️', description: '평원에서 절벽으로! 롤러코스터 지형의 다단계 전략 도전!', difficulty: '마스터' },
];

// 레벨별 맵 크기 (3D 렌더링용) — 기본 20, 큰 맵은 40~60
export const MAP_SIZES = {
    1: 20, 2: 20, 3: 20, 4: 20, 5: 20,
    6: 20, 7: 20, 8: 50,
};

// ── Level 1: 입문 — "학습률의 의미" ──
// 글로벌 최솟값: (0,0) / 로컬 함정: (-5,-5) — 멀리 있어서 쉽게 피할 수 있음
// bowl 계수 0.05로 완만하게 → 낮은 LR은 매우 느림, 높은 LR이 빠름을 체감
// 시작점 (-7,-7)에서 (0,0)까지 먼 거리 → LR 차이가 도착 시간 차이로 나타남
function lossLevel1(x, z) {
    const bowl = 0.05 * (x * x + z * z);
    // 로컬 함정: 멀리 떨어져 있고 얕아서 쉽게 피할 수 있음
    const localTrap = -0.4 * Math.exp(-((x + 5) * (x + 5) + (z + 5) * (z + 5)) / 2.0);
    return bowl + localTrap + 0.4;
}

function gradientLevel1(x, z) {
    // bowl: 0.05 * (x² + z²) → ∂/∂x = 0.1*x, ∂/∂z = 0.1*z
    let gx = 0.1 * x;
    let gz = 0.1 * z;
    // 로컬 함정: -0.4 * exp(-((x+5)² + (z+5)²) / 2.0)
    const expL = Math.exp(-((x + 5) * (x + 5) + (z + 5) * (z + 5)) / 2.0);
    gx += (2 * 0.4 / 2.0) * (x + 5) * expL;   // = 0.4 * (x+5) * exp
    gz += (2 * 0.4 / 2.0) * (z + 5) * expL;   // = 0.4 * (z+5) * exp
    return { gx, gz };
}

// ── Level 3: 중급 — "로컬 미니마 + 모멘텀" ──
// 핵심 교육 레벨! 로컬 미니마가 글로벌보다 훨씬 얕음
// 모멘텀 없이(0): 로컬에 갇힘 / 모멘텀 0.7+: 탈출 가능
// 글로벌 최솟값: (1, 2) 깊이 -3.0 / 로컬들: -1.0 ~ -1.8 (얕아서 모멘텀으로 탈출 가능)
function lossLevel3(x, z) {
    const r2 = x * x + z * z;
    // 완만한 기본 포물면
    const bowl = 0.02 * r2;

    // 글로벌 최솟값 (좁고 깊음) — (1, 2)에 위치
    const globalMin = -3.0 * Math.exp(-((x - 1) * (x - 1) + (z - 2) * (z - 2)) / 1.5);

    // 로컬 최솟값들: 얕게 변경 → 모멘텀 0.7+이면 탈출 가능
    const local1 = -1.5 * Math.exp(-((x + 4) * (x + 4) + (z + 1) * (z + 1)) / 2);
    const local2 = -1.8 * Math.exp(-((x - 4) * (x - 4) + (z - 3) * (z - 3)) / 2);
    const local3 = -1.3 * Math.exp(-((x + 2) * (x + 2) + (z - 4) * (z - 4)) / 1.5);
    const local4 = -1.0 * Math.exp(-((x - 2) * (x - 2) + (z + 4) * (z + 4)) / 1.5);

    // 노이즈 낮게 — 교육 목적상 깔끔하게
    const noise = 0.15 * Math.sin(2 * x) * Math.cos(2 * z);

    return bowl + globalMin + local1 + local2 + local3 + local4 + noise + 4;
}

function gradientLevel3(x, z) {
    const r2 = x * x + z * z;
    let gx = 0, gz = 0;

    // bowl: 0.02 * (x² + z²)
    gx += 0.04 * x;
    gz += 0.04 * z;

    // 글로벌 최솟값: -3.0 * exp(-((x-1)² + (z-2)²) / 1.5)
    const expG = Math.exp(-((x - 1) * (x - 1) + (z - 2) * (z - 2)) / 1.5);
    gx += (2 * 3.0 / 1.5) * (x - 1) * expG;   // = 4.0*(x-1)*expG
    gz += (2 * 3.0 / 1.5) * (z - 2) * expG;   // = 4.0*(z-2)*expG

    // 로컬1: -1.5 * exp(-((x+4)² + (z+1)²) / 2)
    const expL1 = Math.exp(-((x + 4) * (x + 4) + (z + 1) * (z + 1)) / 2);
    gx += (2 * 1.5 / 2) * (x + 4) * expL1;    // = 1.5*(x+4)*expL1
    gz += (2 * 1.5 / 2) * (z + 1) * expL1;    // = 1.5*(z+1)*expL1

    // 로컬2: -1.8 * exp(-((x-4)² + (z-3)²) / 2)
    const expL2 = Math.exp(-((x - 4) * (x - 4) + (z - 3) * (z - 3)) / 2);
    gx += (2 * 1.8 / 2) * (x - 4) * expL2;    // = 1.8*(x-4)*expL2
    gz += (2 * 1.8 / 2) * (z - 3) * expL2;    // = 1.8*(z-3)*expL2

    // 로컬3: -1.3 * exp(-((x+2)² + (z-4)²) / 1.5)
    const expL3 = Math.exp(-((x + 2) * (x + 2) + (z - 4) * (z - 4)) / 1.5);
    gx += (2 * 1.3 / 1.5) * (x + 2) * expL3;  // ≈ 1.733*(x+2)*expL3
    gz += (2 * 1.3 / 1.5) * (z - 4) * expL3;  // ≈ 1.733*(z-4)*expL3

    // 로컬4: -1.0 * exp(-((x-2)² + (z+4)²) / 1.5)
    const expL4 = Math.exp(-((x - 2) * (x - 2) + (z + 4) * (z + 4)) / 1.5);
    gx += (2 * 1.0 / 1.5) * (x - 2) * expL4;  // ≈ 1.333*(x-2)*expL4
    gz += (2 * 1.0 / 1.5) * (z + 4) * expL4;  // ≈ 1.333*(z+4)*expL4

    // 노이즈: 0.15*sin(2x)*cos(2z)
    gx += 0.15 * 2 * Math.cos(2 * x) * Math.cos(2 * z);   // = 0.3*cos(2x)*cos(2z)
    gz += 0.15 * Math.sin(2 * x) * (-2 * Math.sin(2 * z)); // = -0.3*sin(2x)*sin(2z)

    return { gx, gz };
}

// ── Level 4: 고급 — "계곡 진동" ──
// x방향 급경사 + z방향 완경사 → 고학습률은 x에서 진동, 저학습률은 z에서 느림
// 글로벌 최솟값: (0, -3)
// 노이즈 감소로 교육 메시지 명확화
function lossLevel4(x, z) {
    const steep   = 2.0 * x * x;                            // x방향: 급경사 계곡 벽
    const shallow = 0.04 * (z + 3) * (z + 3);               // z방향: 완경사, 최솟값 z=-3
    const noise   = 0.05 * Math.sin(2 * x) * Math.cos(0.5 * z); // 노이즈 줄임 (0.1→0.05)
    return steep + shallow + noise + 0.5;
}

function gradientLevel4(x, z) {
    // steep: 2.0*x² → 4.0*x
    // noise: 0.05*sin(2x)*cos(0.5z) → ∂/∂x = 0.1*cos(2x)*cos(0.5z)
    //                                  ∂/∂z = -0.025*sin(2x)*sin(0.5z)
    const gx = 4.0 * x + 0.1 * Math.cos(2 * x) * Math.cos(0.5 * z);
    const gz = 0.08 * (z + 3) - 0.025 * Math.sin(2 * x) * Math.sin(0.5 * z);
    return { gx, gz };
}

// ── Level 5: 마스터 — "종합 전략" ──
// 로컬 함정 7개 + 하나의 깊은 글로벌 최솟값
// 로컬 함정 깊이: -1.8 ~ -2.3 (글로벌 -3.5보다 훨씬 얕음 → 모멘텀으로 탈출 가능)
// LR ~0.15 AND 모멘텀 ~0.7 필요
// 글로벌 최솟값: (1, 1)
function lossLevel5(x, z) {
    const bowl      = 0.03 * (x * x + z * z);
    const globalMin = -3.5 * Math.exp(-((x - 1) * (x - 1) + (z - 1) * (z - 1)) / 1.2);
    // 얕은 로컬 함정들 (글로벌보다 훨씬 얕아서 높은 모멘텀으로 탈출 가능)
    const t1 = -1.8 * Math.exp(-((x + 4) * (x + 4) + (z - 1) * (z - 1)) / 1.5);
    const t2 = -2.0 * Math.exp(-((x + 2) * (x + 2) + (z + 4) * (z + 4)) / 1.5);
    const t3 = -2.3 * Math.exp(-((x - 4) * (x - 4) + (z + 2) * (z + 2)) / 1.5);
    const t4 = -1.8 * Math.exp(-((x + 1) * (x + 1) + (z - 4) * (z - 4)) / 1.5);
    const t5 = -2.1 * Math.exp(-((x - 3) * (x - 3) + (z - 4) * (z - 4)) / 1.5);
    const t6 = -1.9 * Math.exp(-((x - 2) * (x - 2) + (z + 3) * (z + 3)) / 1.2);
    // 함정: 글로벌 최솟값으로 가는 경로 근처에 배치
    const t7 = -2.0 * Math.exp(-((x - 0) * (x - 0) + (z - 0) * (z - 0)) / 1.5);
    const noise = 0.2 * Math.sin(1.5 * x) * Math.cos(1.5 * z);
    return bowl + globalMin + t1 + t2 + t3 + t4 + t5 + t6 + t7 + noise + 4;
}

function gradientLevel5(x, z) {
    let gx = 0.06 * x;
    let gz = 0.06 * z;

    // 글로벌 최솟값: -3.5 * exp(-((x-1)²+(z-1)²)/1.2)
    const expG = Math.exp(-((x - 1) * (x - 1) + (z - 1) * (z - 1)) / 1.2);
    gx += (2 * 3.5 / 1.2) * (x - 1) * expG;
    gz += (2 * 3.5 / 1.2) * (z - 1) * expG;

    // t1: -1.8 * exp(-((x+4)²+(z-1)²)/1.5)
    const eT1 = Math.exp(-((x + 4) * (x + 4) + (z - 1) * (z - 1)) / 1.5);
    gx += (2 * 1.8 / 1.5) * (x + 4) * eT1;
    gz += (2 * 1.8 / 1.5) * (z - 1) * eT1;

    // t2: -2.0 * exp(-((x+2)²+(z+4)²)/1.5)
    const eT2 = Math.exp(-((x + 2) * (x + 2) + (z + 4) * (z + 4)) / 1.5);
    gx += (2 * 2.0 / 1.5) * (x + 2) * eT2;
    gz += (2 * 2.0 / 1.5) * (z + 4) * eT2;

    // t3: -2.3 * exp(-((x-4)²+(z+2)²)/1.5)
    const eT3 = Math.exp(-((x - 4) * (x - 4) + (z + 2) * (z + 2)) / 1.5);
    gx += (2 * 2.3 / 1.5) * (x - 4) * eT3;
    gz += (2 * 2.3 / 1.5) * (z + 2) * eT3;

    // t4: -1.8 * exp(-((x+1)²+(z-4)²)/1.5)
    const eT4 = Math.exp(-((x + 1) * (x + 1) + (z - 4) * (z - 4)) / 1.5);
    gx += (2 * 1.8 / 1.5) * (x + 1) * eT4;
    gz += (2 * 1.8 / 1.5) * (z - 4) * eT4;

    // t5: -2.1 * exp(-((x-3)²+(z-4)²)/1.5)
    const eT5 = Math.exp(-((x - 3) * (x - 3) + (z - 4) * (z - 4)) / 1.5);
    gx += (2 * 2.1 / 1.5) * (x - 3) * eT5;
    gz += (2 * 2.1 / 1.5) * (z - 4) * eT5;

    // t6: -1.9 * exp(-((x-2)²+(z+3)²)/1.2)
    const eT6 = Math.exp(-((x - 2) * (x - 2) + (z + 3) * (z + 3)) / 1.2);
    gx += (2 * 1.9 / 1.2) * (x - 2) * eT6;
    gz += (2 * 1.9 / 1.2) * (z + 3) * eT6;

    // t7: -2.0 * exp(-(x²+z²)/1.5) — 원점 근처 함정
    const eT7 = Math.exp(-(x * x + z * z) / 1.5);
    gx += (2 * 2.0 / 1.5) * x * eT7;
    gz += (2 * 2.0 / 1.5) * z * eT7;

    // 노이즈: 0.2*sin(1.5x)*cos(1.5z)
    gx += 0.2 * 1.5 * Math.cos(1.5 * x) * Math.cos(1.5 * z);
    gz -= 0.2 * 1.5 * Math.sin(1.5 * x) * Math.sin(1.5 * z);

    return { gx, gz };
}

// ── Level 6: 중급 — "쌍봉 계곡" (Twin Peaks) ──
// 두 개의 깊은 계곡이 같은 깊이(-2.5)로 보이지만, 왼쪽(-3,0)이 미세하게 더 깊음(-2.55)
// 탐색(exploration) vs 착취(exploitation) — 미세한 차이를 찾는 연습
// 글로벌 최솟값: (-3, 0)  /  시작점: (0, 5)
function lossLevel6(x, z) {
    const bowl = 0.02 * (x * x + z * z);
    // 왼쪽 계곡: 미세하게 더 깊음 (-2.55)
    const leftValley = -2.55 * Math.exp(-((x + 3) * (x + 3) + z * z) / 2.0);
    // 오른쪽 계곡: 거의 같은 깊이 (-2.5)
    const rightValley = -2.5 * Math.exp(-((x - 3) * (x - 3) + z * z) / 2.0);
    // 중앙 능선: 두 계곡 사이에 장벽
    const ridge = 0.8 * Math.exp(-(x * x) / 1.0) * Math.exp(-(z * z) / 4.0);
    const noise = 0.08 * Math.sin(1.5 * x) * Math.cos(1.5 * z);
    return bowl + leftValley + rightValley + ridge + noise + 3.0;
}

function gradientLevel6(x, z) {
    let gx = 0.04 * x;
    let gz = 0.04 * z;

    // 왼쪽 계곡: -2.55 * exp(-((x+3)² + z²) / 2.0)
    const expL = Math.exp(-((x + 3) * (x + 3) + z * z) / 2.0);
    gx += (2 * 2.55 / 2.0) * (x + 3) * expL;   // = 2.55*(x+3)*exp
    gz += (2 * 2.55 / 2.0) * z * expL;           // = 2.55*z*exp

    // 오른쪽 계곡: -2.5 * exp(-((x-3)² + z²) / 2.0)
    const expR = Math.exp(-((x - 3) * (x - 3) + z * z) / 2.0);
    gx += (2 * 2.5 / 2.0) * (x - 3) * expR;     // = 2.5*(x-3)*exp
    gz += (2 * 2.5 / 2.0) * z * expR;             // = 2.5*z*exp

    // 능선: 0.8 * exp(-x²/1.0) * exp(-z²/4.0)
    const expRidgeX = Math.exp(-(x * x) / 1.0);
    const expRidgeZ = Math.exp(-(z * z) / 4.0);
    gx += 0.8 * (-2 * x / 1.0) * expRidgeX * expRidgeZ;  // = -1.6*x*exp
    gz += 0.8 * expRidgeX * (-2 * z / 4.0) * expRidgeZ;  // = -0.4*z*exp

    // 노이즈: 0.08*sin(1.5x)*cos(1.5z)
    gx += 0.08 * 1.5 * Math.cos(1.5 * x) * Math.cos(1.5 * z);
    gz -= 0.08 * 1.5 * Math.sin(1.5 * x) * Math.sin(1.5 * z);

    return { gx, gz };
}

// ── Level 7: 고급 — "나선 계곡" (Spiral Valley) ──
// 나선형 계곡이 중심을 감싸는 형태. 중심(0,0)이 글로벌 최솟값
// 낮은 LR: 나선을 천천히 따라감 / 높은 LR: 능선을 뛰어넘을 수 있음
// 시작점: (6, 6)
function lossLevel7(x, z) {
    const r = Math.sqrt(x * x + z * z);
    const theta = Math.atan2(z, x);
    // 나선형 골짜기: r과 theta를 결합한 주기 함수
    const spiral = 0.3 * Math.sin(2 * theta - r * 1.0) * Math.exp(-r * 0.1);
    // 중심으로 갈수록 낮아지는 기본 깔때기 (강한 기울기)
    const funnel = 0.25 * r - 3.0 * Math.exp(-(r * r) / 4.0);
    // 나선형 능선 (낮은 장벽 — 모멘텀 0.7+이면 넘을 수 있음)
    const ridges = 0.25 * Math.cos(2 * theta - r * 1.0) * Math.exp(-r * 0.08) * (r > 1 ? 1 : r);
    const noise = 0.03 * Math.sin(3 * x) * Math.cos(3 * z);
    return funnel + spiral + ridges + noise + 3.5;
}

function gradientLevel7(x, z) {
    const r = Math.sqrt(x * x + z * z) + 1e-10; // 0 나누기 방지
    const theta = Math.atan2(z, x);

    // ∂r/∂x = x/r, ∂r/∂z = z/r
    // ∂θ/∂x = -z/r², ∂θ/∂z = x/r²
    const drx = x / r;
    const drz = z / r;
    const dtx = -z / (r * r);
    const dtz = x / (r * r);

    // spiral = 0.3 * sin(2θ - 1.0r) * exp(-0.1r)
    const spiralArg = 2 * theta - r * 1.0;
    const cosArg = Math.cos(spiralArg);
    const sinArg = Math.sin(spiralArg);
    const expDecay = Math.exp(-r * 0.1);
    const spiralGx = 0.3 * (cosArg * (2 * dtx - 1.0 * drx) * expDecay + sinArg * (-0.1 * drx) * expDecay);
    const spiralGz = 0.3 * (cosArg * (2 * dtz - 1.0 * drz) * expDecay + sinArg * (-0.1 * drz) * expDecay);

    // funnel = 0.25*r - 3.0*exp(-r²/4.0)
    const expFunnel = Math.exp(-(r * r) / 4.0);
    const funnelGx = 0.25 * drx + 3.0 * (2 * x / 4.0) * expFunnel;
    const funnelGz = 0.25 * drz + 3.0 * (2 * z / 4.0) * expFunnel;

    // ridges = 0.25 * cos(2θ - 1.0r) * exp(-0.08r) * clamp(r,0,1)
    const ridgeArg = 2 * theta - r * 1.0;
    const cosRidge = Math.cos(ridgeArg);
    const sinRidge = Math.sin(ridgeArg);
    const expRidge = Math.exp(-r * 0.08);
    const rClamp = r > 1 ? 1 : r;
    const rClampDrx = r > 1 ? 0 : drx;
    const rClampDrz = r > 1 ? 0 : drz;
    const ridgeGx = 0.25 * (
        (-sinRidge) * (2 * dtx - 1.0 * drx) * expRidge * rClamp +
        cosRidge * (-0.08 * drx) * expRidge * rClamp +
        cosRidge * expRidge * rClampDrx
    );
    const ridgeGz = 0.25 * (
        (-sinRidge) * (2 * dtz - 1.0 * drz) * expRidge * rClamp +
        cosRidge * (-0.08 * drz) * expRidge * rClamp +
        cosRidge * expRidge * rClampDrz
    );

    // noise: 0.03*sin(3x)*cos(3z)
    const noiseGx = 0.03 * 3 * Math.cos(3 * x) * Math.cos(3 * z);
    const noiseGz = -0.03 * 3 * Math.sin(3 * x) * Math.sin(3 * z);

    return {
        gx: funnelGx + spiralGx + ridgeGx + noiseGx,
        gz: funnelGz + spiralGz + ridgeGz + noiseGz,
    };
}

// ── Level 8: 마스터 — "절벽과 평원" (Cliff and Plateau) + 롤러코스터 ──
// 넓은 평원(gradient≈0) → 절벽 → 깊은 계곡 → 다시 언덕 → 골짜기 연속
// 범위: ±25 크기의 대형 맵 (롤러코스터 체험)
// 글로벌 최솟값: (-3, -3) (절벽 아래)  /  시작점: (0, 0) (절벽 가장자리)
// 교훈: 다단계 전략 — 평원에서는 높은 모멘텀, 절벽 후에는 낮은 LR
function lossLevel8(x, z) {
    // 평원 (x>0, z>0 영역): 약한 기울기로 절벽 쪽으로 유도
    const plateau = 1.5 / (1 + Math.exp(-0.5 * (x + z - 2)));

    // 절벽: 급격한 하강 (x<-1, z<-1 영역)
    const cliff = -3.5 / (1 + Math.exp(1.5 * (x + z + 2)));

    // 글로벌 최솟값: (-3, -3) 깊은 구덩이 — 시작점(0,0)에서 거리 4.2
    const globalMin = -4.0 * Math.exp(-((x + 3) * (x + 3) + (z + 3) * (z + 3)) / 3.0);

    // 롤러코스터 언덕들 (큰 진폭의 sin/cos)
    const rollerX = 1.5 * Math.sin(0.4 * x) * Math.exp(-0.01 * x * x);
    const rollerZ = 1.5 * Math.cos(0.4 * z) * Math.exp(-0.01 * z * z);

    // 추가 봉우리와 골짜기 (시각적으로 롤러코스터)
    const hill1 = 2.0 * Math.exp(-((x - 8) * (x - 8) + (z + 3) * (z + 3)) / 6.0);
    const hill2 = 1.8 * Math.exp(-((x + 8) * (x + 8) + (z - 8) * (z - 8)) / 5.0);
    const valley1 = -2.0 * Math.exp(-((x - 3) * (x - 3) + (z + 8) * (z + 8)) / 4.0);
    const valley2 = -1.8 * Math.exp(-((x + 10) * (x + 10) + z * z) / 5.0);

    // 로컬 함정: 절벽 근처에 유혹적인 로컬 미니마
    const localTrap = -2.5 * Math.exp(-((x + 2) * (x + 2) + (z + 2) * (z + 2)) / 2.0);

    const noise = 0.1 * Math.sin(0.8 * x) * Math.cos(0.8 * z);
    return plateau + cliff + globalMin + rollerX + rollerZ + hill1 + hill2 + valley1 + valley2 + localTrap + noise + 4.0;
}

function gradientLevel8(x, z) {
    let gx = 0, gz = 0;

    // plateau: 1.5 / (1 + exp(-0.5*(x+z-2)))
    // ∂/∂x = 1.5 * 0.5 * σ * (1-σ) where σ = 1/(1+exp(-0.5*(x+z-2)))
    const sigP = 1.0 / (1 + Math.exp(-0.5 * (x + z - 2)));
    const dPlat = 1.5 * 0.5 * sigP * (1 - sigP);
    gx += dPlat;
    gz += dPlat;

    // cliff: -3.5 / (1 + exp(1.5*(x+z+2)))
    // ∂/∂x = -3.5 * (-1.5) * σc * (1-σc) = 5.25 * σc * (1-σc)
    const sigC = 1.0 / (1 + Math.exp(1.5 * (x + z + 2)));
    const dCliff = 3.5 * 1.5 * sigC * (1 - sigC);
    gx += dCliff;
    gz += dCliff;

    // globalMin: -4.0 * exp(-((x+3)²+(z+3)²)/3.0)
    const expG = Math.exp(-((x + 3) * (x + 3) + (z + 3) * (z + 3)) / 3.0);
    gx += (2 * 4.0 / 3.0) * (x + 3) * expG;
    gz += (2 * 4.0 / 3.0) * (z + 3) * expG;

    // rollerX: 1.5 * sin(0.4x) * exp(-0.01x²)
    const expRX = Math.exp(-0.01 * x * x);
    gx += 1.5 * (0.4 * Math.cos(0.4 * x) * expRX + Math.sin(0.4 * x) * (-0.02 * x) * expRX);
    // rollerZ: 1.5 * cos(0.4z) * exp(-0.01z²)
    const expRZ = Math.exp(-0.01 * z * z);
    gz += 1.5 * (-0.4 * Math.sin(0.4 * z) * expRZ + Math.cos(0.4 * z) * (-0.02 * z) * expRZ);

    // hill1: 2.0 * exp(-((x-8)²+(z+3)²)/6.0)
    const expH1 = Math.exp(-((x - 8) * (x - 8) + (z + 3) * (z + 3)) / 6.0);
    gx += 2.0 * (-2 * (x - 8) / 6.0) * expH1;
    gz += 2.0 * (-2 * (z + 3) / 6.0) * expH1;

    // hill2: 1.8 * exp(-((x+8)²+(z-8)²)/5.0)
    const expH2 = Math.exp(-((x + 8) * (x + 8) + (z - 8) * (z - 8)) / 5.0);
    gx += 1.8 * (-2 * (x + 8) / 5.0) * expH2;
    gz += 1.8 * (-2 * (z - 8) / 5.0) * expH2;

    // valley1: -2.0 * exp(-((x-3)²+(z+8)²)/4.0)
    const expV1 = Math.exp(-((x - 3) * (x - 3) + (z + 8) * (z + 8)) / 4.0);
    gx += (2 * 2.0 / 4.0) * (x - 3) * expV1;
    gz += (2 * 2.0 / 4.0) * (z + 8) * expV1;

    // valley2: -1.8 * exp(-((x+10)²+z²)/5.0)
    const expV2 = Math.exp(-((x + 10) * (x + 10) + z * z) / 5.0);
    gx += (2 * 1.8 / 5.0) * (x + 10) * expV2;
    gz += (2 * 1.8 / 5.0) * z * expV2;

    // localTrap: -2.5 * exp(-((x+2)²+(z+2)²)/2.0)
    const expLT = Math.exp(-((x + 2) * (x + 2) + (z + 2) * (z + 2)) / 2.0);
    gx += (2 * 2.5 / 2.0) * (x + 2) * expLT;
    gz += (2 * 2.5 / 2.0) * (z + 2) * expLT;

    // noise: 0.1*sin(0.8x)*cos(0.8z)
    gx += 0.1 * 0.8 * Math.cos(0.8 * x) * Math.cos(0.8 * z);
    gz -= 0.1 * 0.8 * Math.sin(0.8 * x) * Math.sin(0.8 * z);

    return { gx, gz };
}

// ── 레벨별 손실함수 / 그래디언트 디스패치 ──
export function lossFunctionByLevel(x, z, level) {
    if (level === 1) return lossLevel1(x, z);
    if (level === 3) return lossLevel3(x, z);
    if (level === 4) return lossLevel4(x, z);
    if (level === 5) return lossLevel5(x, z);
    if (level === 6) return lossLevel6(x, z);
    if (level === 7) return lossLevel7(x, z);
    if (level === 8) return lossLevel8(x, z);
    return lossFunction(x, z); // Level 2 = 기존 맵
}

export function gradientByLevel(x, z, level) {
    if (level === 1) return gradientLevel1(x, z);
    if (level === 3) return gradientLevel3(x, z);
    if (level === 4) return gradientLevel4(x, z);
    if (level === 5) return gradientLevel5(x, z);
    if (level === 6) return gradientLevel6(x, z);
    if (level === 7) return gradientLevel7(x, z);
    if (level === 8) return gradientLevel8(x, z);
    return gradient(x, z); // Level 2 = 기존 맵
}

// 솔로 모드 수렴 판정용 글로벌 최솟값 위치
export const GLOBAL_MINIMA = {
    1: { x: 0, z: 0 },    // Level 1: 포물면 꼭짓점
    2: { x: 0, z: 2 },    // Level 2: 글로벌 최솟값
    3: { x: 1, z: 2 },    // Level 3: 글로벌 최솟값
    4: { x: 0, z: -3 },   // Level 4: 긴 계곡 최솟값
    5: { x: 1, z: 1 },    // Level 5: 함정 미로 최솟값
    6: { x: -3, z: 0 },   // Level 6: 왼쪽 계곡 (미세하게 더 깊음)
    7: { x: 0, z: 0 },    // Level 7: 나선 중심
    8: { x: -3, z: -3 },  // Level 8: 절벽 아래
};
