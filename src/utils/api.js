import { API_BASE } from '../config';

// 교사 토큰 — PIN 인증 뒤 서버가 준다. 새로고침하면 다시 로그인한다
let teacherToken = '';

export function getTeacherToken() {
  return teacherToken;
}

export function setTeacherToken(token) {
  teacherToken = token || '';
}

const authHeaders = () => (teacherToken ? { 'x-teacher-token': teacherToken } : {});

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
