import { Router } from "express";
import { protect, authorize } from "../middlewares/auth.middleware.js";
import {
  updateOnlineStatus,
  heartbeat,
  acceptConsultation,
  declineConsultation,
} from "../controllers/lawyer-status.controller.js";

const router = Router();

// Lawyer status routes
router.put("/status", protect, authorize("LAWYER"), updateOnlineStatus);
router.post("/heartbeat", protect, authorize("LAWYER"), heartbeat);

// Consultation accept/decline
router.put("/consultations/:id/accept", protect, authorize("LAWYER"), acceptConsultation);
router.put("/consultations/:id/decline", protect, authorize("LAWYER"), declineConsultation);

export default router;
