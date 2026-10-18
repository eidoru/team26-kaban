# Kaban UAT Scripts

Manual acceptance tests for evaluators. Rule IDs refer to [PRODUCT_SPEC.md](./PRODUCT_SPEC.md).

## Setup

- Run against the local stack (`npm run db:local:start`, then `npm run dev:local`), or against a preview deploy. Never test against production data.
- Use three browser profiles (or private windows): **Organizer**, **Member A** and **Member B**.
- Check each screen at phone width (390px) and desktop width (1280px).
- To walk through rounds without waiting for the calendar, turn on **Profile → Developer → Show demo tools** as the organizer. A launched group then shows **Start now**, and an active group shows **Close round N now** on its dashboard.

## Scenario A: Full cycle (happy path)

| Step | Actor | Action | Pass criteria |
|------|-------|--------|---------------|
| A1 | Organizer | Register, create a 4-slot weekly paluwagan with a start date at least 7 days out | The group opens in the lobby (R-SET-05) |
| A2 | Organizer | Copy the invite link; Members A and B open it and join | Both appear in the lobby; the organizer is notified |
| A3 | Organizer | Add a placeholder for the fourth slot | All slots are filled |
| A4 | Organizer | Set the payout order, then **Launch paluwagan** and confirm | The group is launched; details and order are locked (R-DEC-27, R-DEC-28) |
| A5 | Organizer | **Start now** | The group is active; round 1 is open and the schedule shows every payout date |
| A6 | Member A | **Report a payment** for the full contribution, with a proof photo | Shows as waiting for review |
| A7 | Organizer | Review and **Approve** it | Member A shows as paid; Member A is notified |
| A8 | Organizer | **Record payment** for the placeholder and for themselves, then approve both | Both show as paid. With more than one placeholder unpaid, Record first asks who paid (R-SUB-02, R-SUB-03) |
| A9 | Member B | Report and get approved for the full contribution | Collection shows the full pot |
| A10 | Organizer | **Close round 1 now** | Round 1 closes; the recipient's payout appears; round 2 opens (R-PAY-06) |
| A11 | Organizer | Mark the payout as handed over | The recipient is asked to confirm |
| A12 | Recipient | **Mark received** | The payout shows as received (R-PAY-05) |
| A13 | All | Repeat for every round | — |
| A14 | All | After the last round | The group is completed and shows the recap (R-CMP-01, R-CMP-02) |

## Scenario B: Shortfall, debt and interest

Create the group with **Charge interest on shortfalls** on (for example 1.25%).

| Step | Actor | Action | Pass criteria |
|------|-------|--------|---------------|
| B1 | Member A | Pay half the contribution; organizer approves | Member A shows as partial (R-SUB-07) |
| B2 | Organizer | Close the round (Member A is not the recipient) | The recipient's payout is not reduced. Member A has a debt of the shortfall plus interest (R-PAY-02, R-DBT-02) |
| B3 | All | Open **Debts** | Every member sees Member A's debt (R-DEC-06) |
| B4 | Organizer | Close another round with the debt unpaid | Interest is charged again on the unpaid principal only (R-DBT-03) |
| B5 | Member A | **Pay toward your debt** with part of the balance; organizer approves | Interest is paid first, then principal (R-DBT-05) |
| B6 | Organizer | Close the round where Member A is the recipient | Member A's net payout is the pot minus their own shortfall and remaining debt, with no new charge that day (R-PAY-03, R-DEC-05) |

## Scenario C: Stacked payments and paying ahead

| Step | Actor | Action | Pass criteria |
|------|-------|--------|---------------|
| C1 | Member A | Report two partial payments before the organizer reviews | Both wait, numbered ("1 of 2") (R-SUB-05, R-DEC-30) |
| C2 | Member A | Try to report more than what's left after the waiting payments | The form refuses it under the field (R-SUB-06, R-DEC-29) |
| C3 | Organizer | Review | Payments are reviewed in the order they came in; deciding one opens the next of the stack (R-DEC-30) |
| C4 | Member A | Once this round is covered (approved or waiting), **Pay ahead** for a later round | The payment fills the next round (R-DEC-31) |
| C5 | Member B | With a debt still open, try to pay past this round | Refused: the debt must be paid first (R-DEC-31) |
| C6 | Member A | Report one payment worth more than what's left this round (for example three contributions) | It covers this round and the next ones in order, and is reviewed, approved or denied as one payment (R-DEC-33) |
| C7 | Member A | **Report a problem** on a payment made ahead, before its round's payout | The correction is accepted (R-DEC-32) |
| C8 | Member A | Withdraw a payment report while it's waiting | It shows as withdrawn; a split payment is withdrawn whole (R-SUB-04, R-DEC-33) |

## Scenario D: Problem reports

| Step | Actor | Action | Pass criteria |
|------|-------|--------|---------------|
| D1 | Member A | On an approved payment, **Report a problem** with a lower correct amount | The organizer is notified |
| D2 | Organizer | **Approve change** | The amount drops and a refund is recorded (R-DSP-03, R-DEC-14) |
| D3 | Member B | Report a problem and leave it unreviewed until the round closes | The report expires, the approved amount stands, Member B is notified (R-DEC-21) |

## Scenario E: Swaps

| Step | Actor | Action | Pass criteria |
|------|-------|--------|---------------|
| E1 | Member A | **Swap turns** with Member B (neither paid out yet) | Member B is asked to accept |
| E2 | Member B | **Accept** | The organizer is asked to approve (R-SWP-02) |
| E3 | Organizer | **Approve** | Positions and payout dates update; both are notified |
| E4 | Member A | Try to swap with the current recipient within 3 days of the payout | Refused (R-SWP-03) |

## Scenario F: Lobby, claims and cancellation

| Step | Actor | Action | Pass criteria |
|------|-------|--------|---------------|
| F1 | Organizer | In the lobby, **Edit details** (for example the contribution) | Members are notified with before and after values (R-LOB-09) |
| F2 | Organizer | Create a placeholder and copy its **Claim link** | — |
| F3 | Member B | Open the claim link and **Claim slot** | Member B takes over the placeholder; the link stops working |
| F4 | Organizer | **Cancel paluwagan** in a second lobby | The group is cancelled and members are notified. Cancel isn't offered after launch (R-DEC-03) |

## Scenario G: Records and visibility

| Step | Actor | Action | Pass criteria |
|------|-------|--------|---------------|
| G1 | Member B | Open Member A's payment that has a proof | Amount and status show, with a proof-attached flag, but not the photo (R-DEC-17) |
| G2 | Organizer | Open the same payment | The photo shows |
| G3 | Any | Open **Activity** | Every step above is listed with actor, amounts and before/after values (R-AUD-01, R-AUD-04) |
| G4 | Any | In **Money & records**, download the statement, ledger and summary as PDF and CSV | Files download and match the screens (§14) |

## Scenario H: Access control (API)

| Step | Action | Pass criteria |
|------|--------|---------------|
| H1 | `GET /api/v1/groups/home` without a token | 401 |
| H2 | A user with no slot opens another group's id | 404 |
| H3 | A member calls an organizer action (for example approving a payment) | 403 |
| H4 | `GET /api/v1/cron/daily` without the cron secret | 403 |
| H5 | `POST /api/v1/dev/groups/:id/close-round` on production without `ALLOW_DEMO_TOOLS` | 404 |

## Performance spot checks

| Check | Target | How to verify |
|-------|--------|---------------|
| Group dashboard | ≤ 2 s | Hard refresh an active group; check the request's `Server-Timing` in the Network tab |
| Live update | A few seconds | Approve a payment as organizer; the member's open page updates without a refresh |
| Access token | Expires in ~15 min | `exp` claim in the decoded token |

For API timings on a deployment, run `npm run bench` (see the README).

## Automated tests

```bash
npm test          # Vitest: domain rules, API smoke tests, helpers
npm run typecheck # type-check both workspaces
```

See [TEST_TRACEABILITY.md](./TEST_TRACEABILITY.md) for the mapping from rules to tests and scenarios.
