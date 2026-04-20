import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Calendar as CalendarIcon, Check, ChevronDown, Clock3 } from "lucide-react";
import AnchoredFloatingPanel from "@/components/shared/pickers/AnchoredFloatingPanel";
import CalendarDateTimeView from "@/components/shared/pickers/CalendarDateTimeView";
import TimePickerView from "@/components/shared/pickers/TimePickerView";

const DATE_PICKER_WIDTH = 300;
const DATE_PICKER_HEIGHT = 386;
const TIME_PICKER_WIDTH = 280;
const TIME_PICKER_HEIGHT = 238;
const SOURCE_PICKER_WIDTH = 320;
const SOURCE_PICKER_HEIGHT = 280;
const ACCENT = "var(--ea-accent)";

function FieldLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 2.2,
        textTransform: "uppercase",
        color: "rgba(205,214,244,0.5)",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function toPacificYmd(epoch) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(epoch));
}

function formatDateLabel(value) {
  if (!value) return "Choose date";
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeLabel(value) {
  if (!value) return "Choose time";
  return new Date(`2000-01-01T${value}:00`).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function sourceDotStyle(color) {
  return {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: color || "#4285f4",
    boxShadow: `0 0 0 1px ${color || "#4285f4"}22, 0 0 8px ${color || "#4285f4"}44`,
    flexShrink: 0,
  };
}

function textFieldStyle({ invalid = false } = {}) {
  return {
    width: "100%",
    background: "rgba(255,255,255,0.03)",
    border: invalid
      ? "1px solid rgba(249, 115, 22, 0.42)"
      : "1px solid rgba(255,255,255,0.06)",
    borderRadius: 8,
    padding: "10px 12px",
    color: "#cdd6f4",
    fontSize: 12.5,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };
}

function ActionButton({
  children,
  danger = false,
  subtle = false,
  disabled = false,
  onClick,
  dataTestId,
}) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);

  let background = "rgba(203,166,218,0.12)";
  let border = "1px solid rgba(203,166,218,0.24)";
  let color = "#cba6da";

  if (danger) {
    background = hover && !disabled ? "rgba(243,139,168,0.18)" : "rgba(243,139,168,0.12)";
    border = hover && !disabled ? "1px solid rgba(243,139,168,0.38)" : "1px solid rgba(243,139,168,0.28)";
    color = "#f38ba8";
  } else if (subtle) {
    background = hover && !disabled ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)";
    border = hover && !disabled ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(255,255,255,0.08)";
    color = "rgba(205,214,244,0.78)";
  } else if (hover && !disabled) {
    background = "rgba(203,166,218,0.18)";
    border = "1px solid rgba(203,166,218,0.34)";
  }

  return (
    <button
      data-testid={dataTestId}
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        border,
        background,
        color: disabled ? "rgba(205,214,244,0.38)" : color,
        fontSize: 11.5,
        fontWeight: subtle ? 500 : 600,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        opacity: disabled ? 0.72 : 1,
        transform: hover && !pressed && !disabled ? "translateY(-1px)" : "translateY(0)",
        transition: "transform 140ms, background 140ms, border-color 140ms, color 140ms, opacity 140ms",
      }}
    >
      {children}
    </button>
  );
}

function PickerFieldButton(props) {
  const {
    anchorRef,
    icon,
    value,
    placeholder,
    onClick,
    dataTestId,
    disabled = false,
    invalid = false,
    leading = null,
    trailingLabel = "Edit",
  } = props;
  const Icon = icon;
  const [hover, setHover] = useState(false);

  return (
    <button
      ref={anchorRef}
      data-testid={dataTestId}
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...textFieldStyle({ invalid }),
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        textAlign: "left",
        cursor: disabled ? "not-allowed" : "pointer",
        background: hover && !disabled ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.03)",
        transform: hover && !disabled ? "translateY(-1px)" : "translateY(0)",
        transition: "transform 140ms, background 140ms, border-color 140ms",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {leading || (
          <span
            aria-hidden
            style={{
              width: 22,
              height: 22,
              borderRadius: 7,
              display: "inline-grid",
              placeItems: "center",
              background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
              border: `1px solid color-mix(in srgb, ${ACCENT} 24%, transparent)`,
              color: ACCENT,
              flexShrink: 0,
            }}
          >
            <Icon size={12} />
          </span>
        )}
        <span
          style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: value ? "#cdd6f4" : "rgba(205,214,244,0.42)",
          }}
        >
          {value || placeholder}
        </span>
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {trailingLabel ? (
          <span style={{ fontSize: 10, color: "rgba(205,214,244,0.38)" }}>{trailingLabel}</span>
        ) : null}
        <ChevronDown size={12} color="rgba(205,214,244,0.45)" />
      </span>
    </button>
  );
}

function SourcePickerPanel({ sourceGroups, writableCalendars, selectedValue, onSelect }) {
  const selectedSet = new Set([selectedValue]);
  const showGroupLabels = sourceGroups.length > 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 8px 10px",
          color: "rgba(205,214,244,0.72)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 22,
            height: 22,
            borderRadius: 8,
            display: "inline-grid",
            placeItems: "center",
            color: ACCENT,
            background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
            border: `1px solid color-mix(in srgb, ${ACCENT} 24%, transparent)`,
          }}
        >
          <CalendarIcon size={12} />
        </span>
        Calendar source
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 8px 8px", overflowY: "auto" }}>
        {sourceGroups.map((group) => {
          const items = writableCalendars.filter((entry) => entry.accountId === group.accountId);
          if (!items.length) return null;

          return (
            <div key={group.accountId} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {showGroupLabels ? (
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 1.6,
                    textTransform: "uppercase",
                    color: "rgba(205,214,244,0.4)",
                    padding: "0 6px",
                  }}
                >
                  {group.accountLabel || "Calendar account"}
                </div>
              ) : null}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {items.map((item) => {
                  const selected = selectedSet.has(item.value);

                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => onSelect(item)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto minmax(0, 1fr) auto",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: selected
                          ? "1px solid rgba(203,166,218,0.34)"
                          : "1px solid rgba(255,255,255,0.06)",
                        background: selected
                          ? "rgba(203,166,218,0.12)"
                          : "rgba(255,255,255,0.03)",
                        color: "#cdd6f4",
                        fontFamily: "inherit",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "transform 140ms, background 140ms, border-color 140ms",
                      }}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.transform = "translateY(-1px)";
                        if (!selected) {
                          event.currentTarget.style.background = "rgba(255,255,255,0.05)";
                          event.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                        }
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.transform = "translateY(0)";
                        event.currentTarget.style.background = selected
                          ? "rgba(203,166,218,0.12)"
                          : "rgba(255,255,255,0.03)";
                        event.currentTarget.style.borderColor = selected
                          ? "rgba(203,166,218,0.34)"
                          : "rgba(255,255,255,0.06)";
                      }}
                    >
                      <span style={sourceDotStyle(item.color)} />
                      <span style={{ minWidth: 0 }}>
                        <span
                          style={{
                            display: "block",
                            fontSize: 12.5,
                            color: "#e2e8f0",
                            fontWeight: 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.summary}
                        </span>
                      </span>
                      <span
                        style={{
                          width: 18,
                          height: 18,
                          display: "inline-grid",
                          placeItems: "center",
                          color: selected ? "#cba6da" : "transparent",
                        }}
                      >
                        <Check size={14} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CalendarEventEditorRail({ editor }) {
  const {
    draft,
    writableCalendars,
    sourceGroups,
    sourcesLoading,
    error,
    errorCode,
    validationMessage,
    canSave,
    saving,
    deleting,
    confirmDelete,
    isEditing,
    updateField,
    save,
    closeEditor,
    confirmDeleteIntent,
    cancelDelete,
    remove,
    reconnect,
  } = editor;

  const disabled = saving || deleting;
  const saveDisabled = disabled || !canSave;
  const [openPicker, setOpenPicker] = useState(null);
  const pickerPanelRef = useRef(null);
  const [nowTick] = useState(() => Date.now());
  const sourceRef = useRef(null);
  const startDateRef = useRef(null);
  const endDateRef = useRef(null);
  const startTimeRef = useRef(null);
  const endTimeRef = useRef(null);

  useEffect(() => {
    if (!openPicker) return undefined;

    function handleKeyDown(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpenPicker(null);
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [openPicker]);

  const sharedDatePickerProps = {
    panelRef: pickerPanelRef,
    onClose: () => setOpenPicker(null),
    width: DATE_PICKER_WIDTH,
    height: DATE_PICKER_HEIGHT,
    role: "dialog",
    style: { overflow: "hidden", padding: 8, zIndex: 10001 },
  };

  const sharedTimePickerProps = {
    panelRef: pickerPanelRef,
    onClose: () => setOpenPicker(null),
    width: TIME_PICKER_WIDTH,
    height: TIME_PICKER_HEIGHT,
    role: "dialog",
    style: { overflow: "hidden", padding: 8, zIndex: 10001 },
  };
  const sharedSourcePickerProps = {
    panelRef: pickerPanelRef,
    onClose: () => setOpenPicker(null),
    width: SOURCE_PICKER_WIDTH,
    height: SOURCE_PICKER_HEIGHT,
    role: "dialog",
    style: { overflow: "hidden", padding: 8, zIndex: 10001 },
  };

  const missingCalendar = !draft.accountId || !draft.calendarId;
  const selectedSource = useMemo(() => (
    writableCalendars.find((entry) => entry.value === `${draft.accountId}::${draft.calendarId}`) || null
  ), [draft.accountId, draft.calendarId, writableCalendars]);
  const invalidDateRange = !!draft.startDate && !!draft.endDate && draft.endDate < draft.startDate;
  const invalidTimeRange = !draft.allDay
    && !!draft.startDate
    && !!draft.endDate
    && !!draft.startTime
    && !!draft.endTime
    && `${draft.endDate}T${draft.endTime}:00` <= `${draft.startDate}T${draft.startTime}:00`;

  return (
    <div
      data-testid="calendar-event-editor-rail"
      style={{ padding: "16px 20px", overflow: "auto", flex: 1 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, color: "#cba6da", fontWeight: 500 }}>
            {isEditing ? "Edit event" : "New event"}
          </div>
          <div style={{ marginTop: 3, fontSize: 11, color: "rgba(205,214,244,0.42)", lineHeight: 1.45 }}>
            Single events only. Recurring events still open in Google Calendar.
          </div>
        </div>
        <ActionButton subtle onClick={closeEditor} disabled={disabled}>
          Back
        </ActionButton>
      </div>

      {error ? (
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid rgba(243,139,168,0.18)",
            background: "rgba(243,139,168,0.08)",
            color: "#f5c2e7",
            fontSize: 11.5,
            lineHeight: 1.5,
          }}
        >
          <div>{error}</div>
          {errorCode === "calendar_reauth_required" ? (
            <div style={{ marginTop: 8 }}>
              <ActionButton onClick={reconnect}>Reconnect Gmail</ActionButton>
            </div>
          ) : null}
        </div>
      ) : null}

      {!error && validationMessage ? (
        <div
          data-testid="calendar-event-validation"
          style={{
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid rgba(249,115,22,0.24)",
            background: "rgba(249,115,22,0.08)",
            color: "#fdba74",
            fontSize: 11.5,
            lineHeight: 1.5,
          }}
        >
          {validationMessage}
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
        <div>
          <FieldLabel>Title</FieldLabel>
          <input
            data-testid="calendar-event-title"
            type="text"
            value={draft.title}
            onChange={(event) => updateField("title", event.target.value)}
            disabled={disabled}
            placeholder="Event title"
            style={textFieldStyle({ invalid: validationMessage === "Title is required." })}
          />
        </div>

        <div>
          <FieldLabel>Calendar</FieldLabel>
          <input
            data-testid="calendar-event-source"
            type="hidden"
            value={draft.accountId && draft.calendarId ? `${draft.accountId}::${draft.calendarId}` : ""}
            readOnly
          />
          <PickerFieldButton
            anchorRef={sourceRef}
            icon={CalendarIcon}
            value={selectedSource?.label || (sourcesLoading ? "Loading calendars..." : "")}
            placeholder={writableCalendars.length ? "Choose a calendar" : "No writable calendars"}
            dataTestId="calendar-event-source-trigger"
            onClick={() => !disabled && writableCalendars.length > 0 && setOpenPicker("source")}
            disabled={disabled || sourcesLoading || writableCalendars.length === 0}
            invalid={missingCalendar}
            trailingLabel=""
            leading={selectedSource ? (
              <span
                aria-hidden
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 7,
                  display: "inline-grid",
                  placeItems: "center",
                  background: `color-mix(in srgb, ${selectedSource.color} 16%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${selectedSource.color} 28%, transparent)`,
                  flexShrink: 0,
                }}
              >
                <span style={sourceDotStyle(selectedSource.color)} />
              </span>
            ) : null}
          />
        </div>

        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "rgba(205,214,244,0.72)",
          }}
        >
          <input
            data-testid="calendar-event-all-day"
            type="checkbox"
            checked={draft.allDay}
            onChange={(event) => {
              const nextAllDay = event.target.checked;
              if (nextAllDay && (openPicker === "startTime" || openPicker === "endTime")) {
                setOpenPicker(null);
              }
              updateField("allDay", nextAllDay);
            }}
            disabled={disabled}
            style={{ accentColor: "#cba6da" }}
          />
          All day
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <FieldLabel>Start</FieldLabel>
            <PickerFieldButton
              anchorRef={startDateRef}
              icon={CalendarDays}
              value={formatDateLabel(draft.startDate)}
              placeholder="Choose date"
              dataTestId="calendar-event-start-date"
              onClick={() => !disabled && setOpenPicker("startDate")}
              disabled={disabled}
              invalid={invalidDateRange}
            />
          </div>
          <div>
            <FieldLabel>End</FieldLabel>
            <PickerFieldButton
              anchorRef={endDateRef}
              icon={CalendarDays}
              value={formatDateLabel(draft.endDate)}
              placeholder="Choose date"
              dataTestId="calendar-event-end-date"
              onClick={() => !disabled && setOpenPicker("endDate")}
              disabled={disabled}
              invalid={invalidDateRange}
            />
          </div>
        </div>

        {!draft.allDay ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel>Start time</FieldLabel>
              <PickerFieldButton
                anchorRef={startTimeRef}
                icon={Clock3}
                value={formatTimeLabel(draft.startTime)}
                placeholder="Choose time"
                dataTestId="calendar-event-start-time"
                onClick={() => !disabled && setOpenPicker("startTime")}
                disabled={disabled}
                invalid={invalidTimeRange}
              />
            </div>
            <div>
              <FieldLabel>End time</FieldLabel>
              <PickerFieldButton
                anchorRef={endTimeRef}
                icon={Clock3}
                value={formatTimeLabel(draft.endTime)}
                placeholder="Choose time"
                dataTestId="calendar-event-end-time"
                onClick={() => !disabled && setOpenPicker("endTime")}
                disabled={disabled}
                invalid={invalidTimeRange}
              />
            </div>
          </div>
        ) : null}

        <div>
          <FieldLabel>Location</FieldLabel>
          <input
            data-testid="calendar-event-location"
            type="text"
            value={draft.location}
            onChange={(event) => updateField("location", event.target.value)}
            disabled={disabled}
            placeholder="Optional"
            style={textFieldStyle()}
          />
        </div>

        <div>
          <FieldLabel>Notes</FieldLabel>
          <textarea
            data-testid="calendar-event-description"
            value={draft.description}
            onChange={(event) => updateField("description", event.target.value)}
            disabled={disabled}
            rows={5}
            placeholder="Optional"
            style={{ ...textFieldStyle(), resize: "vertical", minHeight: 120 }}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 18,
          paddingTop: 14,
          borderTop: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <ActionButton
          dataTestId="calendar-event-save"
          onClick={save}
          disabled={saveDisabled}
        >
          {saving ? "Saving..." : isEditing ? "Save changes" : "Create event"}
        </ActionButton>
        <ActionButton subtle onClick={closeEditor} disabled={disabled}>
          Cancel
        </ActionButton>
        {isEditing ? (
          confirmDelete ? (
            <>
              <ActionButton
                dataTestId="calendar-event-delete-confirm"
                danger
                onClick={remove}
                disabled={disabled}
              >
                {deleting ? "Deleting..." : "Confirm delete"}
              </ActionButton>
              <ActionButton subtle onClick={cancelDelete} disabled={disabled}>
                Keep event
              </ActionButton>
            </>
          ) : (
            <ActionButton
              dataTestId="calendar-event-delete"
              danger
              onClick={confirmDeleteIntent}
              disabled={disabled}
            >
              Delete
            </ActionButton>
          )
        ) : null}
      </div>

      {openPicker === "startDate" ? (
        <AnchoredFloatingPanel
          anchorRef={startDateRef}
          ariaLabel="Start date picker"
          {...sharedDatePickerProps}
        >
          <CalendarDateTimeView
            nowTick={nowTick}
            initialEpoch={new Date(`${draft.startDate || draft.endDate || "2026-01-01"}T12:00:00Z`).getTime()}
            onSelect={(epoch) => {
              updateField("startDate", toPacificYmd(epoch));
              setOpenPicker(null);
            }}
            onBack={() => setOpenPicker(null)}
            accent={ACCENT}
            confirmLabel="Set start date"
            mode="date-only"
            allowPastDates
            submitOnDateSelect
          />
        </AnchoredFloatingPanel>
      ) : null}

      {openPicker === "endDate" ? (
        <AnchoredFloatingPanel
          anchorRef={endDateRef}
          ariaLabel="End date picker"
          {...sharedDatePickerProps}
        >
          <CalendarDateTimeView
            nowTick={nowTick}
            initialEpoch={new Date(`${draft.endDate || draft.startDate || "2026-01-01"}T12:00:00Z`).getTime()}
            onSelect={(epoch) => {
              updateField("endDate", toPacificYmd(epoch));
              setOpenPicker(null);
            }}
            onBack={() => setOpenPicker(null)}
            accent={ACCENT}
            confirmLabel="Set end date"
            mode="date-only"
            allowPastDates
            submitOnDateSelect
          />
        </AnchoredFloatingPanel>
      ) : null}

      {openPicker === "source" ? (
        <AnchoredFloatingPanel
          anchorRef={sourceRef}
          ariaLabel="Calendar source picker"
          {...sharedSourcePickerProps}
        >
          <SourcePickerPanel
            sourceGroups={sourceGroups}
            writableCalendars={writableCalendars}
            selectedValue={draft.accountId && draft.calendarId ? `${draft.accountId}::${draft.calendarId}` : ""}
            onSelect={(item) => {
              updateField("accountId", item.accountId);
              updateField("calendarId", item.calendarId);
              setOpenPicker(null);
            }}
          />
        </AnchoredFloatingPanel>
      ) : null}

      {openPicker === "startTime" ? (
        <AnchoredFloatingPanel
          anchorRef={startTimeRef}
          ariaLabel="Start time picker"
          {...sharedTimePickerProps}
        >
          <TimePickerView
            initialTime={draft.startTime}
            onSelect={(value) => {
              updateField("startTime", value);
              setOpenPicker(null);
            }}
            onBack={() => setOpenPicker(null)}
            accent={ACCENT}
            confirmLabel="Set start time"
          />
        </AnchoredFloatingPanel>
      ) : null}

      {openPicker === "endTime" ? (
        <AnchoredFloatingPanel
          anchorRef={endTimeRef}
          ariaLabel="End time picker"
          {...sharedTimePickerProps}
        >
          <TimePickerView
            initialTime={draft.endTime}
            onSelect={(value) => {
              updateField("endTime", value);
              setOpenPicker(null);
            }}
            onBack={() => setOpenPicker(null)}
            accent={ACCENT}
            confirmLabel="Set end time"
          />
        </AnchoredFloatingPanel>
      ) : null}
    </div>
  );
}
