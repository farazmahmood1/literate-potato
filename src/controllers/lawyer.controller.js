import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import cloudinary from "../config/cloudinary.js";
import { notifyProfileViewed } from "../services/notification.service.js";
import { normalizeStateToAbbr } from "../utils/stateNormalize.js";

// @desc    Create lawyer profile
// @route   POST /api/lawyers/profile
export const createLawyerProfile = asyncHandler(async (req, res) => {
  const {
    barNumber, licenseState, specializations, bio, yearsExperience,
    consultationRate, languages, professionalSummary, education,
    previousFirms, certifications, courtLevels, linkedInUrl, profilePhoto,
    licenseImage, idImage,
  } = req.body;

  const existing = await prisma.lawyerProfile.findUnique({ where: { userId: req.user.id } });
  if (existing) {
    res.status(400);
    throw new Error("Lawyer profile already exists");
  }

  // Set verification status based on whether documents were provided
  const verificationStatus = (licenseImage && idImage) ? 'PENDING' : 'UNVERIFIED';

  const profile = await prisma.lawyerProfile.create({
    data: {
      userId: req.user.id,
      barNumber,
      licenseState: normalizeStateToAbbr(licenseState) || licenseState,
      specializations: specializations || [],
      bio,
      yearsExperience,
      consultationRate,
      languages,
      professionalSummary,
      education,
      previousFirms,
      certifications,
      courtLevels,
      linkedInUrl,
      profilePhoto,
      licenseImage,
      idImage,
      verificationStatus,
    },
    include: { user: { select: { firstName: true, lastName: true, email: true, avatar: true } } },
  });

  // Update user role to LAWYER
  await prisma.user.update({
    where: { id: req.user.id },
    data: { role: "LAWYER" },
  });

  res.status(201).json({ success: true, data: profile });
});

// @desc    Get all lawyers (with filters, search, sort)
// @route   GET /api/lawyers
// Query params:
//   search         - case-insensitive match against user firstName / lastName
//   specialization - filter by specialization array contains
//   state          - filter by licenseState
//   available      - "true"/"false" filter by isAvailable
//   onlineStatus   - filter by onlineStatus ("online", "offline", "busy")
//   minRating      - minimum rating (e.g. "4" for 4+ stars)
//   maxRate        - maximum hourly rate in dollars (e.g. "150")
//   sort           - "rating" (default), "experience", "rate"
//   page, limit    - pagination
export const getLawyers = asyncHandler(async (req, res) => {
  const {
    search,
    specialization,
    state,
    available,
    onlineStatus,
    minRating,
    maxRate,
    sort = "rating",
    page = 1,
    limit = 10,
  } = req.query;

  const where = {};

  // Text search on user name (case-insensitive)
  if (search) {
    where.user = {
      OR: [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  // Existing filters
  if (specialization) where.specializations = { has: specialization };
  if (state) where.licenseState = state;
  if (available !== undefined) where.isAvailable = available === "true";

  // Online status filter
  if (onlineStatus) where.onlineStatus = onlineStatus;

  // Rating filter (e.g. minRating=4 → rating >= 4)
  if (minRating) where.rating = { gte: Number(minRating) };

  // Rate filter — maxRate is in dollars, consultationRate is stored in cents
  if (maxRate) where.consultationRate = { lte: Number(maxRate) * 100 };

  // Sort mapping
  const sortMap = {
    rating: { rating: "desc" },
    experience: { yearsExperience: "desc" },
    rate: { consultationRate: "asc" },
  };
  const orderBy = sortMap[sort] || sortMap.rating;

  const skip = (Number(page) - 1) * Number(limit);

  const [lawyers, total] = await Promise.all([
    prisma.lawyerProfile.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true, avatar: true } },
      },
      orderBy,
      skip,
      take: Number(limit),
    }),
    prisma.lawyerProfile.count({ where }),
  ]);

  res.json({
    success: true,
    data: lawyers,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

// @desc    Get single lawyer profile
// @route   GET /api/lawyers/:id
export const getLawyer = asyncHandler(async (req, res) => {
  const lawyer = await prisma.lawyerProfile.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { firstName: true, lastName: true, avatar: true } },
      reviews: {
        where: { status: "APPROVED" },
        include: { reviewer: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!lawyer) {
    res.status(404);
    throw new Error("Lawyer not found");
  }

  res.json({ success: true, data: lawyer });
});

// @desc    Record a profile view and notify the lawyer
// @route   POST /api/lawyers/:id/view
export const recordProfileView = asyncHandler(async (req, res) => {
  const lawyer = await prisma.lawyerProfile.findUnique({
    where: { id: req.params.id },
    select: { userId: true },
  });

  if (!lawyer) {
    res.status(404);
    throw new Error("Lawyer not found");
  }

  // Don't notify if the viewer is the lawyer themselves
  if (lawyer.userId !== req.user.id) {
    const viewerName = `${req.user.firstName} ${req.user.lastName?.charAt(0) || ""}`.trim() + ".";
    notifyProfileViewed(lawyer.userId, viewerName);
  }

  res.json({ success: true });
});

// @desc    Update lawyer profile
// @route   PUT /api/lawyers/profile
export const updateLawyerProfile = asyncHandler(async (req, res) => {
  const {
    title, specializations, bio, consultationRate, languages, isAvailable,
    yearsExperience, professionalSummary, education, previousFirms,
    certifications, courtLevels, linkedInUrl, profilePhoto, licenseImage,
    idImage,
  } = req.body;

  // Build update payload — only include fields that were actually sent
  const data = {};
  if (title !== undefined) data.title = title;
  if (specializations !== undefined) data.specializations = specializations;
  if (bio !== undefined) data.bio = bio;
  if (consultationRate !== undefined) data.consultationRate = consultationRate;
  if (languages !== undefined) data.languages = languages;
  if (isAvailable !== undefined) data.isAvailable = isAvailable;
  if (yearsExperience !== undefined) data.yearsExperience = yearsExperience;
  if (professionalSummary !== undefined) data.professionalSummary = professionalSummary;
  if (education !== undefined) data.education = education;
  if (previousFirms !== undefined) data.previousFirms = previousFirms;
  if (certifications !== undefined) data.certifications = certifications;
  if (courtLevels !== undefined) data.courtLevels = courtLevels;
  if (linkedInUrl !== undefined) data.linkedInUrl = linkedInUrl;
  if (profilePhoto !== undefined) data.profilePhoto = profilePhoto;
  if (licenseImage !== undefined) data.licenseImage = licenseImage;
  if (idImage !== undefined) data.idImage = idImage;

  const profile = await prisma.lawyerProfile.update({
    where: { userId: req.user.id },
    data,
    include: {
      user: { select: { firstName: true, lastName: true, avatar: true } },
    },
  });

  res.json({ success: true, data: profile });
});

// @desc    Get paginated reviews for a lawyer
// @route   GET /api/lawyers/:id/reviews
export const getLawyerReviews = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const lawyerProfileId = req.params.id;

  const lawyer = await prisma.lawyerProfile.findUnique({
    where: { id: lawyerProfileId },
    select: { id: true },
  });

  if (!lawyer) {
    res.status(404);
    throw new Error("Lawyer not found");
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where: { lawyerProfileId, status: "APPROVED" },
      include: {
        reviewer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.review.count({ where: { lawyerProfileId, status: "APPROVED" } }),
  ]);

  res.json({
    success: true,
    data: reviews,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

// @desc    Get featured / top-rated lawyers for dashboard
// @route   GET /api/lawyers/featured
// Returns lawyers ranked by: verified status, rating, review count, and consultation count
export const getFeaturedLawyers = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 10;

  const lawyers = await prisma.lawyerProfile.findMany({
    where: { isAvailable: true },
    include: {
      user: { select: { firstName: true, lastName: true, avatar: true } },
      _count: { select: { consultations: true, reviews: true } },
    },
    orderBy: [
      { rating: "desc" },
      { totalReviews: "desc" },
      { yearsExperience: "desc" },
    ],
    take: limit,
  });

  // Sort with verified lawyers first, then by a composite score
  const scored = lawyers
    .map((l) => ({
      ...l,
      _score:
        (l.verificationStatus === "VERIFIED" ? 50 : 0) +
        l.rating * 10 +
        Math.min(l.totalReviews, 50) +
        Math.min(l._count.consultations, 30),
    }))
    .sort((a, b) => b._score - a._score);

  // Strip internal score before sending
  const data = scored.map(({ _score, ...rest }) => rest);

  res.json({ success: true, data });
});

// @desc    Upload / replace lawyer profile photo
// @route   POST /api/lawyers/profile/photo
export const uploadProfilePhoto = asyncHandler(async (req, res) => {
  const { photo } = req.body;

  if (!photo) {
    res.status(400);
    throw new Error("No photo provided");
  }

  // Upload to Cloudinary instead of storing raw base64 in database
  const result = await cloudinary.uploader.upload(photo, {
    folder: "lawyer-direct/profile-photos",
    width: 400,
    crop: "scale",
  });

  // Update both LawyerProfile.profilePhoto AND User.avatar so all screens stay in sync
  const [profile] = await Promise.all([
    prisma.lawyerProfile.update({
      where: { userId: req.user.id },
      data: { profilePhoto: result.secure_url },
      select: { id: true, profilePhoto: true },
    }),
    prisma.user.update({
      where: { id: req.user.id },
      data: { avatar: result.secure_url },
    }),
  ]);

  res.json({ success: true, data: profile });
});
