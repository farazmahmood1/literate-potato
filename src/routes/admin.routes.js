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
  getRecentSignups,
  sendBroadcastNotification,
  getBroadcastHistory,
  getAnalytics,
  getCalendarData,
  getTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  getGeographicData,
  getTopLawyers,
  getVisitorStats,
} from "../controllers/admin.controller.js";
import {
  getAdminTickets,
  getAdminTicket,
  adminReply,
  updateTicketStatus,
} from "../controllers/admin-ticket.controller.js";

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
router.get("/tickets", getAdminTickets);
router.get("/tickets/:id", getAdminTicket);
router.post("/tickets/:id/replies", adminReply);
router.put("/tickets/:id/status", updateTicketStatus);
router.get("/signups", getRecentSignups);
router.post("/notifications/broadcast", sendBroadcastNotification);
router.get("/notifications/broadcast", getBroadcastHistory);
router.get("/analytics", getAnalytics);
router.get("/calendar", getCalendarData);
router.get("/todos", getTodos);
router.post("/todos", createTodo);
router.put("/todos/:id", updateTodo);
router.delete("/todos/:id", deleteTodo);
router.get("/geography", getGeographicData);
router.get("/top-lawyers", getTopLawyers);
router.get("/visitors", getVisitorStats);

export default router;
