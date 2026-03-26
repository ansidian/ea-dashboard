---
phase: 04-component-extraction
plan: 03
subsystem: ui
tags: [react, dashboard, component-extraction, jsx]

requires:
  - phase: 04-01
    provides: CTMCard, SearchableDropdown extracted components
  - phase: 04-02
    provides: BillBadge, EmailIframe, EmailBody, actualMetadata extracted

provides:
  - Dashboard.jsx slimmed from 2068 to 1704 lines with all inline component definitions removed
  - CTMCard and EmailBody imported from extracted component files
  - BillBadge, EmailIframe, useEmailBody, SearchableDropdown, ensureMetadataLoaded no longer defined inline in Dashboard

affects: [04-component-extraction]

tech-stack:
  added: []
  patterns:
    - Inline component definitions removed; Dashboard delegates to extracted component files
    - Shared data constants (urgencyStyles, typeLabels) retained in Dashboard where used directly in rendering logic

key-files:
  created: []
  modified:
    - src/pages/Dashboard.jsx

key-decisions:
  - "urgencyStyles and typeLabels retained in Dashboard.jsx — both used directly in Dashboard rendering (Other Deadlines and Bills sections), not just in extracted components"
  - "parseDueDate and formatRelativeDate retained in Dashboard.jsx — formatRelativeDate used at line 1356 in Other Deadlines section"
  - "Line count target of 1600 not met due to retained shared utilities (1704 lines) — all removed code that could be removed was removed (610 deletions)"

requirements-completed: [ARCH-01, ARCH-02]

duration: 15min
completed: 2026-03-26
---

# Phase 04 Plan 03: Wire Imports and Slim Dashboard Summary

**Dashboard.jsx drops from 2068 to 1704 lines by removing all 5 inline component definitions (BillBadge, EmailIframe, useEmailBody/EmailBody, and their supporting utilities) and wiring CTMCard + EmailBody imports**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-26T21:30:00Z
- **Completed:** 2026-03-26T21:45:00Z
- **Tasks:** 1 (Task 2 is a checkpoint)
- **Files modified:** 1

## Accomplishments

- Removed BillBadge function (lines 72-261 of original — 190 lines) from Dashboard.jsx
- Removed EmailIframe function (lines 263-297 — 35 lines) from Dashboard.jsx
- Removed useEmailBody hook (lines 299-329 — 31 lines) from Dashboard.jsx
- Removed EmailBody function (lines 331-414 — 84 lines) from Dashboard.jsx
- Removed supporting utilities moved to extracted components: parseDueDate, getDueUrgency, formatRelativeDate (in BillBadge), formatModelName, typeHints, and the metadata cache vars
- Retained imports for CTMCard and EmailBody already added by previous agent wave
- Build succeeds (330.06 kB bundle), ESLint clean on Dashboard.jsx

## Task Commits

1. **Task 1: Wire imports and remove extracted code from Dashboard.jsx** - `7fe1ca9` (feat)

## Files Created/Modified

- `src/pages/Dashboard.jsx` - Removed 610 lines of inline component definitions; CTMCard and EmailBody now used via imports

## Decisions Made

- `urgencyStyles`, `typeLabels`, `parseDueDate`, and `formatRelativeDate` were retained in Dashboard.jsx because they are used directly in Dashboard rendering code (Other Deadlines section at ~line 1273, Bills section at ~line 965), not only within the extracted components. These are co-located display data for the Dashboard view layer.
- The plan's 1600-line target was not achievable without breaking the file — the retained utilities account for the ~104-line gap (1704 vs 1600). The actual component code removed (BillBadge, EmailIframe, EmailBody, useEmailBody) was fully extracted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Retained urgencyStyles, typeLabels, parseDueDate, formatRelativeDate in Dashboard.jsx**
- **Found during:** Task 1 (Wire imports and remove extracted code)
- **Issue:** Plan said to remove all these constants/functions, but after removal the build failed with `typeLabels is not defined` (line 965) and `formatRelativeDate is not defined` (line 1356). These are used directly in Dashboard's rendering of Other Deadlines and Bills sections, not exclusively in the extracted components.
- **Fix:** Added back only the constants/functions confirmed still used in Dashboard.jsx rendering code
- **Files modified:** src/pages/Dashboard.jsx
- **Verification:** `npx eslint src/pages/Dashboard.jsx` returns 0 errors; `npm run build` succeeds
- **Committed in:** 7fe1ca9 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Essential correctness fix. Line count target (1600) missed by ~104 lines due to retained shared utilities. All extractable code was removed.

## Issues Encountered

- Previous agent had already added CTMCard and EmailBody imports (lines 17-18), so Task 1 only needed to remove inline definitions — no import additions required.
- `getGreeting` function is defined before imports on line 4 (pre-existing code smell) — out of scope for this plan.

## Known Stubs

None — all removed code was fully functional and is now in extracted component files from phases 04-01 and 04-02.

## Next Phase Readiness

- Phase 04 complete: all 5 component extractions done (CTMCard, SearchableDropdown, BillBadge, EmailIframe, EmailBody)
- Dashboard.jsx reduced from 2311 → 1704 lines (607-line reduction across all 3 plans)
- Human smoke test (Task 2 checkpoint) required to verify no regressions

---
*Phase: 04-component-extraction*
*Completed: 2026-03-26*
