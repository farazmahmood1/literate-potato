import { Router } from "express";
import { getDashboardSummary, getLawyerDashboardSummary } from "../controllers/dashboard.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(protect);

router.get("/summary", getDashboardSummary);
router.get("/lawyer-summary", getLawyerDashboardSummary);

export default router;
