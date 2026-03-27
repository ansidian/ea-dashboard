import { useState, useRef } from "react";
import { skipSchedule } from "../api";
import { getGreeting, timeAgo, formatShortTime } from "../lib/dashboard-helpers";
import BriefingHistoryPanel from "./BriefingHistoryPanel";
import BriefingSearch from "./BriefingSearch";
import WeatherTooltip from "./WeatherTooltip";

export default function DashboardHeader({
  d, loaded,
  refreshing, generating,
  holdProgress, holdConfirm,
  onPointerDown, onPointerUp, onPointerLeave,
  onGenerate, setHoldConfirm,
  historyOpen, setHistoryOpen,
  historyTriggerRef,
  viewingPast, latestId,
  onSelectHistory, onBackToLatest,
  schedules, setSchedules,
  modelLabel,
  onNavigateToEmail,
}) {
  const [refreshHover, setRefreshHover] = useState(false);
  const [nextBriefingHover, setNextBriefingHover] = useState(false);
  const [weatherHover, setWeatherHover] = useState(false);
  const weatherRef = useRef(null);
  const weatherLeaveTimer = useRef(null);

  // Compute next upcoming briefing
  const { nextBriefing, nextSkipped } = (() => {
    const now = new Date();
    const enabled = schedules
      .map((s, i) => ({ ...s, _idx: i }))
      .filter(s => s.enabled)
      .map(s => {
        const tz = s.tz || "America/Los_Angeles";
        const [h, m] = s.time.split(":").map(Number);
        // Get today's date in the schedule's timezone
        const todayParts = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
        // Build target time in the schedule's timezone, then convert to UTC
        const naive = new Date(`${todayParts}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
        }).formatToParts(naive);
        const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
        const asLocal = new Date(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`);
        const target = new Date(naive.getTime() + (naive.getTime() - asLocal.getTime()));
        if (target <= now) target.setTime(target.getTime() + 86400000);
        const isSkipped = s.skipped_until && new Date(s.skipped_until) > now;
        return { ...s, targetTime: target, msUntil: target - now, isSkipped };
      })
      .sort((a, b) => a.msUntil - b.msUntil);
    const active = enabled.find(s => !s.isSkipped) || null;
    const skipped = enabled.find(s => s.isSkipped) || null;
    const soonest = enabled[0] || null;
    if (soonest?.isSkipped) return { nextBriefing: null, nextSkipped: soonest };
    return { nextBriefing: active, nextSkipped: skipped };
  })();

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
    ? briefingIndicator.targetTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Los_Angeles" })
    : null;

  return (
    <>
      {/* Full generation confirm dialog */}
      {holdConfirm && (
        <div
          style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))",
            border: "1px solid rgba(99,102,241,0.25)",
            borderRadius: 12,
            padding: "14px 20px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 12,
            animation: "fadeIn 0.2s ease",
          }}
        >
          <span style={{ fontSize: 16 }}>🧠</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#c7d2fe" }}>
              Generate fresh AI briefing?
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              Re-fetches new emails and analyzes with {modelLabel} (uses an API call)
            </div>
          </div>
          <button
            className="btn-primary"
            onClick={onGenerate}
            style={{ padding: "8px 16px", fontSize: 12 }}
          >
            Generate
          </button>
          <button
            className="btn-secondary"
            onClick={() => setHoldConfirm(false)}
            style={{ padding: "8px 12px", fontSize: 12 }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          opacity: loaded ? 1 : 0,
          transform: loaded ? "translateY(0)" : "translateY(12px)",
          transition: "all 0.6s cubic-bezier(0.16,1,0.3,1)",
          marginBottom: 32,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: "#64748b",
                marginBottom: 8,
                fontWeight: 600,
              }}
            >
              {getGreeting().label}
            </div>
            <h1
              style={{
                fontFamily: "'DM Serif Display', Georgia, serif",
                fontSize: 36,
                fontWeight: 400,
                margin: 0,
                color: "#f8fafc",
                lineHeight: 1.1,
              }}
            >
              {getGreeting().greeting}
            </h1>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginTop: 6,
                flexWrap: "wrap",
              }}
            >
              <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
                {d.dataUpdatedAt
                  ? `Data updated ${timeAgo(d.dataUpdatedAt)}`
                  : d.generatedAt}
                {d.aiGeneratedAt &&
                  ` · AI analysis from ${formatShortTime(d.aiGeneratedAt)}`}
              </p>
              <div
                style={{ position: "relative", display: "inline-block" }}
                onMouseEnter={() => setRefreshHover(true)}
                onMouseLeave={() => setRefreshHover(false)}
              >
                <button
                  className="btn-header"
                  onPointerDown={onPointerDown}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerLeave}
                  disabled={refreshing || generating}
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    background: refreshing
                      ? "rgba(99,102,241,0.12)"
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${refreshing ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: 11,
                    color: refreshing ? "#a5b4fc" : "#94a3b8",
                    cursor: refreshing || generating ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    opacity: refreshing || generating ? 0.7 : 1,
                    fontWeight: 500,
                    transition: "all 0.2s ease",
                    userSelect: "none",
                    touchAction: "none",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => {
                    if (!refreshing && !generating) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                      e.currentTarget.style.color = "#e2e8f0";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!refreshing && !generating) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                      e.currentTarget.style.color = "#94a3b8";
                    }
                  }}
                >
                  {holdProgress > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${holdProgress}%`,
                        background: "linear-gradient(90deg, rgba(99,102,241,0.2), rgba(139,92,246,0.3))",
                        transition: "none",
                        borderRadius: 6,
                      }}
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
                    style={{
                      animation: refreshing ? "spin 0.8s linear infinite" : "none",
                      position: "relative",
                    }}
                  >
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  <span style={{ position: "relative" }}>
                    {holdProgress > 0
                      ? "Hold for new briefing..."
                      : refreshing
                        ? "Updating..."
                        : "Refresh"}
                  </span>
                </button>
                {refreshHover && !refreshing && !generating && (
                  <div style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "#1e293b",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 11,
                    color: "#e2e8f0",
                    whiteSpace: "nowrap",
                    zIndex: 50,
                    pointerEvents: "none",
                  }}>
                    Tap to refresh data · Hold to regenerate AI briefing · Hotkey: R
                  </div>
                )}
              </div>
              <div ref={historyTriggerRef} style={{ position: "relative" }}>
                <button
                  className="btn-header"
                  onClick={() => setHistoryOpen((v) => !v)}
                  style={{
                    background: historyOpen
                      ? "rgba(99,102,241,0.12)"
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${historyOpen ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: 11,
                    color: historyOpen ? "#a5b4fc" : "#94a3b8",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontWeight: 500,
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!historyOpen) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                      e.currentTarget.style.color = "#e2e8f0";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!historyOpen) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                      e.currentTarget.style.color = "#94a3b8";
                    }
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  />
                )}
              </div>
              {briefingIndicator && (
                <div
                  style={{ position: "relative", display: "inline-block" }}
                  onMouseEnter={() => setNextBriefingHover(true)}
                  onMouseLeave={() => setNextBriefingHover(false)}
                >
                  <button
                    className="btn-header"
                    onClick={async () => {
                      const result = await skipSchedule(briefingIndicator._idx, !briefingIndicator.isSkipped);
                      if (result.schedules) setSchedules(result.schedules);
                    }}
                    style={{
                      background: briefingIndicator.isSkipped ? "rgba(245,158,11,0.08)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${briefingIndicator.isSkipped ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.08)"}`,
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 11,
                      color: briefingIndicator.isSkipped ? "#fbbf24" : "#94a3b8",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontWeight: 500,
                      transition: "all 0.2s ease",
                      fontFamily: "inherit",
                    }}
                    onMouseEnter={(e) => {
                      if (briefingIndicator.isSkipped) {
                        e.currentTarget.style.background = "rgba(99,102,241,0.1)";
                        e.currentTarget.style.borderColor = "rgba(99,102,241,0.25)";
                        e.currentTarget.style.color = "#a5b4fc";
                      } else {
                        e.currentTarget.style.background = "rgba(245,158,11,0.08)";
                        e.currentTarget.style.borderColor = "rgba(245,158,11,0.2)";
                        e.currentTarget.style.color = "#fbbf24";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (briefingIndicator.isSkipped) {
                        e.currentTarget.style.background = "rgba(245,158,11,0.08)";
                        e.currentTarget.style.borderColor = "rgba(245,158,11,0.2)";
                        e.currentTarget.style.color = "#fbbf24";
                      } else {
                        e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                        e.currentTarget.style.color = "#94a3b8";
                      }
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>{briefingIndicator.isSkipped
                      ? `${briefingIndicator.label} skipped`
                      : `Next in ${nextBriefingLabel}`}</span>
                  </button>
                  {nextBriefingHover && (
                    <div style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "#1e293b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontSize: 11,
                      color: "#e2e8f0",
                      whiteSpace: "nowrap",
                      zIndex: 50,
                      pointerEvents: "none",
                    }}>
                      {briefingIndicator.isSkipped
                        ? `${briefingIndicator.label} at ${nextBriefingFullTime} · Click to unskip`
                        : `${briefingIndicator.label} at ${nextBriefingFullTime} · Click to skip`}
                    </div>
                  )}
                </div>
              )}
              <a
                href="/settings"
                className="btn-header"
                style={{ textDecoration: "none" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </a>
            </div>
          </div>
          <div
            ref={weatherRef}
            onMouseEnter={() => {
              clearTimeout(weatherLeaveTimer.current);
              setWeatherHover(true);
            }}
            onMouseLeave={() => {
              weatherLeaveTimer.current = setTimeout(() => setWeatherHover(false), 150);
            }}
            style={{
              background: weatherHover ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${weatherHover ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)"}`,
              borderRadius: 12,
              padding: "16px 20px",
              textAlign: "center",
              minWidth: 100,
              cursor: "default",
              transition: "all 0.2s ease",
            }}
          >
            <div style={{ fontSize: 36, lineHeight: 1 }}>☀️</div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 300,
                color: "#f8fafc",
                marginTop: 4,
              }}
            >
              {d.weather.temp}°
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {d.weather.high}° / {d.weather.low}°
            </div>
          </div>
          {weatherHover && (
            <WeatherTooltip
              weather={d.weather}
              triggerRef={weatherRef}
              onMouseEnter={() => clearTimeout(weatherLeaveTimer.current)}
              onMouseLeave={() => setWeatherHover(false)}
            />
          )}
        </div>
      </div>

      {/* Viewing past briefing banner */}
      {viewingPast && (
        <div
          style={{
            background: "rgba(99,102,241,0.06)",
            border: "1px solid rgba(99,102,241,0.15)",
            borderRadius: 8,
            padding: "10px 16px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span style={{ fontSize: 12, color: "#a5b4fc" }}>
            Viewing briefing from{" "}
            {(() => {
              const d2 = new Date(viewingPast.generated_at + "Z");
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
            style={{
              background: "none",
              border: "none",
              color: "#818cf8",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
              textUnderlineOffset: 2,
              transition: "color 0.15s ease, opacity 0.15s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#a5b4fc"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#818cf8"; }}
          >
            Back to latest
          </button>
        </div>
      )}

      {/* Search */}
      <div style={{ opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(12px)", transition: "all 0.6s cubic-bezier(0.16,1,0.3,1) 100ms" }}>
        <BriefingSearch onNavigateToEmail={onNavigateToEmail} />
      </div>

      {/* RAG unavailable warning */}
      {d.ragUnavailable && (
        <div style={{
          fontSize: 11,
          color: "#f59e0b",
          background: "rgba(245,158,11,0.06)",
          border: "1px solid rgba(245,158,11,0.15)",
          borderRadius: 6,
          padding: "6px 10px",
          marginBottom: 16,
          opacity: loaded ? 1 : 0,
          transition: "opacity 0.4s ease 200ms",
        }}>
          Historical context unavailable — insights based on current data only
        </div>
      )}
    </>
  );
}
