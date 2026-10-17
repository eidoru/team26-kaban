import { NextFunction, Request, Response } from "express";
import type { Group, Slot } from "@prisma/client";
import { forbidden, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

declare global {
  namespace Express {
    interface Request {
      group?: Group;
      /** The signed-in user's slot in `group`, if they hold one. */
      slot?: Slot;
    }
  }
}

/** Loads `:id` and the viewer's slot. Members only: anyone else gets a 404, so ids don't leak. */
export async function loadGroup(req: Request, _res: Response, next: NextFunction) {
  try {
    const group = await prisma.group.findUnique({
      where: { id: String(req.params.id) },
      include: { slots: { where: { userId: req.user!.id }, take: 1 } },
    });
    if (!group || group.slots.length === 0) throw notFound("Paluwagan");
    const { slots, ...rest } = group;
    req.group = rest;
    req.slot = slots[0];
    next();
  } catch (err) {
    next(err);
  }
}

export function requireOrganizer(req: Request, _res: Response, next: NextFunction) {
  next(req.slot?.isOrganizer ? undefined : forbidden("Only the organizer can do that."));
}
