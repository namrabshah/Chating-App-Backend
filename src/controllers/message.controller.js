import { db } from "../prisma/db.js";
const getIo = () => globalThis.__io;
import { deleteUploadedFile } from "../middleware/upload.middleware.js";

export const ALLOWED_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "😡"];

export function isValidReaction(reaction) {
    return typeof reaction === "string" && ALLOWED_REACTIONS.includes(reaction);
}

async function getAggregatedReactionsForMessage(messageId, currentUserId = null, usersMap = null) {
    const rawReactions = await db.orm.public.MessageReaction.where({ messageId }).all();

    if (!usersMap) {
        const allUsers = await db.orm.public.User.all();
        usersMap = new Map(allUsers.map((u) => [u.id, u.name]));
    }

    const groupedMap = new Map();
    let myReaction = null;

    for (const item of rawReactions) {
        if (!groupedMap.has(item.reaction)) {
            groupedMap.set(item.reaction, []);
        }
        groupedMap.get(item.reaction).push(item);

        if (currentUserId != null && Number(item.userId) === Number(currentUserId)) {
            myReaction = item.reaction;
        }
    }

    const reactions = [];
    for (const emoji of ALLOWED_REACTIONS) {
        if (groupedMap.has(emoji)) {
            const items = groupedMap.get(emoji);
            reactions.push({
                reaction: emoji,
                count: items.length,
                users: items.map((it) => ({
                    id: it.userId,
                    name: usersMap.get(it.userId) || "User",
                })),
            });
        }
    }

    for (const [emoji, items] of groupedMap.entries()) {
        if (!ALLOWED_REACTIONS.includes(emoji)) {
            reactions.push({
                reaction: emoji,
                count: items.length,
                users: items.map((it) => ({
                    id: it.userId,
                    name: usersMap.get(it.userId) || "User",
                })),
            });
        }
    }

    return { reactions, myReaction };
}

function buildMessagePayload(
    message,
    replyToMessageMap = null,
    usersMap = null,
    currentUserId = null,
    deletedForUserIds = null,
    messageReactionsMap = null
) {
    let replyToMessagePayload = null;

    if (message.replyToMessageId) {
        if (replyToMessageMap && replyToMessageMap.has(message.replyToMessageId)) {
            const targetMsg = replyToMessageMap.get(message.replyToMessageId);
            const senderName = usersMap
                ? usersMap.get(targetMsg.senderId) || "User"
                : "User";
            const targetHiddenForCurrentUser =
                currentUserId != null &&
                deletedForUserIds &&
                deletedForUserIds.has(targetMsg.id);

            replyToMessagePayload = {
                id: targetMsg.id,
                senderId: targetMsg.senderId,
                senderName: senderName,
                content:
                    targetHiddenForCurrentUser || targetMsg.isDeleted
                        ? "Message deleted"
                        : targetMsg.content ?? null,
                attachmentUrl:
                    targetHiddenForCurrentUser || targetMsg.isDeleted
                        ? null
                        : targetMsg.attachmentUrl ?? null,
                attachmentName:
                    targetHiddenForCurrentUser || targetMsg.isDeleted
                        ? null
                        : targetMsg.attachmentName ?? null,
                attachmentType:
                    targetHiddenForCurrentUser || targetMsg.isDeleted
                        ? null
                        : targetMsg.attachmentType ?? null,
                isDeleted: Boolean(targetMsg.isDeleted),
            };
        } else if (
            typeof message.replyToMessage === "object" &&
            message.replyToMessage !== null
        ) {
            replyToMessagePayload = message.replyToMessage;
        } else {
            replyToMessagePayload = {
                id: message.replyToMessageId,
                senderId: 0,
                senderName: "User",
                content: "Message deleted",
                attachmentUrl: null,
                attachmentName: null,
                attachmentType: null,
                isDeleted: true,
            };
        }
    }

    const isDeleted = Boolean(message.isDeleted);

    let reactions = message.reactions || [];
    let myReaction = message.myReaction ?? null;

    if (!isDeleted && messageReactionsMap && messageReactionsMap.has(message.id)) {
        const rawReactions = messageReactionsMap.get(message.id) || [];
        const groupedMap = new Map();
        myReaction = null;

        for (const item of rawReactions) {
            if (!groupedMap.has(item.reaction)) {
                groupedMap.set(item.reaction, []);
            }
            groupedMap.get(item.reaction).push(item);

            if (currentUserId != null && Number(item.userId) === Number(currentUserId)) {
                myReaction = item.reaction;
            }
        }

        reactions = [];
        for (const emoji of ALLOWED_REACTIONS) {
            if (groupedMap.has(emoji)) {
                const items = groupedMap.get(emoji);
                reactions.push({
                    reaction: emoji,
                    count: items.length,
                    users: items.map((it) => ({
                        id: it.userId,
                        name: usersMap ? usersMap.get(it.userId) || "User" : "User",
                    })),
                });
            }
        }

        for (const [emoji, items] of groupedMap.entries()) {
            if (!ALLOWED_REACTIONS.includes(emoji)) {
                reactions.push({
                    reaction: emoji,
                    count: items.length,
                    users: items.map((it) => ({
                        id: it.userId,
                        name: usersMap ? usersMap.get(it.userId) || "User" : "User",
                    })),
                });
            }
        }
    } else if (isDeleted) {
        reactions = [];
        myReaction = null;
    }

    return {
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        content: isDeleted ? null : message.content ?? null,
        isDeleted,
        deletedAt: message.deletedAt ?? null,
        isDelivered: Boolean(message.isDelivered),
        isRead: Boolean(message.isRead),
        attachmentUrl: isDeleted ? null : message.attachmentUrl ?? null,
        attachmentName: isDeleted ? null : message.attachmentName ?? null,
        attachmentType: isDeleted ? null : message.attachmentType ?? null,
        attachmentSize: isDeleted ? null : message.attachmentSize ?? null,
        replyToMessageId: message.replyToMessageId ?? null,
        replyToMessage: replyToMessagePayload,
        isEdited: Boolean(message.isEdited),
        editedAt: message.editedAt ?? null,
        reactions,
        myReaction,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
    };
}

function buildLastMessagePreview(message) {
    if (Boolean(message.isDeleted)) {
        return {
            id: message.id,
            conversationId: message.conversationId,
            senderId: message.senderId,
            content: "This message was deleted",
            attachmentUrl: null,
            attachmentName: null,
            attachmentType: null,
            attachmentSize: null,
            createdAt: message.createdAt,
            isDeleted: true,
            isDelivered: Boolean(message.isDelivered),
            isRead: Boolean(message.isRead),
        };
    }

    return {
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        content: message.content ?? null,
        attachmentUrl: message.attachmentUrl ?? null,
        attachmentName: message.attachmentName ?? null,
        attachmentType: message.attachmentType ?? null,
        attachmentSize: message.attachmentSize ?? null,
        createdAt: message.createdAt,
        isDeleted: false,
        isDelivered: Boolean(message.isDelivered),
        isRead: Boolean(message.isRead),
    };
}

// ========================================
// SEND MESSAGE
// ========================================

export const sendMessage = async (req, res) => {
    let uploadedFilename = req.file?.filename || null;

    try {
        const senderId = req.user.userId;
        const conversationId = Number(req.params.conversationId);
        const rawContent =
            typeof req.body?.content === "string" ? req.body.content : "";
        const content = rawContent.trim() ? rawContent.trim() : null;
        const file = req.file || null;

        const rawReplyToId = req.body?.replyToMessageId;
        const replyToMessageId =
            rawReplyToId != null && String(rawReplyToId).trim() !== ""
                ? Number(rawReplyToId)
                : null;

        if (!conversationId || Number.isNaN(conversationId)) {
            if (uploadedFilename) deleteUploadedFile(uploadedFilename);
            return res.status(400).json({
                success: false,
                message: "conversationId is required",
            });
        }

        if (!content && !file) {
            return res.status(400).json({
                success: false,
                message: "Message content or file is required",
            });
        }

        if (replyToMessageId !== null) {
            if (Number.isNaN(replyToMessageId) || replyToMessageId <= 0) {
                if (uploadedFilename) deleteUploadedFile(uploadedFilename);
                return res.status(400).json({
                    success: false,
                    message: "Invalid replyToMessageId",
                });
            }

            const targetMessage = await db.orm.public.Message.first({
                id: replyToMessageId,
            });

            if (!targetMessage) {
                if (uploadedFilename) deleteUploadedFile(uploadedFilename);
                return res.status(404).json({
                    success: false,
                    message: "Referenced message to reply to was not found",
                });
            }

            if (targetMessage.conversationId !== conversationId) {
                if (uploadedFilename) deleteUploadedFile(uploadedFilename);
                return res.status(400).json({
                    success: false,
                    message: "Cannot reply to a message from another conversation",
                });
            }
        }

        const member =
            await db.orm.public.ConversationMember.first({
                conversationId,
                userId: senderId,
            });

        if (!member) {
            if (uploadedFilename) deleteUploadedFile(uploadedFilename);
            return res.status(403).json({
                success: false,
                message:
                    "You are not a member of this conversation",
            });
        }

        const createData = {
            conversationId,
            senderId,
            content,
            isDelivered: false,
            isRead: false,
            attachmentUrl: null,
            attachmentName: null,
            attachmentType: null,
            attachmentSize: null,
            replyToMessageId: replyToMessageId || null,
        };

        if (file) {
            createData.attachmentUrl = `/uploads/${file.filename}`;
            createData.attachmentName = file.originalname;
            createData.attachmentType = file.mimetype;
            createData.attachmentSize = file.size;
        }

        let message;
        try {
            message = await db.orm.public.Message.create(createData);
        } catch (dbError) {
            if (uploadedFilename) deleteUploadedFile(uploadedFilename);
            throw dbError;
        }

        // File is linked to DB row — don't delete on later emit failures
        uploadedFilename = null;

        let replyToMessagePayload = null;
        if (message.replyToMessageId) {
            const targetMsg = await db.orm.public.Message.first({
                id: message.replyToMessageId,
            });
            if (targetMsg) {
                const targetSender = await db.orm.public.User.first({
                    id: targetMsg.senderId,
                });
                replyToMessagePayload = {
                    id: targetMsg.id,
                    senderId: targetMsg.senderId,
                    senderName: targetSender ? targetSender.name : "User",
                    content: targetMsg.content ?? null,
                    attachmentUrl: targetMsg.attachmentUrl ?? null,
                    attachmentName: targetMsg.attachmentName ?? null,
                    attachmentType: targetMsg.attachmentType ?? null,
                };
            }
        }

        const messageWithReply = {
            ...message,
            replyToMessage: replyToMessagePayload,
        };

        console.log("[BACKEND] MESSAGE CREATED:", {
            id: message.id,
            conversationId: message.conversationId,
            senderId: message.senderId,
            content: message.content,
            attachmentUrl: message.attachmentUrl,
            replyToMessageId: message.replyToMessageId,
        });

        const messagePayload = buildMessagePayload(messageWithReply);

        // Broadcast real-time new_message to conversation room
        getIo()?.to(`conversation_${conversationId}`).emit(
            "new_message",
            messagePayload
        );

        console.log(`[BACKEND] NEW MESSAGE EMITTED`, messagePayload);

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

            getIo()?.to(`user_${memberItem.userId}`).emit(
                "new_message",
                messagePayload
            );

            const conversationUpdatePayload = {
                conversationId,
                lastMessage: buildLastMessagePreview(message),
                unreadCount: memberUnreadCount,
                updatedAt: message.createdAt,
            };

            getIo()?.to(`user_${memberItem.userId}`).emit(
                "conversation_updated",
                conversationUpdatePayload
            );

            getIo()?.to(`user_${memberItem.userId}`).emit("unread_count_updated", {
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
        if (uploadedFilename) deleteUploadedFile(uploadedFilename);
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

        const allMessages = await db.orm.public.Message.all();
        const allUsers = await db.orm.public.User.all();
        const allReactions = await db.orm.public.MessageReaction.all();
        const deletedForUser = await db.orm.public.MessageDeletion.where({
            userId,
        }).all();
        const deletedIds = new Set(
            deletedForUser.map((entry) => Number(entry.messageId))
        );

        const messagesMap = new Map(allMessages.map((m) => [m.id, m]));
        const usersMap = new Map(allUsers.map((u) => [u.id, u.name]));

        const messageReactionsMap = new Map();
        for (const r of allReactions) {
            if (!messageReactionsMap.has(r.messageId)) {
                messageReactionsMap.set(r.messageId, []);
            }
            messageReactionsMap.get(r.messageId).push(r);
        }

        const filteredMessages = allMessages
            .filter(
                (msg) =>
                    msg.conversationId === conversationId &&
                    !deletedIds.has(Number(msg.id))
            )
            .sort(
                (a, b) =>
                    new Date(a.createdAt).getTime() -
                    new Date(b.createdAt).getTime()
            );

        const messages = filteredMessages
            .slice(skip, skip + limit)
            .map((msg) =>
                buildMessagePayload(
                    msg,
                    messagesMap,
                    usersMap,
                    userId,
                    deletedIds,
                    messageReactionsMap
                )
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
        const deleteType = String(req.body?.deleteType || "me").toLowerCase();

        if (!messageId) {
            return res.status(400).json({
                success: false,
                message: "messageId is required",
            });
        }

        if (!['me', 'everyone'].includes(deleteType)) {
            return res.status(400).json({
                success: false,
                message: "deleteType must be 'me' or 'everyone'",
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

        const member = await db.orm.public.ConversationMember.first({
            conversationId: message.conversationId,
            userId: currentUserId,
        });

        if (!member) {
            return res.status(403).json({
                success: false,
                message: "You are not a member of this conversation",
            });
        }

        if (deleteType === "me") {
            const existingDeletion = await db.orm.public.MessageDeletion.first({
                messageId: message.id,
                userId: currentUserId,
            });

            if (!existingDeletion) {
                await db.orm.public.MessageDeletion.create({
                    messageId: message.id,
                    userId: currentUserId,
                });
            }

            return res.status(200).json({
                success: true,
                deleteType: "me",
                messageId: message.id,
            });
        }

        if (message.senderId !== currentUserId) {
            return res.status(403).json({
                success: false,
                message: "Only the sender can delete for everyone",
            });
        }

        const updatedMessage = await db.orm.public.Message.where({ id: messageId }).update({
            isDeleted: true,
            deletedAt: new Date().toISOString(),
            deletedBy: currentUserId,
            content: null,
            attachmentUrl: null,
            attachmentName: null,
            attachmentType: null,
            attachmentSize: null,
        });

        getIo()?.to(`conversation_${message.conversationId}`).emit("message_deleted", {
            messageId: message.id,
            conversationId: message.conversationId,
            deletedBy: currentUserId,
            deleteType: "everyone",
            message: buildMessagePayload(updatedMessage),
        });

        return res.status(200).json({
            success: true,
            deleteType: "everyone",
            message: buildMessagePayload(updatedMessage),
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
        const rawContent =
            typeof req.body?.content === "string" ? req.body.content : "";
        const content = rawContent.trim();

        if (!messageId || Number.isNaN(messageId)) {
            return res.status(400).json({
                success: false,
                message: "messageId is required",
            });
        }

        if (!content) {
            return res.status(400).json({
                success: false,
                message: "Message content cannot be empty",
            });
        }

        const message = await db.orm.public.Message.first({
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
                message: "You can update only your own message",
            });
        }

        const editedAt = new Date().toISOString();

        const updatedRaw = await db.orm.public.Message
            .where({ id: messageId })
            .update({
                content: content,
                isEdited: true,
                editedAt: editedAt,
            });

        let replyToMessagePayload = null;
        if (updatedRaw.replyToMessageId) {
            const targetMsg = await db.orm.public.Message.first({
                id: updatedRaw.replyToMessageId,
            });
            if (targetMsg) {
                const targetSender = await db.orm.public.User.first({
                    id: targetMsg.senderId,
                });
                replyToMessagePayload = {
                    id: targetMsg.id,
                    senderId: targetMsg.senderId,
                    senderName: targetSender ? targetSender.name : "User",
                    content: targetMsg.content ?? null,
                    attachmentUrl: targetMsg.attachmentUrl ?? null,
                    attachmentName: targetMsg.attachmentName ?? null,
                    attachmentType: targetMsg.attachmentType ?? null,
                };
            }
        }

        const { reactions: existingReactions, myReaction: existingMyReaction } =
            await getAggregatedReactionsForMessage(messageId, currentUserId);

        const updatedMessage = {
            ...updatedRaw,
            replyToMessage: replyToMessagePayload,
            reactions: existingReactions,
            myReaction: existingMyReaction,
        };

        const messagePayload = buildMessagePayload(updatedMessage);

        getIo()?.to(`conversation_${updatedMessage.conversationId}`).emit(
            "message_updated",
            {
                message: messagePayload,
                ...messagePayload,
            }
        );

        console.log("[BACKEND] MESSAGE UPDATED & EMITTED:", messagePayload);

        return res.status(200).json({
            success: true,
            message: messagePayload,
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
        const deletedForUser = await db.orm.public.MessageDeletion.where({
            userId,
        }).all();
        const deletedIds = new Set(
            deletedForUser.map((entry) => Number(entry.messageId))
        );

        const unreadMessages = allMessages.filter(
            (msg) =>
                msg.conversationId === conversationId &&
                msg.senderId !== userId &&
                !msg.isRead &&
                !msg.isDeleted &&
                !deletedIds.has(Number(msg.id))
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

            getIo()?.to(`user_${msg.senderId}`)
                ?.to(`conversation_${msg.conversationId}`)
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

        getIo()?.to(`user_${message.senderId}`)
            ?.to(`conversation_${message.conversationId}`)
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
        const deletedForUser = await db.orm.public.MessageDeletion.where({
            userId,
        }).all();
        const deletedIds = new Set(
            deletedForUser.map((entry) => Number(entry.messageId))
        );

        const unreadMessages =
            allMessages.filter(
                (message) =>
                    message.conversationId ===
                        conversationId &&
                    message.isRead === false &&
                    message.senderId !== userId &&
                    !message.isDeleted &&
                    !deletedIds.has(Number(message.id))
            );

        return res.status(200).json({
            success: true,
            unreadCount: unreadMessages.length,
            messages: unreadMessages.map(buildMessagePayload),
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

// ========================================
// TOGGLE MESSAGE REACTION
// ========================================

export const toggleMessageReaction = async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const messageId = Number(req.params.messageId);
        const { reaction } = req.body || {};

        if (!messageId || Number.isNaN(messageId)) {
            return res.status(400).json({
                success: false,
                message: "messageId is required",
            });
        }

        if (!isValidReaction(reaction)) {
            return res.status(400).json({
                success: false,
                message: `Invalid reaction. Allowed reactions: ${ALLOWED_REACTIONS.join(", ")}`,
            });
        }

        const message = await db.orm.public.Message.first({
            id: messageId,
        });

        if (!message) {
            return res.status(404).json({
                success: false,
                message: "Message not found",
            });
        }

        if (message.isDeleted) {
            return res.status(400).json({
                success: false,
                message: "Cannot react to a deleted message",
            });
        }

        const member = await db.orm.public.ConversationMember.first({
            conversationId: message.conversationId,
            userId: currentUserId,
        });

        if (!member) {
            return res.status(403).json({
                success: false,
                message: "You are not a member of this conversation",
            });
        }

        const existingReaction = await db.orm.public.MessageReaction.first({
            messageId: message.id,
            userId: currentUserId,
        });

        let action = "";
        let finalReaction = null;

        if (existingReaction) {
            if (existingReaction.reaction === reaction) {
                // Toggle off (remove)
                await db.orm.public.MessageReaction.where({
                    id: existingReaction.id,
                }).delete();
                action = "removed";
                finalReaction = null;
            } else {
                // Change reaction
                await db.orm.public.MessageReaction.where({
                    id: existingReaction.id,
                }).update({
                    reaction: reaction,
                    updatedAt: new Date().toISOString(),
                });
                action = "updated";
                finalReaction = reaction;
            }
        } else {
            // Add new reaction
            await db.orm.public.MessageReaction.create({
                messageId: message.id,
                userId: currentUserId,
                reaction: reaction,
            });
            action = "added";
            finalReaction = reaction;
        }

        // Fetch updated reaction list for this message
        const { reactions: updatedReactions, myReaction } =
            await getAggregatedReactionsForMessage(message.id, currentUserId);

        const reactionSocketPayload = {
            messageId: message.id,
            conversationId: message.conversationId,
            reactions: updatedReactions,
            userId: currentUserId,
            reaction: finalReaction,
            action,
        };

        // Realtime update via Socket.IO
        getIo()?.to(`conversation_${message.conversationId}`).emit(
            "message_reaction_updated",
            reactionSocketPayload
        );

        console.log("[BACKEND] REACTION UPDATED & EMITTED:", reactionSocketPayload);

        return res.status(200).json({
            success: true,
            action,
            messageId: message.id,
            reaction: finalReaction,
            reactions: updatedReactions,
            myReaction,
        });
    } catch (error) {
        console.error("Toggle message reaction error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};
