import { prisma } from "../lib/prisma.js";
import { GroupError } from "./groups.js";

export class NotificationError extends GroupError {}

export function serializeNotification(n: {
  id: string;
  userId: string;
  groupId: string | null;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
  group?: { name: string } | null;
}) {
  return {
    id: n.id,
    groupId: n.groupId,
    groupName: n.group?.name ?? null,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
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

  return notifications.map(serializeNotification);
}

export async function countUnreadNotifications(userId: string) {
  return prisma.notification.count({
    where: { userId, readAt: null },
  });
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });
  if (!notification) {
    throw new NotificationError(404, "Notification not found");
  }
  if (notification.readAt) return notification;

  return prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { marked: result.count };
}
