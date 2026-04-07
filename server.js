import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';
import Database from 'better-sqlite3';
import { setupSocketHandlers } from './backend/socketHandlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4024;
const TEACHER_PIN = process.env.TEACHER_PIN || '000000';

// ── DB 초기화 ──
const dbDir = fs.existsSync('/data') ? '/data' : path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const db = new Database(path.join(dbDir, 'race.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
db.exec(schema);

// ── Express 설정 ──
const app = express();
const httpServer = createServer(app);

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
  const { pin } = req.body;
  if (pin === TEACHER_PIN) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: '잘못된 PIN입니다' });
  }
});

// ── API 라우트 ──
import sessionRoutes from './api/session.js';
import raceRoutes from './api/race.js';
import dashboardRoutes from './api/dashboard.js';
app.use('/api/session', sessionRoutes);
app.use('/api/race', raceRoutes);
app.use('/api/dashboard', dashboardRoutes);

// ── 네트워크 IP (QR코드용) ──
app.get('/api/network/ip', (req, res) => {
  const nets = networkInterfaces();
  const ips = [];
  for (const iface of Object.values(nets)) {
    for (const net of iface) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  res.json({ ips });
});

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
