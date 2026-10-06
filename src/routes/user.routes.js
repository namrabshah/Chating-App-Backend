import express from "express";
import {
  getMyProfile,
  updateMyProfile,
  searchUsers,
  blockUser,
  unblockUser,
  getBlockStatus,
  getBlockedUsers,
} from "../controllers/user.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { uploadSingleAvatar } from "../middleware/upload.middleware.js";

const router = express.Router();

router.get("/me", authMiddleware, getMyProfile);
router.patch("/me", authMiddleware, uploadSingleAvatar, updateMyProfile);
router.get("/search", authMiddleware, searchUsers);

router.get("/blocked", authMiddleware, getBlockedUsers);
router.post("/:userId/block", authMiddleware, blockUser);
router.delete("/:userId/block", authMiddleware, unblockUser);
router.get("/:userId/block-status", authMiddleware, getBlockStatus);

export default router;