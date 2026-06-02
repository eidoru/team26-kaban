# Kaban UAT Scripts

Manual acceptance tests for evaluators. Run locally with `npm run dev` unless testing production deploy.

## Prerequisites

- Two browser profiles (or incognito): **Manager** and **Member**
- `.env` with valid `DATABASE_URL`, JWT secrets, and `CRON_SECRET`

## Scenario A — Full cycle (happy path)

| Step | Actor | Action | Pass criteria |
|------|-------|--------|---------------|
| A1 | Manager | Register, create 3-slot weekly group, set start date | Group appears on Home as Forming |
| A2 | Manager | Add placeholders or invite members until full | `openSlots = 0` |
| A3 | Manager | Set payout order (random or manual), Activate | Status Active, Round 1 open, schedule visible |
| A4 | Member | Report paid (full amount) | Status Reported |
| A5 | Manager | Confirm payment | Status Confirmed, member notification |
| A6 | Manager | All members confirmed | Dashboard shows 3/3 confirmed |
| A7 | Dev | Advance round (dev JWT or cron secret on preview) | Round 2 opens, Round 1 closed |
| A8 | All | Repeat contributions until final round | — |
| A9 | Dev | Advance final round | Group status Completed, completion summary visible |

**Advance round — local dev (manager JWT):**

```powershell
# After login, use manager access token from browser localStorage (kaban_auth)
Invoke-RestMethod -Method POST -Uri "http://localhost:3001/api/v1/dev/groups/GROUP_ID/advance-round" `
  -Headers @{ Authorization = "Bearer ACCESS_TOKEN" }
```

**Advance round — Vercel preview / local (cron secret):**

```powershell
# Not available on Vercel production (returns 404). Works on preview deploys and local npm run dev.
$baseUrl = "https://YOUR-PREVIEW-URL.vercel.app"   # or http://localhost:5173 when using Vite proxy
$cronSecret = "YOUR_CRON_SECRET"

Invoke-RestMethod -Method POST -Uri "$baseUrl/api/v1/cron/groups/GROUP_ID/advance-round" `
  -Headers @{ Authorization = "Bearer $cronSecret" }
```

Response includes `closedRound`, `openedRound` (null when the cycle finished), and `completed`.

Alternative without force-advance: backdate the current round's `due_date` in Supabase, then call `GET /api/v1/cron/close-rounds`.

## Scenario B — Partial pay and shortfall

| Step | Actor | Action | Pass criteria |
|------|-------|--------|---------------|
| B1 | Member | Report paid with partial amount (e.g. 50% of expected) | Shows `paid / expected (partial)` |
| B2 | Manager | Confirm partial payment | Confirmed with partial badge |
| B3 | Dev | Advance round or run close-rounds cron | Obligation created for shortfall |
| B4 | Manager | Settle debt (FIFO) or Cover externally | Obligation settled, audit log entry |
| B5 | All | Open Shared ledger | Partial and obligation events reflected |

## Scenario C — Disputes and notifications

| Step | Actor | Action | Pass criteria |
|------|-------|--------|---------------|
| C1 | Member | Raise dispute on reported/confirmed contribution | Dispute appears as Open |
| C2 | Manager | Check Notifications bell | Unread dispute notification |
| C3 | Manager | Resolve dispute with note | Status Resolved, parties notified |
| C4 | Manager | Open Manager dashboard | Open disputes count updates |

## Scenario D — Access control

| Step | Action | Pass criteria |
|------|--------|---------------|
| D1 | GET `/api/v1/groups` without token | 401 Unauthorized |
| D2 | Member accesses another group's ID | 403 Forbidden |
| D3 | GET `/api/v1/cron/close-rounds` without secret | 403 Forbidden |
| D4 | Non-manager calls confirm contribution | 403 Forbidden |

## Performance spot-checks (NFR)

| Check | Target | How to verify |
|-------|--------|---------------|
| Ledger load | ≤ 3 s | Open group with 6+ rounds; Network tab for `/ledger` |
| Group page | ≤ 2 s | Hard refresh active group lobby |
| Auth | Access token expires ~15 min | JWT `exp` claim in decoded token |

## Automated tests

```bash
npm test          # Vitest unit + API smoke tests
npm run typecheck # TypeScript build both workspaces
```

See [TEST_TRACEABILITY.md](./TEST_TRACEABILITY.md) for SRS mapping.
