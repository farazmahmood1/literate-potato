/**
 * Cleanup script: Delete ALL transactional data for specified users.
 * Keeps User records intact so they can start fresh.
 *
 * Usage: node scripts/cleanup-users.js
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EMAILS = [
  "usmanrafi770@gmail.com",
  "faraz.m4765@gmail.com",
];

async function cleanup() {
  console.log("Finding users...");
  const users = await prisma.user.findMany({
    where: { email: { in: EMAILS } },
    include: { lawyerProfile: { select: { id: true } } },
  });

  if (users.length === 0) {
    console.log("No users found. Exiting.");
    return;
  }

  const userIds = users.map((u) => u.id);
  const lawyerProfileIds = users
    .filter((u) => u.lawyerProfile)
    .map((u) => u.lawyerProfile.id);

  console.log(`Found ${users.length} user(s):`);
  users.forEach((u) =>
    console.log(`  - ${u.email} (${u.role}, id: ${u.id}${u.lawyerProfile ? `, lawyerProfileId: ${u.lawyerProfile.id}` : ""})`)
  );

  // Find all consultations where user is client or lawyer
  const consultations = await prisma.consultation.findMany({
    where: {
      OR: [
        { clientId: { in: userIds } },
        ...(lawyerProfileIds.length > 0 ? [{ lawyerId: { in: lawyerProfileIds } }] : []),
      ],
    },
    select: { id: true },
  });
  const consultationIds = consultations.map((c) => c.id);

  console.log(`Found ${consultationIds.length} consultation(s) to clean up.`);

  // Find all disputes in these consultations
  const disputes = await prisma.dispute.findMany({
    where: {
      OR: [
        { consultationId: { in: consultationIds } },
        { filedById: { in: userIds } },
        { filedAgainstId: { in: userIds } },
      ],
    },
    select: { id: true },
  });
  const disputeIds = disputes.map((d) => d.id);

  // Find all support tickets
  const tickets = await prisma.supportTicket.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const ticketIds = tickets.map((t) => t.id);

  // Find all job posts
  const jobPosts = await prisma.jobPost.findMany({
    where: {
      OR: [
        { clientId: { in: userIds } },
        ...(lawyerProfileIds.length > 0 ? [{ acceptedByLawyerId: { in: lawyerProfileIds } }] : []),
        ...(lawyerProfileIds.length > 0 ? [{ targetLawyerId: { in: lawyerProfileIds } }] : []),
      ],
    },
    select: { id: true },
  });
  const jobPostIds = jobPosts.map((j) => j.id);

  // ─── Delete in FK-safe order ───
  console.log("\nDeleting data...");

  // 1. Dispute evidence & events (cascade from dispute, but also user FK)
  if (disputeIds.length > 0) {
    const r1 = await prisma.disputeEvidence.deleteMany({ where: { disputeId: { in: disputeIds } } });
    console.log(`  DisputeEvidence: ${r1.count}`);
    const r2 = await prisma.disputeEvent.deleteMany({ where: { disputeId: { in: disputeIds } } });
    console.log(`  DisputeEvent: ${r2.count}`);
  }

  // 2. Disputes
  if (disputeIds.length > 0) {
    const r = await prisma.dispute.deleteMany({ where: { id: { in: disputeIds } } });
    console.log(`  Dispute: ${r.count}`);
  }

  // 3. Ticket replies & support tickets
  if (ticketIds.length > 0) {
    const r1 = await prisma.ticketReply.deleteMany({ where: { ticketId: { in: ticketIds } } });
    console.log(`  TicketReply: ${r1.count}`);
    const r2 = await prisma.supportTicket.deleteMany({ where: { id: { in: ticketIds } } });
    console.log(`  SupportTicket: ${r2.count}`);
  }

  // 4. Calls
  if (consultationIds.length > 0) {
    const r = await prisma.call.deleteMany({ where: { consultationId: { in: consultationIds } } });
    console.log(`  Call: ${r.count}`);
  }

  // 5. Reviews
  if (consultationIds.length > 0) {
    const r = await prisma.review.deleteMany({ where: { consultationId: { in: consultationIds } } });
    console.log(`  Review: ${r.count}`);
  }

  // 6. Payments
  if (consultationIds.length > 0) {
    const r = await prisma.payment.deleteMany({ where: { consultationId: { in: consultationIds } } });
    console.log(`  Payment: ${r.count}`);
  }

  // 7. Messages — first nullify replyToId references, then delete
  if (consultationIds.length > 0) {
    await prisma.message.updateMany({
      where: { consultationId: { in: consultationIds }, replyToId: { not: null } },
      data: { replyToId: null },
    });
    const r = await prisma.message.deleteMany({ where: { consultationId: { in: consultationIds } } });
    console.log(`  Message: ${r.count}`);
  }

  // 8. Service offers
  if (consultationIds.length > 0) {
    const r = await prisma.serviceOffer.deleteMany({ where: { consultationId: { in: consultationIds } } });
    console.log(`  ServiceOffer: ${r.count}`);
  }

  // 9. Job post views
  if (jobPostIds.length > 0) {
    const r = await prisma.jobPostView.deleteMany({ where: { jobPostId: { in: jobPostIds } } });
    console.log(`  JobPostView: ${r.count}`);
  }
  if (lawyerProfileIds.length > 0) {
    const r = await prisma.jobPostView.deleteMany({ where: { lawyerId: { in: lawyerProfileIds } } });
    console.log(`  JobPostView (by lawyer): ${r.count}`);
  }

  // 10. Job posts — unlink consultation first
  if (jobPostIds.length > 0) {
    await prisma.jobPost.updateMany({
      where: { id: { in: jobPostIds } },
      data: { consultationId: null, acceptedByLawyerId: null, targetLawyerId: null },
    });
    const r = await prisma.jobPost.deleteMany({ where: { id: { in: jobPostIds } } });
    console.log(`  JobPost: ${r.count}`);
  }

  // 11. Consultations
  if (consultationIds.length > 0) {
    const r = await prisma.consultation.deleteMany({ where: { id: { in: consultationIds } } });
    console.log(`  Consultation: ${r.count}`);
  }

  // 12. Blocks
  const rBlocks = await prisma.block.deleteMany({
    where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] },
  });
  console.log(`  Block: ${rBlocks.count}`);

  // 13. Reports
  const rReports = await prisma.report.deleteMany({
    where: { OR: [{ reporterId: { in: userIds } }, { reportedId: { in: userIds } }] },
  });
  console.log(`  Report: ${rReports.count}`);

  // 14. Referrals
  const rReferrals = await prisma.referral.deleteMany({
    where: { OR: [{ referrerId: { in: userIds } }, { refereeId: { in: userIds } }] },
  });
  console.log(`  Referral: ${rReferrals.count}`);

  // 15. Saved lawyers
  const rSaved = await prisma.savedLawyer.deleteMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        ...(lawyerProfileIds.length > 0 ? [{ lawyerProfileId: { in: lawyerProfileIds } }] : []),
      ],
    },
  });
  console.log(`  SavedLawyer: ${rSaved.count}`);

  // 16. Notifications
  const rNotif = await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  console.log(`  Notification: ${rNotif.count}`);

  // 17. Lawyer profiles — reset stats but keep the profile
  if (lawyerProfileIds.length > 0) {
    await prisma.lawyerProfile.updateMany({
      where: { id: { in: lawyerProfileIds } },
      data: { rating: 0, totalReviews: 0 },
    });
    console.log(`  LawyerProfile: reset stats for ${lawyerProfileIds.length} profile(s)`);
  }

  // 18. Reset user push tokens and lastActiveAt
  await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { expoPushToken: null },
  });
  console.log(`  User: cleared push tokens for ${userIds.length} user(s)`);

  console.log("\nCleanup complete! Users kept — all transactional data deleted.");
}

cleanup()
  .catch((err) => {
    console.error("Cleanup failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
