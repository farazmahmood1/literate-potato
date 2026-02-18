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
  getNotificationStats,
  getAllNotifications,
  deleteBroadcast,
  resendBroadcast,
  deleteAdminNotification,
  getAnalytics,
  getCalendarData,
  getTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  getGeographicData,
  getTopLawyers,
  getVisitorStats,
  getAdminReviews,
  approveReview,
  rejectReview,
} from "../controllers/admin.controller.js";
import {
  getAdminTickets,
  getAdminTicket,
  adminReply,
  updateTicketStatus,
} from "../controllers/admin-ticket.controller.js";
import {
  getCareerPostings,
  getCareerPosting,
  createCareerPosting,
  updateCareerPosting,
  deleteCareerPosting,
  getApplications,
  deleteApplication,
} from "../controllers/career.controller.js";

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
router.get("/notifications/stats", getNotificationStats);
router.get("/notifications/all", getAllNotifications);
router.post("/notifications/broadcast", sendBroadcastNotification);
router.get("/notifications/broadcast", getBroadcastHistory);
router.delete("/notifications/broadcast/:id", deleteBroadcast);
router.post("/notifications/broadcast/:id/resend", resendBroadcast);
router.delete("/notifications/:id", deleteAdminNotification);
router.get("/analytics", getAnalytics);
router.get("/calendar", getCalendarData);
router.get("/todos", getTodos);
router.post("/todos", createTodo);
router.put("/todos/:id", updateTodo);
router.delete("/todos/:id", deleteTodo);
router.get("/geography", getGeographicData);
router.get("/top-lawyers", getTopLawyers);
router.get("/visitors", getVisitorStats);
router.get("/reviews", getAdminReviews);
router.put("/reviews/:id/approve", approveReview);
router.put("/reviews/:id/reject", rejectReview);
router.get("/careers", getCareerPostings);
router.get("/careers/:id", getCareerPosting);
router.post("/careers", createCareerPosting);
router.put("/careers/:id", updateCareerPosting);
router.delete("/careers/:id", deleteCareerPosting);
router.get("/careers/:id/applications", getApplications);
router.delete("/careers/applications/:id", deleteApplication);

export default router;
