import sgMail from "../config/sendgrid.js";
import { SENDGRID_FROM_EMAIL } from "../config/sendgrid.js";
import prisma from "../lib/prisma.js";

const APP_NAME = "Lawyer Direct";
const APP_URL = process.env.APP_URL || "https://lawyerdirect.com";

// ─── HTML email wrapper ───

function wrapHtml(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background-color:#1A2B5F;padding:24px 32px;">
              <h1 style="margin:0;color:#C9A84C;font-size:22px;font-weight:700;letter-spacing:0.5px;">${APP_NAME}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #eee;background-color:#fafafa;">
              <p style="margin:0 0 8px;color:#888;font-size:12px;">You received this email because you have an account on ${APP_NAME}.</p>
              <p style="margin:0;color:#888;font-size:12px;">To manage your email preferences, go to Settings &gt; Notifications in the app.</p>
              <p style="margin:8px 0 0;color:#aaa;font-size:11px;">&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Send helpers ───

async function sendEmail(to, subject, htmlBody) {
  if (!process.env.SENDGRID_API_KEY) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[Email] Skipped (no API key): "${subject}" → ${to}`);
    }
    return null;
  }

  try {
    const html = wrapHtml(subject, htmlBody);
    await sgMail.send({
      to,
      from: { email: SENDGRID_FROM_EMAIL, name: APP_NAME },
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send "${subject}" to ${to}:`, err.message);
    return null;
  }
}

/**
 * Look up user email and send if their email notification preference is enabled.
 */
async function sendToUserIfAllowed(userId, subject, htmlBody) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true, notificationPreferences: true },
  });

  if (!user || !user.email) return null;

  const defaults = { emailNotifications: true };
  const prefs = { ...defaults, ...(user.notificationPreferences || {}) };

  if (prefs.emailNotifications === false) return null;

  return sendEmail(user.email, subject, htmlBody);
}

// ─── Reusable components ───

function heading(text) {
  return `<h2 style="margin:0 0 16px;color:#1A2B5F;font-size:20px;font-weight:600;">${text}</h2>`;
}

function paragraph(text) {
  return `<p style="margin:0 0 16px;color:#333;font-size:15px;line-height:1.6;">${text}</p>`;
}

function ctaButton(label, url) {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="background-color:#1A2B5F;border-radius:8px;padding:14px 32px;">
        <a href="${url}" style="color:#C9A84C;text-decoration:none;font-size:15px;font-weight:600;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function infoBox(label, value) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;background-color:#f8f9fa;border-radius:8px;border-left:4px solid #1A2B5F;">
    <tr>
      <td style="padding:12px 16px;">
        <span style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">${label}</span><br/>
        <span style="color:#1A2B5F;font-size:16px;font-weight:600;">${value}</span>
      </td>
    </tr>
  </table>`;
}

function divider() {
  return `<hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />`;
}

// ═══════════════════════════════════════════════════════
//  EMAIL TEMPLATES
// ═══════════════════════════════════════════════════════

// ─── Consultation Lifecycle ───

export function emailConsultationAccepted(clientId, lawyerName, consultationId, category) {
  const html = heading("Your Consultation Request Was Accepted!")
    + paragraph(`Great news — <strong>${lawyerName}</strong> has accepted your consultation request. Your 3-minute free trial has started.`)
    + infoBox("Attorney", lawyerName)
    + infoBox("Category", category || "Legal Consultation")
    + paragraph("Use this time to describe your situation. If you'd like to continue after the trial, you can upgrade right from the chat.")
    + ctaButton("Open Chat", `${APP_URL}/consultation/${consultationId}`)
    + paragraph(`<em style="color:#888;">Tip: Be specific about your legal question to get the most out of your consultation.</em>`);

  sendToUserIfAllowed(clientId, `${lawyerName} accepted your consultation`, html);
}

export function emailConsultationCompleted(clientId, lawyerName, consultationId) {
  const html = heading("Your Consultation is Complete")
    + paragraph(`Your consultation with <strong>${lawyerName}</strong> has ended. We hope you found it helpful!`)
    + paragraph("Take a moment to rate your experience — your feedback helps other clients find the right attorney.")
    + ctaButton("Leave a Review", `${APP_URL}/consultation/${consultationId}/review`)
    + divider()
    + paragraph(`<span style="color:#888;">A receipt has been saved to your account. You can view it anytime in your consultation history.</span>`);

  sendToUserIfAllowed(clientId, "Your consultation is complete — leave a review", html);
}

export function emailConsultationCancelled(clientId, lawyerName) {
  const html = heading("Consultation Cancelled")
    + paragraph(`Your consultation with <strong>${lawyerName}</strong> has been cancelled.`)
    + paragraph("Don't worry — there are other attorneys available who can help. Browse available lawyers and connect with someone new.")
    + ctaButton("Find Another Lawyer", `${APP_URL}/lawyers`);

  sendToUserIfAllowed(clientId, "Your consultation was cancelled", html);
}

// ─── New Consultation Request (Lawyer) ───

export function emailNewConsultationRequest(lawyerUserId, clientName, category, description, consultationId) {
  const preview = description && description.length > 150
    ? description.substring(0, 150).trim() + "..."
    : description || "";

  const html = heading("New Consultation Request")
    + paragraph(`<strong>${clientName}</strong> needs your help with a legal matter.`)
    + infoBox("Category", category)
    + (preview ? infoBox("Issue Preview", preview) : "")
    + paragraph("You have 60 seconds to accept before the request is sent to other attorneys.")
    + ctaButton("View Request", `${APP_URL}/consultation/${consultationId}`)
    + paragraph(`<em style="color:#888;">Open the app to accept or decline this request.</em>`);

  sendToUserIfAllowed(lawyerUserId, `New consultation request from ${clientName}`, html);
}

// ─── Payment Emails ───

export function emailPaymentConfirmation(clientId, lawyerName, amountCents, consultationId) {
  const dollars = (amountCents / 100).toFixed(2);

  const html = heading("Payment Confirmed")
    + paragraph(`Your payment of <strong>$${dollars}</strong> to <strong>${lawyerName}</strong> was successful.`)
    + infoBox("Amount", `$${dollars}`)
    + infoBox("Attorney", lawyerName)
    + infoBox("Status", "Paid")
    + paragraph("Your full consultation is now active. You can continue chatting with your attorney.")
    + ctaButton("Continue Chat", `${APP_URL}/consultation/${consultationId}`)
    + divider()
    + paragraph(`<span style="color:#888;">A receipt is available in your Payment History.</span>`);

  sendToUserIfAllowed(clientId, `Payment of $${dollars} confirmed`, html);
}

export function emailPaymentReceived(lawyerUserId, clientName, amountCents, consultationId) {
  const dollars = (amountCents / 100).toFixed(2);

  const html = heading("You Received a Payment!")
    + paragraph(`<strong>${clientName}</strong> paid <strong>$${dollars}</strong> for your consultation.`)
    + infoBox("Amount", `$${dollars}`)
    + infoBox("Client", clientName)
    + paragraph("Funds will be transferred to your connected bank account on the next payout cycle.")
    + ctaButton("View Earnings", `${APP_URL}/earnings`);

  sendToUserIfAllowed(lawyerUserId, `You received $${dollars} from ${clientName}`, html);
}

export function emailPaymentFailed(clientId, amountCents) {
  const dollars = (amountCents / 100).toFixed(2);

  const html = heading("Payment Failed")
    + paragraph(`Your payment of <strong>$${dollars}</strong> could not be processed.`)
    + paragraph("Please check your payment method and try again. If the issue persists, contact your bank or try a different card.")
    + ctaButton("Update Payment Method", `${APP_URL}/settings/payment-methods`);

  sendToUserIfAllowed(clientId, `Payment of $${dollars} failed — action needed`, html);
}

// ─── Review Received (Lawyer) ───

export function emailNewReview(lawyerUserId, reviewerName, rating, comment) {
  const stars = "★".repeat(rating) + "☆".repeat(5 - rating);

  const html = heading("You Got a New Review!")
    + paragraph(`<strong>${reviewerName}</strong> left you a review.`)
    + `<div style="text-align:center;margin:16px 0;">
        <span style="font-size:28px;color:#C9A84C;letter-spacing:4px;">${stars}</span>
      </div>`
    + (comment ? `<blockquote style="margin:16px 0;padding:16px;background:#f8f9fa;border-left:4px solid #C9A84C;border-radius:4px;color:#333;font-style:italic;">"${comment}"</blockquote>` : "")
    + paragraph("Great reviews help you attract more clients. Keep up the excellent work!")
    + ctaButton("View Your Reviews", `${APP_URL}/profile`);

  sendToUserIfAllowed(lawyerUserId, `${reviewerName} left you a ${rating}-star review`, html);
}

// ─── Job Post (Lawyer) ───

export function emailNewJobPost(lawyerUserId, clientName, category, state, description, jobPostId) {
  const preview = description && description.length > 200
    ? description.substring(0, 200).trim() + "..."
    : description || "";

  const html = heading("New Job Matching Your Expertise")
    + paragraph(`A client in <strong>${state}</strong> needs help with <strong>${category}</strong>.`)
    + infoBox("Category", category)
    + infoBox("State", state)
    + (preview ? infoBox("Description", preview) : "")
    + paragraph("Be the first to respond — the first 3 minutes are free for the client, and you'll get paid if they continue.")
    + ctaButton("View & Accept", `${APP_URL}/job-posts/${jobPostId}`)
    + paragraph(`<em style="color:#888;">This job was sent to attorneys in ${state} who specialize in ${category}.</em>`);

  sendToUserIfAllowed(lawyerUserId, `New ${category} job in ${state} — respond now`, html);
}

export function emailJobPostAccepted(clientId, lawyerName, category, consultationId) {
  const html = heading("An Attorney Accepted Your Job Post!")
    + paragraph(`<strong>${lawyerName}</strong> has accepted your <strong>${category}</strong> request and is ready to help.`)
    + paragraph("A 3-minute free trial has started. Use this time to describe your situation and see if this attorney is the right fit.")
    + ctaButton("Start Chatting", `${APP_URL}/consultation/${consultationId}`);

  sendToUserIfAllowed(clientId, `${lawyerName} accepted your job post`, html);
}

// ─── Verification (Lawyer) ───

export function emailVerificationApproved(lawyerUserId, lawyerName) {
  const html = heading("You're Verified!")
    + paragraph(`Congratulations, <strong>${lawyerName}</strong>! Your profile has been verified by our team.`)
    + `<div style="text-align:center;margin:24px 0;">
        <span style="display:inline-block;background:#e8f5e9;color:#2e7d32;padding:12px 24px;border-radius:24px;font-size:16px;font-weight:600;">✓ Verified Attorney</span>
      </div>`
    + paragraph("Your profile is now visible to clients. Make sure your availability is set to Online to start receiving consultation requests.")
    + ctaButton("Go Online Now", `${APP_URL}/dashboard`)
    + paragraph(`<em style="color:#888;">Tip: Complete your profile bio and add a professional photo to attract more clients.</em>`);

  sendToUserIfAllowed(lawyerUserId, "Your profile is verified — start accepting clients", html);
}

export function emailVerificationRejected(lawyerUserId, lawyerName) {
  const html = heading("Verification Update")
    + paragraph(`Hi ${lawyerName}, unfortunately we weren't able to verify your credentials at this time.`)
    + paragraph("This could be due to unclear documents, mismatched information, or incomplete submissions. Please review your documents and resubmit.")
    + ctaButton("Resubmit Documents", `${APP_URL}/profile/edit`)
    + paragraph(`If you believe this is an error, please contact our support team at <a href="mailto:support@lawyerdirect.com" style="color:#1A2B5F;">support@lawyerdirect.com</a>.`);

  sendToUserIfAllowed(lawyerUserId, "Verification update — action needed", html);
}

// ─── Welcome Email ───

export function emailWelcome(userId, firstName, role) {
  const isLawyer = role === "LAWYER";

  const html = heading(`Welcome to ${APP_NAME}, ${firstName}!`)
    + paragraph(isLawyer
      ? "You've joined a platform where clients can connect with licensed attorneys for affordable, on-demand legal consultations."
      : "You now have access to licensed attorneys who can help with your legal questions — anytime, anywhere.")
    + divider()
    + (isLawyer
      ? paragraph("<strong>Here's how to get started:</strong>")
        + `<ol style="color:#333;font-size:15px;line-height:2;">
            <li>Complete your profile with your specializations and bio</li>
            <li>Wait for our team to verify your credentials</li>
            <li>Set your status to Online and start receiving consultation requests</li>
            <li>Earn money by helping clients with legal questions</li>
          </ol>`
      : paragraph("<strong>Here's how it works:</strong>")
        + `<ol style="color:#333;font-size:15px;line-height:2;">
            <li>Describe your legal issue or question</li>
            <li>Our AI matches you with the right attorneys</li>
            <li>Chat with a lawyer for 3 minutes free</li>
            <li>Continue the consultation for just $30 if you're satisfied</li>
          </ol>`)
    + ctaButton(isLawyer ? "Complete Your Profile" : "Find a Lawyer", `${APP_URL}/${isLawyer ? "profile/edit" : "lawyers"}`)
    + paragraph(`Questions? Reply to this email or visit our <a href="${APP_URL}/help" style="color:#1A2B5F;">Help Center</a>.`);

  sendToUserIfAllowed(userId, `Welcome to ${APP_NAME}!`, html);
}

// ─── Weekly Summary (Lawyer) ───

export async function emailWeeklyLawyerSummary(lawyerUserId) {
  const user = await prisma.user.findUnique({
    where: { id: lawyerUserId },
    select: { email: true, firstName: true, notificationPreferences: true },
  });

  if (!user || !user.email) return;

  const prefs = { weeklyDigest: false, ...(user.notificationPreferences || {}) };
  if (prefs.weeklyDigest === false) return;

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const profile = await prisma.lawyerProfile.findUnique({
    where: { userId: lawyerUserId },
    select: {
      rating: true,
      totalReviews: true,
      _count: {
        select: {
          consultations: { where: { createdAt: { gte: oneWeekAgo } } },
          reviews: { where: { createdAt: { gte: oneWeekAgo } } },
        },
      },
    },
  });

  if (!profile) return;

  const payments = await prisma.payment.aggregate({
    where: {
      consultation: { lawyerId: profile.userId },
      status: "SUCCEEDED",
      createdAt: { gte: oneWeekAgo },
    },
    _sum: { amount: true },
  });

  const earnings = ((payments._sum.amount || 0) / 100).toFixed(2);
  const consultations = profile._count.consultations;
  const reviews = profile._count.reviews;

  const html = heading(`Your Weekly Summary`)
    + paragraph(`Hi ${user.firstName}, here's how your week went on ${APP_NAME}:`)
    + `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
        <tr>
          <td width="33%" style="text-align:center;padding:16px;background:#f8f9fa;border-radius:8px;">
            <div style="font-size:28px;color:#1A2B5F;font-weight:700;">$${earnings}</div>
            <div style="color:#888;font-size:12px;margin-top:4px;">EARNED</div>
          </td>
          <td width="8"></td>
          <td width="33%" style="text-align:center;padding:16px;background:#f8f9fa;border-radius:8px;">
            <div style="font-size:28px;color:#1A2B5F;font-weight:700;">${consultations}</div>
            <div style="color:#888;font-size:12px;margin-top:4px;">CONSULTATIONS</div>
          </td>
          <td width="8"></td>
          <td width="33%" style="text-align:center;padding:16px;background:#f8f9fa;border-radius:8px;">
            <div style="font-size:28px;color:#1A2B5F;font-weight:700;">${reviews}</div>
            <div style="color:#888;font-size:12px;margin-top:4px;">NEW REVIEWS</div>
          </td>
        </tr>
      </table>`
    + (profile.rating > 0 ? paragraph(`Your current rating: <strong>${profile.rating.toFixed(1)}</strong> / 5.0 (${profile.totalReviews} total reviews)`) : "")
    + ctaButton("View Dashboard", `${APP_URL}/dashboard`)
    + paragraph(`<em style="color:#888;">Stay online to get more consultation requests. Clients prefer attorneys who respond quickly.</em>`);

  return sendEmail(user.email, `Your ${APP_NAME} weekly summary`, wrapHtml(`Weekly Summary`, html));
}

// ─── Dispute Emails ───

export function emailDisputeOpened(lawyerUserId, clientName, category, disputeId) {
  const html = heading("A Dispute Has Been Filed")
    + paragraph(`<strong>${clientName}</strong> has opened a dispute regarding their <strong>${category}</strong> consultation with you.`)
    + infoBox("Category", category)
    + paragraph("Please review the dispute details and respond within 72 hours. You'll have a chance to present your side before any action is taken.")
    + ctaButton("View Dispute", `${APP_URL}/disputes/${disputeId}`)
    + paragraph("<em style='color:#888;'>Responding promptly demonstrates professionalism and helps resolve issues faster.</em>");

  sendToUserIfAllowed(lawyerUserId, `Dispute Filed — ${category}`, html);
}

export function emailDisputeResolved(userId, resolutionType, refundAmount, disputeId) {
  const typeLabel = resolutionType.replace(/_/g, " ").toLowerCase();
  const refundStr = refundAmount ? `$${(refundAmount / 100).toFixed(2)}` : null;

  const html = heading("Dispute Resolved")
    + paragraph(`Your dispute has been resolved with the following outcome:`)
    + infoBox("Resolution", typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1))
    + (refundStr ? infoBox("Refund Amount", refundStr) : "")
    + paragraph("If you have any further questions, please contact our support team.")
    + ctaButton("View Details", `${APP_URL}/disputes/${disputeId}`);

  sendToUserIfAllowed(userId, `Dispute Resolved — ${typeLabel}`, html);
}

export function emailDisputeEscalated(userId, disputeId) {
  const html = heading("Dispute Escalated to Admin Review")
    + paragraph("The dispute has been escalated to our admin team for review. An admin will review all evidence and make a final decision.")
    + paragraph("No further action is needed from you at this time. You will be notified once a decision has been made.")
    + ctaButton("View Dispute", `${APP_URL}/disputes/${disputeId}`)
    + paragraph("<em style='color:#888;'>Our team typically resolves escalated disputes within 3-5 business days.</em>");

  sendToUserIfAllowed(userId, "Dispute Escalated to Admin Review", html);
}
