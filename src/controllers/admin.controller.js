import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import {
  notifyVerificationApproved,
  notifyVerificationRejected,
} from "../services/notification.service.js";

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
