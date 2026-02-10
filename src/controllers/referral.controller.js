import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import crypto from "crypto";

// @desc    Create a referral code for the current user
// @route   POST /api/referrals/code
export const createReferralCode = asyncHandler(async (req, res) => {
  // Check if user already has a referral code
  const existing = await prisma.referral.findFirst({
    where: {
      referrerId: req.user.id,
      refereeId: null,
      status: "PENDING",
    },
  });

  if (existing) {
    res.json({ success: true, data: existing });
    return;
  }

  // Generate a unique 8-char alphanumeric code
  let code;
  let isUnique = false;
  while (!isUnique) {
    code = crypto.randomBytes(4).toString("hex").toUpperCase();
    const exists = await prisma.referral.findUnique({ where: { code } });
    if (!exists) isUnique = true;
  }

  const referral = await prisma.referral.create({
    data: {
      referrerId: req.user.id,
      code,
      status: "PENDING",
    },
  });

  res.status(201).json({ success: true, data: referral });
});

// @desc    Apply a referral code during registration
// @route   POST /api/referrals/apply
export const applyReferral = asyncHandler(async (req, res) => {
  const { code } = req.body;

  if (!code) {
    res.status(400);
    throw new Error("Referral code is required");
  }

  const referral = await prisma.referral.findUnique({
    where: { code: code.toUpperCase() },
  });

  if (!referral) {
    res.status(404);
    throw new Error("Invalid referral code");
  }

  if (referral.referrerId === req.user.id) {
    res.status(400);
    throw new Error("You cannot use your own referral code");
  }

  if (referral.status === "COMPLETED") {
    res.status(400);
    throw new Error("This referral code has already been used");
  }

  // Mark referral as completed and link the referred user
  const updated = await prisma.referral.update({
    where: { id: referral.id },
    data: {
      refereeId: req.user.id,
      status: "COMPLETED",
    },
  });

  res.json({ success: true, data: updated, message: "Referral applied successfully" });
});

// @desc    Get current user's referral code and stats
// @route   GET /api/referrals/mine
export const getMyReferrals = asyncHandler(async (req, res) => {
  // Get the user's active referral code (unused PENDING one)
  let referralCode = await prisma.referral.findFirst({
    where: {
      referrerId: req.user.id,
      refereeId: null,
      status: "PENDING",
    },
  });

  // Get completed referrals count
  const completedReferrals = await prisma.referral.findMany({
    where: {
      referrerId: req.user.id,
      status: "COMPLETED",
    },
    include: {
      referee: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    success: true,
    data: {
      code: referralCode?.code ?? null,
      totalReferred: completedReferrals.length,
      referrals: completedReferrals,
    },
  });
});
