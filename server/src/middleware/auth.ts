import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const USER_CACHE_TTL_MS = 30_000;
const userCache = new Map<string, { user: AuthUser; expiresAt: number }>();

function getCachedUser(userId: string): AuthUser | null {
  const entry = userCache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    userCache.delete(userId);
    return null;
  }
  return entry.user;
}

function setCachedUser(user: AuthUser) {
  userCache.set(user.id, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
}

/** Verifies a bearer access token and loads its user; throws on an invalid token, null if the user is gone. */
async function userFromBearer(token: string): Promise<AuthUser | null> {
  const payload = verifyAccessToken(token);
  const cached = getCachedUser(payload.sub);
  if (cached) return cached;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, displayName: true },
  });
  if (user) setCachedUser(user);
  return user;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const user = await userFromBearer(header.slice(7));
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** For public routes that personalize when signed in: sets req.user if the token is valid, never rejects. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      req.user = (await userFromBearer(header.slice(7))) ?? undefined;
    } catch {
      // Expired or invalid token: treat as a guest.
    }
  }
  next();
}

export function requireCronSecret(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    res.status(503).json({ error: "Cron not configured" });
    return;
  }

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${secret}`) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  next();
}

/** UAT/demo tools are unavailable on Vercel production deploys. */
export function requireNonProductionDeploy(_req: Request, res: Response, next: NextFunction) {
  if (process.env.VERCEL_ENV === "production") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  next();
}

/**
 * Organizer demo tools (advance round). Off on Vercel production unless ALLOW_DEMO_TOOLS=true
 * opts in; only for the authenticated manager routes, never the unauthenticated testing endpoints.
 */
export function requireDemoTools(_req: Request, res: Response, next: NextFunction) {
  if (process.env.VERCEL_ENV === "production" && process.env.ALLOW_DEMO_TOOLS !== "true") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  next();
}

/** @deprecated Use requireNonProductionDeploy */
export const requireCronTesting = requireNonProductionDeploy;
