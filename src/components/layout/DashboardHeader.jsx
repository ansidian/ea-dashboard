import { useState, useRef, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "motion/react";
import { skipSchedule, deleteBriefing } from "../../api";
import { getGreeting, timeAgo, formatShortTime } from "../../lib/dashboard-helpers";
import useIsMobile from "../../hooks/useIsMobile";
import Tooltip from "../shared/Tooltip";
import BriefingHistoryPanel from "../briefing/BriefingHistoryPanel";
import BriefingSearch from "../briefing/BriefingSearch";
import WeatherTooltip from "../shared/WeatherTooltip";

const btnHeader = "bg-input-bg border border-white/[0.08] rounded-md px-2.5 py-1 text-[11px] text-muted-foreground font-medium transition-all flex items-center gap-1 cursor-pointer font-[inherit] select-none hover:bg-white/[0.06] hover:border-white/15 hover:text-foreground/80 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed max-sm:min-h-[44px] max-sm:text-xs max-sm:shrink-0";

const CONFIRM_INITIAL = { opacity: 0, y: -8, height: 0 };
const CONFIRM_ANIMATE = { opacity: 1, y: 0, height: "auto" };
const CONFIRM_EXIT = { opacity: 0, y: -8, height: 0 };
const CONFIRM_TRANSITION = { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] };

const btnHeaderActive = "bg-primary/[0.08] border-primary/20 text-primary hover:bg-primary/[0.08] hover:border-primary/20 hover:text-primary";

export default function DashboardHeader({
  d,
  loaded,
  refreshing,
  generating,
  holdProgress,
  holdConfirm,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onGenerate,
  setHoldConfirm,
  historyOpen,
  setHistoryOpen,
  historyTriggerRef,
  viewingPast,
  latestId,
  onSelectHistory,
  onBackToLatest,
  schedules,
  setSchedules,
  modelLabel,
  onNavigateToEmail,
  renderConfigured,
  suspendConfirm,
  setSuspendConfirm,
  suspendHoldProgress,
  onSuspendPointerDown,
  onSuspendPointerUp,
  onSuspendPointerLeave,
  onSuspend,
  suspending,
  suspended,
}) {
  const isMobile = useIsMobile();
  const greeting = useMemo(
    () => getGreeting(d.scheduleLabel),
    [d.scheduleLabel],
  );
  const weatherRef = useRef(null);
  const weatherLeaveTimer = useRef(null);
  const [weatherHover, setWeatherHover] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Compute next upcoming briefing
  const { nextBriefing, nextSkipped } = useMemo(() => {
    const now = new Date();
    const enabled = schedules
      .map((s, i) => ({ ...s, _idx: i }))
      .filter((s) => s.enabled)
      .map((s) => {
        const tz = s.tz || "America/Los_Angeles";
        const [h, m] = s.time.split(":").map(Number);
        const todayParts = new Intl.DateTimeFormat("en-CA", {
          timeZone: tz,
        }).format(now);
        const naive = new Date(
          `${todayParts}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`,
        );
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).formatToParts(naive);
        const p = Object.fromEntries(
          parts.map(({ type, value }) => [type, value]),
        );
        const asLocal = new Date(
          `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`,
        );
        const target = new Date(
          naive.getTime() + (naive.getTime() - asLocal.getTime()),
        );
        if (target <= now) target.setTime(target.getTime() + 86400000);
        const isSkipped = s.skipped_until && new Date(s.skipped_until) > now;
        return { ...s, targetTime: target, msUntil: target - now, isSkipped };
      })
      .sort((a, b) => a.msUntil - b.msUntil);
    const active = enabled.find((s) => !s.isSkipped) || null;
    const skipped = enabled.find((s) => s.isSkipped) || null;
    const soonest = enabled[0] || null;
    if (soonest?.isSkipped) return { nextBriefing: null, nextSkipped: soonest };
    return { nextBriefing: active, nextSkipped: skipped };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules, tick]); // tick triggers re-computation of "now" each minute

  const briefingIndicator = nextBriefing || nextSkipped;

  const nextBriefingLabel = (() => {
    if (!briefingIndicator) return null;
    const hrs = Math.floor(briefingIndicator.msUntil / 3600000);
    const mins = Math.round((briefingIndicator.msUntil % 3600000) / 60000);
    if (hrs === 0) return `${mins}m`;
    if (mins === 0) return `${hrs}h`;
    return `${hrs}h ${mins}m`;
  })();

  const nextBriefingFullTime = briefingIndicator
    ? briefingIndicator.targetTime.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/Los_Angeles",
      })
    : null;

  return (
    <>
      {/* Full generation confirm dialog */}
      <AnimatePresence>
        {holdConfirm && (
          <motion.div
            initial={CONFIRM_INITIAL}
            animate={CONFIRM_ANIMATE}
            exit={CONFIRM_EXIT}
            transition={CONFIRM_TRANSITION}
            style={{ overflow: "hidden" }}
          >
            <div
              className="border rounded-xl px-5 py-3.5 mb-5 flex items-center gap-3"
              style={{
                background: "rgba(203,166,218,0.06)",
                borderColor: "rgba(203,166,218,0.15)",
              }}
            >
              <span className="text-base">🧠</span>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-foreground/90">
                  Generate fresh AI briefing?
                </div>
                <div className="text-xs text-muted-foreground/60 mt-0.5">
                  Re-fetches new emails and analyzes with {modelLabel} (uses an
                  API call)
                </div>
              </div>
              <button
                className="bg-[#cba6da] text-[#1e1e2e] border-none rounded-lg px-4 py-2 text-xs font-semibold cursor-pointer transition-all hover:bg-[#d4b3e2] hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed font-[inherit]"
                onClick={onGenerate}
              >
                Generate
              </button>
              <button
                className="bg-white/[0.06] text-muted-foreground border border-white/10 rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer transition-all font-[inherit] hover:bg-white/10 hover:text-foreground/80 hover:border-white/20"
                onClick={() => setHoldConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suspend service confirm dialog */}
      <AnimatePresence>
        {suspendConfirm && (
          <motion.div
            initial={CONFIRM_INITIAL}
            animate={CONFIRM_ANIMATE}
            exit={CONFIRM_EXIT}
            transition={CONFIRM_TRANSITION}
            style={{ overflow: "hidden" }}
          >
            <div
              className="border rounded-xl px-5 py-3.5 mb-5 flex items-center gap-3"
              style={{
                background: "rgba(249,115,22,0.06)",
                borderColor: "rgba(249,115,22,0.15)",
              }}
            >
              <span className="text-base">⏻</span>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-foreground/90">
                  Suspend service?
                </div>
                <div className="text-xs text-muted-foreground/60 mt-0.5">
                  Shuts down the Render service.
                </div>
              </div>
              <button
                className="bg-[#f97316] text-[#1e1e2e] border-none rounded-lg px-4 py-2 text-xs font-semibold cursor-pointer transition-all hover:bg-[#fb923c] hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed font-[inherit]"
                onClick={onSuspend}
              >
                Suspend
              </button>
              <button
                className="bg-white/[0.06] text-muted-foreground border border-white/10 rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer transition-all font-[inherit] hover:bg-white/10 hover:text-foreground/80 hover:border-white/20"
                onClick={() => setSuspendConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suspended confirmation banner */}
      <AnimatePresence>
        {suspended && (
          <motion.div
            initial={CONFIRM_INITIAL}
            animate={CONFIRM_ANIMATE}
            exit={CONFIRM_EXIT}
            transition={CONFIRM_TRANSITION}
            style={{ overflow: "hidden" }}
          >
            <div
              className="border rounded-xl px-5 py-3.5 mb-5 flex items-center gap-3"
              style={{
                background: "rgba(249,115,22,0.06)",
                borderColor: "rgba(249,115,22,0.15)",
              }}
            >
              <span className="text-base">⏻</span>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-[#f97316]">
                  Service suspending
                </div>
                <div className="text-xs text-muted-foreground/60 mt-0.5">
                  Render is shutting down.
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div
        className={cn(
          "mb-8 transition-all duration-600 ease-[cubic-bezier(0.16,1,0.3,1)]",
          loaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
        )}
      >
        <div>
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <div className="text-[11px] tracking-[3px] uppercase text-muted-foreground mb-2 font-semibold">
                {greeting.label}
              </div>
              <h1 className="font-serif text-2xl sm:text-4xl font-normal m-0 text-white/95 leading-tight">
                {greeting.greeting}
              </h1>
              <p className="text-muted-foreground text-[13px] max-sm:text-xs m-0 mt-1.5">
                {d.dataUpdatedAt
                  ? `Data updated ${timeAgo(d.dataUpdatedAt)}`
                  : d.generatedAt}
                {d.aiGeneratedAt &&
                  ` · AI analysis from ${formatShortTime(d.aiGeneratedAt)}${d.skippedAI ? " · no new activity" : ""}`}
              </p>
            </div>
            <div
              ref={weatherRef}
              onMouseEnter={() => {
                clearTimeout(weatherLeaveTimer.current);
                setWeatherHover(true);
              }}
              onMouseLeave={() => {
                weatherLeaveTimer.current = setTimeout(
                  () => setWeatherHover(false),
                  150,
                );
              }}
              className="bg-input-bg border border-border rounded-xl p-4 px-5 max-sm:p-2 max-sm:px-3 text-center min-w-[100px] max-sm:min-w-0 cursor-default transition-all hover:bg-surface-hover hover:border-white/10 shrink-0"
            >
              <div className="text-4xl max-sm:text-xl leading-none">☀️</div>
              <div className="text-[28px] max-sm:text-lg font-light text-white mt-1">
                {d.weather.temp}°
              </div>
              <div className="text-[11px] max-sm:text-xs text-muted-foreground mt-0.5">
                {d.weather.high}° / {d.weather.low}°
              </div>
            </div>
            {weatherHover && !isMobile && (
              <WeatherTooltip
                weather={d.weather}
                triggerRef={weatherRef}
                onMouseEnter={() => clearTimeout(weatherLeaveTimer.current)}
                onMouseLeave={() => setWeatherHover(false)}
              />
            )}
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap max-sm:gap-1.5 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:[scrollbar-width:none]">
              <Tooltip
                text={
                  !refreshing && !generating
                    ? "Tap to refresh data · Hold to regenerate AI briefing · Hotkey: R"
                    : null
                }
              >
                <button
                  className={cn(
                    btnHeader,
                    "relative overflow-hidden touch-none",
                    (refreshing || generating) && btnHeaderActive,
                    (refreshing || generating) &&
                      "opacity-70 cursor-not-allowed",
                  )}
                  onPointerDown={onPointerDown}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerLeave}
                  disabled={refreshing || generating}
                >
                  {holdProgress > 0 && (
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-primary/20 to-primary/10 rounded-md"
                      style={{ width: `${holdProgress}%` }}
                    />
                  )}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="relative"
                    style={{
                      animation: refreshing
                        ? "spin 0.8s linear infinite"
                        : "none",
                    }}
                  >
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  <span className="relative">
                    {holdProgress > 0
                      ? "Hold for new briefing..."
                      : refreshing
                        ? "Updating..."
                        : "Refresh"}
                  </span>
                </button>
              </Tooltip>
              <div ref={historyTriggerRef} className="relative">
                <button
                  className={cn(btnHeader, historyOpen && btnHeaderActive)}
                  onClick={() => setHistoryOpen((v) => !v)}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  History
                </button>
                {historyOpen && (
                  <BriefingHistoryPanel
                    activeId={viewingPast?.id ?? latestId}
                    triggerRef={historyTriggerRef}
                    onSelect={onSelectHistory}
                    onClose={() => setHistoryOpen(false)}
                    onDelete={deleteBriefing}
                  />
                )}
              </div>
              {briefingIndicator && (
                <Tooltip
                  text={
                    briefingIndicator.isSkipped
                      ? `${briefingIndicator.label} at ${nextBriefingFullTime} · Click to unskip`
                      : `${briefingIndicator.label} at ${nextBriefingFullTime} · Click to skip`
                  }
                >
                  <button
                    className={cn(
                      btnHeader,
                      briefingIndicator.isSkipped
                        ? "bg-[#f9e2af]/[0.08] border-[#f9e2af]/20 text-[#f9e2af] hover:bg-primary/[0.08] hover:border-primary/20 hover:text-primary"
                        : "hover:bg-[#f9e2af]/[0.08] hover:border-[#f9e2af]/20 hover:text-[#f9e2af]",
                    )}
                    onClick={async () => {
                      const result = await skipSchedule(
                        briefingIndicator._idx,
                        !briefingIndicator.isSkipped,
                      );
                      if (result.schedules) setSchedules(result.schedules);
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>
                      {briefingIndicator.isSkipped
                        ? `${briefingIndicator.label} skipped`
                        : `Next in ${nextBriefingLabel}`}
                    </span>
                  </button>
                </Tooltip>
              )}
              <a href="/settings" className={cn(btnHeader, "no-underline")} aria-label="Settings">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
                <span className="max-sm:hidden">Settings</span>
              </a>
              {renderConfigured && !isMobile && (
                <Tooltip
                  text={
                    suspended
                      ? "Service suspended"
                      : suspending
                        ? null
                        : "Hold to suspend Render service"
                  }
                >
                  <button
                    className={cn(
                      btnHeader,
                      "relative overflow-hidden touch-none",
                      suspended && "opacity-50 cursor-not-allowed",
                      suspending && "opacity-70 cursor-not-allowed",
                      !suspended &&
                        !suspending &&
                        "hover:bg-[#f97316]/[0.08] hover:border-[#f97316]/20 hover:text-[#f97316]",
                    )}
                    onPointerDown={onSuspendPointerDown}
                    onPointerUp={onSuspendPointerUp}
                    onPointerLeave={onSuspendPointerLeave}
                    disabled={suspending || suspended}
                  >
                    {suspendHoldProgress > 0 && (
                      <div
                        className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-[#f97316]/20 to-[#f97316]/10 rounded-md"
                        style={{ width: `${suspendHoldProgress}%` }}
                      />
                    )}
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="relative"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="2" x2="12" y2="6" />
                    </svg>
                    <span className="relative">
                      {suspended
                        ? "Suspended"
                        : suspending
                          ? "Suspending..."
                          : suspendHoldProgress > 0
                            ? "Hold to suspend..."
                            : "Suspend"}
                    </span>
                  </button>
                </Tooltip>
              )}
          </div>
        </div>
      </div>

      {/* Viewing past briefing banner */}
      <AnimatePresence>
        {viewingPast && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="rounded-lg px-4 py-2.5 mb-5 flex items-center gap-2"
            style={{
              background: "rgba(203,166,218,0.05)",
              border: "1px solid rgba(203,166,218,0.12)",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#cba6da"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="text-xs text-[#cba6da]/80">
              Viewing briefing from{" "}
              {(() => {
                const raw = (viewingPast.generated_at || "").replace(" ", "T");
                const d2 = new Date(raw.includes("T") ? raw + (raw.endsWith("Z") ? "" : "Z") : raw + "T00:00:00Z");
                return d2.toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                  timeZone: "America/Los_Angeles",
                });
              })()}
            </span>
            <button
              onClick={onBackToLatest}
              className="bg-transparent border-none text-[#cba6da] text-xs font-medium cursor-pointer p-0 underline underline-offset-2 transition-colors hover:text-[#d4b3e2]"
            >
              Back to latest
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      <div
        className={cn(
          "transition-all duration-600 ease-[cubic-bezier(0.16,1,0.3,1)] delay-100",
          loaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
        )}
      >
        <BriefingSearch onNavigateToEmail={onNavigateToEmail} />
      </div>

      {/* RAG unavailable warning */}
      {d.ragUnavailable && (
        <div
          className={cn(
            "text-[11px] text-warning bg-warning/[0.06] border border-warning/15 rounded-md px-2.5 py-1.5 mb-4 transition-opacity duration-400 delay-200",
            loaded ? "opacity-100" : "opacity-0",
          )}
        >
          Historical context unavailable — insights based on current data only
        </div>
      )}
    </>
  );
}
