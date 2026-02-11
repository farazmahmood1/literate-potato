import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import {
  registerPushToken,
  getPreferences,
  updatePreferences,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "../controllers/notification.controller.js";

const router = Router();

// Push token & preferences (existing)
router.post("/token", protect, registerPushToken);
router.get("/preferences", protect, getPreferences);
router.put("/preferences", protect, updatePreferences);

// In-app notification CRUD
router.get("/unread-count", protect, getUnreadCount);
router.put("/read-all", protect, markAllAsRead);
router.get("/", protect, getNotifications);
router.put("/:id/read", protect, markAsRead);
router.delete("/:id", protect, deleteNotification);

export default router;
