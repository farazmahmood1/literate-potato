import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import {
  emailReportWarning,
  emailAccountSuspended,
} from "../services/email.service.js";
import { createInAppNotification } from "../services/notification.service.js";

// @desc    Report a user
// @route   POST /api/reports
export const createReport = asyncHandler(async (req, res) => {
  const { reportedUserId, reason, description } = req.body;

  const report = await prisma.report.create({
    data: {
      reporterId: req.user.id,
      reportedId: reportedUserId,
      reason,
      description,
    },
  });

  // Count total reports against the reported user
  const reportCount = await prisma.report.count({
    where: { reportedId: reportedUserId },
  });

  // At 5 reports: send warning email + in-app notification
  if (reportCount === 5) {
    emailReportWarning(reportedUserId, reportCount);
    createInAppNotification({
      userId: reportedUserId,
      type: "SECURITY",
      title: "Account Warning",
      body: "Your account has received multiple reports. Please review our community guidelines.",
    }).catch(() => {});
  }

  // At 10 reports: suspend account + send suspension email
  if (reportCount >= 10) {
    await prisma.user.update({
      where: { id: reportedUserId },
      data: { suspended: true },
    });
    emailAccountSuspended(reportedUserId, reportCount);
    createInAppNotification({
      userId: reportedUserId,
      type: "SECURITY",
      title: "Account Suspended",
      body: "Your account has been suspended due to multiple reports from other users.",
    }).catch(() => {});
  }

  res.status(201).json({ success: true, data: report });
});

// @desc    Block a user
// @route   POST /api/blocks
export const blockUser = asyncHandler(async (req, res) => {
  const { blockedUserId } = req.body;

  const existing = await prisma.block.findUnique({
    where: {
      blockerId_blockedId: {
        blockerId: req.user.id,
        blockedId: blockedUserId,
      },
    },
  });

  if (existing) {
    res.json({ success: true, message: "Already blocked" });
    return;
  }

  await prisma.block.create({
    data: {
      blockerId: req.user.id,
      blockedId: blockedUserId,
    },
  });

  res.status(201).json({ success: true, message: "User blocked" });
});

// @desc    Unblock a user
// @route   DELETE /api/blocks/:userId
export const unblockUser = asyncHandler(async (req, res) => {
  await prisma.block.deleteMany({
    where: {
      blockerId: req.user.id,
      blockedId: req.params.userId,
    },
  });

  res.json({ success: true, message: "User unblocked" });
});

// @desc    Get blocked users
// @route   GET /api/blocks
export const getBlockedUsers = asyncHandler(async (req, res) => {
  const blocks = await prisma.block.findMany({
    where: { blockerId: req.user.id },
    include: {
      blocked: { select: { id: true, firstName: true, lastName: true, avatar: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({ success: true, data: blocks });
});

// @desc    Get reports (admin only)
// @route   GET /api/reports
export const getReports = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const where = status ? { status } : {};
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

// @desc    Update report status (admin)
// @route   PUT /api/reports/:id
export const updateReport = asyncHandler(async (req, res) => {
  const { status, resolution } = req.body;

  const report = await prisma.report.update({
    where: { id: req.params.id },
    data: { status },
  });

  res.json({ success: true, data: report });
});
