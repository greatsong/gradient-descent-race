import { Router } from 'express';
import { requireTeacher } from '../backend/auth.js';

const router = Router();

// 대시보드 통계
router.get('/:sessionId', requireTeacher, (req, res) => {
  try {
    const teams = req.db.prepare('SELECT id, session_id, name, members, color, created_at FROM teams WHERE session_id = ?').all(req.params.sessionId);
    teams.forEach(t => { t.members = JSON.parse(t.members || '[]'); });
    const raceCount = req.db.prepare(
      'SELECT COUNT(DISTINCT created_at) as cnt FROM race_results WHERE session_id = ?'
    ).get(req.params.sessionId);
    const bestResults = req.db.prepare(`
      SELECT t.name, r.map_level, r.status, r.finish_time, r.final_loss, r.rank
      FROM race_results r JOIN teams t ON r.team_id = t.id
      WHERE r.session_id = ? AND r.status = 'converged'
      ORDER BY r.finish_time ASC LIMIT 10
    `).all(req.params.sessionId);
    res.json({ teams, raceCount: raceCount.cnt, bestResults });
  } catch (err) {
    console.error('[dashboard]', err.message);
    res.status(500).json({ error: '처리 중 오류가 발생했습니다' });
  }
});

export default router;
