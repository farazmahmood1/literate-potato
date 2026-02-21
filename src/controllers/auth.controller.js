import asyncHandler from "express-async-handler";
import { getAuth, clerkClient } from "@clerk/express";
import prisma from "../lib/prisma.js";
import { getClientIp, getLocationFromIp } from "../services/geolocation.service.js";

// @desc    Sync Clerk user to database (called after sign-up or first login)
// @route   POST /api/auth/sync
export const syncUser = asyncHandler(async (req, res) => {
  const { userId } = getAuth(req);

  if (!userId) {
    res.status(401);
    throw new Error("Not authenticated");
  }

  const { phone } = req.body;

  // Check if user already exists
  let user = await prisma.user.findUnique({ where: { clerkId: userId } });

  if (user) {
    // Update phone if provided and not already set
    if (phone && !user.phone) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { phone },
      });
    }
    return res.json({ success: true, data: user });
  }

  // Fetch user details from Clerk
  const clerkUser = await clerkClient.users.getUser(userId);

  // Resolve location from IP
  const ip = getClientIp(req);
  const { state, city } = getLocationFromIp(ip);

  user = await prisma.user.create({
    data: {
      clerkId: userId,
      email: clerkUser.emailAddresses[0]?.emailAddress,
      firstName: clerkUser.firstName || "",
      lastName: clerkUser.lastName || "",
      phone: phone || clerkUser.phoneNumbers?.[0]?.phoneNumber || null,
      avatar: clerkUser.imageUrl,
      isVerified: clerkUser.emailAddresses[0]?.verification?.status === "verified",
      registrationState: state,
      registrationCity: city,
      registrationIp: ip,
    },
  });

  res.status(201).json({ success: true, data: user });
});

// @desc    Get current user profile from database
// @route   GET /api/auth/me
export const getMe = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      clerkId: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      avatar: true,
      role: true,
      isVerified: true,
      createdAt: true,
      lawyerProfile: true,
    },
  });

  res.json({ success: true, data: user });
});

// @desc    Clerk webhook - sync user data on changes
// @route   POST /api/auth/webhook
export const clerkWebhook = asyncHandler(async (req, res) => {
  // Verify webhook signature with svix (if CLERK_WEBHOOK_SECRET is configured)
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (WEBHOOK_SECRET) {
    const { Webhook } = await import("svix");
    const wh = new Webhook(WEBHOOK_SECRET);
    const headers = {
      "svix-id": req.headers["svix-id"],
      "svix-timestamp": req.headers["svix-timestamp"],
      "svix-signature": req.headers["svix-signature"],
    };

    if (!headers["svix-id"] || !headers["svix-timestamp"] || !headers["svix-signature"]) {
      res.status(400);
      throw new Error("Missing svix headers");
    }

    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
      wh.verify(rawBody, headers);
    } catch (err) {
      console.error("[Webhook] Signature verification failed:", err?.message);
      res.status(401);
      throw new Error("Invalid webhook signature");
    }
  }

  // Parse body — may be raw Buffer (from express.raw) or already-parsed JSON
  const body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
  const { type, data } = body;

  if (type === "user.created" || type === "user.updated") {
    const { id, email_addresses, first_name, last_name, image_url } = data;

    await prisma.user.upsert({
      where: { clerkId: id },
      update: {
        email: email_addresses?.[0]?.email_address,
        firstName: first_name || "",
        lastName: last_name || "",
        avatar: image_url,
      },
      create: {
        clerkId: id,
        email: email_addresses?.[0]?.email_address,
        firstName: first_name || "",
        lastName: last_name || "",
        avatar: image_url,
      },
    });
  }

  if (type === "user.deleted") {
    const { id } = data;
    await prisma.user.delete({ where: { clerkId: id } }).catch(() => {});
  }

  res.json({ success: true });
});
