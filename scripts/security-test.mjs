// 경사하강법 레이스 개인정보 회귀 시험.
// 서버를 RACE_DB_DIR=<임시폴더> PORT=4998 NODE_ENV=production TEACHER_PIN=test-pin 으로 띄운 뒤 실행한다.
import { io } from 'socket.io-client';

const HOST = process.env.TEST_HOST || 'http://localhost:4998';
const API = `${HOST}/api`;
const PIN = process.env.TEST_PIN || 'test-pin';
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failed += 1; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, p, body, token) {
  const r = await fetch(API + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { 'x-teacher-token': token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const connect = () => new Promise((resolve) => { const s = io(HOST, { transports: ['websocket'] }); s.on('connect', () => resolve(s)); });

check('기본 PIN 000000 거부', (await api('POST', '/auth/teacher', { pin: '000000' })).status === 401);
const login = await api('POST', '/auth/teacher', { pin: PIN });
const token = login.data.token;
check('교사 로그인 토큰 발급', Boolean(token));
check('토큰 없는 세션 생성 거부', (await api('POST', '/session/create', {})).status === 401);
const { sessionId } = (await api('POST', '/session/create', {}, token)).data;
check('교사 세션 생성', Boolean(sessionId));

const team = (await api('POST', `/session/${sessionId}/teams`, { name: '일조', members: ['김철수', '이영희'] })).data;
const team2 = (await api('POST', `/session/${sessionId}/teams`, { name: '이조', members: ['박민수'] })).data;
check('학생 팀 등록과 팀 토큰', Boolean(team.id && team.teamToken));

const anon = await api('GET', `/session/${sessionId}`);
check('세션 조회는 코드 확인에 쓰인다', anon.status === 200 && anon.data.teams.length === 2);
check('무인증 세션 응답에 teacher_code 없음', !('teacher_code' in anon.data));
check('무인증 응답은 이름을 가린다', anon.data.teams[0].members[0] === '김○○');
check('무인증 응답에 팀 토큰 없음', !JSON.stringify(anon.data).includes(team.teamToken) && !('access_token' in anon.data.teams[0]));
const teacherTeams = await api('GET', `/session/${sessionId}/teams`, null, token);
check('교사는 실명을 본다', teacherTeams.data[0].members[0] === '김철수');
check('대시보드는 교사 전용', (await api('GET', `/dashboard/${sessionId}`)).status === 401);
check('결과 조회는 교사 전용', (await api('GET', `/race/results/${sessionId}`)).status === 401);
check('결과 쓰기는 교사 전용', (await api('POST', '/race/results', { sessionId, results: [] })).status === 401);

const spy = await connect();
const spied = [];
spy.onAny((event) => spied.push(event));
spy.emit('teacher:join', { sessionId });
spy.emit('team:join', { sessionId: `${sessionId}:teacher`, teamId: team.id, teamToken: team.teamToken });
spy.emit('team:join', { sessionId, teamId: team.id });
spy.emit('team:join', { sessionId, teamId: team.id, teamToken: team2.teamToken });
await wait(200);
check('토큰 없는 소켓은 교사·팀이 되지 못한다', spied.length > 0 && spied.every((e) => e === 'auth_error' || e === 'team:join:error'));

const teacher = await connect();
let teacherState = false;
teacher.on('room_state', () => { teacherState = true; });
teacher.emit('teacher:join', { sessionId, token });
const student = await connect();
const studentEvents = [];
student.onAny((event, payload) => studentEvents.push([event, payload]));
student.emit('team:join', { sessionId, teamId: team.id, teamToken: team.teamToken });
await wait(300);
check('정상 교사 입장', teacherState);
check('정상 팀 입장', studentEvents.some(([e]) => e === 'room_state'));
check('소켓에 실명이 없다', !JSON.stringify(studentEvents).includes('김철수'));

if (process.env.TEST_RATE_LIMIT === '1') {
  for (let i = 0; i < 31; i += 1) await api('POST', '/auth/teacher', { pin: `wrong${i}` });
  check('PIN 차단 뒤 맞는 값도 429', (await api('POST', '/auth/teacher', { pin: PIN })).status === 429);
  let status = 0;
  for (let i = 0; i < 61; i += 1) status = (await api('GET', `/session/NOPE${i}`)).status;
  check('코드 추측 제한', status === 429);
  check('차단 중에도 맞는 코드는 입장한다', (await api('GET', `/session/${sessionId}`)).status === 200);
}
for (const s of [spy, teacher, student]) s.disconnect();
console.log(failed ? `실패 ${failed}건` : '모두 통과');
process.exit(failed ? 1 : 0);
