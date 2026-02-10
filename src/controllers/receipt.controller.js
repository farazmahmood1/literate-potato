import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import { generateReceipt } from "../services/receipt.service.js";
import { generateConsultationSummary } from "../services/summary.service.js";

// @desc    Get receipt for a payment
// @route   GET /api/payments/:id/receipt
export const getReceipt = asyncHandler(async (req, res) => {
  const payment = await prisma.payment.findUnique({
    where: { id: req.params.id },
  });

  if (!payment) {
    res.status(404);
    throw new Error("Payment not found");
  }

  if (payment.userId !== req.user.id && req.user.role !== "ADMIN") {
    res.status(403);
    throw new Error("Not authorized");
  }

  const receipt = await generateReceipt(req.params.id);
  res.json({ success: true, data: receipt });
});

// @desc    Get or generate AI summary for a consultation
// @route   GET /api/consultations/:id/summary
export const getConsultationSummary = asyncHandler(async (req, res) => {
  const consultation = await prisma.consultation.findUnique({
    where: { id: req.params.id },
    include: { lawyer: { select: { userId: true } } },
  });

  if (!consultation) {
    res.status(404);
    throw new Error("Consultation not found");
  }

  // Verify participant
  const lawyerProfile = await prisma.lawyerProfile.findUnique({
    where: { userId: req.user.id },
  });
  const isParticipant =
    consultation.clientId === req.user.id ||
    consultation.lawyerId === lawyerProfile?.id ||
    req.user.role === "ADMIN";

  if (!isParticipant) {
    res.status(403);
    throw new Error("Not authorized");
  }

  // Return existing summary if available
  if (consultation.summary) {
    res.json({ success: true, data: consultation.summary });
    return;
  }

  // Generate summary if consultation is completed
  if (consultation.status !== "COMPLETED") {
    res.status(400);
    throw new Error("Summary is only available for completed consultations");
  }

  const summary = await generateConsultationSummary(req.params.id);
  res.json({ success: true, data: summary });
});
