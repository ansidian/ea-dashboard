---
phase: 04-component-extraction
plan: 01
subsystem: frontend-components
tags: [react, css, component-extraction, refactor]
dependency_graph:
  requires: []
  provides: [src/lib/actualMetadata.js, src/components/SearchableDropdown.jsx, src/components/CTMCard.jsx]
  affects: [src/index.css]
tech_stack:
  added: []
  patterns: [CSS class-based styling with hover/focus pseudo-classes, co-located helpers]
key_files:
  created:
    - src/lib/actualMetadata.js
    - src/components/SearchableDropdown.jsx
    - src/components/SearchableDropdown.css
    - src/components/CTMCard.jsx
    - src/components/CTMCard.css
  modified:
    - src/index.css
decisions:
  - urgencyStyles object kept as co-located data with eslint-disable-next-line comment — it is co-located per D-03 for Plan 02 BillBadge import; CSS classes handle the actual urgency coloring
  - task.class_color dynamic inline styles retained on color bar and class name span — CSS cannot express runtime per-task colors
metrics:
  duration: 4min
  completed: "2026-03-26"
  tasks: 2
  files: 6
---

# Phase 04 Plan 01: Foundation Component Extraction Summary

Extracted three foundation components (actualMetadata module, SearchableDropdown, CTMCard) from Dashboard.jsx into standalone files with per-component CSS, replacing all JS hover handlers and inline styles with CSS classes.

## Tasks Completed

| Task | Name | Commit | Files |
|-|-|-|-|
| 1 | Extract actualMetadata module and SearchableDropdown | ac88217 | src/lib/actualMetadata.js, src/components/SearchableDropdown.jsx, src/components/SearchableDropdown.css |
| 2 | Extract CTMCard component with co-located helpers and CSS | 66c4ef1, 870cdef | src/components/CTMCard.jsx, src/components/CTMCard.css, src/index.css |

## What Was Built

**`src/lib/actualMetadata.js`** — Shared Actual Budget metadata cache module. Exports `ensureMetadataLoaded(callback)` with deduplication: if a fetch is already in flight, callbacks queue up and all fire together. Exports `_metadataCache` as a named reference for BillBadge initial state. Imports `getActualMetadata` from `../api.js`. The `.finally()` cleanup resets `_metadataFetching = false` and `_metadataListeners = []` to prevent stale listeners.

**`src/components/SearchableDropdown.jsx`** — Standalone searchable dropdown with CSS class-based styling. All `onMouseEnter`/`onMouseLeave` handlers replaced with CSS `:hover` pseudo-classes. All `onFocus`/`onBlur` inline style mutations replaced with CSS `:focus` pseudo-class. `onClick`, `onMouseDown`, `onKeyDown` stopPropagation handlers preserved on root div (functional, not styling). No inline `style={{` attributes.

**`src/components/SearchableDropdown.css`** — All `.searchable-dropdown-*` classes with `:hover` and `:focus` states covering trigger, input, create option, and list items.

**`src/components/CTMCard.jsx`** — CTM task card with co-located helpers: `urgencyStyles`, `parseDueDate`, `getDaysUntil`, `getDueUrgency`. No `onMouseEnter`/`onMouseLeave` handlers — `.ctm-card-root:hover` and `.ctm-card-link:hover` handle hover via CSS. Dynamic `task.class_color` retained as inline style on color bar and class name span only (runtime per-task value, cannot be CSS).

**`src/components/CTMCard.css`** — All `.ctm-card-*` classes plus urgency modifiers (`.ctm-card--high`, `.ctm-card--medium`, `.ctm-card--low`) plus the full `.ctm-desc` block moved from `src/index.css`.

**`src/index.css`** — `.ctm-desc` block removed (85 lines), now owned by CTMCard.css.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] SearchableDropdown create icon inline style**
- **Found during:** Task 1
- **Issue:** Plan said "no inline styles" but the `+` icon in the create option had `style={{ fontSize: 14 }}`
- **Fix:** Converted to `.searchable-dropdown-create-icon` CSS class in SearchableDropdown.css
- **Files modified:** SearchableDropdown.jsx, SearchableDropdown.css
- **Commit:** ac88217

**2. [Rule 1 - Bug] urgencyStyles unused variable lint error**
- **Found during:** Task 2 lint check
- **Issue:** `urgencyStyles` is co-located per D-03 but unused at runtime (urgency coloring uses CSS classes), causing `no-unused-vars` lint error
- **Fix:** Added `// eslint-disable-next-line no-unused-vars` comment with explanatory note about Plan 02 usage
- **Files modified:** src/components/CTMCard.jsx
- **Commit:** 870cdef

## Known Stubs

None — these are new standalone components. Not yet imported by Dashboard.jsx (wiring is Plan 02/03).

## Self-Check: PASSED
