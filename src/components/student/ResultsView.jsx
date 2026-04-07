import useRaceStore from '../../store/raceStore';

const STATUS_EMOJI = { converged: '\uD83C\uDFC1', local_minimum: '\uD83C\uDFD4\uFE0F', escaped: '\uD83D\uDCA5' };
const STATUS_LABEL = { converged: '수렴 성공', local_minimum: '로컬 미니마', escaped: '발산' };
const RANK_EMOJI = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];

export default function ResultsView() {
  const results = useRaceStore(s => s.results);
  const gpActive = useRaceStore(s => s.gpActive);
  const gpStage = useRaceStore(s => s.gpStage);
  const stageResults = useRaceStore(s => s.stageResults);
  const gpFinalResults = useRaceStore(s => s.gpFinalResults);
  const racePhase = useRaceStore(s => s.racePhase);

  // GP 최종 결과
  if (gpFinalResults.length > 0 && racePhase === 'finished') {
    return (
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ textAlign: 'center', fontSize: 18, marginBottom: 12 }}>
          {'\uD83C\uDFC6'} 그랜드 프릭스 최종 결과
        </h3>
        {gpFinalResults.map((r, i) => (
          <div key={r.teamId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < gpFinalResults.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <span style={{ fontSize: 14 }}>
              {RANK_EMOJI[i] || `${i + 1}위`} {r.teamName}
            </span>
            <span style={{ fontWeight: 700, color: '#fbbf24' }}>{r.totalPoints}점</span>
          </div>
        ))}
      </div>
    );
  }

  // 스테이지 결과 (GP 진행 중)
  if (racePhase === 'stageResult' && gpActive) {
    const currentResults = stageResults[gpStage - 1] || [];
    return (
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ textAlign: 'center', fontSize: 16, marginBottom: 12 }}>
          스테이지 {gpStage} 결과
        </h3>
        {currentResults.map((r, i) => (
          <div key={r.teamId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 13 }}>
            <span>{RANK_EMOJI[i] || `${i + 1}위`} {r.teamName}</span>
            <span style={{ color: r.status === 'converged' ? 'var(--success)' : r.status === 'escaped' ? 'var(--danger)' : 'var(--warning)' }}>
              {STATUS_EMOJI[r.status]} {r.time ? `${(r.time / 1000).toFixed(1)}s` : '-'}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // 일반 레이스 결과
  if (results.length === 0) return null;

  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 style={{ textAlign: 'center', fontSize: 16, marginBottom: 12 }}>
        {'\uD83C\uDFC1'} 레이스 결과
      </h3>
      {results.map((r, i) => (
        <div key={r.teamId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
          <div>
            <span style={{ marginRight: 8 }}>{RANK_EMOJI[i] || `${i + 1}위`}</span>
            <span style={{ fontWeight: 600 }}>{r.teamName}</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: r.status === 'converged' ? 'var(--success)' : r.status === 'escaped' ? 'var(--danger)' : 'var(--warning)' }}>
              {STATUS_EMOJI[r.status]} {STATUS_LABEL[r.status]}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {r.time ? `${(r.time / 1000).toFixed(1)}s` : '-'} {'\u2022'} Loss: {r.finalLoss?.toFixed(3) || '?'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
