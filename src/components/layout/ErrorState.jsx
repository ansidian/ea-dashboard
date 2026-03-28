export default function ErrorState({ message, onRetry }) {
  return (
    <div className="min-h-screen text-text-body font-sans flex items-center justify-center">
      <div className="text-center max-w-[400px] p-6">
        <div className="text-[48px] mb-4">⚠️</div>
        <h2 className="font-serif text-[24px] font-normal mb-2 text-text-primary">
          Something went wrong
        </h2>
        <p className="text-sm text-text-secondary leading-relaxed mb-5">
          {message || "Failed to load your morning briefing."}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="bg-gradient-to-r from-accent to-accent-secondary text-white border-none rounded-default px-5 py-2.5 text-[13px] font-semibold cursor-pointer transition-all hover:brightness-115 hover:-translate-y-px hover:shadow-hover active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            aria-label="Retry loading"
          >
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
