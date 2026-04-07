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
  setReady,
  areAllReady,
  getReadyStatus,
  clearReady,
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

const MAX_TEAMS_PER_SESSION = 50;
const COUNTDOWN_SECONDS = 3;

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
 * 누적 순위 계산 (1등=N점, 2등=N-1점, ...)
 */
function calculateCumulativeStandings(room) {
  const pointsMap = {}; // teamId -> { teamId, teamName, color, totalPoints, roundCount, rounds }

  for (const round of room.roundResults) {
    const totalTeams = round.results.length;
    for (const res of round.results) {
      if (!pointsMap[res.teamId]) {
        const team = room.teams.get(Number(res.teamId) || res.teamId);
        pointsMap[res.teamId] = {
          teamId: res.teamId,
          teamName: res.teamName,
          color: team?.color || '#888',
          totalPoints: 0,
          roundCount: 0,
          rounds: [],
        };
      }
      // 수렴한 팀만 점수 부여
      const points = res.status === 'converged'
        ? Math.max(1, totalTeams - res.rank + 1)
        : 0;
      pointsMap[res.teamId].totalPoints += points;
      pointsMap[res.teamId].roundCount++;
      pointsMap[res.teamId].rounds.push({
        roundNumber: round.roundNumber,
        mapLevel: round.mapLevel,
        rank: res.rank,
        points,
        status: res.status,
        time: res.time,
      });
    }
  }

  return Object.values(pointsMap)
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));
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
    // ▸ 팀(학생) 입장
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

      const room = getRoom(sessionId);
      if (room.teams.has(teamId)) {
        // 재접속: socketId 갱신
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
      if (room.raceBalls[teamId] && room.racePhase === 'racing') {
        socket.emit('race_tick', { balls: room.raceBalls });
      }

      // 전체 상태 전송
      socket.emit('room_state', getRoomState(sessionId));

      // 교사 + 전체에게 팀 입장 알림
      const teamInfo = room.teams.get(teamId);
      io.to(sessionRoom(sessionId)).emit('team_joined', {
        teamId,
        teamName: teamInfo.name,
        color: teamInfo.color,
        teamCount: room.teams.size,
      });

      broadcastRoomUpdate(io, sessionId);
    }));

    // ──────────────────────────────
    // ▸ 교사: "준비하세요!" 호출
    // ──────────────────────────────
    socket.on('call_ready', safeHandler('call_ready', () => {
      if (!currentSession) return;
      const room = rooms.get(currentSession);
      if (!room || !isTeacher(socket.id, currentSession)) return;

      clearReady(currentSession);
      room.racePhase = 'ready_call';

      io.to(sessionRoom(currentSession)).emit('phase_changed', {
        phase: 'ready_call',
        mapLevel: room.mapLevel,
      });

      io.to(sessionRoom(currentSession)).emit('ready_update', getReadyStatus(currentSession));

      console.log(`📢 교사: "준비하세요!" → 세션 [${currentSession}]`);
    }));

    // ──────────────────────────────
    // ▸ 학생: 레디 확인
    // ──────────────────────────────
    socket.on('set_ready', safeHandler('set_ready', () => {
      if (!currentSession || !currentTeamId) return;
      const room = rooms.get(currentSession);
      if (!room) return;

      setReady(currentSession, currentTeamId);

      const status = getReadyStatus(currentSession);
      io.to(sessionRoom(currentSession)).emit('ready_update', status);

      const team = room.teams.get(currentTeamId);
      console.log(`✅ 팀 [${team?.name}] 레디! (${status.readyTeams.length}/${status.totalTeams})`);

      // 모두 레디면 교사에게 알림
      if (areAllReady(currentSession)) {
        io.to(teacherRoom(currentSession)).emit('all_ready', { message: '모든 팀이 준비 완료!' });
      }
    }));

    // ──────────────────────────────
    // ▸ 교사: 맵 선택
    // ──────────────────────────────
    socket.on('select_map', safeHandler('select_map', (payload) => {
      if (!currentSession) return;
      const room = rooms.get(currentSession);
      if (!room || !isTeacher(socket.id, currentSession)) return;

      if (room.racePhase === 'racing') {
        socket.emit('error_msg', { message: '레이스 중에는 맵을 변경할 수 없습니다.' });
        return;
      }

      const level = normalizeMapLevel(payload?.mapLevel ?? payload?.level, room.mapLevel);
      room.mapLevel = level;
      room.racePhase = 'map_select';

      // 모든 클라이언트에게 맵 변경 알림 (교사 화면 포함)
      io.to(sessionRoom(currentSession)).emit('map_changed', { mapLevel: level });
      io.to(sessionRoom(currentSession)).emit('phase_changed', {
        phase: 'map_select',
        mapLevel: level,
      });

      console.log(`🗺️ 교사 맵 선택: Level ${level} 세션 [${currentSession}]`);
    }));

    // ──────────────────────────────
    // ▸ 교사: 파라미터 세팅 시간 (map_select → param_set)
    // ──────────────────────────────
    socket.on('go_to_param_set', safeHandler('go_to_param_set', () => {
      if (!currentSession) return;
      const room = rooms.get(currentSession);
      if (!room || !isTeacher(socket.id, currentSession)) return;

      room.racePhase = 'param_set';
      io.to(sessionRoom(currentSession)).emit('phase_changed', {
        phase: 'param_set',
        mapLevel: room.mapLevel,
      });
      console.log(`⚙️ 파라미터 세팅 시간! 세션 [${currentSession}]`);
    }));

    // ──────────────────────────────
    // ▸ 학생: 파라미터 설정 (LR + 모멘텀)
    // ──────────────────────────────
    socket.on('set_params', safeHandler('set_params', (payload) => {
      if (!currentSession || !currentTeamId) return;
      const room = rooms.get(currentSession);
      if (!room) return;

      const team = room.teams.get(currentTeamId);
      if (!team) return;

      const learningRate = clampLearningRate(payload.learningRate ?? payload.lr, team.learningRate);
      const momentum = clampMomentum(payload.momentum, team.momentum);

      team.learningRate = learningRate;
      team.momentum = momentum;
      team.paramsConfirmed = true;

      console.log(`🏎️ 팀 [${team.name}] 파라미터: lr=${learningRate}, m=${momentum}`);

      // 레이스 진행 중이면 공의 파라미터도 즉시 업데이트
      const ball = room.raceBalls[currentTeamId];
      if (ball && ball.status === 'racing') {
        ball.lr = learningRate;
        ball.momentum = momentum;
      }

      // 파라미터 변경 브로드캐스트
      io.to(sessionRoom(currentSession)).emit('race_teams_updated', {
        teams: serializeTeams(room),
      });
    }));

    // 이전 이벤트명 호환
    socket.on('set_race_params', safeHandler('set_race_params', (payload) => {
      socket.emit('set_params', payload);
      // 직접 처리
      if (!currentSession || !currentTeamId) return;
      const room = rooms.get(currentSession);
      if (!room) return;
      const team = room.teams.get(currentTeamId);
      if (!team) return;

      const learningRate = clampLearningRate(payload.learningRate ?? payload.lr, team.learningRate);
      const momentum = clampMomentum(payload.momentum, team.momentum);
      team.learningRate = learningRate;
      team.momentum = momentum;
      team.paramsConfirmed = true;

      const ball = room.raceBalls[currentTeamId];
      if (ball && ball.status === 'racing') {
        ball.lr = learningRate;
        ball.momentum = momentum;
      }
      io.to(sessionRoom(currentSession)).emit('race_teams_updated', {
        teams: serializeTeams(room),
      });
    }));

    // ──────────────────────────────
    // ▸ 교사: 레이스 시작 (카운트다운 → 레이스)
    // ──────────────────────────────
    socket.on('start_race', safeHandler('start_race', () => {
      if (!currentSession) return;
      const room = rooms.get(currentSession);
      if (!room || !isTeacher(socket.id, currentSession)) return;
      if (room.teams.size === 0) return;

      const level = normalizeMapLevel(room.mapLevel, 2);
      room.mapLevel = level;

      // 라운드 번호 증가
      room.roundNumber++;

      console.log(`🏁 레이스 시작 요청! 세션 [${currentSession}] 라운드 ${room.roundNumber} 맵=${level}`);

      // 카운트다운 시작
      room.racePhase = 'countdown';
      clearRoomTimers(room);

      // 공 초기화 (카운트다운 동안 미리 준비)
      room.raceBalls = {};
      room.raceFinished = {};
      room.raceResults = [];

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

      io.to(sessionRoom(currentSession)).emit('phase_changed', {
        phase: 'countdown',
        mapLevel: level,
        roundNumber: room.roundNumber,
      });

      let countdown = COUNTDOWN_SECONDS;
      io.to(sessionRoom(currentSession)).emit('countdown', { seconds: countdown });

      room.countdownInterval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
          io.to(sessionRoom(currentSession)).emit('countdown', { seconds: countdown });
        } else {
          // 카운트다운 종료 → 레이스 시작
          clearInterval(room.countdownInterval);
          room.countdownInterval = null;

          const r = rooms.get(currentSession);
          if (!r) return;

          startRace(io, db, currentSession);
        }
      }, 1000);
    }));

    // ──────────────────────────────
    // ▸ 교사: 레이스 정지
    // ──────────────────────────────
    socket.on('stop_race', safeHandler('stop_race', () => {
      if (!currentSession) return;
      const room = rooms.get(currentSession);
      if (!room) return;
      if (!isTeacher(socket.id, currentSession)) {
        socket.emit('error_msg', { message: '레이스 정지는 교사만 가능합니다.' });
        return;
      }

      // 카운트다운 중이면 취소
      if (room.racePhase === 'countdown') {
        clearRoomTimers(room);
        room.racePhase = 'map_select';
        room.roundNumber = Math.max(0, room.roundNumber - 1); // 카운트다운 취소 시 라운드 롤백
        io.to(sessionRoom(currentSession)).emit('phase_changed', {
          phase: 'map_select',
          mapLevel: room.mapLevel,
        });
        console.log(`⏹️ 카운트다운 취소! 세션 [${currentSession}]`);
        return;
      }

      if (room.racePhase !== 'racing') return;

      // 아직 달리는 공 강제 종료
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

      clearRoomTimers(room);
      finishRace(io, db, currentSession);
      console.log(`🛑 레이스 정지! 세션 [${currentSession}]`);
    }));

    // ──────────────────────────────
    // ▸ 교사: 최종 완료 (누적 순위)
    // ──────────────────────────────
    socket.on('finish_all', safeHandler('finish_all', () => {
      if (!currentSession) return;
      const room = rooms.get(currentSession);
      if (!room || !isTeacher(socket.id, currentSession)) return;

      room.racePhase = 'final';
      clearRoomTimers(room);

      const standings = calculateCumulativeStandings(room);

      io.to(sessionRoom(currentSession)).emit('phase_changed', { phase: 'final' });
      io.to(sessionRoom(currentSession)).emit('final_results', { standings });

      console.log(`🏆🏆🏆 최종 완료! 세션 [${currentSession}] ${room.roundResults.length}라운드 종합`);
    }));

    // ──────────────────────────────
    // ▸ 교사: 로비로 복귀
    // ──────────────────────────────
    socket.on('reset_to_lobby', safeHandler('reset_to_lobby', () => {
      if (!currentSession) return;
      const room = rooms.get(currentSession);
      if (!room || !isTeacher(socket.id, currentSession)) return;

      clearRoomTimers(room);

      room.racePhase = 'lobby';
      room.raceBalls = {};
      room.raceFinished = {};
      room.raceResults = [];
      room.roundNumber = 0;
      room.roundResults = [];
      clearReady(currentSession);

      // 팀 파라미터 초기화
      for (const [, team] of room.teams) {
        team.paramsConfirmed = false;
      }

      io.to(sessionRoom(currentSession)).emit('phase_changed', { phase: 'lobby', mapLevel: room.mapLevel });
      broadcastRoomUpdate(io, currentSession);

      console.log(`🔄 로비 복귀! 세션 [${currentSession}]`);
    }));

    // ──────────────────────────────
    // ▸ 이전 호환: reset_race → reset_to_lobby
    // ──────────────────────────────
    socket.on('reset_race', safeHandler('reset_race', () => {
      if (!currentSession) return;
      const room = rooms.get(currentSession);
      if (!room) return;
      if (!isTeacher(socket.id, currentSession)) return;

      clearRoomTimers(room);
      room.racePhase = 'lobby';
      room.raceBalls = {};
      room.raceFinished = {};
      room.raceResults = [];
      room.roundNumber = 0;
      room.roundResults = [];
      clearReady(currentSession);

      io.to(sessionRoom(currentSession)).emit('phase_changed', { phase: 'lobby', mapLevel: room.mapLevel });
      io.to(sessionRoom(currentSession)).emit('race_reset', { teams: serializeTeams(room) });
      console.log(`🔄 레이스 리셋! 세션 [${currentSession}]`);
    }));

    // ──────────────────────────────
    // ▸ 이전 호환: teacher_set_map → select_map
    // ──────────────────────────────
    socket.on('teacher_set_map', safeHandler('teacher_set_map', (payload) => {
      if (!currentSession) return;
      const room = rooms.get(currentSession);
      if (!room || !isTeacher(socket.id, currentSession)) return;
      if (room.racePhase === 'racing') {
        socket.emit('error_msg', { message: '레이스 중에는 맵을 변경할 수 없습니다.' });
        return;
      }
      const level = normalizeMapLevel(payload?.mapLevel ?? payload?.level, room.mapLevel);
      room.mapLevel = level;
      io.to(sessionRoom(currentSession)).emit('map_changed', { mapLevel: level });
    }));

    // ──────────────────────────────
    // ▸ 솔로 연습 시작
    // ──────────────────────────────
    socket.on('start_solo', safeHandler('start_solo', (payload) => {
      if (!currentSession || !currentTeamId) return;
      const room = rooms.get(currentSession);
      if (!room) return;

      // 솔로는 lobby 페이즈에서만 가능
      if (room.racePhase !== 'lobby') {
        socket.emit('error_msg', { message: '로비에서만 솔로 연습을 할 수 있습니다.' });
        return;
      }

      // 이미 솔로 중이면 중지
      const existing = room.soloRaces.get(socket.id);
      if (existing) {
        clearInterval(existing.interval);
        room.soloRaces.delete(socket.id);
      }

      const team = room.teams.get(currentTeamId);
      if (!team) return;

      const level = normalizeMapLevel(payload?.mapLevel ?? payload?.level, room.mapLevel);
      const position = getRandomizedStartPosition(level);
      const ball = createRaceBall({
        level,
        x: position.x,
        z: position.z,
        lr: team.learningRate || 0.1,
        momentum: team.momentum || 0.9,
        status: 'racing',
      });

      const soloStartTime = Date.now();
      const soloBalls = { [currentTeamId]: ball };

      // 솔로 시뮬레이션 인터벌
      const soloInterval = setInterval(() => {
        if (ball.status !== 'racing') {
          clearInterval(soloInterval);
          room.soloRaces.delete(socket.id);

          const elapsed = Date.now() - soloStartTime;
          const result = createRaceResult({
            teamId: currentTeamId,
            teamName: team.name,
            ball,
            level,
            timeMs: elapsed,
            status: ball.status,
            lr: team.learningRate,
            momentum: team.momentum,
          });

          socket.emit('solo_finished', { results: [{ ...result, rank: 1 }] });
          return;
        }

        advanceRaceBall(ball, level);

        const elapsed = Date.now() - soloStartTime;
        const outcome = inspectRaceBall(ball, level, elapsed);
        if (outcome) {
          ball.status = outcome.status;
        }

        socket.emit('solo_tick', { balls: soloBalls });
      }, 16);

      room.soloRaces.set(socket.id, {
        interval: soloInterval,
        ball,
        teamId: currentTeamId,
        mapLevel: level,
        startTime: soloStartTime,
      });

      socket.emit('solo_started', {
        balls: soloBalls,
        mapLevel: level,
        teamId: currentTeamId,
      });

      console.log(`🎮 솔로 연습 시작! 팀 [${team.name}] 맵=${level}`);
    }));

    // ──────────────────────────────
    // ▸ 솔로 연습 정지
    // ──────────────────────────────
    socket.on('stop_solo', safeHandler('stop_solo', () => {
      if (!currentSession) return;
      const room = rooms.get(currentSession);
      if (!room) return;

      const solo = room.soloRaces.get(socket.id);
      if (!solo) return;

      clearInterval(solo.interval);

      const team = room.teams.get(solo.teamId);
      const elapsed = Date.now() - solo.startTime;

      // 정지 시점 결과 생성
      if (solo.ball.status === 'racing') {
        const outcome = inspectRaceBall(solo.ball, solo.mapLevel, Number.POSITIVE_INFINITY);
        if (outcome) {
          solo.ball.status = outcome.status;
        } else {
          solo.ball.status = 'local_minimum';
        }
      }

      const result = createRaceResult({
        teamId: solo.teamId,
        teamName: team?.name || `Team ${solo.teamId}`,
        ball: solo.ball,
        level: solo.mapLevel,
        timeMs: elapsed,
        status: solo.ball.status,
        lr: team?.learningRate || solo.ball.lr,
        momentum: team?.momentum || solo.ball.momentum,
      });

      room.soloRaces.delete(socket.id);

      socket.emit('solo_finished', { results: [{ ...result, rank: 1 }] });

      console.log(`⏹️ 솔로 연습 정지! 팀 [${team?.name}]`);
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

      // 솔로 레이스 정리
      const solo = room.soloRaces.get(socket.id);
      if (solo) {
        clearInterval(solo.interval);
        room.soloRaces.delete(socket.id);
      }

      // 팀 연결 해제 처리
      if (currentTeamId && room.teams.has(currentTeamId)) {
        const team = room.teams.get(currentTeamId);
        console.log(`💫 팀 [${team.name}] 연결 해제 (세션 [${currentSession}])`);

        // lobby에서만 팀 제거 (레이스 중이면 유지)
        if (room.racePhase === 'lobby') {
          removeTeamFromRoom(currentSession, currentTeamId);
        }

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
// ▸ 내부 함수: 레이스 실행
// ═══════════════════════════════════════════════

/**
 * 레이스 시작 (카운트다운 완료 후 호출)
 */
function startRace(io, db, sessionId) {
  const room = rooms.get(sessionId);
  if (!room) return;
  if (room.teams.size === 0) return;

  const level = room.mapLevel;

  // 공 상태를 racing으로 전환
  for (const [teamId, ball] of Object.entries(room.raceBalls)) {
    ball.status = 'racing';
  }

  room.racePhase = 'racing';
  room.raceStartTime = Date.now();
  room.raceFinished = {};
  room.raceResults = [];

  const sRoom = sessionRoom(sessionId);

  io.to(sRoom).emit('phase_changed', {
    phase: 'racing',
    mapLevel: level,
    roundNumber: room.roundNumber,
  });

  io.to(sRoom).emit('race_started', {
    balls: room.raceBalls,
    teams: serializeTeams(room),
    mapLevel: level,
    roundNumber: room.roundNumber,
  });

  console.log(`🏁 레이스 시작! 세션 [${sessionId}] 라운드 ${room.roundNumber} 맵=${level} — ${room.teams.size}팀`);

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

    let allDone = true;

    for (const [teamId, ball] of Object.entries(r.raceBalls)) {
      if (ball.status !== 'racing') continue;
      allDone = false;

      const team = r.teams.get(Number(teamId) || teamId);
      const elapsed = Date.now() - r.raceStartTime;

      advanceRaceBall(ball, r.mapLevel);

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
        lr: team?.learningRate || ball.lr,
        momentum: team?.momentum || ball.momentum,
        finalLoss: outcome.reason === 'invalid' ? NaN : ball.loss,
        distToGlobal: outcome.distToGlobal,
      });

      // 결과 알림 메시지
      if (outcome.reason === 'invalid') {
        io.to(sRoom).emit('race_alert', {
          teamId, teamName: team?.name,
          message: `공이 날아가 버렸어요! (팀: ${team?.name})`,
        });
      } else if (outcome.reason === 'boundary') {
        io.to(sRoom).emit('race_alert', {
          teamId, teamName: team?.name,
          message: `공이 맵을 벗어났어요! (팀: ${team?.name})`,
        });
      } else if (outcome.reason === 'timeout' && outcome.status === 'local_minimum') {
        io.to(sRoom).emit('race_alert', {
          teamId, teamName: team?.name,
          message: `시간 초과! (팀: ${team?.name})`,
        });
      } else if (outcome.reason === 'stopped' && outcome.status === 'local_minimum') {
        io.to(sRoom).emit('race_alert', {
          teamId, teamName: team?.name,
          message: `공이 멈췄어요. 정말 최솟값에 도달했을까요? (팀: ${team?.name})`,
        });
      }
    }

    // 교사 + 학생 모두에게 tick 전송
    io.to(sRoom).emit('race_tick', { balls: r.raceBalls });

    // ── 전체 완료 체크 ──
    const totalTeams = Object.keys(r.raceBalls).length;
    const finishedTeams = Object.keys(r.raceFinished).length;

    if (finishedTeams >= totalTeams || allDone) {
      clearInterval(r.raceInterval);
      r.raceInterval = null;
      finishRace(io, db, sessionId);
    }
  }, 16); // ~60fps

  room.raceInterval = intervalId;
}

/**
 * 레이스 종료 처리 (자연 종료 또는 강제 정지)
 */
function finishRace(io, db, sessionId) {
  const room = rooms.get(sessionId);
  if (!room) return;

  clearRoomTimers(room);

  const results = rankRaceResults(Object.values(room.raceFinished));
  room.raceResults = results;
  room.racePhase = 'results';

  // 라운드 결과 저장
  const roundData = {
    roundNumber: room.roundNumber,
    mapLevel: room.mapLevel,
    results: results.map(r => ({
      teamId: r.teamId,
      teamName: r.teamName,
      lr: r.lr,
      momentum: r.momentum,
      status: r.status,
      time: r.time,
      finalLoss: r.finalLoss,
      cumulativeLoss: r.cumulativeLoss,
      rank: r.rank,
      distToGlobal: r.distToGlobal,
    })),
  };
  room.roundResults.push(roundData);

  // 누적 순위 계산
  const cumulativeStandings = calculateCumulativeStandings(room);

  const sRoom = sessionRoom(sessionId);

  io.to(sRoom).emit('phase_changed', {
    phase: 'results',
    mapLevel: room.mapLevel,
    roundNumber: room.roundNumber,
  });

  io.to(sRoom).emit('race_finished', {
    results,
    roundNumber: room.roundNumber,
    mapLevel: room.mapLevel,
  });

  io.to(sRoom).emit('round_results', {
    roundNumber: room.roundNumber,
    results: roundData.results,
    cumulativeStandings,
  });

  // DB 저장
  saveResults(db, sessionId, room);

  console.log(`🏆 라운드 ${room.roundNumber} 종료! 세션 [${sessionId}] (누적 ${room.roundResults.length}라운드)`);
}

/**
 * 레이스 결과 DB 저장
 */
function saveResults(db, sessionId, room) {
  if (!db || !room.raceResults || room.raceResults.length === 0) return;

  try {
    const stmt = getInsertResultStmt(db);
    const saveMany = db.transaction((results) => {
      for (const res of results) {
        stmt.run({
          sessionId,
          teamId: typeof res.teamId === 'number' ? res.teamId : null,
          mapLevel: room.mapLevel,
          mode: 'competition',
          lr: res.lr ?? null,
          momentum: res.momentum ?? null,
          status: res.status,
          finishTime: res.time ?? null,
          finalLoss: isNaN(res.finalLoss) ? null : res.finalLoss ?? null,
          cumulativeLoss: res.cumulativeLoss ?? null,
          rank: res.rank ?? null,
          gpStage: room.roundNumber || null,
          gpPoints: 0,
        });
      }
    });
    saveMany(room.raceResults);
  } catch (err) {
    console.error(`[saveResults] DB 저장 실패:`, err);
  }
}
