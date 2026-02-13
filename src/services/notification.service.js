import { Expo } from "expo-server-sdk";
import prisma from "../lib/prisma.js";
import { getIO } from "../config/socket.js";
import {
  emailConsultationAccepted,
  emailConsultationCompleted,
  emailConsultationCancelled,
  emailNewConsultationRequest,
  emailPaymentConfirmation,
  emailPaymentReceived,
  emailPaymentFailed,
  emailNewReview,
  emailNewJobPost,
  emailJobPostAccepted,
  emailVerificationApproved,
  emailVerificationRejected,
  emailDisputeOpened,
  emailDisputeResolved,
  emailDisputeEscalated,
  emailTicketReply,
  emailTicketStatusChanged,
} from "./email.service.js";

const expo = new Expo();

// ─── Active trial timers (keyed by consultationId) ───
const trialTimers = new Map();

// ─────────────────────────────────────────────────────
// In-app notification helper
// ─────────────────────────────────────────────────────

/**
 * Create a persistent in-app notification and emit via socket.
 * Always created regardless of user push preferences.
 */
export async function createInAppNotification(userId, type, title, body, data = {}) {
  try {
    const notification = await prisma.notification.create({
      data: { userId, type, title, body, data },
    });

    // Emit real-time socket events
    try {
      const io = getIO();
      io.to(`user:${userId}`).emit("new-notification", notification);

      const unreadCount = await prisma.notification.count({
        where: { userId, read: false },
      });
      io.to(`user:${userId}`).emit("unread-notification-count", { count: unreadCount });
    } catch {
      // Socket not initialized yet (e.g. during startup) — silent fail
    }

    return notification;
  } catch (err) {
    console.error("Failed to create in-app notification:", err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────
// Push notification base functions
// ─────────────────────────────────────────────────────

/**
 * Send a push notification to a specific Expo push token.
 */
export async function sendPushNotification(expoPushToken, title, body, data = {}) {
  if (!Expo.isExpoPushToken(expoPushToken)) {
    console.warn(`Invalid Expo push token: ${expoPushToken}`);
    return null;
  }

  try {
    const messages = [
      {
        to: expoPushToken,
        sound: "default",
        title,
        body,
        data,
      },
    ];

    const tickets = await expo.sendPushNotificationsAsync(messages);
    return tickets[0];
  } catch (err) {
    console.error("Push notification failed:", err.message);
    return null;
  }
}

/**
 * Look up a user's push token and send a notification.
 */
export async function sendToUser(userId, title, body, data = {}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { expoPushToken: true, notificationPreferences: true },
  });

  if (!user || !user.expoPushToken) {
    console.log(`[Notification] No push token for user ${userId} — skipping push`);
    return null;
  }

  return sendPushNotification(user.expoPushToken, title, body, data);
}

/**
 * Send a notification only if the user has the given preference enabled.
 * @param {string} userId
 * @param {string} preferenceKey - e.g. "consultationUpdates", "newMessages", "paymentAlerts"
 * @param {string} title
 * @param {string} body
 * @param {object} data
 */
export async function sendToUserIfAllowed(userId, preferenceKey, title, body, data = {}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { expoPushToken: true, notificationPreferences: true },
  });

  if (!user || !user.expoPushToken) return null;

  // Default preferences (all enabled except promotions/weeklyDigest)
  const defaults = {
    newMessages: true,
    consultationUpdates: true,
    paymentAlerts: true,
    promotions: false,
    securityAlerts: true,
    weeklyDigest: false,
    inAppSounds: true,
  };

  const prefs = { ...defaults, ...(user.notificationPreferences || {}) };

  if (preferenceKey && prefs[preferenceKey] === false) {
    return null; // User has opted out
  }

  return sendPushNotification(user.expoPushToken, title, body, data);
}

// ─────────────────────────────────────────────────────
// Consultation lifecycle notifications
// ─────────────────────────────────────────────────────

/**
 * Notify client that lawyer accepted & trial started.
 */
export function notifyConsultationAccepted(clientId, lawyerName, consultationId, trialEndAt, category) {
  sendToUserIfAllowed(clientId, "consultationUpdates", "Consultation Accepted",
    `Attorney ${lawyerName} has accepted your consultation request.`,
    { type: "consultation_accepted", consultationId }
  );

  // Also notify trial started
  sendToUserIfAllowed(clientId, "consultationUpdates", "Trial Started",
    `Your 3-minute trial with ${lawyerName} has begun.`,
    { type: "trial_started", consultationId, trialEndAt }
  );

  // Email
  emailConsultationAccepted(clientId, lawyerName, consultationId, category);

  // In-app
  createInAppNotification(clientId, "consultation_accepted", "Consultation Accepted",
    `Attorney ${lawyerName} has accepted your consultation request.`,
    { consultationId, trialEndAt }
  );
}

/**
 * Notify client that lawyer declined.
 */
export function notifyConsultationDeclined(clientId, consultationId) {
  sendToUserIfAllowed(clientId, "consultationUpdates", "Consultation Update",
    "Your consultation request was declined. Browse other lawyers.",
    { type: "consultation_declined", consultationId }
  );

  // In-app
  createInAppNotification(clientId, "consultation_declined", "Consultation Update",
    "Your consultation request was declined. Browse other lawyers.",
    { consultationId }
  );
}

/**
 * Notify client that consultation is completed.
 */
export function notifyConsultationCompleted(clientId, lawyerName, consultationId) {
  sendToUserIfAllowed(clientId, "consultationUpdates", "Consultation Completed",
    `Your consultation with ${lawyerName} is complete. Leave a review!`,
    { type: "consultation_completed", consultationId }
  );

  emailConsultationCompleted(clientId, lawyerName, consultationId);

  // In-app
  createInAppNotification(clientId, "consultation_completed", "Consultation Completed",
    `Your consultation with ${lawyerName} is complete. Leave a review!`,
    { consultationId }
  );
}

/**
 * Notify client that lawyer cancelled.
 */
export function notifyConsultationCancelled(clientId, lawyerName, consultationId) {
  sendToUserIfAllowed(clientId, "consultationUpdates", "Consultation Cancelled",
    `Attorney ${lawyerName} has cancelled the consultation.`,
    { type: "consultation_cancelled", consultationId }
  );

  emailConsultationCancelled(clientId, lawyerName);

  // In-app
  createInAppNotification(clientId, "consultation_cancelled", "Consultation Cancelled",
    `Attorney ${lawyerName} has cancelled the consultation.`,
    { consultationId }
  );
}

// ─────────────────────────────────────────────────────
// Trial timer notifications
// ─────────────────────────────────────────────────────

/**
 * Schedule trial expiring (1 min left) and expired notifications.
 * Call this when a trial starts (3-minute trial).
 */
export function scheduleTrialNotifications(clientId, lawyerName, consultationId, trialDurationMs = 3 * 60 * 1000) {
  // Clear any existing timers for this consultation
  cancelTrialNotifications(consultationId);

  const warningMs = trialDurationMs - 60_000; // 1 minute before expiry
  const timers = [];

  // Trial Ending Soon — 1 minute before expiry
  if (warningMs > 0) {
    const warningTimer = setTimeout(() => {
      sendToUserIfAllowed(clientId, "consultationUpdates", "Trial Ending Soon",
        "Your trial ends in 1 minute. Upgrade to continue.",
        { type: "trial_expiring", consultationId }
      );

      // In-app
      createInAppNotification(clientId, "trial_expiring", "Trial Ending Soon",
        "Your trial ends in 1 minute. Upgrade to continue.",
        { consultationId }
      );
    }, warningMs);
    timers.push(warningTimer);
  }

  // Trial Ended — at expiry
  const expiredTimer = setTimeout(async () => {
    // Check if consultation was already upgraded (paid)
    const payment = await prisma.payment.findUnique({
      where: { consultationId },
    }).catch(() => null);

    if (!payment || payment.status !== "SUCCEEDED") {
      sendToUserIfAllowed(clientId, "consultationUpdates", "Trial Ended",
        `Your trial with ${lawyerName} has ended. Upgrade to full consultation.`,
        { type: "trial_expired", consultationId }
      );

      // In-app
      createInAppNotification(clientId, "trial_expired", "Trial Ended",
        `Your trial with ${lawyerName} has ended. Upgrade to full consultation.`,
        { consultationId }
      );
    }

    trialTimers.delete(consultationId);
  }, trialDurationMs);
  timers.push(expiredTimer);

  trialTimers.set(consultationId, timers);
}

/**
 * Cancel scheduled trial notifications (e.g. when client pays early).
 */
export function cancelTrialNotifications(consultationId) {
  const timers = trialTimers.get(consultationId);
  if (timers) {
    timers.forEach(clearTimeout);
    trialTimers.delete(consultationId);
  }
}

// ─────────────────────────────────────────────────────
// Scheduled consultation reminders
// ─────────────────────────────────────────────────────

// Active reminder timers (keyed by consultationId)
const reminderTimers = new Map();

/**
 * Schedule a 15-minute-before reminder for a scheduled consultation.
 */
export function scheduleConsultationReminder(clientId, lawyerName, consultationId, scheduledAt) {
  // Cancel existing reminder
  cancelConsultationReminder(consultationId);

  const reminderTime = new Date(scheduledAt).getTime() - 15 * 60_000; // 15 min before
  const now = Date.now();
  const delay = reminderTime - now;

  if (delay <= 0) return; // Already past the reminder time

  const timer = setTimeout(() => {
    sendToUserIfAllowed(clientId, "consultationUpdates", "Upcoming Consultation",
      `Your consultation with ${lawyerName} starts in 15 minutes.`,
      { type: "consultation_reminder", consultationId }
    );

    // In-app
    createInAppNotification(clientId, "consultation_reminder", "Upcoming Consultation",
      `Your consultation with ${lawyerName} starts in 15 minutes.`,
      { consultationId }
    );

    reminderTimers.delete(consultationId);
  }, delay);

  reminderTimers.set(consultationId, timer);
}

export function cancelConsultationReminder(consultationId) {
  const timer = reminderTimers.get(consultationId);
  if (timer) {
    clearTimeout(timer);
    reminderTimers.delete(consultationId);
  }
}

// ─────────────────────────────────────────────────────
// Message notifications
// ─────────────────────────────────────────────────────

/**
 * Send a push notification for a new message.
 * NOTE: No in-app notification created — messages have their own chat system.
 * @param {string} recipientUserId - The user who should receive the notification
 * @param {string} senderName - Display name of the sender
 * @param {string} messageType - "TEXT", "DOCUMENT", "IMAGE"
 * @param {string} content - The message content (for TEXT messages)
 * @param {string} consultationId
 */
export function notifyNewMessage(recipientUserId, senderName, messageType, content, consultationId) {
  let title, body;

  switch (messageType) {
    case "DOCUMENT":
      title = "New Document";
      body = `${senderName} sent you a document.`;
      break;
    case "IMAGE":
      title = "New Attachment";
      body = `${senderName} sent you an image.`;
      break;
    default: {
      title = "New Message";
      const preview = content && content.length > 60
        ? content.substring(0, 60).trim() + "..."
        : content || "";
      body = `${senderName}: ${preview}`;
      break;
    }
  }

  sendToUserIfAllowed(recipientUserId, "newMessages", title, body, {
    type: "new_message",
    consultationId,
    messageType,
  });
}

// ─────────────────────────────────────────────────────
// Call notifications
// ─────────────────────────────────────────────────────

/**
 * Notify the receiver of an incoming voice call.
 */
export function notifyIncomingCall(receiverUserId, callerName, consultationId, callId) {
  sendToUserIfAllowed(receiverUserId, "consultationUpdates", "Incoming Call",
    `${callerName} is calling you.`,
    { type: "incoming_call", consultationId, callId }
  );

  // In-app
  createInAppNotification(receiverUserId, "incoming_call", "Incoming Call",
    `${callerName} is calling you.`,
    { consultationId, callId }
  );
}

/**
 * Notify the receiver of an incoming video call.
 */
export function notifyIncomingVideoCall(receiverUserId, callerName, consultationId, callId) {
  sendToUserIfAllowed(receiverUserId, "consultationUpdates", "Incoming Video Call",
    `${callerName} is video calling you.`,
    { type: "incoming_video_call", consultationId, callId }
  );

  // In-app
  createInAppNotification(receiverUserId, "incoming_video_call", "Incoming Video Call",
    `${callerName} is video calling you.`,
    { consultationId, callId }
  );
}

/**
 * Notify a user of a missed call.
 */
export function notifyMissedCall(userId, callerName, consultationId, callId) {
  sendToUserIfAllowed(userId, "consultationUpdates", "Missed Call",
    `You missed a call from ${callerName}.`,
    { type: "missed_call", consultationId, callId }
  );

  // In-app
  createInAppNotification(userId, "missed_call", "Missed Call",
    `You missed a call from ${callerName}.`,
    { consultationId, callId }
  );
}

// ─────────────────────────────────────────────────────
// Payment notifications
// ─────────────────────────────────────────────────────

/**
 * Notify the lawyer that a payment was received.
 * @param {number} amountCents - Amount in cents
 */
export function notifyPaymentReceived(lawyerUserId, clientName, amountCents, consultationId) {
  const dollars = (amountCents / 100).toFixed(2);
  sendToUserIfAllowed(lawyerUserId, "paymentAlerts", "Payment Received",
    `You received $${dollars} from ${clientName}.`,
    { type: "payment_received", consultationId, amount: amountCents }
  );

  emailPaymentReceived(lawyerUserId, clientName, amountCents, consultationId);

  // In-app
  createInAppNotification(lawyerUserId, "payment_received", "Payment Received",
    `You received $${dollars} from ${clientName}.`,
    { consultationId, amount: amountCents }
  );
}

/**
 * Notify client that their payment succeeded.
 */
export function notifyPaymentSucceeded(clientUserId, lawyerName, amountCents, consultationId) {
  const dollars = (amountCents / 100).toFixed(2);
  sendToUserIfAllowed(clientUserId, "paymentAlerts", "Payment Confirmed",
    `Your payment of $${dollars} to ${lawyerName} was successful.`,
    { type: "payment_succeeded", consultationId, amount: amountCents }
  );

  emailPaymentConfirmation(clientUserId, lawyerName, amountCents, consultationId);

  // In-app
  createInAppNotification(clientUserId, "payment_succeeded", "Payment Confirmed",
    `Your payment of $${dollars} to ${lawyerName} was successful.`,
    { consultationId, amount: amountCents }
  );
}

/**
 * Notify client that their payment failed.
 */
export function notifyPaymentFailed(clientUserId, amountCents, consultationId) {
  const dollars = (amountCents / 100).toFixed(2);
  sendToUserIfAllowed(clientUserId, "paymentAlerts", "Payment Failed",
    `Your payment of $${dollars} failed. Please update your payment method.`,
    { type: "payment_failed", consultationId, amount: amountCents }
  );

  emailPaymentFailed(clientUserId, amountCents);

  // In-app
  createInAppNotification(clientUserId, "payment_failed", "Payment Failed",
    `Your payment of $${dollars} failed. Please update your payment method.`,
    { consultationId, amount: amountCents }
  );
}

/**
 * Notify lawyer that a payout was sent to their bank.
 */
export function notifyPayoutSent(lawyerUserId, amountCents) {
  const dollars = (amountCents / 100).toFixed(2);
  sendToUserIfAllowed(lawyerUserId, "paymentAlerts", "Payout Sent",
    `A payout of $${dollars} has been sent to your bank account.`,
    { type: "payout_sent", amount: amountCents }
  );

  // In-app
  createInAppNotification(lawyerUserId, "payout_sent", "Payout Sent",
    `A payout of $${dollars} has been sent to your bank account.`,
    { amount: amountCents }
  );
}

/**
 * Notify lawyer that a payout failed.
 */
export function notifyPayoutFailed(lawyerUserId, amountCents) {
  const dollars = (amountCents / 100).toFixed(2);
  sendToUserIfAllowed(lawyerUserId, "paymentAlerts", "Payout Failed",
    `Your payout of $${dollars} failed. Check your Stripe settings.`,
    { type: "payout_failed", amount: amountCents }
  );

  // In-app
  createInAppNotification(lawyerUserId, "payout_failed", "Payout Failed",
    `Your payout of $${dollars} failed. Check your Stripe settings.`,
    { amount: amountCents }
  );
}

// ─────────────────────────────────────────────────────
// Review notifications
// ─────────────────────────────────────────────────────

/**
 * Notify lawyer of a new review.
 */
export function notifyNewReview(lawyerUserId, reviewerName, rating, consultationId, comment) {
  const stars = rating === 1 ? "1-star" : `${rating}-star`;
  sendToUserIfAllowed(lawyerUserId, "consultationUpdates", "New Review",
    `${reviewerName} left you a ${stars} review!`,
    { type: "new_review", consultationId, rating }
  );

  emailNewReview(lawyerUserId, reviewerName, rating, comment);

  // In-app
  createInAppNotification(lawyerUserId, "new_review", "New Review",
    `${reviewerName} left you a ${stars} review!`,
    { consultationId, rating }
  );
}

/**
 * Notify lawyer of a rating milestone (e.g., 50 five-star reviews).
 */
export function notifyRatingMilestone(lawyerUserId, fiveStarCount) {
  sendToUserIfAllowed(lawyerUserId, "consultationUpdates", "Milestone",
    `Congratulations! You've reached ${fiveStarCount} five-star reviews.`,
    { type: "rating_milestone", fiveStarCount }
  );

  // In-app
  createInAppNotification(lawyerUserId, "rating_milestone", "Milestone",
    `Congratulations! You've reached ${fiveStarCount} five-star reviews.`,
    { fiveStarCount }
  );
}

// ─────────────────────────────────────────────────────
// Account & verification notifications
// ─────────────────────────────────────────────────────

/**
 * Notify lawyer that their profile was verified by admin.
 */
export function notifyVerificationApproved(lawyerUserId, lawyerName) {
  sendToUserIfAllowed(lawyerUserId, "securityAlerts", "Verification Approved",
    "Your profile has been verified. You're now visible to clients.",
    { type: "verification_approved" }
  );

  emailVerificationApproved(lawyerUserId, lawyerName || "Attorney");

  // In-app
  createInAppNotification(lawyerUserId, "verification_approved", "Verification Approved",
    "Your profile has been verified. You're now visible to clients.",
    {}
  );
}

/**
 * Notify lawyer that their verification was rejected.
 */
export function notifyVerificationRejected(lawyerUserId, lawyerName) {
  sendToUserIfAllowed(lawyerUserId, "securityAlerts", "Verification Update",
    "Your verification was not approved. Please resubmit documents.",
    { type: "verification_rejected" }
  );

  emailVerificationRejected(lawyerUserId, lawyerName || "Attorney");

  // In-app
  createInAppNotification(lawyerUserId, "verification_rejected", "Verification Update",
    "Your verification was not approved. Please resubmit documents.",
    {}
  );
}

/**
 * Notify user of a new sign-in from a different device.
 */
export function notifyNewSignIn(userId) {
  sendToUserIfAllowed(userId, "securityAlerts", "New Sign-In",
    "Your account was signed in from a new device.",
    { type: "new_sign_in" }
  );

  // In-app
  createInAppNotification(userId, "new_sign_in", "New Sign-In",
    "Your account was signed in from a new device.",
    {}
  );
}

/**
 * Notify user that their password was changed.
 */
export function notifyPasswordChanged(userId) {
  sendToUserIfAllowed(userId, "securityAlerts", "Password Changed",
    "Your password was successfully updated.",
    { type: "password_changed" }
  );

  // In-app
  createInAppNotification(userId, "password_changed", "Password Changed",
    "Your password was successfully updated.",
    {}
  );
}

// ─────────────────────────────────────────────────────
// Job post notifications
// ─────────────────────────────────────────────────────

/**
 * Notify a lawyer about a new job post in their state.
 */
export function notifyNewJobPost(lawyerUserId, clientName, category, state, jobPostId, description) {
  sendToUserIfAllowed(lawyerUserId, "consultationUpdates", "New Job Post",
    `${clientName} needs help with ${category} in ${state}. First 3 min free.`,
    { type: "new_job_post", jobPostId, category, state }
  );

  emailNewJobPost(lawyerUserId, clientName, category, state, description, jobPostId);

  // In-app
  createInAppNotification(lawyerUserId, "new_job_post", "New Job Post",
    `${clientName} needs help with ${category} in ${state}. First 3 min free.`,
    { jobPostId, category, state }
  );
}

/**
 * Notify client that a lawyer accepted their job post.
 */
export function notifyJobPostAccepted(clientUserId, lawyerName, jobPostId, consultationId, category) {
  sendToUserIfAllowed(clientUserId, "consultationUpdates", "Job Post Accepted",
    `Attorney ${lawyerName} has accepted your job post. A 3-minute free trial has started.`,
    { type: "job_post_accepted", jobPostId, consultationId }
  );

  emailJobPostAccepted(clientUserId, lawyerName, category, consultationId);

  // In-app
  createInAppNotification(clientUserId, "job_post_accepted", "Job Post Accepted",
    `Attorney ${lawyerName} has accepted your job post. A 3-minute free trial has started.`,
    { jobPostId, consultationId }
  );
}

// ─────────────────────────────────────────────────────
// Profile view notifications
// ─────────────────────────────────────────────────────

/**
 * Notify a lawyer that someone viewed their profile.
 */
export function notifyProfileViewed(lawyerUserId, viewerName) {
  // In-app only — no push or email for profile views
  createInAppNotification(lawyerUserId, "profile_viewed", "Profile Viewed",
    `${viewerName} viewed your profile.`,
    {}
  );
}

// ─────────────────────────────────────────────────────
// Inactivity reminder (for lawyers)
// ─────────────────────────────────────────────────────

/**
 * Send inactivity reminder to lawyers who haven't been active for 7+ days.
 * Call this from a cron job or scheduled task.
 */
export async function sendInactivityReminders() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const inactiveLawyers = await prisma.lawyerProfile.findMany({
    where: {
      lastActiveAt: { lt: sevenDaysAgo },
      user: { expoPushToken: { not: null } },
    },
    include: {
      user: { select: { id: true, expoPushToken: true } },
      _count: { select: { consultations: { where: { status: "PENDING" } } } },
    },
  });

  for (const lawyer of inactiveLawyers) {
    const pending = lawyer._count.consultations;
    if (pending > 0) {
      sendToUserIfAllowed(lawyer.user.id, "consultationUpdates", "We Miss You",
        `You have ${pending} pending consultation request${pending !== 1 ? "s" : ""}. Check them now.`,
        { type: "inactivity_reminder", pendingCount: pending }
      );

      // In-app
      createInAppNotification(lawyer.user.id, "inactivity_reminder", "We Miss You",
        `You have ${pending} pending consultation request${pending !== 1 ? "s" : ""}. Check them now.`,
        { pendingCount: pending }
      );
    }
  }
}

// ─────────────────────────────────────────────────────
// Dispute notifications
// ─────────────────────────────────────────────────────

/**
 * Notify lawyer that a dispute was opened against them.
 */
export function notifyDisputeOpened(lawyerUserId, clientName, category, disputeId) {
  sendToUserIfAllowed(lawyerUserId, "consultationUpdates", "Dispute Opened",
    `${clientName} has filed a dispute regarding ${category}.`,
    { type: "dispute_opened", disputeId }
  );

  emailDisputeOpened(lawyerUserId, clientName, category, disputeId);

  // In-app
  createInAppNotification(lawyerUserId, "dispute_opened", "Dispute Opened",
    `${clientName} has filed a dispute regarding ${category}.`,
    { disputeId }
  );
}

/**
 * Notify client that the lawyer responded to the dispute.
 */
export function notifyDisputeResponse(clientUserId, lawyerName, disputeId) {
  sendToUserIfAllowed(clientUserId, "consultationUpdates", "Dispute Response",
    `Attorney ${lawyerName} has responded to your dispute.`,
    { type: "dispute_response", disputeId }
  );

  // In-app
  createInAppNotification(clientUserId, "dispute_response", "Dispute Response",
    `Attorney ${lawyerName} has responded to your dispute.`,
    { disputeId }
  );
}

/**
 * Notify user that the dispute was escalated to admin.
 */
export function notifyDisputeEscalated(userId, disputeId) {
  sendToUserIfAllowed(userId, "consultationUpdates", "Dispute Escalated",
    "The dispute has been escalated to admin review.",
    { type: "dispute_escalated", disputeId }
  );

  emailDisputeEscalated(userId, disputeId);

  // In-app
  createInAppNotification(userId, "dispute_escalated", "Dispute Escalated",
    "The dispute has been escalated to admin review.",
    { disputeId }
  );
}

/**
 * Notify user of dispute resolution.
 */
export function notifyDisputeResolved(userId, resolutionType, refundAmount, disputeId) {
  const refundStr = refundAmount ? ` — $${(refundAmount / 100).toFixed(2)} refunded` : "";
  const typeLabel = resolutionType.replace(/_/g, " ").toLowerCase();
  sendToUserIfAllowed(userId, "consultationUpdates", "Dispute Resolved",
    `Your dispute has been resolved: ${typeLabel}${refundStr}.`,
    { type: "dispute_resolved", disputeId, resolutionType, refundAmount }
  );

  emailDisputeResolved(userId, resolutionType, refundAmount, disputeId);

  // In-app
  createInAppNotification(userId, "dispute_resolved", "Dispute Resolved",
    `Your dispute has been resolved: ${typeLabel}${refundStr}.`,
    { disputeId, resolutionType, refundAmount }
  );
}

/**
 * Notify other party when evidence is added.
 */
export function notifyDisputeEvidenceAdded(userId, submitterName, disputeId) {
  sendToUserIfAllowed(userId, "consultationUpdates", "New Evidence",
    `${submitterName} added evidence to the dispute.`,
    { type: "dispute_evidence", disputeId }
  );

  // In-app
  createInAppNotification(userId, "dispute_evidence", "New Evidence",
    `${submitterName} added evidence to the dispute.`,
    { disputeId }
  );
}

/**
 * Notify other party when a resolution is proposed.
 */
export function notifyDisputeProposal(userId, proposerName, disputeId) {
  sendToUserIfAllowed(userId, "consultationUpdates", "Resolution Proposed",
    `${proposerName} has proposed a resolution for the dispute.`,
    { type: "dispute_proposal", disputeId }
  );

  // In-app
  createInAppNotification(userId, "dispute_proposal", "Resolution Proposed",
    `${proposerName} has proposed a resolution for the dispute.`,
    { disputeId }
  );
}

/**
 * Notify user of approaching deadline.
 */
export function notifyDisputeDeadline(userId, disputeId, deadlineType) {
  const msg = deadlineType === "lawyer_response"
    ? "You have 24 hours to respond to the dispute."
    : "The mediation period ends in 24 hours.";
  sendToUserIfAllowed(userId, "consultationUpdates", "Dispute Deadline",
    msg,
    { type: "dispute_deadline", disputeId, deadlineType }
  );

  // In-app
  createInAppNotification(userId, "dispute_deadline", "Dispute Deadline",
    msg,
    { disputeId, deadlineType }
  );
}

// ─────────────────────────────────────────────────────
// Support Ticket notifications
// ─────────────────────────────────────────────────────

/**
 * Notify user that an admin replied to their support ticket.
 */
export function notifyTicketReply(userId, ticketId, subject) {
  sendToUserIfAllowed(userId, "consultationUpdates", "Support Ticket Update",
    `An admin replied to your ticket: "${subject}"`,
    { type: "ticket_reply", ticketId }
  );

  emailTicketReply(userId, subject, ticketId);

  createInAppNotification(userId, "ticket_reply", "Support Ticket Update",
    `An admin replied to your ticket: "${subject}"`,
    { ticketId }
  );
}

/**
 * Notify user that their support ticket status changed (resolved/closed).
 */
export function notifyTicketStatusChanged(userId, ticketId, subject, newStatus) {
  const statusLabel = newStatus === "RESOLVED" ? "resolved" : newStatus === "CLOSED" ? "closed" : "updated";
  const title = "Ticket " + statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1);

  sendToUserIfAllowed(userId, "consultationUpdates", title,
    `Your support ticket "${subject}" has been ${statusLabel}.`,
    { type: "ticket_status_changed", ticketId, status: newStatus }
  );

  emailTicketStatusChanged(userId, subject, newStatus, ticketId);

  createInAppNotification(userId, "ticket_status_changed", title,
    `Your support ticket "${subject}" has been ${statusLabel}.`,
    { ticketId, status: newStatus }
  );
}

// ─────────────────────────────────────────────────────
// Startup cleanup: handle expired TRIAL consultations
// that were missed because in-memory timers were lost
// ─────────────────────────────────────────────────────
export async function cleanupStaleTrials() {
  try {
    const now = new Date();
    const staleTrials = await prisma.consultation.findMany({
      where: {
        status: "TRIAL",
        trialEndAt: { lt: now },
      },
      select: { id: true, clientId: true },
    });

    for (const trial of staleTrials) {
      // Send the "trial expired" push notification that was missed
      sendToUserIfAllowed(trial.clientId, "consultationUpdates", "Trial Expired",
        "Your free trial has ended. Pay to continue your consultation.",
        { type: "trial_expired", consultationId: trial.id }
      );
    }

    if (staleTrials.length > 0) {
      console.log(`[TrialCleanup] Sent expired notifications for ${staleTrials.length} stale TRIAL consultation(s)`);
    }
  } catch (err) {
    console.error("[TrialCleanup] Error:", err.message);
  }
}
