# Paluwagan Management System — User Journey & Business Rules

> **For Claude Code:** This is the functional spec for the web app. Rules have IDs (e.g. `R-PAY-03`) so code, tests and commits can reference them. Values written as `CONSTANT_NAME` are configurable limits; anything marked **TBD** has no decided value yet — do not invent one, keep it as a named constant. Items under [Open Questions](#16-open-questions) are undecided; ask before implementing them. Items marked *(assumption)* were inferred, not explicitly decided — implement them, but keep them easy to change.

---

## 1. Overview

A paluwagan is a rotating savings group. Every member contributes a fixed amount each period, and each period one member receives the whole pot. The cycle ends when every member has received the pot once.

**The system is a ledger, not a payment processor.** Money moves outside the app (cash, GCash, bank transfer). The app records contributions, payouts, refunds and debts, and makes the record transparent to every member.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Organizer** | The user who creates and manages a paluwagan. Always occupies one slot. Reviews all submissions. |
| **Member** | A registered user occupying a slot. The organizer is also a member. |
| **Placeholder** | A slot held by a non-user entity managed entirely by the organizer. Can later be claimed by a real user. |
| **Slot** | One position in the paluwagan. Number of slots = number of rounds. |
| **Contribution** | The fixed amount each member owes per period. |
| **Pot** | Contribution × number of slots. The full payout amount. |
| **Contribution Period _k_** | The window during which contributions for Payout _k_ are collected. |
| **Payout _k_** | The pot handed to the member at position _k_ of the payout order, on payout date _k_. |
| **Round _k_** | Contribution Period _k_ plus Payout _k_. |
| **Submission** | A member's (or organizer-on-behalf-of-placeholder's) report of a payment. Requires organizer review. |
| **Dispute** | A request to change an already-approved contribution (refund or correction). |
| **Shortfall** | The unpaid part of a member's contribution when a period closes. |
| **Debt** | A shortfall the organizer covered, owed by the member to the organizer, plus interest. |
| **Shortfall interest** | Optional percentage charged on debt, per period. |
| **Invite link** | Reusable link to join a specific paluwagan's lobby. |
| **Claim link** | Single-use link to take over a specific placeholder. |
| **Payout order** | The sequence in which members receive payouts. |
| **Swap** | Two unpaid members exchanging positions in the payout order. |

---

## 3. Lifecycle States

```
            (setup form submitted)
                      │
                      ▼
   ┌──────────────► LOBBY ──────────────► CANCELLED
   │                  │   (organizer cancels)
   │                  │ all slots filled + payout order set + launch confirmed
   │                  ▼
   │              LAUNCHED  (waiting; settings locked)
   │                  │ start date reached
   │                  ▼
   │               ACTIVE   (contribution periods + payouts)
   │                  │ final payout processed
   │                  ▼
   │     COMPLETED  or  COMPLETED_WITH_OUTSTANDING_DEBT
```

- **LOBBY:** invitations, placeholders, edits, payout ordering.
- **LAUNCHED:** everything locked; waiting for the start date.
- **ACTIVE:** start date reached; contributions are being collected.
- **COMPLETED:** last payout done, no outstanding debt.
- **COMPLETED_WITH_OUTSTANDING_DEBT:** last payout done, at least one member still owes the organizer. Debt records stay open until settled.
- **CANCELLED:** only reachable from LOBBY (R-DEC-03).

---

## 4. Setup (Organizer Creates a Paluwagan)

Submitting the setup form creates the paluwagan in **LOBBY** with the organizer occupying one slot.

### 4.1 Fields and validation

| ID | Field | Rules |
|---|---|---|
| R-SET-01 | Name | Required. Length ≤ `MAX_NAME_LENGTH` (250, R-DEC-35). Must be unique **among the same organizer's paluwagans** (not globally). |
| R-SET-02 | Number of slots | Integer. `MIN_SLOTS` (2, *assumption*) ≤ slots ≤ `MAX_SLOTS` (30, R-DEC-35). |
| R-SET-03 | Amount mode | Organizer enters **either** the total pot **or** the contribution per member. The mode is stored, because it determines recalculation when slots change (R-LOB-10). |
| R-SET-04 | Frequency | One of `WEEKLY`, `BI_WEEKLY`, `TWICE_MONTHLY`, `MONTHLY`, `CUSTOM`. See §4.3. |
| R-SET-05 | Start date | Must be ≥ today + `MIN_START_LEAD_DAYS` (7). |
| R-SET-06 | Shortfall interest | Optional. Percentage. 0 < value ≤ `MAX_INTEREST_PERCENT` (100, R-DEC-34). At most `INTEREST_DECIMAL_PLACES` (2, *assumption*) decimal places. |

### 4.2 Amount calculation

| ID | Rule |
|---|---|
| R-AMT-01 | **Contribution mode:** pot = contribution × slots. |
| R-AMT-02 | **Pot mode:** contribution = ceil(pot ÷ slots) to the **whole peso**. The displayed and stored pot is then **contribution × slots**, which may exceed the entered pot. Example: entered 10,000 with 3 slots → contribution 3,334, pot 10,002. Show this adjustment to the organizer. |
| R-AMT-03 | Contribution is always a whole-peso amount. Other amounts (partial payments, interest, debt) may have centavos. Store money as integer centavos *(assumption)*. |
| R-AMT-04 | Interest amounts are rounded to the nearest centavo, half up *(assumption)*. |

### 4.3 Frequency and schedule

Let `start` = start date and `N` = number of slots. Payout date _k_ (for k = 1…N) is the _k_-th schedule date after `start`. Contribution Period _k_ runs from payout date _k−1_ (or `start` for k = 1) up to payout date _k_.

| ID | Frequency | Next date rule |
|---|---|---|
| R-FRQ-01 | `WEEKLY` | +7 days |
| R-FRQ-02 | `BI_WEEKLY` | +14 days (every two weeks, not twice a month) |
| R-FRQ-03 | `TWICE_MONTHLY` ("kinsenas") | The 15th and the last day of each month. The first payout is the first 15th or month-end at least `MIN_HALF_MONTH_DAYS` (15) days after `start` (R-DEC-02). |
| R-FRQ-04 | `MONTHLY` | Same day-of-month as `start`, **clamped to the last day of the month** when that day doesn't exist. The anchor day is kept: Jan 31 → Feb 28 (Feb 29 in leap years) → Mar 31 → Apr 30 → May 31. |
| R-FRQ-05 | `CUSTOM` | Every N days, with N ≥ `MIN_CUSTOM_INTERVAL_DAYS` (7). |

**Example (monthly, start Nov 1, 2026, 5 slots):**

| Round | Contribution period | Payout date |
|---|---|---|
| 1 | Nov 1, 2026 – Dec 1, 2026 | Dec 1, 2026 |
| 2 | Dec 1, 2026 – Jan 1, 2027 | Jan 1, 2027 |
| 3 | Jan 1 – Feb 1, 2027 | Feb 1, 2027 |
| 4 | Feb 1 – Mar 1, 2027 | Mar 1, 2027 |
| 5 | Mar 1 – Apr 1, 2027 | Apr 1, 2027 (final payout → completion) |

No payout happens on the start date itself.

---

## 5. Lobby

### 5.1 Organizer capabilities

| ID | Rule |
|---|---|
| R-LOB-01 | The organizer can generate an **invite link** for the paluwagan. The link is permanent: it can't be replaced or turned off. |
| R-LOB-02 | The organizer can **add a placeholder** to an empty slot. |
| R-LOB-03 | The organizer can generate a **claim link** for a specific placeholder. The link is permanent until claimed: it can't be replaced or turned off. |
| R-LOB-04 | The organizer can **delete a placeholder**. |
| R-LOB-05 | The organizer can **kick a joined member**. A kicked member may rejoin through the same invite link. |
| R-LOB-06 | The organizer can **cancel** the paluwagan → `CANCELLED`. |
| R-LOB-07 | Members can **leave** the lobby. Their slot becomes empty. |
| R-LOB-08 | The organizer may run the paluwagan entirely with placeholders (organizer + N−1 placeholders). |

### 5.2 Editing details in the lobby

| ID | Rule |
|---|---|
| R-LOB-09 | Any setup field may be edited while in LOBBY, subject to the same validation as §4. All members are notified of every change, including before/after values. |
| R-LOB-10 | Slot count cannot go below the number of occupied slots (members + placeholders). When slot count changes, recalculate based on the stored amount mode: contribution mode → pot changes; pot mode → contribution changes (with R-AMT-02 rounding). |
| R-LOB-11 | Any slot-count change resets the payout order. |
| R-LOB-12 | Any member leaving, being kicked, or a placeholder being deleted after the payout order is set also resets it *(assumption)*. |

### 5.3 Invite link flows

| ID | Situation | Behavior |
|---|---|---|
| R-INV-01 | Anyone opens the link | Show a landing page with the paluwagan's details (name, slots, contribution, pot, frequency, start date, shortfall interest, organizer). |
| R-INV-02 | Not logged in | Show **Log in to join** and **Register to join**. Preserve the invite token through login or registration; on success, add the user to the lobby and redirect there. |
| R-INV-03 | Logged in, not a member | Show a **Join** button. |
| R-INV-04 | Already a member | Tell them they've already joined and redirect to the lobby. |
| R-INV-05 | Paluwagan is full | Tell them it's full. The link stays valid; if a slot opens later, the link works again. |
| R-INV-06 | Paluwagan is no longer in LOBBY | Tell them it's no longer accepting members *(assumption)*. |
| R-INV-07 | One user can hold only **one** slot per paluwagan. Multiple slots per user is not supported. |

### 5.4 Claim link flows (placeholders)

| ID | Rule |
|---|---|
| R-CLM-01 | A claim link is the **only** way to take over a placeholder. |
| R-CLM-02 | A claim link is single-use and **expires once claimed**. |
| R-CLM-03 | Claiming is allowed in LOBBY, LAUNCHED and ACTIVE. |
| R-CLM-04 | The claimer must be logged in (same login/register token flow as R-INV-02) and must not already be a member of this paluwagan. |
| R-CLM-05 | Before confirming, show the placeholder's full record: payout position, contributions so far, shortfalls, outstanding debt, payouts received. |
| R-CLM-06 | On claim, the user **inherits everything** tied to the placeholder: position, contribution history, debts, payouts. History stays labeled as inherited. |

### 5.5 Payout order and launch

| ID | Rule |
|---|---|
| R-ORD-01 | Payout ordering becomes available only when **all slots are filled**. |
| R-ORD-02 | The organizer can arrange the order manually or use **random shuffle**, as many times as they like. |
| R-ORD-03 | **Launching** makes the order final; there is no separate lock step (R-DEC-27). |
| R-LCH-01 | Before launching, the organizer sees a **launch summary**: all details, schedule with every payout date and recipient, member list. The lobby page itself is that summary; launching asks for one confirmation (R-DEC-28). |
| R-LCH-02 | Launch requires: all slots filled, payout order set, start date still valid per R-SET-05 *(assumption; otherwise the organizer must edit the start date)*. |
| R-LCH-03 | On launch → `LAUNCHED`. All settings are locked from this point onward. |
| R-LCH-04 | When the start date is reached → `ACTIVE`, Contribution Period 1 opens, all members are notified. |

---

## 6. Contributions (Active Phase)

### 6.1 Submissions

| ID | Rule |
|---|---|
| R-SUB-01 | A member submits a payment report: amount, type (`CONTRIBUTION` or `DEBT_PAYMENT`), optional proof attachment (image). |
| R-SUB-02 | The organizer submits on behalf of **placeholders**, and for themselves. |
| R-SUB-03 | Every submission starts as `PENDING` and requires the organizer's review — including the organizer's own. |
| R-SUB-04 | Review outcome: `APPROVED` (counts toward the ledger) or `DENIED` (discarded). The submitter can `CANCEL` while pending. |
| R-SUB-05 | Submissions can be **stacked**: multiple pending partial submissions for the same member and period are allowed and reviewed individually, in submission order. |
| R-SUB-06 | **Cap:** a new contribution submission's amount must be ≤ contribution − approved − pending for that member and period. Same cap for debt payments against outstanding debt. |
| R-SUB-07 | Only approved amounts count. A member's period status: `PAID` (approved = contribution), `PARTIAL`, `UNPAID`, plus a `PENDING_REVIEW` indicator. |
| R-SUB-08 | Proof of payment is **optional**. Submissions without proof show a "No proof attached" badge in the review queue and the audit log. |
| R-SUB-09 | Self-approved submissions (organizer approving their own) are flagged in the audit log. |

### 6.2 Disputes (refunds and corrections)

| ID | Rule |
|---|---|
| R-DSP-01 | A member can dispute an **approved** contribution, proposing a corrected amount. Used both to fix mistakes and to request a refund (e.g. the member needs the money back). |
| R-DSP-02 | Disputes are reviewed by the organizer: approved → the contribution amount is updated; denied → no change. |
| R-DSP-03 | An approved reduction is recorded as a **refund** from organizer to member. |
| R-DSP-04 | Disputes for a period must be filed **and resolved** before that period's payout date. |
| R-DSP-05 | As an alternative, a member with a partial approved amount may simply submit another partial payment instead of disputing. |

---

## 7. Payout Processing

On payout date _k_, in this order:

| Step | ID | Rule |
|---|---|---|
| 1 | R-PAY-01 | Contribution Period _k_ closes. |
| 2 | R-PAY-02 | For every **non-recipient** member with a shortfall: the organizer covers it, so the pot stays complete. The shortfall becomes **debt** to the organizer (§8). |
| 3 | R-PAY-03 | For the **recipient**: net payout = pot − recipient's own shortfall this period − recipient's **total accumulated debt** (principal + accrued interest). The accumulated debt portion is settled to the organizer. |
| 4 | R-PAY-04 | If deductions exceed the pot, the net payout is 0 and the remainder stays as debt. |
| 5 | R-PAY-05 | The organizer records the payout as handed over (optional proof). The recipient confirms receipt. For a placeholder recipient, the organizer records and confirms on its behalf. |
| 6 | R-PAY-06 | If _k_ < N, Contribution Period _k+1_ opens and members are notified. If _k_ = N, the paluwagan completes (§10). |

A recipient's payout is **never reduced by other members' shortfalls** — only by their own.

---

## 8. Debt System

| ID | Rule |
|---|---|
| R-DBT-01 | Debt is created when the organizer covers a non-recipient member's shortfall (R-PAY-02). |
| R-DBT-02 | If shortfall interest is set, an interest charge of rate × principal is added when the debt is created (e.g. 1,000 shortfall at 1.25% → 1,012.50 owed). |
| R-DBT-03 | At every **later** payout date while principal remains unpaid, another charge of rate × **remaining unpaid principal** is added. **No interest on interest** (simple, not compounding). |
| R-DBT-04 | Members repay through submissions of type `DEBT_PAYMENT` (same review flow, optional proof). |
| R-DBT-05 | Repayments are applied to **accrued interest first**, then principal. Partial repayments reduce the principal on which future interest is charged. |
| R-DBT-06 | Late payments for a closed period are treated as debt repayments. |
| R-DBT-07 | Interest stops when the debt is fully paid, when it is deducted from the member's payout (R-PAY-03), or when the paluwagan completes. |
| R-DBT-08 | A member who clears their debt before their payout date receives the full pot (minus any current-period shortfall). |
| R-DBT-09 | Shortfalls after a member's payout can only be tracked as debt. |
| R-DBT-10 | Without interest, total deductions can never exceed the pot. With interest, they can (R-PAY-04). |
| R-DBT-11 | Debt payments are still accepted after completion. |

### 8.1 Worked example

5 slots, contribution 2,000, pot 10,000, interest 1.25%, monthly from Nov 1, 2026. Member C is 4th in the order. Everyone else always pays in full. No new interest is charged on the debtor's own payout date (R-DEC-05).

| Payout date | Recipient | C paid | Effect on C |
|---|---|---|---|
| Dec 1 (P1) | A | 1,000 | Debt: principal 1,000 + interest 12.50 |
| Jan 1 (P2) | B | 2,000 | Interest on 1,000 → +12.50 (accrued 25.00) |
| Feb 1 (P3) | D | 500 | Interest on 1,000 → +12.50; new debt 1,500 + 18.75. Principal 2,500, accrued interest 56.25 |
| Mar 1 (P4) | **C** | 800 | Net payout = 10,000 − 1,200 (own shortfall) − 2,556.25 (debt) = **6,243.75**. Debt cleared. |
| Apr 1 (P5) | E | 0 | Debt: principal 2,000 + interest 25.00. Paluwagan completes → `COMPLETED_WITH_OUTSTANDING_DEBT`; C owes 2,025.00, interest stops. |

Test cases worth covering: the first recipient (all debt is post-payout), the last recipient (all debt is deducted), a member who pays nothing (deductions exceed the pot when interest is set), and early repayment before payout.

---

## 9. Payout Order Swaps

| ID | Rule |
|---|---|
| R-SWP-01 | A member can request to swap payout positions with another member. Both must not have received their payout yet. |
| R-SWP-02 | Flow: requester sends → target accepts or declines → organizer approves or denies → positions and payout dates update. |
| R-SWP-03 | Swaps involving the current period's recipient are blocked within `SWAP_LOCK_DAYS` (3) of the payout date. |
| R-SWP-04 | Pending swap requests expire after `SWAP_REQUEST_EXPIRY_DAYS` (7, R-DEC-35). |
| R-SWP-05 | Every step is logged and both members are notified. |

---

## 10. Completion

| ID | Rule |
|---|---|
| R-CMP-01 | After the final payout: `COMPLETED` if no debt remains, otherwise `COMPLETED_WITH_OUTSTANDING_DEBT`. |
| R-CMP-02 | A **completion summary** is generated: per member, total contributed, total received, refunds, debt incurred, debt settled, debt outstanding. |
| R-CMP-03 | When all outstanding debt is settled, the state moves to `COMPLETED` *(assumption)*. |

---

## 11. Constraints (Not Supported in This Version)

- Multiple slots per user.
- Members leaving after launch. Kicking members after launch *(assumption, consistent with no leaving)*.
- Transferring the organizer role (possible future update).
- Editing settings after launch.
- Processing actual payments.

---

## 12. Notifications

| Event | Recipients |
|---|---|
| Lobby detail edited (with before/after) | All members |
| Member joined / left / kicked; placeholder claimed | Organizer (and all members, *assumption*) |
| Paluwagan launched; paluwagan cancelled | All members |
| Contribution period opens | All members |
| Reminder: `REMINDER_DAYS_BEFORE` (3, *assumption*) days before payout date, and on payout day, for anyone not fully paid | Affected members (organizer for placeholders) |
| Submission or dispute pending review | Organizer |
| Submission / dispute approved or denied | Submitter |
| Payout processed; confirm receipt | Recipient |
| Debt created or interest charged | Debtor |
| Swap requested / accepted / approved / expired | Involved members, organizer |
| Paluwagan completed | All members |

---

## 13. Audit Log

| ID | Rule |
|---|---|
| R-AUD-01 | Every action and transaction is recorded: setup, edits, joins, kicks, claims, submissions, reviews, disputes, refunds, payouts, debts, interest charges, swaps, state changes. |
| R-AUD-02 | Entries are **immutable**: never edited or deleted. Corrections appear as new entries. |
| R-AUD-03 | The audit log is **public to all members** of the paluwagan. |
| R-AUD-04 | Each entry includes: timestamp, actor, action, target member/placeholder, amounts, before/after values where applicable, proof-attached flag, self-approved flag. |

---

## 14. Exports

- **Member statement** (PDF and CSV): that member's contributions, submissions, refunds, debts, payouts.
- **Organizer ledger** (PDF and CSV): the whole paluwagan, all members and periods.
- **Completion summary** (R-CMP-02), exportable in the same formats.

---

## 15. Dashboards

### 15.1 Organizer dashboard (per active paluwagan)

- **At a glance:** current round ("Round 3 of 10"), period dates, countdown to payout, next recipient and projected payout, collection progress (collected vs. expected), health indicator (on track / at risk / short).
- **Action items:** pending-reviews queue (oldest first, with counts of submissions, disputes, swap requests), placeholders needing input, members with no submission yet with a "send reminder" action.
- **Member grid:** per member: slot position, paid this period, remaining, status, proof attached; placeholders labeled, with "copy claim link".
- **Money overview:** total collected, total paid out, remaining to pay out, shortfall covered by the organizer, debt owed per member, refunds this period.
- **History and trends:** payout timeline (past with amounts and confirmation status, upcoming with dates), collection rate per period chart, per-member reliability (on time / partial / missed).
- **Shortcuts:** exports, audit log, settings (read-only after launch).

### 15.2 Member home dashboard (across all paluwagans)

- **Due soon:** all amounts owed across every paluwagan, soonest first, each with a "submit payment" action.
- **Paluwagan cards:** name, current round, my status this period, my payout position, countdown to my payout.
- **My payouts:** received (with amounts) and upcoming (with dates).
- **Totals:** contributed, received, outstanding debt.
- **Activity feed:** approvals, denials, swap requests, reminders, organizer changes.
- **Pending:** invitations and swap requests awaiting a response.

### 15.3 Member view (inside one paluwagan)

- **My slot:** payout position, expected date, projected amount (noting deductions from my shortfalls/debt), this period's due/paid/remaining/days left; actions: submit payment, file dispute (until cutoff), request swap.
- **My history:** every submission with amount, date, review status, proof thumbnail, denial reason; per-period owed/paid/shortfall; debt with principal and accrued interest; inherited records labeled.
- **The group (read-only):** payout order with paid/upcoming status, group collection progress, audit log, paluwagan details.

---

## 16. Open Questions

All questions below are decided; see §16.1. New open questions get the next `R-OQ-*` ID.

| ID | Question |
|---|---|
| R-OQ-01 | Values for `MAX_NAME_LENGTH`, `MAX_SLOTS`, `MAX_INTEREST_PERCENT`, `SWAP_REQUEST_EXPIRY_DAYS`. Decided: R-DEC-34, R-DEC-35. |
| R-OQ-02 | `TWICE_MONTHLY`: must the start date fall on a 15th or a month-end, or is the first payout the first 15th/month-end at least one full half-month after the start? Decided: R-DEC-02. |
| R-OQ-03 | Can a paluwagan be cancelled after launch (in LAUNCHED or ACTIVE)? Decided: R-DEC-03. |
| R-OQ-04 | What happens to submissions or disputes still `PENDING` when a payout date arrives? (Options: block payout until resolved; auto-expire; convert pending contributions into debt payments after the debt is created.) Decided: R-DEC-04. |
| R-OQ-05 | On the debtor's own payout date, is the period's interest charged before the deduction? The worked example assumes **no** charge on that date. Decided: R-DEC-05. |
| R-OQ-06 | Can members see each other's individual payment status, or only group totals? Possibly an organizer setting at setup. Decided: R-DEC-06. |
| R-OQ-07 | What if a recipient never confirms receipt of a payout? Decided: R-DEC-07. |

### 16.1 Decisions (2026-10-16)

| ID | Decision |
|---|---|
| R-DEC-02 | (R-OQ-02) The first `TWICE_MONTHLY` payout is the first 15th or month-end at least `MIN_HALF_MONTH_DAYS` (15) days after the start date; later payouts alternate 15th / month-end. |
| R-DEC-03 | (R-OQ-03) Cancellation is allowed **only in LOBBY**, as §3 says. |
| R-DEC-04 | (R-OQ-04) Pending items do not block a payout. When the period closes, the shortfall is computed from approved amounts only and becomes debt as usual. Pending contribution submissions for that period stay in the review queue; if approved later they apply as **debt repayments** (R-DBT-06). |
| R-DEC-05 | (R-OQ-05) **No** interest charge on the debtor's own payout date; the debt is deducted as it stands (matches §8.1). |
| R-DEC-06 | (R-OQ-06) Full transparency: every member sees every member's payment status and debts. |
| R-DEC-07 | (R-OQ-07) An unconfirmed payout auto-confirms after `RECEIPT_AUTO_CONFIRM_DAYS` (7, R-DEC-35), after reminders; the audit log marks it auto-confirmed. |
| R-DEC-08 | Proof attachments are stored in a private Supabase Storage bucket, uploaded via signed URLs and readable only by members of that paluwagan. |
| R-DEC-09 | The rewrite starts from an empty database: the migration drops all existing data, including user accounts. |
| R-DEC-10 | (R-PAY-04) When deductions exceed the pot, the pot covers the recipient's own shortfall first, then accrued debt interest, then debt principal. What the pot can't cover stays as the recipient's existing debt; a payout never creates new debt. |
| R-DEC-11 | The organizer covers their own shortfall and never owes themselves: no debt or interest is created for the organizer. |
| R-DEC-12 | (R-OQ-01) Until values are decided, `MAX_NAME_LENGTH`, `MAX_SLOTS`, `MAX_INTEREST_PERCENT`, `SWAP_REQUEST_EXPIRY_DAYS` and `RECEIPT_AUTO_CONFIRM_DAYS` stay named constants with no value, and their rules are not enforced. |
| R-DEC-13 | (R-DSP-01) A dispute targets one approved contribution submission. The corrected amount may be lower or higher; higher is capped so the period's approved total doesn't exceed the contribution. Only a decrease creates a refund. |
| R-DEC-14 | (R-DSP-03) Refunds are recorded only; no handover or receipt confirmation. |
| R-DEC-15 | (R-SET-01) Name uniqueness is case-insensitive and ignores the organizer's cancelled paluwagans. |
| R-DEC-16 | (§9) Swaps are allowed only while ACTIVE. |
| R-DEC-17 | Proof photos are visible only to the submitter's slot and the organizer; amounts, statuses and the proof-attached flag stay visible to everyone. GCash screenshots can show account details. |
| R-DEC-18 | A contribution period stays open through the whole payout date, so members can still pay that day (§12 reminds them on payout day). It closes, and the payout is computed, just after midnight Manila time. |
| R-DEC-19 | A late contribution or debt payment can't be approved for more than the debt it would pay off (for example, the recipient's own shortfall was already taken out of their payout). The organizer denies it instead. |
| R-DEC-20 | A payout with a net amount of zero has nothing to hand over, so it is marked received straight away. |
| R-DEC-21 | (R-DSP-04) A dispute still pending when its period closes expires: the approved amount stands, the member is notified, and any missing amount can still be paid as a debt payment (R-DSP-05). One unreviewed dispute never delays a payout. |
| R-DEC-22 | (§9) The organizer acts for placeholders in swaps, as with payments (R-SUB-02). When the organizer is a party to a swap, or acts for one, their agreement is the approval: there is no separate organizer step. |
| R-DEC-23 | (§9) A slot can be in only one swap at a time (requested or awaiting approval), so two pending swaps never conflict over the same turn. |
| R-DEC-24 | (R-SWP-01, R-SWP-03) A pending swap expires when either party's payout happens. The lock window and "already paid out" are re-checked when the swap is accepted and approved. |
| R-DEC-25 | (R-SWP-04, R-DEC-12) Until `SWAP_REQUEST_EXPIRY_DAYS` has a value, pending swaps don't expire with time. |
| R-DEC-26 | (§15.1) Round health compares the share of the pot collected (approved money) with the share of the period that has passed: **at risk** when collection is more than 10 points behind the calendar, **short** when the reminder window (`REMINDER_DAYS_BEFORE`) has started and the pot isn't full, otherwise **on track**. |
| R-DEC-27 | (R-ORD-03, 2026-10-16) Locking and launching are one step. The organizer can shuffle or arrange the order until launch; launching makes the order final along with the settings. |
| R-DEC-28 | (R-LCH-01, 2026-10-17) No separate review screen before launch: once the order is set, the lobby page (details, schedule, members) is the summary, and Launch asks for one confirmation. |
| R-DEC-29 | (R-SUB-06, R-DEC-13, 2026-10-17) **Room rule.** For each member and open period, approved contributions + pending contributions + the increases asked for in pending corrections never exceed the contribution. It is checked whenever money is asked for: sending a contribution (R-SUB-06 also counts pending correction increases) and raising a correction (R-DEC-13 also counts pending contributions and other pending increases). A decrease frees nothing until it is approved. So every pending item can be approved in any order without passing the contribution. When pending payments block a correction, the form says how much is waiting and that the member can withdraw those payments (R-SUB-04) if the correction includes them. Approving a contribution or a correction is re-checked against the contribution as a safety net; if it fails, the organizer denies it instead. |
| R-DEC-30 | (R-SUB-05, 2026-10-17) Several pending payments from one member and period form a stack, reviewed in order. They are numbered ("1 of 6") so they can be told apart; the review queue lists only the next of each stack, and deciding one opens the next. |
| R-DEC-31 | (R-SUB-01, R-SUB-06, R-DEC-29, 2026-10-17) **Paying ahead.** A contribution fills what's left of the open round first, then later rounds in order (paying ahead), into any remaining round (no limit, R-DEC-36). Paying ahead needs the slot's debt covered (owed − pending debt payments = 0); until then a contribution can't go past the open round. The room rule applies to each round on its own, and rounds already covered are skipped. Approved money counts toward its round when that round closes, so the member starts that round paid. The organizer pays ahead for placeholders as for other payments (R-SUB-02), each slot judged on its own. Known limit, left as is: if an open-round payment is denied or withdrawn after paying ahead, the advance stays on its round; the organizer can deny the advance instead. |
| R-DEC-32 | (R-DSP-01, R-DSP-04, R-DEC-21, 2026-10-17) A payment made ahead can be corrected (a problem report) while its round is upcoming or open; the report still expires at that round's payout. |
| R-DEC-33 | (R-SUB-05, R-DEC-30, R-DEC-31, 2026-10-17) **One payment across rounds.** A contribution bigger than what's left this round is split by R-DEC-31's order into one part per round (e.g. ₱1,000 left this round + ₱6,000 → rounds 1–4), linked as one payment. It is reviewed, approved or denied, and withdrawn as one, and counts as one in the review queue; approval re-checks every part and fails whole if one fails. Once approved, each part is its round's own contribution and can be corrected on its own (R-DEC-32). A part whose round closes before review applies to debt like any late contribution (R-DEC-04). |
| R-DEC-34 | (R-SET-06, R-DEC-12, 2026-10-19) `MAX_INTEREST_PERCENT` is **100**: shortfall interest can be at most 100% per period. Without a cap any number was accepted (e.g. 999,999.99%). Checked as you type and on the server, on create and edit. |
| R-DEC-35 | (R-OQ-01, R-SET-01, R-SET-02, R-SWP-04, R-DEC-07, R-DEC-12, 2026-10-19) `MAX_NAME_LENGTH` is **250** characters, `MAX_SLOTS` is **30**, `SWAP_REQUEST_EXPIRY_DAYS` is **7** and `RECEIPT_AUTO_CONFIRM_DAYS` is **7**. Names and slots are checked as you type and on the server, on create and edit. A swap requested from now on expires 7 days after it was asked for (swaps already pending keep no expiry, R-DEC-25). A payout handed over and not confirmed within 7 days is marked received automatically by the daily job; the payout sheet and the activity log say so. |
| R-DEC-36 | (R-DEC-31, 2026-10-19) Paying ahead has **no limit**: once the slot's debt is covered, a member can pay every remaining round ahead. `PAY_AHEAD_MAX_ROUNDS` is removed. |
