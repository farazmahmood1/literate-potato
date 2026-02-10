import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import stripe from "../config/stripe.js";
import { getIO } from "../config/socket.js";
import {
  notifyPaymentReceived,
  notifyPaymentSucceeded,
  notifyPaymentFailed,
  cancelTrialNotifications,
} from "../services/notification.service.js";

// @desc    Create payment intent for a consultation
// @route   POST /api/payments/create-intent
export const createPaymentIntent = asyncHandler(async (req, res) => {
  const { consultationId } = req.body;

  const consultation = await prisma.consultation.findUnique({
    where: { id: consultationId },
    include: { lawyer: true },
  });

  if (!consultation) {
    res.status(404);
    throw new Error("Consultation not found");
  }

  if (consultation.clientId !== req.user.id) {
    res.status(403);
    throw new Error("Not authorized");
  }

  const amount = consultation.lawyer.consultationRate;

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    metadata: {
      consultationId,
      userId: req.user.id,
    },
  });

  await prisma.payment.create({
    data: {
      userId: req.user.id,
      consultationId,
      stripePaymentId: paymentIntent.id,
      amount,
      status: "PENDING",
    },
  });

  res.json({
    success: true,
    data: { clientSecret: paymentIntent.client_secret },
  });
});

// @desc    Stripe webhook handler
// @route   POST /api/payments/webhook
export const stripeWebhook = asyncHandler(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    res.status(400);
    throw new Error(`Webhook Error: ${err.message}`);
  }

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;
    const consultationId = paymentIntent.metadata.consultationId;

    await prisma.payment.update({
      where: { stripePaymentId: paymentIntent.id },
      data: { status: "SUCCEEDED" },
    });

    // Activate the consultation (move from TRIAL to ACTIVE)
    const consultation = await prisma.consultation.update({
      where: { id: consultationId },
      data: { status: "ACTIVE" },
      include: {
        lawyer: { include: { user: { select: { id: true } } } },
      },
    });

    // Cancel trial timer notifications (client paid, no longer needed)
    cancelTrialNotifications(consultationId);

    // Emit socket events to both participants
    try {
      const io = getIO();
      const statusPayload = {
        consultationId,
        status: "ACTIVE",
        paymentReceived: true,
      };
      io.to(`consultation:${consultationId}`).emit("consultation-status-change", statusPayload);
      io.to(`user:${consultation.clientId}`).emit("payment-received", statusPayload);
      if (consultation.lawyer?.user) {
        io.to(`user:${consultation.lawyer.user.id}`).emit("payment-received", statusPayload);
      }
    } catch {}

    // Push notifications for payment success
    const amount = paymentIntent.amount;
    // Get names for notification messages
    const client = await prisma.user.findUnique({
      where: { id: consultation.clientId },
      select: { firstName: true, lastName: true },
    });
    const lawyerUser = consultation.lawyer?.user;
    const lawyer = lawyerUser ? await prisma.user.findUnique({
      where: { id: lawyerUser.id },
      select: { firstName: true, lastName: true },
    }) : null;

    const clientName = client ? `${client.firstName} ${client.lastName}` : "A client";
    const lawyerName = lawyer ? `${lawyer.firstName} ${lawyer.lastName}` : "your lawyer";

    notifyPaymentSucceeded(consultation.clientId, lawyerName, amount, consultationId);
    if (lawyerUser) {
      notifyPaymentReceived(lawyerUser.id, clientName, amount, consultationId);
    }
  }

  if (event.type === "payment_intent.payment_failed") {
    const paymentIntent = event.data.object;
    const failedConsultationId = paymentIntent.metadata.consultationId;

    await prisma.payment.update({
      where: { stripePaymentId: paymentIntent.id },
      data: { status: "FAILED" },
    });

    // Notify client of failed payment
    if (failedConsultationId) {
      const failedConsultation = await prisma.consultation.findUnique({
        where: { id: failedConsultationId },
        select: { clientId: true },
      });
      if (failedConsultation) {
        notifyPaymentFailed(failedConsultation.clientId, paymentIntent.amount, failedConsultationId);
      }
    }
  }

  res.json({ received: true });
});

// @desc    Get user's payment history
// @route   GET /api/payments
export const getPayments = asyncHandler(async (req, res) => {
  const payments = await prisma.payment.findMany({
    where: { userId: req.user.id },
    include: {
      consultation: {
        include: {
          lawyer: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({ success: true, data: payments });
});

// @desc    Get lawyer's earnings summary
// @route   GET /api/payments/earnings/summary
export const getEarningsSummary = asyncHandler(async (req, res) => {
  const lawyerProfile = await prisma.lawyerProfile.findUnique({
    where: { userId: req.user.id },
  });

  if (!lawyerProfile) {
    res.status(404);
    throw new Error("Lawyer profile not found");
  }

  const now = new Date();

  // Start of today (midnight)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Start of this week (Monday)
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);

  // Start of this month
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Base where clause: payments for this lawyer's consultations that succeeded
  const baseWhere = {
    consultation: { lawyerId: lawyerProfile.id },
    status: "SUCCEEDED",
  };

  // Run aggregations in parallel
  const [totalResult, monthResult, weekResult, todayResult, recentTransactions] =
    await Promise.all([
      prisma.payment.aggregate({
        where: baseWhere,
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { ...baseWhere, createdAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { ...baseWhere, createdAt: { gte: startOfWeek } },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { ...baseWhere, createdAt: { gte: startOfToday } },
        _sum: { amount: true },
      }),
      prisma.payment.findMany({
        where: { consultation: { lawyerId: lawyerProfile.id } },
        include: {
          consultation: {
            include: {
              client: {
                select: { firstName: true, lastName: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

  res.json({
    success: true,
    data: {
      totalEarnings: totalResult._sum.amount || 0,
      thisMonth: monthResult._sum.amount || 0,
      thisWeek: weekResult._sum.amount || 0,
      today: todayResult._sum.amount || 0,
      recentTransactions,
    },
  });
});
