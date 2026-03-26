---
phase: 03-actual-budget-performance
plan: 01
subsystem: server/briefing
tags: [mutex, cache, performance, tdd]
dependency_graph:
  requires: []
  provides: [withLock-mutex, metadata-cache-5min-ttl]
  affects: [server/briefing/actual.js, server/routes/ea.js, server/routes/briefing.js]
tech_stack:
  added: []
  patterns: [promise-chain-mutex, module-level-ttl-cache]
key_files:
  created: [server/briefing/actual.test.js]
  modified: [server/briefing/actual.js]
decisions:
  - Cache check inside withLock to prevent cache stampede (per D-03 from RESEARCH.md)
  - testConnection used for serialization test (no cache interference vs getMetadata)
metrics:
  duration: 6min
  completed: 2026-03-26
  tasks_completed: 1
  files_modified: 2
---

# Phase 03 Plan 01: Actual Budget Mutex and Cache Summary

**One-liner:** Promise-chain mutex serializes all Actual Budget API access with 5-minute in-memory metadata cache inside the lock to prevent stampede.

## What Was Built

Added two performance/correctness primitives to `server/briefing/actual.js`:

1. **`withLock` mutex** — module-level promise-chain that serializes the three exported functions (`getMetadata`, `sendBill`, `testConnection`). The `@actual-app/api` is a singleton — concurrent init/shutdown cycles cause conflicts. The mutex guarantees FIFO ordering with no-deadlock recovery (`lock = result.catch(() => {})`).

2. **Metadata cache** — module-level `{ data, ts }` object with 5-minute TTL. Cache check is inside `withLock` (not before it), preventing cache stampede: only the first queued caller downloads; subsequent callers see the warm cache.

## Tests

6 tests in `server/briefing/actual.test.js`:
- Mutex serialization: two concurrent `testConnection` calls execute sequentially
- Error recovery: rejected call does not block next caller
- Cache hit: `getMetadata` called twice within TTL — `actualApi.init` called once
- Cache expiry: TTL simulated via `vi.spyOn(Date, "now")` — `actualApi.init` called twice
- `sendBill` mutex: concurrent with `getMetadata` — sequential order verified
- `testConnection` mutex: concurrent with `getMetadata` — sequential order verified

All 6 tests pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test serialization via testConnection instead of getMetadata**
- **Found during:** Task 1 GREEN
- **Issue:** Using two concurrent `getMetadata` calls to test serialization fails because the cache kicks in — first call populates cache, second call returns early without calling init, so "init-2-start" never appears in the order array
- **Fix:** Changed the serialization test to use `testConnection` (which has no cache), guaranteeing both calls always invoke init
- **Files modified:** server/briefing/actual.test.js
- **Commit:** 24df951

**2. [Rule 1 - Bug] Test isolation required vi.clearAllMocks() + vi.resetModules()**
- **Found during:** Task 1 GREEN (debugging test failures)
- **Issue:** `vi.resetModules()` alone doesn't reset mock spy call counts — accumulated from prior tests. Cache/lock state was fresh but init call counts were cumulative.
- **Fix:** Added `vi.clearAllMocks()` alongside `vi.resetModules()` in each `beforeEach`
- **Files modified:** server/briefing/actual.test.js
- **Commit:** 24df951

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: server/briefing/actual.js
- FOUND: server/briefing/actual.test.js
- FOUND: fcb0f41 (test RED commit)
- FOUND: 24df951 (feat GREEN commit)
