---
phase: 02-reliability-test-coverage
plan: 01
subsystem: testing
tags: [vitest, claude, json-parsing, schema-validation]

# Dependency graph
requires:
  - phase: 01-security-hardening
    provides: Vitest test infrastructure, encryption.test.js pattern for co-located tests
provides:
  - parseResponse exported as named export from server/briefing/claude.js
  - Top-level JSON schema validation for Claude API responses
  - 10 Vitest tests covering valid JSON, regex fallback, markdown fences, wrong shape, empty, garbage, extra keys
affects: [briefing, claude, 02-02, 02-03, 02-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Re-throw shape validation errors before catch falls through to regex fallback — prevents invalid-shape responses from masking as unparseable"
    - "validateBriefingShape helper above parseResponse — co-located validation without new utils module"
    - "REQUIRED_SHAPE constant for top-level key/type spec — extend when new required keys are added"

key-files:
  created: [server/briefing/claude.test.js]
  modified: [server/briefing/claude.js]

key-decisions:
  - "Top-level shape validation only (D-04) — validate keys exist with correct types, not nested structures"
  - "Re-throw shape errors before regex fallback — shape mismatch is not a parse failure, prevents silent fallback masking"
  - "Export parseResponse as named export for testability — no new utils module, stays co-located per D-08"

patterns-established:
  - "TDD RED/GREEN with co-located test file: server/briefing/claude.test.js alongside claude.js"
  - "Set process.env vars before dynamic import in tests that read env at module load time"

requirements-completed: [REL-01, TEST-03]

# Metrics
duration: 1min
completed: 2026-03-26
---

# Phase 02 Plan 01: parseResponse Schema Validation Summary

**parseResponse exported from claude.js with REQUIRED_SHAPE top-level validation, 10 Vitest tests covering valid/invalid/unparseable inputs**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-26T18:45:13Z
- **Completed:** 2026-03-26T18:46:47Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Added `validateBriefingShape()` helper that checks aiInsights/emails/deadlines are present with correct types
- Exported `parseResponse` as a named export for testability without breaking `callClaude()` caller
- Shape validation errors re-thrown before regex fallback (prevents wrong-shape responses masking as unparseable)
- 10 test cases pass: valid JSON, markdown fences (```json and ```), regex fallback, extra keys, missing key, wrong type, empty string, garbage text

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing tests for parseResponse (RED)** - `7dedaec` (test)
2. **Task 2: Add schema validation and export parseResponse (GREEN)** - `9df6ed2` (feat)

**Plan metadata:** (docs commit — see below)

_Note: TDD tasks have two commits: test (RED) then feat (GREEN)_

## Files Created/Modified

- `server/briefing/claude.test.js` - 10 Vitest tests for parseResponse (valid input, invalid shape, unparseable)
- `server/briefing/claude.js` - Added REQUIRED_SHAPE, validateBriefingShape(), exported parseResponse

## Decisions Made

- Shape validation re-throws immediately before the regex fallback try/catch. This is intentional: if JSON parses successfully but has the wrong shape, that is a semantic error — not a parse failure. The regex fallback is only for syntactically unparseable input.
- Only top-level keys validated (D-04): aiInsights (array), emails (object), deadlines (array). Nested structure validation deferred to avoid brittleness as the schema evolves.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- parseResponse is now testable and validates shape before returning to callClaude
- Plans 02-02 and 02-03 can use the same co-located test pattern (fixEmailAccounts, delta merge)
- No blockers

---
*Phase: 02-reliability-test-coverage*
*Completed: 2026-03-26*
