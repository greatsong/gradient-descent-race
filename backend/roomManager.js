// ── 세션 기반 방(Room) 관리 ──
// Socket.IO room = `session:${sessionId}`, 교사 = `session:${sessionId}:teacher`

export const rooms = new Map(); // sessionId -> RoomState

/**
 * 세션 방 가져오기 (없으면 생성)
 */
export function getRoom(sessionId) {
  if (!rooms.has(sessionId)) {
    createRoom(sessionId);
  }
  return rooms.get(sessionId);
}

/**
 * 새 세션 방 생성
 */
export function createRoom(sessionId) {
  const room = {
    sessionId,
    teams: new Map(),        // teamId (DB PK) -> teamInfo
    teacherId: null,         // 교사 socketId
    raceBalls: {},           // teamId -> ball state
    racePhase: 'setup',      // setup | preparing | racing | stageResult | finished
    mapLevel: 2,
    raceMode: 'competition', // competition | practice
    raceResults: [],
    raceFinished: {},
    raceStartTime: null,
    raceInterval: null,
    countdownInterval: null,
    racePaused: false,
    // GP state
    gpActive: false,
    gpStage: 0,
    gpStageResults: [[], [], []],
    gpFinalResults: [],
    gpCountdown: 0,
  };
  rooms.set(sessionId, room);
  return room;
}

/**
 * 팀 추가
 */
export function addTeamToRoom(sessionId, teamId, teamInfo) {
  const room = getRoom(sessionId);
  room.teams.set(teamId, {
    id: teamId,
    socketId: teamInfo.socketId,
    name: teamInfo.name || `Team ${teamId}`,
    members: teamInfo.members || '[]',
    color: teamInfo.color || `hsl(${Math.floor(Math.random() * 360)}, 80%, 60%)`,
    learningRate: 0.1,
    momentum: 0.9,
    paramsConfirmed: false,
    joinedAt: Date.now(),
  });
  return room.teams.get(teamId);
}

/**
 * 팀 제거
 */
export function removeTeamFromRoom(sessionId, teamId) {
  const room = rooms.get(sessionId);
  if (!room) return false;
  const deleted = room.teams.delete(teamId);
  if (deleted) {
    delete room.raceBalls[teamId];
    delete room.raceFinished[teamId];
  }
  return deleted;
}

/**
 * socketId로 팀 찾기
 */
export function findTeamBySocket(sessionId, socketId) {
  const room = rooms.get(sessionId);
  if (!room) return null;
  for (const [teamId, team] of room.teams) {
    if (team.socketId === socketId) return { teamId, team };
  }
  return null;
}

/**
 * 교사 여부 확인
 */
export function isTeacher(socketId, sessionId) {
  const room = rooms.get(sessionId);
  return room && room.teacherId === socketId;
}

/**
 * 직렬화된 방 상태 (클라이언트 전송용)
 */
export function getRoomState(sessionId) {
  const room = getRoom(sessionId);
  const teamList = {};
  for (const [teamId, team] of room.teams) {
    teamList[teamId] = {
      id: team.id,
      name: team.name,
      members: team.members,
      color: team.color,
      learningRate: team.learningRate,
      momentum: team.momentum,
      paramsConfirmed: team.paramsConfirmed,
    };
  }

  return {
    sessionId,
    teams: teamList,
    teamCount: room.teams.size,
    racePhase: room.racePhase,
    raceBalls: room.raceBalls,
    mapLevel: room.mapLevel,
    raceMode: room.raceMode,
    results: room.raceResults,
    gpActive: room.gpActive,
    gpStage: room.gpStage,
    gpStageResults: room.gpStageResults,
    gpFinalResults: room.gpFinalResults,
    gpCountdown: room.gpCountdown,
  };
}

/**
 * 방 업데이트 브로드캐스트
 */
export function broadcastRoomUpdate(io, sessionId) {
  const state = getRoomState(sessionId);
  const socketRoom = `session:${sessionId}`;
  io.to(socketRoom).emit('room_update', state);
}

/**
 * 연결 끊긴 팀 정리 (활성 소켓만 유지)
 */
export function pruneDisconnectedTeams(room, activeSocketIds) {
  let changed = false;
  for (const [teamId, team] of room.teams) {
    if (activeSocketIds.has(team.socketId)) continue;
    room.teams.delete(teamId);
    delete room.raceBalls[teamId];
    delete room.raceFinished[teamId];
    changed = true;
  }
  return changed;
}

/**
 * 빈 방 삭제
 */
export function cleanupRoom(sessionId) {
  const room = rooms.get(sessionId);
  if (!room) return;
  if (room.raceInterval) { clearInterval(room.raceInterval); room.raceInterval = null; }
  if (room.countdownInterval) { clearInterval(room.countdownInterval); room.countdownInterval = null; }
  rooms.delete(sessionId);
}

// Socket.IO room name helpers
export const sessionRoom = (sid) => `session:${sid}`;
export const teacherRoom = (sid) => `session:${sid}:teacher`;
