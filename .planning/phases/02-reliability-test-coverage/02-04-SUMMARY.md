---
phase: 02-reliability-test-coverage
plan: "04"
subsystem: api
tags: [actual-budget, refactoring, helpers]

# Dependency graph
requires: []
provides:
  - "buildDateCondition helper: extracts date-condition rebuild logic with recurrence preservation"
  - "findExistingSchedule helper: unified payee-then-name lookup for schedules"
  - "updateExistingSchedule helper: condition rebuild with extraConditions override pattern"
  - "createOrReuseSchedule helper: name-collision-safe schedule creation"
affects: [actual-budget integration, schedule upsert, briefing pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "extraConditions parameter for shared update logic with per-caller field overrides"
    - "Math.abs(amount) normalization in shared lookup helper to handle signed amounts from both callers"

key-files:
  created: []
  modified:
    - server/briefing/actual.js

key-decisions:
  - "extraConditions parameter in updateExistingSchedule allows upsertTransferSchedule to hard-set payee+account while upsertSchedule preserves old conditions — single helper, different behaviors via parameter"
  - "findExistingSchedule normalizes with Math.abs(amount) internally so callers pass their natural signed amounts"

patterns-established:
  - "Shared helpers placed above first consumer with --- section comment"
  - "Thin public wrappers handle only caller-specific setup (amount sign, payee resolution, account lookup)"

requirements-completed: [REL-04]

# Metrics
duration: 5min
completed: 2026-03-26
---

# Phase 02 Plan 04: Schedule Logic Deduplication Summary

**Eliminated ~115 lines of duplicated schedule logic in actual.js by extracting 4 shared helpers, leaving upsertSchedule and upsertTransferSchedule as thin wrappers under 35 lines each**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-26T18:46:00Z
- **Completed:** 2026-03-26T18:51:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Extracted `buildDateCondition`, `findExistingSchedule`, `updateExistingSchedule`, `createOrReuseSchedule` as shared helpers
- Reduced `getSchedulesWithConditions` call sites from 7 (across two functions) to 4 (in helpers)
- All 6 return message strings preserved for API compatibility
- All existing 19 tests pass; actual.js has zero lint errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract shared schedule helpers** - `28c15c0` (refactor)
2. **Task 2: Verify refactored schedule functions preserve behavior** - (verification only, no code changes)

## Files Created/Modified
- `server/briefing/actual.js` - Extracted 4 shared helpers; rewrote upsertSchedule and upsertTransferSchedule as thin wrappers

## Decisions Made
- `extraConditions` parameter in `updateExistingSchedule` handles the key behavioral difference: `upsertTransferSchedule` passes `[payee, account]` to hard-override those fields; `upsertSchedule` passes nothing so all old non-date/non-amount conditions are preserved.
- `findExistingSchedule` normalizes to `Math.abs(amount)` internally — callers pass their naturally signed amounts without needing to pre-normalize.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing `email-regroup.test.js` failures (9 tests, `fixEmailAccounts is not a function`) were present before this plan's execution. These are from a parallel agent's TDD RED phase for plan 02-03 and are out of scope for plan 02-04. Logged to deferred items.

## Next Phase Readiness
- `actual.js` schedule logic is now maintainable and testable via its 4 isolated helpers
- REL-04 complete

---
*Phase: 02-reliability-test-coverage*
*Completed: 2026-03-26*
