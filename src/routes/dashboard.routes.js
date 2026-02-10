import { Router } from "express";
import { getDashboardSummary, getLawyerDashboardSummary, getLawyerAnalytics } from "../controllers/dashboard.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(protect);

router.get("/summary", getDashboardSummary);
router.get("/lawyer-summary", getLawyerDashboardSummary);
router.get("/lawyer-analytics", getLawyerAnalytics);

export default router;
