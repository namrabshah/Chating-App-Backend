import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import conversationRoutes from "./routes/conversation.routes.js";
import messageRoutes from "./routes/message.routes.js";
import { UPLOADS_DIR } from "./middleware/upload.middleware.js";

const app = express();

app.use(cors());
app.use(express.json());

// Serve uploaded attachments at /uploads
app.use("/uploads", express.static(UPLOADS_DIR));

app.get("/", (req, res) => {
  res.json({
    message: "Chat API is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageRoutes);

export default app;