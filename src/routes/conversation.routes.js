import express from "express";

import {
    createConversation,
    createGroup,
    getMyConversations,
    getConversationDetails,
    updateGroup,
    addGroupMembers,
    removeGroupMember,
    leaveGroup,
    deleteConversation,
} from "../controllers/conversation.controller.js";

import { authMiddleware } from "../middleware/auth.middleware.js";
import { uploadSingleAvatar } from "../middleware/upload.middleware.js";

const router = express.Router();

// Direct conversation creation
router.post(
    "/",
    authMiddleware,
    createConversation
);

// Group conversation creation (optional avatar upload)
router.post(
    "/group",
    authMiddleware,
    uploadSingleAvatar,
    createGroup
);

// List user's conversations (direct & group)
router.get(
    "/",
    authMiddleware,
    getMyConversations
);

// Get conversation details (direct or group)
router.get(
    "/:conversationId",
    authMiddleware,
    getConversationDetails
);

// Update group settings (name/avatar) - Admin only
router.patch(
    "/:conversationId/group",
    authMiddleware,
    uploadSingleAvatar,
    updateGroup
);

// Add members to group - Admin only
router.post(
    "/:conversationId/members",
    authMiddleware,
    addGroupMembers
);

// Remove member from group - Admin only
router.delete(
    "/:conversationId/members/:userId",
    authMiddleware,
    removeGroupMember
);

// Leave group - Any active member
router.post(
    "/:conversationId/leave",
    authMiddleware,
    leaveGroup
);

// Delete/Hide conversation for current user
router.delete(
    "/:conversationId",
    authMiddleware,
    deleteConversation
);

export default router;