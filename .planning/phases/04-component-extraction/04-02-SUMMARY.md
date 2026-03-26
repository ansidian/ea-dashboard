---
phase: 04-component-extraction
plan: 02
subsystem: frontend-components
tags: [react, css, component-extraction, refactor]
dependency_graph:
  requires: [src/lib/actualMetadata.js, src/components/SearchableDropdown.jsx]
  provides: [src/components/BillBadge.jsx, src/components/EmailIframe.jsx, src/components/EmailBody.jsx]
  affects: [src/index.css]
tech_stack:
  added: []
  patterns: [CSS class-based styling with focus pseudo-classes, co-located helpers, cross-origin iframe safety]
key_files:
  created:
    - src/components/BillBadge.jsx
    - src/components/BillBadge.css
    - src/components/EmailIframe.jsx
    - src/components/EmailIframe.css
    - src/components/EmailBody.jsx
  modified:
    - src/index.css
decisions:
  - formatRelativeDate co-located in BillBadge for future date display use — referenced via void to avoid lint error
  - no-useless-escape fixed in EmailBody (copied regex from Dashboard) — using /<[a-z!/]/i without escaping /
metrics:
  duration: 5min
  completed: "2026-03-26"
  tasks: 2
  files: 6
---

# Phase 04 Plan 02: BillBadge, EmailIframe, EmailBody Extraction Summary

Extracted BillBadge (with helpers), EmailIframe, and EmailBody (with useEmailBody hook) from Dashboard.jsx into standalone component files with per-component CSS, completing all 5 target component extractions.

## Tasks Completed

| Task | Name | Commit | Files |
|-|-|-|-|
| 1 | Extract BillBadge component with helpers and CSS | 1b5dcfa | src/components/BillBadge.jsx, src/components/BillBadge.css, src/index.css |
| 2 | Extract EmailIframe and EmailBody components with CSS | 47bbdf6 | src/components/EmailIframe.jsx, src/components/EmailIframe.css, src/components/EmailBody.jsx, src/index.css |

## What Was Built

**`src/components/BillBadge.jsx`** — Standalone Actual Budget bill entry component. Co-locates `typeLabels`, `typeHints`, `formatModelName`, `parseDueDate`, and `formatRelativeDate` helpers. Imports `SearchableDropdown` directly (per D-09), `ensureMetadataLoaded`/`_metadataCache` from `actualMetadata.js` (per D-11), and `sendToActualBudget` from `api.js` (per D-10). All inline styles replaced with `.bill-badge-*` CSS classes. Input focus/blur JS handlers replaced with CSS `:focus` pseudo-class. `onClick={(e) => e.stopPropagation()}` on root div preserved.

**`src/components/BillBadge.css`** — All `.bill-badge-*` classes plus bill button hover/active rules moved from `index.css`. Adds `transition` properties to `.bill-send-btn`, `.bill-confirm-btn`, `.bill-cancel-btn` per UI-SPEC timing.

**`src/components/EmailIframe.jsx`** — Standalone email HTML renderer. Preserves cross-origin `try/catch` guard around `contentDocument.scrollHeight`. Preserves `removeEventListener("load", resize)` cleanup. Dynamic `style={{ height }}` kept as inline (JavaScript-computed value). DOMPurify config (ADD_TAGS, ADD_ATTR, WHOLE_DOCUMENT) preserved exactly.

**`src/components/EmailIframe.css`** — `.email-iframe` and `.email-text` rules moved from `index.css`. Adds `.email-body-*` wrapper classes for EmailBody component.

**`src/components/EmailBody.jsx`** — Self-contained email body renderer with `useEmailBody` hook (module-level, not exported). Renders `EmailIframe` for HTML emails, `<pre className="email-text">` for plain text, and `BillBadge` for bill emails. `notifiedRef` + `setTimeout(() => onLoaded?.(), 75)` timing preserved. All inline styles replaced with `.email-body-*` CSS classes.

**`src/index.css`** — `.email-iframe`, `.email-text`, and all `.bill-send-btn`/`.bill-confirm-btn`/`.bill-cancel-btn` rules removed (now owned by component CSS files).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Unnecessary escape in isHtml regex**
- **Found during:** Task 2 lint check
- **Issue:** Copied regex `/<[a-z!\/]/i` from Dashboard.jsx has `no-useless-escape` error — `\/` is unnecessary inside a character class
- **Fix:** Changed to `/<[a-z!/]/i` in EmailBody.jsx (same semantics, no lint error)
- **Files modified:** src/components/EmailBody.jsx
- **Commit:** 47bbdf6

## Known Stubs

None — components are complete standalone implementations. Not yet imported by Dashboard.jsx (wiring is Plan 03).

## Self-Check: PASSED
