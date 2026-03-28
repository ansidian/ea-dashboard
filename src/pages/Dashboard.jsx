import { useState, useEffect, useRef } from "react";
import { getLatestBriefing, triggerGeneration, quickRefresh, pollStatus, checkInProgress, getSettings } from "../api";
import { transformBriefing } from "../transform";
import LoadingSkeleton from "../components/layout/LoadingSkeleton";
import ErrorState from "../components/layout/ErrorState";
import RefreshBanner from "../components/layout/RefreshBanner";
import DashboardHeader from "../components/layout/DashboardHeader";
import InsightsSection from "../components/briefing/InsightsSection";
import ScheduleSection from "../components/calendar/ScheduleSection";
import DeadlinesSection from "../components/deadlines/DeadlinesSection";
import BillsSection from "../components/bills/BillsSection";
import EmailSection from "../components/email/EmailSection";
import SummaryBar from "../components/layout/SummaryBar";
import { parseDueDate } from "../lib/dashboard-helpers";
import { DashboardProvider, useDashboard } from "../context/DashboardContext";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [holdConfirm, setHoldConfirm] = useState(false);
  const [modelLabel, setModelLabel] = useState("Claude");
  const [genProgress, setGenProgress] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingPast, setViewingPast] = useState(null);
  const [latestBriefing, setLatestBriefing] = useState(null);
  const [latestId, setLatestId] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef(null);
  const holdProgressRef = useRef(null);
  const historyTriggerRef = useRef(null);

  // --- Data fetching ---

  useEffect(() => {
    getSettings()
      .then((s) => {
        const id = s?.claude_model || "claude-haiku-4-5-20251001";
        const name = id
          .replace(/^claude-/, "")
          .replace(/-\d{8,}$/, "")
          .replace(
            /(\w+)-(\d+)-(\d+)/,
            (_, n, maj, min) =>
              `${n.charAt(0).toUpperCase() + n.slice(1)} ${maj}.${min}`,
          )
          .replace(/(\w+)$/, (m) => m.charAt(0).toUpperCase() + m.slice(1));
        setModelLabel(`Claude ${name}`);
        if (s?.schedules) setSchedules(s.schedules);
      })
      .catch(() => {});

    checkInProgress()
      .then(({ generating: inProgress, id, progress }) => {
        if (inProgress && id) {
          if (progress) setGenProgress(progress);
          startPolling(id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    getLatestBriefing()
      .then((res) => {
        const transformed = transformBriefing(res.briefing);
        setBriefing(transformed);
        setLatestBriefing(transformed);
        setLatestId(res.id);

        const isMock = new URLSearchParams(window.location.search).has("mock");
        if (isMock) return;
        sessionStorage.removeItem("ea_settings_changed");
        setRefreshing(true);
        quickRefresh()
          .then((result) => {
            const updated = transformBriefing(result.briefingJson);
            setBriefing(updated);
            setLatestBriefing(updated);
            setLatestId(result.id);
          })
          .catch(() => {})
          .finally(() => setRefreshing(false));
      })
      .catch((err) => setError(err.message))
      .finally(() => {
        setLoading(false);
        setTimeout(() => setLoaded(true), 100);
      });
  }, []);

  // --- Actions ---

  async function handleQuickRefresh() {
    if (refreshing || generating) return;
    setRefreshing(true);
    try {
      const result = await quickRefresh();
      const transformed = transformBriefing(result.briefingJson);
      setBriefing(transformed);
      setLatestBriefing(transformed);
      setLatestId(result.id);
      setViewingPast(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  function startPolling(id) {
    setGenerating(true);
    const poll = setInterval(async () => {
      try {
        const { status, error_message, progress } = await pollStatus(id);
        if (progress) setGenProgress(progress);
        if (status === "ready") {
          clearInterval(poll);
          setGenProgress(null);
          const res = await getLatestBriefing();
          const transformed = transformBriefing(res.briefing);
          setBriefing(transformed);
          setLatestBriefing(transformed);
          setLatestId(res.id);
          setViewingPast(null);
          setGenerating(false);
        } else if (status === "error") {
          clearInterval(poll);
          setGenProgress(null);
          setError(error_message);
          setGenerating(false);
        }
      } catch {
        clearInterval(poll);
        setGenProgress(null);
        setError("Lost connection while generating briefing.");
        setGenerating(false);
      }
    }, 2000);
  }

  async function handleFullGeneration() {
    setHoldConfirm(false);
    setGenerating(true);
    try {
      const genResult = await triggerGeneration();
      startPolling(genResult.id);
    } catch (err) {
      setError(err.message);
      setGenerating(false);
    }
  }

  // --- Long press handlers ---

  const HOLD_DURATION = 600;
  function startHold() {
    if (refreshing || generating) return;
    setHoldProgress(0);
    const start = Date.now();
    holdProgressRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / HOLD_DURATION) * 100, 100);
      setHoldProgress(pct);
    }, 16);
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = "fired";
      clearInterval(holdProgressRef.current);
      setHoldProgress(0);
      setHoldConfirm(true);
    }, HOLD_DURATION);
  }
  function endHold(cancel) {
    clearInterval(holdProgressRef.current);
    setHoldProgress(0);
    if (holdTimerRef.current === "fired") {
      holdTimerRef.current = null;
      return;
    }
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    if (!cancel) handleQuickRefresh();
  }
  function onPointerDown() { startHold(); }
  function onPointerUp() { endHold(false); }
  function onPointerLeave() { endHold(true); }

  // R hotkey
  useEffect(() => {
    function onKeyDown(e) {
      if (e.repeat || e.key !== "r" || e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (holdConfirm) {
        handleFullGeneration();
        return;
      }
      startHold();
    }
    function onKeyUp(e) {
      if (e.key !== "r") return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (!holdTimerRef.current) return;
      endHold(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  // --- Loading / error / empty states ---

  if (loading) return <LoadingSkeleton />;
  if (error && !briefing)
    return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (!briefing)
    return (
      <div className="min-h-screen text-text-body font-sans flex flex-col items-center justify-center gap-4 p-6">
        <div className="text-5xl">☀️</div>
        <h1 className="font-serif text-[28px] font-normal text-[#f8fafc] m-0">
          No briefings yet
        </h1>
        <p className="text-sm text-text-muted m-0 text-center max-w-[400px]">
          Connect your email accounts in Settings, then generate your first briefing.
        </p>
        <div className="flex gap-3 mt-2">
          <Button onClick={handleFullGeneration}>
            Generate First Briefing
          </Button>
          <Button variant="outline" asChild>
            <a href="/settings">Settings</a>
          </Button>
        </div>
        {generating && (
          <div className="mt-4">
            <RefreshBanner progress={genProgress} />
          </div>
        )}
      </div>
    );

  // --- Render ---

  return (
    <DashboardProvider briefing={briefing} setBriefing={setBriefing}>
      <DashboardMain
        d={briefing}
        loaded={loaded}
        refreshing={refreshing}
        generating={generating}
        genProgress={genProgress}
        holdProgress={holdProgress}
        holdConfirm={holdConfirm}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onGenerate={handleFullGeneration}
        setHoldConfirm={setHoldConfirm}
        historyOpen={historyOpen}
        setHistoryOpen={setHistoryOpen}
        historyTriggerRef={historyTriggerRef}
        viewingPast={viewingPast}
        latestId={latestId}
        onSelectHistory={(briefingData, meta) => {
          setBriefing(briefingData);
          setViewingPast(meta.id === latestId ? null : meta);
          setHistoryOpen(false);
        }}
        onBackToLatest={() => {
          setBriefing(latestBriefing);
          setViewingPast(null);
        }}
        onNavigateToEmail={({ briefing: navBriefing, briefingId, generated_at, emailId, accountName }) => {
          if (!latestBriefing) setLatestBriefing(briefing);
          setBriefing(navBriefing);
          if (briefingId !== latestId) {
            setViewingPast({ id: briefingId, generated_at });
          }
          return { navBriefing, emailId, accountName };
        }}
        schedules={schedules}
        setSchedules={setSchedules}
        modelLabel={modelLabel}
      />
    </DashboardProvider>
  );
}

function DashboardMain({
  d, loaded, refreshing, generating, genProgress,
  holdProgress, holdConfirm, onPointerDown, onPointerUp, onPointerLeave,
  onGenerate, setHoldConfirm, historyOpen, setHistoryOpen, historyTriggerRef,
  viewingPast, latestId, onSelectHistory, onBackToLatest, onNavigateToEmail,
  schedules, setSchedules, modelLabel,
}) {
  const {
    emailAccounts, billEmails, totalBills, emailSectionRef,
    setActiveAccount, setSelectedEmail,
  } = useDashboard();

  const halfClass = "";
  const fullClass = "md:col-span-2";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const summaryStats = {
    urgentEmails: emailAccounts.flatMap(a => a.important || []).filter(e => e.urgency === "high").length,
    billCount: billEmails.length,
    billTotal: totalBills,
    dueToday: (d.ctm?.stats?.dueToday || 0) +
      (d.deadlines || []).filter(dl => {
        const dateStr = dl.due_date || dl.due;
        if (!dateStr) return false;
        const due = parseDueDate(dateStr);
        return due.getTime() === today.getTime();
      }).length,
    meetings: d.calendar?.length || 0,
    temp: d.weather?.temp,
  };

  function handleNavigateToEmail(params) {
    const { navBriefing, emailId, accountName } = onNavigateToEmail(params);
    const accts = navBriefing.emails?.accounts || [];
    const acctIdx = accts.findIndex(a => a.name === accountName);
    if (acctIdx >= 0) setActiveAccount(acctIdx);
    const targetAcct = accts[acctIdx >= 0 ? acctIdx : 0];
    const email = (targetAcct?.important || []).find(e => e.id === emailId);
    if (email) {
      setSelectedEmail(email);
      requestAnimationFrame(() => {
        emailSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  return (
    <div className="min-h-screen text-text-body font-sans p-6 max-w-[1200px] mx-auto">
      {generating && <RefreshBanner progress={genProgress} />}

      <DashboardHeader
        d={d}
        loaded={loaded}
        refreshing={refreshing}
        generating={generating}
        holdProgress={holdProgress}
        holdConfirm={holdConfirm}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onGenerate={onGenerate}
        setHoldConfirm={setHoldConfirm}
        historyOpen={historyOpen}
        setHistoryOpen={setHistoryOpen}
        historyTriggerRef={historyTriggerRef}
        viewingPast={viewingPast}
        latestId={latestId}
        onSelectHistory={onSelectHistory}
        onBackToLatest={onBackToLatest}
        schedules={schedules}
        setSchedules={setSchedules}
        modelLabel={modelLabel}
        onNavigateToEmail={handleNavigateToEmail}
      />

      <SummaryBar stats={summaryStats} loaded={loaded} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ScheduleSection
          calendar={d.calendar}
          loaded={loaded}
          delay={200}
          className={halfClass}
        />

        <InsightsSection
          insights={d.aiInsights}
          loaded={loaded}
          delay={300}
          className={halfClass}
        />

        <DeadlinesSection
          ctm={d.ctm}
          deadlines={d.deadlines}
          loaded={loaded}
          delay={400}
          className={halfClass}
        />

        <BillsSection
          loaded={loaded}
          delay={500}
          className={halfClass}
        />

        <EmailSection
          summary={d.emails?.summary}
          model={d.model}
          loaded={loaded}
          delay={600}
          className={fullClass}
        />
      </div>

      <div className={`text-center pt-8 pb-4 transition-opacity duration-1000 delay-[1200ms] ${loaded ? "opacity-40" : "opacity-0"}`}>
        <div className="text-[11px] text-[#475569] tracking-[1px]">
          TAP REFRESH FOR DATA · HOLD FOR AI ANALYSIS
        </div>
      </div>
    </div>
  );
}
