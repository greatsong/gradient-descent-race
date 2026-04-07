import { Router } from 'express';
import { nanoid } from 'nanoid';

const router = Router();

const TEAM_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6',
  '#6366f1', '#a855f7', '#d946ef', '#0ea5e9', '#84cc16',
];

// 세션 생성
router.post('/create', (req, res) => {
  try {
    const id = nanoid(8).toUpperCase();
    const teacherCode = nanoid(6);
    req.db.prepare('INSERT INTO sessions (id, teacher_code) VALUES (?, ?)').run(id, teacherCode);
    res.json({ sessionId: id, teacherCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 세션 조회
router.get('/:sessionId', (req, res) => {
  try {
    const session = req.db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: '세션을 찾을 수 없습니다' });
    const teams = req.db.prepare('SELECT * FROM teams WHERE session_id = ?').all(req.params.sessionId);
    teams.forEach(t => { t.members = JSON.parse(t.members || '[]'); });
    res.json({ ...session, teams });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 팀 등록
router.post('/:sessionId/teams', (req, res) => {
  try {
    const { name, members } = req.body;
    if (!name) return res.status(400).json({ error: '팀 이름을 입력하세요' });
    const session = req.db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: '세션을 찾을 수 없습니다' });
    const existingTeams = req.db.prepare('SELECT COUNT(*) as cnt FROM teams WHERE session_id = ?').get(req.params.sessionId);
    const colorIndex = existingTeams.cnt % TEAM_COLORS.length;
    const result = req.db.prepare(
      'INSERT INTO teams (session_id, name, members, color) VALUES (?, ?, ?, ?)'
    ).run(req.params.sessionId, name, JSON.stringify(members || []), TEAM_COLORS[colorIndex]);
    const team = req.db.prepare('SELECT * FROM teams WHERE id = ?').get(result.lastInsertRowid);
    team.members = JSON.parse(team.members || '[]');
    res.json(team);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 팀 목록
router.get('/:sessionId/teams', (req, res) => {
  try {
    const teams = req.db.prepare('SELECT * FROM teams WHERE session_id = ?').all(req.params.sessionId);
    teams.forEach(t => { t.members = JSON.parse(t.members || '[]'); });
    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
