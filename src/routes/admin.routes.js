import { Router } from "express";
import { adminProtect } from "../middlewares/admin-auth.middleware.js";
import { adminLogin } from "../controllers/admin-auth.controller.js";
import {
  getDashboardStats,
  getUsers,
  getLawyers,
  verifyLawyer,
  getConsultations,
  getPayments,
  getReports,
  updateReport,
  toggleUserSuspension,
  getAdminDisputes,
  getAdminDisputeDetail,
  resolveDispute,
  addAdminNote,
} from "../controllers/admin.controller.js";

const router = Router();

// Public admin route — login
router.post("/login", adminLogin);

// All other admin routes require JWT admin auth
router.use(adminProtect);

router.get("/stats", getDashboardStats);
router.get("/users", getUsers);
router.put("/users/:id/suspend", toggleUserSuspension);
router.get("/lawyers", getLawyers);
router.put("/lawyers/:id/verify", verifyLawyer);
router.get("/consultations", getConsultations);
router.get("/payments", getPayments);
router.get("/reports", getReports);
router.put("/reports/:id", updateReport);
router.get("/disputes", getAdminDisputes);
router.get("/disputes/:id", getAdminDisputeDetail);
router.put("/disputes/:id/resolve", resolveDispute);
router.post("/disputes/:id/note", addAdminNote);

export default router;
