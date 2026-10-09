import { db } from "../prisma/db.js";
import { createAndEmitNotification } from "../services/notification.service.js";

const getIo = () => globalThis.__io;

// Helper: Format single member object
function formatMemberUser(user, member) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isOnline: Boolean(user.isOnline),
        lastSeen: user.lastSeen,
        role: member.role || "MEMBER",
        joinedAt: member.joinedAt || null,
    };
}

// ========================================
// CREATE 1-TO-1 CONVERSATION
// ========================================

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

        // Check if 1-to-1 conversation already exists between currentUserId and targetUserId
        const myMemberships = await db.orm.public.ConversationMember.where({
            userId: currentUserId,
        }).all();

        const allMemberships = await db.orm.public.ConversationMember.all();
        const allConversations = await db.orm.public.Conversation.all();
        const convsMap = new Map(allConversations.map((c) => [c.id, c]));

        let existingConvId = null;
        let myMemberRecord = null;

        for (const myM of myMemberships) {
            const conv = convsMap.get(myM.conversationId);
            if (conv && (conv.type === "DIRECT" || !conv.type)) {
                const otherM = allMemberships.find(
                    (m) => m.conversationId === myM.conversationId && m.userId === targetUserId
                );
                if (otherM) {
                    existingConvId = myM.conversationId;
                    myMemberRecord = myM;
                    break;
                }
            }
        }

        if (existingConvId && myMemberRecord) {
            if (myMemberRecord.isDeleted) {
                await db.orm.public.ConversationMember.where({
                    id: myMemberRecord.id,
                }).update({
                    isDeleted: false,
                    deletedAt: null,
                });
            }

            return res.status(200).json({
                success: true,
                message: "Conversation retrieved successfully",
                conversation: {
                    id: existingConvId,
                },
            });
        }

        // Create new conversation
        const conversation = await db.orm.public.Conversation.create({
            type: "DIRECT",
        });

        // Add current user
        await db.orm.public.ConversationMember.create({
            conversationId: conversation.id,
            userId: currentUserId,
            role: "MEMBER",
            isDeleted: false,
        });

        // Add target user
        await db.orm.public.ConversationMember.create({
            conversationId: conversation.id,
            userId: targetUserId,
            role: "MEMBER",
            isDeleted: false,
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

// ========================================
// CREATE GROUP CONVERSATION
// ========================================

export const createGroup = async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        let { name, memberIds } = req.body;

        // Parse memberIds if passed as JSON string (e.g. from multipart form-data)
        if (typeof memberIds === "string") {
            try {
                memberIds = JSON.parse(memberIds);
            } catch (e) {
                memberIds = [];
            }
        }

        if (!name || typeof name !== "string") {
            return res.status(400).json({
                success: false,
                message: "Group name is required",
            });
        }

        const trimmedName = name.trim();
        if (trimmedName.length < 2 || trimmedName.length > 50) {
            return res.status(400).json({
                success: false,
                message: "Group name must be between 2 and 50 characters",
            });
        }

        if (!Array.isArray(memberIds)) {
            return res.status(400).json({
                success: false,
                message: "memberIds must be an array of user IDs",
            });
        }

        // Clean & deduplicate memberIds
        const cleanIds = Array.from(
            new Set(
                memberIds
                    .map((id) => Number(id))
                    .filter((id) => !Number.isNaN(id) && id > 0 && id !== currentUserId)
            )
        );

        if (cleanIds.length < 1) {
            return res.status(400).json({
                success: false,
                message: "Group must include at least 1 other member",
            });
        }

        // Verify users exist
        const allUsers = await db.orm.public.User.all();
        const usersMap = new Map(allUsers.map((u) => [u.id, u]));

        const creatorUser = usersMap.get(currentUserId);
        if (!creatorUser) {
            return res.status(404).json({
                success: false,
                message: "Creator user not found",
            });
        }

        for (const mId of cleanIds) {
            if (!usersMap.has(mId)) {
                return res.status(404).json({
                    success: false,
                    message: `User with ID ${mId} not found`,
                });
            }
        }

        // Optional group avatar file upload
        let avatarUrl = null;
        if (req.file) {
            avatarUrl = `/uploads/${req.file.filename}`;
        } else if (typeof req.body.avatar === "string") {
            avatarUrl = req.body.avatar.trim() || null;
        }

        // Create Group Conversation
        const conversation = await db.orm.public.Conversation.create({
            type: "GROUP",
            name: trimmedName,
            avatar: avatarUrl,
            createdBy: currentUserId,
        });

        // Add creator as ADMIN
        const creatorMember = await db.orm.public.ConversationMember.create({
            conversationId: conversation.id,
            userId: currentUserId,
            role: "ADMIN",
            joinedAt: new Date().toISOString(),
            isDeleted: false,
        });

        // Add other members as MEMBER
        const membersList = [formatMemberUser(creatorUser, creatorMember)];

        for (const mId of cleanIds) {
            const memberRecord = await db.orm.public.ConversationMember.create({
                conversationId: conversation.id,
                userId: mId,
                role: "MEMBER",
                joinedAt: new Date().toISOString(),
                isDeleted: false,
            });
            membersList.push(formatMemberUser(usersMap.get(mId), memberRecord));
        }

        // Create System Message for group creation
        const systemMessage = await db.orm.public.Message.create({
            conversationId: conversation.id,
            senderId: currentUserId,
            content: `${creatorUser.name} created group "${trimmedName}"`,
            type: "SYSTEM",
            isRead: true,
            isDelivered: true,
        });

        const formattedGroupDetails = {
            id: conversation.id,
            type: "GROUP",
            name: conversation.name,
            avatar: conversation.avatar,
            createdBy: conversation.createdBy,
            memberCount: membersList.length,
            members: membersList,
            lastMessage: {
                id: systemMessage.id,
                content: systemMessage.content,
                senderId: currentUserId,
                createdAt: systemMessage.createdAt,
                type: "SYSTEM",
            },
            unreadCount: 0,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
        };

        // Realtime notifications to all group members
        const allMemberUserIds = [currentUserId, ...cleanIds];

        for (const uId of allMemberUserIds) {
            getIo()?.to(`user_${uId}`).emit("group_created", formattedGroupDetails);
            getIo()?.to(`user_${uId}`).emit("conversation_updated", {
                conversationId: conversation.id,
                lastMessage: formattedGroupDetails.lastMessage,
                unreadCount: 0,
                updatedAt: conversation.updatedAt,
            });
        }

        return res.status(201).json({
            success: true,
            message: "Group created successfully",
            conversation: formattedGroupDetails,
        });
    } catch (error) {
        console.error("Create group error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

// ========================================
// GET MY CONVERSATIONS (DIRECT + GROUP)
// ========================================

export const getMyConversations = async (req, res) => {
    try {
        const currentUserId = req.user.userId;

        console.log("CONVERSATION LIST USER:", currentUserId);

        const memberships = await db.orm.public.ConversationMember.where({
            userId: currentUserId,
        }).all();

        const activeMemberships = memberships.filter((m) => !Boolean(m.isDeleted));

        const allMessages = await db.orm.public.Message.all();
        const allMembers = await db.orm.public.ConversationMember.all();
        const allUsers = await db.orm.public.User.all();
        const usersMap = new Map(allUsers.map((u) => [u.id, u]));

        const deletedForUser = await db.orm.public.MessageDeletion.where({
            userId: currentUserId,
        }).all();
        const deletedMessageIds = new Set(
            deletedForUser.map((entry) => Number(entry.messageId))
        );

        const conversations = [];

        for (const membership of activeMemberships) {
            const conversation = await db.orm.public.Conversation.first({
                id: membership.conversationId,
            });

            if (!conversation) continue;

            const isGroup = conversation.type === "GROUP";

            const convMembers = allMembers.filter(
                (m) => m.conversationId === conversation.id && !Boolean(m.isDeleted)
            );

            // Filter visible messages
            const convMessages = allMessages.filter(
                (msg) => msg.conversationId === conversation.id
            );
            const visibleMessages = convMessages.filter(
                (msg) => !deletedMessageIds.has(Number(msg.id))
            );

            const unreadCount = visibleMessages.filter(
                (msg) => msg.senderId !== currentUserId && !msg.isRead && !msg.isDeleted
            ).length;

            const sortedMessages = [...visibleMessages].sort(
                (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime()
            );

            const lastMsgObj = sortedMessages.length > 0 ? sortedMessages[0] : null;

            const lastMessage = lastMsgObj
                ? {
                      id: lastMsgObj.id,
                      content: lastMsgObj.isDeleted
                          ? "This message was deleted"
                          : lastMsgObj.content ?? null,
                      senderId: lastMsgObj.senderId,
                      createdAt: lastMsgObj.createdAt,
                      type: lastMsgObj.type || "TEXT",
                      attachmentUrl: lastMsgObj.isDeleted ? null : lastMsgObj.attachmentUrl ?? null,
                      attachmentName: lastMsgObj.isDeleted ? null : lastMsgObj.attachmentName ?? null,
                      attachmentType: lastMsgObj.isDeleted ? null : lastMsgObj.attachmentType ?? null,
                      attachmentSize: lastMsgObj.isDeleted ? null : lastMsgObj.attachmentSize ?? null,
                      isDeleted: Boolean(lastMsgObj.isDeleted),
                  }
                : null;

            const updatedAt = lastMessage
                ? lastMessage.createdAt
                : conversation.updatedAt;

            if (isGroup) {
                const formattedMembers = convMembers
                    .map((m) => {
                        const u = usersMap.get(m.userId);
                        return u ? formatMemberUser(u, m) : null;
                    })
                    .filter(Boolean);

                conversations.push({
                    id: conversation.id,
                    type: "GROUP",
                    name: conversation.name || "Unnamed Group",
                    avatar: conversation.avatar || null,
                    createdBy: conversation.createdBy || null,
                    memberCount: formattedMembers.length,
                    members: formattedMembers,
                    lastMessage,
                    unreadCount,
                    createdAt: conversation.createdAt,
                    updatedAt,
                });
            } else {
                const otherMember = convMembers.find((m) => m.userId !== currentUserId);
                if (!otherMember) continue;

                const otherUser = usersMap.get(otherMember.userId);
                if (!otherUser) continue;

                conversations.push({
                    id: conversation.id,
                    type: "DIRECT",
                    otherUser: {
                        id: otherUser.id,
                        name: otherUser.name,
                        email: otherUser.email,
                        avatar: otherUser.avatar,
                        isOnline: Boolean(otherUser.isOnline),
                        lastSeen: otherUser.lastSeen,
                    },
                    lastMessage,
                    unreadCount,
                    createdAt: conversation.createdAt,
                    updatedAt,
                });
            }
        }

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

// ========================================
// GET CONVERSATION DETAILS
// ========================================

export const getConversationDetails = async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const conversationId = Number(req.params.conversationId);

        if (!conversationId || Number.isNaN(conversationId)) {
            return res.status(400).json({
                success: false,
                message: "conversationId is required",
            });
        }

        const membership = await db.orm.public.ConversationMember.first({
            conversationId,
            userId: currentUserId,
        });

        if (!membership || Boolean(membership.isDeleted)) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found",
            });
        }

        const conversation = await db.orm.public.Conversation.first({
            id: conversationId,
        });

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found",
            });
        }

        const isGroup = conversation.type === "GROUP";

        const allMembers = await db.orm.public.ConversationMember.where({
            conversationId,
        }).all();
        const activeMembers = allMembers.filter((m) => !Boolean(m.isDeleted));

        const allUsers = await db.orm.public.User.all();
        const usersMap = new Map(allUsers.map((u) => [u.id, u]));

        const allMessages = await db.orm.public.Message.all();
        const convMessages = allMessages.filter(
            (msg) => msg.conversationId === conversationId
        );

        const unreadCount = convMessages.filter(
            (msg) => msg.senderId !== currentUserId && !msg.isRead && !msg.isDeleted
        ).length;

        const sortedMessages = convMessages.sort(
            (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
        );

        const lastMsgObj = sortedMessages.length > 0 ? sortedMessages[0] : null;

        const lastMessage = lastMsgObj
            ? {
                  id: lastMsgObj.id,
                  content: lastMsgObj.content ?? null,
                  senderId: lastMsgObj.senderId,
                  createdAt: lastMsgObj.createdAt,
                  type: lastMsgObj.type || "TEXT",
                  attachmentUrl: lastMsgObj.attachmentUrl ?? null,
                  attachmentName: lastMsgObj.attachmentName ?? null,
                  attachmentType: lastMsgObj.attachmentType ?? null,
                  attachmentSize: lastMsgObj.attachmentSize ?? null,
              }
            : null;

        const updatedAt = lastMessage
            ? lastMessage.createdAt
            : conversation.updatedAt;

        if (isGroup) {
            const formattedMembers = activeMembers
                .map((m) => {
                    const u = usersMap.get(m.userId);
                    return u ? formatMemberUser(u, m) : null;
                })
                .filter(Boolean);

            return res.status(200).json({
                success: true,
                conversation: {
                    id: conversation.id,
                    type: "GROUP",
                    name: conversation.name || "Unnamed Group",
                    avatar: conversation.avatar || null,
                    createdBy: conversation.createdBy || null,
                    memberCount: formattedMembers.length,
                    members: formattedMembers,
                    lastMessage,
                    unreadCount,
                    createdAt: conversation.createdAt,
                    updatedAt,
                },
            });
        } else {
            const otherMember = activeMembers.find((m) => m.userId !== currentUserId);
            if (!otherMember) {
                return res.status(404).json({
                    success: false,
                    message: "Other user not found",
                });
            }

            const otherUser = usersMap.get(otherMember.userId);
            if (!otherUser) {
                return res.status(404).json({
                    success: false,
                    message: "Other user not found",
                });
            }

            return res.status(200).json({
                success: true,
                conversation: {
                    id: conversation.id,
                    type: "DIRECT",
                    otherUser: {
                        id: otherUser.id,
                        name: otherUser.name,
                        email: otherUser.email,
                        avatar: otherUser.avatar,
                        isOnline: Boolean(otherUser.isOnline),
                        lastSeen: otherUser.lastSeen,
                    },
                    lastMessage,
                    unreadCount,
                    createdAt: conversation.createdAt,
                    updatedAt,
                },
            });
        }
    } catch (error) {
        console.error("Get conversation details error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

// ========================================
// UPDATE GROUP DETAILS (ADMIN ONLY)
// ========================================

export const updateGroup = async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const conversationId = Number(req.params.conversationId);

        if (!conversationId || Number.isNaN(conversationId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid conversationId",
            });
        }

        const conversation = await db.orm.public.Conversation.first({
            id: conversationId,
        });

        if (!conversation || conversation.type !== "GROUP") {
            return res.status(404).json({
                success: false,
                message: "Group conversation not found",
            });
        }

        const membership = await db.orm.public.ConversationMember.first({
            conversationId,
            userId: currentUserId,
        });

        if (!membership || Boolean(membership.isDeleted)) {
            return res.status(403).json({
                success: false,
                message: "You are not a member of this group",
            });
        }

        if (membership.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Only group admins can update group details",
            });
        }

        let { name } = req.body;
        const updateData = {};

        if (name !== undefined) {
            if (typeof name !== "string") {
                return res.status(400).json({
                    success: false,
                    message: "Name must be a string",
                });
            }
            const trimmedName = name.trim();
            if (trimmedName.length < 2 || trimmedName.length > 50) {
                return res.status(400).json({
                    success: false,
                    message: "Group name must be between 2 and 50 characters",
                });
            }
            updateData.name = trimmedName;
        }

        if (req.file) {
            updateData.avatar = `/uploads/${req.file.filename}`;
        } else if (typeof req.body.avatar === "string") {
            updateData.avatar = req.body.avatar.trim() || null;
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: "No fields provided to update",
            });
        }

        updateData.updatedAt = new Date().toISOString();

        const updatedConv = await db.orm.public.Conversation
            .where({ id: conversationId })
            .update(updateData);

        const currentUser = await db.orm.public.User.first({ id: currentUserId });

        let systemContent = `${currentUser ? currentUser.name : "Admin"} updated group details`;
        if (updateData.name) {
            systemContent = `${currentUser ? currentUser.name : "Admin"} changed group name to "${updateData.name}"`;
        }

        const systemMessage = await db.orm.public.Message.create({
            conversationId,
            senderId: currentUserId,
            content: systemContent,
            type: "SYSTEM",
            isRead: true,
            isDelivered: true,
        });

        const updatedPayload = {
            conversationId,
            name: updatedConv.name,
            avatar: updatedConv.avatar,
            updatedAt: updatedConv.updatedAt,
            systemMessage,
        };

        getIo()?.to(`conversation_${conversationId}`).emit("group_updated", updatedPayload);
        getIo()?.to(`conversation_${conversationId}`).emit("new_message", {
            id: systemMessage.id,
            conversationId,
            senderId: currentUserId,
            content: systemMessage.content,
            type: "SYSTEM",
            createdAt: systemMessage.createdAt,
            isDelivered: true,
            isRead: true,
        });

        // Create notifications for active members
        const groupMembers = await db.orm.public.ConversationMember.where({ conversationId }).all();
        const activeMembers = groupMembers.filter((m) => m.userId !== currentUserId && !Boolean(m.isDeleted));
        for (const m of activeMembers) {
            await createAndEmitNotification({
                userId: m.userId,
                type: "GROUP_EVENT",
                title: updatedConv.name || "Group Updated",
                message: systemContent,
                conversationId,
                actorId: currentUserId,
            });
        }

        return res.status(200).json({
            success: true,
            message: "Group updated successfully",
            group: updatedConv,
        });
    } catch (error) {
        console.error("Update group error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

// ========================================
// ADD GROUP MEMBERS (ADMIN ONLY)
// ========================================

export const addGroupMembers = async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const conversationId = Number(req.params.conversationId);

        if (!conversationId || Number.isNaN(conversationId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid conversationId",
            });
        }

        let { userIds } = req.body;
        if (typeof userIds === "string") {
            try {
                userIds = JSON.parse(userIds);
            } catch (e) {
                userIds = [];
            }
        }

        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "userIds array is required",
            });
        }

        const conversation = await db.orm.public.Conversation.first({
            id: conversationId,
        });

        if (!conversation || conversation.type !== "GROUP") {
            return res.status(404).json({
                success: false,
                message: "Group conversation not found",
            });
        }

        const membership = await db.orm.public.ConversationMember.first({
            conversationId,
            userId: currentUserId,
        });

        if (!membership || Boolean(membership.isDeleted)) {
            return res.status(403).json({
                success: false,
                message: "You are not a member of this group",
            });
        }

        if (membership.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Only group admins can add members",
            });
        }

        const cleanUserIds = Array.from(
            new Set(
                userIds
                    .map((id) => Number(id))
                    .filter((id) => !Number.isNaN(id) && id > 0)
            )
        );

        const allUsers = await db.orm.public.User.all();
        const usersMap = new Map(allUsers.map((u) => [u.id, u]));

        const existingMembers = await db.orm.public.ConversationMember.where({
            conversationId,
        }).all();

        const addedUsers = [];

        for (const uId of cleanUserIds) {
            const userObj = usersMap.get(uId);
            if (!userObj) continue;

            const existingMem = existingMembers.find((m) => m.userId === uId);

            if (existingMem) {
                if (Boolean(existingMem.isDeleted)) {
                    await db.orm.public.ConversationMember.where({
                        id: existingMem.id,
                    }).update({
                        isDeleted: false,
                        deletedAt: null,
                        role: "MEMBER",
                        joinedAt: new Date().toISOString(),
                    });
                    addedUsers.push(userObj);
                }
            } else {
                await db.orm.public.ConversationMember.create({
                    conversationId,
                    userId: uId,
                    role: "MEMBER",
                    joinedAt: new Date().toISOString(),
                    isDeleted: false,
                });
                addedUsers.push(userObj);
            }
        }

        if (addedUsers.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Selected users are already members of this group",
            });
        }

        const currentUser = usersMap.get(currentUserId);
        const addedNames = addedUsers.map((u) => u.name).join(", ");

        const systemMessage = await db.orm.public.Message.create({
            conversationId,
            senderId: currentUserId,
            content: `${currentUser ? currentUser.name : "Admin"} added ${addedNames}`,
            type: "SYSTEM",
            isRead: true,
            isDelivered: true,
        });

        // Get fresh active members
        const updatedMembers = await db.orm.public.ConversationMember.where({
            conversationId,
        }).all();
        const activeMembers = updatedMembers.filter((m) => !Boolean(m.isDeleted));

        const formattedMembers = activeMembers
            .map((m) => {
                const u = usersMap.get(m.userId);
                return u ? formatMemberUser(u, m) : null;
            })
            .filter(Boolean);

        const emitPayload = {
            conversationId,
            addedUsers: addedUsers.map((u) => ({ id: u.id, name: u.name, avatar: u.avatar })),
            memberCount: formattedMembers.length,
            members: formattedMembers,
            systemMessage,
        };

        // Emit to room and added users' rooms
        getIo()?.to(`conversation_${conversationId}`).emit("group_member_added", emitPayload);

        for (const u of addedUsers) {
            getIo()?.to(`user_${u.id}`).emit("group_created", {
                id: conversation.id,
                type: "GROUP",
                name: conversation.name,
                avatar: conversation.avatar,
                createdBy: conversation.createdBy,
                memberCount: formattedMembers.length,
                members: formattedMembers,
                lastMessage: systemMessage,
                unreadCount: 1,
                createdAt: conversation.createdAt,
                updatedAt: systemMessage.createdAt,
            });

            await createAndEmitNotification({
                userId: u.id,
                type: "GROUP_EVENT",
                title: conversation.name || "Group",
                message: `You were added to ${conversation.name || "Group"}`,
                conversationId: conversation.id,
                actorId: currentUserId,
            });
        }

        getIo()?.to(`conversation_${conversationId}`).emit("new_message", {
            id: systemMessage.id,
            conversationId,
            senderId: currentUserId,
            content: systemMessage.content,
            type: "SYSTEM",
            createdAt: systemMessage.createdAt,
            isDelivered: true,
            isRead: true,
        });

        return res.status(200).json({
            success: true,
            message: `Added ${addedUsers.length} member(s)`,
            members: formattedMembers,
        });
    } catch (error) {
        console.error("Add group members error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

// ========================================
// REMOVE GROUP MEMBER (ADMIN ONLY)
// ========================================

export const removeGroupMember = async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const conversationId = Number(req.params.conversationId);
        const targetUserId = Number(req.params.userId);

        if (!conversationId || Number.isNaN(conversationId) || !targetUserId || Number.isNaN(targetUserId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid conversationId or userId",
            });
        }

        if (currentUserId === targetUserId) {
            return res.status(400).json({
                success: false,
                message: "Admin cannot remove themselves using this endpoint. Use leave endpoint instead.",
            });
        }

        const conversation = await db.orm.public.Conversation.first({
            id: conversationId,
        });

        if (!conversation || conversation.type !== "GROUP") {
            return res.status(404).json({
                success: false,
                message: "Group conversation not found",
            });
        }

        const adminMembership = await db.orm.public.ConversationMember.first({
            conversationId,
            userId: currentUserId,
        });

        if (!adminMembership || Boolean(adminMembership.isDeleted)) {
            return res.status(403).json({
                success: false,
                message: "You are not a member of this group",
            });
        }

        if (adminMembership.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Only group admins can remove members",
            });
        }

        const targetMembership = await db.orm.public.ConversationMember.first({
            conversationId,
            userId: targetUserId,
        });

        if (!targetMembership || Boolean(targetMembership.isDeleted)) {
            return res.status(404).json({
                success: false,
                message: "Member not found in this group",
            });
        }

        // Mark target member as deleted (removed)
        await db.orm.public.ConversationMember.where({
            id: targetMembership.id,
        }).update({
            isDeleted: true,
            deletedAt: new Date().toISOString(),
        });

        const allUsers = await db.orm.public.User.all();
        const usersMap = new Map(allUsers.map((u) => [u.id, u]));

        const adminUser = usersMap.get(currentUserId);
        const targetUser = usersMap.get(targetUserId);

        const systemMessage = await db.orm.public.Message.create({
            conversationId,
            senderId: currentUserId,
            content: `${adminUser ? adminUser.name : "Admin"} removed ${targetUser ? targetUser.name : "User"}`,
            type: "SYSTEM",
            isRead: true,
            isDelivered: true,
        });

        // Fresh members list
        const updatedMembers = await db.orm.public.ConversationMember.where({
            conversationId,
        }).all();
        const activeMembers = updatedMembers.filter((m) => !Boolean(m.isDeleted));

        const formattedMembers = activeMembers
            .map((m) => {
                const u = usersMap.get(m.userId);
                return u ? formatMemberUser(u, m) : null;
            })
            .filter(Boolean);

        const emitPayload = {
            conversationId,
            removedUserId: targetUserId,
            memberCount: formattedMembers.length,
            members: formattedMembers,
            systemMessage,
        };

        getIo()?.to(`conversation_${conversationId}`).emit("group_member_removed", emitPayload);
        getIo()?.to(`user_${targetUserId}`).emit("group_member_removed", emitPayload);

        await createAndEmitNotification({
            userId: targetUserId,
            type: "GROUP_EVENT",
            title: conversation.name || "Group",
            message: `You were removed from ${conversation.name || "Group"}`,
            conversationId: conversation.id,
            actorId: currentUserId,
        });

        getIo()?.to(`conversation_${conversationId}`).emit("new_message", {
            id: systemMessage.id,
            conversationId,
            senderId: currentUserId,
            content: systemMessage.content,
            type: "SYSTEM",
            createdAt: systemMessage.createdAt,
            isDelivered: true,
            isRead: true,
        });

        return res.status(200).json({
            success: true,
            message: "Member removed successfully",
            members: formattedMembers,
        });
    } catch (error) {
        console.error("Remove group member error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

// ========================================
// LEAVE GROUP
// ========================================

export const leaveGroup = async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const conversationId = Number(req.params.conversationId);

        if (!conversationId || Number.isNaN(conversationId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid conversationId",
            });
        }

        const conversation = await db.orm.public.Conversation.first({
            id: conversationId,
        });

        if (!conversation || conversation.type !== "GROUP") {
            return res.status(404).json({
                success: false,
                message: "Group conversation not found",
            });
        }

        const membership = await db.orm.public.ConversationMember.first({
            conversationId,
            userId: currentUserId,
        });

        if (!membership || Boolean(membership.isDeleted)) {
            return res.status(400).json({
                success: false,
                message: "You are not an active member of this group",
            });
        }

        // Mark user membership as deleted (left)
        await db.orm.public.ConversationMember.where({
            id: membership.id,
        }).update({
            isDeleted: true,
            deletedAt: new Date().toISOString(),
        });

        // Get remaining active members
        const allMembers = await db.orm.public.ConversationMember.where({
            conversationId,
        }).all();
        const activeRemainingMembers = allMembers.filter(
            (m) => !Boolean(m.isDeleted)
        );

        // If the leaving user was ADMIN and no active ADMIN remains, promote the earliest joined member to ADMIN
        if (membership.role === "ADMIN" && activeRemainingMembers.length > 0) {
            const hasAdmin = activeRemainingMembers.some((m) => m.role === "ADMIN");

            if (!hasAdmin) {
                // Sort remaining members by joinedAt / id ascending
                const sortedRemaining = [...activeRemainingMembers].sort(
                    (a, b) =>
                        new Date(a.joinedAt || a.id).getTime() -
                        new Date(b.joinedAt || b.id).getTime()
                );

                const newAdminMember = sortedRemaining[0];
                await db.orm.public.ConversationMember.where({
                    id: newAdminMember.id,
                }).update({
                    role: "ADMIN",
                });

                await createAndEmitNotification({
                    userId: newAdminMember.userId,
                    type: "GROUP_EVENT",
                    title: conversation.name || "Group",
                    message: `You are now an admin of ${conversation.name || "Group"}`,
                    conversationId: conversation.id,
                    actorId: currentUserId,
                });

                console.log(`[BACKEND] PROMOTED USER ${newAdminMember.userId} TO ADMIN FOR GROUP ${conversationId}`);
            }
        }

        const allUsers = await db.orm.public.User.all();
        const usersMap = new Map(allUsers.map((u) => [u.id, u]));

        const leavingUser = usersMap.get(currentUserId);

        const systemMessage = await db.orm.public.Message.create({
            conversationId,
            senderId: currentUserId,
            content: `${leavingUser ? leavingUser.name : "Member"} left the group`,
            type: "SYSTEM",
            isRead: true,
            isDelivered: true,
        });

        // Fresh active members format
        const freshMembers = await db.orm.public.ConversationMember.where({
            conversationId,
        }).all();
        const freshActive = freshMembers.filter((m) => !Boolean(m.isDeleted));

        const formattedMembers = freshActive
            .map((m) => {
                const u = usersMap.get(m.userId);
                return u ? formatMemberUser(u, m) : null;
            })
            .filter(Boolean);

        const emitPayload = {
            conversationId,
            leftUserId: currentUserId,
            memberCount: formattedMembers.length,
            members: formattedMembers,
            systemMessage,
        };

        getIo()?.to(`conversation_${conversationId}`).emit("group_member_left", emitPayload);
        getIo()?.to(`user_${currentUserId}`).emit("conversation_deleted", { conversationId });

        getIo()?.to(`conversation_${conversationId}`).emit("new_message", {
            id: systemMessage.id,
            conversationId,
            senderId: currentUserId,
            content: systemMessage.content,
            type: "SYSTEM",
            createdAt: systemMessage.createdAt,
            isDelivered: true,
            isRead: true,
        });

        return res.status(200).json({
            success: true,
            message: "Left group successfully",
        });
    } catch (error) {
        console.error("Leave group error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

// ========================================
// DELETE CONVERSATION FOR CURRENT USER
// ========================================

export const deleteConversation = async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const conversationId = Number(req.params.conversationId);

        if (!conversationId || Number.isNaN(conversationId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid conversationId",
            });
        }

        const membership = await db.orm.public.ConversationMember.first({
            conversationId,
            userId: currentUserId,
        });

        if (!membership || Boolean(membership.isDeleted)) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found",
            });
        }

        await db.orm.public.ConversationMember.where({
            id: membership.id,
        }).update({
            isDeleted: true,
            deletedAt: new Date().toISOString(),
        });

        console.log(`[BACKEND] CONVERSATION ${conversationId} DELETED FOR USER ${currentUserId}`);

        getIo()?.to(`user_${currentUserId}`).emit("conversation_deleted", {
            conversationId,
        });

        return res.status(200).json({
            success: true,
            message: "Conversation deleted successfully",
        });
    } catch (error) {
        console.error("Delete conversation error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};