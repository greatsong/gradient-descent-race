// 수업 기록 보존 기간. RACE_RETENTION_DAYS를 설정했을 때만 동작한다 (기본은 삭제하지 않음).
// 만든 지 N일이 지난 세션의 팀 이름·팀원 이름·레이스 결과를 지운다.
const DAY_MS = 24 * 60 * 60 * 1000;

export function purgeExpiredSessions(db, days) {
  // 1일 미만은 받지 않는다. 0.5를 내림하면 "-0 days"가 되어 모든 세션이 지워진다
  if (!Number.isFinite(days) || days < 1) return 0;
  const expired = db.prepare("SELECT id FROM sessions WHERE created_at < datetime('now', ?)").all(`-${Math.floor(days)} days`);
  const purge = db.transaction((sessionId) => {
    db.prepare('DELETE FROM race_results WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM teams WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  });
  for (const { id } of expired) purge(id);
  return expired.length;
}

export function startRetentionJob(db) {
  const days = Number(process.env.RACE_RETENTION_DAYS);
  if (!days) return;
  const run = () => {
    try {
      const count = purgeExpiredSessions(db, days);
      if (count) console.log(`[retention] ${days}일이 지난 수업 ${count}개의 기록을 삭제했습니다`);
    } catch (err) {
      console.error('[retention] 삭제 실패:', err.message);
    }
  };
  run();
  setInterval(run, DAY_MS).unref();
}
