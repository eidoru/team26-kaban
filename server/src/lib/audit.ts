import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export async function writeAuditLog(params: {
  groupId?: string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      groupId: params.groupId,
      actorId: params.actorId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function createNotification(params: {
  userId: string;
  groupId?: string;
  type:
    | "member_left"
    | "chair_claimed"
    | "contribution_confirmed"
    | "contribution_due"
    | "turn_to_receive"
    | "dispute_raised"
    | "dispute_resolved"
    | "general";
  title: string;
  body: string;
  link?: string;
}) {
  await prisma.notification.create({ data: params });
}
