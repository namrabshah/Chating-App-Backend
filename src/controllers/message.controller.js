import { db } from "../prisma/db.js";
import { io } from "../../server.js";

// ========================================
// SEND MESSAGE
// ========================================

export const sendMessage = async (req, res) => {
    try {
        const senderId = req.user.userId;
        const conversationId = Number(req.params.conversationId);
        const { content } = req.body;

        if (!conversationId) {
            return res.status(400).json({
                success: false,
                message: "conversationId is required",
            });
        }

        if (!content || !content.trim()) {
            return res.status(400).json({
                success: false,
                message: "Message content is required",
            });
        }

        const member =
            await db.orm.public.ConversationMember.first({
                conversationId,
                userId: senderId,
            });

        if (!member) {
            return res.status(403).json({
                success: false,
                message:
                    "You are not a member of this conversation",
            });
        }

        const message =
            await db.orm.public.Message.create({
                conversationId,
                senderId,
                content: content.trim(),
            });

        console.log(
            `MESSAGE SENT: ${message.id} by User ${senderId} in Conversation ${conversationId}`
        );

        // Send real-time message
        io.to(`conversation_${conversationId}`).emit(
            "new_message",
            {
                id: message.id,
                conversationId: message.conversationId,
                senderId: message.senderId,
                content: message.content,
                isDelivered: message.isDelivered,
                isRead: message.isRead,
                createdAt: message.createdAt,
            }
        );

        console.log(
            `MESSAGE RECEIVED EVENT EMITTED: ${message.id} to conversation_${conversationId}`
        );

        return res.status(201).json({
            success: true,
            message: {
                id: message.id,
                conversationId: message.conversationId,
                senderId: message.senderId,
                content: message.content,
                isDelivered: message.isDelivered,
                isRead: message.isRead,
                createdAt: message.createdAt,
                updatedAt: message.updatedAt,
            },
        });
    } catch (error) {
        console.error("Send message error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

// ========================================
// GET MESSAGES
// ========================================

export const getMessages = async (req, res) => {
    try {
        const userId = req.user.userId;
        const conversationId = Number(req.params.conversationId);

        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        if (!conversationId) {
            return res.status(400).json({
                success: false,
                message: "conversationId is required",
            });
        }

        const member =
            await db.orm.public.ConversationMember.first({
                conversationId,
                userId,
            });

        if (!member) {
            return res.status(403).json({
                success: false,
                message:
                    "You are not a member of this conversation",
            });
        }

        const allMessages =
            await db.orm.public.Message.all();

        const filteredMessages = allMessages
            .filter(
                (msg) =>
                    msg.conversationId === conversationId
            )
            .sort(
                (a, b) =>
                    new Date(a.createdAt) -
                    new Date(b.createdAt)
            );

        const messages = filteredMessages.slice(
            skip,
            skip + limit
        );

        return res.status(200).json({
            success: true,
            page,
            limit,
            messages,
        });
    } catch (error) {
        console.error("Get messages error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

// ========================================
// DELETE MESSAGE
// ========================================

export const deleteMessage = async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const messageId = Number(req.params.messageId);

        if (!messageId) {
            return res.status(400).json({
                success: false,
                message: "messageId is required",
            });
        }

        const message =
            await db.orm.public.Message.first({
                id: messageId,
            });

        if (!message) {
            return res.status(404).json({
                success: false,
                message: "Message not found",
            });
        }

        if (message.senderId !== currentUserId) {
            return res.status(403).json({
                success: false,
                message:
                    "You can delete only your own message",
            });
        }

        await db.orm.public.Message
            .where({ id: messageId })
            .delete();

        // Notify conversation users
        io.to(
            `conversation_${message.conversationId}`
        ).emit(
            "message_deleted",
            {
                messageId: message.id,
                conversationId:
                    message.conversationId,
            }
        );

        return res.status(200).json({
            success: true,
            message: "Message deleted successfully",
        });
    } catch (error) {
        console.error("Delete message error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

// ========================================
// UPDATE MESSAGE
// ========================================

export const updateMessage = async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const messageId = Number(req.params.messageId);
        const { content } = req.body;

        if (!messageId) {
            return res.status(400).json({
                success: false,
                message: "messageId is required",
            });
        }

        if (!content || !content.trim()) {
            return res.status(400).json({
                success: false,
                message: "Message content is required",
            });
        }

        const message =
            await db.orm.public.Message.first({
                id: messageId,
            });

        if (!message) {
            return res.status(404).json({
                success: false,
                message: "Message not found",
            });
        }

        if (message.senderId !== currentUserId) {
            return res.status(403).json({
                success: false,
                message:
                    "You can update only your own message",
            });
        }

        const updatedMessage =
            await db.orm.public.Message
                .where({ id: messageId })
                .update({
                    content: content.trim(),
                });

        // Notify conversation users
        io.to(
            `conversation_${updatedMessage.conversationId}`
        ).emit(
            "message_updated",
            {
                message: updatedMessage,
            }
        );

        return res.status(200).json({
            success: true,
            message: updatedMessage,
        });
    } catch (error) {
        console.error("Update message error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

// ========================================
// MARK MESSAGE AS READ
// ========================================

export const markMessageAsRead = async (req, res) => {
    try {
        const userId = req.user.userId;
        const messageId = Number(req.params.messageId);

        if (!messageId) {
            return res.status(400).json({
                success: false,
                message: "messageId is required",
            });
        }

        const message =
            await db.orm.public.Message.first({
                id: messageId,
            });

        if (!message) {
            return res.status(404).json({
                success: false,
                message: "Message not found",
            });
        }

        // Sender cannot mark own message as read
        if (message.senderId === userId) {
            return res.status(400).json({
                success: false,
                message:
                    "You cannot mark your own message as read",
            });
        }

        const member =
            await db.orm.public.ConversationMember.first({
                conversationId: message.conversationId,
                userId,
            });

        if (!member) {
            return res.status(403).json({
                success: false,
                message:
                    "You are not a member of this conversation",
            });
        }

        const updatedMessage =
            await db.orm.public.Message
                .where({ id: messageId })
                .update({
                    isRead: true,
                });

        // Real-time read event
        io.to(
            `conversation_${message.conversationId}`
        ).emit(
            "message_read",
            {
                messageId: message.id,
                conversationId:
                    message.conversationId,
                userId,
            }
        );

        return res.status(200).json({
            success: true,
            message: "Message marked as read",
            data: {
                messageId: message.id,
                conversationId:
                    message.conversationId,
                userId,
                isRead: true,
            },
        });
    } catch (error) {
        console.error(
            "Mark message read error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

// ========================================
// GET UNREAD MESSAGES
// ========================================

export const getUnreadMessages = async (req, res) => {
    try {
        const userId = req.user.userId;
        const conversationId =
            Number(req.params.conversationId);

        if (!conversationId) {
            return res.status(400).json({
                success: false,
                message: "conversationId is required",
            });
        }

        const member =
            await db.orm.public.ConversationMember.first({
                conversationId,
                userId,
            });

        if (!member) {
            return res.status(403).json({
                success: false,
                message:
                    "You are not a member of this conversation",
            });
        }

        const allMessages =
            await db.orm.public.Message.all();

        const unreadMessages =
            allMessages.filter(
                (message) =>
                    message.conversationId ===
                        conversationId &&
                    message.isRead === false &&
                    message.senderId !== userId
            );

        return res.status(200).json({
            success: true,
            unreadCount: unreadMessages.length,
            messages: unreadMessages,
        });
    } catch (error) {
        console.error(
            "Get unread messages error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};