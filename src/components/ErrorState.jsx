export default function ErrorState({ message, onRetry }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(165deg, #0a0a0f 0%, #0f1118 40%, #111827 100%)',
      color: '#e2e8f0',
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <div style={{ textAlign: 'center', maxWidth: 400, padding: 24 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h2 style={{
          fontFamily: "'DM Serif Display', Georgia, serif",
          fontSize: 24, fontWeight: 400, margin: '0 0 8px 0', color: '#f8fafc',
        }}>
          Something went wrong
        </h2>
        <p style={{ fontSize: 13.5, color: '#94a3b8', lineHeight: 1.6, margin: '0 0 20px 0' }}>
          {message || 'Failed to load your morning briefing.'}
        </p>
        {onRetry && (
          <button onClick={onRetry} style={{
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', border: 'none', borderRadius: 10,
            padding: '11px 24px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}
