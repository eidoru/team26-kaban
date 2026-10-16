import { Prisma } from "@prisma/client";
import { notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

type Db = Prisma.TransactionClient;

/** §12 events. A string, so adding one needs no migration. */
export type NotificationKind =
  | "group.edited"
  | "group.cancelled"
  | "group.launched"
  | "period.opened"
  | "member.joined"
  | "member.left"
  | "member.kicked"
  | "placeholder.claimed"
  | "submission.pending"
  | "submission.approved"
  | "submission.denied"
  | "payout.ready"
  | "payout.handed_over"
  | "debt.created"
  | "debt.interest"
  | "group.completed";

/** Send the same notification to several users, skipping duplicates and nulls. */
export async function notifyUsers(
  db: Db,
  userIds: (string | null | undefined)[],
  message: {
    groupId: string;
    kind: NotificationKind;
    title: string;
    body: string;
    link?: string;
    data?: Record<string, unknown>;
  },
) {
  const unique = [...new Set(userIds.filter((id): id is string => !!id))];
  if (unique.length === 0) return;
  await db.notification.createMany({
    data: unique.map((userId) => ({
      userId,
      groupId: message.groupId,
      kind: message.kind,
      title: message.title,
      body: message.body,
      link: message.link ?? `/groups/${message.groupId}`,
      data: message.data as Prisma.InputJsonValue | undefined,
    })),
  });
}

function serialize(n: Prisma.NotificationGetPayload<{ include: { group: { select: { name: true } } } }>) {
  return {
    id: n.id,
    groupId: n.groupId,
    groupName: n.group?.name ?? null,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
    data: n.data,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
    isUnread: n.readAt == null,
  };
}

export async function listUserNotifications(userId: string, limit = 50) {
  const notifications = await prisma.notification.findMany({
    where: { userId },
    include: { group: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return notifications.map(serialize);
}

export function countUnreadNotifications(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const notification = await prisma.notification.findFirst({ where: { id: notificationId, userId } });
  if (!notification) throw notFound("Notification");
  if (notification.readAt) return notification;
  return prisma.notification.update({ where: { id: notificationId }, data: { readAt: new Date() } });
}

export async function markAllNotificationsRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { marked: result.count };
}
