import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";

// @desc    Get dashboard summary for authenticated user
// @route   GET /api/dashboard/summary
export const getDashboardSummary = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const [user, activeConsultation, totalConsultations, recentConsultations, lastCompleted] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          clerkId: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          avatar: true,
          role: true,
          isVerified: true,
          createdAt: true,
        },
      }),
      prisma.consultation.findFirst({
        where: {
          clientId: userId,
          status: { in: ["PENDING", "ACTIVE"] },
        },
        include: {
          lawyer: {
            include: { user: { select: { firstName: true, lastName: true, avatar: true } } },
          },
          payment: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.consultation.count({
        where: { clientId: userId },
      }),
      prisma.consultation.findMany({
        where: {
          clientId: userId,
          status: { in: ["COMPLETED", "CANCELLED"] },
        },
        include: {
          lawyer: {
            include: { user: { select: { firstName: true, lastName: true, avatar: true } } },
          },
          payment: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.consultation.findFirst({
        where: {
          clientId: userId,
          status: "COMPLETED",
        },
        orderBy: { createdAt: "desc" },
        select: { category: true },
      }),
    ]);

  const freeTrialUsed = await prisma.consultation.count({
    where: {
      clientId: userId,
      payment: null,
      status: { in: ["ACTIVE", "COMPLETED"] },
    },
  }) > 0;

  const pendingPayment = await prisma.payment.count({
    where: {
      userId,
      status: "PENDING",
    },
  }) > 0;

  res.json({
    success: true,
    data: {
      user,
      activeConsultation,
      stats: {
        totalConsultations,
        freeTrialUsed,
        lastCategory: lastCompleted?.category || null,
        pendingPayment,
      },
      recentConsultations,
    },
  });
});

// @desc    Get lawyer dashboard summary
// @route   GET /api/dashboard/lawyer-summary
export const getLawyerDashboardSummary = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const lawyerProfile = await prisma.lawyerProfile.findUnique({
    where: { userId },
  });

  if (!lawyerProfile) {
    res.status(404);
    throw new Error("Lawyer profile not found");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    user,
    waitingConsultations,
    activeConsultations,
    recentCompleted,
    paidTodayAgg,
    earningsTotalAgg,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        clerkId: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatar: true,
        role: true,
      },
    }),
    prisma.consultation.findMany({
      where: {
        lawyerId: lawyerProfile.id,
        status: "PENDING",
        requestedType: { not: null },
      },
      include: {
        client: { select: { firstName: true, lastName: true, avatar: true } },
        payment: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.consultation.findMany({
      where: {
        lawyerId: lawyerProfile.id,
        status: { in: ["ACTIVE", "TRIAL"] },
      },
      include: {
        client: { select: { firstName: true, lastName: true, avatar: true } },
        payment: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, createdAt: true, senderId: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.consultation.findMany({
      where: {
        lawyerId: lawyerProfile.id,
        status: "COMPLETED",
      },
      include: {
        client: { select: { firstName: true, lastName: true, avatar: true } },
        payment: true,
        review: true,
      },
      orderBy: { endedAt: "desc" },
      take: 5,
    }),
    prisma.payment.aggregate({
      where: {
        consultation: { lawyerId: lawyerProfile.id },
        status: "SUCCEEDED",
        createdAt: { gte: today },
      },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: {
        consultation: { lawyerId: lawyerProfile.id },
        status: "SUCCEEDED",
      },
      _sum: { amount: true },
    }),
  ]);

  res.json({
    success: true,
    data: {
      lawyer: { ...user, lawyerProfile },
      onlineStatus: lawyerProfile.onlineStatus,
      stats: {
        waitingCount: waitingConsultations.length,
        activeChats: activeConsultations.length,
        paidToday: paidTodayAgg._sum.amount || 0,
        earningsTotal: earningsTotalAgg._sum.amount || 0,
      },
      waitingConsultations,
      activeConsultations,
      recentCompleted,
      notifications: [],
    },
  });
});
