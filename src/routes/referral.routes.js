import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import {
  createReferralCode,
  applyReferral,
  getMyReferrals,
} from "../controllers/referral.controller.js";

const router = Router();

// Mounted at /api/referrals
router.post("/code", protect, createReferralCode);
router.post("/apply", protect, applyReferral);
router.get("/mine", protect, getMyReferrals);

export default router;
