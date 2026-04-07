import { useEffect, useState } from 'react';

const STATUS_EMOJI = { converged: '\uD83C\uDFC1', local_minimum: '\uD83C\uDFD4\uFE0F', escaped: '\uD83D\uDCA5' };
const STATUS_LABEL = { converged: '수렴 성공', local_minimum: '로컬 미니마', escaped: '발산' };
const RANK_EMOJI = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];

function ConfettiEffect() {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    const colors = ['#fbbf24', '#f59e0b', '#6366f1', '#22c55e', '#ec4899', '#3b82f6', '#a855f7'];
    const newParticles = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 4 + Math.random() * 6,
      duration: 2 + Math.random() * 2,
    }));
    setParticles(newParticles);
    const timer = setTimeout(() => setParticles([]), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (particles.length === 0) return null;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 10 }}>
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: -10,
            width: p.size,
            height: p.size,
            borderRadius: p.size > 7 ? '50%' : '2px',
            backgroundColor: p.color,
            animation: `confettiFall ${p.duration}s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(400px) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export default function ResultsView({ results = [], roundNumber = 0, myTeamId, isFinal = false }) {
  if (results.length === 0) return null;

  const isMyTeam = (teamId) => String(teamId) === String(myTeamId);
  const myRank = results.findIndex(r => isMyTeam(r.teamId));
  const myResult = myRank >= 0 ? results[myRank] : null;

  // 최종 결과 (누적 점수 표시)
  if (isFinal) {
    return (
      <div className="card" style={{ padding: 16, position: 'relative', overflow: 'hidden' }}>
        {myRank === 0 && <ConfettiEffect />}

        <h3 style={{ textAlign: 'center', fontSize: 18, marginBottom: 6 }}>
          {'\uD83C\uDFC6'} 최종 순위
        </h3>

        {myRank >= 0 && (
          <p style={{ textAlign: 'center', fontSize: 14, color: myRank === 0 ? '#fbbf24' : '#a5b4fc', marginBottom: 14 }}>
            {myRank === 0 ? '\uD83C\uDF89 축하합니다! 우승!' : myRank < 3 ? `\uD83D\uDCAA ${myRank + 1}등! 대단해요!` : `${myRank + 1}등`}
          </p>
        )}

        {results.map((r, i) => {
          const mine = isMyTeam(r.teamId);
          return (
            <div key={r.teamId || i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 14px', borderRadius: 10, marginBottom: 4,
              background: mine
                ? 'rgba(99,102,241,0.2)'
                : i === 0 ? 'rgba(251,191,36,0.1)' : 'transparent',
              border: mine
                ? '2px solid rgba(99,102,241,0.4)'
                : i === 0 ? '1px solid rgba(251,191,36,0.3)' : '1px solid transparent',
            }}>
              <span style={{ fontSize: 15, fontWeight: mine || i < 3 ? 700 : 400 }}>
                {RANK_EMOJI[i] || `${i + 1}위`} {r.teamName}
                {mine && <span style={{ fontSize: 11, color: '#818cf8', marginLeft: 6 }}>(나)</span>}
              </span>
              <span style={{ fontWeight: 700, color: '#fbbf24', fontSize: 15 }}>
                {r.totalPoints || r.points || 0}점
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // 라운드 결과
  return (
    <div className="card" style={{ padding: 16, position: 'relative', overflow: 'hidden' }}>
      {myRank === 0 && <ConfettiEffect />}

      <h3 style={{ textAlign: 'center', fontSize: 16, marginBottom: 4 }}>
        {roundNumber > 0 ? `\uD83C\uDFC1 라운드 ${roundNumber} 결과` : '\uD83C\uDFC1 레이스 결과'}
      </h3>

      {/* 내 결과 요약 */}
      {myResult && (
        <div style={{
          textAlign: 'center', marginBottom: 14, padding: '10px 16px',
          background: myRank === 0
            ? 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.1))'
            : 'rgba(99,102,241,0.1)',
          borderRadius: 10,
          border: myRank === 0 ? '1px solid rgba(251,191,36,0.3)' : '1px solid rgba(99,102,241,0.2)',
        }}>
          <div style={{ fontSize: 24, marginBottom: 2 }}>
            {myRank === 0 ? '\uD83C\uDF89' : myRank === 1 ? '\uD83D\uDCAA' : myRank === 2 ? '\uD83D\uDC4D' : '\uD83C\uDFCE\uFE0F'}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: myRank === 0 ? '#fbbf24' : '#a5b4fc' }}>
            {myRank === 0 ? '1등! 축하합니다!' : `${myRank + 1}등`}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
            {STATUS_EMOJI[myResult.status]} {STATUS_LABEL[myResult.status]}
            {' \u2022 '}
            {myResult.time ? `${(myResult.time / 1000).toFixed(1)}s` : '-'}
            {' \u2022 '}
            LR: {myResult.lr?.toFixed(2) || '?'} / M: {myResult.momentum?.toFixed(2) || '?'}
          </div>
        </div>
      )}

      {/* 전체 순위 테이블 */}
      {results.map((r, i) => {
        const mine = isMyTeam(r.teamId);
        return (
          <div key={r.teamId || i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 12px', borderRadius: 8, marginBottom: 4,
            background: mine ? 'rgba(99,102,241,0.12)' : 'transparent',
            border: mine ? '1px solid rgba(99,102,241,0.25)' : '1px solid transparent',
            fontSize: 13,
          }}>
            <div>
              <span style={{ marginRight: 6 }}>{RANK_EMOJI[i] || `${i + 1}위`}</span>
              <span style={{ fontWeight: mine ? 700 : 600 }}>{r.teamName}</span>
              {mine && <span style={{ fontSize: 10, color: '#818cf8', marginLeft: 4 }}>(나)</span>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                color: r.status === 'converged' ? 'var(--success)'
                  : r.status === 'escaped' ? 'var(--danger)' : 'var(--warning)',
              }}>
                {STATUS_EMOJI[r.status]} {STATUS_LABEL[r.status] || r.status || ''}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {r.time ? `${(r.time / 1000).toFixed(1)}s` : '-'}
                {' \u2022 '}Loss: {r.finalLoss != null && !isNaN(r.finalLoss) ? r.finalLoss.toFixed(3) : '?'}
                {' \u2022 '}
                <span style={{ color: '#818cf8' }}>LR:{r.lr?.toFixed(2)} M:{r.momentum?.toFixed(2)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
