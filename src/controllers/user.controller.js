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
