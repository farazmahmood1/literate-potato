import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import {
  notifyVerificationApproved,
  notifyVerificationRejected,
  notifyDisputeResolved,
  sendPushNotification,
  createInAppNotification,
} from "../services/notification.service.js";
import { issueStripeRefund } from "../services/refund.service.js";

// @desc    Get dashboard stats
// @route   GET /api/admin/stats
export const getDashboardStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalUsers,
    totalLawyers,
    totalClients,
    activeConsultations,
    consultationsToday,
    pendingApprovals,
    totalRevenueResult,
    avgRatingResult,
    recentUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "LAWYER" } }),
    prisma.user.count({ where: { role: "CLIENT" } }),
    prisma.consultation.count({ where: { status: { in: ["ACTIVE", "TRIAL"] } } }),
    prisma.consultation.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.lawyerProfile.count({ where: { verificationStatus: "PENDING" } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { status: "SUCCEEDED" } }),
    prisma.review.aggregate({ _avg: { rating: true } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        isVerified: true,
        avatar: true,
        createdAt: true,
        _count: { select: { consultationsAsClient: true } },
        lawyerProfile: {
          select: {
            verificationStatus: true,
            licenseImage: true,
            idImage: true,
            barNumber: true,
            licenseState: true,
            specializations: true,
          },
        },
      },
    }),
  ]);

  // Dispute counts
  const [openDisputes, escalatedDisputes] = await Promise.all([
    prisma.dispute.count({ where: { status: { in: ["OPEN", "LAWYER_RESPONSE", "MEDIATION", "ESCALATED"] } } }),
    prisma.dispute.count({ where: { status: "ESCALATED" } }),
  ]);

  res.json({
    success: true,
    data: {
      totalUsers,
      totalLawyers,
      totalClients,
      activeConsultations,
      consultationsToday,
      pendingApprovals,
      totalRevenue: (totalRevenueResult._sum.amount || 0) / 100,
      avgRating: Number((avgRatingResult._avg.rating || 0).toFixed(1)),
      recentUsers,
      openDisputes,
      escalatedDisputes,
    },
  });
});

// @desc    Get all users (paginated)
// @route   GET /api/admin/users
export const getUsers = asyncHandler(async (req, res) => {
  const { search, role, status, page = 1, limit = 20 } = req.query;
  const where = {};

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  if (role) where.role = role;
  if (status === "active") where.lastActiveAt = { gte: new Date(Date.now() - 30 * 86400000) };
  if (status === "inactive") {
    where.OR = [
      { lastActiveAt: { lt: new Date(Date.now() - 30 * 86400000) } },
      { lastActiveAt: null },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        lawyerProfile: {
          select: {
            id: true,
            verificationStatus: true,
            specializations: true,
            rating: true,
            licenseImage: true,
            idImage: true,
            barNumber: true,
            licenseState: true,
          },
        },
        _count: { select: { consultationsAsClient: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.user.count({ where }),
  ]);

  res.json({
    success: true,
    data: users,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// @desc    Get all lawyers (paginated, with profile data)
// @route   GET /api/admin/lawyers
export const getLawyers = asyncHandler(async (req, res) => {
  const { search, verification, state, specializations, sort, minRating, page = 1, limit = 20 } = req.query;
  const where = {};

  if (search) {
    where.user = {
      OR: [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
      ],
    };
  }
  if (verification) where.verificationStatus = verification;
  if (state) where.licenseState = state;
  if (specializations) {
    const specArray = specializations.split(",").map((s) => s.trim()).filter(Boolean);
    if (specArray.length > 0) where.specializations = { hasSome: specArray };
  }
  if (minRating) where.rating = { gte: Number(minRating) };

  // Dynamic sorting
  let orderBy = { createdAt: "desc" };
  if (sort === "rating_desc") orderBy = { rating: "desc" };
  else if (sort === "rating_asc") orderBy = { rating: "asc" };
  else if (sort === "consultations") orderBy = { consultations: { _count: "desc" } };
  else if (sort === "newest") orderBy = { createdAt: "desc" };

  const skip = (Number(page) - 1) * Number(limit);
  const [lawyers, total] = await Promise.all([
    prisma.lawyerProfile.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true, email: true, phone: true, avatar: true, createdAt: true } },
        _count: { select: { consultations: true, reviews: true } },
      },
      orderBy,
      skip,
      take: Number(limit),
    }),
    prisma.lawyerProfile.count({ where }),
  ]);

  res.json({
    success: true,
    data: lawyers,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// @desc    Update lawyer verification status
// @route   PUT /api/admin/lawyers/:id/verify
export const verifyLawyer = asyncHandler(async (req, res) => {
  const { status } = req.body; // VERIFIED, REJECTED
  const lawyer = await prisma.lawyerProfile.update({
    where: { id: req.params.id },
    data: { verificationStatus: status },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });

  // Push notification for verification status change
  if (status === "VERIFIED") {
    notifyVerificationApproved(lawyer.user.id);
  } else if (status === "REJECTED") {
    notifyVerificationRejected(lawyer.user.id);
  }

  res.json({ success: true, data: lawyer });
});

// @desc    Get all consultations (paginated)
// @route   GET /api/admin/consultations
export const getConsultations = asyncHandler(async (req, res) => {
  const { status, category, page = 1, limit = 20 } = req.query;
  const where = {};
  if (status) where.status = status;
  if (category) where.category = category;

  const skip = (Number(page) - 1) * Number(limit);
  const [consultations, total] = await Promise.all([
    prisma.consultation.findMany({
      where,
      include: {
        client: { select: { firstName: true, lastName: true } },
        lawyer: { include: { user: { select: { firstName: true, lastName: true } } } },
        payment: { select: { amount: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.consultation.count({ where }),
  ]);

  res.json({
    success: true,
    data: consultations,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// @desc    Get all payments (paginated)
// @route   GET /api/admin/payments
export const getPayments = asyncHandler(async (req, res) => {
  const { status, from, to, page = 1, limit = 20 } = req.query;
  const where = {};
  if (status) where.status = status;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = toDate;
    }
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [payments, total, totalAmount] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        consultation: {
          include: {
            client: { select: { firstName: true, lastName: true } },
            lawyer: { include: { user: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({ _sum: { amount: true }, where }),
  ]);

  res.json({
    success: true,
    data: payments,
    totalAmount: (totalAmount._sum.amount || 0) / 100,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// @desc    Get all reports (paginated)
// @route   GET /api/admin/reports
export const getReports = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const where = {};
  if (status) where.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      include: {
        reporter: { select: { firstName: true, lastName: true } },
        reported: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.report.count({ where }),
  ]);

  res.json({
    success: true,
    data: reports,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// @desc    Update report status
// @route   PUT /api/admin/reports/:id
export const updateReport = asyncHandler(async (req, res) => {
  const { status, resolution } = req.body;
  const report = await prisma.report.update({
    where: { id: req.params.id },
    data: { status, resolution },
  });
  res.json({ success: true, data: report });
});

// @desc    Suspend / unsuspend user
// @route   PUT /api/admin/users/:id/suspend
export const toggleUserSuspension = asyncHandler(async (req, res) => {
  const { suspended } = req.body;
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { suspended: !!suspended },
    select: { id: true, firstName: true, lastName: true, email: true, suspended: true },
  });
  res.json({ success: true, data: user });
});

// ──── Dispute Management ────

const ADMIN_DISPUTE_INCLUDE = {
  filedBy: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
  filedAgainst: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
  consultation: {
    select: {
      id: true,
      category: true,
      description: true,
      status: true,
      createdAt: true,
      payment: { select: { id: true, amount: true, status: true, stripePaymentId: true } },
    },
  },
  evidence: {
    include: { submittedBy: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
  },
  timeline: {
    include: { actor: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
  },
};

// @desc    Get all disputes (paginated)
// @route   GET /api/admin/disputes
export const getAdminDisputes = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const where = {};
  if (status) where.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [disputes, total] = await Promise.all([
    prisma.dispute.findMany({
      where,
      include: {
        filedBy: { select: { firstName: true, lastName: true } },
        filedAgainst: { select: { firstName: true, lastName: true } },
        consultation: {
          select: {
            id: true,
            category: true,
            payment: { select: { amount: true, status: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.dispute.count({ where }),
  ]);

  res.json({
    success: true,
    data: disputes,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// @desc    Get single dispute detail (admin)
// @route   GET /api/admin/disputes/:id
export const getAdminDisputeDetail = asyncHandler(async (req, res) => {
  const dispute = await prisma.dispute.findUnique({
    where: { id: req.params.id },
    include: ADMIN_DISPUTE_INCLUDE,
  });

  if (!dispute) { res.status(404); throw new Error("Dispute not found"); }

  res.json({ success: true, data: dispute });
});

// @desc    Admin resolves a dispute
// @route   PUT /api/admin/disputes/:id/resolve
export const resolveDispute = asyncHandler(async (req, res) => {
  const { resolutionType, resolutionNote, refundAmount } = req.body;

  if (!resolutionType || !resolutionNote) {
    res.status(400);
    throw new Error("resolutionType and resolutionNote are required");
  }

  const dispute = await prisma.dispute.findUnique({
    where: { id: req.params.id },
    include: { consultation: { select: { id: true, payment: true } } },
  });

  if (!dispute) { res.status(404); throw new Error("Dispute not found"); }
  if (dispute.status === "RESOLVED" || dispute.status === "CLOSED") {
    res.status(400);
    throw new Error("Dispute is already resolved or closed");
  }

  let stripeRefundId = null;
  let actualRefundAmount = null;

  // Process refund if applicable
  if (["FULL_REFUND", "PARTIAL_REFUND"].includes(resolutionType) && dispute.consultation?.payment?.status === "SUCCEEDED") {
    const paymentAmount = dispute.consultation.payment.amount;

    if (resolutionType === "FULL_REFUND") {
      actualRefundAmount = paymentAmount;
    } else if (refundAmount && refundAmount > 0 && refundAmount <= paymentAmount) {
      actualRefundAmount = refundAmount;
    } else {
      res.status(400);
      throw new Error("Invalid refund amount for partial refund");
    }

    try {
      const refund = await issueStripeRefund(
        dispute.consultation.id,
        resolutionType === "PARTIAL_REFUND" ? actualRefundAmount : null,
      );
      stripeRefundId = refund.id;
    } catch (err) {
      res.status(500);
      throw new Error(`Stripe refund failed: ${err.message}`);
    }
  }

  const updated = await prisma.dispute.update({
    where: { id: dispute.id },
    data: {
      status: "RESOLVED",
      resolutionType,
      resolutionNote,
      refundAmount: actualRefundAmount,
      stripeRefundId,
      resolvedById: req.user?.id || null,
      resolvedAt: new Date(),
    },
    include: ADMIN_DISPUTE_INCLUDE,
  });

  // Add timeline event
  await prisma.disputeEvent.create({
    data: {
      disputeId: dispute.id,
      actorId: req.user?.id || null,
      action: "admin_resolved",
      description: `Admin resolved: ${resolutionType}${actualRefundAmount ? ` — $${(actualRefundAmount / 100).toFixed(2)} refunded` : ""}`,
      metadata: { resolutionType, refundAmount: actualRefundAmount, stripeRefundId },
    },
  });

  // Notify both parties
  try {
    notifyDisputeResolved(dispute.filedById, resolutionType, actualRefundAmount, dispute.id);
    notifyDisputeResolved(dispute.filedAgainstId, resolutionType, actualRefundAmount, dispute.id);
  } catch {}

  // Socket events
  try {
    const { getIO } = await import("../config/socket.js");
    const io = getIO();
    const payload = { disputeId: dispute.id, resolutionType, refundAmount: actualRefundAmount };
    io.to(`user:${dispute.filedById}`).emit("dispute-resolved", payload);
    io.to(`user:${dispute.filedAgainstId}`).emit("dispute-resolved", payload);
  } catch {}

  res.json({ success: true, data: updated });
});

// @desc    Admin adds note to dispute timeline
// @route   POST /api/admin/disputes/:id/note
export const addAdminNote = asyncHandler(async (req, res) => {
  const { note } = req.body;
  if (!note) { res.status(400); throw new Error("Note is required"); }

  const dispute = await prisma.dispute.findUnique({ where: { id: req.params.id } });
  if (!dispute) { res.status(404); throw new Error("Dispute not found"); }

  const event = await prisma.disputeEvent.create({
    data: {
      disputeId: dispute.id,
      actorId: req.user?.id || null,
      action: "admin_note",
      description: note,
    },
    include: { actor: { select: { firstName: true, lastName: true } } },
  });

  res.status(201).json({ success: true, data: event });
});

// ──── Recent Signups (with date filter) ────

// @desc    Get recent signups with optional date range and filters
// @route   GET /api/admin/signups
export const getRecentSignups = asyncHandler(async (req, res) => {
  const { from, to, limit = 10, state, consultations, specializations } = req.query;
  const where = {};

  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = toDate;
    }
  }

  // State filter — matches lawyerProfile.licenseState or registrationState
  if (state) {
    where.OR = [
      { lawyerProfile: { licenseState: state } },
      { registrationState: state },
    ];
  }

  // Specializations filter (comma-separated) — matches lawyers with ANY of the listed specializations
  if (specializations) {
    const specArray = specializations.split(",").map((s) => s.trim()).filter(Boolean);
    if (specArray.length > 0) {
      where.lawyerProfile = {
        ...where.lawyerProfile,
        specializations: { hasSome: specArray },
      };
      // Only lawyers have specializations
      where.role = "LAWYER";
    }
  }

  let users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Number(limit),
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
      isVerified: true,
      avatar: true,
      createdAt: true,
      _count: { select: { consultationsAsClient: true } },
      lawyerProfile: {
        select: {
          verificationStatus: true,
          licenseImage: true,
          idImage: true,
          barNumber: true,
          licenseState: true,
          specializations: true,
          _count: { select: { consultations: true } },
        },
      },
    },
  });

  // Consultations filter (applied post-query since it spans two relations)
  if (consultations) {
    users = users.filter((u) => {
      const count = u.role === "LAWYER"
        ? (u.lawyerProfile?._count?.consultations || 0)
        : (u._count?.consultationsAsClient || 0);
      if (consultations === "0") return count === 0;
      if (consultations === "1-5") return count >= 1 && count <= 5;
      if (consultations === "5+") return count > 5;
      return true;
    });
  }

  res.json({ success: true, data: users });
});

// ──── Admin Broadcast Notifications ────

// @desc    Send broadcast notification to users
// @route   POST /api/admin/notifications/broadcast
export const sendBroadcastNotification = asyncHandler(async (req, res) => {
  const { title, body, target } = req.body;

  if (!title || !body || !target) {
    res.status(400);
    throw new Error("title, body, and target are required");
  }
  if (!["ALL", "CLIENTS", "LAWYERS"].includes(target)) {
    res.status(400);
    throw new Error("target must be ALL, CLIENTS, or LAWYERS");
  }

  // Find matching users
  const userWhere = {};
  if (target === "CLIENTS") userWhere.role = "CLIENT";
  if (target === "LAWYERS") userWhere.role = "LAWYER";

  const users = await prisma.user.findMany({
    where: userWhere,
    select: { id: true, expoPushToken: true },
  });

  let sentCount = 0;

  // Send push + in-app notification to each user
  for (const user of users) {
    // In-app notification
    await createInAppNotification(user.id, "admin_broadcast", title, body, { target });

    // Push notification
    if (user.expoPushToken) {
      await sendPushNotification(user.expoPushToken, title, body, { type: "admin_broadcast" });
      sentCount++;
    }
  }

  // Save broadcast record
  const broadcast = await prisma.adminBroadcast.create({
    data: {
      title,
      body,
      target,
      sentBy: "admin",
      sentCount,
    },
  });

  res.status(201).json({ success: true, data: broadcast });
});

// @desc    Get broadcast notification history
// @route   GET /api/admin/notifications/broadcast
export const getBroadcastHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [broadcasts, total] = await Promise.all([
    prisma.adminBroadcast.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.adminBroadcast.count(),
  ]);

  res.json({
    success: true,
    data: broadcasts,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// ──── Analytics (Charts) ────

// @desc    Get analytics data for all dashboard charts
// @route   GET /api/admin/analytics?period=30
export const getAnalytics = asyncHandler(async (req, res) => {
  let startDate;
  let endDate;

  if (req.query.from) {
    startDate = new Date(req.query.from);
    startDate.setHours(0, 0, 0, 0);
  } else {
    const days = parseInt(req.query.period) || 30;
    startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);
  }

  if (req.query.to) {
    endDate = new Date(req.query.to);
    endDate.setHours(23, 59, 59, 999);
  } else {
    endDate = new Date("2099-12-31");
  }

  const [
    registrationsByDay,
    revenueByDay,
    consultationsByCategory,
    consultationsByStatus,
    usersByRole,
    revenueByMonth,
  ] = await Promise.all([
    // Registrations per day
    prisma.$queryRaw`
      SELECT DATE("createdAt") as date,
             COUNT(*) FILTER (WHERE role = 'CLIENT') as clients,
             COUNT(*) FILTER (WHERE role = 'LAWYER') as lawyers,
             COUNT(*) as total
      FROM users
      WHERE "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,
    // Revenue per day
    prisma.$queryRaw`
      SELECT DATE("createdAt") as date,
             SUM(amount) as total_cents
      FROM payments
      WHERE status = 'SUCCEEDED' AND "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,
    // Consultations by category
    prisma.$queryRaw`
      SELECT category, COUNT(*) as count
      FROM consultations
      GROUP BY category
      ORDER BY count DESC
    `,
    // Consultations by status
    prisma.$queryRaw`
      SELECT status::text, COUNT(*) as count
      FROM consultations
      GROUP BY status
    `,
    // Users by role
    prisma.$queryRaw`
      SELECT role::text, COUNT(*) as count
      FROM users
      GROUP BY role
    `,
    // Revenue by month (last 12 months)
    prisma.$queryRaw`
      SELECT TO_CHAR("createdAt", 'YYYY-MM') as month,
             SUM(amount) as total_cents
      FROM payments
      WHERE status = 'SUCCEEDED' AND "createdAt" >= NOW() - INTERVAL '12 months'
      GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
      ORDER BY month ASC
    `,
  ]);

  res.json({
    success: true,
    data: {
      registrationsByDay: registrationsByDay.map((r) => ({
        date: r.date,
        clients: Number(r.clients),
        lawyers: Number(r.lawyers),
        total: Number(r.total),
      })),
      revenueByDay: revenueByDay.map((r) => ({
        date: r.date,
        amount: Number(r.total_cents || 0) / 100,
      })),
      consultationsByCategory: consultationsByCategory.map((r) => ({
        name: r.category,
        value: Number(r.count),
      })),
      consultationsByStatus: consultationsByStatus.map((r) => ({
        name: r.status,
        value: Number(r.count),
      })),
      usersByRole: usersByRole.map((r) => ({
        name: r.role,
        value: Number(r.count),
      })),
      revenueByMonth: revenueByMonth.map((r) => ({
        month: r.month,
        amount: Number(r.total_cents || 0) / 100,
      })),
    },
  });
});

// ──── Calendar ────

// @desc    Get calendar data (daily counts + todos for a month)
// @route   GET /api/admin/calendar?month=2026-02
export const getCalendarData = asyncHandler(async (req, res) => {
  const { month } = req.query;
  if (!month) {
    res.status(400);
    throw new Error("month parameter required (YYYY-MM)");
  }

  const [year, mon] = month.split("-").map(Number);
  const startDate = new Date(year, mon - 1, 1);
  const endDate = new Date(year, mon, 0, 23, 59, 59, 999);

  const [registrations, consultations, todos] = await Promise.all([
    prisma.$queryRaw`
      SELECT DATE("createdAt") as date, COUNT(*) as count
      FROM users
      WHERE "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
      GROUP BY DATE("createdAt")
    `,
    prisma.$queryRaw`
      SELECT DATE("createdAt") as date, COUNT(*) as count
      FROM consultations
      WHERE "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
      GROUP BY DATE("createdAt")
    `,
    prisma.adminTodo.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      select: { id: true, title: true, date: true, completed: true, priority: true },
      orderBy: { date: "asc" },
    }),
  ]);

  const calendarMap = {};

  for (const r of registrations) {
    const key = r.date.toISOString().split("T")[0];
    if (!calendarMap[key]) calendarMap[key] = { registrations: 0, consultations: 0, todos: [] };
    calendarMap[key].registrations = Number(r.count);
  }

  for (const c of consultations) {
    const key = c.date.toISOString().split("T")[0];
    if (!calendarMap[key]) calendarMap[key] = { registrations: 0, consultations: 0, todos: [] };
    calendarMap[key].consultations = Number(c.count);
  }

  for (const t of todos) {
    if (t.date) {
      const key = t.date.toISOString().split("T")[0];
      if (!calendarMap[key]) calendarMap[key] = { registrations: 0, consultations: 0, todos: [] };
      calendarMap[key].todos.push(t);
    }
  }

  res.json({ success: true, data: calendarMap });
});

// ──── Admin Todos ────

// @desc    Get all admin todos
// @route   GET /api/admin/todos
export const getTodos = asyncHandler(async (req, res) => {
  const { completed, priority, page = 1, limit = 50 } = req.query;
  const where = {};
  if (completed !== undefined) where.completed = completed === "true";
  if (priority) where.priority = priority;

  const skip = (Number(page) - 1) * Number(limit);
  const [todos, total] = await Promise.all([
    prisma.adminTodo.findMany({
      where,
      orderBy: [{ completed: "asc" }, { date: "asc" }, { createdAt: "desc" }],
      skip,
      take: Number(limit),
    }),
    prisma.adminTodo.count({ where }),
  ]);

  res.json({
    success: true,
    data: todos,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// @desc    Create admin todo
// @route   POST /api/admin/todos
export const createTodo = asyncHandler(async (req, res) => {
  const { title, description, date, priority } = req.body;
  if (!title) {
    res.status(400);
    throw new Error("Title is required");
  }

  const todo = await prisma.adminTodo.create({
    data: {
      title,
      description: description || null,
      date: date ? new Date(date) : null,
      priority: priority || "medium",
    },
  });

  res.status(201).json({ success: true, data: todo });
});

// @desc    Update admin todo
// @route   PUT /api/admin/todos/:id
export const updateTodo = asyncHandler(async (req, res) => {
  const { title, description, date, completed, priority } = req.body;
  const data = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description;
  if (date !== undefined) data.date = date ? new Date(date) : null;
  if (completed !== undefined) data.completed = completed;
  if (priority !== undefined) data.priority = priority;

  const todo = await prisma.adminTodo.update({
    where: { id: req.params.id },
    data,
  });

  res.json({ success: true, data: todo });
});

// @desc    Delete admin todo
// @route   DELETE /api/admin/todos/:id
export const deleteTodo = asyncHandler(async (req, res) => {
  await prisma.adminTodo.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: "Todo deleted" });
});

// ──── Geographic Distribution ────

// @desc    Get state-level user/lawyer counts for USA map
// @route   GET /api/admin/geography
export const getGeographicData = asyncHandler(async (req, res) => {
  const [clientsByState, lawyersByState] = await Promise.all([
    prisma.$queryRaw`
      SELECT "registrationState" as state, COUNT(*) as count
      FROM users
      WHERE role = 'CLIENT' AND "registrationState" IS NOT NULL
      GROUP BY "registrationState"
      ORDER BY count DESC
    `,
    prisma.$queryRaw`
      SELECT "licenseState" as state, COUNT(*) as count
      FROM lawyer_profiles
      GROUP BY "licenseState"
      ORDER BY count DESC
    `,
  ]);

  // Normalize full state names to 2-letter abbreviations
  const STATE_NAME_TO_ABBR = {
    alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
    california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
    florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
    illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
    kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
    massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
    missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
    "new york": "NY", "north carolina": "NC", "north dakota": "ND",
    ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
    "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
    tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
    virginia: "VA", washington: "WA", "west virginia": "WV",
    wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
  };

  const normalizeState = (raw) => {
    if (!raw) return null;
    const trimmed = raw.trim();
    // Already a valid 2-letter code
    if (/^[A-Z]{2}$/.test(trimmed)) return trimmed;
    // Look up full name (case-insensitive)
    return STATE_NAME_TO_ABBR[trimmed.toLowerCase()] || null;
  };

  const stateMap = {};

  for (const row of clientsByState) {
    const st = normalizeState(row.state);
    if (!st) continue;
    if (!stateMap[st]) stateMap[st] = { clients: 0, lawyers: 0 };
    stateMap[st].clients += Number(row.count);
  }

  for (const row of lawyersByState) {
    const st = normalizeState(row.state);
    if (!st) continue;
    if (!stateMap[st]) stateMap[st] = { clients: 0, lawyers: 0 };
    stateMap[st].lawyers += Number(row.count);
  }

  res.json({ success: true, data: stateMap });
});

// ──── Top Performing Lawyers ────

// @desc    Get top performing lawyers by consultations, revenue, rating
// @route   GET /api/admin/top-lawyers
export const getTopLawyers = asyncHandler(async (req, res) => {
  const { limit = 5, search } = req.query;
  const take = Math.min(Number(limit) || 5, 20);

  const where = { verificationStatus: "VERIFIED" };
  if (search) {
    where.user = {
      OR: [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  // Get lawyers with consultation counts
  const lawyers = await prisma.lawyerProfile.findMany({
    where,
    include: {
      user: { select: { firstName: true, lastName: true, avatar: true } },
      _count: { select: { consultations: true } },
    },
    orderBy: { rating: "desc" },
    take: 50, // get more than needed to sort by multiple criteria
  });

  // Get completed consultation counts per lawyer
  const lawyerIds = lawyers.map((l) => l.id);

  const completedCounts = await prisma.consultation.groupBy({
    by: ["lawyerId"],
    where: { lawyerId: { in: lawyerIds }, status: "COMPLETED" },
    _count: true,
  });

  const completedMap = {};
  for (const row of completedCounts) {
    completedMap[row.lawyerId] = row._count;
  }

  // Get revenue per lawyer (sum of succeeded payments)
  const revenueRows = await prisma.$queryRaw`
    SELECT c."lawyerId", SUM(p.amount) as total
    FROM payments p
    JOIN consultations c ON c.id = p."consultationId"
    WHERE p.status = 'SUCCEEDED' AND c."lawyerId" = ANY(${lawyerIds})
    GROUP BY c."lawyerId"
  `;

  const revenueMap = {};
  for (const row of revenueRows) {
    revenueMap[row.lawyerId] = Number(row.total) / 100; // cents to dollars
  }

  // Build response with all metrics and sort by completed consultations
  const result = lawyers.map((l) => ({
    id: l.id,
    name: `${l.user.firstName} ${l.user.lastName}`,
    avatar: l.user.avatar,
    specialization: l.specializations?.[0] || "General",
    consultations: completedMap[l.id] || 0,
    revenue: revenueMap[l.id] || 0,
    rating: l.rating || 0,
  }));

  // Sort by completed consultations desc, then revenue desc
  result.sort((a, b) => b.consultations - a.consultations || b.revenue - a.revenue);

  res.json({ success: true, data: result.slice(0, take) });
});

// ──── Visitor Stats ────

// @desc    Get portfolio website visitor statistics
// @route   GET /api/admin/visitors
export const getVisitorStats = asyncHandler(async (req, res) => {
  const period = Number(req.query.period) || 90;
  const since = new Date();
  since.setDate(since.getDate() - period);

  // Previous period for comparison
  const prevSince = new Date();
  prevSince.setDate(prevSince.getDate() - period * 2);

  const [currentStats, prevStats, deviceStats, totalSessions] = await Promise.all([
    // Current period unique visitors
    prisma.$queryRaw`
      SELECT COUNT(DISTINCT fingerprint)::int as visitors
      FROM site_visits
      WHERE "createdAt" >= ${since}
    `,
    // Previous period unique visitors (for comparison)
    prisma.$queryRaw`
      SELECT COUNT(DISTINCT fingerprint)::int as visitors
      FROM site_visits
      WHERE "createdAt" >= ${prevSince} AND "createdAt" < ${since}
    `,
    // Device breakdown for current period
    prisma.$queryRaw`
      SELECT "deviceType",
             COUNT(DISTINCT fingerprint)::int as visitors,
             COUNT(*)::int as sessions
      FROM site_visits
      WHERE "createdAt" >= ${since}
      GROUP BY "deviceType"
    `,
    // Total sessions in current period
    prisma.$queryRaw`
      SELECT COUNT(*)::int as total
      FROM site_visits
      WHERE "createdAt" >= ${since}
    `,
  ]);

  const current = Number(currentStats[0]?.visitors ?? 0);
  const prev = Number(prevStats[0]?.visitors ?? 0);
  const sessions = Number(totalSessions[0]?.total ?? 0);
  const changePercent = prev > 0 ? (((current - prev) / prev) * 100).toFixed(2) : 0;

  const deviceMap = { mobile: { visitors: 0, sessions: 0 }, desktop: { visitors: 0, sessions: 0 }, tablet: { visitors: 0, sessions: 0 } };
  for (const row of deviceStats) {
    const type = row.deviceType || "desktop";
    if (deviceMap[type]) {
      deviceMap[type].visitors = Number(row.visitors);
      deviceMap[type].sessions = Number(row.sessions);
    }
  }

  const mobilePercent = current > 0 ? ((deviceMap.mobile.visitors / current) * 100).toFixed(2) : 0;
  const desktopPercent = current > 0 ? ((deviceMap.desktop.visitors / current) * 100).toFixed(2) : 0;

  res.json({
    success: true,
    data: {
      totalVisitors: current,
      totalSessions: sessions,
      changePercent: Number(changePercent),
      mobile: { visitors: deviceMap.mobile.visitors, sessions: deviceMap.mobile.sessions, percent: Number(mobilePercent) },
      desktop: { visitors: deviceMap.desktop.visitors, sessions: deviceMap.desktop.sessions, percent: Number(desktopPercent) },
      tablet: { visitors: deviceMap.tablet.visitors, sessions: deviceMap.tablet.sessions },
    },
  });
});
