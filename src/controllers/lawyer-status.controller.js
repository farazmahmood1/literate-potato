import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import { getIO } from "../config/socket.js";
import {
  notifyConsultationAccepted,
  notifyConsultationDeclined,
  scheduleTrialNotifications,
} from "../services/notification.service.js";

// @desc    Update lawyer online status
// @route   PUT /api/lawyers/status
export const updateOnlineStatus = asyncHandler(async (req, res) => {
  const { status } = req.body; // "online" | "offline" | "busy"

  if (!["online", "offline", "busy"].includes(status)) {
    res.status(400);
    throw new Error("Invalid status. Must be: online, offline, or busy");
  }

  const profile = await prisma.lawyerProfile.findUnique({
    where: { userId: req.user.id },
  });

  if (!profile) {
    res.status(404);
    throw new Error("Lawyer profile not found");
  }

  const updated = await prisma.lawyerProfile.update({
    where: { id: profile.id },
    data: {
      onlineStatus: status,
      isAvailable: status === "online",
      lastActiveAt: new Date(),
    },
  });

  // Broadcast status change
  try {
    const io = getIO();
    io.emit("lawyer-status-change", {
      lawyerId: profile.id,
      userId: req.user.id,
      status,
    });
  } catch {}

  res.json({ success: true, data: { onlineStatus: updated.onlineStatus } });
});

// @desc    Heartbeat to keep lawyer online
// @route   POST /api/lawyers/heartbeat
export const heartbeat = asyncHandler(async (req, res) => {
  const profile = await prisma.lawyerProfile.findUnique({
    where: { userId: req.user.id },
  });

  if (profile) {
    await prisma.lawyerProfile.update({
      where: { id: profile.id },
      data: { lastActiveAt: new Date() },
    });
  }

  res.json({ success: true });
});

// @desc    Accept a consultation request
// @route   PUT /api/consultations/:id/accept
export const acceptConsultation = asyncHandler(async (req, res) => {
  const consultation = await prisma.consultation.findUnique({
    where: { id: req.params.id },
    include: { lawyer: { select: { userId: true } } },
  });

  if (!consultation) {
    res.status(404);
    throw new Error("Consultation not found");
  }

  if (consultation.lawyer.userId !== req.user.id) {
    res.status(403);
    throw new Error("Only the assigned lawyer can accept this consultation");
  }

  if (consultation.status !== "PENDING") {
    res.status(400);
    throw new Error("Consultation is not in PENDING status");
  }

  const now = new Date();
  const trialEndAt = new Date(now.getTime() + 3 * 60 * 1000); // 3 minutes

  const updated = await prisma.consultation.update({
    where: { id: req.params.id },
    data: {
      status: "TRIAL",
      startedAt: now,
      trialEndAt,
    },
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
      lawyer: {
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });

  // Create system message
  await prisma.message.create({
    data: {
      consultationId: updated.id,
      senderId: req.user.id,
      content: `${updated.lawyer.user.firstName} has accepted the consultation. Your 3-minute free trial has started!`,
      messageType: "SYSTEM",
    },
  });

  // Emit socket events
  try {
    const io = getIO();
    io.to(`consultation:${updated.id}`).emit("consultation-status-change", {
      consultationId: updated.id,
      status: "TRIAL",
      trialEndAt: updated.trialEndAt,
    });
    io.to(`user:${updated.clientId}`).emit("consultation-accepted", {
      consultationId: updated.id,
      lawyerName: `${updated.lawyer.user.firstName} ${updated.lawyer.user.lastName}`,
      trialEndAt: updated.trialEndAt,
    });
  } catch {}

  // Push notifications: accepted + trial started + schedule trial expiry warnings
  const lawyerFullName = `${updated.lawyer.user.firstName} ${updated.lawyer.user.lastName}`;
  notifyConsultationAccepted(updated.clientId, lawyerFullName, updated.id, updated.trialEndAt);
  scheduleTrialNotifications(updated.clientId, lawyerFullName, updated.id);

  res.json({ success: true, data: updated });
});

// @desc    Decline a consultation request
// @route   PUT /api/consultations/:id/decline
export const declineConsultation = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const consultation = await prisma.consultation.findUnique({
    where: { id: req.params.id },
    include: { lawyer: { select: { userId: true } } },
  });

  if (!consultation) {
    res.status(404);
    throw new Error("Consultation not found");
  }

  if (consultation.lawyer.userId !== req.user.id) {
    res.status(403);
    throw new Error("Only the assigned lawyer can decline this consultation");
  }

  if (consultation.status !== "PENDING") {
    res.status(400);
    throw new Error("Consultation is not in PENDING status");
  }

  const updated = await prisma.consultation.update({
    where: { id: req.params.id },
    data: {
      status: "CANCELLED",
      endedAt: new Date(),
      notes: reason || "Declined by lawyer",
    },
  });

  // Emit socket events
  try {
    const io = getIO();
    io.to(`user:${updated.clientId}`).emit("consultation-status-change", {
      consultationId: updated.id,
      status: "CANCELLED",
    });
  } catch {}

  // Push notification: declined
  notifyConsultationDeclined(updated.clientId, updated.id);

  res.json({ success: true, data: updated });
});
