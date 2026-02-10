import { Router } from "express";
import { protect, authorize } from "../middlewares/auth.middleware.js";
import {
  createReport,
  blockUser,
  unblockUser,
  getBlockedUsers,
  getReports,
  updateReport,
} from "../controllers/report.controller.js";

const router = Router();

// Reports
router.post("/reports", protect, createReport);
router.get("/reports", protect, authorize("ADMIN"), getReports);
router.put("/reports/:id", protect, authorize("ADMIN"), updateReport);

// Blocks
router.get("/blocks", protect, getBlockedUsers);
router.post("/blocks", protect, blockUser);
router.delete("/blocks/:userId", protect, unblockUser);

export default router;
