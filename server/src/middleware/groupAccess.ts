import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { getGroupOrThrow, GroupError } from "../services/groups.js";

export async function loadGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const groupId = String(req.params.id ?? req.params.groupId);
    if (!groupId || groupId === "undefined") {
      res.status(400).json({ error: "Group id required" });
      return;
    }

    if (req.user) {
      const groupWithMembership = await prisma.group.findUnique({
        where: { id: groupId },
        include: {
          memberships: {
            where: { userId: req.user.id },
            take: 1,
          },
        },
      });

      if (!groupWithMembership) {
        res.status(404).json({ error: "Group not found" });
        return;
      }

      const { memberships, ...group } = groupWithMembership;
      req.group = group;
      req.membership = memberships[0];
    } else {
      req.group = await getGroupOrThrow(groupId);
    }

    next();
  } catch (err) {
    if (err instanceof GroupError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  }
}

export function requireGroupMember(req: Request, res: Response, next: NextFunction) {
  if (!req.membership) {
    res.status(403).json({ error: "You are not a member of this group" });
    return;
  }
  next();
}

export function requireGroupManager(req: Request, res: Response, next: NextFunction) {
  if (!req.membership?.isManager) {
    res.status(403).json({ error: "Manager access required" });
    return;
  }
  next();
}

declare global {
  namespace Express {
    interface Request {
      group?: import("@prisma/client").Group;
      membership?: import("@prisma/client").Membership;
    }
  }
}
