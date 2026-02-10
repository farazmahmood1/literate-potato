import { Router } from "express";
import {
  createConnectAccount,
  getOnboardingUrl,
  getAccountStatus,
  getDashboardLink,
} from "../controllers/stripe-connect.controller.js";
import { protect, authorize } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(protect);
router.use(authorize("LAWYER"));

router.post("/", createConnectAccount);
router.get("/onboarding", getOnboardingUrl);
router.get("/status", getAccountStatus);
router.get("/dashboard", getDashboardLink);

export default router;
