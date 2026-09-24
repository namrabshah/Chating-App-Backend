import express from "express";
import {
  sendMessage,
  getMessages,
  deleteMessage,
  updateMessage,
  markMessageAsRead,
  markConversationAsRead,
  getUnreadMessages,
} from "../controllers/message.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  upload,
  handleUploadError,
} from "../middleware/upload.middleware.js";

const router = express.Router();

const uploadSingleFile = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      return handleUploadError(err, req, res, next);
    }
    return next();
  });
};

router.post(
  "/:conversationId",
  authMiddleware,
  uploadSingleFile,
  sendMessage
);
router.get("/:conversationId", authMiddleware, getMessages);
router.delete("/:messageId", authMiddleware, deleteMessage);
router.patch("/:messageId", authMiddleware, updateMessage);
router.patch("/:conversationId/read", authMiddleware, markConversationAsRead);
router.patch("/:messageId/read", authMiddleware, markMessageAsRead);
router.get("/:conversationId/unread", authMiddleware, getUnreadMessages);

export default router;