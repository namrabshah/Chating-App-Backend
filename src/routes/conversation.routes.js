import express from "express";

import {
    createConversation,
    getMyConversations,
    getConversationDetails,
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

export default router;