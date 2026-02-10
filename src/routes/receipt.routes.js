import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { getReceipt, getConsultationSummary } from "../controllers/receipt.controller.js";

const router = Router();

// Receipt routes — mounted at /api/payments
router.get("/:id/receipt", protect, getReceipt);

export default router;

// Summary route — needs to be mounted separately at /api/consultations
export const summaryRouter = Router();
summaryRouter.get("/:id/summary", protect, getConsultationSummary);
