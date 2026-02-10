import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { clerk } from "./src/middlewares/auth.middleware.js";

import authRoutes from "./src/routes/auth.routes.js";
import userRoutes from "./src/routes/user.routes.js";
import lawyerRoutes from "./src/routes/lawyer.routes.js";
import consultationRoutes from "./src/routes/consultation.routes.js";
import paymentRoutes from "./src/routes/payment.routes.js";
import otpRoutes from "./src/routes/otp.routes.js";
import dashboardRoutes from "./src/routes/dashboard.routes.js";
import aiProfileRoutes from "./src/routes/ai-profile.routes.js";
import messageRoutes from "./src/routes/message.routes.js";
import lawyerStatusRoutes from "./src/routes/lawyer-status.routes.js";
import receiptRoutes, { summaryRouter } from "./src/routes/receipt.routes.js";
import notificationRoutes from "./src/routes/notification.routes.js";
import serviceOfferRoutes, { serviceOfferRouter } from "./src/routes/service-offer.routes.js";
import savedLawyerRoutes from "./src/routes/saved-lawyer.routes.js";
import reportRoutes from "./src/routes/report.routes.js";
import stripeConnectRoutes from "./src/routes/stripe-connect.routes.js";
import referralRoutes from "./src/routes/referral.routes.js";
import scheduleRoutes from "./src/routes/schedule.routes.js";
import fileUploadRoutes from "./src/routes/file-upload.routes.js";
import adminRoutes from "./src/routes/admin.routes.js";
import callRoutes from "./src/routes/call.routes.js";
import jobPostRoutes from "./src/routes/job-post.routes.js";
import disputeRoutes from "./src/routes/dispute.routes.js";
import webRegisterRoutes from "./src/routes/web-register.routes.js";
import { errorHandler, notFound } from "./src/middlewares/error.middleware.js";

const app = express();

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? process.env.CLIENT_URL
    : true, // Allow all origins in development (mobile, web, etc.)
  credentials: true,
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Admin routes registered BEFORE Clerk middleware (uses its own JWT auth)
app.use("/api/admin", adminRoutes);

app.use(clerk);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/lawyers", lawyerRoutes);
app.use("/api/consultations", consultationRoutes);
app.use("/api/consultations", messageRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/otp", otpRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/ai-profile", aiProfileRoutes);
app.use("/api/lawyers", lawyerStatusRoutes);
app.use("/api/payments", receiptRoutes);
app.use("/api/consultations", summaryRouter);
app.use("/api/notifications", notificationRoutes);
app.use("/api/consultations", serviceOfferRoutes);
app.use("/api/service-offers", serviceOfferRouter);
app.use("/api/lawyers", savedLawyerRoutes);
app.use("/api", reportRoutes);
app.use("/api/stripe-connect", stripeConnectRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/schedule", scheduleRoutes);
app.use("/api/files", fileUploadRoutes);
app.use("/api/calls", callRoutes);
app.use("/api/job-posts", jobPostRoutes);
app.use("/api/disputes", disputeRoutes);
app.use("/api/web-register", webRegisterRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

export default app;
