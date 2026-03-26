export default function RefreshBanner({ progress }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
      border: '1px solid rgba(99,102,241,0.2)',
      borderRadius: 12,
      padding: '14px 20px',
      marginBottom: 20,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      animation: 'fadeIn 0.3s ease',
    }}>
      <div style={{
        width: 18, height: 18,
        border: '2px solid rgba(99,102,241,0.3)',
        borderTopColor: '#818cf8',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
        flexShrink: 0,
      }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#c7d2fe' }}>
          Generating fresh briefing...
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, transition: 'opacity 0.2s ease' }}>
          {progress || "Starting up..."}
        </div>
      </div>
    </div>
  );
}
