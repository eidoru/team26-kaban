import { Router } from "express";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  generateOpaqueToken,
  getRefreshTokenExpiry,
  signAccessToken,
} from "../lib/jwt.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { getUserActivityStats } from "../services/userActivity.js";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(100),
  contact: z.string().max(200).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  contact: z.string().max(200).nullable().optional(),
});

const changeEmailSchema = z.object({
  currentPassword: z.string().min(1),
  newEmail: z.string().email(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

async function verifyCurrentPassword(userId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user : null;
}

function authResponse(user: { id: string; email: string; displayName: string; contact: string | null }, refreshToken: string) {
  const payload = { sub: user.id, email: user.email };
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      contact: user.contact,
    },
    accessToken: signAccessToken(payload),
    refreshToken,
  };
}

router.post("/register", authLimiter, validateBody(registerSchema), async (req, res, next) => {
  try {
    const { email, password, displayName, contact } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const refreshToken = generateOpaqueToken();

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName,
        contact: contact?.trim() || null,
        refreshTokens: {
          create: {
            token: refreshToken,
            expiresAt: getRefreshTokenExpiry(),
          },
        },
      },
    });

    res.status(201).json(
      authResponse(user, refreshToken),
    );
  } catch (err) {
    next(err);
  }
});

router.post("/login", authLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const refreshToken = generateOpaqueToken();
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: getRefreshTokenExpiry(),
      },
    });

    res.json(authResponse(user, refreshToken));
  } catch (err) {
    next(err);
  }
});

router.post("/refresh", authLimiter, validateBody(refreshSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }

    const newRefreshToken = generateOpaqueToken();
    await prisma.$transaction([
      prisma.refreshToken.delete({ where: { id: stored.id } }),
      prisma.refreshToken.create({
        data: {
          token: newRefreshToken,
          userId: stored.userId,
          expiresAt: getRefreshTokenExpiry(),
        },
      }),
    ]);

    res.json(authResponse(stored.user, newRefreshToken));
  } catch (err) {
    next(err);
  }
});

router.post("/logout", requireAuth, validateBody(refreshSchema), async (req, res, next) => {
  try {
    await prisma.refreshToken.deleteMany({
      where: { token: req.body.refreshToken, userId: req.user!.id },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, displayName: true, contact: true, createdAt: true },
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.get("/me/activity", requireAuth, async (req, res, next) => {
  try {
    const activity = await getUserActivityStats(req.user!.id);
    res.json({ activity });
  } catch (err) {
    next(err);
  }
});

router.patch("/me", requireAuth, validateBody(updateProfileSchema), async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: req.body,
      select: { id: true, email: true, displayName: true, contact: true },
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.patch(
  "/me/email",
  requireAuth,
  authLimiter,
  validateBody(changeEmailSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const { currentPassword, newEmail } = req.body;

      const user = await verifyCurrentPassword(userId, currentPassword);
      if (!user) {
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }

      const normalizedEmail = newEmail.trim().toLowerCase();
      if (normalizedEmail === user.email.toLowerCase()) {
        res.status(400).json({ error: "New email must be different from your current email" });
        return;
      }

      const taken = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (taken) {
        res.status(409).json({ error: "Email already registered" });
        return;
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { email: normalizedEmail },
        select: { id: true, email: true, displayName: true, contact: true },
      });

      const accessToken = signAccessToken({ sub: updated.id, email: updated.email });
      res.json({ user: updated, accessToken });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/me/password",
  requireAuth,
  authLimiter,
  validateBody(changePasswordSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const { currentPassword, newPassword } = req.body;

      const user = await verifyCurrentPassword(userId, currentPassword);
      if (!user) {
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }

      const samePassword = await bcrypt.compare(newPassword, user.passwordHash);
      if (samePassword) {
        res.status(400).json({ error: "New password must be different from your current password" });
        return;
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      const refreshToken = generateOpaqueToken();

      const updated = await prisma.$transaction(async (tx) => {
        await tx.refreshToken.deleteMany({ where: { userId } });
        await tx.user.update({
          where: { id: userId },
          data: { passwordHash },
        });
        await tx.refreshToken.create({
          data: {
            token: refreshToken,
            userId,
            expiresAt: getRefreshTokenExpiry(),
          },
        });
        return tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { id: true, email: true, displayName: true, contact: true },
        });
      });

      res.json(authResponse(updated, refreshToken));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
