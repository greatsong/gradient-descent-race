import { Router } from 'express';

const router = Router();

// 대시보드 통계
router.get('/:sessionId', (req, res) => {
  try {
    const teams = req.db.prepare('SELECT * FROM teams WHERE session_id = ?').all(req.params.sessionId);
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
    res.status(500).json({ error: err.message });
  }
});

export default router;
