import { useState, useEffect } from 'react';
import { apiPost, apiGet } from '../../utils/api';
import { getSocket } from '../../utils/socket';
import useSessionStore from '../../store/sessionStore';
import useRaceStore from '../../store/raceStore';
import GradientRaceScene from '../3d/GradientRaceScene';
import CountdownOverlay from '../shared/CountdownOverlay';

const MAP_LEVELS = [
  { level: 1, emoji: '⛳', name: '입문', desc: '큰 학습률 = 빠른 하강! 최적 LR을 찾아보세요.' },
  { level: 2, emoji: '🏔️', name: '초급', desc: 'LR이 너무 크면 진동! 적절한 범위를 찾아보세요.' },
  { level: 3, emoji: '🌋', name: '중급', desc: '모멘텀 없이는 함정에 빠집니다! 모멘텀의 힘을 경험하세요.' },
  { level: 4, emoji: '🌊', name: '고급', desc: '링 모양 장벽이 중심을 감싸고 있어요. 모멘텀으로 돌파하세요!' },
  { level: 5, emoji: '🎯', name: '마스터', desc: 'LR과 모멘텀 모두 정밀 조절이 필요한 최종 도전!' },
  { level: 6, emoji: '⚖️', name: '함정', desc: '글로벌로 가는 길에 유혹적인 함정이! 모멘텀으로 통과하세요.' },
  { level: 7, emoji: '🌀', name: '나선', desc: '나선형 장벽과 로컬 함정! 경로 의존성을 체험합니다.' },
  { level: 8, emoji: '🏜️', name: '절벽', desc: '절벽 너머 깊은 계곡! 다단계 전략 도전!' },
];

const DIFFICULTY_COLORS = {
  '입문': '#22c55e', '초급': '#3b82f6', '중급': '#f59e0b',
  '고급': '#ef4444', '마스터': '#a855f7', '함정': '#f59e0b',
  '나선': '#ef4444', '절벽': '#a855f7',
};

const STATUS_EMOJI = { converged: '\uD83C\uDFC1', local_minimum: '\uD83C\uDFD4\uFE0F', escaped: '\uD83D\uDCA5' };
const STATUS_LABEL = { converged: '수렴 성공', local_minimum: '로컬 미니마', escaped: '발산' };
const RANK_EMOJI = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];

export default function TeacherApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const sessionId = useSessionStore(s => s.sessionId);
  const setSession = useSessionStore(s => s.setSession);
  const teams = useSessionStore(s => s.teams);
  const setTeams = useSessionStore(s => s.setTeams);

  const {
    phase, setPhase, mapLevel, setMapLevel,
    balls, updateBalls, results, setResults,
    readyTeams, setReadyTeams, totalTeams, setTotalTeams,
    roundNumber, setRoundNumber, roundResults, setRoundResults,
    cumulativeStandings, setCumulativeStandings,
    countdownSeconds, setCountdownSeconds,
    reset,
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

    socket.on('phase_changed', (data) => {
      setPhase(data.phase);
      if (data.mapLevel) setMapLevel(data.mapLevel);
    });

    socket.on('map_changed', (data) => {
      setMapLevel(data.mapLevel);
    });

    socket.on('ready_update', (data) => {
      setReadyTeams(data.readyTeams || []);
      setTotalTeams(data.totalTeams || 0);
    });

    socket.on('countdown', (data) => {
      setCountdownSeconds(data.seconds);
    });

    socket.on('race_started', (data) => {
      setPhase('racing');
      updateBalls(data.balls || {});
      if (data.mapLevel) setMapLevel(data.mapLevel);
    });

    socket.on('race_tick', (data) => {
      updateBalls(data.balls || {});
    });

    socket.on('race_finished', (data) => {
      setPhase('results');
      setResults(data.results || []);
      if (data.roundNumber) setRoundNumber(data.roundNumber);
    });

    socket.on('round_results', (data) => {
      setPhase('results');
      setRoundNumber(data.roundNumber || 0);
      setRoundResults(data.results || []);
      setCumulativeStandings(data.cumulativeStandings || []);
    });

    socket.on('final_results', (data) => {
      setPhase('final');
      setCumulativeStandings(data.standings || []);
    });

    socket.on('room_state', (state) => {
      if (state.phase) setPhase(state.phase);
      if (state.mapLevel) setMapLevel(state.mapLevel);
      updateBalls(state.raceBalls || state.balls || {});
      if (state.results) setResults(state.results);
    });

    return () => {
      clearInterval(interval);
      socket.off('team_joined');
      socket.off('phase_changed');
      socket.off('map_changed');
      socket.off('ready_update');
      socket.off('countdown');
      socket.off('race_started');
      socket.off('race_tick');
      socket.off('race_finished');
      socket.off('round_results');
      socket.off('final_results');
      socket.off('room_state');
    };
  }, [sessionId, setTeams, updateBalls, setPhase, setMapLevel,
      setResults, setReadyTeams, setTotalTeams, setRoundNumber,
      setRoundResults, setCumulativeStandings, setCountdownSeconds, reset]);

  const socket = getSocket();
  const callReady = () => socket.emit('call_ready');
  const selectMap = (level) => {
    setMapLevel(level);
    socket.emit('select_map', { mapLevel: level });
  };
  const goToParamSet = () => socket.emit('go_to_param_set');
  const startRace = () => socket.emit('start_race', { mapLevel });
  const stopRace = () => socket.emit('stop_race');
  const nextRound = () => socket.emit('select_map', { mapLevel }); // -> map_select
  const finishAll = () => socket.emit('finish_all');
  const resetToLobby = () => { socket.emit('reset_to_lobby'); reset(); };

  const copySessionCode = () => {
    navigator.clipboard.writeText(sessionId).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  const selectedMap = MAP_LEVELS.find(m => m.level === mapLevel) || MAP_LEVELS[0];
  const allReady = readyTeams.length > 0 && readyTeams.length >= totalTeams;

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

  // ===== 대시보드 (좌측 컨트롤 + 우측 3D) =====
  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* 좌측 패널 (고정 320px) */}
      <div style={{
        width: 320, minWidth: 320, maxWidth: 320,
        borderRight: '1px solid var(--border)',
        overflowY: 'auto', padding: 16,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>

        {/* 세션 코드 */}
        <div style={{
          textAlign: 'center', padding: '16px 20px',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.15))',
          border: '2px solid rgba(99,102,241,0.3)', borderRadius: 12,
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>참여 코드</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span style={{
              fontSize: 36, fontWeight: 800, letterSpacing: 8, color: '#818cf8',
              fontFamily: 'monospace', textShadow: '0 0 20px rgba(99,102,241,0.3)',
            }}>
              {sessionId}
            </span>
            <button
              onClick={copySessionCode}
              style={{
                background: codeCopied ? 'rgba(34,197,94,0.2)' : 'rgba(99,102,241,0.2)',
                border: `1px solid ${codeCopied ? 'rgba(34,197,94,0.4)' : 'rgba(99,102,241,0.4)'}`,
                borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
                color: codeCopied ? '#86efac' : '#a5b4fc',
              }}
            >
              {codeCopied ? '\u2705 복사됨!' : '\uD83D\uDCCB 복사'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
            {window.location.origin} | {'\uD83D\uDC65'} {teams.length}팀
          </div>
        </div>

        {/* 현재 Phase 표시 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: phase === 'racing' ? '#22c55e' : phase === 'results' || phase === 'final' ? '#f59e0b' : '#6366f1',
            animation: phase === 'racing' ? 'pulse 1.5s infinite' : 'none',
          }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {phase === 'lobby' && '\uD83C\uDFE0 로비 - 학생 입장 대기'}
            {phase === 'ready_call' && '\u270B 레디 호출 - 학생 준비 확인 중'}
            {phase === 'map_select' && '\uD83D\uDDFA\uFE0F 맵 선택 중'}
            {phase === 'param_set' && '\u2699\uFE0F 파라미터 세팅 시간'}
            {phase === 'countdown' && '\u23F3 카운트다운...'}
            {phase === 'racing' && `\uD83C\uDFCE\uFE0F 레이싱 중 - ${selectedMap.emoji} ${selectedMap.name}`}
            {phase === 'results' && `\uD83C\uDFC1 라운드 ${roundNumber} 결과`}
            {phase === 'final' && '\uD83C\uDFC6 최종 결과'}
          </span>
        </div>

        {/* ===== LOBBY ===== */}
        {phase === 'lobby' && (
          <>
            {/* 팀 목록 */}
            <div className="card" style={{ padding: 14 }}>
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>{'\uD83D\uDC65'} 참여 팀 ({teams.length})</h3>
              {teams.length === 0 ? (
                <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>아직 참여한 팀이 없습니다. 코드를 공유하세요.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
                  {teams.map(t => (
                    <div key={t.id} style={{
                      background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px',
                      borderLeft: `3px solid ${t.color || '#6366f1'}`,
                    }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{t.members?.join(', ') || ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              className="btn-primary"
              onClick={callReady}
              disabled={teams.length === 0}
              style={{ width: '100%', padding: 14, fontSize: 16, cursor: teams.length === 0 ? 'not-allowed' : 'pointer' }}
            >
              {'\u270B'} 레디 호출
            </button>
          </>
        )}

        {/* ===== READY CALL ===== */}
        {phase === 'ready_call' && (
          <>
            <div className="card" style={{ padding: 14 }}>
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>{'\u2705'} 준비 상태 ({readyTeams.length}/{totalTeams || teams.length})</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
                {teams.map(t => {
                  const isReady = readyTeams.includes(t.id) || readyTeams.includes(String(t.id));
                  return (
                    <div key={t.id} style={{
                      background: isReady ? 'rgba(34,197,94,0.15)' : 'var(--surface2)',
                      border: `1px solid ${isReady ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`,
                      borderRadius: 8, padding: '8px 12px', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 18, marginBottom: 2 }}>{isReady ? '\u2705' : '\u23F3'}</div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{t.name}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              className="btn-primary"
              onClick={() => socket.emit('select_map', { mapLevel })}
              disabled={!allReady}
              style={{
                width: '100%', padding: 14, fontSize: 15,
                cursor: allReady ? 'pointer' : 'not-allowed',
                opacity: allReady ? 1 : 0.5,
              }}
            >
              {allReady ? '\uD83D\uDDFA\uFE0F 맵 선택으로' : `\u23F3 준비 대기 중 (${readyTeams.length}/${totalTeams || teams.length})`}
            </button>
          </>
        )}

        {/* ===== MAP SELECT ===== */}
        {phase === 'map_select' && (
          <>
            <div className="card" style={{ padding: 14 }}>
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>{'\uD83D\uDDFA\uFE0F'} 맵 선택</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {MAP_LEVELS.map(m => {
                  const isSelected = mapLevel === m.level;
                  return (
                    <button
                      key={m.level}
                      onClick={() => selectMap(m.level)}
                      style={{
                        background: isSelected
                          ? 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(168,85,247,0.2))'
                          : 'var(--surface2)',
                        border: isSelected ? '2px solid #6366f1' : '1px solid var(--border)',
                        borderRadius: 10, padding: '10px 12px', textAlign: 'left',
                        cursor: 'pointer', color: 'var(--text)',
                        boxShadow: isSelected ? '0 0 12px rgba(99,102,241,0.2)' : 'none',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14 }}>{m.emoji} Lv.{m.level}</span>
                        <span style={{ fontSize: 10, color: DIFFICULTY_COLORS[m.name], fontWeight: 700 }}>
                          {m.name}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, lineHeight: 1.3 }}>
                        {m.desc.length > 30 ? m.desc.slice(0, 30) + '...' : m.desc}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 선택된 맵 상세 */}
              <div style={{
                marginTop: 10, padding: '10px 14px',
                background: 'rgba(99,102,241,0.08)', borderRadius: 8,
                border: '1px solid rgba(99,102,241,0.15)',
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#a5b4fc', marginBottom: 2 }}>
                  {selectedMap.emoji} Lv.{selectedMap.level} {selectedMap.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.4 }}>
                  {selectedMap.desc}
                </div>
              </div>
            </div>

            <button
              className="btn-primary"
              onClick={() => socket.emit('go_param_set', { mapLevel })}
              style={{ width: '100%', padding: 14, fontSize: 15, cursor: 'pointer' }}
            >
              {'\u2699\uFE0F'} 파라미터 세팅 시간
            </button>
          </>
        )}

        {/* ===== PARAM SET ===== */}
        {phase === 'param_set' && (
          <>
            <div className="card" style={{ padding: 14 }}>
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>{'\u2699\uFE0F'} 파라미터 세팅 중</h3>
              <div style={{
                padding: '10px 14px', background: 'rgba(99,102,241,0.08)',
                borderRadius: 8, marginBottom: 10,
              }}>
                <div style={{ fontSize: 13, color: '#a5b4fc' }}>
                  {selectedMap.emoji} Lv.{selectedMap.level} {selectedMap.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  학생들이 LR/Momentum을 설정하고 있습니다...
                </div>
              </div>
            </div>

            <button
              className="btn-primary"
              onClick={startRace}
              style={{ width: '100%', padding: 16, fontSize: 18, fontWeight: 700, cursor: 'pointer' }}
            >
              {'\uD83C\uDFC1'} 레이스 시작!
            </button>
          </>
        )}

        {/* ===== COUNTDOWN ===== */}
        {phase === 'countdown' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 80, fontWeight: 900, color: '#818cf8' }}>
              {countdownSeconds > 0 ? countdownSeconds : 'GO!'}
            </div>
          </div>
        )}

        {/* ===== RACING ===== */}
        {phase === 'racing' && (
          <>
            <button className="btn-danger" onClick={stopRace} style={{ width: '100%', padding: 12, cursor: 'pointer' }}>
              {'\u23F9'} 레이스 정지
            </button>

            <div className="card" style={{ padding: 14 }}>
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>실시간 현황</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {Object.entries(balls).map(([tid, ball]) => {
                  const team = teams.find ? teams.find(t => String(t.id) === String(tid)) : null;
                  const teamName = team?.name || (typeof teams === 'object' && teams[tid]?.name) || `Team ${tid}`;
                  const emoji = ball.status === 'escaped' ? '\uD83D\uDCA5'
                    : ball.status === 'local_minimum' ? '\uD83C\uDFD4\uFE0F'
                    : ball.status === 'converged' ? '\uD83C\uDFC1' : '\uD83C\uDFCE\uFE0F';
                  return (
                    <div key={tid} style={{
                      background: 'var(--surface2)', borderRadius: 6, padding: '6px 10px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      borderLeft: `3px solid ${team?.color || '#6366f1'}`,
                    }}>
                      <span style={{ fontSize: 12 }}>{emoji} {teamName}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                        Loss: {ball.loss?.toFixed(3) || '?'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ===== RESULTS ===== */}
        {phase === 'results' && (
          <>
            <div className="card" style={{ padding: 14 }}>
              <h3 style={{ fontSize: 16, marginBottom: 12, textAlign: 'center' }}>
                {'\uD83C\uDFC1'} 라운드 {roundNumber} 결과 - {selectedMap.emoji} {selectedMap.name}
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={thStyle}>#</th>
                      <th style={{ ...thStyle, textAlign: 'left' }}>팀</th>
                      <th style={thStyle}>상태</th>
                      <th style={thStyle}>시간</th>
                      <th style={thStyle}>Loss</th>
                      <th style={thStyle}>LR</th>
                      <th style={thStyle}>M</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(roundResults.length > 0 ? roundResults : results).map((r, i) => (
                      <tr key={r.teamId || i} style={{ borderBottom: '1px solid var(--border)', background: i === 0 ? 'rgba(251,191,36,0.08)' : 'transparent' }}>
                        <td style={tdStyle}>{RANK_EMOJI[i] || `${i + 1}`}</td>
                        <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 600 }}>{r.teamName}</td>
                        <td style={{ ...tdStyle, color: r.status === 'converged' ? 'var(--success)' : r.status === 'escaped' ? 'var(--danger)' : 'var(--warning)' }}>
                          {STATUS_EMOJI[r.status]} {STATUS_LABEL[r.status] || r.status}
                        </td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{r.time ? `${(r.time / 1000).toFixed(1)}s` : '-'}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{r.finalLoss != null && !isNaN(r.finalLoss) ? r.finalLoss.toFixed(4) : '-'}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#818cf8' }}>{r.lr != null ? r.lr.toFixed(2) : '-'}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#818cf8' }}>{r.momentum != null ? r.momentum.toFixed(2) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-primary"
                onClick={nextRound}
                style={{ flex: 1, padding: 12, fontSize: 14, cursor: 'pointer' }}
              >
                {'\u27A1\uFE0F'} 다음 라운드
              </button>
              <button
                onClick={finishAll}
                style={{
                  flex: 1, padding: 12, fontSize: 14, cursor: 'pointer',
                  background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.4)',
                  borderRadius: 'var(--radius)', color: '#c084fc', fontWeight: 600,
                }}
              >
                {'\uD83C\uDFC6'} 최종 완료
              </button>
            </div>
          </>
        )}

        {/* ===== FINAL ===== */}
        {phase === 'final' && (
          <>
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ fontSize: 18, marginBottom: 14, textAlign: 'center' }}>
                {'\uD83C\uDFC6'} 최종 순위
              </h3>
              {cumulativeStandings.map((r, i) => (
                <div key={r.teamId || i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', borderRadius: 8, marginBottom: 4,
                  background: i === 0 ? 'rgba(251,191,36,0.12)' : i < 3 ? 'rgba(99,102,241,0.08)' : 'transparent',
                  border: i === 0 ? '1px solid rgba(251,191,36,0.3)' : '1px solid transparent',
                }}>
                  <span style={{ fontSize: 15, fontWeight: i < 3 ? 700 : 400 }}>
                    {RANK_EMOJI[i] || `${i + 1}위`} {r.teamName}
                  </span>
                  <span style={{ fontWeight: 700, color: '#fbbf24', fontSize: 14 }}>
                    {r.totalPoints || r.points || 0}점
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={resetToLobby}
                style={{
                  flex: 1, padding: 12, fontSize: 14, cursor: 'pointer',
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', color: 'var(--text)',
                }}
              >
                {'\uD83C\uDFE0'} 로비로
              </button>
              <button
                onClick={() => { resetToLobby(); }}
                className="btn-primary"
                style={{ flex: 1, padding: 12, fontSize: 14, cursor: 'pointer' }}
              >
                {'\uD83D\uDD04'} 새 세션
              </button>
            </div>
          </>
        )}

      </div>

      {/* 우측 3D 씬 */}
      <div style={{ flex: 1, minHeight: 500 }}>
        <GradientRaceScene />
      </div>

      {/* 카운트다운 오버레이 */}
      {phase === 'countdown' && countdownSeconds > 0 && (
        <CountdownOverlay seconds={countdownSeconds} />
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

const thStyle = { padding: '6px 8px', textAlign: 'center', color: 'var(--text-dim)', fontWeight: 600, fontSize: 11 };
const tdStyle = { padding: '8px', textAlign: 'center', fontSize: 12 };
