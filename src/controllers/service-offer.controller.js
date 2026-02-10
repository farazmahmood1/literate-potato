import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import { getIO } from "../config/socket.js";

// @desc    Create a service offer (lawyer only)
// @route   POST /api/consultations/:id/service-offers
export const createServiceOffer = asyncHandler(async (req, res) => {
  const { title, description, price } = req.body;
  const consultationId = req.params.id;

  const consultation = await prisma.consultation.findUnique({
    where: { id: consultationId },
    include: { lawyer: { select: { userId: true, id: true } } },
  });

  if (!consultation) {
    res.status(404);
    throw new Error("Consultation not found");
  }

  if (consultation.lawyer.userId !== req.user.id) {
    res.status(403);
    throw new Error("Only the assigned lawyer can create service offers");
  }

  const offer = await prisma.serviceOffer.create({
    data: {
      consultationId,
      lawyerProfileId: consultation.lawyer.id,
      title,
      description,
      price: Math.round(price * 100), // Store in cents
    },
  });

  // Notify client via socket
  try {
    const io = getIO();
    io.to(`user:${consultation.clientId}`).emit("new-service-offer", {
      consultationId,
      offer,
    });
  } catch {}

  res.status(201).json({ success: true, data: offer });
});

// @desc    Get service offers for a consultation
// @route   GET /api/consultations/:id/service-offers
export const getServiceOffers = asyncHandler(async (req, res) => {
  const offers = await prisma.serviceOffer.findMany({
    where: { consultationId: req.params.id },
    orderBy: { createdAt: "desc" },
  });

  res.json({ success: true, data: offers });
});

// @desc    Update service offer status (accept/decline by client)
// @route   PUT /api/service-offers/:id/status
export const updateServiceOfferStatus = asyncHandler(async (req, res) => {
  const { status } = req.body; // ACCEPTED or DECLINED

  const offer = await prisma.serviceOffer.update({
    where: { id: req.params.id },
    data: { status },
  });

  res.json({ success: true, data: offer });
});
