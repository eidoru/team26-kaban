# Kaban

Kaban keeps the records for a **paluwagan**, a rotating savings group: every period each member contributes the same amount, and the whole pot goes to one slot, in a payout order the organizer sets, until every slot has had its turn. Kaban records contributions, payouts, refunds and debts, and shows the record to every member. It never holds or moves money.

It's built phone-first for Filipino users (₱, Philippine time).

## Product spec

**[`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) is the source of truth** for the paluwagan process: the user journey, lifecycle states and business rules. Every rule has an ID (`R-PAY-03`, `R-DBT-05`, ...), and the code, tests and commit messages cite those IDs. Decisions on the spec's open questions are in §16.1 (`R-DEC-*`).

## Features

- **Setup and lobby:** the organizer creates a paluwagan (contribution, frequency, start date, optional shortfall interest), fills the slots with members (reusable invite link) or placeholders (single-use claim link), sets the payout order and launches. Settings lock at launch, and the group goes active on its start date.
- **Contributions:** members report payments, with an optional proof photo. The organizer reports for placeholders and for themselves. The organizer reviews every report, including their own. Partial payments can stack.
- **Payouts:** on each payout date the period closes, the organizer covers any shortfall so the pot stays whole, and the recipient's own shortfall and debt are deducted. The organizer records the handover and the recipient confirms receipt.
- **Debts:** a covered shortfall becomes debt to the organizer, with optional simple interest per period. Members repay through the same review flow.
- **Problem reports:** a member can ask to correct or refund an approved contribution before that period's payout.
- **Swaps:** two members who haven't been paid yet can trade payout positions, with the organizer's approval.
- **Records:** a public activity (audit) log, a personal history, and PDF/CSV exports: member statement, organizer ledger and completion summary.
- **Dashboards and alerts:** a Now panel with your next step on every group page, a home dashboard across your groups, in-app notifications and daily payment reminders.
- **Live updates:** changes appear on other members' screens within seconds (Supabase Realtime, with a polling fallback).

A group moves through `LOBBY → LAUNCHED → ACTIVE → COMPLETED` (or `COMPLETED_WITH_OUTSTANDING_DEBT`). It can be `CANCELLED` from the lobby.

## Tech stack

| Layer | Tools |
|---|---|
| Client | React 19, React Router 7, TanStack Query 5, Tailwind CSS 4, Vite, lucide-react |
| Server | Node.js, Express, Zod, JWT auth (short-lived access token + rotating refresh token), bcrypt, PDFKit |
| Data | PostgreSQL on Supabase, Prisma 6 ORM |
| Realtime and files | Supabase Realtime (broadcasts, Postgres changes), Supabase Storage (payment proofs) |
| Hosting | Vercel (static client, one serverless function for the API, one daily cron job) |

## Repository layout

```
client/          React app
  src/pages/       create/ (setup wizard), join/ (invite and claim), group/ (group views and sheets)
  src/components/  flow/ (Sheet, NowPanel, TodoPanel, ActionBar, ...) and shared UI
  src/lib/         queries, realtime, formatting, UI class presets (ui.ts)
server/          Express API
  src/domain/      pure business rules (money, schedule, payouts, debts, swaps, ...), also used by the client
  src/services/    one module per area (groups, submissions, payouts, debts, disputes, swaps, exports, ...)
  src/routes/      thin HTTP routes
  assets/fonts/    fonts embedded in PDF exports
api/             Vercel serverless entry point that loads the Express app
prisma/          schema.prisma and SQL migrations
supabase/        local Supabase stack config
scripts/         local stack helpers and the API benchmark
docs/            product spec, security checklist, UAT scenarios, test traceability
```

It's an npm workspace: `client` and `server` share one `node_modules` at the root.

The client imports `server/src/domain/` through the `@domain` alias, so forms show exactly the server's validation messages. Configurable limits live in `server/src/domain/constants.ts`.

## Getting started

### Prerequisites

- Node.js 20 or newer
- Docker, for the local Supabase stack

### 1. Install

```bash
npm install          # also runs `prisma generate`
```

### 2. Start the local database

```bash
npm run db:local:start
```

This starts Supabase (Postgres, Realtime, Storage, Studio) in Docker, writes `.env.localdb` with local URLs, keys and JWT secrets, and applies the migrations. The first start downloads the images and takes a few minutes.

### 3. Run

```bash
npm run dev:local
```

This starts the client on <http://localhost:5173> and the API on <http://localhost:3001>. Vite proxies `/api` to the API, so open the client URL.

- Browse data in Studio at <http://127.0.0.1:54323>.
- `npm run db:local:migrate` applies new migrations to the local database.
- `npm run db:local:reset` wipes the local database and re-applies the migrations.
- `npm run db:local:stop` shuts the stack down.

> **Keep commands on the local stack.** `.env.localdb` overrides `.env` for the `*:local` commands. A bare `npm run dev`, `npm run db:migrate` or `npx prisma ...` reads the root `.env` instead. If that file holds the shared or production credentials, those commands run against that database.

## Environment variables

The server and the Vite client both read the root `.env`, or `.env.localdb` for the `*:local` commands. Every `.env*` file is git-ignored except `.env.production`.

**Server**

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection used by the app. On Supabase, use the transaction pooler (port 6543) with `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Yes | Postgres connection for Prisma migrations (the session pooler, port 5432) |
| `JWT_ACCESS_SECRET` | Yes | Signing secret for access tokens. Refresh tokens are opaque and stored in the database |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | No | Token lifetimes (default `15m` and `7d`) |
| `CLIENT_ORIGIN` | Production | Allowed CORS origin for the deployed client |
| `CRON_SECRET` | Production | Bearer secret Vercel Cron sends to `/api/v1/cron/daily` |
| `SUPABASE_URL` | For realtime and proofs | Supabase project URL |
| `SUPABASE_SECRET_KEY` | For realtime and proofs | Secret API key (`sb_secret_…`). Sends broadcasts and signs upload and view URLs for the private `payment-proofs` bucket |
| `SUPABASE_JWT_SIGNING_KEY` | For realtime | Private ES256 JWK imported into the project's JWT signing keys. Signs the short-lived tokens browsers use to subscribe |
| `ALLOW_DEMO_TOOLS` | No | `true` allows the demo tools on Vercel production |
| `PORT` | No | API port locally (default `3001`) |

Generate a signing key with `supabase gen signing-key` **outside** this repo: run inside it, the command overwrites the local-only `supabase/signing_keys.json`.

**Client** (read at build time)

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | For realtime and proofs | Supabase project URL and publishable key (`sb_publishable_…`) |
| `VITE_DEMO_TOOLS` | No | `true` builds in the demo tools (still off until turned on per browser) |
| `VITE_API_URL` | No | API base URL; defaults to `/api/v1` on the same origin |

Without the Supabase variables the app still works, minus proof photos: screens refresh by polling instead of updating live.

## Scripts

Run from the repo root.

| Command | What it does |
|---|---|
| `npm run dev:local` | Client and API with hot reload, against the local stack |
| `npm run db:local:start` / `stop` / `reset` / `migrate` | Manage the local Supabase stack (see [Getting started](#getting-started)) |
| `npm run dev` | Client and API against whatever the root `.env` points at |
| `npm run build` | Generate the Prisma client and build the client |
| `npm test` | Server test suite (Vitest) |
| `npm run typecheck` | Type-check server and client |
| `npm run db:migrate` / `db:deploy` / `db:studio` | Prisma against the root `.env` (see the warning above) |
| `npm run bench` | Time the main API endpoints (see [Performance](#performance)) |

- Type-check only the client with `npx tsc --noEmit -p client/tsconfig.app.json`. `tsc -p client` checks nothing.
- Lint the client with `cd client && npx eslint src`. Keep it at 0 problems.

## Realtime

- Each group page subscribes to the Supabase channel `group:<id>`. After any change, the server sends a small `group_update` broadcast, and the page refetches the group. If the channel isn't connected, the page polls every 15 seconds instead.
- Notifications come from Postgres change events on `notifications`, filtered to the signed-in user (channel `notifications:<userId>`), with a 30-second poll as the fallback.
- Row-level security is on for every table. The browser subscribes with a short-lived token from the API, signed with `SUPABASE_JWT_SIGNING_KEY`.

In development, the browser console warns when a channel fails to connect.

## Performance

Every API response carries a `Server-Timing` header (`db` = summed query time and count, `app` = everything else, `total`), shown in the browser under Network → a request → **Timing**. Requests slower than 800 ms are also logged, so they appear in Vercel's logs.

To benchmark the read endpoints against any deployment:

```bash
BENCH_URL=https://your-app.vercel.app BENCH_EMAIL=you@example.com BENCH_PASSWORD=… npm run bench
```

It logs in with that account and compares client round-trip time with server time, so the difference is network overhead. It only reads data.

## Deploying to Vercel

`vercel.json` configures everything:

- **Production** builds run `prisma generate`, **`prisma migrate deploy`** and the client build, so migrations apply on deploy. **Preview** builds skip the migration (a `VERCEL_ENV` check), so a preview never migrates whatever database its environment points at.
- `api/index.ts` serves the Express app as one function under `/api/*`. Every other path serves the client. The function bundle includes `server/assets/` (PDF fonts).
- The function runs in **`sin1` (Singapore)**, the same region as the Supabase database (`ap-southeast-1`). Keep the two in the same region: every query crosses the gap between them, and a mismatch adds tens to hundreds of milliseconds per query.
- The **public** client values (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_DEMO_TOOLS`) are committed in `.env.production` rather than set in Vercel. They're visible in the browser anyway, and Vercel won't store `VITE_` variables as sensitive. Don't add them to Vercel's Production or Preview variables: values set there override the file.
- One cron job, `GET /api/v1/cron/daily`, runs at 00:05 Manila time. In order, it activates groups whose start date has come, closes due periods (payouts, debts, expired problem reports), expires swap requests, sends reminders, and nudges recipients who haven't confirmed a payout.

Set the environment variables separately for **Preview** and **Production**.

### Demo tools

Organizers can skip ahead without waiting for the calendar: start a launched group now, or close the current round now. This lets you walk through a whole cycle in one sitting. The API also has `POST /api/v1/dev/groups/:id/send-reminders` to send today's reminders, with no button in the app.

- **Local and preview:** build with `VITE_DEMO_TOOLS=true` (local dev always has them), then turn on **Profile → Developer → Show demo tools**. This setting is saved per browser.
- **Production:** also set `ALLOW_DEMO_TOOLS=true`. Remove both variables once real users are on the app.

## Testing

```bash
npm test
```

Server tests cover the domain rules (money, schedule, setup, submissions, payouts, debts, swaps, group health), the activity log sentences, auth middleware and helpers. Tests cite the spec's rule IDs. More in `docs/`:

- [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md): process and business rules
- [`docs/UAT.md`](docs/UAT.md): user acceptance scenarios
- [`docs/TEST_TRACEABILITY.md`](docs/TEST_TRACEABILITY.md): requirements to tests
- [`docs/SECURITY.md`](docs/SECURITY.md): security checklist
