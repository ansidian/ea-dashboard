# EA Dashboard — Hardening Milestone

## What This Is

A personal executive assistant dashboard that consolidates emails, calendars, weather, Canvas LMS deadlines, and finances into AI-powered daily briefings. Built with React 19 + Vite frontend and Express.js backend, backed by Turso (LibSQL) and Claude API. This milestone hardens the existing working application — fixing security gaps, improving architecture, adding performance optimizations, and establishing a test foundation.

## Core Value

Every change must leave the dashboard more reliable and maintainable without breaking the existing user experience. Ship working improvements incrementally — this is a hardening pass, not a rewrite.

## Requirements

### Validated

- ✓ Daily briefing generation from multiple data sources (Gmail, iCloud, Calendar, Weather, Canvas, Actual Budget) — existing
- ✓ Claude AI email triage and insight generation — existing
- ✓ Account management (Gmail OAuth, iCloud IMAP credentials) — existing
- ✓ Actual Budget integration (bill tracking, schedule upsert, send-to-budget) — existing
- ✓ Email dismiss/auto-expire with carried-over indicators — existing
- ✓ Delta briefing (incremental updates without full regeneration) — existing
- ✓ Settings page with model selection and customization — existing
- ✓ Scheduled automatic briefing generation — existing

### Active

- [x] Switch encryption from AES-256-CBC to AES-256-GCM (authenticated encryption) — Validated in Phase 01
- [x] Use timing-safe password comparison — Validated in Phase 01
- [x] Add CSRF token validation to OAuth callback — Validated in Phase 01
- [x] Persist sessions to database (survive restarts) — Validated in Phase 01
- [x] Extract worst Dashboard.jsx components into src/components/ — Validated in Phase 04
- [x] Move pervasive inline styles to CSS classes for extracted components — Validated in Phase 04
- [ ] Deduplicate schedule logic in actual.js
- [ ] Serialize Actual Budget API access with mutex/queue
- [ ] Cache Actual Budget metadata server-side with TTL
- [ ] Parallelize email fetch fallback path
- [ ] Harden Claude JSON response parsing with schema validation
- [ ] Add invariant checks to email regrouping logic
- [ ] Add invariant checks to delta briefing merge logic
- [x] Set up Vitest with foundational test infrastructure — Validated in Phase 01
- [x] Test encryption module (encrypt/decrypt round-trips, GCM migration) — Validated in Phase 01
- [ ] Test Claude response parsing (valid JSON, regex fallback, malformed input)
- [ ] Test email regrouping logic (fixEmailAccounts)
- [ ] Test delta briefing merge logic (email dedup, dismiss filtering, seenCount)

### Out of Scope

- Full Dashboard.jsx rewrite — surgical extraction only, not a complete decomposition
- Comprehensive test coverage for all modules — foundational setup + fragile areas only
- CI/CD pipeline — no automated deployment this milestone
- Multi-user support — single-user architecture stays
- Error tracking/monitoring (Sentry etc.) — not this milestone
- Rate limiting — acceptable risk for single-user app
- Input validation library (zod/joi) — manual checks sufficient for now
- Frontend component tests — test backend first, frontend after extraction stabilizes

## Context

- Brownfield codebase — everything works, this is hardening not greenfield
- Single-user personal app — some security concerns are lower priority than they would be in multi-tenant
- Dashboard.jsx reduced from 2311 to 1704 lines after Phase 04 component extraction
- `@actual-app/api` is a singleton by design — concurrent access requires serialization, no alternative library exists
- Codebase mapping completed 2026-03-26 in `.planning/codebase/`

## Constraints

- **Tech stack**: React 19 + Vite + Express.js — no framework changes
- **Database**: Turso (LibSQL) — sessions must use existing DB
- **Backwards compatibility**: Encrypted credentials must migrate seamlessly from CBC to GCM
- **No downtime**: Each change must be independently deployable without breaking the running app

## Key Decisions

| Decision | Rationale | Outcome |
|-|-|
| Surgical Dashboard extraction over full rewrite | Agile — extract worst offenders, keep working | Validated Phase 04 — 2311→1704 lines, 5 components extracted |
| Vitest over Jest | Native ESM support, Vite ecosystem alignment | Validated Phase 01 |
| AES-256-GCM over alternative encryption libs | Node crypto native, drop-in replacement for CBC | Validated Phase 01 |
| Mutex pattern for Actual API over connection pooling | Singleton constraint of @actual-app/api — pooling isn't possible | Validated Phase 03 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-26 after Phase 04 completion*
