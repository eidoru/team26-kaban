# Security Checklist (Sprint 6)

Verified against the Kaban MVP codebase.

| Control | Status | Notes |
|---------|--------|-------|
| HTTPS in production | ✅ | Vercel default TLS |
| Password hashing (bcrypt ≥ 10) | ✅ | Cost factor 12 in `auth.ts` |
| JWT access expiry | ✅ | `JWT_ACCESS_EXPIRES_IN` default 15m |
| Refresh token rotation | ✅ | Opaque tokens in DB, refresh endpoint |
| CORS restricted | ✅ | `CLIENT_ORIGIN` in production |
| Helmet headers | ✅ | `app.ts` |
| Auth rate limiting | ✅ | 30 req / 15 min on auth routes |
| Cron secret | ✅ | `requireCronSecret` on all cron routes |
| Group membership scoping | ✅ | `loadGroup` + `requireGroupMember` middleware |
| Invite token expiry | ✅ | 30-day TTL, revocable |
| No payment processor | ✅ | Out of scope — manual tracking only |
| Audit log append-only | ✅ | No delete/update routes |
| Disputes non-destructive | ✅ | Flags contributions; no deletion |
| RA 10173 privacy notice | ✅ | Register page disclosure |
| Cron run logging | ✅ | `cron.*` audit log entries |
| Dev routes gated | ✅ | `/api/v1/dev/*` disabled in production |
| Cron force-advance gated | ✅ | `POST /api/v1/cron/groups/:id/advance-round` requires `CRON_SECRET`; disabled on Vercel production |

## Data minimization (RA 10173)

- Stored PII: email, display name, optional contact
- No national IDs, bank accounts, or payment credentials
- Users can update profile via `PATCH /auth/me`
- Group data visible only to members; manager-only routes enforced server-side

## Pre-UAT actions

1. Set strong `JWT_*` and `CRON_SECRET` in Vercel production env
2. Confirm `CLIENT_ORIGIN` matches deployed frontend URL
3. Confirm Supabase RLS denies direct client access (Express-only path)
4. Run `npm test` and manual UAT scenarios in [UAT.md](./UAT.md)
