import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import cloudinary from "../config/cloudinary.js";
import { getIO } from "../config/socket.js";
import { notifyNewMessage } from "../services/notification.service.js";

// @desc    Upload a file (base64 in JSON body) to Cloudinary
// @route   POST /api/files
export const uploadFile = asyncHandler(async (req, res) => {
  const { consultationId, base64, fileName, fileSize, mimeType } = req.body;

  if (!consultationId || !base64 || !fileName) {
    res.status(400);
    throw new Error("consultationId, base64, and fileName are required");
  }

  // Verify the user is a participant in this consultation
  const consultation = await prisma.consultation.findUnique({
    where: { id: consultationId },
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
    throw new Error("Not authorized to upload files to this consultation");
  }

  // Allow file uploads on ended consultations so parties can still share files

  // Determine message type from mimeType
  const isImage = mimeType && mimeType.startsWith("image/");
  const messageType = isImage ? "IMAGE" : "DOCUMENT";

  // Upload to Cloudinary
  const dataUri = `data:${mimeType || "application/octet-stream"};base64,${base64}`;
  let cloudinaryResult;
  try {
    cloudinaryResult = await cloudinary.uploader.upload(dataUri, {
      resource_type: isImage ? "image" : "raw",
      folder: `lawyer-direct/chat-files/${consultationId}`,
    });
  } catch (uploadError) {
    res.status(500);
    throw new Error("File upload failed. Please try again.");
  }

  const fileUrl = cloudinaryResult.secure_url;

  const message = await prisma.message.create({
    data: {
      consultationId,
      senderId: req.user.id,
      content: fileName,
      messageType,
      fileUrl,
      fileName,
      fileSize: fileSize ? Number(fileSize) : null,
      mimeType: mimeType || null,
    },
    include: {
      sender: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
    },
  });

  // Broadcast to consultation room via Socket.io
  try {
    const io = getIO();
    io.to(`consultation:${consultationId}`).emit("new-message", message);
  } catch {
    // Socket emit is best-effort — don't fail the upload
  }

  // Push notification to the other participant
  const otherUserId =
    consultation.clientId === req.user.id
      ? consultation.lawyer.userId
      : consultation.clientId;
  if (otherUserId) {
    const sender = message.sender;
    const senderName = `${sender.firstName} ${sender.lastName}`.trim();
    notifyNewMessage(otherUserId, senderName, messageType, fileName, consultationId);
  }

  res.status(201).json({
    success: true,
    data: {
      id: message.id,
      fileName: message.fileName,
      fileSize: message.fileSize,
      mimeType: message.mimeType,
      fileUrl: message.fileUrl,
      messageType: message.messageType,
      consultationId: message.consultationId,
      sender: message.sender,
      createdAt: message.createdAt,
    },
  });
});
