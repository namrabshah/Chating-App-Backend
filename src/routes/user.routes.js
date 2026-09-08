import express from "express";

import { getMyProfile,  updateMyProfile, searchUsers} from "../controllers/user.controller.js";

import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/me", authMiddleware, getMyProfile);
router.patch("/me", authMiddleware, updateMyProfile);
router.get("/search", authMiddleware, searchUsers);

export default router;