import { Server } from "socket.io";
import { verifyToken } from "@clerk/express";
import prisma from "../lib/prisma.js";
import { notifyNewMessage } from "../services/notification.service.js";
import { moderateMessage } from "../services/moderation.service.js";

let io;

// Track connected sockets per userId: Map<userId, Set<socketId>>
const connectedUsers = new Map();

/**
 * Check if a user is currently connected via at least one socket.
 */
export function isUserOnline(userId) {
  const sockets = connectedUsers.get(userId);
  return sockets && sockets.size > 0;
}

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: true, // Allow all origins (mobile apps don't have browser CORS risks)
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Auth middleware — verify Clerk JWT on connection
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Authentication required"));

      const decoded = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });

      if (!decoded?.sub) return next(new Error("Invalid token"));

      const user = await prisma.user.findUnique({
        where: { clerkId: decoded.sub },
        select: { id: true, role: true, firstName: true, lastName: true },
      });

      if (!user) return next(new Error("User not found"));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user.id;
    const userRole = socket.user.role;

    // Join personal room for direct notifications
    socket.join(`user:${userId}`);

    // ─── Track user connection for online status ───
    if (!connectedUsers.has(userId)) {
      connectedUsers.set(userId, new Set());
    }
    const wasOffline = connectedUsers.get(userId).size === 0;
    connectedUsers.get(userId).add(socket.id);

    // Broadcast online status if user just came online
    if (wasOffline) {
      io.emit("user-status-change", { userId, status: "online" });

      // If user is a LAWYER, update profile + emit status in a single query chain
      if (userRole === "LAWYER") {
        // Single query: update and return in one step (updateMany + findUnique combined)
        prisma.lawyerProfile.update({
          where: { userId },
          data: { onlineStatus: "online", isAvailable: true, lastActiveAt: new Date() },
          select: { id: true, specializations: true },
        }).then((profile) => {
          if (profile) {
            io.emit("lawyer-status-change", { lawyerId: profile.id, userId, status: "online" });
          }
          // Skip job post notifications on connect — lawyers will see them when they open dashboard
        }).catch(() => {});
      }
    }

    // Debounced lastActiveAt — socket already tracks presence, no need for frequent DB writes
    // (auth middleware also updates this with a 30s throttle)

    // ─── Re-emit any pending incoming call ───
    // If the user's socket was disconnected when the call was initiated,
    // the original incoming-call event was lost.  Re-emit it now so the
    // client can show the IncomingCallSheet.
    prisma.call.findFirst({
      where: {
        receiverId: userId,
        status: "RINGING",
        createdAt: { gt: new Date(Date.now() - 60_000) }, // still within the 60-second ring window
      },
      orderBy: { createdAt: "desc" },
    }).then((pendingCall) => {
      if (pendingCall) {
        socket.emit("incoming-call", {
          callId: pendingCall.id,
          consultationId: pendingCall.consultationId,
          callerName: pendingCall.initiatorName,
          callType: pendingCall.type,
          isVideo: pendingCall.type === "video",
        });
        if (process.env.NODE_ENV !== "production") {
          console.log(`[Socket] Re-emitted pending incoming-call ${pendingCall.id} to user ${userId}`);
        }
      }
    }).catch((err) => {
      console.error("[Socket] Pending call check error:", err?.message);
    });

    // ─── Query online status for specific users ───
    socket.on("get-users-status", (userIds) => {
      if (!Array.isArray(userIds)) return;
      const statuses = {};
      for (const uid of userIds) {
        statuses[uid] = isUserOnline(uid) ? "online" : "offline";
      }
      socket.emit("users-status-response", statuses);
    });

    // ─── Bulk query: all non-offline lawyers ───
    socket.on("get-online-lawyers", async () => {
      try {
        const profiles = await prisma.lawyerProfile.findMany({
          where: { onlineStatus: { in: ["online", "busy"] } },
          select: { id: true, onlineStatus: true },
        });
        const statuses = {};
        for (const p of profiles) {
          statuses[p.id] = p.onlineStatus;
        }
        socket.emit("online-lawyers-response", statuses);
      } catch (err) {
        socket.emit("online-lawyers-response", {});
      }
    });

    // Track current consultation room per socket to leave old before joining new
    let currentConsultationRoom = null;

    // Cache consultation participants for redundant typing delivery (avoids DB query per keystroke)
    if (!socket.consultationParticipants) socket.consultationParticipants = {};

    // ─── Join a consultation room ───
    socket.on("join-consultation", async ({ consultationId }) => {
      try {
        const consultation = await prisma.consultation.findUnique({
          where: { id: consultationId },
          include: { lawyer: { select: { userId: true } } },
        });

        if (!consultation) return;

        // Verify participant
        const isClient = consultation.clientId === userId;
        const isLawyer = consultation.lawyer.userId === userId;
        if (!isClient && !isLawyer) return;

        // Leave previous consultation room before joining new one
        if (currentConsultationRoom && currentConsultationRoom !== `consultation:${consultationId}`) {
          socket.leave(currentConsultationRoom);
        }

        const roomName = `consultation:${consultationId}`;
        socket.join(roomName);
        currentConsultationRoom = roomName;

        // Cache participants for typing event delivery
        socket.consultationParticipants[consultationId] = {
          clientId: consultation.clientId,
          lawyerUserId: consultation.lawyer.userId,
        };

        socket.emit("joined-consultation", { consultationId });
      } catch (err) {
        socket.emit("error", { message: "Failed to join consultation" });
      }
    });

    // ─── Send a message ───
    socket.on("send-message", async ({ consultationId, content, messageType = "TEXT", replyToId }) => {
      try {
        const consultation = await prisma.consultation.findUnique({
          where: { id: consultationId },
          include: { lawyer: { select: { userId: true } } },
        });

        if (!consultation) {
          return socket.emit("error", { message: "Consultation not found" });
        }

        // Allow messages on ended consultations so parties can still communicate

        // Block messages after trial expired (if no payment)
        if (
          consultation.status === "TRIAL" &&
          consultation.trialEndAt &&
          new Date() > consultation.trialEndAt
        ) {
          const payment = await prisma.payment.findUnique({
            where: { consultationId },
          });
          if (!payment || payment.status !== "SUCCEEDED") {
            return socket.emit("error", { message: "Trial has expired. Please pay to continue." });
          }
        }

        // ── Content moderation (text messages only) ──
        if (messageType === "TEXT" && content) {
          const modResult = await moderateMessage(content, {
            senderRole: socket.user.role,
            senderId: userId,
          });

          if (!modResult.allowed) {
            return socket.emit("message-blocked", {
              reason: modResult.reason || "Your message was blocked by our content policy.",
              category: modResult.category,
              consultationId,
            });
          }
        }

        const message = await prisma.message.create({
          data: {
            consultationId,
            senderId: userId,
            content,
            messageType,
            ...(replyToId ? { replyToId } : {}),
          },
          include: {
            sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
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

        // Broadcast to the consultation room
        io.to(`consultation:${consultationId}`).emit("new-message", message);

        // Auto-clear typing indicator when a message is sent
        socket.to(`consultation:${consultationId}`).emit("typing-stop", { userId, consultationId });

        // Also emit to both users' personal rooms for guaranteed delivery
        // (ensures messages arrive even if recipient hasn't joined the consultation room yet)
        const lawyerUserId = consultation.lawyer?.userId;
        if (lawyerUserId) io.to(`user:${lawyerUserId}`).emit("new-message", message);
        io.to(`user:${consultation.clientId}`).emit("new-message", message);

        // Push notification to the other participant
        const otherUserId = consultation.clientId === userId ? lawyerUserId : consultation.clientId;
        if (otherUserId) {
          const senderName = `${socket.user.firstName} ${socket.user.lastName}`.trim();
          notifyNewMessage(otherUserId, senderName, messageType, content, consultationId);
        }

        // Update consultation updatedAt
        await prisma.consultation.update({
          where: { id: consultationId },
          data: { updatedAt: new Date() },
        });
      } catch (err) {
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    // ─── Typing indicators ───
    // Redundant delivery: emit to consultation room + other user's personal room
    // (mirrors message triple-delivery pattern so typing works even if room join is delayed)
    socket.on("typing-start", ({ consultationId }) => {
      const payload = {
        userId,
        consultationId,
        name: `${socket.user.firstName} ${socket.user.lastName || ""}`.trim(),
      };
      socket.to(`consultation:${consultationId}`).emit("typing-start", payload);

      // Backup: deliver via personal room
      const participants = socket.consultationParticipants?.[consultationId];
      if (participants) {
        const otherUserId = participants.clientId === userId
          ? participants.lawyerUserId
          : participants.clientId;
        if (otherUserId) {
          socket.to(`user:${otherUserId}`).emit("typing-start", payload);
        }
      }
    });

    socket.on("typing-stop", ({ consultationId }) => {
      const payload = { userId, consultationId };
      socket.to(`consultation:${consultationId}`).emit("typing-stop", payload);

      const participants = socket.consultationParticipants?.[consultationId];
      if (participants) {
        const otherUserId = participants.clientId === userId
          ? participants.lawyerUserId
          : participants.clientId;
        if (otherUserId) {
          socket.to(`user:${otherUserId}`).emit("typing-stop", payload);
        }
      }
    });

    // ─── Read receipts ───
    socket.on("read-receipt", async ({ consultationId }) => {
      try {
        const result = await prisma.message.updateMany({
          where: {
            consultationId,
            senderId: { not: userId },
            isRead: false,
          },
          data: { isRead: true, readAt: new Date() },
        });

        socket.to(`consultation:${consultationId}`).emit("messages-read", {
          consultationId,
          readBy: userId,
        });

        // Emit updated total unread count back to the reader for badge sync
        if (result.count > 0) {
          const totalUnread = await prisma.message.count({
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
          socket.emit("unread-message-count", { count: totalUnread });
        }
      } catch (err) {
        console.error("[Socket] Read receipt error:", err?.message);
      }
    });

    // ─── Disconnect ───
    socket.on("disconnect", () => {
      // Remove socket from connected set
      const sockets = connectedUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        // If no more sockets for this user, they're offline
        if (sockets.size === 0) {
          connectedUsers.delete(userId);
          io.emit("user-status-change", { userId, status: "offline" });

          // Single query: update and return lawyer profile status
          if (userRole === "LAWYER") {
            prisma.lawyerProfile.update({
              where: { userId },
              data: { onlineStatus: "offline", isAvailable: false, lastActiveAt: new Date() },
              select: { id: true },
            }).then((profile) => {
              if (profile) {
                io.emit("lawyer-status-change", { lawyerId: profile.id, userId, status: "offline" });
              }
              // Skip job post notifications on disconnect — dashboard will refresh on next focus
            }).catch(() => {});
          }
        }
      }

      // Update lastActiveAt on disconnect (single write, not on every connect)
      prisma.user.update({
        where: { id: userId },
        data: { lastActiveAt: new Date() },
      }).catch(() => {});
    });
  });

  return io;
}

export function getIO() {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}
