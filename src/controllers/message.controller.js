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
                isDelivered: false,
                isRead: false,
            });

        console.log(`[BACKEND] MESSAGE CREATED`, message.id);

        const messagePayload = {
            id: message.id,
            conversationId: message.conversationId,
            senderId: message.senderId,
            content: message.content,
            isDelivered: false,
            isRead: false,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt,
        };

        // Broadcast real-time new_message to conversation room
        io.to(`conversation_${conversationId}`).emit(
            "new_message",
            messagePayload
        );

        console.log(`[BACKEND] NEW MESSAGE EMITTED`, messagePayload);
        console.log("[BACKEND] CONVERSATION UPDATED", {
            conversationId,
            lastMessageId: message.id,
        });

        // Broadcast to user rooms for sidebar updates
        const members = await db.orm.public.ConversationMember.where({
            conversationId,
        }).all();

        const allMessagesForCalc = await db.orm.public.Message.all();
        const convMessages = allMessagesForCalc.filter(
            (m) => m.conversationId === conversationId
        );

        for (const memberItem of members) {
            const memberUnreadCount = convMessages.filter(
                (m) => m.senderId !== memberItem.userId && !m.isRead
            ).length;

            console.log("[BACKEND] UNREAD COUNT", memberUnreadCount);
            console.log("[BACKEND] UNREAD COUNT CALCULATED", {
                conversationId,
                userId: memberItem.userId,
                unreadCount: memberUnreadCount,
            });

            console.log("[BACKEND] UNREAD COUNT UPDATED", {
                conversationId,
                userId: memberItem.userId,
                unreadCount: memberUnreadCount,
            });

            // Emit to user room so sidebar updates in realtime even if viewing another conversation
            io.to(`user_${memberItem.userId}`).emit(
                "new_message",
                messagePayload
            );

            const conversationUpdatePayload = {
                conversationId,
                lastMessage: {
                    id: message.id,
                    conversationId: message.conversationId,
                    senderId: message.senderId,
                    content: message.content,
                    createdAt: message.createdAt,
                    isDelivered: message.isDelivered,
                    isRead: message.isRead,
                },
                unreadCount: memberUnreadCount,
                updatedAt: message.createdAt,
            };

            io.to(`user_${memberItem.userId}`).emit(
                "conversation_updated",
                conversationUpdatePayload
            );

            io.to(`user_${memberItem.userId}`).emit("unread_count_updated", {
                conversationId,
                userId: memberItem.userId,
                unreadCount: memberUnreadCount,
            });
        }

        return res.status(201).json({
            success: true,
            message: messagePayload,
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
        const limit = Number(req.query.limit) || 50;
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
                    new Date(a.createdAt).getTime() -
                    new Date(b.createdAt).getTime()
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
// MARK CONVERSATION MESSAGES AS READ
// ========================================

export const markConversationAsRead = async (req, res) => {
    try {
        const userId = req.user.userId;
        const conversationId = Number(req.params.conversationId);

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

        const unreadMessages = allMessages.filter(
            (msg) =>
                msg.conversationId === conversationId &&
                msg.senderId !== userId &&
                !msg.isRead
        );

        for (const msg of unreadMessages) {
            await db.orm.public.Message
                .where({ id: msg.id })
                .update({
                    isRead: true,
                    isDelivered: true,
                });

            console.log("[BACKEND] MESSAGE READ ACK RECEIVED", {
                messageId: msg.id,
                userId,
            });
            console.log("[BACKEND] MESSAGE READ DATABASE UPDATED", msg.id);

            const readPayload = {
                messageId: msg.id,
                conversationId: msg.conversationId,
                senderId: msg.senderId,
                recipientId: userId,
                isRead: true,
            };

            io.to(`user_${msg.senderId}`)
                .to(`conversation_${msg.conversationId}`)
                .emit("message_read_updated", readPayload);

            console.log("[BACKEND] READ UPDATE EMITTED TO SENDER", readPayload);
        }

        return res.status(200).json({
            success: true,
            message: "Conversation marked as read",
            updatedCount: unreadMessages.length,
        });
    } catch (error) {
        console.error(
            "Mark conversation read error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

// ========================================
// MARK SINGLE MESSAGE AS READ
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

        await db.orm.public.Message
            .where({ id: messageId })
            .update({
                isRead: true,
                isDelivered: true,
            });

        console.log("[BACKEND] MESSAGE READ ACK RECEIVED", {
            messageId: message.id,
            userId,
        });
        console.log("[BACKEND] MESSAGE READ DATABASE UPDATED", message.id);

        const readPayload = {
            messageId: message.id,
            conversationId: message.conversationId,
            senderId: message.senderId,
            recipientId: userId,
            isRead: true,
        };

        io.to(`user_${message.senderId}`)
            .to(`conversation_${message.conversationId}`)
            .emit("message_read_updated", readPayload);

        console.log("[BACKEND] READ UPDATE EMITTED TO SENDER", readPayload);

        return res.status(200).json({
            success: true,
            message: "Message marked as read",
            data: readPayload,
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