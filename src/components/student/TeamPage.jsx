import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getSocket } from '../../utils/socket';
import useRaceStore from '../../store/raceStore';
import useSessionStore from '../../store/sessionStore';
import GradientRaceScene from '../3d/GradientRaceScene';
import RacePanel from './RacePanel';
import ResultsView from './ResultsView';

export default function TeamPage() {
  const { teamId } = useParams();
  const sessionId = useSessionStore(s => s.sessionId);
  const myTeam = useSessionStore(s => s.myTeam);
  const {
    racePhase, setRacePhase, mapLevel, setMapLevel,
    teams, setTeams, balls, updateBalls, results, setResults,
    myLearningRate, setMyLearningRate, myMomentum, setMyMomentum,
    myTeamId, setMyTeamId, setRaceMode,
    gpActive, setGpActive, gpStage, setGpStage, gpCountdown, setGpCountdown,
    stageResults, addStageResult, gpFinalResults, setGpFinalResults,
    reset,
  } = useRaceStore();

  const [alerts, setAlerts] = useState([]);
  const [paramsConfirmed, setParamsConfirmed] = useState(false);

  useEffect(() => {
    if (myTeam) setMyTeamId(String(myTeam.id));
  }, [myTeam, setMyTeamId]);

  useEffect(() => {
    const socket = getSocket();

    // Reconnect handler
    if (sessionId && myTeam) {
      socket.emit('team:join', { sessionId, teamId: myTeam.id, teamName: myTeam.name });
    }

    socket.on('room_state', (state) => {
      setTeams(state.raceTeams || {});
      updateBalls(state.raceBalls || {});
      setRacePhase(state.racePhase || 'setup');
      setMapLevel(state.mapLevel || 1);
      setResults(state.results || []);
      if (state.gpActive !== undefined) setGpActive(state.gpActive);
      if (state.gpStage !== undefined) setGpStage(state.gpStage);
      if (state.gpStageResults) {
        state.gpStageResults.forEach((sr, i) => { if (sr.length) addStageResult(i, sr); });
      }
      if (state.gpFinalResults?.length) setGpFinalResults(state.gpFinalResults);
      if (state.raceMode) setRaceMode(state.raceMode);
    });

    socket.on('race_started', (data) => {
      setRacePhase('racing');
      updateBalls(data.balls || {});
      setTeams(data.teams || {});
      if (data.mapLevel) setMapLevel(data.mapLevel);
    });

    socket.on('race_tick', (data) => {
      updateBalls(data.balls || {});
    });

    socket.on('race_finished', (data) => {
      setRacePhase('finished');
      setResults(data.results || []);
    });

    socket.on('race_alert', (data) => {
      setAlerts(prev => [...prev.slice(-9), { ...data, id: Date.now() }]);
    });

    socket.on('race_reset', (data) => {
      reset();
      if (data?.teams) setTeams(data.teams);
      setParamsConfirmed(false);
    });

    socket.on('map_changed', (data) => {
      setMapLevel(data.mapLevel);
    });

    socket.on('gp_started', (data) => {
      setGpActive(true);
      setGpStage(data.currentStage);
    });

    socket.on('gp_stage_complete', (data) => {
      setRacePhase('stageResult');
      addStageResult(data.stage - 1, data.results);
    });

    socket.on('gp_countdown', (data) => {
      setGpCountdown(data.countdown);
    });

    socket.on('gp_final_results', (data) => {
      setRacePhase('finished');
      setGpFinalResults(data.finalResults);
      setGpActive(false);
    });

    return () => {
      socket.off('room_state');
      socket.off('race_started');
      socket.off('race_tick');
      socket.off('race_finished');
      socket.off('race_alert');
      socket.off('race_reset');
      socket.off('map_changed');
      socket.off('gp_started');
      socket.off('gp_stage_complete');
      socket.off('gp_countdown');
      socket.off('gp_final_results');
    };
  }, [sessionId, myTeam, setTeams, updateBalls, setRacePhase, setMapLevel, setResults,
      setGpActive, setGpStage, addStageResult, setGpFinalResults, setRaceMode,
      setGpCountdown, reset]);

  const confirmParams = useCallback(() => {
    const socket = getSocket();
    socket.emit('set_race_params', {
      teamId: myTeam?.id,
      teamName: myTeam?.name,
      learningRate: myLearningRate,
      momentum: myMomentum,
      mapLevel,
    });
    setParamsConfirmed(true);
  }, [myTeam, myLearningRate, myMomentum, mapLevel]);

  const startSoloRace = useCallback(() => {
    confirmParams();
    const socket = getSocket();
    socket.emit('start_race', { mapLevel, mode: 'solo' });
  }, [mapLevel, confirmParams]);

  const stopRace = useCallback(() => {
    const socket = getSocket();
    socket.emit('stop_race');
  }, []);

  const retryRace = useCallback(() => {
    const socket = getSocket();
    socket.emit('reset_race');
  }, []);

  const isRacing = racePhase === 'racing';
  const isFinished = racePhase === 'finished' || racePhase === 'stageResult';

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* 좌측 패널 */}
      <div style={{ width: 380, minWidth: 340, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>{'\uD83C\uDFC1'}</span>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>경사하강법 레이스</h2>
            <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>{myTeam?.name || '팀'} {'\u2022'} 세션: {sessionId}</p>
          </div>
        </div>

        {/* 레이스 상태 표시 */}
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: isRacing ? '#22c55e' : isFinished ? '#f59e0b' : '#6366f1' }} />
            <span style={{ fontWeight: 600 }}>
              {isRacing ? '레이싱 중...' : isFinished ? (gpActive ? `스테이지 ${gpStage} 결과` : '레이스 완료') : gpActive ? `GP 스테이지 ${gpStage}` : '대기 중'}
            </span>
            {gpActive && gpCountdown > 0 && (
              <span style={{ marginLeft: 'auto', color: '#f59e0b', fontWeight: 700 }}>다음 스테이지: {gpCountdown}s</span>
            )}
          </div>
        </div>

        {/* 맵 선택 (대기 중일 때) */}
        {!isRacing && !isFinished && (
          <RacePanel
            mapLevel={mapLevel}
            setMapLevel={setMapLevel}
            myLearningRate={myLearningRate}
            setMyLearningRate={setMyLearningRate}
            myMomentum={myMomentum}
            setMyMomentum={setMyMomentum}
            paramsConfirmed={paramsConfirmed}
            confirmParams={confirmParams}
            startSoloRace={startSoloRace}
            disabled={gpActive}
          />
        )}

        {/* 정지 버튼 */}
        {isRacing && (
          <button className="btn-danger" onClick={stopRace} style={{ width: '100%', padding: 12, cursor: 'pointer' }}>
            {'\u23F9'} 레이스 정지
          </button>
        )}

        {/* 실시간 볼 상태 */}
        {isRacing && Object.keys(balls).length > 0 && (
          <div className="card" style={{ padding: 12 }}>
            <h4 style={{ fontSize: 13, marginBottom: 8, color: 'var(--text-dim)' }}>실시간 현황</h4>
            {Object.entries(balls).map(([tid, ball]) => {
              const team = teams[tid];
              const emoji = ball.status === 'escaped' ? '\uD83D\uDCA5' : ball.status === 'local_minimum' ? '\uD83C\uDFD4\uFE0F' : ball.status === 'converged' ? '\uD83C\uDFC1' : '\uD83C\uDFCE\uFE0F';
              return (
                <div key={tid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 12 }}>
                  <span style={{ color: team?.color || '#fff' }}>{emoji} {team?.name || tid}</span>
                  <span style={{ color: 'var(--text-dim)' }}>Loss: {ball.loss?.toFixed(3) || '?'}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* 결과 */}
        {isFinished && <ResultsView />}

        {/* 다시하기 */}
        {isFinished && !gpActive && (
          <button className="btn-primary" onClick={retryRace} style={{ width: '100%', padding: 12, cursor: 'pointer' }}>
            {'\uD83D\uDD04'} 다시 도전
          </button>
        )}

        {/* 알림 */}
        {alerts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {alerts.slice(-5).map(a => (
              <div key={a.id} style={{ fontSize: 11, color: a.type === 'escaped' ? '#fca5a5' : a.type === 'converged' ? '#86efac' : '#fde68a', padding: '4px 8px', background: 'rgba(0,0,0,0.3)', borderRadius: 6 }}>
                {a.message}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 우측 3D 씬 */}
      <div style={{ flex: 1 }}>
        <GradientRaceScene />
      </div>
    </div>
  );
}
