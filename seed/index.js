import "dotenv/config";
import { v4 as uuidv4 } from "uuid";
import prisma from "../src/lib/prisma.js";

const seed = async () => {
  console.log("Seeding database...");

  // Clean existing data
  await prisma.review.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.consultation.deleteMany();
  await prisma.lawyerProfile.deleteMany();
  await prisma.user.deleteMany();

  // Create client users
  // client1 uses a fixed clerkId matching the mobile mock login
  const client1 = await prisma.user.create({
    data: {
      id: "mock-user-id",
      clerkId: "mock-clerk-id",
      email: "demo@lawyerdirect.com",
      firstName: "John",
      lastName: "Doe",
      phone: "+1234567890",
      role: "CLIENT",
      isVerified: true,
    },
  });

  const client2 = await prisma.user.create({
    data: {
      clerkId: `seed_client_${uuidv4()}`,
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Smith",
      phone: "+1234567891",
      role: "CLIENT",
      isVerified: true,
    },
  });

  // Create lawyer users with profiles
  const lawyerUser1 = await prisma.user.create({
    data: {
      clerkId: `seed_lawyer_${uuidv4()}`,
      email: "sarah.mitchell@example.com",
      firstName: "Sarah",
      lastName: "Mitchell",
      role: "LAWYER",
      isVerified: true,
    },
  });

  await prisma.lawyerProfile.create({
    data: {
      userId: lawyerUser1.id,
      barNumber: "NY-2019-48291",
      licenseState: "New York",
      specializations: ["Family Law", "Real Estate"],
      bio: "Board-certified family law specialist with 12 years of experience handling complex divorce and custody cases.",
      yearsExperience: 12,
      consultationRate: 3000,
      languages: ["English", "Spanish"],
      isAvailable: true,
      rating: 4.9,
      totalReviews: 47,
    },
  });

  const lawyerUser2 = await prisma.user.create({
    data: {
      clerkId: `seed_lawyer_${uuidv4()}`,
      email: "michael.chen@example.com",
      firstName: "Michael",
      lastName: "Chen",
      role: "LAWYER",
      isVerified: true,
    },
  });

  await prisma.lawyerProfile.create({
    data: {
      userId: lawyerUser2.id,
      barNumber: "CA-2015-77312",
      licenseState: "California",
      specializations: ["Business & Contract", "Intellectual Property"],
      bio: "Former tech industry counsel specializing in startup formation, IP protection, and commercial agreements.",
      yearsExperience: 15,
      consultationRate: 3000,
      languages: ["English", "Mandarin"],
      isAvailable: true,
      rating: 4.8,
      totalReviews: 62,
    },
  });

  const lawyerUser3 = await prisma.user.create({
    data: {
      clerkId: `seed_lawyer_${uuidv4()}`,
      email: "maria.rodriguez@example.com",
      firstName: "Maria",
      lastName: "Rodriguez",
      role: "LAWYER",
      isVerified: true,
    },
  });

  await prisma.lawyerProfile.create({
    data: {
      userId: lawyerUser3.id,
      barNumber: "TX-2012-33891",
      licenseState: "Texas",
      specializations: ["Immigration", "Criminal Defense"],
      bio: "Passionate immigration attorney helping families navigate visas, green cards, and citizenship applications.",
      yearsExperience: 18,
      consultationRate: 3000,
      languages: ["English", "Spanish", "Portuguese"],
      isAvailable: true,
      rating: 4.7,
      totalReviews: 89,
    },
  });

  console.log("Seed completed!");
  console.log(`Created 2 clients and 3 lawyers`);
};

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
