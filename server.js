import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { setupSocketHandlers } from './backend/socketHandlers.js';
import { getTeacherPin, initTeacherTokens, issueTeacherToken, pinLimiter, safeEqual } from './backend/auth.js';
import { startRetentionJob } from './backend/retention.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PORT = 4024;
const PORT = process.env.NODE_ENV === 'production' ? (process.env.PORT || SERVER_PORT) : SERVER_PORT;

// ── DB 초기화 ──
// RACE_DB_DIR을 주면 그 폴더를 쓴다 (시험이 운영·개발 DB를 건드리지 않게 하려는 용도)
const dbDir = process.env.RACE_DB_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, 'db'));
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const db = new Database(path.join(dbDir, 'race.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
db.exec(schema);
const teamColumns = db.prepare("PRAGMA table_info('teams')").all().map((column) => column.name);
if (!teamColumns.includes('access_token')) db.exec('ALTER TABLE teams ADD COLUMN access_token TEXT');
initTeacherTokens(db);
startRetentionJob(db);

// ── Express 설정 ──
const app = express();
const httpServer = createServer(app);
// Railway 프록시 뒤에서 req.ip가 실제 접속 IP가 되도록 (시도 횟수 제한용)
app.set('trust proxy', 1);

const DEFAULT_ORIGINS = [
  'http://localhost:4023',
  'http://localhost:4024',
];
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : DEFAULT_ORIGINS;

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error('CORS blocked'));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

const io = new Server(httpServer, { cors: corsOptions });
app.use((req, res, next) => {
  req.db = db;
  req.io = io;
  next();
});

// ── 헬스 체크 ──
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ── 교사 PIN 인증 ──
app.post('/api/auth/teacher', (req, res) => {
  const expected = getTeacherPin();
  if (!expected) {
    return res.status(503).json({ success: false, error: 'TEACHER_PIN이 서버에 설정되지 않았습니다' });
  }
  if (pinLimiter.blocked(req.ip)) {
    return res.status(429).json({ success: false, error: 'PIN 실패가 너무 많습니다. 10분 뒤 다시 시도하세요' });
  }
  const pin = req.body?.pin;
  if (!safeEqual(typeof pin === 'string' ? pin.trim() : '', expected)) {
    pinLimiter.record(req.ip);
    return res.status(401).json({ success: false, error: '잘못된 PIN입니다' });
  }
  pinLimiter.clear(req.ip);
  res.json({ success: true, token: issueTeacherToken(db) });
});

// ── API 라우트 ──
import sessionRoutes from './api/session.js';
import raceRoutes from './api/race.js';
import dashboardRoutes from './api/dashboard.js';
app.use('/api/session', sessionRoutes);
app.use('/api/race', raceRoutes);
app.use('/api/dashboard', dashboardRoutes);

// ── Socket.IO ──
setupSocketHandlers(io, db);

// ── 프로덕션: SPA 서빙 ──
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

httpServer.listen(PORT, () => {
  console.log(`🏁 경사하강법 레이스 서버: http://localhost:${PORT}`);
});

process.on('uncaughtException', (err) => console.error('Uncaught:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled:', err));
