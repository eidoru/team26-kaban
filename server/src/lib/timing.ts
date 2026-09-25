import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

type RequestTiming = {
  start: number;
  dbMs: number;
  dbCount: number;
};

const store = new AsyncLocalStorage<RequestTiming>();

/** Adds one Prisma query's duration to the current request (no-op outside a request). */
export function recordDbQuery(ms: number) {
  const timing = store.getStore();
  if (!timing) return;
  timing.dbMs += ms;
  timing.dbCount += 1;
}

const SLOW_REQUEST_MS = 800;

/**
 * Emits a Server-Timing header (visible in the browser's Network → Timing tab) splitting each API
 * response into database and remaining app time, and logs slow requests for Vercel logs.
 * `db` sums query durations, so parallel queries can make it exceed `total`.
 */
export function serverTiming(req: Request, res: Response, next: NextFunction) {
  const timing: RequestTiming = { start: performance.now(), dbMs: 0, dbCount: 0 };

  const summary = () => {
    const total = performance.now() - timing.start;
    const app = Math.max(0, total - timing.dbMs);
    return { total, app };
  };

  const writeHead = res.writeHead;
  res.writeHead = function (this: Response, ...args: Parameters<typeof writeHead>) {
    if (!res.headersSent) {
      const { total, app } = summary();
      res.setHeader(
        "Server-Timing",
        [
          `db;dur=${timing.dbMs.toFixed(1)};desc="${timing.dbCount} queries"`,
          `app;dur=${app.toFixed(1)}`,
          `total;dur=${total.toFixed(1)}`,
        ].join(", "),
      );
    }
    return writeHead.apply(this, args);
  } as typeof writeHead;

  res.on("finish", () => {
    const { total } = summary();
    if (total >= SLOW_REQUEST_MS) {
      console.warn(
        `[slow] ${req.method} ${req.originalUrl.split("?")[0]} ${res.statusCode} ` +
          `total=${total.toFixed(0)}ms db=${timing.dbMs.toFixed(0)}ms/${timing.dbCount}q`,
      );
    }
  });

  store.run(timing, next);
}
