import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import { getIO } from "../config/socket.js";
import { generateRtcToken, AGORA_APP_ID } from "../config/agora.js";
import {
  notifyIncomingCall,
  notifyIncomingVideoCall,
  notifyMissedCall,
} from "../services/notification.service.js";

/** Convert a userId string to a stable integer UID for Agora.
 *  Must fit in a signed 32-bit int (Prisma Int / PostgreSQL integer).
 *  Range: 1 – 2,147,483,646 */
function userIdToUid(userId) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return (hash % 0x7ffffffe) + 1; // max 2,147,483,646 — fits INT4
}

// @desc    Initiate a voice or video call
// @route   POST /api/calls
export const initiateCall = asyncHandler(async (req, res) => {
  const { consultationId, type } = req.body;

  if (!consultationId || !type) {
    res.status(400);
    throw new Error("consultationId and type (voice/video) are required");
  }

  if (!["voice", "video"].includes(type)) {
    res.status(400);
    throw new Error("type must be 'voice' or 'video'");
  }

  // Verify consultation exists and user is a participant
  const consultation = await prisma.consultation.findUnique({
    where: { id: consultationId },
    include: {
      lawyer: {
        select: { userId: true, user: { select: { firstName: true, lastName: true } } },
      },
      client: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });

  if (!consultation) {
    res.status(404);
    throw new Error("Consultation not found");
  }

  const lawyerUserId = consultation.lawyer.userId;
  const clientUserId = consultation.clientId;
  const isClient = clientUserId === req.user.id;
  const isLawyer = lawyerUserId === req.user.id;

  if (!isClient && !isLawyer) {
    res.status(403);
    throw new Error("Not authorized to initiate a call in this consultation");
  }

  // Only the client may initiate calls
  if (!isClient) {
    res.status(403);
    throw new Error("Only the client can initiate calls");
  }

  // Block calls on ended consultations
  if (["COMPLETED", "CANCELLED"].includes(consultation.status)) {
    res.status(400);
    throw new Error("Cannot initiate a call on an ended consultation");
  }

  // Determine the other party
  const otherPartyUserId = isClient ? lawyerUserId : clientUserId;
  const initiatorName = isClient
    ? `${consultation.client.firstName} ${consultation.client.lastName}`.trim()
    : `${consultation.lawyer.user.firstName} ${consultation.lawyer.user.lastName}`.trim();
  const receiverName = isClient
    ? `${consultation.lawyer.user.firstName} ${consultation.lawyer.user.lastName}`.trim()
    : `${consultation.client.firstName} ${consultation.client.lastName}`.trim();

  // Generate Agora UIDs and token for the initiator
  const initiatorUid = userIdToUid(req.user.id);
  const receiverUid = userIdToUid(otherPartyUserId);

  // Create call record in database
  const call = await prisma.call.create({
    data: {
      consultationId,
      initiatorId: req.user.id,
      receiverId: otherPartyUserId,
      type,
      status: "RINGING",
      channelName: `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      initiatorUid,
      receiverUid,
      initiatorName,
      receiverName,
    },
  });

  const initiatorToken = generateRtcToken(call.channelName, initiatorUid, "publisher");

  // Emit incoming-call to the other party via their personal room
  try {
    const io = getIO();
    io.to(`user:${otherPartyUserId}`).emit("incoming-call", {
      callId: call.id,
      consultationId,
      callerName: initiatorName,
      callType: type,
      isVideo: type === "video",
    });
  } catch {}

  // Push notification for incoming call
  if (type === "video") {
    notifyIncomingVideoCall(otherPartyUserId, initiatorName, consultationId, call.id);
  } else {
    notifyIncomingCall(otherPartyUserId, initiatorName, consultationId, call.id);
  }

  // Auto-expire ringing after 60 seconds
  setTimeout(async () => {
    try {
      const current = await prisma.call.findUnique({ where: { id: call.id } });
      if (current && current.status === "RINGING") {
        await prisma.call.update({
          where: { id: call.id },
          data: { status: "MISSED" },
        });

        try {
          const io = getIO();
          io.to(`user:${req.user.id}`).emit("call-missed", { callId: call.id });
          io.to(`user:${otherPartyUserId}`).emit("call-missed", { callId: call.id });
        } catch {}

        notifyMissedCall(otherPartyUserId, initiatorName, consultationId, call.id);
      }
    } catch (err) {
      console.error("[Call] Auto-expire error:", err.message);
    }
  }, 60000);

  res.status(201).json({
    success: true,
    data: {
      ...call,
      agoraAppId: AGORA_APP_ID,
      agoraToken: initiatorToken,
      agoraUid: initiatorUid,
    },
  });
});

// @desc    Accept an incoming call
// @route   PUT /api/calls/:callId/accept
export const acceptCall = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const call = await prisma.call.findUnique({ where: { id: callId } });

  if (!call) {
    res.status(404);
    throw new Error("Call not found");
  }

  // Only the receiver can accept
  if (call.receiverId !== req.user.id) {
    res.status(403);
    throw new Error("Not authorized to accept this call");
  }

  if (call.status !== "RINGING") {
    res.status(400);
    throw new Error(`Call cannot be accepted — current status: ${call.status}`);
  }

  const startedAt = new Date();
  const updated = await prisma.call.update({
    where: { id: callId },
    data: { status: "ACTIVE", startedAt },
  });

  // Generate Agora token for the receiver
  const receiverToken = generateRtcToken(call.channelName, call.receiverUid, "publisher");

  // Notify both parties
  try {
    const io = getIO();
    io.to(`user:${call.initiatorId}`).emit("call-accepted", {
      callId,
      acceptedAt: startedAt.toISOString(),
    });
    io.to(`user:${call.receiverId}`).emit("call-accepted", {
      callId,
      acceptedAt: startedAt.toISOString(),
    });
  } catch {}

  res.json({
    success: true,
    data: {
      ...updated,
      agoraAppId: AGORA_APP_ID,
      agoraToken: receiverToken,
      agoraUid: call.receiverUid,
    },
  });
});

// @desc    Decline an incoming call
// @route   PUT /api/calls/:callId/decline
export const declineCall = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const call = await prisma.call.findUnique({ where: { id: callId } });

  if (!call) {
    res.status(404);
    throw new Error("Call not found");
  }

  // Only the receiver can decline
  if (call.receiverId !== req.user.id) {
    res.status(403);
    throw new Error("Not authorized to decline this call");
  }

  if (call.status !== "RINGING") {
    res.status(400);
    throw new Error(`Call cannot be declined — current status: ${call.status}`);
  }

  const updated = await prisma.call.update({
    where: { id: callId },
    data: { status: "DECLINED" },
  });

  // Notify the initiator
  try {
    const io = getIO();
    io.to(`user:${call.initiatorId}`).emit("call-declined", { callId });
  } catch {}

  res.json({
    success: true,
    data: updated,
  });
});

// @desc    End an active call
// @route   PUT /api/calls/:callId/end
export const endCall = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const call = await prisma.call.findUnique({ where: { id: callId } });

  if (!call) {
    res.status(404);
    throw new Error("Call not found");
  }

  // Either party can end the call
  if (call.initiatorId !== req.user.id && call.receiverId !== req.user.id) {
    res.status(403);
    throw new Error("Not authorized to end this call");
  }

  if (call.status === "ENDED") {
    res.status(400);
    throw new Error("Call has already ended");
  }

  const endedAt = new Date();
  let duration = 0;

  // Calculate duration in seconds (only if the call was active)
  if (call.startedAt) {
    duration = Math.round((endedAt.getTime() - new Date(call.startedAt).getTime()) / 1000);
  }

  const updated = await prisma.call.update({
    where: { id: callId },
    data: { status: "ENDED", endedAt, duration },
  });

  // Notify both parties
  try {
    const io = getIO();
    const endPayload = {
      callId,
      duration,
      endedAt: endedAt.toISOString(),
    };

    io.to(`user:${call.initiatorId}`).emit("call-ended", endPayload);
    io.to(`user:${call.receiverId}`).emit("call-ended", endPayload);
  } catch {}

  res.json({
    success: true,
    data: updated,
  });
});

// @desc    Get a fresh Agora token for an active call (reconnection)
// @route   GET /api/calls/:callId/token
export const getCallToken = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const call = await prisma.call.findUnique({ where: { id: callId } });

  if (!call) {
    res.status(404);
    throw new Error("Call not found");
  }

  const isInitiator = call.initiatorId === req.user.id;
  const isReceiver = call.receiverId === req.user.id;

  if (!isInitiator && !isReceiver) {
    res.status(403);
    throw new Error("Not authorized");
  }

  const uid = isInitiator ? call.initiatorUid : call.receiverUid;
  const token = generateRtcToken(call.channelName, uid, "publisher");

  res.json({
    success: true,
    data: {
      agoraAppId: AGORA_APP_ID,
      agoraToken: token,
      agoraUid: uid,
      channelName: call.channelName,
    },
  });
});
