import express from "express";
import {
  sendMessage,
  getMessages,
  deleteMessage,
  updateMessage,
  markMessageAsRead,
  getUnreadMessages,
} from "../controllers/message.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/:conversationId", authMiddleware, sendMessage);
router.get("/:conversationId", authMiddleware, getMessages);
router.delete("/:messageId", authMiddleware, deleteMessage);
router.patch("/:messageId", authMiddleware, updateMessage);
router.patch("/:messageId/read", authMiddleware, markMessageAsRead);
router.get("/:conversationId/unread", authMiddleware, getUnreadMessages);

export default router;