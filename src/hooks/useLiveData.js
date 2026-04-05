import { useState, useEffect, useRef, useCallback } from "react";
import { getLiveData } from "../api";

const POLL_INTERVAL_MS = 5 * 60 * 1000;

export default function useLiveData({ disabled = false } = {}) {
  const [liveEmails, setLiveEmails] = useState([]);
  const [liveCalendar, setLiveCalendar] = useState(null);
  const [liveNextWeekCalendar, setLiveNextWeekCalendar] = useState(null);
  const [liveTomorrowCalendar, setLiveTomorrowCalendar] = useState(null);
  const [liveWeather, setLiveWeather] = useState(null);
  const [liveBills, setLiveBills] = useState([]);
  const [importantSenders, setImportantSenders] = useState([]);
  const [briefingGeneratedAt, setBriefingGeneratedAt] = useState(null);
  const [briefingReadStatus, setBriefingReadStatus] = useState({});
  const [lastFetched, setLastFetched] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [billsLoading, setBillsLoading] = useState(true);
  const [actualConfigured, setActualConfigured] = useState(false);
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);
  const fetchingRef = useRef(false);

  const fetchLive = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setIsPolling(true);
    try {
      const data = await getLiveData();
      if (!mountedRef.current) return;
      setLiveEmails(data.emails || []);
      setLiveCalendar(data.calendar || null);
      setLiveNextWeekCalendar(data.nextWeekCalendar || null);
      setLiveTomorrowCalendar(data.tomorrowCalendar || null);
      setLiveWeather(data.weather || null);
      setLiveBills(data.bills || []);
      setImportantSenders(data.importantSenders || []);
      setBriefingGeneratedAt(data.briefingGeneratedAt || null);
      setBriefingReadStatus(data.briefingReadStatus || {});
      setLastFetched(data.fetchedAt || new Date().toISOString());
      setActualConfigured(data.actualConfigured || false);
      setBillsLoading(false);
    } catch (err) {
      console.error("[Live] Fetch failed:", err.message);
      setBillsLoading(false);
    } finally {
      fetchingRef.current = false;
      if (mountedRef.current) setIsPolling(false);
    }
  }, []);

  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (document.visibilityState !== "hidden") {
        fetchLive();
      }
    }, POLL_INTERVAL_MS);
  }, [fetchLive]);

  // Manual refresh — also resets the auto-poll timer
  const refreshNow = useCallback(async () => {
    await fetchLive();
    startInterval();
  }, [fetchLive, startInterval]);

  useEffect(() => {
    mountedRef.current = true;
    if (disabled) return;
    fetchLive();
    startInterval();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchLive();
        startInterval();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchLive, startInterval, disabled]);

  return {
    liveEmails,
    liveCalendar,
    liveNextWeekCalendar,
    liveTomorrowCalendar,
    liveWeather,
    liveBills,
    importantSenders,
    briefingGeneratedAt,
    briefingReadStatus,
    lastFetched,
    isPolling,
    billsLoading,
    actualConfigured,
    refreshNow,
  };
}
