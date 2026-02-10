import { Expo } from "expo-server-sdk";
import prisma from "../lib/prisma.js";

const expo = new Expo();

// ─── Active trial timers (keyed by consultationId) ───
const trialTimers = new Map();

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
export function notifyConsultationAccepted(clientId, lawyerName, consultationId, trialEndAt) {
  sendToUserIfAllowed(clientId, "consultationUpdates", "Consultation Accepted",
    `Attorney ${lawyerName} has accepted your consultation request.`,
    { type: "consultation_accepted", consultationId }
  );

  // Also notify trial started
  sendToUserIfAllowed(clientId, "consultationUpdates", "Trial Started",
    `Your 3-minute trial with ${lawyerName} has begun.`,
    { type: "trial_started", consultationId, trialEndAt }
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
}

/**
 * Notify client that consultation is completed.
 */
export function notifyConsultationCompleted(clientId, lawyerName, consultationId) {
  sendToUserIfAllowed(clientId, "consultationUpdates", "Consultation Completed",
    `Your consultation with ${lawyerName} is complete. Leave a review!`,
    { type: "consultation_completed", consultationId }
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
}

/**
 * Notify the receiver of an incoming video call.
 */
export function notifyIncomingVideoCall(receiverUserId, callerName, consultationId, callId) {
  sendToUserIfAllowed(receiverUserId, "consultationUpdates", "Incoming Video Call",
    `${callerName} is video calling you.`,
    { type: "incoming_video_call", consultationId, callId }
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
}

// ─────────────────────────────────────────────────────
// Review notifications
// ─────────────────────────────────────────────────────

/**
 * Notify lawyer of a new review.
 */
export function notifyNewReview(lawyerUserId, reviewerName, rating, consultationId) {
  const stars = rating === 1 ? "1-star" : `${rating}-star`;
  sendToUserIfAllowed(lawyerUserId, "consultationUpdates", "New Review",
    `${reviewerName} left you a ${stars} review!`,
    { type: "new_review", consultationId, rating }
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
}

// ─────────────────────────────────────────────────────
// Account & verification notifications
// ─────────────────────────────────────────────────────

/**
 * Notify lawyer that their profile was verified by admin.
 */
export function notifyVerificationApproved(lawyerUserId) {
  sendToUserIfAllowed(lawyerUserId, "securityAlerts", "Verification Approved",
    "Your profile has been verified. You're now visible to clients.",
    { type: "verification_approved" }
  );
}

/**
 * Notify lawyer that their verification was rejected.
 */
export function notifyVerificationRejected(lawyerUserId) {
  sendToUserIfAllowed(lawyerUserId, "securityAlerts", "Verification Update",
    "Your verification was not approved. Please resubmit documents.",
    { type: "verification_rejected" }
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
}

/**
 * Notify user that their password was changed.
 */
export function notifyPasswordChanged(userId) {
  sendToUserIfAllowed(userId, "securityAlerts", "Password Changed",
    "Your password was successfully updated.",
    { type: "password_changed" }
  );
}

// ─────────────────────────────────────────────────────
// Job post notifications
// ─────────────────────────────────────────────────────

/**
 * Notify a lawyer about a new job post in their state.
 */
export function notifyNewJobPost(lawyerUserId, clientName, category, state, jobPostId) {
  sendToUserIfAllowed(lawyerUserId, "consultationUpdates", "New Job Post",
    `${clientName} needs help with ${category} in ${state}. First 3 min free.`,
    { type: "new_job_post", jobPostId, category, state }
  );
}

/**
 * Notify client that a lawyer accepted their job post.
 */
export function notifyJobPostAccepted(clientUserId, lawyerName, jobPostId, consultationId) {
  sendToUserIfAllowed(clientUserId, "consultationUpdates", "Job Post Accepted",
    `Attorney ${lawyerName} has accepted your job post. A 3-minute free trial has started.`,
    { type: "job_post_accepted", jobPostId, consultationId }
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
    }
  }
}
