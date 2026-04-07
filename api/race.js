import { Router } from 'express';

const router = Router();

// 레이스 결과 저장
router.post('/results', (req, res) => {
  try {
    const { sessionId, results, mode, mapLevel, gpStage } = req.body;
    const stmt = req.db.prepare(`
      INSERT INTO race_results (session_id, team_id, map_level, mode, learning_rate, momentum, status, finish_time, final_loss, cumulative_loss, rank, gp_stage, gp_points)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insert = req.db.transaction((rows) => {
      for (const r of rows) {
        stmt.run(
          sessionId, r.teamId, mapLevel, mode,
          r.lr, r.momentum, r.status, r.time,
          r.finalLoss, r.cumulativeLoss, r.rank,
          gpStage || null, r.gpPoints || 0
        );
      }
    });
    insert(results);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 레이스 결과 조회
router.get('/results/:sessionId', (req, res) => {
  try {
    const results = req.db.prepare(
      'SELECT r.*, t.name as team_name FROM race_results r JOIN teams t ON r.team_id = t.id WHERE r.session_id = ? ORDER BY r.created_at DESC'
    ).all(req.params.sessionId);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
