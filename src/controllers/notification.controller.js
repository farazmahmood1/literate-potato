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
