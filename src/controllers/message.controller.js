import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import { moderateMessage } from "../services/moderation.service.js";
import { getIO } from "../config/socket.js";
import { notifyNewMessage } from "../services/notification.service.js";

// @desc    Get messages for a consultation (paginated)
// @route   GET /api/consultations/:id/messages
export const getMessages = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 25 } = req.query;

  // Verify participant access
  const consultation = await prisma.consultation.findUnique({
    where: { id },
    include: { lawyer: { select: { userId: true } } },
  });

  if (!consultation) {
    res.status(404);
    throw new Error("Consultation not found");
  }

  const lawyerUserId = consultation.lawyer.userId;
  const isParticipant =
    consultation.clientId === req.user.id ||
    lawyerUserId === req.user.id ||
    req.user.role === "ADMIN";

  if (!isParticipant) {
    res.status(403);
    throw new Error("Not authorized to view these messages");
  }

  const skip = (Number(page) - 1) * Number(limit);

  // Use select (not include) to avoid N+1 on nested replyTo.sender.
  // Prisma batches top-level select queries but can N+1 on nested include relations.
  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where: { consultationId: id },
      select: {
        id: true,
        consultationId: true,
        senderId: true,
        content: true,
        messageType: true,
        isRead: true,
        readAt: true,
        fileUrl: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        replyToId: true,
        createdAt: true,
        sender: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            senderId: true,
            messageType: true,
            sender: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.message.count({ where: { consultationId: id } }),
  ]);

  res.json({
    success: true,
    data: messages,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

// @desc    Send a message (REST fallback)
// @route   POST /api/consultations/:id/messages
export const sendMessage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { content, messageType = "TEXT", replyToId } = req.body;

  if (!content || content.trim().length === 0) {
    res.status(400);
    throw new Error("Message content is required");
  }

  const consultation = await prisma.consultation.findUnique({
    where: { id },
    include: { lawyer: { select: { userId: true } } },
  });

  if (!consultation) {
    res.status(404);
    throw new Error("Consultation not found");
  }

  const isParticipant =
    consultation.clientId === req.user.id ||
    consultation.lawyer.userId === req.user.id;

  if (!isParticipant) {
    res.status(403);
    throw new Error("Not authorized");
  }

  // Allow messages on ended consultations so parties can still communicate

  // Content moderation (text messages only)
  if (messageType === "TEXT") {
    const modResult = await moderateMessage(content.trim(), {
      senderRole: req.user.role,
      senderId: req.user.id,
    });

    if (!modResult.allowed) {
      res.status(422);
      throw new Error(modResult.reason || "Your message was blocked by our content policy.");
    }
  }

  const message = await prisma.message.create({
    data: {
      consultationId: id,
      senderId: req.user.id,
      content: content.trim(),
      messageType,
      ...(replyToId ? { replyToId } : {}),
    },
    include: {
      sender: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
      replyTo: {
        select: {
          id: true,
          content: true,
          senderId: true,
          messageType: true,
          sender: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  // Broadcast via socket to consultation room + personal rooms (same as socket handler)
  try {
    const io = getIO();
    io.to(`consultation:${id}`).emit("new-message", message);
    const lawyerUserId = consultation.lawyer.userId;
    io.to(`user:${lawyerUserId}`).emit("new-message", message);
    io.to(`user:${consultation.clientId}`).emit("new-message", message);
  } catch {}

  // Push notification to the other participant
  const lawyerUserId = consultation.lawyer.userId;
  const otherUserId = consultation.clientId === req.user.id ? lawyerUserId : consultation.clientId;
  if (otherUserId) {
    const senderName = `${req.user.firstName} ${req.user.lastName}`.trim();
    notifyNewMessage(otherUserId, senderName, messageType, content.trim(), id);
  }

  // Update consultation updatedAt
  await prisma.consultation.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  res.status(201).json({ success: true, data: message });
});

// @desc    Mark all messages as read
// @route   PUT /api/consultations/:id/messages/read
export const markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await prisma.message.updateMany({
    where: {
      consultationId: id,
      senderId: { not: req.user.id },
      isRead: false,
    },
    data: { isRead: true, readAt: new Date() },
  });

  res.json({ success: true });
});

// @desc    Get total unread message count across all user's consultations
// @route   GET /api/consultations/unread-message-count
export const getUnreadCount = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const count = await prisma.message.count({
    where: {
      senderId: { not: userId },
      isRead: false,
      consultation: {
        OR: [
          { clientId: userId },
          { lawyer: { userId } },
        ],
      },
    },
  });

  res.json({ success: true, data: { unreadCount: count } });
});
