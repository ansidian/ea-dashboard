# Roadmap: EA Dashboard Hardening

## Overview

Harden the working EA Dashboard through four phases: establish a test foundation alongside critical security fixes, add reliability guards and test coverage for fragile logic, serialize and cache Actual Budget access for performance, then surgically extract Dashboard.jsx components. Each phase delivers independently deployable improvements without breaking the running app.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Test Foundation & Security** - Vitest infrastructure, encryption migration to GCM, session persistence, and CSRF protection
- [ ] **Phase 2: Reliability & Test Coverage** - Invariant checks, schema validation, and tests for fragile parsing/merge logic
- [ ] **Phase 3: Actual Budget Performance** - Mutex serialization, metadata caching, and parallel email fetch
- [ ] **Phase 4: Component Extraction** - Surgical Dashboard.jsx decomposition and CSS migration for extracted components

## Phase Details

### Phase 1: Test Foundation & Security
**Goal**: The application has a working test suite and all security vulnerabilities are closed
**Depends on**: Nothing (first phase)
**Requirements**: TEST-01, TEST-02, SEC-01, SEC-02, SEC-03, SEC-04
**Success Criteria** (what must be TRUE):
  1. Running `npm test` executes Vitest and passes with encryption round-trip tests
  2. Existing CBC-encrypted credentials decrypt correctly after GCM migration (backwards compatibility works)
  3. New credentials are encrypted with AES-256-GCM (verified by `gcm:` prefix in stored values)
  4. Server sessions survive a restart without forcing re-login
  5. OAuth callback rejects requests with missing or invalid CSRF state parameter
**Plans:** 2 plans

Plans:
- [x] 01-01-PLAN.md — Vitest setup, GCM encryption migration, encryption test suite
- [x] 01-02-PLAN.md — Session persistence to DB, timing-safe login, CSRF-protected OAuth

### Phase 2: Reliability & Test Coverage
**Goal**: Fragile parsing and merge logic is guarded by invariant checks and covered by tests
**Depends on**: Phase 1
**Requirements**: REL-01, REL-02, REL-03, REL-04, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. Claude response parsing validates JSON shape and logs structured errors on malformed input
  2. Email regrouping asserts email count in equals email count out; violations are logged
  3. Delta briefing merge asserts no silent email loss or duplication
  4. Running `npm test` passes tests for Claude parsing, email regrouping, and delta merge logic
  5. Schedule logic in actual.js uses a single shared helper instead of duplicated functions
**Plans:** 3/4 plans executed

Plans:
- [x] 02-01-PLAN.md — Claude parseResponse schema validation and tests (TDD)
- [x] 02-02-PLAN.md — Email regrouping invariant check and tests (TDD)
- [x] 02-03-PLAN.md — Delta merge extraction, invariant check, and tests (TDD)
- [x] 02-04-PLAN.md — Schedule logic deduplication in actual.js

### Phase 3: Actual Budget Performance
**Goal**: Actual Budget API access is safe from concurrency issues and metadata loads are fast
**Depends on**: Phase 1
**Requirements**: PERF-01, PERF-02, PERF-03
**Success Criteria** (what must be TRUE):
  1. Concurrent Actual Budget requests execute sequentially through a mutex (no singleton contention)
  2. Actual Budget metadata (accounts, payees, categories) returns from cache on repeated requests within 5 minutes
  3. Gmail batch fallback fetches messages in parallel chunks instead of sequentially
**Plans**: TBD

### Phase 4: Component Extraction
**Goal**: Dashboard.jsx is smaller and extracted components use proper CSS instead of inline styles
**Depends on**: Phase 2, Phase 3
**Requirements**: ARCH-01, ARCH-02
**Success Criteria** (what must be TRUE):
  1. BillBadge, CTMCard, SearchableDropdown, and EmailIframe exist as separate files in src/components/
  2. Extracted components use CSS classes from src/index.css instead of inline styles
  3. Dashboard.jsx is measurably smaller (target: under 1600 lines)
  4. All existing dashboard functionality works identically after extraction (no visual or behavioral regressions)
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4
Note: Phases 2 and 3 can execute in parallel (both depend only on Phase 1).

| Phase | Plans Complete | Status | Completed |
|-|-|-|-|
| 1. Test Foundation & Security | 0/2 | Planned | - |
| 2. Reliability & Test Coverage | 3/4 | In Progress|  |
| 3. Actual Budget Performance | 0/? | Not started | - |
| 4. Component Extraction | 0/? | Not started | - |
