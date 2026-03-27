export default function ErrorState({ message, onRetry }) {
  return (
    <div style={{
      minHeight: '100vh',
      color: '#e2e8f0',
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 400, padding: 24 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h2 style={{
          fontFamily: "'DM Serif Display', Georgia, serif",
          fontSize: 24, fontWeight: 400, margin: '0 0 8px 0', color: '#f8fafc',
        }}>
          Something went wrong
        </h2>
        <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, margin: '0 0 20px 0' }}>
          {message || 'Failed to load your morning briefing.'}
        </p>
        {onRetry && (
          <button onClick={onRetry} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
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
