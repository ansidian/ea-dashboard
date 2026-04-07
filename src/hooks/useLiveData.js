import { useState, useEffect, useRef, useCallback } from "react";
import { getLiveData } from "../api";

export default function useLiveData({ disabled = false } = {}) {
  const [liveEmails, setLiveEmails] = useState([]);
  const [liveCalendar, setLiveCalendar] = useState(null);
  const [liveNextWeekCalendar, setLiveNextWeekCalendar] = useState(null);
  const [liveTomorrowCalendar, setLiveTomorrowCalendar] = useState(null);
  const [liveWeather, setLiveWeather] = useState(null);
  const [liveBills, setLiveBills] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [importantSenders, setImportantSenders] = useState([]);
  const [briefingGeneratedAt, setBriefingGeneratedAt] = useState(null);
  const [briefingReadStatus, setBriefingReadStatus] = useState({});
  const [lastFetched, setLastFetched] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [billsLoading, setBillsLoading] = useState(true);
  const [actualConfigured, setActualConfigured] = useState(true);
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
      setRecentTransactions(data.recentTransactions || []);
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

  const refreshNow = fetchLive;

  useEffect(() => {
    mountedRef.current = true;
    if (disabled) {
      setLiveBills([]);
      setRecentTransactions([]);
      setBillsLoading(true);
      setActualConfigured(true);
      return;
    }
    fetchLive();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchLive, disabled]);

  return {
    liveEmails,
    liveCalendar,
    liveNextWeekCalendar,
    liveTomorrowCalendar,
    liveWeather,
    liveBills,
    recentTransactions,
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
