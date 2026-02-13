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

// @desc    Get lawyer analytics (trends, peak hours, revenue breakdown)
// @route   GET /api/dashboard/lawyer-analytics
export const getLawyerAnalytics = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const lawyerProfile = await prisma.lawyerProfile.findUnique({
    where: { userId },
    select: { id: true, rating: true, totalReviews: true, createdAt: true },
  });

  if (!lawyerProfile) {
    res.status(404);
    throw new Error("Lawyer profile not found");
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // ── 1. Daily revenue for last 30 days ──
  const payments = await prisma.payment.findMany({
    where: {
      consultation: { lawyerId: lawyerProfile.id },
      status: "SUCCEEDED",
      createdAt: { gte: thirtyDaysAgo },
    },
    select: { amount: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const revenueByDay = {};
  for (let d = 0; d < 30; d++) {
    const date = new Date(now.getTime() - (29 - d) * 24 * 60 * 60 * 1000);
    const key = date.toISOString().split("T")[0];
    revenueByDay[key] = 0;
  }
  for (const p of payments) {
    const key = p.createdAt.toISOString().split("T")[0];
    if (revenueByDay[key] !== undefined) {
      revenueByDay[key] += p.amount;
    }
  }
  const revenueTrend = Object.entries(revenueByDay).map(([date, amount]) => ({
    date,
    amount,
  }));

  // ── 2. Consultation count by day for last 30 days ──
  const consultations = await prisma.consultation.findMany({
    where: {
      lawyerId: lawyerProfile.id,
      createdAt: { gte: thirtyDaysAgo },
    },
    select: { createdAt: true, status: true },
  });

  const consultationsByDay = {};
  for (let d = 0; d < 30; d++) {
    const date = new Date(now.getTime() - (29 - d) * 24 * 60 * 60 * 1000);
    const key = date.toISOString().split("T")[0];
    consultationsByDay[key] = 0;
  }
  for (const c of consultations) {
    const key = c.createdAt.toISOString().split("T")[0];
    if (consultationsByDay[key] !== undefined) {
      consultationsByDay[key]++;
    }
  }
  const consultationTrend = Object.entries(consultationsByDay).map(([date, count]) => ({
    date,
    count,
  }));

  // ── 3. Peak hours (last 90 days) ──
  const allConsultations = await prisma.consultation.findMany({
    where: {
      lawyerId: lawyerProfile.id,
      createdAt: { gte: ninetyDaysAgo },
      status: { in: ["ACTIVE", "COMPLETED", "TRIAL"] },
    },
    select: { createdAt: true },
  });

  const hourCounts = new Array(24).fill(0);
  for (const c of allConsultations) {
    hourCounts[c.createdAt.getHours()]++;
  }
  const peakHours = hourCounts.map((count, hour) => ({ hour, count }));

  // ── 4. Category breakdown ──
  const categoryConsultations = await prisma.consultation.findMany({
    where: {
      lawyerId: lawyerProfile.id,
      status: { in: ["ACTIVE", "COMPLETED", "TRIAL"] },
    },
    select: { category: true },
  });

  const categoryMap = {};
  for (const c of categoryConsultations) {
    categoryMap[c.category] = (categoryMap[c.category] || 0) + 1;
  }
  const categoryBreakdown = Object.entries(categoryMap)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // ── 5. Rating trend (last 90 days, grouped by week) ──
  const reviews = await prisma.review.findMany({
    where: {
      lawyerProfileId: lawyerProfile.id,
      createdAt: { gte: ninetyDaysAgo },
    },
    select: { rating: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const weeklyRatings = {};
  for (const r of reviews) {
    const weekStart = new Date(r.createdAt);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const key = weekStart.toISOString().split("T")[0];
    if (!weeklyRatings[key]) weeklyRatings[key] = { sum: 0, count: 0 };
    weeklyRatings[key].sum += r.rating;
    weeklyRatings[key].count++;
  }
  const ratingTrend = Object.entries(weeklyRatings).map(([week, data]) => ({
    week,
    average: Math.round((data.sum / data.count) * 10) / 10,
    count: data.count,
  }));

  // ── 6. Summary stats ──
  const [totalEarnings, totalConsultationCount, completedCount, avgRatingResult] = await Promise.all([
    prisma.payment.aggregate({
      where: { consultation: { lawyerId: lawyerProfile.id }, status: "SUCCEEDED" },
      _sum: { amount: true },
    }),
    prisma.consultation.count({ where: { lawyerId: lawyerProfile.id } }),
    prisma.consultation.count({ where: { lawyerId: lawyerProfile.id, status: "COMPLETED" } }),
    prisma.review.aggregate({
      where: { lawyerProfileId: lawyerProfile.id },
      _avg: { rating: true },
      _count: true,
    }),
  ]);

  const completionRate = totalConsultationCount > 0
    ? Math.round((completedCount / totalConsultationCount) * 100)
    : 0;

  const busiestHour = peakHours.reduce((max, h) => (h.count > max.count ? h : max), { hour: 0, count: 0 });

  res.json({
    success: true,
    data: {
      summary: {
        totalEarnings: totalEarnings._sum.amount || 0,
        totalConsultations: totalConsultationCount,
        completedConsultations: completedCount,
        completionRate,
        averageRating: avgRatingResult._avg.rating || 0,
        totalReviews: avgRatingResult._count || 0,
        busiestHour: busiestHour.hour,
        memberSince: lawyerProfile.createdAt,
      },
      revenueTrend,
      consultationTrend,
      peakHours,
      categoryBreakdown,
      ratingTrend,
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
