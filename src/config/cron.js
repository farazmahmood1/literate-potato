import cron from "node-cron";
import prisma from "../lib/prisma.js";
import { emailWeeklyLawyerSummary } from "../services/email.service.js";
import { notifyDisputeDeadline } from "../services/notification.service.js";

// Mark stale pending consultations as cancelled (older than 24h)
cron.schedule("0 */6 * * *", async () => {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await prisma.consultation.updateMany({
      where: {
        status: "PENDING",
        createdAt: { lt: cutoff },
      },
      data: { status: "CANCELLED" },
    });
    if (result.count > 0) {
      console.log(`[CRON] Cancelled ${result.count} stale consultations`);
    }
  } catch (error) {
    console.error("[CRON] Error cancelling stale consultations:", error);
  }
});

// Auto-offline lawyers inactive for 15+ minutes (runs every 5 minutes)
cron.schedule("*/5 * * * *", async () => {
  try {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    const result = await prisma.lawyerProfile.updateMany({
      where: {
        onlineStatus: { in: ["online", "busy"] },
        lastActiveAt: { lt: cutoff },
      },
      data: { onlineStatus: "offline", isAvailable: false },
    });
    if (result.count > 0) {
      console.log(`[CRON] Set ${result.count} inactive lawyers to offline`);
    }
  } catch (error) {
    console.error("[CRON] Error setting inactive lawyers offline:", error);
  }
});

// Expire stale RINGING calls older than 2 minutes (runs every minute)
cron.schedule("* * * * *", async () => {
  try {
    const cutoff = new Date(Date.now() - 2 * 60 * 1000);
    const result = await prisma.call.updateMany({
      where: {
        status: "RINGING",
        createdAt: { lt: cutoff },
      },
      data: { status: "MISSED" },
    });
    if (result.count > 0) {
      console.log(`[CRON] Expired ${result.count} stale ringing calls`);
    }
  } catch (error) {
    console.error("[CRON] Error expiring stale calls:", error);
  }
});

// Weekly digest email for lawyers (every Monday at 9am)
cron.schedule("0 9 * * 1", async () => {
  try {
    const lawyers = await prisma.lawyerProfile.findMany({
      where: { verificationStatus: "VERIFIED" },
      select: { userId: true },
    });

    let sent = 0;
    for (const lawyer of lawyers) {
      await emailWeeklyLawyerSummary(lawyer.userId);
      sent++;
    }
    if (sent > 0) {
      console.log(`[CRON] Sent weekly digest to ${sent} lawyers`);
    }
  } catch (error) {
    console.error("[CRON] Error sending weekly digests:", error);
  }
});

// Dispute deadline enforcement (runs every hour)
cron.schedule("0 * * * *", async () => {
  try {
    const now = new Date();
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // 1. Auto-transition OPEN disputes past lawyer deadline to MEDIATION
    const expiredLawyerDeadlines = await prisma.dispute.findMany({
      where: {
        status: "OPEN",
        lawyerDeadline: { lt: now },
      },
    });

    for (const d of expiredLawyerDeadlines) {
      await prisma.dispute.update({
        where: { id: d.id },
        data: { status: "MEDIATION", mediationDeadline: new Date(now.getTime() + 72 * 60 * 60 * 1000) },
      });
      await prisma.disputeEvent.create({
        data: {
          disputeId: d.id,
          action: "auto_mediation",
          description: "Lawyer response deadline expired. Dispute moved to mediation.",
        },
      });
      console.log(`[CRON] Dispute ${d.id} auto-transitioned to MEDIATION (lawyer deadline expired)`);
    }

    // 2. Send 24h warning to lawyers approaching their response deadline
    const lawyerWarnings = await prisma.dispute.findMany({
      where: {
        status: "OPEN",
        lawyerDeadline: { gt: now, lt: twentyFourHoursFromNow },
      },
    });

    for (const d of lawyerWarnings) {
      notifyDisputeDeadline(d.filedAgainstId, d.id, "lawyer_response");
    }

    // 3. Send 24h warning for approaching mediation deadlines
    const mediationWarnings = await prisma.dispute.findMany({
      where: {
        status: "MEDIATION",
        mediationDeadline: { gt: now, lt: twentyFourHoursFromNow },
      },
    });

    for (const d of mediationWarnings) {
      notifyDisputeDeadline(d.filedById, d.id, "mediation");
      notifyDisputeDeadline(d.filedAgainstId, d.id, "mediation");
    }
  } catch (error) {
    console.error("[CRON] Error in dispute deadline enforcement:", error);
  }
});

export default cron;
