const PRESETS = [
  { label: '\uD83D\uDEE1\uFE0F 안전', lr: 0.05, m: 0.9, desc: '느리지만 안정적' },
  { label: '\u2696\uFE0F 균형', lr: 0.1, m: 0.8, desc: '범용 설정' },
  { label: '\uD83D\uDE80 빠름', lr: 0.5, m: 0.5, desc: '공격적, 위험' },
  { label: '\uD83D\uDCA5 위험', lr: 1.2, m: 0.3, desc: '극한, 발산 가능' },
];

export default function RacePanel({
  myLearningRate, setMyLearningRate,
  myMomentum, setMyMomentum,
  paramsConfirmed, confirmParams,
  mapLevel, currentMap,
}) {
  return (
    <>
      {/* 맵 정보 */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: 'rgba(99,102,241,0.08)',
          borderRadius: 8, marginBottom: 12,
        }}>
          <span style={{ fontSize: 28 }}>{currentMap.emoji}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#a5b4fc' }}>
              Lv.{mapLevel} {currentMap.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{currentMap.desc}</div>
          </div>
        </div>

        <h4 style={{ fontSize: 13, marginBottom: 10, color: 'var(--text-dim)' }}>
          {'\u2699\uFE0F'} 하이퍼파라미터 설정
        </h4>

        {/* 학습률 */}
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

        {/* 모멘텀 */}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 14 }}>
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

        {/* 확정 버튼 */}
        {!paramsConfirmed ? (
          <button className="btn-primary" onClick={confirmParams} style={{ width: '100%', padding: 12, fontSize: 14 }}>
            {'\u2705'} 파라미터 확정
          </button>
        ) : (
          <div style={{
            textAlign: 'center', fontSize: 13, color: 'var(--success)', padding: 10,
            background: 'rgba(34,197,94,0.1)', borderRadius: 8,
          }}>
            {'\u2705'} 확정됨! (LR: {myLearningRate.toFixed(2)}, M: {myMomentum.toFixed(2)})
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
              교사의 출발 신호를 기다리는 중...
            </div>
          </div>
        )}
      </div>
    </>
  );
}
