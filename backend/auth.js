// 교사 인증과 시도 횟수 제한.
// 학생은 로그인 없이 수업 코드(세션 id)로 들어오고, 교사 기능만 PIN으로 받은 토큰을 요구한다.
import crypto from 'crypto';

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const PIN_FAIL_LIMIT = 30;
const CODE_FAIL_LIMIT = Number(process.env.JOIN_CODE_FAIL_LIMIT) || 60;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest();
const tokenHash = (token) => sha256(token).toString('hex');

export function safeEqual(input, expected) {
  if (typeof input !== 'string' || typeof expected !== 'string' || !expected) return false;
  return crypto.timingSafeEqual(sha256(input), sha256(expected));
}

/** 프로덕션에서 미설정이면 null이다. 알려진 기본값으로 교사 화면이 열리지 않게 한다 */
export function getTeacherPin() {
  const pin = (process.env.TEACHER_PIN || '').trim();
  if (pin) return pin;
  return process.env.NODE_ENV === 'production' ? null : '000000';
}

export function createRandomToken() {
  return crypto.randomBytes(24).toString('hex');
}

/** 토큰은 해시로 저장한다. 재시작해도 수업 중 교사 화면이 끊기지 않게 DB에 둔다 */
export function initTeacherTokens(db) {
  db.exec('CREATE TABLE IF NOT EXISTS teacher_tokens (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)');
}

export function issueTeacherToken(db) {
  const now = Date.now();
  db.prepare('DELETE FROM teacher_tokens WHERE expires_at < ?').run(now);
  const token = createRandomToken();
  db.prepare('INSERT INTO teacher_tokens (token_hash, expires_at) VALUES (?, ?)').run(tokenHash(token), now + TOKEN_TTL_MS);
  return token;
}

export function isTeacherToken(db, token) {
  if (typeof token !== 'string' || !token) return false;
  return Boolean(db.prepare('SELECT 1 FROM teacher_tokens WHERE token_hash = ? AND expires_at > ?').get(tokenHash(token), Date.now()));
}

export function requireTeacher(req, res, next) {
  if (!isTeacherToken(req.db, req.get('x-teacher-token'))) {
    return res.status(401).json({ error: '교사 인증이 필요합니다' });
  }
  next();
}

function failureLimiter(limit) {
  const entries = new Map();
  return {
    blocked(key) {
      const entry = entries.get(key);
      if (!entry) return false;
      if (Date.now() - entry.windowStart > FAIL_WINDOW_MS) { entries.delete(key); return false; }
      return entry.count >= limit;
    },
    record(key) {
      const now = Date.now();
      if (entries.size > 5000) {
        for (const [k, v] of entries) if (now - v.windowStart > FAIL_WINDOW_MS) entries.delete(k);
      }
      const entry = entries.get(key);
      if (!entry || now - entry.windowStart > FAIL_WINDOW_MS) entries.set(key, { count: 1, windowStart: now });
      else entry.count += 1;
    },
    clear(key) { entries.delete(key); },
  };
}

export const pinLimiter = failureLimiter(PIN_FAIL_LIMIT);
export const joinCodeLimiter = failureLimiter(CODE_FAIL_LIMIT);

/** "김철수" → "김○○" */
export function maskName(name) {
  const chars = Array.from(String(name ?? ''));
  if (chars.length === 0) return '';
  return chars[0] + '○'.repeat(Math.max(1, chars.length - 1));
}
