import { useEffect, useState } from 'react';

export default function CountdownOverlay({ seconds, onComplete }) {
  const [current, setCurrent] = useState(seconds);

  useEffect(() => {
    setCurrent(seconds);
  }, [seconds]);

  if (current <= 0) return null;

  const text = current > 0 ? current : 'GO!';
  const color = current === 3 ? '#ef4444' : current === 2 ? '#f59e0b' : '#22c55e';

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', zIndex: 1000,
      pointerEvents: 'none',
    }}>
      <div style={{
        fontSize: 200, fontWeight: 900, color,
        textShadow: `0 0 60px ${color}40, 0 0 120px ${color}20`,
        animation: 'countdownPulse 0.5s ease-in-out',
      }}>
        {text}
      </div>
      <style>{`
        @keyframes countdownPulse {
          0% { transform: scale(1.5); opacity: 0; }
          50% { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.95); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
