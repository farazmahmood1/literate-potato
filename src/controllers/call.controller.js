import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import { getIO } from "../config/socket.js";
import { generateRtcToken, AGORA_APP_ID } from "../config/agora.js";
import {
  notifyIncomingCall,
  notifyIncomingVideoCall,
  notifyMissedCall,
} from "../services/notification.service.js";

// ─── In-memory call store (MVP — replace with DB table later) ───
const activeCalls = new Map();

function generateCallId() {
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Convert a userId string to a stable integer UID for Agora */
function userIdToUid(userId) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  // Keep within 32-bit unsigned range, avoid 0 (reserved)
  return (hash % 0xfffffffe) + 1;
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

  // Create call record in memory
  const callId = generateCallId();
  const channelName = callId; // use callId as Agora channel name

  // Generate Agora UIDs and token for the initiator
  const initiatorUid = userIdToUid(req.user.id);
  const receiverUid = userIdToUid(otherPartyUserId);
  const initiatorToken = generateRtcToken(channelName, initiatorUid, "publisher");

  const callData = {
    id: callId,
    consultationId,
    initiatorId: req.user.id,
    receiverId: otherPartyUserId,
    type,
    status: "RINGING",
    initiatorName,
    receiverName,
    channelName,
    initiatorUid,
    receiverUid,
    startedAt: null,
    endedAt: null,
    duration: null,
    createdAt: new Date().toISOString(),
  };

  activeCalls.set(callId, callData);

  // Emit incoming-call to the other party via their personal room
  const io = getIO();
  io.to(`user:${otherPartyUserId}`).emit("incoming-call", {
    callId,
    consultationId,
    callerName: initiatorName,
    callType: type,
    isVideo: type === "video",
  });

  // Push notification for incoming call
  if (type === "video") {
    notifyIncomingVideoCall(otherPartyUserId, initiatorName, consultationId, callId);
  } else {
    notifyIncomingCall(otherPartyUserId, initiatorName, consultationId, callId);
  }

  // Auto-expire ringing after 60 seconds
  setTimeout(() => {
    const call = activeCalls.get(callId);
    if (call && call.status === "RINGING") {
      call.status = "MISSED";
      activeCalls.set(callId, call);

      io.to(`user:${req.user.id}`).emit("call-missed", { callId });
      io.to(`user:${otherPartyUserId}`).emit("call-missed", { callId });

      // Push notification for missed call
      notifyMissedCall(otherPartyUserId, initiatorName, consultationId, callId);
    }
  }, 60000);

  res.status(201).json({
    success: true,
    data: {
      ...callData,
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
  const call = activeCalls.get(callId);

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

  call.status = "ACTIVE";
  call.startedAt = new Date().toISOString();
  activeCalls.set(callId, call);

  // Generate Agora token for the receiver
  const receiverToken = generateRtcToken(call.channelName, call.receiverUid, "publisher");

  // Notify the initiator (they already have their token)
  const io = getIO();
  io.to(`user:${call.initiatorId}`).emit("call-accepted", {
    callId,
    acceptedAt: call.startedAt,
  });
  io.to(`user:${call.receiverId}`).emit("call-accepted", {
    callId,
    acceptedAt: call.startedAt,
  });

  res.json({
    success: true,
    data: {
      ...call,
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
  const call = activeCalls.get(callId);

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

  call.status = "DECLINED";
  activeCalls.set(callId, call);

  // Notify the initiator
  const io = getIO();
  io.to(`user:${call.initiatorId}`).emit("call-declined", { callId });

  res.json({
    success: true,
    data: call,
  });
});

// @desc    End an active call
// @route   PUT /api/calls/:callId/end
export const endCall = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const call = activeCalls.get(callId);

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

  call.status = "ENDED";
  call.endedAt = new Date().toISOString();

  // Calculate duration in seconds (only if the call was active)
  if (call.startedAt) {
    const start = new Date(call.startedAt).getTime();
    const end = new Date(call.endedAt).getTime();
    call.duration = Math.round((end - start) / 1000);
  } else {
    call.duration = 0;
  }

  activeCalls.set(callId, call);

  // Notify both parties
  const io = getIO();
  const endPayload = {
    callId,
    duration: call.duration,
    endedAt: call.endedAt,
  };

  io.to(`user:${call.initiatorId}`).emit("call-ended", endPayload);
  io.to(`user:${call.receiverId}`).emit("call-ended", endPayload);

  // Clean up after a short delay (keep in memory briefly for late queries)
  setTimeout(() => {
    activeCalls.delete(callId);
  }, 30000);

  res.json({
    success: true,
    data: call,
  });
});

// @desc    Get a fresh Agora token for an active call (reconnection)
// @route   GET /api/calls/:callId/token
export const getCallToken = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const call = activeCalls.get(callId);

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
