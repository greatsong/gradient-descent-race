import { useState, useEffect } from 'react';
import { apiPost, apiGet } from '../../utils/api';
import { getSocket } from '../../utils/socket';
import useSessionStore from '../../store/sessionStore';
import useRaceStore from '../../store/raceStore';

const MAP_LEVELS = [
  { level: 1, emoji: '\u26F3', name: '입문' },
  { level: 2, emoji: '\uD83C\uDFD4\uFE0F', name: '초급' },
  { level: 3, emoji: '\uD83C\uDF0B', name: '중급' },
  { level: 4, emoji: '\uD83C\uDF0A', name: '고급' },
  { level: 5, emoji: '\uD83C\uDFAF', name: '마스터' },
  { level: 6, emoji: '\u2696\uFE0F', name: '쌍봉' },
  { level: 7, emoji: '\uD83C\uDF00', name: '나선' },
  { level: 8, emoji: '\uD83C\uDFDC\uFE0F', name: '절벽' },
];

export default function TeacherApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const sessionId = useSessionStore(s => s.sessionId);
  const setSession = useSessionStore(s => s.setSession);
  const teams = useSessionStore(s => s.teams);
  const setTeams = useSessionStore(s => s.setTeams);

  const {
    racePhase, setRacePhase, mapLevel, setMapLevel,
    balls, updateBalls, results, setResults,
    gpActive, setGpActive, gpStage, setGpStage,
    gpCountdown, setGpCountdown,
    stageResults, addStageResult,
    gpFinalResults, setGpFinalResults,
    setTeams: setRaceTeams, reset,
  } = useRaceStore();

  // PIN 인증
  const handleLogin = async () => {
    try {
      await apiPost('/auth/teacher', { pin });
      setAuthenticated(true);
    } catch {
      setPinError('잘못된 PIN입니다');
    }
  };

  // 세션 생성
  const createSession = async () => {
    const data = await apiPost('/session/create', {});
    setSession(data.sessionId);
    const socket = getSocket();
    socket.emit('teacher:join', { sessionId: data.sessionId });
  };

  // Socket 이벤트
  useEffect(() => {
    if (!sessionId) return;
    const socket = getSocket();
    socket.emit('teacher:join', { sessionId });

    const refreshTeams = async () => {
      try {
        const t = await apiGet(`/session/${sessionId}/teams`);
        setTeams(t);
      } catch { /* ignore */ }
    };
    refreshTeams();
    const interval = setInterval(refreshTeams, 5000);

    socket.on('team_joined', refreshTeams);
    socket.on('room_state', (state) => {
      setRaceTeams(state.raceTeams || {});
      updateBalls(state.raceBalls || {});
      setRacePhase(state.racePhase || 'setup');
      setMapLevel(state.mapLevel || 1);
      setResults(state.results || []);
    });
    socket.on('race_started', (data) => {
      setRacePhase('racing');
      updateBalls(data.balls || {});
    });
    socket.on('race_tick', (data) => updateBalls(data.balls || {}));
    socket.on('race_finished', (data) => {
      setRacePhase('finished');
      setResults(data.results || []);
    });
    socket.on('race_reset', () => { reset(); refreshTeams(); });
    socket.on('gp_started', (data) => { setGpActive(true); setGpStage(data.currentStage); });
    socket.on('gp_stage_complete', (data) => { setRacePhase('stageResult'); addStageResult(data.stage - 1, data.results); });
    socket.on('gp_countdown', (data) => setGpCountdown(data.countdown));
    socket.on('gp_final_results', (data) => { setRacePhase('finished'); setGpFinalResults(data.finalResults); setGpActive(false); });

    return () => {
      clearInterval(interval);
      socket.off('team_joined');
      socket.off('room_state');
      socket.off('race_started');
      socket.off('race_tick');
      socket.off('race_finished');
      socket.off('race_reset');
      socket.off('gp_started');
      socket.off('gp_stage_complete');
      socket.off('gp_countdown');
      socket.off('gp_final_results');
    };
  }, [sessionId, setTeams, setRaceTeams, updateBalls, setRacePhase, setMapLevel,
      setResults, reset, setGpActive, setGpStage, addStageResult, setGpCountdown,
      setGpFinalResults]);

  const socket = getSocket();
  const startRace = () => socket.emit('start_race', { mapLevel, mode: 'competition' });
  const startGP = () => socket.emit('start_gp');
  const stopRace = () => socket.emit('stop_race');
  const resetRace = () => socket.emit('reset_race');
  const changeMap = (level) => { setMapLevel(level); socket.emit('teacher_set_map', { mapLevel: level }); };

  // -- 인증 화면 --
  if (!authenticated) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div className="card" style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
          <h2 style={{ marginBottom: 16 }}>{'\uD83D\uDD10'} 교사 인증</h2>
          {pinError && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{pinError}</p>}
          <input
            type="password" value={pin} onChange={e => setPin(e.target.value)}
            placeholder="PIN 입력"
            style={{ width: '100%', marginBottom: 12, textAlign: 'center', fontSize: 20, letterSpacing: 8 }}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
          <button className="btn-primary" onClick={handleLogin} style={{ width: '100%', padding: 12 }}>
            로그인
          </button>
        </div>
      </div>
    );
  }

  // -- 세션 생성 화면 --
  if (!sessionId) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div className="card" style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <h2 style={{ marginBottom: 8 }}>{'\uD83C\uDFC1'} 경사하강법 레이스</h2>
          <p style={{ color: 'var(--text-dim)', marginBottom: 20, fontSize: 14 }}>새 수업 세션을 시작합니다</p>
          <button className="btn-primary" onClick={createSession} style={{ padding: '14px 32px', fontSize: 16 }}>
            새 세션 시작
          </button>
        </div>
      </div>
    );
  }

  // -- 대시보드 --
  const isRacing = racePhase === 'racing';
  const isFinished = racePhase === 'finished' || racePhase === 'stageResult';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: 24 }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700 }}>{'\uD83C\uDFC1'} 교사 대시보드</h1>
            <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>
              세션 코드: <span style={{ fontWeight: 700, color: '#6366f1', fontSize: 18, letterSpacing: 2 }}>{sessionId}</span>
              {' \u2022 '}{teams.length}팀 참여
            </p>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            학생 참여: <code style={{ background: 'var(--surface2)', padding: '2px 8px', borderRadius: 4 }}>http://localhost:4023</code>
          </div>
        </div>

        {/* 팀 목록 */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>참여 팀</h3>
          {teams.length === 0 ? (
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>아직 참여한 팀이 없습니다. 세션 코드를 학생에게 공유하세요.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
              {teams.map(t => (
                <div key={t.id} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', borderLeft: `3px solid ${t.color || '#6366f1'}` }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t.members?.join(', ') || '팀원 없음'}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 레이스 컨트롤 */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>레이스 컨트롤</h3>

          {/* 맵 선택 */}
          {!isRacing && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>맵 선택:</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {MAP_LEVELS.map(m => (
                  <button
                    key={m.level}
                    onClick={() => changeMap(m.level)}
                    style={{
                      background: mapLevel === m.level ? '#6366f1' : 'var(--surface2)',
                      color: '#fff', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '6px 12px', fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {m.emoji} {m.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 버튼들 */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {!isRacing && !isFinished && (
              <>
                <button className="btn-primary" onClick={startRace} disabled={teams.length === 0} style={{ padding: '10px 20px' }}>
                  {'\uD83C\uDFC1'} 레이스 시작
                </button>
                <button onClick={startGP} disabled={teams.length === 0} style={{ padding: '10px 20px', background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.4)', color: '#c084fc', borderRadius: 'var(--radius)', cursor: 'pointer' }}>
                  {'\uD83C\uDFC6'} 그랜드 프릭스
                </button>
              </>
            )}
            {isRacing && (
              <button className="btn-danger" onClick={stopRace} style={{ padding: '10px 20px' }}>
                {'\u23F9'} 정지
              </button>
            )}
            {isFinished && !gpActive && (
              <button className="btn-primary" onClick={resetRace} style={{ padding: '10px 20px' }}>
                {'\uD83D\uDD04'} 리셋
              </button>
            )}
          </div>

          {/* GP 진행 상태 */}
          {gpActive && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(168,85,247,0.1)', borderRadius: 8, fontSize: 13 }}>
              {'\uD83C\uDFC6'} 그랜드 프릭스 진행 중 — 스테이지 {gpStage}/3
              {gpCountdown > 0 && <span style={{ marginLeft: 8, color: '#f59e0b' }}>다음: {gpCountdown}s</span>}
            </div>
          )}
        </div>

        {/* 결과 표시 */}
        {results.length > 0 && isFinished && (
          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>
              {gpFinalResults.length > 0 ? '\uD83C\uDFC6 GP 최종 결과' : '\uD83C\uDFC1 레이스 결과'}
            </h3>
            {(gpFinalResults.length > 0 ? gpFinalResults : results).map((r, i) => (
              <div key={r.teamId || i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span>{['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'][i] || `${i + 1}위`} {r.teamName}</span>
                <span style={{ color: r.status === 'converged' ? 'var(--success)' : r.status === 'escaped' ? 'var(--danger)' : 'var(--warning)' }}>
                  {gpFinalResults.length > 0 ? `${r.totalPoints}점` : `${r.status} ${r.time ? `${(r.time / 1000).toFixed(1)}s` : ''}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
