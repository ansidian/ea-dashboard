# Requirements: EA Dashboard Hardening

**Defined:** 2026-03-26
**Core Value:** Every change must leave the dashboard more reliable and maintainable without breaking the existing user experience.

## v1 Requirements

### Security

- [x] **SEC-01**: Encryption uses AES-256-GCM with authenticated encryption; existing CBC credentials auto-migrate on decrypt via format prefix detection
- [x] **SEC-02**: Login password compared with `crypto.timingSafeEqual()` to prevent timing attacks
- [x] **SEC-03**: OAuth callback validates CSRF token stored in session before accepting tokens
- [x] **SEC-04**: Sessions persist to Turso database and survive server restarts

### Performance

- [ ] **PERF-01**: All Actual Budget API access serialized through mutex to prevent singleton contention
- [ ] **PERF-02**: Actual Budget metadata (accounts, payees, categories) cached server-side with 5-minute TTL; invalidated on write operations
- [ ] **PERF-03**: Gmail batch fallback fetches messages in parallel chunks (10 concurrent) instead of sequentially

### Reliability

- [x] **REL-01**: Claude JSON response parsing validates against expected schema shape after parse; logs failures
- [x] **REL-02**: Email regrouping logic (`fixEmailAccounts`) includes invariant check: email count in = email count out
- [ ] **REL-03**: Delta briefing merge includes invariant check: no silent email loss or duplication
- [x] **REL-04**: Duplicate schedule logic in `actual.js` consolidated into shared helper function

### Architecture

- [ ] **ARCH-01**: Worst Dashboard.jsx sub-components extracted to `src/components/` (BillBadge, CTMCard, SearchableDropdown, EmailIframe at minimum)
- [ ] **ARCH-02**: Extracted components use CSS classes instead of inline styles; styles added to `src/index.css`

### Testing

- [x] **TEST-01**: Vitest configured with separate `vitest.config.js` for ESM, `npm test` script added
- [x] **TEST-02**: Encryption module tested: encrypt/decrypt round-trip, CBC->GCM migration, tampered ciphertext rejection, invalid key handling
- [x] **TEST-03**: Claude `parseResponse()` tested: valid JSON, regex fallback, malformed/empty input
- [x] **TEST-04**: `fixEmailAccounts()` tested: correct regrouping, mismatched labels, empty arrays, duplicate IDs
- [ ] **TEST-05**: Delta briefing merge tested: email dedup, dismiss filtering, seenCount tracking, edge cases

## v2 Requirements

### Quality

- **QUAL-01**: CI/CD pipeline with automated test runs on push
- **QUAL-02**: Structured logging replacing console.error throughout server
- **QUAL-03**: Frontend component tests for extracted components
- **QUAL-04**: Input validation library (zod) for API request schemas

### Security

- **SEC-05**: Rate limiting on expensive endpoints (briefing generation)
- **SEC-06**: Request body size limit explicitly set on Express

## Out of Scope

| Feature | Reason |
|-|-|
| Full Dashboard.jsx rewrite | Surgical extraction only — hardening, not rewriting |
| Comprehensive server test coverage | Foundational + fragile areas only; diminishing returns |
| Multi-user support | Single-user is a feature for personal app |
| CSS framework (Tailwind etc.) | Plain CSS classes sufficient; no framework churn |
| bcrypt password hashing | Password is env var, not DB-stored; timingSafeEqual sufficient |
| Error tracking (Sentry) | Operational overhead for personal app; console.error adequate |
| Frontend component tests | Test backend first; frontend after extraction stabilizes |

## Traceability

| Requirement | Phase | Status |
|-|-|-|
| SEC-01 | Phase 1 | Complete |
| SEC-02 | Phase 1 | Complete |
| SEC-03 | Phase 1 | Complete |
| SEC-04 | Phase 1 | Complete |
| PERF-01 | Phase 3 | Pending |
| PERF-02 | Phase 3 | Pending |
| PERF-03 | Phase 3 | Pending |
| REL-01 | Phase 2 | Complete |
| REL-02 | Phase 2 | Complete |
| REL-03 | Phase 2 | Pending |
| REL-04 | Phase 2 | Complete |
| ARCH-01 | Phase 4 | Pending |
| ARCH-02 | Phase 4 | Pending |
| TEST-01 | Phase 1 | Complete |
| TEST-02 | Phase 1 | Complete |
| TEST-03 | Phase 2 | Complete |
| TEST-04 | Phase 2 | Complete |
| TEST-05 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-03-26*
*Last updated: 2026-03-26 after roadmap creation*
