# Kaban

Kaban is a record-keeper for paluwagan, the rotating savings groups common in the Philippines. Each period every
member puts in the same amount and one slot takes the whole pot, in an order the organizer sets, until everyone has
had a turn. Kaban tracks who has paid, who gets paid next, and who owes what, and every member can see the same
record. It doesn't hold or move any money.

The app is designed for phones first, with amounts in pesos and dates in Philippine time.

## What it does

- Organizers set up a group (contribution amount, frequency, start date, optional interest on shortfalls), invite
  members or add placeholders for people without an account, set the payout order and launch.
- Members report their payments, optionally with a photo of the receipt, and the organizer approves them. Partial
  payments add up, and members with no debt can pay ahead for later rounds.
- On each payout date the round closes. If someone came up short, the organizer covers the gap so the recipient still
  gets the full pot, and the shortfall becomes a debt to the organizer. The recipient confirms when they've received
  the money.
- Members can report a problem with an approved payment before that round's payout, and two members who haven't
  been paid yet can ask to swap positions.
- There's an activity log of every change, a personal payment history, and PDF/CSV exports (member statement,
  organizer ledger, completion summary).
- Members get in-app notifications and daily reminders, and group pages update live while open.

A group goes from `LOBBY` to `LAUNCHED` to `ACTIVE` to `COMPLETED` (or `COMPLETED_WITH_OUTSTANDING_DEBT`), and can be
cancelled while still in the lobby. The full process and its rules are written up in
[docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md).

## Stack

- Client: React 19, React Router 7, TanStack Query 5, Tailwind CSS 4, Vite
- Server: Express, Zod, Prisma 6, JWT auth, PDFKit
- Supabase for Postgres, Realtime and Storage (payment proof photos)
- Hosted on Vercel: static client, one serverless function for the API, one daily cron job

## Project layout

```
client/      React app (pages/, components/, lib/)
server/      Express API
  src/domain/    business rules with no I/O, shared with the client
  src/services/  one module per feature area
  src/routes/    HTTP routes
api/         Vercel function entry point
prisma/      schema and migrations
supabase/    local Supabase config
scripts/     local database helpers and the API benchmark
docs/        product spec, UAT scenarios, test traceability, security checklist
```

The repo is an npm workspace with `client` and `server` sharing the root `node_modules`. The client imports
`server/src/domain/` through the `@domain` alias so both sides validate input the same way.

## Running locally

You'll need Node.js 20+ and Docker.

```bash
npm install
npm run db:local:start   # starts Supabase in Docker, writes .env.localdb, runs migrations
npm run dev:local        # client on :5173, API on :3001
```

Open <http://localhost:5173>; Vite proxies `/api` to the API. The first `db:local:start` pulls the Docker images and
takes a few minutes. Supabase Studio runs at <http://127.0.0.1:54323>.

Other local database commands:

```bash
npm run db:local:migrate   # apply new migrations
npm run db:local:reset     # wipe data and re-run migrations
npm run db:local:stop      # stop the stack
```

Note that only the `*:local` commands use `.env.localdb`. Plain `npm run dev`, `npm run db:migrate` and `npx prisma`
read the root `.env`, so check what that file points at before running them.

## Environment variables

Both the server and the client read the root `.env` (or `.env.localdb` for the local commands). All `.env*` files are
git-ignored except `.env.production`, which holds the public client values.

Server:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Required. On Supabase, the transaction pooler (port 6543) with `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Required. Session pooler (port 5432), used by migrations |
| `JWT_ACCESS_SECRET` | Required. Signs access tokens |
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | Optional, default `15m` and `7d` |
| `CLIENT_ORIGIN` | Allowed CORS origin in production |
| `CRON_SECRET` | Secret Vercel Cron sends to `/api/v1/cron/daily` |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Realtime broadcasts and signed URLs for the `payment-proofs` bucket |
| `SUPABASE_JWT_SIGNING_KEY` | Private ES256 JWK used to sign Realtime tokens for the browser |
| `ALLOW_DEMO_TOOLS` | Set to `true` to allow the demo tools in production |
| `PORT` | API port, default `3001` |

Client (read at build time):

| Variable | Notes |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Realtime and proof photos |
| `VITE_DEMO_TOOLS` | Set to `true` to include the demo tools |
| `VITE_API_URL` | Defaults to `/api/v1` |

Without the Supabase variables the app still runs, but there are no proof photos and pages poll for changes instead
of updating live.

If you generate a signing key with `supabase gen signing-key`, run it outside the repo. Inside it, the command
overwrites `supabase/signing_keys.json`, the key the local stack uses.

## Scripts

| Command | |
|---|---|
| `npm run dev:local` | Client and API against the local stack |
| `npm run dev` | Client and API against the root `.env` |
| `npm run build` | Generate the Prisma client and build the client |
| `npm test` | Server tests (Vitest) |
| `npm run typecheck` | Type-check server and client |
| `npm run db:migrate`, `db:deploy`, `db:studio` | Prisma against the root `.env` |
| `npm run bench` | API latency benchmark |

Lint the client with `cd client && npx eslint src`.

## Realtime

Each group page subscribes to a Supabase channel (`group:<id>`). When something changes, the server broadcasts a
small update and the page refetches. Notifications use Postgres change events on the `notifications` table. If a
channel can't connect, pages fall back to polling (15 seconds for groups, 30 for notifications).

All tables have row-level security enabled. The browser subscribes using a short-lived token from the API.

## Deployment

Everything is in `vercel.json`:

- Production builds run `prisma migrate deploy` before building the client. Preview builds skip migrations.
- `api/index.ts` serves the Express app under `/api/*`; all other paths serve the client.
- The function runs in `sin1` (Singapore), the same region as the Supabase database. Keep them together, since every
  query crosses between the two.
- A cron job hits `/api/v1/cron/daily` at 00:05 Manila time. It activates groups that have reached their start date,
  closes due rounds, expires old swap requests, and sends reminders.

The public `VITE_` values are committed in `.env.production` instead of being set in Vercel. Values set in Vercel
would override the file, so don't add them there.

### Demo tools

For demos and testing, organizers can start a launched group right away or close the current round early instead of
waiting for the calendar. There's also `POST /api/v1/dev/groups/:id/send-reminders`, which has no button.

Build with `VITE_DEMO_TOOLS=true` (always on in local dev), then enable them in Profile → Developer. In production
`ALLOW_DEMO_TOOLS=true` is also needed. Turn both off before real users are on the app.

### Performance

API responses include a `Server-Timing` header that splits database time from the rest, and requests over 800 ms are
logged. To measure a deployment:

```bash
BENCH_URL=https://your-app.vercel.app BENCH_EMAIL=you@example.com BENCH_PASSWORD=... npm run bench
```

The benchmark logs in and only calls read endpoints.

## Testing

`npm test` runs the server tests, which cover the domain rules, the activity log and the auth code. See also:

- [docs/UAT.md](docs/UAT.md): acceptance scenarios
- [docs/TEST_TRACEABILITY.md](docs/TEST_TRACEABILITY.md): which tests cover which requirements
- [docs/SECURITY.md](docs/SECURITY.md): security checklist
