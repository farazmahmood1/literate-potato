import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import {
  registerPushToken,
  getPreferences,
  updatePreferences,
} from "../controllers/notification.controller.js";

const router = Router();

router.post("/token", protect, registerPushToken);
router.get("/preferences", protect, getPreferences);
router.put("/preferences", protect, updatePreferences);

export default router;
