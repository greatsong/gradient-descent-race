import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../../utils/api';
import { getSocket } from '../../utils/socket';
import useSessionStore from '../../store/sessionStore';

export default function JoinPage() {
  const navigate = useNavigate();
  const setSession = useSessionStore(s => s.setSession);
  const setMyTeam = useSessionStore(s => s.setMyTeam);

  const [sessionCode, setSessionCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [members, setMembers] = useState('');
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionData, setSessionData] = useState(null);

  const checkSession = async () => {
    if (!sessionCode.trim()) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiGet(`/session/${sessionCode.trim().toUpperCase()}`);
      setSessionData(data);
      setSession(data.id);
      setStep(2);
    } catch (e) {
      setError('세션을 찾을 수 없습니다. 코드를 확인해주세요.');
    }
    setLoading(false);
  };

  const joinTeam = async () => {
    if (!teamName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const memberList = members.split(',').map(m => m.trim()).filter(Boolean);
      const team = await apiPost(`/session/${sessionCode.toUpperCase()}/teams`, {
        name: teamName.trim(),
        members: memberList,
      });
      setMyTeam(team);

      const socket = getSocket();
      socket.emit('team:join', { sessionId: sessionCode.toUpperCase(), teamId: team.id, teamName: team.name });

      navigate(`/team/${team.id}`);
    } catch (e) {
      setError('팀 등록에 실패했습니다. 다시 시도해주세요.');
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1030 100%)', padding: 20,
    }}>
      <div className="card" style={{ maxWidth: 440, width: '100%' }}>
        <h1 style={{ textAlign: 'center', marginBottom: 8, fontSize: 28 }}>
          {'\uD83C\uDFC1'} 경사하강법 레이스
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--text-dim)', marginBottom: 24, fontSize: 14 }}>
          학습률과 모멘텀을 조절하여 손실 함수의 최솟값을 찾아라!
        </p>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#fca5a5', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {step === 1 ? (
          <>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--text-dim)' }}>세션 코드</label>
            <input
              value={sessionCode}
              onChange={e => setSessionCode(e.target.value.toUpperCase())}
              placeholder="선생님이 알려준 코드 입력"
              style={{ width: '100%', marginBottom: 16, fontSize: 18, textAlign: 'center', letterSpacing: 4 }}
              maxLength={10}
              onKeyDown={e => e.key === 'Enter' && checkSession()}
            />
            <button
              className="btn-primary"
              onClick={checkSession}
              disabled={loading || !sessionCode.trim()}
              style={{ width: '100%', padding: 14, fontSize: 16 }}
            >
              {loading ? '확인 중...' : '참여하기'}
            </button>
          </>
        ) : (
          <>
            <div style={{
              background: 'rgba(99,102,241,0.1)', borderRadius: 8, padding: '10px 14px',
              marginBottom: 16, fontSize: 13, color: '#a5b4fc',
            }}>
              세션: {sessionCode} {'\u2022'} {sessionData?.teams?.length || 0}팀 참여 중
            </div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--text-dim)' }}>팀 이름</label>
            <input
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
              placeholder="예: 알파팀"
              style={{ width: '100%', marginBottom: 12 }}
            />
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--text-dim)' }}>팀원 (쉼표로 구분)</label>
            <input
              value={members}
              onChange={e => setMembers(e.target.value)}
              placeholder="예: 김철수, 이영희, 박민수"
              style={{ width: '100%', marginBottom: 16 }}
            />
            <button
              className="btn-primary"
              onClick={joinTeam}
              disabled={loading || !teamName.trim()}
              style={{ width: '100%', padding: 14, fontSize: 16 }}
            >
              {loading ? '등록 중...' : '팀 등록 & 입장'}
            </button>
            <button
              onClick={() => setStep(1)}
              style={{
                width: '100%', marginTop: 8, background: 'transparent',
                color: 'var(--text-dim)', fontSize: 13, border: 'none', cursor: 'pointer',
              }}
            >
              {'\u2190'} 세션 코드 다시 입력
            </button>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <a href="/teacher" style={{ color: 'var(--text-dim)', fontSize: 12, textDecoration: 'none' }}>
            교사용 대시보드 {'\u2192'}
          </a>
        </div>
      </div>
    </div>
  );
}
