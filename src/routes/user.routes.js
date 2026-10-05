import express from "express";
import {
  getMyProfile,
  updateMyProfile,
  searchUsers,
} from "../controllers/user.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { uploadSingleAvatar } from "../middleware/upload.middleware.js";

const router = express.Router();

router.get("/me", authMiddleware, getMyProfile);
router.patch("/me", authMiddleware, uploadSingleAvatar, updateMyProfile);
router.get("/search", authMiddleware, searchUsers);

export default router;