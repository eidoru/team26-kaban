import type { Request } from "express";

function normalizeOrigin(value: string): string {
  return value.replace(/\/$/, "");
}

function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

/** CLIENT_ORIGIN is for local dev / explicit production domain — never localhost on Vercel. */
function configuredClientOrigin(): string | null {
  const raw = process.env.CLIENT_ORIGIN?.trim();
  if (!raw) return null;

  const origin = normalizeOrigin(raw);
  if (isLocalOrigin(origin) && isProductionRuntime()) {
    return null;
  }

  return origin;
}

/** Map API port → Vite dev port when invite links would otherwise hit Express. */
function normalizeLocalDevOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    const apiPort = process.env.PORT ?? "3001";
    const clientPort = process.env.CLIENT_DEV_PORT ?? "5173";
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";

    if (isLocal && url.port === apiPort) {
      url.port = clientPort;
      return normalizeOrigin(url.origin);
    }
  } catch {
    // ignore invalid URLs
  }
  return normalizeOrigin(origin);
}

function originFromRequest(req: Request): string | null {
  const host =
    req.get("x-forwarded-host") ??
    req.get("x-vercel-forwarded-host") ??
    req.get("host");
  if (!host) return null;

  const proto =
    req.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return normalizeLocalDevOrigin(`${proto}://${host.split(",")[0].trim()}`);
}

function vercelDeploymentOrigin(): string | null {
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionUrl) {
    const host = productionUrl.replace(/^https?:\/\//, "");
    return `https://${host}`;
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    const host = vercelUrl.replace(/^https?:\/\//, "");
    return `https://${host}`;
  }

  return null;
}

/** Public app URL for invite links and notifications. */
export function resolveAppOrigin(req?: Request): string {
  const clientOrigin = configuredClientOrigin();
  if (clientOrigin) return clientOrigin;

  if (req) {
    const fromRequest = originFromRequest(req);
    if (fromRequest && !(isProductionRuntime() && isLocalOrigin(fromRequest))) {
      return fromRequest;
    }
  }

  const fromVercel = vercelDeploymentOrigin();
  if (fromVercel) return fromVercel;

  return "http://localhost:5173";
}
