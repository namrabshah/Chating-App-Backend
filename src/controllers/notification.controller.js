import { db } from "../prisma/db.js";

// GET /api/notifications
export const getNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 20);

    const allNotifs = await db.orm.public.Notification.where({ userId }).all();
    const allUsers = await db.orm.public.User.all();
    const usersMap = new Map(allUsers.map((u) => [u.id, u]));

    // Sort newest first
    const sortedNotifs = [...allNotifs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const total = sortedNotifs.length;
    const unreadCount = sortedNotifs.filter((n) => !Boolean(n.isRead)).length;

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const sliced = sortedNotifs.slice(startIndex, endIndex);
    const hasMore = endIndex < total;

    const notifications = sliced.map((n) => {
      const actor = n.actorId ? usersMap.get(n.actorId) : null;
      return {
        id: n.id,
        userId: n.userId,
        type: n.type || "MESSAGE",
        title: n.title,
        message: n.message,
        conversationId: n.conversationId ?? null,
        messageId: n.messageId ?? null,
        actorId: n.actorId ?? null,
        actorName: actor ? actor.name : null,
        actorAvatar: actor ? actor.avatar : null,
        isRead: Boolean(n.isRead),
        createdAt: n.createdAt,
      };
    });

    return res.status(200).json({
      success: true,
      notifications,
      unreadCount,
      page,
      limit,
      total,
      hasMore,
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// PATCH /api/notifications/:notificationId/read
export const markNotificationAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const notificationId = Number(req.params.notificationId);

    if (!notificationId || Number.isNaN(notificationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notificationId",
      });
    }

    const notification = await db.orm.public.Notification.first({
      id: notificationId,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    if (notification.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You can only mark your own notifications as read",
      });
    }

    const updated = await db.orm.public.Notification.where({
      id: notificationId,
    }).update({
      isRead: true,
    });

    const userNotifs = await db.orm.public.Notification.where({ userId }).all();
    const unreadCount = userNotifs.filter((n) => !Boolean(n.isRead)).length;

    return res.status(200).json({
      success: true,
      notification: {
        id: updated.id,
        userId: updated.userId,
        type: updated.type,
        title: updated.title,
        message: updated.message,
        conversationId: updated.conversationId ?? null,
        messageId: updated.messageId ?? null,
        actorId: updated.actorId ?? null,
        isRead: true,
        createdAt: updated.createdAt,
      },
      unreadCount,
    });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// PATCH /api/notifications/read-all
export const markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;

    const userNotifs = await db.orm.public.Notification.where({ userId }).all();
    const unreadNotifs = userNotifs.filter((n) => !Boolean(n.isRead));

    for (const n of unreadNotifs) {
      await db.orm.public.Notification.where({ id: n.id }).update({
        isRead: true,
      });
    }

    return res.status(200).json({
      success: true,
      unreadCount: 0,
    });
  } catch (error) {
    console.error("Mark all read error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// DELETE /api/notifications/:notificationId
export const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.userId;
    const notificationId = Number(req.params.notificationId);

    if (!notificationId || Number.isNaN(notificationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notificationId",
      });
    }

    const notification = await db.orm.public.Notification.first({
      id: notificationId,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    if (notification.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own notifications",
      });
    }

    await db.orm.public.Notification.where({ id: notificationId }).delete();

    const userNotifs = await db.orm.public.Notification.where({ userId }).all();
    const unreadCount = userNotifs.filter((n) => !Boolean(n.isRead)).length;

    return res.status(200).json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    console.error("Delete notification error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
