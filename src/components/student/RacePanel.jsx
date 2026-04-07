const MAP_LEVELS = [
  { level: 1, name: '입문: 학습률의 의미', emoji: '\u26F3', difficulty: '입문' },
  { level: 2, name: '초급: 학습률 조절', emoji: '\uD83C\uDFD4\uFE0F', difficulty: '초급' },
  { level: 3, name: '중급: 로컬 미니마 탈출', emoji: '\uD83C\uDF0B', difficulty: '중급' },
  { level: 4, name: '고급: 계곡 진동', emoji: '\uD83C\uDF0A', difficulty: '고급' },
  { level: 5, name: '마스터: 종합 전략', emoji: '\uD83C\uDFAF', difficulty: '마스터' },
  { level: 6, name: '중급: 쌍봉 계곡', emoji: '\u2696\uFE0F', difficulty: '중급' },
  { level: 7, name: '고급: 나선 계곡', emoji: '\uD83C\uDF00', difficulty: '고급' },
  { level: 8, name: '마스터: 절벽과 평원', emoji: '\uD83C\uDFDC\uFE0F', difficulty: '마스터' },
];

const PRESETS = [
  { label: '\uD83D\uDEE1\uFE0F 안전', lr: 0.05, m: 0.9, desc: '느리지만 안정적' },
  { label: '\u2696\uFE0F 균형', lr: 0.1, m: 0.8, desc: '범용 설정' },
  { label: '\uD83D\uDE80 빠름', lr: 0.5, m: 0.5, desc: '공격적, 위험' },
  { label: '\uD83D\uDCA5 위험', lr: 1.2, m: 0.3, desc: '극한, 발산 가능' },
];

const DIFFICULTY_COLORS = {
  '입문': '#22c55e',
  '초급': '#3b82f6',
  '중급': '#f59e0b',
  '고급': '#ef4444',
  '마스터': '#a855f7',
};

export default function RacePanel({
  mapLevel, setMapLevel,
  myLearningRate, setMyLearningRate,
  myMomentum, setMyMomentum,
  paramsConfirmed, confirmParams,
  startSoloRace, disabled
}) {
  return (
    <>
      {/* 맵 선택 */}
      <div>
        <h4 style={{ fontSize: 13, marginBottom: 8, color: 'var(--text-dim)' }}>맵 선택</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {MAP_LEVELS.map(m => (
            <button
              key={m.level}
              onClick={() => !disabled && setMapLevel(m.level)}
              disabled={disabled}
              style={{
                background: mapLevel === m.level ? 'rgba(99,102,241,0.25)' : 'var(--surface2)',
                border: mapLevel === m.level ? '2px solid #6366f1' : '1px solid var(--border)',
                borderRadius: 8, padding: '8px 10px', textAlign: 'left',
                color: 'var(--text)', cursor: disabled ? 'not-allowed' : 'pointer',
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{m.emoji} Lv.{m.level}</span>
                <span style={{ fontSize: 10, color: DIFFICULTY_COLORS[m.difficulty], fontWeight: 600 }}>{m.difficulty}</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{m.name.split(': ')[1] || m.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 하이퍼파라미터 */}
      <div className="card" style={{ padding: 14 }}>
        <h4 style={{ fontSize: 13, marginBottom: 10, color: 'var(--text-dim)' }}>하이퍼파라미터</h4>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span>학습률 (Learning Rate)</span>
            <span style={{ fontWeight: 700, color: '#6366f1' }}>{myLearningRate.toFixed(2)}</span>
          </div>
          <input
            type="range" min={0.01} max={1.5} step={0.01}
            value={myLearningRate}
            onChange={e => setMyLearningRate(parseFloat(e.target.value))}
            disabled={paramsConfirmed}
            style={{ width: '100%', accentColor: '#6366f1' }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span>모멘텀 (Momentum)</span>
            <span style={{ fontWeight: 700, color: '#6366f1' }}>{myMomentum.toFixed(2)}</span>
          </div>
          <input
            type="range" min={0} max={0.99} step={0.01}
            value={myMomentum}
            onChange={e => setMyMomentum(parseFloat(e.target.value))}
            disabled={paramsConfirmed}
            style={{ width: '100%', accentColor: '#6366f1' }}
          />
        </div>

        {/* 프리셋 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 }}>
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => { setMyLearningRate(p.lr); setMyMomentum(p.m); }}
              disabled={paramsConfirmed}
              style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '6px 4px', fontSize: 11, color: 'var(--text)',
                cursor: paramsConfirmed ? 'not-allowed' : 'pointer',
              }}
              title={p.desc}
            >
              {p.label}
            </button>
          ))}
        </div>

        {!paramsConfirmed ? (
          <button className="btn-primary" onClick={confirmParams} style={{ width: '100%', padding: 10, fontSize: 13 }}>
            {'\u2705'} 파라미터 확정
          </button>
        ) : (
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--success)', padding: 8 }}>
            {'\u2705'} 파라미터 확정됨 (LR: {myLearningRate}, M: {myMomentum})
          </div>
        )}
      </div>

      {/* 솔로 모드 */}
      <button onClick={startSoloRace} style={{ width: '100%', padding: 12, background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 'var(--radius)', color: '#86efac', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
        {'\uD83C\uDFAE'} 솔로 연습 시작
      </button>
    </>
  );
}
