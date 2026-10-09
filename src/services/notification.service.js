import { db } from "../prisma/db.js";

const getIo = () => globalThis.__io;

/**
 * Creates a notification in DB and emits realtime socket event to target user room.
 */
export async function createAndEmitNotification({
  userId,
  type = "MESSAGE",
  title,
  message,
  conversationId = null,
  messageId = null,
  actorId = null,
}) {
  try {
    if (!userId || !title || !message) return null;

    const newNotif = await db.orm.public.Notification.create({
      userId: Number(userId),
      type: String(type),
      title: String(title),
      message: String(message),
      conversationId: conversationId ? Number(conversationId) : null,
      messageId: messageId ? Number(messageId) : null,
      actorId: actorId ? Number(actorId) : null,
      isRead: false,
    });

    // Populate actor info if actorId exists
    let actorName = null;
    let actorAvatar = null;

    if (actorId) {
      const actor = await db.orm.public.User.first({ id: Number(actorId) });
      if (actor) {
        actorName = actor.name;
        actorAvatar = actor.avatar;
      }
    }

    // Get unread notification count for recipient
    const userNotifs = await db.orm.public.Notification.where({
      userId: Number(userId),
    }).all();
    const unreadCount = userNotifs.filter((n) => !n.isRead).length;

    const notifPayload = {
      id: newNotif.id,
      userId: newNotif.userId,
      type: newNotif.type,
      title: newNotif.title,
      message: newNotif.message,
      conversationId: newNotif.conversationId,
      messageId: newNotif.messageId,
      actorId: newNotif.actorId,
      actorName,
      actorAvatar,
      isRead: Boolean(newNotif.isRead),
      createdAt: newNotif.createdAt,
      unreadCount,
    };

    console.log(`[BACKEND] NOTIFICATION EMITTED TO user_${userId}:`, notifPayload);

    // Emit to user room
    getIo()?.to(`user_${userId}`).emit("notification_new", notifPayload);

    return notifPayload;
  } catch (error) {
    console.error("[BACKEND] createAndEmitNotification error:", error);
    return null;
  }
}
