import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import {
  scheduleConsultation,
  getScheduledConsultations,
  cancelScheduledConsultation,
} from "../controllers/schedule.controller.js";

const router = Router();

// Mounted at /api/schedule
router.post("/", protect, scheduleConsultation);
router.get("/", protect, getScheduledConsultations);
router.put("/:id/cancel", protect, cancelScheduledConsultation);

export default router;
