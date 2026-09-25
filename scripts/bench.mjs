// Read-only API latency benchmark.
//   BENCH_URL=https://team26-kaban.vercel.app BENCH_EMAIL=… BENCH_PASSWORD=… node scripts/bench.mjs
// BENCH_URL defaults to the local API (http://localhost:3001); BENCH_RUNS defaults to 10.
// Reports client round-trip time (what users feel) next to the server's own Server-Timing split.

const BASE = (process.env.BENCH_URL ?? "http://localhost:3001").replace(/\/$/, "");
const RUNS = Number(process.env.BENCH_RUNS ?? 10);
const { BENCH_EMAIL: email, BENCH_PASSWORD: password } = process.env;

if (!email || !password) {
  console.error("Set BENCH_EMAIL and BENCH_PASSWORD (an account that belongs to at least one group).");
  process.exit(1);
}

function parseServerTiming(header) {
  const parts = {};
  for (const item of (header ?? "").split(",")) {
    const [name, ...params] = item.trim().split(";");
    if (!name) continue;
    const dur = params.find((p) => p.startsWith("dur="));
    const desc = params.find((p) => p.startsWith("desc="));
    parts[name] = { dur: dur ? Number(dur.slice(4)) : 0, desc: desc?.slice(5).replaceAll('"', "") };
  }
  return parts;
}

async function call(path, init = {}) {
  const started = performance.now();
  const res = await fetch(`${BASE}/api/v1${path}`, init);
  const body = await res.json().catch(() => null);
  const client = performance.now() - started;
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${JSON.stringify(body)}`);
  return { body, client, timing: parseServerTiming(res.headers.get("server-timing")) };
}

const pct = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const ms = (v) => (v == null ? "—" : `${Math.round(v)}`.padStart(5));

const login = await call("/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const auth = { headers: { Authorization: `Bearer ${login.body.accessToken}` } };

const { body: groupList } = await call("/groups", auth);
const group =
  groupList.groups.find((g) => g.status === "active") ??
  groupList.groups.find((g) => g.status === "forming") ??
  groupList.groups[0];

const endpoints = [
  ["health (no DB)", "/health"],
  ["home overview", "/home/overview"],
  ["notifications", "/notifications"],
  ["groups list", "/groups"],
];
if (group) {
  endpoints.push([`group detail (${group.status})`, `/groups/${group.id}`]);
  if (group.status !== "forming") {
    endpoints.push(["current round", `/groups/${group.id}/rounds/current`]);
    endpoints.push(["ledger", `/groups/${group.id}/ledger`]);
  }
}

console.log(`\n${BASE} · ${RUNS} runs each (after 1 warm-up) · times in ms\n`);
console.log("endpoint                      client p50   p95 │ server p50    db  queries  app");
console.log("─".repeat(84));
for (const [label, path] of endpoints) {
  await call(path, auth); // warm-up (absorbs a cold start)
  const client = [];
  const server = [];
  const db = [];
  const app = [];
  let queries = "";
  for (let i = 0; i < RUNS; i++) {
    const r = await call(path, auth);
    client.push(r.client);
    if (r.timing.total) server.push(r.timing.total.dur);
    if (r.timing.db) db.push(r.timing.db.dur);
    if (r.timing.app) app.push(r.timing.app.dur);
    queries = r.timing.db?.desc?.split(" ")[0] ?? "";
  }
  console.log(
    `${label.padEnd(28)} ${ms(pct(client, 50))} ${ms(pct(client, 95))} │ ` +
      `${ms(server.length ? pct(server, 50) : null)} ${ms(db.length ? pct(db, 50) : null)} ` +
      `${String(queries).padStart(7)} ${ms(app.length ? pct(app, 50) : null)}`,
  );
}
console.log("\nclient − server ≈ network + Vercel routing. db sums query time (parallel queries can exceed total).");
