import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { suspendService } from "../api";
import LoadingSkeleton from "../components/layout/LoadingSkeleton";
import ErrorState from "../components/layout/ErrorState";
import RefreshBanner from "../components/layout/RefreshBanner";
import DashboardHeader from "../components/layout/DashboardHeader";
import InsightsSection from "../components/briefing/InsightsSection";
import ScheduleSection from "../components/calendar/ScheduleSection";
import DeadlinesSection from "../components/deadlines/DeadlinesSection";
import BillsPaymentsSection from "../components/bills/BillsPaymentsSection";
import EmailTabSection from "../components/email/EmailTabSection";
import SummaryBar from "../components/layout/SummaryBar";

import { DashboardProvider, useDashboard } from "../context/DashboardContext";
import { Button } from "@/components/ui/button";
import useLiveData from "../hooks/useLiveData";
import useHoldGesture from "../hooks/useHoldGesture";
import useBriefingData from "../hooks/useBriefingData";
const DevPanel = import.meta.env.DEV ? lazy(() => import("../components/dev/DevPanel.jsx")) : null;
import useNotifications from "../hooks/useNotifications";

export default function Dashboard() {
  const isMock = new URLSearchParams(window.location.search).has("mock");
  const liveData = useLiveData({ disabled: isMock });
  useNotifications(liveData);

  const bd = useBriefingData({ liveData, isMock });
  const refreshHold = useHoldGesture({ onShortPress: bd.handleQuickRefresh });
  const suspendHold = useHoldGesture();

  // Suspend handler (not briefing-related)
  const [suspending, setSuspending] = useState(false);
  const [suspended, setSuspended] = useState(false);

  async function handleFullGeneration() {
    refreshHold.setShowConfirm(false);
    bd.handleFullGeneration();
  }

  async function handleSuspend() {
    suspendHold.setShowConfirm(false);
    setSuspending(true);
    try {
      await suspendService();
      setSuspended(true);
    } catch (err) {
      console.error("[EA] Suspend failed:", err.message);
    } finally {
      setSuspending(false);
    }
  }

  // R hotkey
  useEffect(() => {
    function onKeyDown(e) {
      if (
        e.repeat ||
        e.key !== "r" ||
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA"
      )
        return;
      if (bd.refreshing || bd.generating) return;
      if (refreshHold.showConfirm) {
        handleFullGeneration();
        return;
      }
      refreshHold.startHold();
    }
    function onKeyUp(e) {
      if (e.key !== "r") return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;
      if (!refreshHold.holdTimerRef.current) return;
      refreshHold.endHold(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  // Reconcile briefing read status from live Gmail data
  useEffect(() => {
    const status = liveData.briefingReadStatus;
    if (!status || !Object.keys(status).length) return;
    bd.setBriefing(prev => {
      if (!prev?.emails?.accounts) return prev;
      let changed = false;
      const accounts = prev.emails.accounts.map(acct => {
        const important = acct.important.map(e => {
          if (!e.read && (status[e.uid] || status[e.id])) {
            changed = true;
            return { ...e, read: true };
          }
          return e;
        });
        if (important === acct.important) return acct;
        return { ...acct, important, unread: important.filter(e => !e.read).length };
      });
      return changed ? { ...prev, emails: { ...prev.emails, accounts } } : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- bd.setBriefing is a stable setState
  }, [liveData.briefingReadStatus]);

  // historyOpen + historyTriggerRef (pure UI state)
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyTriggerRef = useRef(null);

  function onSelectHistory(briefingData, meta) {
    bd.selectHistory(briefingData, meta);
    setHistoryOpen(false);
  }

  // --- Loading / error / empty states ---

  if (bd.loading) return <LoadingSkeleton />;
  if (bd.error && !bd.briefing)
    return (
      <ErrorState message={bd.error} onRetry={() => window.location.reload()} />
    );
  if (!bd.briefing)
    return (
      <div className="min-h-screen text-foreground font-sans flex flex-col items-center justify-center gap-4 p-6">
        <div className="text-5xl">☀️</div>
        <h1 className="font-serif text-[28px] font-normal text-[#f8fafc] m-0">
          No briefings yet
        </h1>
        <p className="text-sm text-muted-foreground m-0 text-center max-w-[400px]">
          Connect your email accounts in Settings, then generate your first
          briefing.
        </p>
        <div className="flex gap-3 mt-2">
          <Button onClick={handleFullGeneration}>
            Generate First Briefing
          </Button>
          <Button variant="outline" asChild>
            <a href="/settings">Settings</a>
          </Button>
        </div>
        {bd.generating && (
          <div className="mt-4">
            <RefreshBanner progress={bd.genProgress} />
          </div>
        )}
      </div>
    );

  // --- Render ---

  return (
    <DashboardProvider briefing={bd.briefing} setBriefing={bd.setBriefing}>
      <DashboardMain
        d={bd.briefing}
        loaded={bd.loaded}
        refreshing={bd.refreshing}
        generating={bd.generating}
        genProgress={bd.genProgress}
        refreshHold={refreshHold}
        onGenerate={handleFullGeneration}
        historyOpen={historyOpen}
        setHistoryOpen={setHistoryOpen}
        historyTriggerRef={historyTriggerRef}
        viewingPast={bd.viewingPast}
        latestId={bd.latestId}
        onSelectHistory={onSelectHistory}
        onBackToLatest={bd.backToLatest}
        onNavigateToEmail={bd.navigateToEmail}
        schedules={bd.schedules}
        setSchedules={bd.setSchedules}
        modelLabel={bd.modelLabel}
        renderConfigured={bd.renderConfigured}
        suspendHold={suspendHold}
        onSuspend={handleSuspend}
        suspending={suspending}
        suspended={suspended}
        liveData={liveData}
      />
      {DevPanel && (
        <Suspense fallback={null}>
          <DevPanel />
        </Suspense>
      )}
    </DashboardProvider>
  );
}

function DashboardMain({
  d,
  loaded,
  refreshing,
  generating,
  genProgress,
  refreshHold,
  onGenerate,
  historyOpen,
  setHistoryOpen,
  historyTriggerRef,
  viewingPast,
  latestId,
  onSelectHistory,
  onBackToLatest,
  onNavigateToEmail,
  schedules,
  setSchedules,
  modelLabel,
  renderConfigured,
  suspendHold,
  onSuspend,
  suspending,
  suspended,
  liveData,
}) {
  const {
    emailAccounts,
    billEmails,
    totalBills,
    emailSectionRef,
    setActiveAccount,
    setSelectedEmail,
  } = useDashboard();

  const halfClass = "";
  const fullClass = "md:col-span-2";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const summaryStats = {
    urgentEmails: emailAccounts
      .flatMap((a) => a.important || [])
      .filter((e) => e.urgency === "high").length,
    billCount: billEmails.length,
    billTotal: totalBills,
    dueToday:
      (d.ctm?.stats?.dueToday || 0) +
      (d.todoist?.stats?.dueToday || 0),
    events: (liveData.liveCalendar || d.calendar)?.filter((e) => !e.allDay)?.length || 0,
    temp: (liveData.liveWeather || d.weather)?.temp,
  };

  function handleNavigateToEmail(params) {
    const { navBriefing, emailId, accountName } = onNavigateToEmail(params);
    const accts = navBriefing.emails?.accounts || [];
    const acctIdx = accts.findIndex((a) => a.name === accountName);
    if (acctIdx >= 0) setActiveAccount(acctIdx);
    const targetAcct = accts[acctIdx >= 0 ? acctIdx : 0];
    const email = (targetAcct?.important || []).find((e) => e.id === emailId);
    if (email) {
      setSelectedEmail(email);
      requestAnimationFrame(() => {
        emailSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  }

  return (
    <div className="min-h-screen text-foreground font-sans p-4 sm:p-6 max-w-[1400px] mx-auto">
      {generating && <RefreshBanner progress={genProgress} />}

      <DashboardHeader
        d={d}
        loaded={loaded}
        refreshing={refreshing}
        generating={generating}
        refreshHold={refreshHold}
        onGenerate={onGenerate}
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
        renderConfigured={renderConfigured}
        suspendHold={suspendHold}
        onSuspend={onSuspend}
        suspending={suspending}
        suspended={suspended}
      />

      <SummaryBar stats={summaryStats} loaded={loaded} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-6">
        <InsightsSection
          insights={d.aiInsights}
          staleCount={d.nonAiGenerationCount || 0}
          aiGeneratedAt={d.aiGeneratedAt}
          loaded={loaded}
          delay={200}
          className={halfClass}
        />

        <ScheduleSection
          calendar={liveData.liveCalendar || d.calendar}
          tomorrowCalendar={liveData.liveTomorrowCalendar || d.tomorrowCalendar}
          nextWeekCalendar={liveData.liveNextWeekCalendar || d.nextWeekCalendar}
          loaded={loaded}
          delay={250}
          className={halfClass}
        />

        <DeadlinesSection
          ctm={d.ctm}
          todoist={d.todoist}
          loaded={loaded}
          delay={350}
          className={halfClass}
        />

        <BillsPaymentsSection
          bills={liveData.liveBills}
          loaded={loaded}
          delay={400}
          className={halfClass}
        />

        <EmailTabSection
          summary={d.emails?.summary}
          model={d.model}
          emails={liveData.liveEmails}
          briefingGeneratedAt={liveData.briefingGeneratedAt}
          loaded={loaded}
          delay={500}
          className={fullClass}
          onRefreshLive={liveData.refreshNow}
        />
      </div>

      <div
        className={`text-center pt-8 pb-4 transition-opacity duration-1000 delay-[1200ms] ${loaded ? "opacity-40" : "opacity-0"}`}
      >
        <div className="text-[11px] text-muted-foreground/40 tracking-[1px]">
          TAP REFRESH FOR DATA · HOLD FOR AI ANALYSIS
        </div>
      </div>
    </div>
  );
}
