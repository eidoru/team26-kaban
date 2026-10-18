# Test Traceability Matrix

Maps the rules in [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) to automated tests and [UAT](./UAT.md) scenarios. Test names cite the rule IDs, so `grep` a rule ID in `server/src` to find its tests.

| Rule | Requirement | Automated test | UAT |
|------|-------------|----------------|-----|
| §4.1, R-SET-01/02/05/06 | Setup validation | `domain/setup.test.ts` (setupErrors) | A1 |
| R-AMT-01–04 | Amounts and rounding | `domain/domain.test.ts` (amounts, money) | A1 |
| §4.3, R-FRQ-04/05, R-DEC-02 | Payout schedule | `domain/domain.test.ts` (schedule) | A5 |
| R-LOB-09/10 | Lobby edits | `domain/setup.test.ts` (settingChanges, setupErrors) | F1 |
| §5.3–5.4 | Invite and claim links | `api.smoke.test.ts` (auth required) | A2, F2–F3 |
| R-LCH-02, R-DEC-27/28 | Launch | `domain/setup.test.ts` (launchBlockers) | A4 |
| R-DEC-03 | Cancel only from the lobby | `domain/domain.test.ts` (lifecycle) | F4 |
| R-SUB-02–04 | Submissions and review | — | A6–A8, C8 |
| R-SUB-05/06/07, R-DEC-29/30 | Caps, stacking, room rule | `domain/submissions.test.ts`, `domain/domain.test.ts` (submissions) | C1–C3 |
| R-DEC-31/33 | Paying ahead, one payment across rounds | `domain/submissions.test.ts` (R-DEC-31 / R-DEC-33) | C4–C6, C8 |
| R-DEC-32 | Problem reports on payments made ahead | — | C7 |
| R-DSP-01/03, R-DEC-13 | Problem reports | `domain/domain.test.ts` (disputes) | D1–D2 |
| R-DEC-21 | Problem report expiry | — | D3 |
| §7, R-PAY-02/03/04 | Payout processing | `domain/domain.test.ts` (payout processing, §8.1 worked example) | A10, B2, B6 |
| R-PAY-05 | Handover and receipt | — | A11–A12 |
| §8, R-DBT-01–10, R-DEC-05/11 | Debts and interest | `domain/domain.test.ts` (debt, payout processing) | B1–B6 |
| §9, R-SWP-01/02/03, R-DEC-22 | Swaps | `domain/swaps.test.ts` | E1–E4 |
| R-CMP-01/02 | Completion | `domain/domain.test.ts` (C owes 2,025 at completion) | A14 |
| §15.1, R-DEC-26 | Round health | `domain/health.test.ts` | — |
| §13, R-AUD-01/04 | Activity log | `services/activity.test.ts` (every audit action has a sentence) | G3 |
| R-AUD-02 | Append-only audit log | — (database trigger) | — |
| R-DEC-17 | Proof photo visibility | — | G1–G2 |
| §14 | Exports | — | G4 |
| §12 | Notifications and live updates | `lib/realtimeNotify.test.ts` | A2, A7 |
| NFR | Auth required | `api.smoke.test.ts` | H1 |
| NFR | Group and organizer access | — | H2–H3 |
| NFR | Cron protected | `api.smoke.test.ts` (Cron security) | H4 |
| NFR | Demo tools gated in production | `api.smoke.test.ts` (Demo tools environment gate) | H5 |
| NFR | Input validation | `api.smoke.test.ts`, `lib/validation.test.ts` | C2 |

## Automated test files

All under `server/src/`.

| File | Coverage |
|------|----------|
| `domain/domain.test.ts` | Money, amounts, schedule, submission caps, problem reports, debt, lifecycle, payout processing (the §8.1 worked example) |
| `domain/submissions.test.ts` | Room rule (R-DEC-29), stacked payments, paying ahead (R-DEC-31/33) |
| `domain/setup.test.ts` | Setup validation, settings, lobby edit diffs, launch blockers |
| `domain/swaps.test.ts` | Swap blockers and when the organizer approves |
| `domain/health.test.ts` | Round health (on track, at risk, short) |
| `services/activity.test.ts` | Activity sentences for every audit action |
| `api.smoke.test.ts` | Health, auth guards, register validation, cron secret, demo tools gate |
| `middleware/auth.test.ts` | Optional auth for invite and claim pages |
| `lib/realtimeNotify.test.ts` | Group broadcasts |
| `lib/origin.test.ts` | App and CORS origin |
| `lib/validation.test.ts`, `lib/dates.test.ts` | Text validation, date formatting |

Run `npm test` from the repo root.

Rows with no automated test are covered by the UAT scenarios only. They are the service and database flows; the domain rules behind them are unit-tested.
