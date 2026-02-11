import prisma from "../src/lib/prisma.js";

async function backfillLawyerStates() {
  const lawyers = await prisma.lawyerProfile.findMany({
    select: { userId: true, licenseState: true },
  });

  let updated = 0;
  for (const lawyer of lawyers) {
    await prisma.user.update({
      where: { id: lawyer.userId },
      data: { registrationState: lawyer.licenseState },
    });
    updated++;
  }

  console.log(`Backfilled ${updated} lawyer states`);
  await prisma.$disconnect();
}

backfillLawyerStates().catch((e) => {
  console.error(e);
  process.exit(1);
});
