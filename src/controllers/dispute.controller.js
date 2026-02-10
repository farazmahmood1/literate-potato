import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import { getIO } from "../config/socket.js";
import { issueStripeRefund } from "../services/refund.service.js";

const DISPUTE_INCLUDE = {
  filedBy: { select: { id: true, firstName: true, lastName: true, avatar: true } },
  filedAgainst: { select: { id: true, firstName: true, lastName: true, avatar: true } },
  consultation: {
    select: {
      id: true,
      category: true,
      description: true,
      status: true,
      createdAt: true,
      payment: { select: { id: true, amount: true, status: true, stripePaymentId: true } },
    },
  },
  evidence: {
    include: { submittedBy: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
  },
  timeline: {
    include: { actor: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
  },
};

// Helper: verify user is participant
function assertParticipant(dispute, userId) {
  if (dispute.filedById !== userId && dispute.filedAgainstId !== userId) {
    throw Object.assign(new Error("Not authorized to access this dispute"), { statusCode: 403 });
  }
}

// Helper: emit socket to both parties
function emitToParties(dispute, event, payload) {
  try {
    const io = getIO();
    io.to(`user:${dispute.filedById}`).emit(event, payload);
    io.to(`user:${dispute.filedAgainstId}`).emit(event, payload);
  } catch {}
}

// Helper: create timeline event
async function addTimelineEvent(disputeId, actorId, action, description, metadata = null) {
  return prisma.disputeEvent.create({
    data: { disputeId, actorId, action, description, metadata },
  });
}

// ──────────────────────────────────────────────
// @desc    Create a new dispute
// @route   POST /api/disputes
export const createDispute = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { consultationId, category, description } = req.body;

  if (!consultationId || !category || !description) {
    res.status(400);
    throw new Error("consultationId, category, and description are required");
  }

  // Load consultation with payment
  const consultation = await prisma.consultation.findUnique({
    where: { id: consultationId },
    include: {
      payment: true,
      lawyer: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
    },
  });

  if (!consultation) { res.status(404); throw new Error("Consultation not found"); }
  if (consultation.clientId !== userId) { res.status(403); throw new Error("Only the client can open a dispute"); }
  if (!["ACTIVE", "COMPLETED"].includes(consultation.status)) {
    res.status(400);
    throw new Error("Disputes can only be filed on active or completed consultations");
  }
  if (!consultation.payment || consultation.payment.status !== "SUCCEEDED") {
    res.status(400);
    throw new Error("Disputes can only be filed on paid consultations");
  }

  // 30-day window check
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (consultation.endedAt && new Date(consultation.endedAt) < thirtyDaysAgo) {
    res.status(400);
    throw new Error("Disputes must be filed within 30 days of consultation completion");
  }

  // One active dispute per consultation
  const existing = await prisma.dispute.findFirst({
    where: {
      consultationId,
      status: { in: ["OPEN", "LAWYER_RESPONSE", "MEDIATION", "ESCALATED"] },
    },
  });
  if (existing) { res.status(400); throw new Error("An active dispute already exists for this consultation"); }

  const lawyerUserId = consultation.lawyer.user.id;
  const lawyerDeadline = new Date(Date.now() + 72 * 60 * 60 * 1000);

  const dispute = await prisma.dispute.create({
    data: {
      consultationId,
      filedById: userId,
      filedAgainstId: lawyerUserId,
      category,
      description,
      status: "OPEN",
      lawyerDeadline,
    },
    include: DISPUTE_INCLUDE,
  });

  await addTimelineEvent(dispute.id, userId, "opened", `Dispute opened: ${category}`);

  // Notify lawyer
  try {
    const { notifyDisputeOpened } = await import("../services/notification.service.js");
    const client = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    notifyDisputeOpened(lawyerUserId, `${client.firstName} ${client.lastName}`, consultation.category, dispute.id);
  } catch {}

  emitToParties(dispute, "dispute-opened", {
    disputeId: dispute.id,
    consultationId,
    category,
  });

  res.status(201).json({ success: true, data: dispute });
});

// ──────────────────────────────────────────────
// @desc    Get my disputes
// @route   GET /api/disputes
export const getMyDisputes = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { status, page = 1, limit = 20 } = req.query;

  const where = {
    OR: [{ filedById: userId }, { filedAgainstId: userId }],
  };
  if (status) where.status = status;

  const [disputes, total] = await Promise.all([
    prisma.dispute.findMany({
      where,
      include: {
        filedBy: { select: { firstName: true, lastName: true, avatar: true } },
        filedAgainst: { select: { firstName: true, lastName: true, avatar: true } },
        consultation: { select: { id: true, category: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    }),
    prisma.dispute.count({ where }),
  ]);

  res.json({
    success: true,
    data: disputes,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

// ──────────────────────────────────────────────
// @desc    Get single dispute detail
// @route   GET /api/disputes/:id
export const getDispute = asyncHandler(async (req, res) => {
  const dispute = await prisma.dispute.findUnique({
    where: { id: req.params.id },
    include: DISPUTE_INCLUDE,
  });

  if (!dispute) { res.status(404); throw new Error("Dispute not found"); }
  assertParticipant(dispute, req.user.id);

  res.json({ success: true, data: dispute });
});

// ──────────────────────────────────────────────
// @desc    Lawyer responds to dispute
// @route   POST /api/disputes/:id/respond
export const respondToDispute = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { response } = req.body;

  if (!response) { res.status(400); throw new Error("Response text is required"); }

  const dispute = await prisma.dispute.findUnique({ where: { id: req.params.id } });
  if (!dispute) { res.status(404); throw new Error("Dispute not found"); }
  if (dispute.filedAgainstId !== userId) { res.status(403); throw new Error("Only the lawyer can respond"); }
  if (!["OPEN", "LAWYER_RESPONSE"].includes(dispute.status)) {
    res.status(400);
    throw new Error("Dispute is not in a respondable state");
  }

  const mediationDeadline = new Date(Date.now() + 72 * 60 * 60 * 1000);

  const [updated] = await Promise.all([
    prisma.dispute.update({
      where: { id: dispute.id },
      data: { status: "MEDIATION", mediationDeadline },
      include: DISPUTE_INCLUDE,
    }),
    prisma.disputeEvidence.create({
      data: {
        disputeId: dispute.id,
        submittedById: userId,
        type: "text",
        content: response,
      },
    }),
    addTimelineEvent(dispute.id, userId, "lawyer_responded", "Lawyer submitted their response"),
  ]);

  // Notify client
  try {
    const { notifyDisputeResponse } = await import("../services/notification.service.js");
    const lawyer = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    notifyDisputeResponse(dispute.filedById, `${lawyer.firstName} ${lawyer.lastName}`, dispute.id);
  } catch {}

  emitToParties(updated, "dispute-status-change", {
    disputeId: dispute.id,
    status: "MEDIATION",
  });

  res.json({ success: true, data: updated });
});

// ──────────────────────────────────────────────
// @desc    Add evidence to dispute
// @route   POST /api/disputes/:id/evidence
export const addEvidence = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { type, content, fileName, mimeType } = req.body;

  if (!type || !content) { res.status(400); throw new Error("type and content are required"); }

  const dispute = await prisma.dispute.findUnique({ where: { id: req.params.id } });
  if (!dispute) { res.status(404); throw new Error("Dispute not found"); }
  assertParticipant(dispute, userId);

  if (["RESOLVED", "CLOSED"].includes(dispute.status)) {
    res.status(400);
    throw new Error("Cannot add evidence to a resolved or closed dispute");
  }

  const evidence = await prisma.disputeEvidence.create({
    data: { disputeId: dispute.id, submittedById: userId, type, content, fileName, mimeType },
    include: { submittedBy: { select: { firstName: true, lastName: true } } },
  });

  await addTimelineEvent(dispute.id, userId, "evidence_added", `${evidence.submittedBy.firstName} added ${type} evidence`);

  // Notify other party
  const otherPartyId = userId === dispute.filedById ? dispute.filedAgainstId : dispute.filedById;
  try {
    const { notifyDisputeEvidenceAdded } = await import("../services/notification.service.js");
    notifyDisputeEvidenceAdded(otherPartyId, `${evidence.submittedBy.firstName} ${evidence.submittedBy.lastName}`, dispute.id);
  } catch {}

  emitToParties(dispute, "dispute-evidence-added", {
    disputeId: dispute.id,
    evidenceId: evidence.id,
  });

  res.status(201).json({ success: true, data: evidence });
});

// ──────────────────────────────────────────────
// @desc    Client escalates dispute to admin
// @route   PUT /api/disputes/:id/escalate
export const escalateDispute = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const dispute = await prisma.dispute.findUnique({ where: { id: req.params.id } });
  if (!dispute) { res.status(404); throw new Error("Dispute not found"); }
  if (dispute.filedById !== userId) { res.status(403); throw new Error("Only the client can escalate"); }

  // Allow escalation from MEDIATION, or from OPEN if lawyer deadline passed
  const canEscalate =
    dispute.status === "MEDIATION" ||
    (dispute.status === "OPEN" && dispute.lawyerDeadline && new Date(dispute.lawyerDeadline) < new Date());

  if (!canEscalate) {
    res.status(400);
    throw new Error("Dispute cannot be escalated at this stage");
  }

  const updated = await prisma.dispute.update({
    where: { id: dispute.id },
    data: { status: "ESCALATED" },
    include: DISPUTE_INCLUDE,
  });

  await addTimelineEvent(dispute.id, userId, "escalated", "Dispute escalated to admin review");

  try {
    const { notifyDisputeEscalated } = await import("../services/notification.service.js");
    notifyDisputeEscalated(dispute.filedById, dispute.id);
    notifyDisputeEscalated(dispute.filedAgainstId, dispute.id);
  } catch {}

  emitToParties(updated, "dispute-status-change", {
    disputeId: dispute.id,
    status: "ESCALATED",
  });

  res.json({ success: true, data: updated });
});

// ──────────────────────────────────────────────
// @desc    Client withdraws dispute
// @route   PUT /api/disputes/:id/withdraw
export const withdrawDispute = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const dispute = await prisma.dispute.findUnique({ where: { id: req.params.id } });
  if (!dispute) { res.status(404); throw new Error("Dispute not found"); }
  if (dispute.filedById !== userId) { res.status(403); throw new Error("Only the client can withdraw"); }
  if (["RESOLVED", "CLOSED"].includes(dispute.status)) {
    res.status(400);
    throw new Error("Dispute is already resolved or closed");
  }

  const updated = await prisma.dispute.update({
    where: { id: dispute.id },
    data: { status: "CLOSED" },
    include: DISPUTE_INCLUDE,
  });

  await addTimelineEvent(dispute.id, userId, "withdrawn", "Client withdrew the dispute");

  emitToParties(updated, "dispute-status-change", {
    disputeId: dispute.id,
    status: "CLOSED",
  });

  res.json({ success: true, data: updated });
});

// ──────────────────────────────────────────────
// @desc    Propose a resolution
// @route   PUT /api/disputes/:id/propose-resolution
export const proposeResolution = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { resolutionType, refundAmount, note } = req.body;

  if (!resolutionType || !note) { res.status(400); throw new Error("resolutionType and note are required"); }

  const dispute = await prisma.dispute.findUnique({
    where: { id: req.params.id },
    include: { consultation: { select: { payment: true } } },
  });
  if (!dispute) { res.status(404); throw new Error("Dispute not found"); }
  assertParticipant(dispute, userId);

  if (!["MEDIATION", "OPEN", "LAWYER_RESPONSE"].includes(dispute.status)) {
    res.status(400);
    throw new Error("Dispute is not in a negotiable state");
  }

  // Validate refund amount
  if (["FULL_REFUND", "PARTIAL_REFUND"].includes(resolutionType)) {
    const paymentAmount = dispute.consultation?.payment?.amount || 0;
    if (resolutionType === "PARTIAL_REFUND" && (!refundAmount || refundAmount <= 0 || refundAmount > paymentAmount)) {
      res.status(400);
      throw new Error("Invalid refund amount");
    }
  }

  const updated = await prisma.dispute.update({
    where: { id: dispute.id },
    data: {
      proposedBy: userId,
      proposedResolution: { resolutionType, refundAmount: refundAmount || null, note },
    },
    include: DISPUTE_INCLUDE,
  });

  const actor = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
  await addTimelineEvent(dispute.id, userId, "proposal", `${actor.firstName} proposed: ${resolutionType}`, { resolutionType, refundAmount, note });

  // Notify other party
  const otherPartyId = userId === dispute.filedById ? dispute.filedAgainstId : dispute.filedById;
  try {
    const { notifyDisputeProposal } = await import("../services/notification.service.js");
    notifyDisputeProposal(otherPartyId, `${actor.firstName} ${actor.lastName}`, dispute.id);
  } catch {}

  emitToParties(updated, "dispute-message", {
    disputeId: dispute.id,
    type: "proposal",
  });

  res.json({ success: true, data: updated });
});

// ──────────────────────────────────────────────
// @desc    Accept the other party's proposed resolution
// @route   PUT /api/disputes/:id/accept-resolution
export const acceptResolution = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const dispute = await prisma.dispute.findUnique({
    where: { id: req.params.id },
    include: { consultation: { select: { id: true, payment: true } } },
  });
  if (!dispute) { res.status(404); throw new Error("Dispute not found"); }
  assertParticipant(dispute, userId);

  if (!dispute.proposedResolution || dispute.proposedBy === userId) {
    res.status(400);
    throw new Error("No proposal from the other party to accept");
  }

  const proposal = dispute.proposedResolution;
  let stripeRefundId = null;

  // Process refund if applicable
  if (["FULL_REFUND", "PARTIAL_REFUND"].includes(proposal.resolutionType) && dispute.consultation?.payment?.status === "SUCCEEDED") {
    try {
      const refund = await issueStripeRefund(
        dispute.consultation.id,
        proposal.resolutionType === "PARTIAL_REFUND" ? proposal.refundAmount : null,
      );
      stripeRefundId = refund.id;
    } catch (err) {
      res.status(500);
      throw new Error(`Refund failed: ${err.message}`);
    }
  }

  const refundAmount = proposal.resolutionType === "FULL_REFUND"
    ? dispute.consultation?.payment?.amount
    : proposal.refundAmount || null;

  const updated = await prisma.dispute.update({
    where: { id: dispute.id },
    data: {
      status: "RESOLVED",
      resolutionType: proposal.resolutionType,
      resolutionNote: proposal.note,
      refundAmount,
      stripeRefundId,
      resolvedAt: new Date(),
    },
    include: DISPUTE_INCLUDE,
  });

  await addTimelineEvent(dispute.id, userId, "resolved", `Resolution accepted: ${proposal.resolutionType}`, { resolutionType: proposal.resolutionType, refundAmount });

  try {
    const { notifyDisputeResolved } = await import("../services/notification.service.js");
    notifyDisputeResolved(dispute.filedById, proposal.resolutionType, refundAmount, dispute.id);
    notifyDisputeResolved(dispute.filedAgainstId, proposal.resolutionType, refundAmount, dispute.id);
  } catch {}

  emitToParties(updated, "dispute-resolved", {
    disputeId: dispute.id,
    resolutionType: proposal.resolutionType,
    refundAmount,
  });

  res.json({ success: true, data: updated });
});
