import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarSources,
  getGmailAuthUrl,
  updateCalendarEvent,
} from "@/api";

function pacificYMD(ms) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function pacificTime(ms) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

function addDaysIso(dateStr, delta) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function todayYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function defaultDraft(selectedDate) {
  const date = selectedDate || todayYmd();
  return {
    title: "",
    allDay: false,
    startDate: date,
    endDate: date,
    startTime: "09:00",
    endTime: "09:30",
    accountId: "",
    calendarId: "",
    location: "",
    description: "",
  };
}

function draftFromEvent(event) {
  const startDate = pacificYMD(event.startMs);
  const endDate = event.allDay
    ? addDaysIso(pacificYMD(event.endMs), -1)
    : pacificYMD(event.endMs);

  return {
    title: event.title || "",
    allDay: !!event.allDay,
    startDate,
    endDate,
    startTime: event.allDay ? "09:00" : pacificTime(event.startMs),
    endTime: event.allDay ? "09:30" : pacificTime(event.endMs),
    accountId: event.accountId || "",
    calendarId: event.calendarId || "",
    location: event.location || "",
    description: event.description || "",
  };
}

function eventBounds(event) {
  if (!event) return null;
  const start = pacificYMD(event.startMs);
  const end = event.allDay
    ? addDaysIso(pacificYMD(event.endMs), -1)
    : pacificYMD(event.endMs);
  return { start, end };
}

function draftBounds(draft) {
  if (!draft?.startDate) return null;
  return { start: draft.startDate, end: draft.endDate || draft.startDate };
}

function mergeBounds(...allBounds) {
  const bounds = allBounds.filter(Boolean);
  if (!bounds.length) return null;
  let start = bounds[0].start;
  let end = bounds[0].end;
  for (const entry of bounds.slice(1)) {
    if (entry.start < start) start = entry.start;
    if (entry.end > end) end = entry.end;
  }
  return { start, end };
}

function ymdFromView({ viewYear, viewMonth, selectedDay }) {
  if (!selectedDay) return null;
  return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;
}

function flattenWritableCalendars(sourceGroups) {
  const flat = [];
  for (const group of sourceGroups || []) {
    for (const calendar of group.calendars || []) {
      if (!calendar.writable) continue;
      flat.push({
        accountId: group.accountId,
        accountLabel: group.accountLabel,
        value: `${group.accountId}::${calendar.id}`,
        calendarId: calendar.id,
        summary: calendar.summary,
        label: calendar.summary,
        color: calendar.backgroundColor || "#4285f4",
        primary: !!calendar.primary,
      });
    }
  }
  return flat;
}

function inferNoWritableReason(sourceGroups) {
  for (const group of sourceGroups || []) {
    for (const calendar of group.calendars || []) {
      if (calendar.accessRole === "owner" || calendar.accessRole === "writer") {
        return "calendar_reauth_required";
      }
    }
  }
  return "calendar_no_writable_sources";
}

export default function useCalendarEventEditor({
  open,
  view,
  editable = true,
  selectedDay,
  viewYear,
  viewMonth,
  refreshRange,
  onFocusDate,
}) {
  const [mode, setMode] = useState("detail");
  const [sourceGroups, setSourceGroups] = useState([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [draft, setDraft] = useState(() => defaultDraft(null));
  const [editingEvent, setEditingEvent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const [touchedFields, setTouchedFields] = useState({});
  const [saveAttempted, setSaveAttempted] = useState(false);

  const selectedDate = ymdFromView({ viewYear, viewMonth, selectedDay });
  const writableCalendars = useMemo(
    () => flattenWritableCalendars(sourceGroups),
    [sourceGroups],
  );
  const validationMessage = useMemo(() => {
    const title = String(draft.title || "").trim();
    if (!title) return "Title is required.";
    if (!draft.accountId || !draft.calendarId) return "Choose a writable calendar.";
    if (!draft.startDate || !draft.endDate) return "Start and end dates are required.";
    if (draft.endDate < draft.startDate) return "End date must be on or after the start date.";
    if (draft.allDay) return null;
    if (!draft.startTime || !draft.endTime) return "Start and end times are required.";
    const startIso = `${draft.startDate}T${draft.startTime}:00`;
    const endIso = `${draft.endDate}T${draft.endTime}:00`;
    if (endIso <= startIso) return "End time must be after start time.";
    return null;
  }, [draft]);
  const visibleValidationMessage = useMemo(() => {
    if (!validationMessage) return null;
    if (validationMessage === "Title is required." && !touchedFields.title && !saveAttempted) {
      return null;
    }
    return validationMessage;
  }, [saveAttempted, touchedFields.title, validationMessage]);
  const canSave = editable && !saving && !deleting && !validationMessage;

  const ensureSources = useCallback(async () => {
    if (!editable) return [];
    if (sourcesLoaded) return sourceGroups;

    setSourcesLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const data = await getCalendarSources();
      const groups = data?.accounts || [];
      setSourceGroups(groups);
      setSourcesLoaded(true);
      return groups;
    } catch (err) {
      setError(err.message || "Failed to load calendar sources.");
      setErrorCode(err.code || null);
      return [];
    } finally {
      setSourcesLoading(false);
    }
  }, [editable, sourceGroups, sourcesLoaded]);

  useEffect(() => {
    if (!open || view !== "events") {
      setMode("detail");
      setEditingEvent(null);
      setConfirmDelete(false);
      setError(null);
      setErrorCode(null);
      setTouchedFields({});
      setSaveAttempted(false);
    }
  }, [open, view]);

  const seedDefaultCalendar = useCallback((nextDraft, groups) => {
    if (nextDraft.accountId && nextDraft.calendarId) return nextDraft;
    const writable = flattenWritableCalendars(groups);
    const preferred = writable.find((entry) => entry.primary) || writable[0];
    if (!preferred) return nextDraft;
    return {
      ...nextDraft,
      accountId: preferred.accountId,
      calendarId: preferred.calendarId,
    };
  }, []);

  const openCreate = useCallback(async () => {
    if (!editable) return;
    const groups = await ensureSources();
    const nextDraft = seedDefaultCalendar(defaultDraft(selectedDate), groups);
    setDraft(nextDraft);
    setEditingEvent(null);
    setConfirmDelete(false);
    setTouchedFields({});
    setSaveAttempted(false);
    setMode("editor");
    if (!flattenWritableCalendars(groups).length) {
      const reason = inferNoWritableReason(groups);
      setError(reason === "calendar_reauth_required"
        ? "Reconnect this Gmail account to edit calendar events."
        : "No writable calendar sources are connected.");
      setErrorCode(reason);
      return;
    }
    setError(null);
    setErrorCode(null);
  }, [editable, ensureSources, seedDefaultCalendar, selectedDate]);

  const openEdit = useCallback(async (event) => {
    if (!editable || !event?.writable || event?.isRecurring) return;
    const groups = await ensureSources();
    const nextDraft = seedDefaultCalendar(draftFromEvent(event), groups);
    setDraft(nextDraft);
    setEditingEvent(event);
    setConfirmDelete(false);
    setTouchedFields({});
    setSaveAttempted(false);
    setMode("editor");
    setError(null);
    setErrorCode(null);
  }, [editable, ensureSources, seedDefaultCalendar]);

  const closeEditor = useCallback(() => {
    setMode("detail");
    setEditingEvent(null);
    setConfirmDelete(false);
    setError(null);
    setErrorCode(null);
    setTouchedFields({});
    setSaveAttempted(false);
  }, []);

  const updateField = useCallback((field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setTouchedFields((current) => (current[field] ? current : { ...current, [field]: true }));
    setError(null);
    setErrorCode(null);
  }, []);

  const save = useCallback(async () => {
    if (!editable) return;
    setSaveAttempted(true);
    if (validationMessage) return;
    setSaving(true);
    setError(null);
    setErrorCode(null);

    const payload = {
      accountId: draft.accountId,
      calendarId: draft.calendarId,
      title: draft.title,
      allDay: draft.allDay,
      startDate: draft.startDate,
      endDate: draft.endDate,
      startTime: draft.startTime,
      endTime: draft.endTime,
      location: draft.location,
      description: draft.description,
    };

    try {
      let savedEvent;
      if (editingEvent) {
        const result = await updateCalendarEvent(editingEvent.id, {
          ...payload,
          etag: editingEvent.etag,
        });
        savedEvent = result.event;
      } else {
        const result = await createCalendarEvent(payload);
        savedEvent = result.event;
      }

      const bounds = mergeBounds(eventBounds(editingEvent), draftBounds(draft), eventBounds(savedEvent));
      if (bounds) await refreshRange?.(bounds.start, bounds.end);
      onFocusDate?.(pacificYMD(savedEvent.startMs));
      setMode("detail");
      setEditingEvent(null);
      setConfirmDelete(false);
    } catch (err) {
      setError(err.message || "Failed to save event.");
      setErrorCode(err.code || null);
    } finally {
      setSaving(false);
    }
  }, [draft, editable, editingEvent, onFocusDate, refreshRange, validationMessage]);

  const reconnect = useCallback(async () => {
    try {
      const { url } = await getGmailAuthUrl();
      window.location.href = url;
    } catch (err) {
      setError(err.message || "Failed to start Gmail reconnect.");
      setErrorCode(err.code || null);
    }
  }, []);

  const confirmDeleteIntent = useCallback(() => {
    setConfirmDelete(true);
    setError(null);
    setErrorCode(null);
  }, []);

  const cancelDelete = useCallback(() => {
    setConfirmDelete(false);
  }, []);

  const remove = useCallback(async () => {
    if (!editingEvent) return;
    setDeleting(true);
    setError(null);
    setErrorCode(null);
    try {
      await deleteCalendarEvent(editingEvent.id, {
        accountId: editingEvent.accountId,
        calendarId: editingEvent.calendarId,
        etag: editingEvent.etag,
      });
      const bounds = eventBounds(editingEvent);
      if (bounds) await refreshRange?.(bounds.start, bounds.end);
      closeEditor();
    } catch (err) {
      setError(err.message || "Failed to delete event.");
      setErrorCode(err.code || null);
    } finally {
      setDeleting(false);
    }
  }, [closeEditor, editingEvent, refreshRange]);

  return {
    editable,
    mode,
    isEditorOpen: mode === "editor",
    isEditing: !!editingEvent,
    editingEvent,
    draft,
    writableCalendars,
    sourceGroups,
    sourcesLoading,
    error,
    errorCode,
    validationMessage: visibleValidationMessage,
    canSave,
    saving,
    deleting,
    confirmDelete,
    openCreate,
    openEdit,
    closeEditor,
    updateField,
    save,
    reconnect,
    confirmDeleteIntent,
    cancelDelete,
    remove,
  };
}
