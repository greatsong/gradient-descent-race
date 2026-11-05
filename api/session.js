import { Router } from 'express';
import { nanoid } from 'nanoid';
import { createRandomToken, isTeacherToken, joinCodeLimiter, maskName, requireTeacher } from '../backend/auth.js';

const router = Router();

const TEAM_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6',
  '#6366f1', '#a855f7', '#d946ef', '#0ea5e9', '#84cc16',
];

const MAX_TEAMS_PER_SESSION = 60;
const MAX_MEMBERS_PER_TEAM = 8;
const MAX_NAME_LENGTH = 30;

const TEAM_COLUMNS = 'id, session_id, name, members, color, created_at';

// 실명은 교사에게만 보낸다. 세션 코드만 아는 사람에게는 가린 이름을 보낸다
function teamsForViewer(req, sessionId) {
  const showNames = isTeacherToken(req.db, req.get('x-teacher-token'));
  const teams = req.db.prepare(`SELECT ${TEAM_COLUMNS} FROM teams WHERE session_id = ?`).all(sessionId);
  return teams.map((team) => {
    const members = JSON.parse(team.members || '[]');
    return { ...team, members: showNames ? members : members.map(maskName) };
  });
}

function parseMembers(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_MEMBERS_PER_TEAM) return null;
  const members = value.map((member) => (typeof member === 'string' ? member.trim() : ''));
  return members.every((member) => member && member.length <= MAX_NAME_LENGTH) ? members : null;
}

function sendServerError(res, err) {
  console.error('[session]', err.message);
  res.status(500).json({ error: '처리 중 오류가 발생했습니다' });
}

// 세션 생성 (교사 전용)
router.post('/create', requireTeacher, (req, res) => {
  try {
    const id = nanoid(8).toUpperCase();
    const teacherCode = nanoid(6);
    req.db.prepare('INSERT INTO sessions (id, teacher_code) VALUES (?, ?)').run(id, teacherCode);
    res.json({ sessionId: id, teacherCode });
  } catch (err) {
    sendServerError(res, err);
  }
});

// 세션 조회 — 학생이 입력한 코드를 확인하는 경로다. 없는 코드를 계속 넣으면 막는다
router.get('/:sessionId', (req, res) => {
  try {
    if (joinCodeLimiter.blocked(req.ip)) {
      return res.status(429).json({ error: '코드 입력 실패가 너무 많습니다. 10분 뒤 다시 시도하세요' });
    }
    const session = req.db.prepare('SELECT id, status, created_at FROM sessions WHERE id = ?').get(req.params.sessionId);
    if (!session) {
      joinCodeLimiter.record(req.ip);
      return res.status(404).json({ error: '세션을 찾을 수 없습니다' });
    }
    res.json({ ...session, teams: teamsForViewer(req, session.id) });
  } catch (err) {
    sendServerError(res, err);
  }
});

// 팀 등록 — 응답의 teamToken은 이 팀만 받는다. 소켓 입장에서 확인한다
router.post('/:sessionId/teams', (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const members = parseMembers(req.body?.members);
    if (!name || name.length > MAX_NAME_LENGTH) return res.status(400).json({ error: '팀 이름을 입력하세요' });
    if (!members) return res.status(400).json({ error: '팀원 이름을 확인하세요' });
    const session = req.db.prepare('SELECT id FROM sessions WHERE id = ?').get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: '세션을 찾을 수 없습니다' });
    const existingTeams = req.db.prepare('SELECT COUNT(*) as cnt FROM teams WHERE session_id = ?').get(req.params.sessionId);
    if (existingTeams.cnt >= MAX_TEAMS_PER_SESSION) return res.status(409).json({ error: '팀 수가 너무 많습니다' });
    const colorIndex = existingTeams.cnt % TEAM_COLORS.length;
    const teamToken = createRandomToken();
    const result = req.db.prepare(
      'INSERT INTO teams (session_id, name, members, color, access_token) VALUES (?, ?, ?, ?, ?)'
    ).run(req.params.sessionId, name, JSON.stringify(members), TEAM_COLORS[colorIndex], teamToken);
    const team = req.db.prepare(`SELECT ${TEAM_COLUMNS} FROM teams WHERE id = ?`).get(result.lastInsertRowid);
    res.json({ ...team, members, teamToken });
  } catch (err) {
    sendServerError(res, err);
  }
});

// 팀 목록
router.get('/:sessionId/teams', (req, res) => {
  try {
    res.json(teamsForViewer(req, req.params.sessionId));
  } catch (err) {
    sendServerError(res, err);
  }
});

export default router;
