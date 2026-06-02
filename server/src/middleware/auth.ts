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

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const payload = verifyAccessToken(header.slice(7));
    const cached = getCachedUser(payload.sub);
    if (cached) {
      req.user = cached;
      next();
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, displayName: true },
    });

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    req.user = user;
    setCachedUser(user);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
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

/** @deprecated Use requireNonProductionDeploy */
export const requireCronTesting = requireNonProductionDeploy;
