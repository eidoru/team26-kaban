# Test Traceability Matrix

Maps Kaban MVP features to automated tests and UAT scenarios.

| ID | Requirement | Automated test | UAT scenario |
|----|-------------|----------------|--------------|
| UC-01 | Create paluwagan | — | A1 |
| UC-02/04 | Invite / claim links | — | A2 |
| UC-03 | Placeholder members | — | A2 |
| UC-10 | Payout order | `schedule.test.ts` (due dates) | A3 |
| UC-11 | Activate + schedule | `schedule.test.ts` | A3 |
| UC-12/16 | Round open/close | — | A7, B3 |
| UC-13/14 | Report / confirm pay | `api.smoke.test.ts` (auth) | A4–A5 |
| UC-15 | Round status view | — | A3 |
| UC-19 | Shortfall on close | `obligations.test.ts` (shortfall calc) | B3 |
| UC-20 | FIFO settlement | `obligations.test.ts` (status) | B4 |
| UC-21/22 | Disputes | — | C1–C3 |
| UC-23 | Manager obligations | — | B4 |
| UC-25 | Portfolio home | — | A1 |
| UC-26 | Notifications | — | C2 |
| UC-27 | Shared ledger | — | B5 |
| SRS 4.1 | Manager dashboard | — | A6, C4 |
| SRS 4.4 | Completion summary | — | A9 |
| NFR | Cron protected | `api.smoke.test.ts` | D3 |
| NFR | Auth required | `api.smoke.test.ts` | D1 |
| NFR | Input validation | `api.smoke.test.ts` | — |
| RA 10173 | Privacy notice | — | Register page copy |

## Automated test files

| File | Coverage |
|------|----------|
| `server/src/services/schedule.test.ts` | Rotation due-date engine |
| `server/src/services/obligations.test.ts` | Shortfall math, obligation status |
| `server/src/api.smoke.test.ts` | Health, auth guards, cron secret, validation |

Run: `npm test` from repo root.
