import { useState, useEffect, useRef } from "react";
import { getLatestBriefing, triggerGeneration, quickRefresh, pollStatus, checkInProgress, getSettings, dismissEmail } from "../api";
import { transformBriefing } from "../transform";
import LoadingSkeleton from "../components/LoadingSkeleton";
import ErrorState from "../components/ErrorState";
import RefreshBanner from "../components/RefreshBanner";
import DashboardHeader from "../components/DashboardHeader";
import InsightsSection from "../components/InsightsSection";
import ScheduleSection from "../components/ScheduleSection";
import DeadlinesSection from "../components/DeadlinesSection";
import BillsSection from "../components/BillsSection";
import EmailSection from "../components/EmailSection";
import SummaryBar from "../components/SummaryBar";
import { parseDueDate } from "../lib/dashboard-helpers";
import useMediaQuery from "../hooks/useMediaQuery";

export default function Dashboard() {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [activeAccount, setActiveAccount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [loadingBillId, setLoadingBillId] = useState(null);
  const [confirmDismissId, setConfirmDismissId] = useState(null);
  const [expandedTask, setExpandedTask] = useState(null);
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
  const emailSectionRef = useRef(null);
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

  async function handleDismiss(emailId) {
    dismissEmail(emailId).catch(() => {});
    if (selectedEmail?.id === emailId) setSelectedEmail(null);
    setBriefing(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      for (const acct of updated.emails?.accounts || []) {
        acct.important = acct.important.filter(e => e.id !== emailId);
        acct.unread = acct.important.length;
      }
      return updated;
    });
  }

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

  const isWide = useMediaQuery("(min-width: 768px)");
  const halfStyle = isWide ? { flex: "1 1 calc(50% - 12px)", minWidth: 0, marginBottom: 0 } : {};
  const fullStyle = isWide ? { flex: "1 1 100%", marginBottom: 0 } : {};

  // --- Loading / error / empty states ---

  if (loading) return <LoadingSkeleton />;
  if (error && !briefing)
    return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (!briefing)
    return (
      <div
        style={{
          minHeight: "100vh",
          color: "#e2e8f0",
          fontFamily: "'DM Sans', sans-serif",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
        }}
      >
        <div style={{ fontSize: 48 }}>☀️</div>
        <h1
          style={{
            fontFamily: "'DM Serif Display', Georgia, serif",
            fontSize: 28,
            fontWeight: 400,
            color: "#f8fafc",
            margin: 0,
          }}
        >
          No briefings yet
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "#64748b",
            margin: 0,
            textAlign: "center",
            maxWidth: 400,
          }}
        >
          Connect your email accounts in Settings, then generate your first briefing.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button onClick={handleFullGeneration} className="btn-primary">
            Generate First Briefing
          </button>
          <a href="/settings" className="btn-secondary">
            Settings
          </a>
        </div>
        {generating && (
          <div style={{ marginTop: 16 }}>
            <RefreshBanner progress={genProgress} />
          </div>
        )}
      </div>
    );

  // --- Derived data ---

  const d = briefing;
  const emailAccounts = d.emails?.accounts || [];
  const billEmails = emailAccounts.flatMap((acc, accIdx) =>
    (acc.important || [])
      .filter((e) => e.hasBill)
      .map((e) => ({ ...e, accountColor: acc.color, _accIdx: accIdx })),
  );
  const totalBills = billEmails.reduce(
    (sum, e) => sum + (e.extractedBill?.amount || 0),
    0,
  );
  const currentAccount = emailAccounts[activeAccount] || {
    important: [],
    name: "",
    icon: "",
    color: "#818cf8",
    unread: 0,
  };

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

  // --- Search navigation handler ---

  function handleNavigateToEmail({ briefing: navBriefing, briefingId, generated_at, emailId, accountName }) {
    if (!latestBriefing) setLatestBriefing(briefing);
    setBriefing(navBriefing);
    if (briefingId !== latestId) {
      setViewingPast({ id: briefingId, generated_at });
    }
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

  // --- Render ---

  return (
    <div
      style={{
        minHeight: "100vh",
        color: "#e2e8f0",
        fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
        padding: "24px",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
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
        schedules={schedules}
        setSchedules={setSchedules}
        modelLabel={modelLabel}
        onNavigateToEmail={handleNavigateToEmail}
      />

      <SummaryBar stats={summaryStats} loaded={loaded} />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 24,
        }}
      >
        <ScheduleSection
          calendar={d.calendar}
          loaded={loaded}
          delay={200}
          style={halfStyle}
        />

        <InsightsSection
          insights={d.aiInsights}
          loaded={loaded}
          delay={300}
          style={halfStyle}
        />

        <DeadlinesSection
          ctm={d.ctm}
          deadlines={d.deadlines}
          emailAccounts={emailAccounts}
          expandedTask={expandedTask}
          setExpandedTask={setExpandedTask}
          setActiveAccount={setActiveAccount}
          setSelectedEmail={setSelectedEmail}
          loaded={loaded}
          delay={400}
          style={halfStyle}
        />

        <BillsSection
          billEmails={billEmails}
          totalBills={totalBills}
          emailAccounts={emailAccounts}
          selectedEmail={selectedEmail}
          setSelectedEmail={setSelectedEmail}
          setActiveAccount={setActiveAccount}
          loadingBillId={loadingBillId}
          setLoadingBillId={setLoadingBillId}
          confirmDismissId={confirmDismissId}
          setConfirmDismissId={setConfirmDismissId}
          onDismiss={handleDismiss}
          loaded={loaded}
          delay={500}
          style={halfStyle}
        />

        <EmailSection
          summary={d.emails?.summary}
          emailAccounts={emailAccounts}
          currentAccount={currentAccount}
          activeAccount={activeAccount}
          setActiveAccount={setActiveAccount}
          selectedEmail={selectedEmail}
          setSelectedEmail={setSelectedEmail}
          confirmDismissId={confirmDismissId}
          setConfirmDismissId={setConfirmDismissId}
          onDismiss={handleDismiss}
          loadingBillId={loadingBillId}
          setLoadingBillId={setLoadingBillId}
          emailSectionRef={emailSectionRef}
          model={d.model}
          loaded={loaded}
          delay={600}
          style={fullStyle}
        />
      </div>

      <div
        style={{
          textAlign: "center",
          padding: "32px 0 16px",
          opacity: loaded ? 0.4 : 0,
          transition: "opacity 1s ease 1.2s",
        }}
      >
        <div style={{ fontSize: 11, color: "#475569", letterSpacing: 1 }}>
          TAP REFRESH FOR DATA · HOLD FOR AI ANALYSIS
        </div>
      </div>
    </div>
  );
}
