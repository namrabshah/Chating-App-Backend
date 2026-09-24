import { db } from "../prisma/db.js";

export const createConversation = async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "userId is required",
            });
        }

        const targetUserId = Number(userId);

        if (currentUserId === targetUserId) {
            return res.status(400).json({
                success: false,
                message: "You cannot chat with yourself",
            });
        }

        // Check target user
        const targetUser = await db.orm.public.User.first({
            id: targetUserId,
        });

        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Create conversation
       const conversation = await db.orm.public.Conversation.create({});

        // Add current user
        await db.orm.public.ConversationMember.create({
            conversationId: conversation.id,
            userId: currentUserId,
        });

        // Add target user
        await db.orm.public.ConversationMember.create({
            conversationId: conversation.id,
            userId: targetUserId,
        });

        return res.status(201).json({
            success: true,
            message: "Conversation created successfully",
            conversation: {
                id: conversation.id,
            },
        });
    } catch (error) {
        console.error("Create conversation error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const getMyConversations = async (req, res) => {
    try {
        const currentUserId = req.user.userId;

        console.log("CONVERSATION LIST USER:", currentUserId);

        // Get all conversations where current user is a member
        const memberships =
            await db.orm.public.ConversationMember
                .where({
                    userId: currentUserId,
                })
                .all();

        const allMessages = await db.orm.public.Message.all();
        const allMembers = await db.orm.public.ConversationMember.all();
        const allUsers = await db.orm.public.User.all();

        const conversations = [];

        for (const membership of memberships) {
            const conversation =
                await db.orm.public.Conversation.first({
                    id: membership.conversationId,
                });

            if (!conversation) {
                continue;
            }

            // Find other member
            const convMembers = allMembers.filter(
                (m) => m.conversationId === conversation.id
            );
            const otherMember = convMembers.find(
                (m) => m.userId !== currentUserId
            );

            if (!otherMember) {
                continue;
            }

            const otherUser = allUsers.find(
                (u) => u.id === otherMember.userId
            );

            if (!otherUser) {
                continue;
            }

            // Messages for this conversation
            const convMessages = allMessages.filter(
                (msg) => msg.conversationId === conversation.id
            );

            // Calculate unread count (senderId != currentUserId AND isRead = false)
            const unreadCount = convMessages.filter(
                (msg) => msg.senderId !== currentUserId && !msg.isRead
            ).length;

            // Get last message
            const sortedMessages = convMessages.sort(
                (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime()
            );

            const lastMessage =
                sortedMessages.length > 0
                    ? {
                          id: sortedMessages[0].id,
                          content: sortedMessages[0].content ?? null,
                          senderId: sortedMessages[0].senderId,
                          createdAt: sortedMessages[0].createdAt,
                          attachmentUrl:
                              sortedMessages[0].attachmentUrl ?? null,
                          attachmentName:
                              sortedMessages[0].attachmentName ?? null,
                          attachmentType:
                              sortedMessages[0].attachmentType ?? null,
                          attachmentSize:
                              sortedMessages[0].attachmentSize ?? null,
                      }
                    : null;

            const updatedAt = lastMessage
                ? lastMessage.createdAt
                : conversation.updatedAt;

            console.log("CONVERSATION:", conversation.id);
            console.log("UNREAD COUNT:", unreadCount);
            console.log("LAST MESSAGE:", lastMessage);
            console.log("[BACKEND] UNREAD COUNT CALCULATED", {
                conversationId: conversation.id,
                userId: currentUserId,
                unreadCount,
            });

            conversations.push({
                id: conversation.id,
                otherUser: {
                    id: otherUser.id,
                    name: otherUser.name,
                    email: otherUser.email,
                    avatar: otherUser.avatar,
                    isOnline: otherUser.isOnline,
                    lastSeen: otherUser.lastSeen,
                },
                lastMessage,
                unreadCount,
                createdAt: conversation.createdAt,
                updatedAt,
            });
        }

        // Sort conversations by latest active message / updatedAt descending
        conversations.sort(
            (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime()
        );

        return res.status(200).json({
            success: true,
            conversations,
        });
    } catch (error) {
        console.error("Get conversations error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const getConversationDetails = async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const conversationId = Number(req.params.conversationId);

        if (!conversationId) {
            return res.status(400).json({
                success: false,
                message: "conversationId is required",
            });
        }

        // Check whether current user is a member
        const membership =
            await db.orm.public.ConversationMember.first({
                conversationId,
                userId: currentUserId,
            });

        if (!membership) {
            return res.status(403).json({
                success: false,
                message: "You are not a member of this conversation",
            });
        }

        // Get conversation
        const conversation =
            await db.orm.public.Conversation.first({
                id: conversationId,
            });

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found",
            });
        }

        // Get all members
        const members =
            await db.orm.public.ConversationMember
                .where({
                    conversationId,
                })
                .all();

        // Find other user
        const otherMember = members.find(
            (member) => member.userId !== currentUserId
        );

        if (!otherMember) {
            return res.status(404).json({
                success: false,
                message: "Other user not found",
            });
        }

        // Get other user's details
        const otherUser =
            await db.orm.public.User.first({
                id: otherMember.userId,
            });

        if (!otherUser) {
            return res.status(404).json({
                success: false,
                message: "Other user not found",
            });
        }

        const allMessages = await db.orm.public.Message.all();
        const convMessages = allMessages.filter(
            (msg) => msg.conversationId === conversationId
        );

        const unreadCount = convMessages.filter(
            (msg) => msg.senderId !== currentUserId && !msg.isRead
        ).length;

        const sortedMessages = convMessages.sort(
            (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
        );

        const lastMessage =
            sortedMessages.length > 0
                ? {
                      id: sortedMessages[0].id,
                      content: sortedMessages[0].content ?? null,
                      senderId: sortedMessages[0].senderId,
                      createdAt: sortedMessages[0].createdAt,
                      attachmentUrl:
                          sortedMessages[0].attachmentUrl ?? null,
                      attachmentName:
                          sortedMessages[0].attachmentName ?? null,
                      attachmentType:
                          sortedMessages[0].attachmentType ?? null,
                      attachmentSize:
                          sortedMessages[0].attachmentSize ?? null,
                  }
                : null;

        const updatedAt = lastMessage
            ? lastMessage.createdAt
            : conversation.updatedAt;

        return res.status(200).json({
            success: true,
            conversation: {
                id: conversation.id,

                otherUser: {
                    id: otherUser.id,
                    name: otherUser.name,
                    email: otherUser.email,
                    avatar: otherUser.avatar,
                    isOnline: otherUser.isOnline,
                    lastSeen: otherUser.lastSeen,
                },

                lastMessage,
                unreadCount,
                createdAt: conversation.createdAt,
                updatedAt,
            },
        });

    } catch (error) {
        console.error("Get conversation details error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};