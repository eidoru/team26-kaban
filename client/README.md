# Kaban web client

The React app for Kaban. Setup, environment and deployment are in the [root README](../README.md); the paluwagan
rules are in [`docs/PRODUCT_SPEC.md`](../docs/PRODUCT_SPEC.md).

## Stack

React 19, React Router 7, TanStack Query 5, Tailwind CSS v4 and Vite, with lucide-react icons and Supabase JS for
Realtime and proof uploads.

## Running it

From the repo root, `npm run dev:local` starts this app (Vite on port 5173) with the API on port 3001. Vite proxies
`/api` to the API, and reads `.env*` files from the repo root (`envDir`).

| Command (from `client/`) | What it does |
|---|---|
| `npm run dev` | Vite dev server only |
| `npm run build` | Type-check (`tsc -b`) and build to `client/dist` |
| `npx tsc --noEmit -p tsconfig.app.json` | Type-check without building (`tsc -p .` checks nothing) |
| `npx eslint src` | Lint; keep it at 0 problems |

## Environment

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase Realtime and Storage uploads (publishable key only) |
| `VITE_DEMO_TOOLS` | Builds in the organizer demo tools (Start now, Close round now); each browser still turns them on in Profile → Developer |
| `VITE_API_URL` | Optional API base URL; defaults to `/api/v1` on the same origin |

Production values live in the committed `.env.production`. Don't set `VITE_` variables in Vercel: they would override
that file.

## Layout

```
src/
  api/client.ts        fetch wrapper, tokens and refresh
  context/             auth and dialog providers
  lib/                 query hooks (groupQueries, homeQueries), realtime, money and dates, ui.ts class presets
  components/          app shell, route guards, dialogs and shared UI
  components/flow/     Sheet, SheetDone, NowPanel, TodoPanel, ActionBar, Stepper, AmountField, ...
  pages/create/        setup wizard
  pages/join/          invite and claim tickets
  pages/group/         GroupShell, the group views and their sheets (active/, debts/, swaps/, records/, ...)
```

## Conventions

- **Shared rules:** `@domain` points at `server/src/domain`, so forms check amounts and settings with the server's
  own code and messages. Validate as the user types, with the message under the field.
- **Group data:** queries live under `["group", id, ...]`. Group actions return the fresh `GroupDetail`, and
  `useGroupActions` writes it into the cache. Realtime invalidates the group key.
- **Styling:** design tokens are in `src/index.css`, class presets in `src/lib/ui.ts`. Design for 390px first; nothing
  may sit behind the fixed bottom nav.
- **Sheets:** details and actions open in a `Sheet`; a finished action shows `SheetDone` (what happened, what comes
  next) instead of closing. The `ActionBar` portals to `<body>`, so a submit button inside it needs a `form`
  attribute.
- **Money** is integer centavos; format it with `formatPeso`.
