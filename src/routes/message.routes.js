import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { getMessages, sendMessage, markAsRead } from "../controllers/message.controller.js";

const router = Router();

router.get("/:id/messages", protect, getMessages);
router.post("/:id/messages", protect, sendMessage);
router.put("/:id/messages/read", protect, markAsRead);

export default router;
