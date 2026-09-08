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
// SOCKET JWT AUTHENTICATION
// ========================================

io.use((socket, next) => {
    try {
        const token = socket.handshake.auth.token;

        if (!token) {
            return next(
                new Error("Authentication token required")
            );
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        socket.data.userId = decoded.userId;

        next();
    } catch (error) {
        next(
            new Error("Invalid or expired token")
        );
    }
});

// ========================================
// SOCKET CONNECTION
// ========================================

io.on("connection", async (socket) => {

    const userId = socket.data.userId;

    console.log(
        `User ${userId} connected:`,
        socket.id
    );

    // ========================================
    // USER ONLINE
    // ========================================

    void (async () => {
        try {
            const userSockets =
                onlineUsers.get(userId) || new Set();

            userSockets.add(socket.id);

            onlineUsers.set(
                userId,
                userSockets
            );

            if (userSockets.size === 1) {

                await db.orm.public.User
                    .where({ id: userId })
                    .update({
                        isOnline: true,
                        lastSeen: null,
                    });

                console.log(
                    `User ${userId} is online`
                );

                io.emit("user_online", {
                    userId,
                });
            }

        } catch (error) {

            console.error(
                "Online status error:",
                error
            );
        }
    })();

    // ========================================
    // JOIN CONVERSATION
    // ========================================

    socket.on(
        "join_conversation",
        async (conversationId, callback) => {

            console.log(
                "JOIN EVENT RECEIVED:",
                conversationId
            );

            try {

                const numericConversationId =
                    Number(conversationId);

                console.log(
                    `JOIN REQUEST: User ${userId}, Conversation ${numericConversationId}`
                );

                const member =
                    await db.orm.public.ConversationMember.first({
                        conversationId:
                            numericConversationId,
                        userId,
                    });

                if (!member) {

                    console.log(
                        `JOIN FAILED: User ${userId} is not a member of conversation ${numericConversationId}`
                    );

                    if (callback) {
                        callback({
                            success: false,
                            message:
                                "You are not a member of this conversation",
                        });
                    }

                    return;
                }

                const roomName =
                    `conversation_${numericConversationId}`;

                socket.join(roomName);

                console.log(
                    `ROOM JOINED: ${roomName} by User ${userId}`
                );

                if (callback) {
                    callback({
                        success: true,
                        conversationId:
                            numericConversationId,
                    });
                }

            } catch (error) {

                console.error(
                    "Join conversation error:",
                    error
                );

                if (callback) {
                    callback({
                        success: false,
                        message: "Join failed",
                    });
                }
            }
        }
    );

    // ========================================
    // TYPING
    // ========================================

    socket.on(
        "typing",
        (conversationId) => {

            socket
                .to(
                    `conversation_${conversationId}`
                )
                .emit(
                    "user_typing",
                    {
                        userId,
                        conversationId,
                    }
                );

            console.log(
                `User ${userId} is typing in conversation ${conversationId}`
            );
        }
    );

    // ========================================
    // STOP TYPING
    // ========================================

    socket.on(
        "stop_typing",
        (conversationId) => {

            socket
                .to(
                    `conversation_${conversationId}`
                )
                .emit(
                    "user_stop_typing",
                    {
                        userId,
                        conversationId,
                    }
                );

            console.log(
                `User ${userId} stopped typing in conversation ${conversationId}`
            );
        }
    );

    // ========================================
    // MESSAGE DELIVERED
    // ========================================

    socket.on(
        "message_delivered",
        async (messageId) => {

            try {

                const numericMessageId =
                    Number(messageId);

                const message =
                    await db.orm.public.Message.first({
                        id: numericMessageId,
                    });

                if (!message) {
                    return;
                }

                if (message.senderId === userId) {
                    return;
                }

                const member =
                    await db.orm.public.ConversationMember.first({
                        conversationId:
                            message.conversationId,
                        userId,
                    });

                if (!member) {
                    return;
                }

                if (message.isDelivered) {
                    return;
                }

                const updatedMessage =
                    await db.orm.public.Message
                        .where({
                            id: numericMessageId,
                        })
                        .update({
                            isDelivered: true,
                        });

                console.log(
                    `MESSAGE DELIVERED ACK: ${numericMessageId} received by User ${userId}`
                );

                console.log(
                    `Message ${numericMessageId} delivered to User ${userId}`
                );

                io.to(
                    `conversation_${message.conversationId}`
                ).emit(
                    "message_delivery_updated",
                    {
                        messageId:
                            updatedMessage.id,
                        conversationId:
                            updatedMessage.conversationId,
                        userId,
                        isDelivered: true,
                    }
                );

            } catch (error) {

                console.error(
                    "Message delivered error:",
                    error
                );
            }
        }
    );

    // ========================================
    // DISCONNECT
    // ========================================

    socket.on(
        "disconnect",
        async () => {

            console.log(
                `User ${userId} disconnected:`,
                socket.id
            );

            try {

                const userSockets =
                    onlineUsers.get(userId);

                if (!userSockets) {
                    return;
                }

                userSockets.delete(
                    socket.id
                );

                if (userSockets.size > 0) {

                    onlineUsers.set(
                        userId,
                        userSockets
                    );

                    return;
                }

                onlineUsers.delete(userId);

                const lastSeen =
                    new Date();

                await db.orm.public.User
                    .where({ id: userId })
                    .update({
                        isOnline: false,
                        lastSeen,
                    });

                console.log(
                    `User ${userId} is offline`
                );

                io.emit(
                    "user_offline",
                    {
                        userId,
                        lastSeen,
                    }
                );

            } catch (error) {

                console.error(
                    "Offline status error:",
                    error
                );
            }
        }
    );
});

// ========================================
// START SERVER
// ========================================

server.listen(PORT, () => {

    console.log(
        `Server running on port ${PORT}`
    );
});