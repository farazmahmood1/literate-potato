import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import stripe from "../config/stripe.js";

// @desc    Create Stripe Connect Express account for a lawyer
// @route   POST /api/stripe-connect
export const createConnectAccount = asyncHandler(async (req, res) => {
  const lawyerProfile = await prisma.lawyerProfile.findUnique({
    where: { userId: req.user.id },
    include: { user: { select: { email: true, firstName: true, lastName: true } } },
  });

  if (!lawyerProfile) {
    res.status(404);
    throw new Error("Lawyer profile not found");
  }

  if (lawyerProfile.stripeAccountId) {
    res.status(400);
    throw new Error("Stripe Connect account already exists");
  }

  const account = await stripe.accounts.create({
    type: "express",
    country: "US",
    email: lawyerProfile.user.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: "individual",
    individual: {
      first_name: lawyerProfile.user.firstName,
      last_name: lawyerProfile.user.lastName,
      email: lawyerProfile.user.email,
    },
    metadata: {
      userId: req.user.id,
      lawyerProfileId: lawyerProfile.id,
    },
  });

  await prisma.lawyerProfile.update({
    where: { id: lawyerProfile.id },
    data: { stripeAccountId: account.id },
  });

  res.status(201).json({
    success: true,
    data: { accountId: account.id },
  });
});

// @desc    Get Stripe Connect onboarding URL
// @route   GET /api/stripe-connect/onboarding
export const getOnboardingUrl = asyncHandler(async (req, res) => {
  const lawyerProfile = await prisma.lawyerProfile.findUnique({
    where: { userId: req.user.id },
  });

  if (!lawyerProfile) {
    res.status(404);
    throw new Error("Lawyer profile not found");
  }

  if (!lawyerProfile.stripeAccountId) {
    res.status(400);
    throw new Error("No Stripe Connect account found. Please create one first.");
  }

  const accountLink = await stripe.accountLinks.create({
    account: lawyerProfile.stripeAccountId,
    refresh_url: `${process.env.APP_URL || "http://localhost:5000"}/api/stripe-connect/onboarding-refresh`,
    return_url: `${process.env.APP_URL || "http://localhost:5000"}/api/stripe-connect/onboarding-complete`,
    type: "account_onboarding",
  });

  res.json({
    success: true,
    data: { url: accountLink.url },
  });
});

// @desc    Get Stripe Connect account status
// @route   GET /api/stripe-connect/status
export const getAccountStatus = asyncHandler(async (req, res) => {
  const lawyerProfile = await prisma.lawyerProfile.findUnique({
    where: { userId: req.user.id },
  });

  if (!lawyerProfile) {
    res.status(404);
    throw new Error("Lawyer profile not found");
  }

  if (!lawyerProfile.stripeAccountId) {
    return res.json({
      success: true,
      data: {
        connected: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      },
    });
  }

  const account = await stripe.accounts.retrieve(lawyerProfile.stripeAccountId);

  res.json({
    success: true,
    data: {
      connected: true,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    },
  });
});

// @desc    Get Stripe Express dashboard login link
// @route   GET /api/stripe-connect/dashboard
export const getDashboardLink = asyncHandler(async (req, res) => {
  const lawyerProfile = await prisma.lawyerProfile.findUnique({
    where: { userId: req.user.id },
  });

  if (!lawyerProfile) {
    res.status(404);
    throw new Error("Lawyer profile not found");
  }

  if (!lawyerProfile.stripeAccountId) {
    res.status(400);
    throw new Error("No Stripe Connect account found");
  }

  const loginLink = await stripe.accounts.createLoginLink(
    lawyerProfile.stripeAccountId
  );

  res.json({
    success: true,
    data: { url: loginLink.url },
  });
});
