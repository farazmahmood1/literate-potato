import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import {
  notifyVerificationApproved,
  notifyVerificationRejected,
  notifyDisputeResolved,
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
      select: { id: true, firstName: true, lastName: true, role: true, createdAt: true },
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
        lawyerProfile: { select: { id: true, verificationStatus: true, specializations: true, rating: true } },
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
  const { search, verification, page = 1, limit = 20 } = req.query;
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

  const skip = (Number(page) - 1) * Number(limit);
  const [lawyers, total] = await Promise.all([
    prisma.lawyerProfile.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true, email: true, createdAt: true } },
        _count: { select: { consultations: true, reviews: true } },
      },
      orderBy: { createdAt: "desc" },
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
  const { status, page = 1, limit = 20 } = req.query;
  const where = {};
  if (status) where.status = status;

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
