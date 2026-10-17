# Security Checklist

Checked against the codebase after the process rewrite (October 2026).

| Control | Status | Notes |
|---------|--------|-------|
| HTTPS in production | ✅ | Vercel default TLS |
| Password hashing | ✅ | bcrypt, cost 12 (`routes/auth.ts`) |
| JWT access expiry | ✅ | `JWT_ACCESS_EXPIRES_IN`, default 15m |
| Refresh token rotation | ✅ | Opaque tokens stored in the database. A refresh deletes the old token in a transaction, so a reused token gets 401 |
| Auth rate limiting | ✅ | 30 requests / 15 min on register, login and refresh. `trust proxy` is 1, so the limit keys on the real client IP behind Vercel |
| CORS restricted | ✅ | `CLIENT_ORIGIN` in production (`lib/origin.ts`) |
| Helmet headers | ✅ | `app.ts` |
| Input validation | ✅ | Zod on every request body; setup and payment rules come from the shared domain code |
| Group access | ✅ | `loadGroup` returns 404 to anyone without a slot in the group, so group ids don't leak. `requireOrganizer` returns 403 to members |
| Cron secret | ✅ | `requireCronSecret` on `/api/v1/cron/*`: 403 with a wrong or missing secret, 503 if `CRON_SECRET` isn't set |
| Demo tools gated | ⚠️ | `/api/v1/dev/*` returns 404 in production unless `ALLOW_DEMO_TOOLS=true`, and is organizer-only. **Currently on in production**: turn off `ALLOW_DEMO_TOOLS` and `VITE_DEMO_TOOLS` before real users |
| Invite and claim links | ✅ | Random tokens. Invite links are reusable until revoked; claim links work once and can be revoked. Neither expires with time |
| Row-level security | ✅ | RLS on every table with no policies, so the Supabase API roles can't read anything. The server connects as the owner. The one policy lets a user stream their own `notifications` rows |
| Audit log append-only | ✅ | Database trigger rejects `UPDATE` and `DELETE` on `audit_entries` (R-AUD-02) |
| Payment proof photos | ✅ | Private `payment-proofs` bucket, 5 MB images only. Uploads and views use short-lived signed URLs from the server (R-DEC-08). A proof path must sit under the group's folder and exist before it's saved. Photos are shown only to the submitter's slot and the organizer (R-DEC-17) |
| Realtime | ✅ | Browsers subscribe with a 1-hour token signed by the server (`SUPABASE_JWT_SIGNING_KEY`). Group broadcasts carry no data, only "refetch"; the refetch goes through the API's access checks |
| Supabase keys | ✅ | New API keys only. The secret key stays on the server; the browser has only the publishable key |
| No payment processor | ✅ | Out of scope: Kaban records payments, it never moves money |
| RA 10173 privacy notice | ❌ | The Register page no longer shows a privacy notice. Add one before real users |

## Data minimization (RA 10173)

- Stored personal data: email, display name, optional contact, and payment proof photos the user chooses to attach.
- No national IDs, bank accounts or payment credentials. Proof screenshots can show account details, which is why they're limited to the submitter and the organizer (R-DEC-17).
- Users can update their profile with `PATCH /api/v1/auth/me`.
- Amounts, statuses and debts are visible to every member of the paluwagan (R-DEC-06), and the audit log is public to its members (R-AUD-03).

## Before real users

1. Set strong `JWT_ACCESS_SECRET` and `CRON_SECRET` values in Vercel production.
2. Confirm `CLIENT_ORIGIN` matches the deployed client URL.
3. Remove `ALLOW_DEMO_TOOLS` (Vercel) and `VITE_DEMO_TOOLS` (`.env.production`).
4. Add the privacy notice to registration.
5. Run `npm test` and the scenarios in [UAT.md](./UAT.md).
