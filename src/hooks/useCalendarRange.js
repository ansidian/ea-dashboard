import { useCallback, useRef, useState } from "react";
import { getCalendarRange } from "../api";

function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

// Given an inclusive date range, return the set of month keys it touches.
function monthsInRange(start, end) {
  const result = [];
  const s = new Date(`${start}T12:00:00Z`);
  const e = new Date(`${end}T12:00:00Z`);
  const cur = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1));
  while (cur <= e) {
    result.push(monthKey(cur.getUTCFullYear(), cur.getUTCMonth()));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return result;
}

function monthBounds(key) {
  const [y, m] = key.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export default function useCalendarRange({ disabled = false } = {}) {
  const cacheRef = useRef(new Map()); // monthKey -> event[]
  const inFlightRef = useRef(new Map()); // monthKey -> Promise<void>
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [, forceUpdate] = useState(0);

  const getEvents = useCallback((year, month) => {
    return cacheRef.current.get(monthKey(year, month)) || [];
  }, []);

  const fetchMonth = useCallback(async (key) => {
    const existing = inFlightRef.current.get(key);
    if (existing) return existing;

    const { start, end } = monthBounds(key);
    const promise = (async () => {
      try {
        const { events } = await getCalendarRange(start, end);
        cacheRef.current.set(key, events || []);
      } finally {
        inFlightRef.current.delete(key);
      }
    })();
    inFlightRef.current.set(key, promise);
    return promise;
  }, []);

  const ensureRange = useCallback(async (start, end) => {
    if (disabled) return [];

    const keys = monthsInRange(start, end);
    const missing = keys.filter((k) => !cacheRef.current.has(k));

    if (missing.length > 0) {
      setLoading(true);
      setError(null);
      try {
        await Promise.all(missing.map(fetchMonth));
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
        forceUpdate((n) => n + 1);
      }
    }

    // Flatten cached months and trim to [start, end]
    const startMs = new Date(`${start}T00:00:00Z`).getTime();
    const endMs = new Date(`${end}T23:59:59.999Z`).getTime();
    const all = [];
    for (const k of keys) {
      for (const ev of cacheRef.current.get(k) || []) {
        if (ev.startMs >= startMs && ev.startMs <= endMs) all.push(ev);
      }
    }
    return all;
  }, [disabled, fetchMonth]);

  const invalidate = useCallback(() => {
    cacheRef.current.clear();
    inFlightRef.current.clear();
    forceUpdate((n) => n + 1);
  }, []);

  return { getEvents, ensureRange, invalidate, loading, error };
}
