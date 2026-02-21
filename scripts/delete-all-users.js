/**
 * Delete all non-admin users from DB + all users from Clerk
 * Run: node scripts/delete-all-users.js
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createClerkClient } from "@clerk/backend";

const prisma = new PrismaClient();
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

async function deleteAllFromDB() {
  console.log("\n=== DATABASE CLEANUP ===\n");

  // Find admin user(s) to keep
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, email: true, clerkId: true },
  });

  console.log(`Admin users to keep: ${admins.map((a) => a.email).join(", ") || "none"}`);

  const adminIds = admins.map((a) => a.id);
  const nonAdminFilter = { NOT: { id: { in: adminIds } } };

  // Get counts before deletion
  const totalUsers = await prisma.user.count();
  const nonAdminCount = await prisma.user.count({ where: nonAdminFilter });
  console.log(`Total users: ${totalUsers}, Non-admin to delete: ${nonAdminCount}`);

  if (nonAdminCount === 0) {
    console.log("No non-admin users to delete.");
    return [];
  }

  // Get all non-admin user IDs
  const nonAdminUsers = await prisma.user.findMany({
    where: nonAdminFilter,
    select: { id: true, clerkId: true },
  });
  const userIds = nonAdminUsers.map((u) => u.id);
  const clerkIds = nonAdminUsers.map((u) => u.clerkId).filter((id) => !id.startsWith("admin_local_"));

  // Get lawyer profile IDs for non-admin lawyers
  const lawyerProfiles = await prisma.lawyerProfile.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const lawyerProfileIds = lawyerProfiles.map((lp) => lp.id);

  // Get consultation IDs involving non-admin users
  const consultations = await prisma.consultation.findMany({
    where: {
      OR: [
        { clientId: { in: userIds } },
        { lawyerId: { in: lawyerProfileIds } },
      ],
    },
    select: { id: true },
  });
  const consultationIds = consultations.map((c) => c.id);

  // Get dispute IDs for these consultations
  const disputes = await prisma.dispute.findMany({
    where: { consultationId: { in: consultationIds } },
    select: { id: true },
  });
  const disputeIds = disputes.map((d) => d.id);

  // Get support ticket IDs
  const tickets = await prisma.supportTicket.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const ticketIds = tickets.map((t) => t.id);

  await prisma.$transaction(async (tx) => {
    // 1. Dispute evidence & events (children of disputes)
    if (disputeIds.length > 0) {
      const r1 = await tx.disputeEvidence.deleteMany({ where: { disputeId: { in: disputeIds } } });
      console.log(`  Deleted ${r1.count} dispute evidence records`);
      const r2 = await tx.disputeEvent.deleteMany({ where: { disputeId: { in: disputeIds } } });
      console.log(`  Deleted ${r2.count} dispute events`);
    }

    // 2. Disputes
    if (disputeIds.length > 0) {
      const r = await tx.dispute.deleteMany({ where: { id: { in: disputeIds } } });
      console.log(`  Deleted ${r.count} disputes`);
    }

    // 3. Calls
    if (consultationIds.length > 0) {
      const r = await tx.call.deleteMany({ where: { consultationId: { in: consultationIds } } });
      console.log(`  Deleted ${r.count} calls`);
    }
    // Also delete calls by user (if any orphans)
    const rCalls = await tx.call.deleteMany({
      where: { OR: [{ initiatorId: { in: userIds } }, { receiverId: { in: userIds } }] },
    });
    if (rCalls.count > 0) console.log(`  Deleted ${rCalls.count} additional calls by user`);

    // 4. Messages
    if (consultationIds.length > 0) {
      const r = await tx.message.deleteMany({ where: { consultationId: { in: consultationIds } } });
      console.log(`  Deleted ${r.count} messages`);
    }

    // 5. Payments
    if (consultationIds.length > 0) {
      const r = await tx.payment.deleteMany({ where: { consultationId: { in: consultationIds } } });
      console.log(`  Deleted ${r.count} payments`);
    }

    // 6. Reviews
    const rReviews = await tx.review.deleteMany({
      where: {
        OR: [
          { reviewerId: { in: userIds } },
          ...(lawyerProfileIds.length > 0 ? [{ lawyerProfileId: { in: lawyerProfileIds } }] : []),
          ...(consultationIds.length > 0 ? [{ consultationId: { in: consultationIds } }] : []),
        ],
      },
    });
    console.log(`  Deleted ${rReviews.count} reviews`);

    // 7. Service offers
    const rOffers = await tx.serviceOffer.deleteMany({
      where: {
        OR: [
          ...(lawyerProfileIds.length > 0 ? [{ lawyerId: { in: lawyerProfileIds } }] : []),
          ...(consultationIds.length > 0 ? [{ consultationId: { in: consultationIds } }] : []),
        ].length > 0
          ? [
              ...(lawyerProfileIds.length > 0 ? [{ lawyerId: { in: lawyerProfileIds } }] : []),
              ...(consultationIds.length > 0 ? [{ consultationId: { in: consultationIds } }] : []),
            ]
          : [{ id: "none" }],
      },
    });
    console.log(`  Deleted ${rOffers.count} service offers`);

    // 8. Consultations
    if (consultationIds.length > 0) {
      // First nullify jobPost references to consultations
      await tx.jobPost.updateMany({
        where: { consultationId: { in: consultationIds } },
        data: { consultationId: null },
      });
      const r = await tx.consultation.deleteMany({ where: { id: { in: consultationIds } } });
      console.log(`  Deleted ${r.count} consultations`);
    }

    // 9. Job post views
    const rViews = await tx.jobPostView.deleteMany({
      where: {
        OR: [
          { jobPost: { clientId: { in: userIds } } },
          ...(lawyerProfileIds.length > 0 ? [{ lawyerId: { in: lawyerProfileIds } }] : []),
        ],
      },
    });
    console.log(`  Deleted ${rViews.count} job post views`);

    // 10. Job posts
    const rJobs = await tx.jobPost.deleteMany({ where: { clientId: { in: userIds } } });
    console.log(`  Deleted ${rJobs.count} job posts`);

    // 11. Saved lawyers
    const rSaved = await tx.savedLawyer.deleteMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          ...(lawyerProfileIds.length > 0 ? [{ lawyerProfileId: { in: lawyerProfileIds } }] : []),
        ],
      },
    });
    console.log(`  Deleted ${rSaved.count} saved lawyers`);

    // 12. Blocks
    const rBlocks = await tx.block.deleteMany({
      where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] },
    });
    console.log(`  Deleted ${rBlocks.count} blocks`);

    // 13. Reports
    const rReports = await tx.report.deleteMany({
      where: { OR: [{ reporterId: { in: userIds } }, { reportedId: { in: userIds } }] },
    });
    console.log(`  Deleted ${rReports.count} reports`);

    // 14. Referrals
    const rRefs = await tx.referral.deleteMany({
      where: { OR: [{ referrerId: { in: userIds } }, { refereeId: { in: userIds } }] },
    });
    console.log(`  Deleted ${rRefs.count} referrals`);

    // 15. Ticket replies
    if (ticketIds.length > 0) {
      const r = await tx.ticketReply.deleteMany({ where: { ticketId: { in: ticketIds } } });
      console.log(`  Deleted ${r.count} ticket replies`);
    }
    // Also replies by user on any ticket
    const rReplies = await tx.ticketReply.deleteMany({ where: { userId: { in: userIds } } });
    if (rReplies.count > 0) console.log(`  Deleted ${rReplies.count} additional ticket replies`);

    // 16. Support tickets
    const rTickets = await tx.supportTicket.deleteMany({ where: { userId: { in: userIds } } });
    console.log(`  Deleted ${rTickets.count} support tickets`);

    // 17. Notifications (cascade, but be explicit)
    const rNotifs = await tx.notification.deleteMany({ where: { userId: { in: userIds } } });
    console.log(`  Deleted ${rNotifs.count} notifications`);

    // 18. Lawyer profiles
    if (lawyerProfileIds.length > 0) {
      const r = await tx.lawyerProfile.deleteMany({ where: { id: { in: lawyerProfileIds } } });
      console.log(`  Deleted ${r.count} lawyer profiles`);
    }

    // 19. Delete non-admin users
    const rUsers = await tx.user.deleteMany({ where: { id: { in: userIds } } });
    console.log(`\n  ✓ Deleted ${rUsers.count} users from database`);
  });

  return clerkIds;
}

async function deleteAllFromClerk(clerkIdsFromDB) {
  console.log("\n=== CLERK CLEANUP ===\n");

  // List all Clerk users and delete them
  let deleted = 0;
  let totalInClerk = 0;

  // Clerk API paginates with limit/offset
  let offset = 0;
  const limit = 100;
  const allClerkUserIds = [];

  while (true) {
    const users = await clerk.users.getUserList({ limit, offset });
    if (users.data.length === 0) break;
    totalInClerk += users.data.length;
    for (const user of users.data) {
      allClerkUserIds.push(user.id);
    }
    if (users.data.length < limit) break;
    offset += limit;
  }

  console.log(`Found ${totalInClerk} users in Clerk`);

  for (const clerkUserId of allClerkUserIds) {
    try {
      await clerk.users.deleteUser(clerkUserId);
      deleted++;
      process.stdout.write(`  Deleted ${deleted}/${allClerkUserIds.length} from Clerk\r`);
    } catch (err) {
      console.log(`  Failed to delete Clerk user ${clerkUserId}: ${err.message}`);
    }
  }

  console.log(`\n  ✓ Deleted ${deleted} users from Clerk`);
}

async function main() {
  try {
    console.log("Starting user cleanup...");
    const clerkIds = await deleteAllFromDB();
    await deleteAllFromClerk(clerkIds);
    console.log("\n=== DONE ===\n");
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
