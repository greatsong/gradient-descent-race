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
    racePhase: 'lobby',      // lobby | ready_call | map_select | param_set | countdown | racing | results | final
    mapLevel: 2,
    raceResults: [],
    raceFinished: {},
    raceStartTime: null,
    raceInterval: null,
    countdownInterval: null,

    // 라운드 관리
    roundNumber: 0,
    roundResults: [],        // 라운드별 결과 배열: [{ roundNumber, mapLevel, results }]

    // 레디 관리
    readyTeams: new Set(),   // 레디 확인한 teamId 집합

    // 솔로 연습
    soloRaces: new Map(),    // socketId -> { interval, ball, teamId, mapLevel, startTime }
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
    room.readyTeams.delete(teamId);
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

// ── 레디 관련 헬퍼 ──

/**
 * 팀 레디 설정
 */
export function setReady(sessionId, teamId) {
  const room = rooms.get(sessionId);
  if (!room) return;
  room.readyTeams.add(teamId);
}

/**
 * 모든 팀 레디 여부
 */
export function areAllReady(sessionId) {
  const room = rooms.get(sessionId);
  if (!room || room.teams.size === 0) return false;
  for (const [teamId] of room.teams) {
    if (!room.readyTeams.has(teamId)) return false;
  }
  return true;
}

/**
 * 레디 상태 조회
 */
export function getReadyStatus(sessionId) {
  const room = rooms.get(sessionId);
  if (!room) return { readyTeams: [], totalTeams: 0 };
  return {
    readyTeams: [...room.readyTeams],
    totalTeams: room.teams.size,
  };
}

/**
 * 레디 초기화
 */
export function clearReady(sessionId) {
  const room = rooms.get(sessionId);
  if (!room) return;
  room.readyTeams.clear();
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
    results: room.raceResults,
    roundNumber: room.roundNumber,
    roundResults: room.roundResults,
    readyTeams: [...room.readyTeams],
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
    room.readyTeams.delete(teamId);
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
  // 솔로 레이스 정리
  for (const [, solo] of room.soloRaces) {
    if (solo.interval) clearInterval(solo.interval);
  }
  room.soloRaces.clear();
  rooms.delete(sessionId);
}

// Socket.IO room name helpers
export const sessionRoom = (sid) => `session:${sid}`;
export const teacherRoom = (sid) => `session:${sid}:teacher`;
