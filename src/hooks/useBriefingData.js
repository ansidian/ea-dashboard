import { useState, useEffect } from "react";
import {
  getLatestBriefing,
  triggerGeneration,
  quickRefresh,
  pollStatus,
  checkInProgress,
  getSettings,
} from "../api";
import { transformBriefing } from "../transform";

export default function useBriefingData({ liveData, isMock }) {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [modelLabel, setModelLabel] = useState("Claude");
  const [genProgress, setGenProgress] = useState(null);
  const [viewingPast, setViewingPast] = useState(null);
  const [latestBriefing, setLatestBriefing] = useState(null);
  const [latestId, setLatestId] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [renderConfigured, setRenderConfigured] = useState(false);

  // --- Polling ---

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
        if (s?.render_configured) setRenderConfigured(true);
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
  }, [isMock]);

  // --- Actions ---

  async function handleQuickRefresh() {
    if (refreshing || generating) return;
    setRefreshing(true);
    try {
      const [result] = await Promise.all([
        quickRefresh(),
        liveData.refreshNow(),
      ]);
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

  async function handleFullGeneration() {
    setGenerating(true);
    try {
      const genResult = await triggerGeneration();
      startPolling(genResult.id);
    } catch (err) {
      setError(err.message);
      setGenerating(false);
    }
  }

  // --- History navigation ---

  function selectHistory(briefingData, meta) {
    setBriefing(briefingData);
    setViewingPast(meta.id === latestId ? null : meta);
  }

  function backToLatest() {
    setBriefing(latestBriefing);
    setViewingPast(null);
  }

  function navigateToEmail({ briefing: navBriefing, briefingId, generated_at, emailId, accountName }) {
    if (!latestBriefing) setLatestBriefing(briefing);
    setBriefing(navBriefing);
    if (briefingId !== latestId) {
      setViewingPast({ id: briefingId, generated_at });
    }
    return { navBriefing, emailId, accountName };
  }

  return {
    briefing,
    setBriefing,
    loading,
    refreshing,
    generating,
    error,
    loaded,
    modelLabel,
    genProgress,
    viewingPast,
    latestId,
    schedules,
    setSchedules,
    renderConfigured,
    handleQuickRefresh,
    handleFullGeneration,
    selectHistory,
    backToLatest,
    navigateToEmail,
  };
}
