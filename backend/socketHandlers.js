import {
  rooms,
  getRoom,
  addTeamToRoom,
  removeTeamFromRoom,
  findTeamBySocket,
  isTeacher,
  getRoomState,
  broadcastRoomUpdate,
  cleanupRoom,
  sessionRoom,
  teacherRoom,
} from './roomManager.js';

import {
  clampLearningRate,
  clampMomentum,
  createRaceBall,
  createRaceResult,
  getRandomizedStartPosition,
  inspectRaceBall,
  normalizeMapLevel,
  rankRaceResults,
  advanceRaceBall,
} from './raceEngine.js';

// ── GP 스테이지 설정 ──
const GP_STAGES = [
  { stage: 1, mapLevel: 1 }, // 초급
  { stage: 2, mapLevel: 2 }, // 중급
  { stage: 3, mapLevel: 3 }, // 고급
];
const GP_COUNTDOWN_SECONDS = 5;

const MAX_TEAMS_PER_SESSION = 50;

// ── 유틸리티 ──

function sanitize(str, maxLen = 50) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>&"']/g, '').trim().slice(0, maxLen);
}

function safeHandler(name, handler) {
  return (...args) => {
    try {
      handler(...args);
    } catch (err) {
      console.error(`[${name}] Socket handler error:`, err);
    }
  };
}

// ── DB Prepared Statements (lazy init) ──
let stmtInsertResult = null;

function getInsertResultStmt(db) {
  if (!stmtInsertResult) {
    stmtInsertResult = db.prepare(`
      INSERT INTO race_results
        (session_id, team_id, map_level, mode, learning_rate, momentum,
         status, finish_time, final_loss, cumulative_loss, rank, gp_stage, gp_points)
      VALUES
        (@sessionId, @teamId, @mapLevel, @mode, @lr, @momentum,
         @status, @finishTime, @finalLoss, @cumulativeLoss, @rank, @gpStage, @gpPoints)
    `);
  }
  return stmtInsertResult;
}

// ═══════════════════════════════════════════════
// ▸ 메인 핸들러
// ═══════════════════════════════════════════════

export function setupSocketHandlers(io, db) {
  io.on('connection', (socket) => {
    console.log(`✨ 연결: ${socket.id}`);

    let currentSession = null; // sessionId
    let currentTeamId = null;  // DB team PK

    // ──────────────────────────────
    // ▸ 교사 입장
    // ──────────────────────────────
    socket.on('teacher:join', safeHandler('teacher:join', (payload) => {
      const { sessionId } = payload;
      if (!sessionId) return;

      currentSession = sessionId;
      const room = getRoom(sessionId);
      room.teacherId = socket.id;

      socket.join(sessionRoom(sessionId));
      socket.join(teacherRoom(sessionId));

      console.log(`🎓 교사 입장 → 세션 [${sessionId}]`);

      socket.emit('room_state', getRoomState(sessionId));
    }));

    // ──────────────────────────────
    // ▸ 팀 입장
    // ──────────────────────────────
    socket.on('team:join', safeHandler('team:join', (payload) => {
      const { sessionId, teamId, teamName, members, color } = payload;
      if (!sessionId || !teamId) return;

      // 인원 제한 체크
      const existingRoom = getRoom(sessionId);
      if (existingRoom.teams.size >= MAX_TEAMS_PER_SESSION && !existingRoom.teams.has(teamId)) {
        socket.emit('room_full', {
          message: `세션이 가득 찼습니다. 최대 ${MAX_TEAMS_PER_SESSION}팀까지 참여할 수 있습니다.`,
          maxCapacity: MAX_TEAMS_PER_SESSION,
        });
        return;
      }

      currentSession = sessionId;
      currentTeamId = teamId;

      socket.join(sessionRoom(sessionId));

      // 이미 있는 팀이면 socketId만 갱신 (재접속)
      const room = getRoom(sessionId);
      if (room.teams.has(teamId)) {
        const existing = room.teams.get(teamId);
        existing.socketId = socket.id;
        console.log(`🔄 팀 [${existing.name}] 재접속 → 세션 [${sessionId}]`);
      } else {
        addTeamToRoom(sessionId, teamId, {
          socketId: socket.id,
          name: sanitize(teamName, 24) || `Team ${teamId}`,
          members: members || '[]',
          color: color || `hsl(${Math.floor(Math.random() * 360)}, 80%, 60%)`,
        });
        console.log(`🚀 팀 [${teamName}] (id=${teamId}) → 세션 [${sessionId}] (${room.teams.size}팀)`);
      }

      // 재접속 시 레이스 데이터 복구
      if (room.raceBalls[teamId] && (room.racePhase === 'racing' || room.racePhase === 'preparing')) {
        socket.emit('race_tick', { balls: room.raceBalls });
      }

      // 전체 상태 전송
      socket.emit('room_state', getRoomState(sessionId));
      broadcastRoomUpdate(io, sessionId);

      // 교사에게 팀 입장 알림
      io.to(teacherRoom(sessionId)).emit('team_joined', {
        teamId,
        teamName: room.teams.get(teamId).name,
        teamCount: room.teams.size,
      });
    }));

    // ──────────────────────────────
    // ▸ 파라미터 설정 (학습률 + 모멘텀)
    // ──────────────────────────────
    socket.on('set_race_params', safeHandler('set_race_params', (payload) => {
      if (!currentSession || !currentTeamId) return;
      const room = rooms.get(currentSession);
      if (!room) return;

      const team = room.teams.get(currentTeamId);
      if (!team) return;

      const learningRate = clampLearningRate(payload.learningRate, team.learningRate);
      const momentum = clampMomentum(payload.momentum, team.momentum);

      team.learningRate = learningRate;
      team.momentum = momentum;
      team.paramsConfirmed = true;

      console.log(`🏎️ 팀 [${team.name}] 파라미터: lr=${learningRate}, m=${momentum}`);

      // 레이스 진행 중이면 공의 파라미터도 즉시 업데이트
      const ball = room.raceBalls[currentTeamId];
      if (ball && (ball.status === 'racing' || ball.status === 'preparing')) {
        ball.lr = learningRate;
        ball.momentum = momentum;
      }

      io.to(sessionRoom(currentSession)).emit('race_teams_updated', {
        teams: serializeTeams(room),
      });
    }));

    // ──────────────────────────────
    // ▸ 교사: 맵 선택
    // ──────────────────────────────
    socket.on('teacher_set_map', safeHandler('teacher_set_map', (payload) => {
      if (!currentSession) return;
      const room = rooms.get(currentSession);
      if (!room || !isTeacher(socket.id, currentSession)) return;

      if (room.racePhase === 'racing') {
        socket.emit('error_msg', { message: '레이스 중에는 맵을 변경할 수 없습니다.' });
        return;
      }

      const level = normalizeMapLevel(payload?.level, room.mapLevel);
      room.mapLevel = level;

      io.to(sessionRoom(currentSession)).emit('map_selected', { level });
      console.log(`🗺️ 교사 맵 선택: Level ${level} 세션 [${currentSession}]`);
    }));

    // ──────────────────────────────
    // ▸ 교사: 레이스 준비 (공 배치)
    // ──────────────────────────────
    socket.on('prepare_race', safeHandler('prepare_race', (payload) => {
      if (!currentSession) return;
      const room = rooms.get(currentSession);
      if (!room || !isTeacher(socket.id, currentSession)) return;
      if (room.teams.size === 0) return;

      const level = normalizeMapLevel(payload?.level, room.mapLevel);
      room.mapLevel = level;
      room.racePhase = 'preparing';
      room.raceBalls = {};
      room.raceFinished = {};
      room.raceResults = [];
      room.gpCountdown = 0;

      for (const [teamId, team] of room.teams) {
        const position = getRandomizedStartPosition(level);
        room.raceBalls[teamId] = createRaceBall({
          level,
          x: position.x,
          z: position.z,
          lr: team.learningRate || 0.1,
          momentum: team.momentum || 0.9,
          status: 'preparing',
        });
      }

      io.to(sessionRoom(currentSession)).emit('race_prepare', {
        balls: room.raceBalls,
        teams: serializeTeams(room),
        mapLevel: level,
      });
      console.log(`🎯 레이스 준비! 세션 [${currentSession}] 맵=${level} — ${room.teams.size}팀`);
    }));

    // ──────────────────────────────
    // ▸ 교사: 레이스 시작 (단일 맵)
    // ──────────────────────────────
    socket.on('start_race', safeHandler('start_race', (payload) => {
      if (!currentSession) return;
      const room = rooms.get(currentSession);
      if (!room || !isTeacher(socket.id, currentSession)) return;
      if (room.teams.size === 0) return;

      room.gpActive = false;
      room.gpStage = 0;
      room.gpStageResults = [[], [], []];
      room.gpFinalResults = [];
      room.gpCountdown = 0;

      const mode = payload?.mode || 'competition';
      const level = normalizeMapLevel(payload?.level, room.mapLevel);
      room.raceMode = mode;

      console.log(`🏁 레이스 모드: ${mode} (Level ${level}) 세션 [${currentSession}]`);
      startStageRace(io, db, currentSession, level);
    }));

    // ──────────────────────────────
    // ▸ 교사: Grand Prix 시작
    // ──────────────────────────────
    socket.on('start_gp', safeHandler('start_gp', () => {
      if (!currentSession) return;
      const room = rooms.get(currentSession);
      if (!room || !isTeacher(socket.id, currentSession)) return;
      if (room.teams.size === 0) return;

      room.gpActive = true;
      room.gpStage = 1;
      room.gpStageResults = [[], [], []];
      room.gpFinalResults = [];
      room.gpCountdown = 0;

      io.to(sessionRoom(currentSession)).emit('gp_started', {
        totalStages: GP_STAGES.length,
        currentStage: 1,
      });
      console.log(`🏎️🏎️🏎️ Grand Prix 시작! 세션 [${currentSession}] — ${room.teams.size}팀`);

      startStageRace(io, db, currentSession, GP_STAGES[0].mapLevel);
    }));

    // ──────────────────────────────
    // ▸ 교사: 레이스 정지
    // ──────────────────────────────
    socket.on('stop_race', safeHandler('stop_race', () => {
      if (!currentSession) return;
      const room = rooms.get(currentSession);
      if (!room || room.racePhase !== 'racing') return;
      if (!isTeacher(socket.id, currentSession)) {
        socket.emit('error_msg', { message: '레이스 정지는 교사만 가능합니다.' });
        return;
      }

      // 아직 달리는 공 강제 종료
      room.raceFinished = room.raceFinished || {};
      for (const [teamId, ball] of Object.entries(room.raceBalls)) {
        if (ball.status !== 'racing') continue;
        const outcome = inspectRaceBall(ball, room.mapLevel, Number.POSITIVE_INFINITY) || {
          status: 'local_minimum',
          distToGlobal: 0,
        };
        const dist = outcome.distToGlobal;
        ball.status = dist < 0.8 ? 'converged' : 'local_minimum';
        const team = room.teams.get(Number(teamId) || teamId);
        room.raceFinished[teamId] = createRaceResult({
          teamId,
          teamName: team?.name || `Team ${teamId}`,
          ball,
          level: room.mapLevel,
          timeMs: Date.now() - room.raceStartTime,
          status: ball.status,
          lr: team?.learningRate || ball.lr,
          momentum: team?.momentum || ball.momentum,
          distToGlobal: dist,
        });
      }

      if (room.raceInterval) { clearInterval(room.raceInterval); room.raceInterval = null; }
      room.racePhase = 'finished';
      room.raceResults = rankRaceResults(Object.values(room.raceFinished));

      io.to(sessionRoom(currentSession)).emit('race_finished', { results: room.raceResults });
      saveResults(db, currentSession, room);
      console.log(`🛑 레이스 정지! 세션 [${currentSession}]`);
    }));

    // ──────────────────────────────
    // ▸ 교사: 같은 맵 재도전
    // ──────────────────────────────
    socket.on('retry_same_level', safeHandler('retry_same_level', () => {
      if (!currentSession) return;
      const room = rooms.get(currentSession);
      if (!room || !isTeacher(socket.id, currentSession)) return;

      clearRoomTimers(room);

      const level = normalizeMapLevel(room.mapLevel, 2);
      room.racePhase = 'preparing';
      room.raceFinished = {};
      room.raceBalls = {};
      room.raceResults = [];
      room.gpCountdown = 0;

      for (const [teamId, team] of room.teams) {
        const position = getRandomizedStartPosition(level);
        room.raceBalls[teamId] = createRaceBall({
          level,
          x: position.x,
          z: position.z,
          lr: team.learningRate || 0.1,
          momentum: team.momentum || 0.9,
          status: 'preparing',
        });
      }

      io.to(sessionRoom(currentSession)).emit('race_prepare', {
        balls: room.raceBalls,
        teams: serializeTeams(room),
        mapLevel: level,
      });
      console.log(`🔁 같은 맵 재도전! 세션 [${currentSession}] 맵=${level}`);
    }));

    // ──────────────────────────────
    // ▸ 교사: 레이스 리셋
    // ──────────────────────────────
    socket.on('reset_race', safeHandler('reset_race', () => {
      if (!currentSession) return;
      const room = rooms.get(currentSession);
      if (!room || !isTeacher(socket.id, currentSession)) return;

      clearRoomTimers(room);

      room.racePhase = 'setup';
      room.raceBalls = {};
      room.raceFinished = {};
      room.raceResults = [];
      room.raceMode = 'competition';
      room.gpActive = false;
      room.gpStage = 0;
      room.gpStageResults = [[], [], []];
      room.gpFinalResults = [];
      room.gpCountdown = 0;

      io.to(sessionRoom(currentSession)).emit('race_reset', {
        teams: serializeTeams(room),
      });
      console.log(`🔄 레이스 리셋! 세션 [${currentSession}]`);
    }));

    // ──────────────────────────────
    // ▸ 연결 해제
    // ──────────────────────────────
    socket.on('disconnect', safeHandler('disconnect', () => {
      if (!currentSession) {
        console.log(`🌙 연결 해제: ${socket.id} (세션 없음)`);
        return;
      }

      const room = rooms.get(currentSession);
      if (!room) return;

      // 팀 연결 해제 처리
      if (currentTeamId && room.teams.has(currentTeamId)) {
        const team = room.teams.get(currentTeamId);
        console.log(`💫 팀 [${team.name}] 연결 해제 (세션 [${currentSession}])`);

        // 레이스 중이 아니면 팀 제거
        if (room.racePhase === 'setup') {
          removeTeamFromRoom(currentSession, currentTeamId);
        }
        // 레이스 중이면 팀 데이터 유지 (재접속 대비)

        broadcastRoomUpdate(io, currentSession);

        io.to(teacherRoom(currentSession)).emit('team_left', {
          teamId: currentTeamId,
          teamName: team.name,
          teamCount: room.teams.size,
        });
      }

      // 교사 연결 해제
      if (room.teacherId === socket.id) {
        console.log(`🎓 교사 연결 해제 (세션 [${currentSession}])`);
        room.teacherId = null;
        clearRoomTimers(room);
        room.gpCountdown = 0;
      }

      // 방이 비었으면 정리
      if (room.teams.size === 0 && !room.teacherId) {
        cleanupRoom(currentSession);
        console.log(`🗑️ 빈 세션 삭제: [${currentSession}]`);
      }

      console.log(`🌙 연결 해제: ${socket.id}`);
    }));
  });
}

// ═══════════════════════════════════════════════
// ▸ 내부 헬퍼 함수
// ═══════════════════════════════════════════════

/**
 * 팀 Map을 직렬화 (클라이언트 전송용 plain object)
 */
function serializeTeams(room) {
  const result = {};
  for (const [teamId, team] of room.teams) {
    result[teamId] = {
      id: team.id,
      name: team.name,
      members: team.members,
      color: team.color,
      learningRate: team.learningRate,
      momentum: team.momentum,
      paramsConfirmed: team.paramsConfirmed,
    };
  }
  return result;
}

/**
 * 방의 타이머 정리
 */
function clearRoomTimers(room) {
  if (room.raceInterval) { clearInterval(room.raceInterval); room.raceInterval = null; }
  if (room.countdownInterval) { clearInterval(room.countdownInterval); room.countdownInterval = null; }
}

/**
 * 단일 스테이지 레이스 시작 (내부)
 */
function startStageRace(io, db, sessionId, mapLevel) {
  const room = rooms.get(sessionId);
  if (!room) return;
  if (room.teams.size === 0) return;

  const normalizedLevel = normalizeMapLevel(mapLevel, room.mapLevel);
  room.mapLevel = normalizedLevel;
  room.raceFinished = {};
  room.raceResults = [];
  room.gpCountdown = 0;

  // 공 초기화: preparing 단계면 기존 위치 유지, 아니면 새로 배치
  const preservePositions = room.racePhase === 'preparing' && Object.keys(room.raceBalls).length > 0;
  const nextBalls = {};

  for (const [teamId, team] of room.teams) {
    const previousBall = preservePositions ? room.raceBalls[teamId] : null;
    const position = previousBall
      ? { x: previousBall.x, z: previousBall.z }
      : getRandomizedStartPosition(normalizedLevel);

    nextBalls[teamId] = createRaceBall({
      level: normalizedLevel,
      x: position.x,
      z: position.z,
      lr: team.learningRate,
      momentum: team.momentum,
      status: 'racing',
    });
  }
  room.raceBalls = nextBalls;

  room.racePhase = 'racing';
  room.racePaused = false;
  room.raceStartTime = Date.now();

  const sRoom = sessionRoom(sessionId);

  io.to(sRoom).emit('race_started', {
    balls: room.raceBalls,
    teams: serializeTeams(room),
    startTime: room.raceStartTime,
    mapLevel: normalizedLevel,
    gpStage: room.gpStage || 0,
    raceMode: room.raceMode || 'competition',
  });

  console.log(`🏁 스테이지 ${room.gpStage || '-'} 시작! 세션 [${sessionId}] 맵=${normalizedLevel} — ${room.teams.size}팀`);

  // 이전 인터벌 정리
  clearRoomTimers(room);

  // ── 레이스 시뮬레이션 루프 (~60fps) ──
  let intervalId;
  intervalId = setInterval(() => {
    const r = rooms.get(sessionId);
    if (!r || r.racePhase !== 'racing') {
      clearInterval(intervalId);
      if (r) r.raceInterval = null;
      return;
    }
    if (r.racePaused) return;

    let allDone = true;

    for (const [teamId, ball] of Object.entries(r.raceBalls)) {
      if (ball.status !== 'racing') continue;
      allDone = false;

      const team = r.teams.get(Number(teamId) || teamId);
      const elapsed = Date.now() - r.raceStartTime;

      advanceRaceBall(ball, r.mapLevel);

      const teamLR = clampLearningRate(team?.learningRate, ball.lr);
      const teamMom = clampMomentum(team?.momentum, ball.momentum);
      const outcome = inspectRaceBall(ball, r.mapLevel, elapsed);
      if (!outcome) continue;

      ball.status = outcome.status;
      r.raceFinished[teamId] = createRaceResult({
        teamId,
        teamName: team?.name || `Team ${teamId}`,
        ball,
        level: r.mapLevel,
        timeMs: elapsed,
        status: outcome.status,
        lr: teamLR,
        momentum: teamMom,
        finalLoss: outcome.reason === 'invalid' ? NaN : ball.loss,
        distToGlobal: outcome.distToGlobal,
      });

      // 결과 알림 메시지
      if (outcome.reason === 'invalid') {
        io.to(sRoom).emit('race_alert', {
          teamId, teamName: team?.name,
          message: `공이 날아가 버렸어요! 무엇이 너무 커졌을까요? (팀: ${team?.name})`,
        });
      } else if (outcome.reason === 'boundary') {
        io.to(sRoom).emit('race_alert', {
          teamId, teamName: team?.name,
          message: `공이 맵을 벗어났어요! 어떤 파라미터를 조절하면 좋을까요? (팀: ${team?.name})`,
        });
      } else if (outcome.reason === 'timeout' && outcome.status === 'local_minimum') {
        io.to(sRoom).emit('race_alert', {
          teamId, teamName: team?.name,
          message: `시간 초과! 공이 최솟값에 도달하지 못했어요. (팀: ${team?.name})`,
        });
      } else if (outcome.reason === 'stopped' && outcome.status === 'local_minimum') {
        io.to(sRoom).emit('race_alert', {
          teamId, teamName: team?.name,
          message: `공이 멈췄어요. 정말 최솟값에 도달했을까요? (팀: ${team?.name})`,
        });
      }
    }

    io.to(sRoom).emit('race_tick', { balls: r.raceBalls });

    // ── 전체 완료 체크 ──
    const totalTeams = Object.keys(r.raceBalls).length;
    const finishedTeams = Object.keys(r.raceFinished).length;

    if (finishedTeams >= totalTeams || allDone) {
      clearInterval(r.raceInterval);
      r.raceInterval = null;

      const results = rankRaceResults(Object.values(r.raceFinished));
      r.raceResults = results;

      // ── GP 모드 ──
      if (r.gpActive && r.gpStage >= 1 && r.gpStage <= GP_STAGES.length) {
        handleGPStageComplete(io, db, sessionId, r, results);
      } else {
        // ── 일반 레이스 종료 ──
        r.racePhase = 'finished';
        io.to(sRoom).emit('race_finished', { results });
        saveResults(db, sessionId, r);
        console.log(`🏆 레이스 종료! 세션 [${sessionId}]`);
      }
    }
  }, 16); // ~60fps

  room.raceInterval = intervalId;
}

/**
 * GP 스테이지 완료 처리
 */
function handleGPStageComplete(io, db, sessionId, room, results) {
  const sRoom = sessionRoom(sessionId);
  const stageIdx = room.gpStage - 1;

  if (!room.gpStageResults) room.gpStageResults = [[], [], []];

  // 포인트 계산: 수렴한 팀만 점수, 순위 역순
  const totalTeams = room.teams.size;
  const stagePoints = results.map(res => ({
    teamId: res.teamId,
    teamName: res.teamName,
    points: res.status === 'converged' ? Math.max(0, totalTeams - res.rank + 1) : 0,
    rank: res.rank,
    finalLoss: res.finalLoss,
    cumulativeLoss: res.cumulativeLoss,
    status: res.status,
    lr: res.lr,
    momentum: res.momentum,
    distToGlobal: res.distToGlobal,
    time: res.time,
  }));
  room.gpStageResults[stageIdx] = stagePoints;

  io.to(sRoom).emit('gp_stage_complete', {
    stage: room.gpStage,
    results: stagePoints,
    allStageResults: room.gpStageResults,
  });

  // DB 저장
  saveResults(db, sessionId, room, room.gpStage);

  console.log(`🏆 GP 스테이지 ${room.gpStage}/${GP_STAGES.length} 종료! 세션 [${sessionId}]`);

  if (room.gpStage < GP_STAGES.length) {
    // ── 다음 스테이지 카운트다운 ──
    room.racePhase = 'stageResult';
    let countdown = GP_COUNTDOWN_SECONDS;
    room.gpCountdown = countdown;

    io.to(sRoom).emit('gp_countdown', { seconds: countdown, nextStage: room.gpStage + 1 });

    if (room.countdownInterval) { clearInterval(room.countdownInterval); room.countdownInterval = null; }
    room.countdownInterval = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        room.gpCountdown = countdown;
        io.to(sRoom).emit('gp_countdown', { seconds: countdown, nextStage: room.gpStage + 1 });
      } else {
        const rm = rooms.get(sessionId);
        if (rm?.countdownInterval) { clearInterval(rm.countdownInterval); rm.countdownInterval = null; }
        if (!rm || !rm.gpActive) return;
        rm.gpCountdown = 0;
        rm.gpStage++;
        const nextLevel = GP_STAGES[rm.gpStage - 1]?.mapLevel || rm.gpStage;
        startStageRace(io, db, sessionId, nextLevel);
      }
    }, 1000);
  } else {
    // ── GP 전체 종료: 종합 결과 ──
    room.racePhase = 'finished';
    const combined = {};

    for (let si = 0; si < GP_STAGES.length; si++) {
      const stageRes = room.gpStageResults[si] || [];
      for (const res of stageRes) {
        if (!combined[res.teamId]) {
          combined[res.teamId] = {
            teamId: res.teamId,
            teamName: res.teamName,
            totalPoints: 0,
            stageRanks: new Array(GP_STAGES.length).fill(0),
          };
        }
        combined[res.teamId].totalPoints += res.points || 0;
        combined[res.teamId].stageRanks[si] = res.rank;
      }
    }

    const gpFinal = Object.values(combined)
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((r, i) => ({ ...r, gpRank: i + 1 }));

    room.gpFinalResults = gpFinal;

    io.to(sRoom).emit('gp_final_results', {
      finalResults: gpFinal,
      allStageResults: room.gpStageResults,
    });

    console.log(`🏆🏆🏆 Grand Prix 종료! 세션 [${sessionId}]`, gpFinal);
  }
}

/**
 * 레이스 결과 DB 저장
 */
function saveResults(db, sessionId, room, gpStage = null) {
  if (!db || !room.raceResults || room.raceResults.length === 0) return;

  try {
    const stmt = getInsertResultStmt(db);
    const saveMany = db.transaction((results) => {
      for (const res of results) {
        stmt.run({
          sessionId,
          teamId: typeof res.teamId === 'number' ? res.teamId : null,
          mapLevel: room.mapLevel,
          mode: room.raceMode || 'competition',
          lr: res.lr ?? null,
          momentum: res.momentum ?? null,
          status: res.status,
          finishTime: res.time ?? null,
          finalLoss: isNaN(res.finalLoss) ? null : res.finalLoss ?? null,
          cumulativeLoss: res.cumulativeLoss ?? null,
          rank: res.rank ?? null,
          gpStage: gpStage,
          gpPoints: res.points ?? 0,
        });
      }
    });
    saveMany(room.raceResults);
  } catch (err) {
    console.error(`[saveResults] DB 저장 실패:`, err);
  }
}
