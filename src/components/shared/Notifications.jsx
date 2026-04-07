export default function Notifications({ alerts = [] }) {
  if (!alerts.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {alerts.slice(-5).map(a => (
        <div key={a.id} style={{
          fontSize: 11, padding: '4px 8px', borderRadius: 6,
          background: 'rgba(0,0,0,0.3)',
          color: a.type === 'escaped' ? '#fca5a5' : a.type === 'converged' ? '#86efac' : '#fde68a',
        }}>
          {a.message}
        </div>
      ))}
    </div>
  );
}
