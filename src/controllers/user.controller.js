import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import cloudinary from "../config/cloudinary.js";

// @desc    Update user profile
// @route   PUT /api/users/profile
export const updateProfile = asyncHandler(async (req, res) => {
  const { firstName, lastName, phone } = req.body;

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { firstName, lastName, phone },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      avatar: true,
      role: true,
    },
  });

  res.json({ success: true, data: user });
});

// @desc    Delete account & all personal data (GDPR)
// @route   DELETE /api/users/account
export const deleteAccount = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Run all deletions in a transaction
  await prisma.$transaction(async (tx) => {
    // Find lawyer profile if exists (needed for cascading deletes)
    const lawyerProfile = await tx.lawyerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    const lawyerProfileId = lawyerProfile?.id;

    // Delete calls
    await tx.call.deleteMany({
      where: { OR: [{ initiatorId: userId }, { receiverId: userId }] },
    });

    // Delete job post views (lawyer)
    if (lawyerProfileId) {
      await tx.jobPostView.deleteMany({ where: { lawyerId: lawyerProfileId } });
    }

    // Delete job posts (client)
    // First remove views on user's job posts, then delete the posts
    await tx.jobPostView.deleteMany({
      where: { jobPost: { clientId: userId } },
    });
    await tx.jobPost.deleteMany({ where: { clientId: userId } });

    // Delete referrals
    await tx.referral.deleteMany({
      where: { OR: [{ referrerId: userId }, { refereeId: userId }] },
    });

    // Delete saved lawyers
    await tx.savedLawyer.deleteMany({
      where: { OR: [{ userId }, ...(lawyerProfileId ? [{ lawyerProfileId }] : [])] },
    });

    // Delete blocks
    await tx.block.deleteMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    });

    // Delete reports
    await tx.report.deleteMany({
      where: { OR: [{ reporterId: userId }, { reportedId: userId }] },
    });

    // Delete service offers (lawyer)
    if (lawyerProfileId) {
      await tx.serviceOffer.deleteMany({ where: { lawyerId: lawyerProfileId } });
    }

    // Delete reviews (as reviewer or on lawyer profile)
    await tx.review.deleteMany({
      where: { OR: [{ reviewerId: userId }, ...(lawyerProfileId ? [{ lawyerProfileId }] : [])] },
    });

    // Delete messages
    await tx.message.deleteMany({ where: { senderId: userId } });

    // Delete payments
    await tx.payment.deleteMany({ where: { userId } });

    // For consultations where user is client: delete all child records then the consultation
    const clientConsultations = await tx.consultation.findMany({
      where: { clientId: userId },
      select: { id: true },
    });
    const clientConsultationIds = clientConsultations.map((c) => c.id);

    if (clientConsultationIds.length > 0) {
      await tx.call.deleteMany({ where: { consultationId: { in: clientConsultationIds } } });
      await tx.message.deleteMany({ where: { consultationId: { in: clientConsultationIds } } });
      await tx.payment.deleteMany({ where: { consultationId: { in: clientConsultationIds } } });
      await tx.review.deleteMany({ where: { consultationId: { in: clientConsultationIds } } });
      await tx.serviceOffer.deleteMany({ where: { consultationId: { in: clientConsultationIds } } });
      await tx.consultation.deleteMany({ where: { id: { in: clientConsultationIds } } });
    }

    // For consultations where user is lawyer: delete all child records then the consultation
    if (lawyerProfileId) {
      const lawyerConsultations = await tx.consultation.findMany({
        where: { lawyerId: lawyerProfileId },
        select: { id: true },
      });
      const lawyerConsultationIds = lawyerConsultations.map((c) => c.id);

      if (lawyerConsultationIds.length > 0) {
        await tx.call.deleteMany({ where: { consultationId: { in: lawyerConsultationIds } } });
        await tx.message.deleteMany({ where: { consultationId: { in: lawyerConsultationIds } } });
        await tx.payment.deleteMany({ where: { consultationId: { in: lawyerConsultationIds } } });
        await tx.review.deleteMany({ where: { consultationId: { in: lawyerConsultationIds } } });
        await tx.serviceOffer.deleteMany({ where: { consultationId: { in: lawyerConsultationIds } } });
        await tx.consultation.deleteMany({ where: { id: { in: lawyerConsultationIds } } });
      }

      // Delete lawyer profile
      await tx.lawyerProfile.delete({ where: { id: lawyerProfileId } });
    }

    // Finally delete the user
    await tx.user.delete({ where: { id: userId } });
  });

  res.json({ success: true, message: "Account and all personal data have been permanently deleted." });
});

// @desc    Upload avatar
// @route   PUT /api/users/avatar
export const uploadAvatar = asyncHandler(async (req, res) => {
  const { image } = req.body;

  if (!image) {
    res.status(400);
    throw new Error("No image provided");
  }

  const result = await cloudinary.uploader.upload(image, {
    folder: "lawyer-direct/avatars",
    width: 300,
    crop: "scale",
  });

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { avatar: result.secure_url },
    select: { id: true, avatar: true },
  });

  res.json({ success: true, data: user });
});
