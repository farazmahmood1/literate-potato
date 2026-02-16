import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { getMessages, sendMessage, markAsRead, getUnreadCount } from "../controllers/message.controller.js";

const router = Router();

// Static route before :id param routes
router.get("/unread-message-count", protect, getUnreadCount);

router.get("/:id/messages", protect, getMessages);
router.post("/:id/messages", protect, sendMessage);
router.put("/:id/messages/read", protect, markAsRead);

export default router;
