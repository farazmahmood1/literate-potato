import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";

// @desc    Register/update push notification token
// @route   POST /api/notifications/token
export const registerPushToken = asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    res.status(400);
    throw new Error("Push token is required");
  }

  await prisma.user.update({
    where: { id: req.user.id },
    data: { expoPushToken: token },
  });

  res.json({ success: true, message: "Push token registered" });
});

// @desc    Get notification preferences
// @route   GET /api/notifications/preferences
export const getPreferences = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { notificationPreferences: true },
  });

  const defaults = {
    newMessages: true,
    consultationUpdates: true,
    paymentAlerts: true,
    promotions: false,
    securityAlerts: true,
    weeklyDigest: false,
    inAppSounds: true,
  };

  // Merge stored prefs with defaults so new keys always have a value
  const stored = (user?.notificationPreferences ?? {});
  const merged = { ...defaults, ...stored };

  res.json({
    success: true,
    data: merged,
  });
});

// @desc    Update notification preferences
// @route   PUT /api/notifications/preferences
export const updatePreferences = asyncHandler(async (req, res) => {
  // Accept any preference keys from the client
  const {
    newMessages,
    consultationUpdates,
    paymentAlerts,
    promotions,
    securityAlerts,
    weeklyDigest,
    inAppSounds,
  } = req.body;

  const preferences = {
    newMessages: newMessages ?? true,
    consultationUpdates: consultationUpdates ?? true,
    paymentAlerts: paymentAlerts ?? true,
    promotions: promotions ?? false,
    securityAlerts: securityAlerts ?? true,
    weeklyDigest: weeklyDigest ?? false,
    inAppSounds: inAppSounds ?? true,
  };

  await prisma.user.update({
    where: { id: req.user.id },
    data: { notificationPreferences: preferences },
  });

  res.json({ success: true, data: preferences });
});

// ─────────────────────────────────────────────────────
// In-app notification CRUD
// ─────────────────────────────────────────────────────

// @desc    Get paginated notifications for current user
// @route   GET /api/notifications?page=1&limit=20&type=payment&unread=true
export const getNotifications = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const where = { userId: req.user.id };

  // Filter by type prefix (e.g. "payment" matches payment_received, payment_failed, etc.)
  if (req.query.type) {
    where.type = { startsWith: req.query.type };
  }

  // Filter unread only
  if (req.query.unread === "true") {
    where.read = false;
  }

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where }),
  ]);

  res.json({
    success: true,
    data: notifications,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

// @desc    Get unread notification count
// @route   GET /api/notifications/unread-count
export const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await prisma.notification.count({
    where: { userId: req.user.id, read: false },
  });

  res.json({ success: true, data: { count } });
});

// @desc    Mark a single notification as read
// @route   PUT /api/notifications/:id/read
export const markAsRead = asyncHandler(async (req, res) => {
  const notification = await prisma.notification.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });

  if (!notification) {
    res.status(404);
    throw new Error("Notification not found");
  }

  await prisma.notification.update({
    where: { id: req.params.id },
    data: { read: true, readAt: new Date() },
  });

  res.json({ success: true, message: "Notification marked as read" });
});

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
export const markAllAsRead = asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, read: false },
    data: { read: true, readAt: new Date() },
  });

  res.json({ success: true, message: "All notifications marked as read" });
});

// @desc    Delete a single notification
// @route   DELETE /api/notifications/:id
export const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await prisma.notification.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });

  if (!notification) {
    res.status(404);
    throw new Error("Notification not found");
  }

  await prisma.notification.delete({
    where: { id: req.params.id },
  });

  res.json({ success: true, message: "Notification deleted" });
});
