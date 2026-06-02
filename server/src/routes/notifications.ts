import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  countUnreadNotifications,
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationError,
} from "../services/notifications.js";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      listUserNotifications(req.user!.id),
      countUnreadNotifications(req.user!.id),
    ]);
    res.json({ notifications, unreadCount });
  } catch (err) {
    next(err);
  }
});

router.patch("/read-all", async (req, res, next) => {
  try {
    const result = await markAllNotificationsRead(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const notification = await markNotificationRead(req.user!.id, String(req.params.id));
    res.json({
      notification: {
        id: notification.id,
        readAt: notification.readAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    if (err instanceof NotificationError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

export default router;
