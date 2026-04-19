import { createPortal } from "react-dom";
import { CornerDownLeft, Trash2, X } from "lucide-react";
import { Dropdown, LabelPicker, PriorityIndicator, RemoveLabelButton, TokenAutocomplete } from "./controls";

export default function AddTaskPanelView({
  controller,
}) {
  const {
    isEdit,
    input,
    description,
    setDescription,
    projects,
    labels,
    setManualProject,
    setManualPriority,
    setManualLabels,
    setOverrides,
    seededDueDisplay,
    submitting,
    error,
    deleteProgress,
    deleting,
    saveHover,
    setSaveHover,
    deleteHover,
    setDeleteHover,
    pos,
    autocompleteType,
    cursorPos,
    panelRef,
    inputRef,
    parsed,
    resolvedProject,
    resolvedPriority,
    resolvedLabels,
    handleInputChange,
    handleAutocompleteSelect,
    canSubmit,
    handleSubmit,
    handleKeyDown,
    priorityOptions,
    active,
    requestClose,
    cancelDelete,
    startDelete,
  } = controller;

  if (!pos) return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        maxHeight: "calc(100vh - 24px)",
        overflowY: "auto",
        background: "radial-gradient(ellipse at top left, #1a1a2a, #0d0d15 70%)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        padding: 0,
        zIndex: 9999,
        boxShadow: "0 30px 80px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.04)",
        isolation: "isolate",
        overscrollBehavior: "contain",
        fontFamily: "inherit",
        opacity: active ? 1 : 0,
        transform: active ? "translateY(0)" : "translateY(-6px)",
        transition: "opacity 180ms ease, transform 180ms cubic-bezier(0.16, 1, 0.3, 1)",
        transformOrigin: "top left",
      }}
    >
      <div
        style={{
          padding: "12px 16px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "linear-gradient(135deg, rgba(203,166,218,0.06), transparent 70%)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: "rgba(203,166,218,0.15)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <CornerDownLeft size={11} color="#cba6da" />
        </div>
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "#cba6da",
          }}
        >
          {isEdit ? "Edit Todoist task" : "New Todoist task"}
        </div>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "rgba(205,214,244,0.5)",
            padding: 4,
            borderRadius: 4,
            display: "inline-flex",
            fontFamily: "inherit",
          }}
        >
          <X size={12} />
        </button>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ marginBottom: 10, position: "relative" }}>
          <div
            style={{
              color: "rgba(205,214,244,0.55)",
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "2.2px",
              marginBottom: 5,
            }}
          >
            Task
          </div>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Buy groceries tomorrow ! #Shopping @errand"
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.03)",
              border: input
                ? "1px solid rgba(203,166,218,0.4)"
                : "1px solid rgba(255,255,255,0.06)",
              borderRadius: 8,
              padding: "10px 12px",
              color: "#cdd6f4",
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
              boxShadow: input ? "0 0 0 1px rgba(203,166,218,0.15)" : "none",
              transition: "border-color 0.2s, box-shadow 0.2s",
              fontFamily: "inherit",
            }}
          />
          {autocompleteType === "project" && (
            <TokenAutocomplete
              cursorPos={cursorPos}
              input={input}
              items={projects}
              type="project"
              onSelect={handleAutocompleteSelect}
            />
          )}
          {autocompleteType === "label" && (
            <TokenAutocomplete
              cursorPos={cursorPos}
              input={input}
              items={labels}
              type="label"
              onSelect={handleAutocompleteSelect}
            />
          )}
        </div>

        <div
          style={{
            color: "rgba(205,214,244,0.35)",
            fontSize: 10.5,
            marginBottom: 10,
            lineHeight: 1.5,
          }}
        >
          Supports dates · <span style={{ color: "#f38ba8" }}>!1-!4</span> priority · <span style={{ color: "#cba6da" }}>#project</span> · <span style={{ color: "#a6e3a1" }}>@label</span>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div
            style={{
              color: "rgba(205,214,244,0.55)",
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "2.2px",
              marginBottom: 5,
            }}
          >
            Description
          </div>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional"
            rows={2}
            style={{
              width: "100%",
              background: "rgba(205,214,244,0.04)",
              border: "1px solid rgba(205,214,244,0.08)",
              borderRadius: 8,
              padding: "10px 12px",
              color: "#cdd6f4",
              fontSize: 12,
              outline: "none",
              resize: "vertical",
              minHeight: 40,
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <Dropdown
            label="Project"
            value={resolvedProject}
            color={resolvedProject ? "#cba6da" : null}
            options={projects}
            onChange={(opt) => {
              setManualProject(opt);
              setOverrides((prev) => ({ ...prev, project: true }));
            }}
            renderValue={(val) => val?.name || "Inbox"}
            renderOption={(opt) => (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: opt.color || "rgba(205,214,244,0.3)",
                  }}
                />
                {opt.name}
              </span>
            )}
          />
          <Dropdown
            label="Priority"
            value={resolvedPriority}
            color={
              resolvedPriority && resolvedPriority <= 2
                ? "#f38ba8"
                : resolvedPriority === 3
                  ? "#89b4fa"
                  : null
            }
            options={priorityOptions}
            onChange={(opt) => {
              setManualPriority(opt.value);
              setOverrides((prev) => ({ ...prev, priority: true }));
            }}
            renderValue={(val) => (val ? <PriorityIndicator level={val} /> : "None")}
            renderOption={(opt) => (opt.value ? <PriorityIndicator level={opt.value} /> : "None")}
          />
        </div>

        <div style={{ marginBottom: 8 }}>
          <div
            style={{
              color: "rgba(205,214,244,0.55)",
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "2.2px",
              marginBottom: 5,
            }}
          >
            Due
          </div>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              value=""
              readOnly
              tabIndex={-1}
              placeholder={parsed.dateFormatted || seededDueDisplay ? "" : "Set via task input — e.g. tomorrow, next monday at 8am"}
              style={{
                width: "100%",
                background:
                  parsed.dateFormatted || seededDueDisplay
                    ? "rgba(249,226,175,0.06)"
                    : "rgba(205,214,244,0.04)",
                border:
                  parsed.dateFormatted || seededDueDisplay
                    ? "1px solid rgba(249,226,175,0.15)"
                    : "1px solid rgba(205,214,244,0.08)",
                borderRadius: 8,
                padding: "8px 12px",
                color: parsed.dateFormatted ? "#f9e2af" : "rgba(205,214,244,0.35)",
                fontSize: 12,
                outline: "none",
                boxSizing: "border-box",
                transition: "all 0.2s",
                cursor: "default",
                pointerEvents: "none",
              }}
            />
            {(parsed.dateFormatted || seededDueDisplay) && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 12px",
                  color: "#f9e2af",
                  fontSize: 12,
                  pointerEvents: "none",
                  gap: 6,
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                {parsed.dateFormatted || seededDueDisplay}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              color: "rgba(205,214,244,0.55)",
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "2.2px",
              marginBottom: 5,
            }}
          >
            Labels
          </div>
          <div
            style={{
              background: "rgba(205,214,244,0.04)",
              border: resolvedLabels.length
                ? "1px solid rgba(166,218,203,0.15)"
                : "1px solid rgba(205,214,244,0.08)",
              borderRadius: 8,
              padding: "6px 12px",
              minHeight: 32,
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 4,
            }}
          >
            {resolvedLabels.map((label) => (
              <span
                key={label.id}
                style={{
                  background: "rgba(166,218,203,0.1)",
                  border: "1px solid rgba(166,218,203,0.2)",
                  borderRadius: 4,
                  padding: "2px 8px",
                  color: "#a6dac0",
                  fontSize: 11,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {label.name}
                <RemoveLabelButton
                  onRemove={() => {
                    const updated = resolvedLabels.filter((entry) => entry.id !== label.id);
                    setManualLabels(updated);
                    setOverrides((prev) => ({ ...prev, labels: true }));
                  }}
                />
              </span>
            ))}
            {labels.length > 0 && (
              <LabelPicker
                available={labels.filter((label) => !resolvedLabels.find((entry) => entry.id === label.id))}
                onAdd={(label) => {
                  const updated = [...resolvedLabels, label];
                  setManualLabels(updated);
                  setOverrides((prev) => ({ ...prev, labels: true }));
                }}
              />
            )}
            {!resolvedLabels.length && !labels.length && (
              <span style={{ color: "rgba(205,214,244,0.3)", fontSize: 12 }}>
                None
              </span>
            )}
          </div>
        </div>

        {error && (
          <div
            style={{
              color: "#f38ba8",
              fontSize: 12,
              marginBottom: 8,
              padding: "6px 8px",
              background: "rgba(243,139,168,0.08)",
              borderRadius: 6,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 4,
            paddingTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          <div style={{ color: "rgba(205,214,244,0.4)", fontSize: 10.5, display: "flex", alignItems: "center", gap: 4 }}>
            <CornerDownLeft size={10} /> Enter to {isEdit ? "save" : "add"} · Esc to cancel
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isEdit && (
              <button
                type="button"
                onPointerDown={startDelete}
                onPointerUp={(event) => {
                  cancelDelete();
                  setDeleteHover(event.currentTarget.matches(":hover"));
                }}
                onPointerEnter={() => setDeleteHover(true)}
                onPointerLeave={() => {
                  cancelDelete();
                  setDeleteHover(false);
                }}
                onPointerCancel={() => {
                  cancelDelete();
                  setDeleteHover(false);
                }}
                disabled={deleting || submitting}
                title="Hold to delete"
                style={{
                  position: "relative",
                  overflow: "hidden",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "7px 14px",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  letterSpacing: 0.2,
                  cursor: deleting ? "wait" : "pointer",
                  background: deleteHover && !deleting ? "rgba(243,139,168,0.14)" : "rgba(243,139,168,0.08)",
                  border: `1px solid ${deleteHover && !deleting ? "rgba(243,139,168,0.48)" : "rgba(243,139,168,0.32)"}`,
                  color: "#f38ba8",
                  userSelect: "none",
                  boxShadow: deleteHover && !deleting ? "0 2px 8px rgba(243,139,168,0.22)" : "none",
                  transform: deleteHover && !deleting ? "translateY(-1px)" : "translateY(0)",
                  transition: "background 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s",
                }}
              >
                {deleteProgress > 0 && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${deleteProgress * 100}%`,
                      background: "linear-gradient(90deg, rgba(243,139,168,0.38), rgba(243,139,168,0.15))",
                      pointerEvents: "none",
                      transition: "width 40ms linear",
                    }}
                  />
                )}
                <Trash2 size={11} style={{ position: "relative" }} />
                <span style={{ position: "relative" }}>
                  {deleting ? "Deleting…" : "Delete"}
                </span>
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting || deleting}
              onMouseEnter={() => setSaveHover(true)}
              onMouseLeave={() => setSaveHover(false)}
              style={{
                background: canSubmit && !submitting && !deleting
                  ? (saveHover ? "rgba(166,227,161,0.22)" : "rgba(166,227,161,0.14)")
                  : "rgba(255,255,255,0.03)",
                borderRadius: 8,
                padding: "7px 14px",
                color: canSubmit && !submitting && !deleting ? "#a6e3a1" : "rgba(205,214,244,0.35)",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0.2,
                cursor: canSubmit && !submitting && !deleting ? "pointer" : "default",
                border: `1px solid ${canSubmit && !submitting && !deleting
                  ? (saveHover ? "rgba(166,227,161,0.5)" : "rgba(166,227,161,0.32)")
                  : "rgba(255,255,255,0.06)"}`,
                boxShadow: canSubmit && !submitting && !deleting && saveHover
                  ? "0 2px 8px rgba(166,227,161,0.22)"
                  : "none",
                transform: canSubmit && !submitting && !deleting && saveHover
                  ? "translateY(-1px)"
                  : "translateY(0)",
                transition: "all 0.2s",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {submitting ? (isEdit ? "Saving…" : "Adding…") : (isEdit ? "Save" : "Add task")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
