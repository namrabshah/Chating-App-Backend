import http from "http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import app from "./src/app.js";
import { db } from "./src/prisma/db.js";

const PORT = 5000;

const onlineUsers = new Map();

const server = http.createServer(app);

export const io = new Server(server, {
    cors: {
        origin: "*",
    },
});

// ========================================
// HELPER: PROCESS PENDING DELIVERIES
// ========================================

async function processPendingDeliveries(userId) {
    try {
        const memberships = await db.orm.public.ConversationMember.where({
            userId,
        }).all();

        const conversationIds = memberships.map((m) => m.conversationId);

        if (conversationIds.length === 0) return;

        const allMessages = await db.orm.public.Message.all();

        const pendingMessages = allMessages.filter(
            (msg) =>
                conversationIds.includes(msg.conversationId) &&
                msg.senderId !== userId &&
                !msg.isDelivered
        );

        for (const msg of pendingMessages) {
            await db.orm.public.Message.where({ id: msg.id }).update({
                isDelivered: true,
            });

            console.log(
                "[BACKEND] MESSAGE DELIVERY DATABASE UPDATED",
                msg.id
            );

            const deliveryPayload = {
                messageId: msg.id,
                conversationId: msg.conversationId,
                senderId: msg.senderId,
                recipientId: userId,
                isDelivered: true,
            };

            io.to(`user_${msg.senderId}`)
                .to(`conversation_${msg.conversationId}`)
                .emit("message_delivery_updated", deliveryPayload);

            console.log(
                "[BACKEND] DELIVERY UPDATE EMITTED TO SENDER",
                deliveryPayload
            );
        }
    } catch (error) {
        console.error("Pending deliveries error:", error);
    }
}

// ========================================
// SOCKET JWT AUTHENTICATION
// ========================================

io.use((socket, next) => {
    try {
        const token = socket.handshake.auth?.token;

        if (!token) {
            return next(new Error("Authentication token required"));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.data.userId = decoded.userId;

        next();
    } catch (error) {
        next(new Error("Invalid or expired token"));
    }
});

// ========================================
// SOCKET CONNECTION
// ========================================

io.on("connection", async (socket) => {
    const userId = socket.data.userId;

    console.log(`User ${userId} connected:`, socket.id);

    // Join user-specific room for multi-tab/device socket dispatching
    socket.join(`user_${userId}`);

    // Track online user sockets
    void (async () => {
        try {
            const userSockets = onlineUsers.get(userId) || new Set();
            userSockets.add(socket.id);
            onlineUsers.set(userId, userSockets);

            if (userSockets.size === 1) {
                await db.orm.public.User.where({ id: userId }).update({
                    isOnline: true,
                    lastSeen: null,
                });

                console.log(`User ${userId} is online`);
                io.emit("user_online", { userId });
            }

            // Automatically deliver pending messages when user comes online
            await processPendingDeliveries(userId);
        } catch (error) {
            console.error("Online status error:", error);
        }
    })();

    // ========================================
    // JOIN CONVERSATION
    // ========================================

    socket.on("join_conversation", async (data, callback) => {
        const conversationId =
            typeof data === "object"
                ? Number(data?.conversationId)
                : Number(data);

        console.log(
            `JOIN REQUEST: User ${userId}, Conversation ${conversationId}`
        );

        if (!conversationId || Number.isNaN(conversationId)) {
            if (typeof callback === "function") {
                callback({ success: false, message: "Invalid conversationId" });
            }
            return;
        }

        try {
            const member = await db.orm.public.ConversationMember.first({
                conversationId,
                userId,
            });

            if (!member) {
                console.log(
                    `JOIN FAILED: User ${userId} is not member of ${conversationId}`
                );
                if (typeof callback === "function") {
                    callback({
                        success: false,
                        message: "You are not a member of this conversation",
                    });
                }
                return;
            }

            const roomName = `conversation_${conversationId}`;
            socket.join(roomName);

            console.log(`ROOM JOINED: ${roomName} by User ${userId}`);

            if (typeof callback === "function") {
                callback({
                    success: true,
                    conversationId,
                });
            }
        } catch (error) {
            console.error("Join conversation error:", error);
            if (typeof callback === "function") {
                callback({ success: false, message: "Join failed" });
            }
        }
    });

    // ========================================
    // TYPING
    // ========================================

    socket.on("typing", (conversationId) => {
        const convId =
            typeof conversationId === "object"
                ? Number(conversationId?.conversationId)
                : Number(conversationId);

        socket.to(`conversation_${convId}`).emit("user_typing", {
            userId,
            conversationId: convId,
        });
    });

    // ========================================
    // STOP TYPING
    // ========================================

    socket.on("stop_typing", (conversationId) => {
        const convId =
            typeof conversationId === "object"
                ? Number(conversationId?.conversationId)
                : Number(conversationId);

        socket.to(`conversation_${convId}`).emit("user_stop_typing", {
            userId,
            conversationId: convId,
        });
    });

    // ========================================
    // MESSAGE DELIVERED ACK
    // ========================================

    socket.on("message_delivered", async (data) => {
        try {
            const messageId =
                typeof data === "object"
                    ? Number(data?.messageId)
                    : Number(data);

            const conversationId =
                typeof data === "object" && data?.conversationId
                    ? Number(data.conversationId)
                    : null;

            console.log("DELIVERY DEBUG - ACK RECEIVED:", {
                socketId: socket.id,
                userId: socket.data.userId,
                messageId,
                conversationId,
            });

            if (!messageId || Number.isNaN(messageId)) return;

            const message = await db.orm.public.Message.first({
                id: messageId,
            });

            if (!message) return;

            console.log("DELIVERY DEBUG - MESSAGE BEFORE UPDATE:", message);

            // Sender cannot acknowledge delivery of own message
            if (message.senderId === userId) return;

            // Verify recipient belongs to conversation
            const member = await db.orm.public.ConversationMember.first({
                conversationId: message.conversationId,
                userId,
            });

            if (!member) return;

            if (message.isDelivered) return;

            const updatedMessage = await db.orm.public.Message.where({
                id: messageId,
            }).update({
                isDelivered: true,
            });

            console.log("DELIVERY DEBUG - DATABASE UPDATED:", {
                messageId: message.id,
                isDelivered: true,
                senderId: message.senderId,
                recipientId: socket.data.userId,
            });

            console.log("DELIVERY DEBUG - EMITTING TO SENDER:", {
                senderId: message.senderId,
                messageId: message.id,
            });

            const deliveryPayload = {
                messageId: message.id,
                conversationId: message.conversationId,
                senderId: message.senderId,
                recipientId: userId,
                isDelivered: true,
            };

            io.to(`user_${message.senderId}`)
                .to(`conversation_${message.conversationId}`)
                .emit("message_delivery_updated", deliveryPayload);
        } catch (error) {
            console.error("Message delivered error:", error);
        }
    });

    // ========================================
    // MESSAGE READ ACK
    // ========================================

    socket.on("message_read", async (data) => {
        try {
            const conversationId =
                typeof data === "object"
                    ? Number(data?.conversationId)
                    : Number(data);

            const messageId =
                typeof data === "object" && data?.messageId
                    ? Number(data.messageId)
                    : null;

            if (!conversationId || Number.isNaN(conversationId)) return;

            const member = await db.orm.public.ConversationMember.first({
                conversationId,
                userId,
            });

            if (!member) return;

            console.log("[BACKEND] MESSAGE READ ACK RECEIVED", {
                messageId,
                conversationId,
                userId,
            });

            const allMessages = await db.orm.public.Message.all();

            const unreadMessages = allMessages.filter(
                (msg) =>
                    msg.conversationId === conversationId &&
                    msg.senderId !== userId &&
                    !msg.isRead &&
                    (messageId ? msg.id === messageId : true)
            );

            for (const msg of unreadMessages) {
                await db.orm.public.Message.where({ id: msg.id }).update({
                    isRead: true,
                    isDelivered: true,
                });

                console.log(
                    "[BACKEND] MESSAGE READ DATABASE UPDATED",
                    msg.id
                );

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

                console.log(
                    "[BACKEND] READ UPDATE EMITTED TO SENDER",
                    readPayload
                );
            }
        } catch (error) {
            console.error("Message read error:", error);
        }
    });

    // ========================================
    // DISCONNECT
    // ========================================

    socket.on("disconnect", async () => {
        console.log(`User ${userId} disconnected:`, socket.id);

        try {
            const userSockets = onlineUsers.get(userId);

            if (!userSockets) return;

            userSockets.delete(socket.id);

            if (userSockets.size > 0) {
                onlineUsers.set(userId, userSockets);
                return;
            }

            onlineUsers.delete(userId);

            const lastSeen = new Date();

            await db.orm.public.User.where({ id: userId }).update({
                isOnline: false,
                lastSeen,
            });

            console.log(`User ${userId} is offline`);

            io.emit("user_offline", {
                userId,
                lastSeen,
            });
        } catch (error) {
            console.error("Offline status error:", error);
        }
    });
});

// ========================================
// START SERVER
// ========================================

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
