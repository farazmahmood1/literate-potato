import cron from "node-cron";
import prisma from "../lib/prisma.js";

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

export default cron;
