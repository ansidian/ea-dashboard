import { useEffect, useState, useRef } from "react";
import {
  Sparkles,
  LayoutList,
  Inbox,
  Search,
  RefreshCw,
  MoreHorizontal,
  History,
  Settings as SettingsIcon,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";

function Kbd({ children }) {
  return (
    <kbd
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 16, height: 16, padding: "0 4px",
        fontSize: 10, fontFamily: "Fira Code, ui-monospace, monospace", fontWeight: 500,
        color: "rgba(205,214,244,0.55)",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 4, letterSpacing: 0,
      }}
    >
      {children}
    </kbd>
  );
}

/**
 * ShellHeader — top chrome for the dashboard/inbox shell.
 * Tabs are hotkey-indexed (1 = dashboard, 2 = inbox). ⌘K opens the palette.
 * Refresh shows a progress fill while holding, becomes a confirm pill at 100%.
 */
export default function ShellHeader({
  accent,
  tab,
  onTab,
  onOpenPalette,
  onOpenCustomize,
  onOpenHistory,
  onOpenCalendar,
  nextBriefingLabel,
  liveUnreadCount = 0,
  refreshHold,
  refreshing,
  generating,
  onQuickRefresh,
  onFullGenerate,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "1") onTab("dashboard");
      if (e.key === "2") onTab("inbox");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTab]);

  const holdPct = refreshHold?.holdProgress ?? 0;
  const confirming = refreshHold?.showConfirm;

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        background: "rgba(11,11,19,0.6)",
        backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 40,
      }}
    >
      {/* Logo identity */}
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div
          style={{
            width: 22, height: 22, borderRadius: 7,
            background: `linear-gradient(135deg, ${accent}, ${accent}60)`,
            display: "grid", placeItems: "center",
            boxShadow: `0 0 18px ${accent}38`,
          }}
        >
          <Sparkles size={11} color="#0b0b13" strokeWidth={2.5} />
        </div>
        <div
          style={{
            fontSize: 12, fontWeight: 600, letterSpacing: 0.4,
            color: "rgba(205,214,244,0.85)",
          }}
        >
          EA
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex", gap: 2, padding: 3, borderRadius: 10,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {["dashboard", "inbox"].map((t) => {
          const showUnread = t === "inbox" && liveUnreadCount > 0;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onTab(t)}
              style={{
                padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer",
                fontSize: 11.5, fontWeight: 600, letterSpacing: 0.3, fontFamily: "inherit",
                background: tab === t ? "rgba(255,255,255,0.06)" : "transparent",
                color: tab === t ? "#cdd6f4" : "rgba(205,214,244,0.45)",
                display: "inline-flex", alignItems: "center", gap: 6,
                transition: "all 150ms",
              }}
            >
              {t === "dashboard" ? <LayoutList size={12} /> : <Inbox size={12} />}
              {showUnread && (
                <span
                  title={`${liveUnreadCount} untriaged`}
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    minWidth: 16, height: 16, padding: "0 5px",
                    fontSize: 9.5, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                    color: "#89b4fa",
                    background: "rgba(137,180,250,0.14)",
                    border: "1px solid rgba(137,180,250,0.32)",
                    borderRadius: 99, letterSpacing: 0,
                  }}
                >
                  {liveUnreadCount > 99 ? "99+" : liveUnreadCount}
                </span>
              )}
              {t === "dashboard" ? "Dashboard" : "Inbox"}
              <Kbd>{t === "dashboard" ? "1" : "2"}</Kbd>
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      {/* Palette trigger */}
      <PaletteTriggerButton onOpenPalette={onOpenPalette} />

      {/* Next briefing pill */}
      {nextBriefingLabel && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 10px", borderRadius: 8,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            fontSize: 10.5, color: "rgba(205,214,244,0.55)",
            letterSpacing: 0.2,
          }}
        >
          <span
            style={{
              width: 5, height: 5, borderRadius: 99,
              background: accent, boxShadow: `0 0 6px ${accent}`,
            }}
          />
          {nextBriefingLabel}
        </div>
      )}

      {/* Refresh — tap for quick, hold for full AI regen */}
      <RefreshButton
        accent={accent}
        refreshHold={refreshHold}
        refreshing={refreshing}
        generating={generating}
        holdPct={holdPct}
        onQuickRefresh={onQuickRefresh}
      />

      {/* Overflow */}
      <div ref={menuRef} style={{ position: "relative" }}>
        <OverflowButton open={menuOpen} onClick={() => setMenuOpen((v) => !v)} />
        {menuOpen && (
          <div
            style={{
              position: "absolute", right: 0, top: "calc(100% + 6px)", minWidth: 210,
              padding: 6, borderRadius: 10,
              background: "#16161e",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
              zIndex: 50,
            }}
          >
            <MenuItem
              icon={History}
              label="Briefing history"
              kbd="H"
              onClick={() => { setMenuOpen(false); onOpenHistory?.(); }}
            />
            <MenuItem
              icon={LayoutList}
              label="Calendar"
              kbd="C"
              onClick={() => { setMenuOpen(false); onOpenCalendar?.(); }}
            />
            <MenuItem
              icon={SettingsIcon}
              label="Customize"
              onClick={() => { setMenuOpen(false); onOpenCustomize?.(); }}
            />
            <MenuLink
              icon={SettingsIcon}
              label="Settings"
              to="/settings"
              onClick={() => setMenuOpen(false)}
            />
          </div>
        )}
      </div>

      {confirming && (
        <div
          style={{
            position: "fixed", top: 64, left: "50%", transform: "translateX(-50%)",
            padding: "10px 14px", borderRadius: 10,
            background: "#16161e",
            border: `1px solid ${accent}40`,
            boxShadow: `0 0 40px ${accent}30`,
            display: "flex", alignItems: "center", gap: 10, zIndex: 60,
            fontSize: 12,
          }}
        >
          <Sparkles size={13} color={accent} />
          Generate a fresh AI briefing?
          <ConfirmGenerateButton accent={accent} onClick={onFullGenerate} />
          <ConfirmCancelButton onClick={() => refreshHold?.setShowConfirm?.(false)} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, kbd, onClick, danger }) {
  const Icon = icon;
  const [hover, setHover] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick?.(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 10px", borderRadius: 6, cursor: "pointer",
        fontSize: 12, color: danger ? "#f38ba8" : "#cdd6f4",
        background: hover ? "rgba(255,255,255,0.04)" : "transparent",
        transition: "background 150ms",
      }}
    >
      <Icon size={12} color={danger ? "#f38ba8" : "rgba(205,214,244,0.55)"} />
      <span style={{ flex: 1 }}>{label}</span>
      {kbd && <Kbd>{kbd}</Kbd>}
    </div>
  );
}

function MenuLink({ icon, label, to, onClick }) {
  const Icon = icon;
  const [hover, setHover] = useState(false);
  return (
    <Link
      to={to}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 10px", borderRadius: 6, textDecoration: "none",
        fontSize: 12, color: "#cdd6f4",
        background: hover ? "rgba(255,255,255,0.04)" : "transparent",
        transition: "background 150ms",
      }}
    >
      <Icon size={12} color="rgba(205,214,244,0.55)" />
      <span style={{ flex: 1 }}>{label}</span>
    </Link>
  );
}

// Confirmation buttons for the "Generate a fresh AI briefing?" toast. Hover
// raises them 1px with a tinted glow; active cancels the lift. The accent is
// threaded in so the Generate button matches whichever accent the shell is
// currently using (defaults to the dashboard's lavender).
function ConfirmGenerateButton({ accent, onClick }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const lifted = hover && !pressed;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        padding: "5px 10px", borderRadius: 6, border: "none",
        background: accent, color: "#0b0b13",
        fontFamily: "inherit", fontWeight: 600, fontSize: 11, cursor: "pointer",
        transform: lifted ? "translateY(-1px)" : "translateY(0)",
        boxShadow: lifted ? `0 6px 18px ${accent}59` : "none",
        filter: lifted ? "brightness(1.06)" : "none",
        transition: "transform 150ms, box-shadow 150ms, filter 150ms",
      }}
    >
      Generate
    </button>
  );
}

// Command-palette trigger. On hover, border + text brighten and the pill lifts
// 1px — matches the confirm buttons' language so the whole header reads as one
// family of interactive chrome.
function PaletteTriggerButton({ onOpenPalette }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const lifted = hover && !pressed;
  return (
    <button
      type="button"
      onClick={onOpenPalette}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      title="Command palette (⌘K)"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 10px", borderRadius: 8,
        fontSize: 11, fontFamily: "inherit", letterSpacing: 0.2, fontWeight: 500,
        background: hover ? "rgba(255,255,255,0.05)" : "transparent",
        color: hover ? "rgba(205,214,244,0.9)" : "rgba(205,214,244,0.6)",
        border: `1px solid ${hover ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)"}`,
        cursor: "pointer",
        transform: lifted ? "translateY(-1px)" : "translateY(0)",
        transition: "transform 150ms, background 150ms, border-color 150ms, color 150ms",
      }}
    >
      <Search size={11} />
      <span>Jump to anything</span>
      <Kbd>⌘</Kbd>
      <Kbd>K</Kbd>
    </button>
  );
}

// Refresh pill. Hover treatment is suppressed while refreshing/generating (the
// button is disabled-looking) and the lift is only applied when no hold is in
// progress — otherwise the translate fights the hold-progress fill overlay.
function RefreshButton({ accent, refreshHold, refreshing, generating, holdPct, onQuickRefresh }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const busy = refreshing || generating;
  const holding = holdPct > 0;
  const lifted = hover && !pressed && !busy && !holding;
  return (
    <button
      type="button"
      onPointerDown={(e) => { setPressed(true); refreshHold?.startHold?.(e); }}
      onPointerUp={(e) => { setPressed(false); refreshHold?.endHold?.(e); }}
      onPointerLeave={() => { setPressed(false); setHover(false); refreshHold?.endHold?.(true); }}
      onMouseEnter={() => setHover(true)}
      onClick={() => { if (!holdPct) onQuickRefresh?.(); }}
      disabled={busy}
      style={{
        position: "relative", overflow: "hidden",
        padding: "5px 10px", borderRadius: 8,
        border: `1px solid ${hover && !busy ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)"}`,
        background: hover && !busy ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
        color: hover && !busy ? "#cdd6f4" : "rgba(205,214,244,0.85)",
        fontFamily: "inherit", fontSize: 11, fontWeight: 500, letterSpacing: 0.2,
        cursor: refreshing ? "wait" : "pointer",
        display: "inline-flex", alignItems: "center", gap: 5,
        opacity: busy ? 0.6 : 1,
        transform: lifted ? "translateY(-1px)" : "translateY(0)",
        transition: "transform 150ms, background 150ms, border-color 150ms, color 150ms",
      }}
      title="Tap to refresh · Hold for full AI briefing · R"
    >
      {holdPct > 0 && (
        <div
          style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: `${holdPct}%`,
            background: `linear-gradient(90deg, ${accent}30, ${accent}15)`, borderRadius: 8,
          }}
        />
      )}
      <RefreshCw
        size={11}
        style={{ animation: refreshing ? "spin 0.8s linear infinite" : "none" }}
      />
      <span style={{ position: "relative" }}>
        {refreshing ? "Refreshing…" : holdPct > 0 ? "Hold…" : "Refresh"}
      </span>
      <Kbd>R</Kbd>
    </button>
  );
}

// Overflow ("…") menu trigger. Sticks to the same hover vocabulary; when the
// menu is open we keep the "hover" look so the trigger reads as active while
// the dropdown is attached.
function OverflowButton({ open, onClick }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const active = hover || open;
  const lifted = hover && !pressed && !open;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        padding: 6, borderRadius: 8,
        border: `1px solid ${active ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)"}`,
        background: active ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
        color: active ? "#cdd6f4" : "rgba(205,214,244,0.75)",
        cursor: "pointer", display: "grid", placeItems: "center",
        transform: lifted ? "translateY(-1px)" : "translateY(0)",
        transition: "transform 150ms, background 150ms, border-color 150ms, color 150ms",
      }}
    >
      <MoreHorizontal size={14} />
    </button>
  );
}

function ConfirmCancelButton({ onClick }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const lifted = hover && !pressed;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        padding: "5px 10px", borderRadius: 6,
        border: `1px solid ${hover ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)"}`,
        background: hover ? "rgba(255,255,255,0.06)" : "transparent",
        color: hover ? "rgba(205,214,244,0.9)" : "rgba(205,214,244,0.7)",
        fontFamily: "inherit", fontSize: 11, cursor: "pointer",
        transform: lifted ? "translateY(-1px)" : "translateY(0)",
        transition: "transform 150ms, background 150ms, border-color 150ms, color 150ms",
      }}
    >
      Cancel
    </button>
  );
}
