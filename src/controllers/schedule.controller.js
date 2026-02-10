import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import { getIO } from "../config/socket.js";

// @desc    Schedule a future consultation
// @route   POST /api/schedule
export const scheduleConsultation = asyncHandler(async (req, res) => {
  const { lawyerId, category, description, scheduledAt, notes } = req.body;

  if (!lawyerId || !scheduledAt) {
    res.status(400);
    throw new Error("Lawyer ID and scheduled date are required");
  }

  const schedDate = new Date(scheduledAt);
  if (schedDate <= new Date()) {
    res.status(400);
    throw new Error("Scheduled date must be in the future");
  }

  const lawyer = await prisma.lawyerProfile.findUnique({
    where: { id: lawyerId },
  });

  if (!lawyer) {
    res.status(404);
    throw new Error("Lawyer not found");
  }

  const consultation = await prisma.consultation.create({
    data: {
      clientId: req.user.id,
      lawyerId,
      category: category || "General",
      description: description || "Scheduled consultation",
      isScheduled: true,
      scheduledAt: schedDate,
      notes: notes || null,
    },
    include: {
      client: { select: { firstName: true, lastName: true, avatar: true } },
      lawyer: {
        include: { user: { select: { firstName: true, lastName: true, avatar: true } } },
      },
    },
  });

  // Notify the lawyer via socket
  try {
    const io = getIO();
    io.to(`user:${lawyer.userId}`).emit("new-scheduled-consultation", {
      consultation,
    });
  } catch {}

  res.status(201).json({ success: true, data: consultation });
});

// @desc    Get upcoming scheduled consultations
// @route   GET /api/schedule
export const getScheduledConsultations = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const now = new Date();
  const where = {
    isScheduled: true,
    scheduledAt: { gte: now },
    status: { notIn: ["COMPLETED", "CANCELLED"] },
  };

  if (req.user.role === "CLIENT") {
    where.clientId = req.user.id;
  } else if (req.user.role === "LAWYER") {
    const profile = await prisma.lawyerProfile.findUnique({
      where: { userId: req.user.id },
    });
    if (profile) {
      where.lawyerId = profile.id;
    }
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [consultations, total] = await Promise.all([
    prisma.consultation.findMany({
      where,
      include: {
        client: { select: { firstName: true, lastName: true, avatar: true } },
        lawyer: {
          include: { user: { select: { firstName: true, lastName: true, avatar: true } } },
        },
      },
      orderBy: { scheduledAt: "asc" },
      skip,
      take: Number(limit),
    }),
    prisma.consultation.count({ where }),
  ]);

  res.json({
    success: true,
    data: consultations,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

// @desc    Cancel a scheduled consultation
// @route   PUT /api/schedule/:id/cancel
export const cancelScheduledConsultation = asyncHandler(async (req, res) => {
  const consultation = await prisma.consultation.findUnique({
    where: { id: req.params.id },
    include: { lawyer: { select: { userId: true } } },
  });

  if (!consultation) {
    res.status(404);
    throw new Error("Consultation not found");
  }

  // Only participants can cancel
  const isParticipant =
    consultation.clientId === req.user.id ||
    consultation.lawyer.userId === req.user.id;

  if (!isParticipant) {
    res.status(403);
    throw new Error("Not authorized to cancel this consultation");
  }

  if (consultation.status === "CANCELLED" || consultation.status === "COMPLETED") {
    res.status(400);
    throw new Error("Consultation is already " + consultation.status.toLowerCase());
  }

  const updated = await prisma.consultation.update({
    where: { id: req.params.id },
    data: {
      status: "CANCELLED",
      endedAt: new Date(),
    },
    include: {
      client: { select: { firstName: true, lastName: true, avatar: true } },
      lawyer: {
        include: { user: { select: { firstName: true, lastName: true, avatar: true } } },
      },
    },
  });

  // Notify participants
  try {
    const io = getIO();
    io.to(`user:${updated.clientId}`).emit("consultation-cancelled", {
      consultationId: updated.id,
    });
    if (updated.lawyer?.user) {
      io.to(`user:${consultation.lawyer.userId}`).emit("consultation-cancelled", {
        consultationId: updated.id,
      });
    }
  } catch {}

  res.json({ success: true, data: updated });
});
