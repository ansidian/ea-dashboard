export default function LoadingSkeleton() {
  const shimmer = {
    background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s ease-in-out infinite',
    borderRadius: 8,
  };

  const bar = (width, height = 14, mb = 0) => (
    <div style={{ ...shimmer, width, height, marginBottom: mb }} />
  );

  const section = (titleWidth, lines, delay) => (
    <div style={{ marginBottom: 28, opacity: 0, animation: `fadeIn 0.4s ease ${delay}ms forwards` }}>
      {bar(titleWidth, 11, 12)}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {lines.map((w, i) => <div key={i}>{bar(w, 14)}</div>)}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(165deg, #0a0a0f 0%, #0f1118 40%, #111827 100%)', color: '#e2e8f0', fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes fadeIn { to { opacity: 1; } }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          {bar(120, 11, 8)}
          {bar(260, 36, 6)}
          {bar(200, 13)}
        </div>
        <div style={{ ...shimmer, width: 100, height: 100, borderRadius: 16 }} />
      </div>

      {section('100px', ['100%', '90%', '95%', '80%', '85%'], 100)}
      {section('160px', ['100%', '100%', '100%'], 200)}
      {section('110px', ['100%', '85%'], 300)}
      {section('140px', ['100%', '100%', '100%', '100%', '100%', '100%'], 400)}
      {section('100px', ['100%', '100%', '100%', '100%'], 500)}
      {section('100px', ['100%', '100%', '100%'], 600)}
    </div>
  );
}
