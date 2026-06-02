import type { VercelRequest, VercelResponse } from "@vercel/node";

type ExpressHandler = (req: VercelRequest, res: VercelResponse) => unknown;

let app: ExpressHandler | null = null;

async function loadApp(): Promise<ExpressHandler> {
  if (!app) {
    // Dynamic import: Vercel compiles /api to CommonJS; server/ is ESM ("type": "module").
    await import("../server/src/lib/env.js");
    const mod = await import("../server/src/app.js");
    app = mod.default as ExpressHandler;
  }
  return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const expressApp = await loadApp();
  return expressApp(req, res);
}
