import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { suspendService, getCalendarDeadlines, markBillPaid } from "../api";
import EmailRow from "../components/email/EmailRow";
import EmailReaderOverlay from "../components/email/EmailReaderOverlay";
import useEmailReaderNav from "../hooks/email/useEmailReaderNav";
import CTMCard from "../components/ctm/CTMCard";
import { daysUntil, urgencyColor, daysLabel, formatAmount, formatDate } from "../lib/bill-utils";
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
import CalendarModal from "../components/calendar/CalendarModal";
import ContextMenu from "../components/ui/ContextMenu";
import { Sun } from "lucide-react";

import { Link } from "react-router-dom";
import { DashboardProvider, useDashboard } from "../context/DashboardContext";
import { Button } from "@/components/ui/button";
import useLiveData from "../hooks/useLiveData";
import useHoldGesture from "../hooks/useHoldGesture";
import useBriefingData from "../hooks/useBriefingData";
import useAutoRefresh from "../hooks/useAutoRefresh";
const DevPanel = import.meta.env.DEV ? lazy(() => import("../components/dev/DevPanel.jsx")) : null;
import useNotifications from "../hooks/useNotifications";

export default function Dashboard() {
  const [isMock, setIsMock] = useState(() => new URLSearchParams(window.location.search).has("mock"));

  useEffect(() => {
    const handler = (e) => setIsMock(e.detail.scenarios != null);
    window.addEventListener("devpanel:apply", handler);
    return () => window.removeEventListener("devpanel:apply", handler);
  }, []);

  const liveData = useLiveData({ disabled: isMock });
  useNotifications(liveData);

  const bd = useBriefingData({ liveData, isMock });
  const refreshHold = useHoldGesture({ onShortPress: bd.handleQuickRefresh });
  const suspendHold = useHoldGesture();

  useAutoRefresh({
    disabled: isMock,
    lastQuickRefreshAt: bd.lastQuickRefreshAt,
    onQuickRefresh: bd.handleQuickRefresh,
    onSilentRefresh: liveData.refreshNow,
  });

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
        return { ...acct, important, unread: important.length };
      });
      return changed ? { ...prev, emails: { ...prev.emails, accounts } } : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- bd.setBriefing is a stable setState
  }, [liveData.briefingReadStatus]);

  // historyOpen + historyTriggerRef (pure UI state)
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyTriggerRef = useRef(null);

  // Calendar deadlines: lifted here so mutation handlers in DashboardContext
  // can keep this state in sync with briefing changes (task complete/status).
  const [calendarDeadlines, setCalendarDeadlines] = useState(null);
  const calendarDeadlinesLoadingRef = useRef(false);
  const loadCalendarDeadlines = (opts) => {
    if (calendarDeadlinesLoadingRef.current && !opts?.force) return;
    calendarDeadlinesLoadingRef.current = true;
    getCalendarDeadlines()
      .then((data) => setCalendarDeadlines(data))
      .catch((err) => console.error("Calendar deadlines fetch failed:", err))
      .finally(() => { calendarDeadlinesLoadingRef.current = false; });
  };

  // Keep the calendar modal fresh on quick refreshes / full regenerations.
  // Only refetch when we've already loaded once (modal was opened at least
  // once this session); otherwise let the open handler do the initial fetch.
  useEffect(() => {
    if (calendarDeadlines !== null) loadCalendarDeadlines({ force: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bd.lastQuickRefreshAt, bd.latestId]);

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
        <Sun size={48} className="text-[#f9e2af]" />
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
            <Link to="/settings">Settings</Link>
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
    <DashboardProvider
      briefing={bd.briefing}
      setBriefing={bd.setBriefing}
      setCalendarDeadlines={setCalendarDeadlines}
    >
      <DashboardMain
        d={bd.briefing}
        loaded={bd.loaded}
        generating={bd.generating}
        genProgress={bd.genProgress}
        liveData={liveData}
        isMock={isMock}
        viewingPast={bd.viewingPast}
        onNavigateToEmail={bd.navigateToEmail}
        calendarDeadlines={calendarDeadlines}
        loadCalendarDeadlines={loadCalendarDeadlines}
        headerProps={{
          refreshing: bd.refreshing,
          refreshHold,
          onGenerate: handleFullGeneration,
          historyOpen,
          setHistoryOpen,
          historyTriggerRef,
          viewingPast: bd.viewingPast,
          latestId: bd.latestId,
          onSelectHistory,
          onBackToLatest: bd.backToLatest,
          schedules: bd.schedules,
          setSchedules: bd.setSchedules,
          modelLabel: bd.modelLabel,
          renderConfigured: bd.renderConfigured,
          suspendHold,
          onSuspend: handleSuspend,
          suspending,
          suspended,
        }}
      />
      {DevPanel && (
        <Suspense fallback={null}>
          <DevPanel />
        </Suspense>
      )}
    </DashboardProvider>
  );
}

function openInNewTab(url) {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function buildTaskMenu(task, { onComplete, onStatusChange }) {
  const isTodoist = task.source === "todoist";
  const isCanvas = task.source === "canvas";
  const isComplete = task.status === "complete";

  if (isTodoist) {
    return [
      !isComplete && { label: "Mark complete", onSelect: onComplete },
      task.url && { label: "Open in Todoist", onSelect: () => openInNewTab(task.url) },
    ].filter(Boolean);
  }

  const statusItems = [];
  if (task.status !== "incomplete") {
    statusItems.push({ label: "Mark incomplete", onSelect: () => onStatusChange("incomplete") });
  }
  if (task.status !== "in_progress") {
    statusItems.push({ label: "Mark in-progress", onSelect: () => onStatusChange("in_progress") });
  }
  if (task.status !== "complete") {
    statusItems.push({ label: "Mark complete", onSelect: () => onStatusChange("complete") });
  }

  const ctmUrl = `https://ctm.andysu.tech/#/event/${task.id}`;
  const openItems = [];
  if (isCanvas && task.url) {
    openItems.push({ label: "Open in Canvas", onSelect: () => openInNewTab(task.url) });
  }
  openItems.push({ label: "Open in CTM", onSelect: () => openInNewTab(ctmUrl) });

  return [
    ...statusItems,
    { type: "separator" },
    ...openItems,
  ];
}

function DeadlinesModalContent({ tasks, onComplete, onStatusChange }) {
  const [expandedId, setExpandedId] = useState(null);
  const [menuState, setMenuState] = useState(null);

  return (
    <div className="flex flex-col gap-1.5">
      {tasks.map((task) => (
        <CTMCard
          key={`${task.source || "ctm"}-${task.id}`}
          task={task}
          expanded={expandedId === task.id}
          onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)}
          onComplete={onComplete}
          onStatusChange={onStatusChange}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuState({ task, x: e.clientX, y: e.clientY });
          }}
        />
      ))}
      {menuState && (
        <ContextMenu
          x={menuState.x}
          y={menuState.y}
          onClose={() => setMenuState(null)}
          items={buildTaskMenu(menuState.task, {
            onComplete: () => onComplete(menuState.task.id),
            onStatusChange: (status) => onStatusChange(menuState.task.id, status),
          })}
        />
      )}
    </div>
  );
}

// self-contained urgent email list with its own reader overlay so
// arrow nav is scoped to urgent emails, not the account tab
function UrgentEmailList({ emails }) {
  const [openEmail, setOpenEmail] = useState(null);
  const onOpen = useCallback((e) => setOpenEmail(e), []);
  const nav = useEmailReaderNav({ list: emails, openEmail, onOpen });

  return (
    <div className="flex flex-col gap-1.5">
      {emails.map((email) => (
        <EmailRow
          key={email.id}
          email={email}
          onOpen={onOpen}
          preview={email.preview}
          accentBar={
            <div
              className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
              style={{ background: "#f38ba8", opacity: 0.7, boxShadow: "0 0 6px rgba(243,139,168,0.19)" }}
            />
          }
        />
      ))}
      <EmailReaderOverlay
        open={!!openEmail}
        email={openEmail}
        onClose={() => setOpenEmail(null)}
        navigation={nav}
      />
    </div>
  );
}

function DashboardMain({
  d,
  loaded,
  generating,
  genProgress,
  liveData,
  isMock,
  viewingPast,
  onNavigateToEmail,
  calendarDeadlines,
  loadCalendarDeadlines,
  headerProps,
}) {
  const {
    emailAccounts,
    emailSectionRef,
    setActiveAccount,
    setSelectedEmail,
    handleCompleteTask,
    handleUpdateTaskStatus,
  } = useDashboard();

  const halfClass = "";
  const fullClass = "md:col-span-2";

  // Universal calendar (Bills + Deadlines) — state lives at dashboard level
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarView, setCalendarView] = useState(() => {
    try {
      const saved = localStorage.getItem("calendar:lastView");
      return saved === "deadlines" ? "deadlines" : "bills";
    } catch {
      return "bills";
    }
  });
  const showBills = !!liveData.actualConfigured;
  const openCalendar = (viewKey) => {
    const resolved = viewKey === "bills" && !showBills ? "deadlines" : viewKey || calendarView;
    setCalendarView(resolved);
    try { localStorage.setItem("calendar:lastView", resolved); } catch { /* ignore */ }
    setCalendarOpen(true);
    if (resolved === "deadlines") loadCalendarDeadlines();
  };
  const changeCalendarView = (viewKey) => {
    setCalendarView(viewKey);
    try { localStorage.setItem("calendar:lastView", viewKey); } catch { /* ignore */ }
    if (viewKey === "deadlines") loadCalendarDeadlines();
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const urgentEmails = emailAccounts
    .flatMap((a) => (a.important || []).map((e) => ({ ...e, _accountColor: a.color })))
    .filter((e) => e.urgency === "high");

  const ctmToday = (d.ctm?.upcoming || []).filter((t) => {
    if (!t.due_date) return false;
    const due = new Date(t.due_date + "T00:00:00");
    return due.getTime() === today.getTime();
  });
  const todoistToday = (d.todoist?.upcoming || []).filter((t) => {
    if (!t.due_date) return false;
    const due = new Date(t.due_date + "T00:00:00");
    return due.getTime() === today.getTime();
  });
  const deadlinesToday = [...ctmToday, ...todoistToday];

  const unpaidBills = (liveData.liveBills || []).filter((b) => !b.paid);
  const billsDueToday = unpaidBills.filter((b) => daysUntil(b.next_date) === 0);
  const billsOverdue = unpaidBills.filter((b) => daysUntil(b.next_date) < 0);

  const [payingBillId, setPayingBillId] = useState(null);
  async function handleModalMarkPaid(billId) {
    if (payingBillId) return;
    setPayingBillId(billId);
    try {
      await markBillPaid(billId);
      liveData.refreshNow?.();
    } finally {
      setPayingBillId(null);
    }
  }

  // #3 — next upcoming event context
  const calendarEvents = (liveData.liveCalendar || d.calendar)?.filter((e) => !e.allDay) || [];
  const nowMs = Date.now();
  const nextEvent = calendarEvents.find((e) => e.startMs > nowMs) || calendarEvents.find((e) => e.endMs && e.endMs > nowMs);
  const nextEventInfo = nextEvent ? {
    title: nextEvent.title?.length > 20 ? nextEvent.title.slice(0, 20) + "…" : nextEvent.title,
    minutesUntil: Math.max(0, Math.round((nextEvent.startMs - nowMs) / 60000)),
  } : null;

  const summaryStats = {
    urgentEmails: urgentEmails.length,
    billsOverdue: billsOverdue.length,
    billsDueToday: billsDueToday.length,
    dueToday:
      (d.ctm?.stats?.dueToday || 0) +
      (d.todoist?.stats?.dueToday || 0),
    totalDeadlines:
      (d.ctm?.stats?.incomplete || 0) +
      (d.todoist?.stats?.incomplete || 0),
    events: calendarEvents.length,
    nextEvent: nextEventInfo,
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
        generating={generating}
        onNavigateToEmail={handleNavigateToEmail}
        calendarLastView={calendarView}
        calendarShowBills={showBills}
        onOpenCalendar={openCalendar}
        {...headerProps}
      />

      <CalendarModal
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        view={calendarView}
        onViewChange={changeCalendarView}
        billsData={{
          schedules: liveData.allSchedules,
          recentTransactions: liveData.recentTransactions,
          payeeMap: liveData.payeeMap,
          actualBudgetUrl: liveData.actualBudgetUrl,
        }}
        deadlinesData={{
          ctm: calendarDeadlines?.ctm || d.ctm,
          todoist: calendarDeadlines?.todoist || d.todoist,
        }}
      />

      <SummaryBar
        stats={summaryStats}
        loaded={loaded}
        urgentEmails={urgentEmails}
        deadlinesToday={deadlinesToday}
        billsDueToday={[...billsOverdue, ...billsDueToday]}
        modalContent={{
          emails: () => (
            <UrgentEmailList emails={urgentEmails} />
          ),
          deadlines: () => (
            <DeadlinesModalContent
              tasks={deadlinesToday}
              onComplete={handleCompleteTask}
              onStatusChange={handleUpdateTaskStatus}
            />
          ),
          bills: (_onClose) => (
            <div className="flex flex-col gap-1">
              {billsDueToday.map((bill) => {
                const days = daysUntil(bill.next_date);
                const uc = urgencyColor(days);
                return (
                  <div
                    key={bill.id}
                    className="group relative rounded-md py-2 px-3 pl-4 transition-all duration-150"
                    style={{
                      background: `${uc.accent}0a`,
                      border: `1px solid ${uc.accent}20`,
                    }}
                  >
                    <div
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
                      style={{ background: uc.accent, opacity: 0.7, boxShadow: `0 0 6px ${uc.accent}30` }}
                    />
                    <div className="flex justify-between items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-foreground/90">{bill.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {bill.payee && bill.payee !== bill.name && (
                            <span className="text-[11px] text-muted-foreground/40">{bill.payee}</span>
                          )}
                          <span className="text-[11px] text-muted-foreground/50">
                            Due {formatDate(bill.next_date)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleModalMarkPaid(bill.id)}
                          disabled={payingBillId === bill.id}
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-[10px] font-semibold uppercase tracking-wide cursor-pointer rounded px-2 py-0.5"
                          style={{
                            color: "#a6e3a1",
                            background: "rgba(166,227,161,0.1)",
                            border: "1px solid rgba(166,227,161,0.25)",
                            fontFamily: "inherit",
                          }}
                        >
                          {payingBillId === bill.id ? "Marking..." : "Mark paid"}
                        </button>
                        <span
                          className="text-[10px] font-semibold tabular-nums px-2 py-0.5 rounded"
                          style={{ color: uc.text, background: uc.bg }}
                        >
                          {days !== null ? daysLabel(days) : ""}
                        </span>
                        <span className="text-[12px] font-semibold tabular-nums text-foreground/80">
                          {formatAmount(bill.amount)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ),
        }}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-6">
        <InsightsSection
          insights={d.aiInsights}
          staleCount={d.nonAiGenerationCount || 0}
          aiGeneratedAt={d.aiGeneratedAt}
          isLatest={!viewingPast}
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
          recentTransactions={liveData.recentTransactions}
          billsLoading={liveData.billsLoading}
          actualConfigured={liveData.actualConfigured}
          onMarkedPaid={liveData.refreshNow}
          isMock={isMock}
          loaded={loaded}
          delay={400}
          className={halfClass}
        />

        <EmailTabSection
          summary={d.emails?.summary}
          model={d.model}
          emails={liveData.liveEmails}
          pinnedIds={liveData.pinnedIds}
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
