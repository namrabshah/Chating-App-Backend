import express from "express";

import {
    createConversation,
    getMyConversations,
    getConversationDetails,
    deleteConversation,
} from "../controllers/conversation.controller.js";

import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post(
    "/",
    authMiddleware,
    createConversation
);

router.get(
    "/",
    authMiddleware,
    getMyConversations
);

router.get(
    "/:conversationId",
    authMiddleware,
    getConversationDetails
);

router.delete(
    "/:conversationId",
    authMiddleware,
    deleteConversation
);

export default router;