import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getSocket } from '../../utils/socket';
import useRaceStore from '../../store/raceStore';
import useSessionStore from '../../store/sessionStore';
import GradientRaceScene from '../3d/GradientRaceScene';
import RacePanel from './RacePanel';
import ResultsView from './ResultsView';
import CountdownOverlay from '../shared/CountdownOverlay';

const MAP_INFO = {
  1: { emoji: '\u26F3', name: '입문', desc: '학습률의 기초를 익힙니다.' },
  2: { emoji: '\uD83C\uDFD4\uFE0F', name: '초급', desc: '학습률 조절을 배웁니다.' },
  3: { emoji: '\uD83C\uDF0B', name: '중급', desc: '로컬 미니마 탈출 도전!' },
  4: { emoji: '\uD83C\uDF0A', name: '고급', desc: '계곡 진동 제어가 핵심.' },
  5: { emoji: '\uD83C\uDFAF', name: '마스터', desc: '종합 전략 활용!' },
  6: { emoji: '\u2696\uFE0F', name: '쌍봉', desc: '두 골짜기 중 글로벌 찾기.' },
  7: { emoji: '\uD83C\uDF00', name: '나선', desc: '나선형 계곡 도전.' },
  8: { emoji: '\uD83C\uDFDC\uFE0F', name: '절벽', desc: '절벽에서 발산 주의!' },
};

const SOLO_MAP_LEVELS = [
  { level: 1, emoji: '\u26F3', name: '입문' },
  { level: 2, emoji: '\uD83C\uDFD4\uFE0F', name: '초급' },
  { level: 3, emoji: '\uD83C\uDF0B', name: '중급' },
  { level: 4, emoji: '\uD83C\uDF0A', name: '고급' },
  { level: 5, emoji: '\uD83C\uDFAF', name: '마스터' },
  { level: 6, emoji: '\u2696\uFE0F', name: '쌍봉' },
  { level: 7, emoji: '\uD83C\uDF00', name: '나선' },
  { level: 8, emoji: '\uD83C\uDFDC\uFE0F', name: '절벽' },
];

export default function TeamPage() {
  const { teamId } = useParams();
  const sessionId = useSessionStore(s => s.sessionId);
  const myTeam = useSessionStore(s => s.myTeam);

  const {
    phase, setPhase, mapLevel, setMapLevel,
    teams, setTeams, balls, updateBalls, results, setResults,
    myLearningRate, setMyLearningRate, myMomentum, setMyMomentum,
    myTeamId, setMyTeamId,
    readyTeams, setReadyTeams, totalTeams, setTotalTeams,
    roundNumber, setRoundNumber, roundResults, setRoundResults,
    cumulativeStandings, setCumulativeStandings,
    countdownSeconds, setCountdownSeconds,
    soloMode, setSoloMode, soloBalls, setSoloBalls,
    soloMapLevel, setSoloMapLevel,
    reset,
  } = useRaceStore();

  const [paramsConfirmed, setParamsConfirmed] = useState(false);
  const [soloRunning, setSoloRunning] = useState(false);

  useEffect(() => {
    if (myTeam) setMyTeamId(String(myTeam.id));
  }, [myTeam, setMyTeamId]);

  useEffect(() => {
    const socket = getSocket();

    // Reconnect
    if (sessionId && myTeam) {
      socket.emit('team:join', { sessionId, teamId: myTeam.id, teamName: myTeam.name });
    }

    socket.on('phase_changed', (data) => {
      setPhase(data.phase);
      if (data.mapLevel) setMapLevel(data.mapLevel);
      // 새 라운드 시작 시 파라미터 확정 해제
      if (data.phase === 'param_set' || data.phase === 'map_select' || data.phase === 'ready_call') {
        setParamsConfirmed(false);
      }
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
      if (data.teams) setTeams(data.teams);
      if (data.mapLevel) setMapLevel(data.mapLevel);
      setSoloMode(false);
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

    // 솔로 이벤트
    socket.on('solo_tick', (data) => {
      setSoloBalls(data.balls || {});
    });

    socket.on('solo_finished', (data) => {
      setSoloRunning(false);
      setSoloBalls(data.balls || {});
    });

    return () => {
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
      socket.off('solo_tick');
      socket.off('solo_finished');
    };
  }, [sessionId, myTeam, setTeams, updateBalls, setPhase, setMapLevel, setResults,
      setReadyTeams, setTotalTeams, setRoundNumber, setRoundResults,
      setCumulativeStandings, setCountdownSeconds, setSoloMode, setSoloBalls, reset]);

  const confirmParams = useCallback(() => {
    const socket = getSocket();
    socket.emit('set_params', {
      teamId: myTeam?.id,
      teamName: myTeam?.name,
      learningRate: myLearningRate,
      momentum: myMomentum,
    });
    setParamsConfirmed(true);
  }, [myTeam, myLearningRate, myMomentum]);

  const sendReady = useCallback(() => {
    const socket = getSocket();
    socket.emit('set_ready', { teamId: myTeam?.id });
  }, [myTeam]);

  const startSolo = useCallback(() => {
    const socket = getSocket();
    socket.emit('start_solo', {
      mapLevel: soloMapLevel,
      learningRate: myLearningRate,
      momentum: myMomentum,
    });
    setSoloRunning(true);
    setSoloMode(true);
  }, [soloMapLevel, myLearningRate, myMomentum, setSoloMode]);

  const stopSolo = useCallback(() => {
    const socket = getSocket();
    socket.emit('stop_solo');
    setSoloRunning(false);
  }, []);

  const stopRace = useCallback(() => {
    const socket = getSocket();
    socket.emit('stop_race');
  }, []);

  const currentMap = MAP_INFO[mapLevel] || MAP_INFO[1];
  const isReady = readyTeams.includes(myTeam?.id) || readyTeams.includes(String(myTeam?.id));

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* 좌측 패널 (35%) */}
      <div style={{
        width: '35%', minWidth: 340, maxWidth: 480,
        borderRight: '1px solid var(--border)',
        overflowY: 'auto', padding: 20,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>

        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>{'\uD83C\uDFC1'}</span>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>경사하강법 레이스</h2>
            <p style={{ fontSize: 11, color: 'var(--text-dim)' }}>{myTeam?.name || '팀'} {'\u2022'} 세션: {sessionId}</p>
          </div>
        </div>

        {/* ===== LOBBY ===== */}
        {phase === 'lobby' && (
          <>
            <div className="card" style={{ padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{'\uD83D\uDC4B'}</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>로비에 입장했습니다!</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                교사가 레이스를 시작할 때까지 솔로 연습을 해보세요.
              </div>
            </div>

            {/* 솔로 연습 */}
            <div className="card" style={{ padding: 14 }}>
              <h4 style={{ fontSize: 13, marginBottom: 8 }}>{'\uD83C\uDFAE'} 솔로 연습</h4>

              {/* 솔로 맵 선택 */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>맵 선택</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                  {SOLO_MAP_LEVELS.map(m => (
                    <button
                      key={m.level}
                      onClick={() => { setSoloMapLevel(m.level); setMapLevel(m.level); }}
                      disabled={soloRunning}
                      style={{
                        background: soloMapLevel === m.level ? 'rgba(99,102,241,0.25)' : 'var(--surface2)',
                        border: soloMapLevel === m.level ? '2px solid #6366f1' : '1px solid var(--border)',
                        borderRadius: 6, padding: '6px 4px', fontSize: 11, color: 'var(--text)',
                        cursor: soloRunning ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {m.emoji} {m.level}
                    </button>
                  ))}
                </div>
              </div>

              {/* 솔로 파라미터 */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                  <span>LR</span>
                  <span style={{ fontWeight: 700, color: '#6366f1' }}>{myLearningRate.toFixed(2)}</span>
                </div>
                <input
                  type="range" min={0.01} max={1.5} step={0.01}
                  value={myLearningRate}
                  onChange={e => setMyLearningRate(parseFloat(e.target.value))}
                  disabled={soloRunning}
                  style={{ width: '100%', accentColor: '#6366f1' }}
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                  <span>Momentum</span>
                  <span style={{ fontWeight: 700, color: '#6366f1' }}>{myMomentum.toFixed(2)}</span>
                </div>
                <input
                  type="range" min={0} max={0.99} step={0.01}
                  value={myMomentum}
                  onChange={e => setMyMomentum(parseFloat(e.target.value))}
                  disabled={soloRunning}
                  style={{ width: '100%', accentColor: '#6366f1' }}
                />
              </div>

              {!soloRunning ? (
                <button
                  onClick={startSolo}
                  style={{
                    width: '100%', padding: 10, background: 'rgba(34,197,94,0.2)',
                    border: '1px solid rgba(34,197,94,0.4)', borderRadius: 'var(--radius)',
                    color: '#86efac', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  {'\uD83C\uDFAE'} 솔로 연습 시작
                </button>
              ) : (
                <button
                  onClick={stopSolo}
                  className="btn-danger"
                  style={{ width: '100%', padding: 10, cursor: 'pointer' }}
                >
                  {'\u23F9'} 솔로 정지
                </button>
              )}
            </div>
          </>
        )}

        {/* ===== READY CALL ===== */}
        {phase === 'ready_call' && (
          <div className="card" style={{ padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{'\u270B'}</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>선생님이 준비를 요청했습니다!</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
              준비가 되면 아래 버튼을 눌러주세요.
            </div>

            {!isReady ? (
              <button
                className="btn-primary"
                onClick={sendReady}
                style={{
                  width: '100%', padding: 18, fontSize: 22, fontWeight: 800,
                  cursor: 'pointer', borderRadius: 12,
                  background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                  border: 'none', color: '#fff',
                  boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
                }}
              >
                {'\uD83D\uDE80'} 레디!
              </button>
            ) : (
              <div style={{
                padding: 18, fontSize: 18, fontWeight: 700, color: '#86efac',
                background: 'rgba(34,197,94,0.15)', borderRadius: 12,
                border: '1px solid rgba(34,197,94,0.3)',
              }}>
                {'\u2705'} 준비 완료! 대기 중...
              </div>
            )}
          </div>
        )}

        {/* ===== MAP SELECT ===== */}
        {phase === 'map_select' && (
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>{'\uD83D\uDDFA\uFE0F'}</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>선생님이 맵을 고르고 있습니다...</div>
            <div style={{
              padding: '14px 18px', background: 'rgba(99,102,241,0.1)',
              borderRadius: 10, border: '1px solid rgba(99,102,241,0.2)',
            }}>
              <div style={{ fontSize: 28, marginBottom: 4 }}>{currentMap.emoji}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#a5b4fc' }}>
                Lv.{mapLevel} {currentMap.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                {currentMap.desc}
              </div>
            </div>
          </div>
        )}

        {/* ===== PARAM SET ===== */}
        {phase === 'param_set' && (
          <RacePanel
            myLearningRate={myLearningRate}
            setMyLearningRate={setMyLearningRate}
            myMomentum={myMomentum}
            setMyMomentum={setMyMomentum}
            paramsConfirmed={paramsConfirmed}
            confirmParams={confirmParams}
            mapLevel={mapLevel}
            currentMap={currentMap}
          />
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

            {/* 맵 정보 */}
            <div style={{
              padding: '8px 12px', background: 'rgba(99,102,241,0.08)',
              borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>{currentMap.emoji}</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Lv.{mapLevel} {currentMap.name}</span>
              <span style={{
                marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%',
                background: '#22c55e', animation: 'pulse 1.5s infinite',
              }} />
            </div>

            {/* 실시간 볼 상태 */}
            {Object.keys(balls).length > 0 && (
              <div className="card" style={{ padding: 12 }}>
                <h4 style={{ fontSize: 12, marginBottom: 6, color: 'var(--text-dim)' }}>실시간 현황</h4>
                {Object.entries(balls).map(([tid, ball]) => {
                  const isMine = String(tid) === String(myTeamId);
                  const teamObj = typeof teams === 'object' && !Array.isArray(teams) ? teams[tid] : null;
                  const teamName = teamObj?.name || `Team ${tid}`;
                  const emoji = ball.status === 'escaped' ? '\uD83D\uDCA5'
                    : ball.status === 'local_minimum' ? '\uD83C\uDFD4\uFE0F'
                    : ball.status === 'converged' ? '\uD83C\uDFC1' : '\uD83C\uDFCE\uFE0F';
                  return (
                    <div key={tid} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '4px 6px', fontSize: 12, borderRadius: 4,
                      background: isMine ? 'rgba(99,102,241,0.1)' : 'transparent',
                      fontWeight: isMine ? 600 : 400,
                    }}>
                      <span style={{ color: teamObj?.color || '#fff' }}>
                        {emoji} {teamName}
                        {isMine && <span style={{ fontSize: 10, color: '#818cf8', marginLeft: 3 }}>(나)</span>}
                      </span>
                      <span style={{ color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                        Loss: {ball.loss?.toFixed(3) || '?'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ===== RESULTS ===== */}
        {phase === 'results' && (
          <>
            <ResultsView
              results={roundResults.length > 0 ? roundResults : results}
              roundNumber={roundNumber}
              myTeamId={myTeamId}
              isFinal={false}
            />
            <div style={{
              textAlign: 'center', fontSize: 12, color: 'var(--text-dim)',
              padding: '10px', background: 'rgba(107,114,128,0.08)', borderRadius: 8,
            }}>
              {'\u23F3'} 다음 라운드 대기 중...
            </div>
          </>
        )}

        {/* ===== FINAL ===== */}
        {phase === 'final' && (
          <ResultsView
            results={cumulativeStandings}
            roundNumber={0}
            myTeamId={myTeamId}
            isFinal={true}
          />
        )}
      </div>

      {/* 우측 3D 씬 (65%) */}
      <div style={{ flex: 1 }}>
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
