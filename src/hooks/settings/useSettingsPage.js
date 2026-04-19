import { useCallback, useEffect, useRef, useState } from "react";
import { getAccounts, getSettings, updateSettings } from "@/api";
import { readTabFromURL, writeTabToURL } from "@/components/settings/settings-core";

function useSettingsAutoSave() {
  const [status, setStatus] = useState("idle");
  const pendingRef = useRef({});
  const timerRef = useRef(null);
  const statusTimerRef = useRef(null);

  const flush = useCallback(async () => {
    const payload = pendingRef.current;
    pendingRef.current = {};
    if (!Object.keys(payload).length) return;
    setStatus("saving");
    try {
      await updateSettings(payload);
      sessionStorage.setItem("ea_settings_changed", "1");
      setStatus("saved");
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = setTimeout(
        () => setStatus((current) => (current === "saved" ? "idle" : current)),
        1500
      );
    } catch {
      setStatus("error");
    }
  }, []);

  const patch = useCallback((updates) => {
    Object.assign(pendingRef.current, updates);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 500);
  }, [flush]);

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    clearTimeout(statusTimerRef.current);
  }, []);

  return { patch, status };
}

export default function useSettingsPage() {
  const [accounts, setAccounts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(readTabFromURL);
  const { patch, status: saveStatus } = useSettingsAutoSave();

  useEffect(() => {
    writeTabToURL(tab);
  }, [tab]);

  useEffect(() => {
    Promise.all([getAccounts(), getSettings()])
      .then(([accountsResult, settingsResult]) => {
        setAccounts(accountsResult.accounts || accountsResult);
        setSettings(settingsResult);
      })
      .catch(() => {
        setAccounts([]);
        setSettings({});
      })
      .finally(() => setLoading(false));
  }, []);

  return {
    accounts,
    setAccounts,
    settings,
    setSettings,
    loading,
    tab,
    setTab,
    saveStatus,
    patch,
  };
}
