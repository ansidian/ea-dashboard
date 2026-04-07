import { useEffect, useRef } from "react";

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

// Owns the schedule for live data refreshes.
// - 5-min interval (visibility-gated) → onQuickRefresh
// - tab focus → onQuickRefresh if stale (≥5 min since last quick refresh), else onSilentRefresh
export default function useAutoRefresh({
  disabled = false,
  lastQuickRefreshAt,
  onQuickRefresh,
  onSilentRefresh,
}) {
  const lastRef = useRef(lastQuickRefreshAt);
  const onQuickRef = useRef(onQuickRefresh);
  const onSilentRef = useRef(onSilentRefresh);

  // keep refs in sync without re-attaching listeners
  useEffect(() => {
    lastRef.current = lastQuickRefreshAt;
    onQuickRef.current = onQuickRefresh;
    onSilentRef.current = onSilentRefresh;
  });

  useEffect(() => {
    if (disabled) return;

    const tick = () => {
      if (document.visibilityState === "hidden") return;
      onQuickRef.current?.();
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const last = lastRef.current;
      const isStale = !last || Date.now() - last >= STALE_THRESHOLD_MS;
      if (isStale) {
        onQuickRef.current?.();
      } else {
        onSilentRef.current?.();
      }
    };

    const intervalId = setInterval(tick, STALE_THRESHOLD_MS);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [disabled]);
}
