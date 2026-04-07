export default function QRDisplay({ url }) {
  return (
    <div style={{ textAlign: 'center', padding: 16 }}>
      <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>참여 URL:</p>
      <code style={{ fontSize: 14 }}>{url}</code>
    </div>
  );
}
