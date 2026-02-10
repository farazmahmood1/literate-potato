import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";

// @desc    Save/favorite a lawyer
// @route   POST /api/lawyers/:id/save
export const saveLawyer = asyncHandler(async (req, res) => {
  const lawyerProfileId = req.params.id;

  const existing = await prisma.savedLawyer.findUnique({
    where: {
      userId_lawyerProfileId: {
        userId: req.user.id,
        lawyerProfileId,
      },
    },
  });

  if (existing) {
    res.json({ success: true, data: existing, message: "Already saved" });
    return;
  }

  const saved = await prisma.savedLawyer.create({
    data: {
      userId: req.user.id,
      lawyerProfileId,
    },
  });

  res.status(201).json({ success: true, data: saved });
});

// @desc    Unsave a lawyer
// @route   DELETE /api/lawyers/:id/save
export const unsaveLawyer = asyncHandler(async (req, res) => {
  await prisma.savedLawyer.deleteMany({
    where: {
      userId: req.user.id,
      lawyerProfileId: req.params.id,
    },
  });

  res.json({ success: true, message: "Lawyer unsaved" });
});

// @desc    Get saved lawyers
// @route   GET /api/lawyers/saved
export const getSavedLawyers = asyncHandler(async (req, res) => {
  const saved = await prisma.savedLawyer.findMany({
    where: { userId: req.user.id },
    include: {
      lawyerProfile: {
        include: {
          user: { select: { firstName: true, lastName: true, avatar: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const lawyers = saved.map((s) => s.lawyerProfile);
  res.json({ success: true, data: lawyers });
});
