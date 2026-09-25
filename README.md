# Kaban

Kaban keeps the records for a **paluwagan**, a rotating savings circle: each round every member contributes the same amount, and one member takes home the pot, until everyone has had a turn. Kaban tracks who paid, whose turn it is, and what's still owed. It never holds or moves money.

## Features

- **Groups from setup to finish:** create a paluwagan, fill the roster with real members (invite link) or placeholders (claim link), set the payout order, pick a start date, and launch.
- **Rounds:** members report payments, the organizer confirms or records them, and a personalized banner shows whose turn it is and what you still owe.
- **Shortfalls:** unpaid balances become obligations (with optional interest), settled by the organizer or reported by the member for review. Payments can be disputed.
- **Records:** ledger by round, payout schedule timeline, audit log with filters, and a "your money over the cycle" chart.
- **Live updates:** changes appear on other members' screens within seconds (Supabase Realtime, with a polling fallback).
- **Home and alerts:** dashboard of your groups and what needs action, notifications, and an "Owed to you" overview for organizers.

## Tech stack

| Layer | Tools |
|---|---|
| Client | React 19, React Router 7, TanStack Query 5, Tailwind CSS 4, Vite, lucide-react |
| Server | Node.js, Express, Zod, JWT auth (access + rotating refresh tokens), bcrypt |
| Data | PostgreSQL on Supabase, Prisma ORM |
| Realtime | Supabase Realtime (broadcasts + Postgres changes) |
| Hosting | Vercel (static client + one serverless function for the API, plus cron jobs) |

## Repository layout

```
client/     React app (pages/, components/, lib/, api/client.ts)
server/     Express API (routes/, services/, middleware/, lib/) and tests
api/        Vercel serverless entry point that loads the Express app
prisma/     schema.prisma and SQL migrations
docs/       Security checklist, UAT scenarios, test traceability
```

It's an npm workspace: `client` and `server` share one `node_modules` at the root.

## Getting started

### Prerequisites

- Node.js 20 or newer
- A PostgreSQL database. A [Supabase](https://supabase.com) project is recommended, since Realtime depends on it.

### 1. Install

```bash
npm install          # also runs `prisma generate`
```

### 2. Configure environment

Create a `.env` file at the **repo root**. Both the server and the Vite client read it. See [Environment variables](#environment-variables) for the full list; the minimum for local development is:

```bash
DATABASE_URL="postgresql://…"      # pooled connection
DIRECT_URL="postgresql://…"        # direct connection, used by migrations
JWT_ACCESS_SECRET="…"              # long random string
JWT_REFRESH_SECRET="…"             # a different long random string
```

### 3. Set up the database

```bash
npm run db:migrate   # applies migrations to your dev database
```

### 4. Run

```bash
npm run dev
```

This starts the client on <http://localhost:5173> and the API on <http://localhost:3001>. Vite proxies `/api` to the API, so open the client URL.

## Environment variables

**Server**

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection used by the app (pooled) |
| `DIRECT_URL` | Yes | Direct Postgres connection used by Prisma migrations |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Yes | Signing secrets for access and refresh tokens |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | No | Token lifetimes (access defaults to 15m) |
| `CLIENT_ORIGIN` | Production | Allowed CORS origin for the deployed client |
| `CRON_SECRET` | Production | Bearer secret Vercel Cron sends to `/api/v1/cron/*` |
| `SUPABASE_URL` | For realtime | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | For realtime | Used to send broadcasts to group channels |
| `SUPABASE_JWT_SECRET` | For realtime | Signs the short-lived token browsers use to subscribe |
| `ALLOW_DEMO_TOOLS` | No | `true` allows the demo "Advance round" on Vercel production |
| `PORT` | No | API port locally (default `3001`) |

**Client** (read at build time)

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | For realtime | Supabase project URL and anon key |
| `VITE_DEMO_TOOLS` | No | `true` builds in the demo tools (still off until enabled per browser) |
| `VITE_API_URL` | No | API base URL; defaults to `/api/v1` on the same origin |

Without the Supabase variables, the app still works: screens refresh by polling instead of updating live.

## Scripts

Run from the repo root.

| Command | What it does |
|---|---|
| `npm run dev` | Client and API with hot reload |
| `npm run build` | Generate the Prisma client and build the client |
| `npm test` | Server test suite (Vitest) |
| `npm run typecheck` | Type-check server and client |
| `npm run db:migrate` | Create/apply migrations in development |
| `npm run db:deploy` | Apply existing migrations (production and CI) |
| `npm run db:studio` | Open Prisma Studio |

Lint the client with `cd client && npx eslint src`.

## Realtime

Each group page subscribes to a Supabase channel named `group:<id>`:

- The server sends a small broadcast after any change (payments, rounds, roster, issues), and the page refetches what it needs.
- Postgres change events on `memberships`, `rounds` and `contributions` act as a second signal. Row-level security policies limit them to members of the group.
- If the channel isn't connected, the page polls every 15 seconds instead.

In development, the browser console warns when a channel fails to connect.

## Deploying to Vercel

`vercel.json` configures everything:

- The build runs `prisma generate`, **`prisma migrate deploy`** and the client build, so migrations apply on every deploy.
- `api/index.ts` serves the Express app as one function under `/api/*`. Every other path serves the client.
- Cron jobs close due rounds, open the next ones, and send reminders daily.

Set the environment variables separately for **Preview** and **Production**. Use a separate database for Preview if you don't want preview deploys running migrations against production data.

### Demo tools

Organizers can close a round early ("Advance round") to walk through a whole cycle without waiting for due dates.

- **Local and preview:** build with `VITE_DEMO_TOOLS=true`, then turn on **Profile → Developer → Show demo tools**. This setting is saved per browser.
- **Production:** also set `ALLOW_DEMO_TOOLS=true`. Remove both variables once real users are on the app.

## Testing

```bash
npm test
```

Server tests cover payment, obligation, interest and schedule rules, API smoke tests, and helpers. More in `docs/`:

- [`docs/UAT.md`](docs/UAT.md): user acceptance scenarios
- [`docs/TEST_TRACEABILITY.md`](docs/TEST_TRACEABILITY.md): requirements to tests
- [`docs/SECURITY.md`](docs/SECURITY.md): security checklist
