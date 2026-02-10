import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import gemini from "../config/gemini.js";
import { getIO } from "../config/socket.js";
import { generateConsultationSummary } from "../services/summary.service.js";
import {
  notifyConsultationCompleted,
  notifyConsultationCancelled,
  cancelTrialNotifications,
  notifyNewReview,
  notifyRatingMilestone,
} from "../services/notification.service.js";

const LEGAL_CATEGORIES = [
  "Real Estate",
  "Family Law",
  "Employment Law",
  "Business & Contract",
  "Personal Injury",
  "Criminal Defense",
  "Immigration",
  "Intellectual Property",
  "Tax Law",
  "Estate Planning",
];

// Keyword-based fallback when OpenAI is unavailable
const KEYWORD_MAP = {
  "Real Estate": ["landlord", "tenant", "lease", "rent", "property", "eviction", "mortgage", "housing", "deposit", "apartment"],
  "Family Law": ["divorce", "custody", "child support", "alimony", "marriage", "adoption", "prenup", "visitation"],
  "Employment Law": ["fired", "terminated", "employer", "workplace", "discrimination", "harassment", "wages", "overtime", "wrongful termination"],
  "Business & Contract": ["contract", "business", "partnership", "llc", "corporation", "breach", "agreement", "nda", "vendor"],
  "Personal Injury": ["accident", "injury", "medical malpractice", "slip and fall", "negligence", "car accident", "insurance claim"],
  "Criminal Defense": ["arrested", "charged", "criminal", "dui", "felony", "misdemeanor", "bail", "plea"],
  "Immigration": ["visa", "green card", "citizenship", "deportation", "asylum", "immigration", "work permit", "h1b"],
  "Intellectual Property": ["patent", "trademark", "copyright", "trade secret", "infringement", "intellectual property"],
  "Tax Law": ["tax", "irs", "audit", "tax return", "tax debt", "withholding"],
  "Estate Planning": ["will", "trust", "estate", "probate", "inheritance", "power of attorney", "beneficiary"],
};

const US_STATE_PATTERNS = [
  { abbr: "AL", names: ["alabama"] }, { abbr: "AK", names: ["alaska"] },
  { abbr: "AZ", names: ["arizona"] }, { abbr: "AR", names: ["arkansas"] },
  { abbr: "CA", names: ["california", "los angeles", "san francisco", "san diego"] },
  { abbr: "CO", names: ["colorado", "denver"] }, { abbr: "CT", names: ["connecticut"] },
  { abbr: "DE", names: ["delaware"] }, { abbr: "FL", names: ["florida", "miami", "orlando", "tampa"] },
  { abbr: "GA", names: ["georgia", "atlanta"] }, { abbr: "HI", names: ["hawaii"] },
  { abbr: "ID", names: ["idaho"] }, { abbr: "IL", names: ["illinois", "chicago"] },
  { abbr: "IN", names: ["indiana"] }, { abbr: "IA", names: ["iowa"] },
  { abbr: "KS", names: ["kansas"] }, { abbr: "KY", names: ["kentucky"] },
  { abbr: "LA", names: ["louisiana", "new orleans"] }, { abbr: "ME", names: ["maine"] },
  { abbr: "MD", names: ["maryland", "baltimore"] }, { abbr: "MA", names: ["massachusetts", "boston"] },
  { abbr: "MI", names: ["michigan", "detroit"] }, { abbr: "MN", names: ["minnesota", "minneapolis"] },
  { abbr: "MS", names: ["mississippi"] }, { abbr: "MO", names: ["missouri", "st. louis", "kansas city"] },
  { abbr: "MT", names: ["montana"] }, { abbr: "NE", names: ["nebraska"] },
  { abbr: "NV", names: ["nevada", "las vegas"] }, { abbr: "NH", names: ["new hampshire"] },
  { abbr: "NJ", names: ["new jersey"] }, { abbr: "NM", names: ["new mexico"] },
  { abbr: "NY", names: ["new york", "nyc", "brooklyn", "manhattan"] },
  { abbr: "NC", names: ["north carolina", "charlotte"] }, { abbr: "ND", names: ["north dakota"] },
  { abbr: "OH", names: ["ohio", "cleveland", "columbus"] }, { abbr: "OK", names: ["oklahoma"] },
  { abbr: "OR", names: ["oregon", "portland"] }, { abbr: "PA", names: ["pennsylvania", "philadelphia", "pittsburgh"] },
  { abbr: "RI", names: ["rhode island"] }, { abbr: "SC", names: ["south carolina"] },
  { abbr: "SD", names: ["south dakota"] }, { abbr: "TN", names: ["tennessee", "nashville", "memphis"] },
  { abbr: "TX", names: ["texas", "houston", "dallas", "austin", "san antonio"] },
  { abbr: "UT", names: ["utah", "salt lake"] }, { abbr: "VT", names: ["vermont"] },
  { abbr: "VA", names: ["virginia"] }, { abbr: "WA", names: ["washington state", "seattle"] },
  { abbr: "WV", names: ["west virginia"] }, { abbr: "WI", names: ["wisconsin", "milwaukee"] },
  { abbr: "WY", names: ["wyoming"] },
];

function analyzeWithKeywords(description) {
  const lower = description.toLowerCase();

  let category = "Business & Contract";
  let maxScore = 0;
  for (const [cat, keywords] of Object.entries(KEYWORD_MAP)) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > maxScore) {
      maxScore = score;
      category = cat;
    }
  }

  let detectedState = null;
  for (const { abbr, names } of US_STATE_PATTERNS) {
    if (names.some((name) => lower.includes(name))) {
      detectedState = abbr;
      break;
    }
  }

  const urgentKeywords = ["emergency", "arrested", "eviction", "deadline", "tomorrow", "today", "urgent", "immediately"];
  const urgency = urgentKeywords.some((kw) => lower.includes(kw)) ? "high" : "medium";

  const summary = description.length > 300
    ? description.substring(0, 300).trim() + '...'
    : description;

  return {
    category,
    categoryConfidence: maxScore > 0 ? Math.min(0.5 + (maxScore * 0.1), 0.8) : 0.3,
    detectedState,
    stateConfidence: detectedState ? 0.6 : 0,
    urgency,
    summary,
  };
}

// @desc    Analyze a legal issue with AI
// @route   POST /api/consultations/analyze
export const analyzeIssue = asyncHandler(async (req, res) => {
  const { description } = req.body;

  if (gemini) {
    try {
      const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
      const prompt = `You are a legal issue classifier. Analyze this legal issue and return a JSON object with exactly these fields:
- "category": one of ${JSON.stringify(LEGAL_CATEGORIES)}
- "categoryConfidence": a number between 0.0 and 1.0 indicating your confidence in the category classification
- "detectedState": the US state abbreviation (e.g., "CA", "NY") if mentioned or implied, or null if not determinable
- "stateConfidence": a number between 0.0 and 1.0 indicating your confidence in the state detection (use 0 if detectedState is null)
- "urgency": "low", "medium", or "high" based on time sensitivity
- "summary": a 4-5 sentence plain-English summary of the legal issue suitable for display to the user. Include the key facts, parties involved, and what the user is seeking

Return ONLY valid JSON, no other text.

Legal issue: ${description}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      // Strip markdown code fences if present
      const jsonStr = text.replace(/^```json?\s*/, "").replace(/\s*```$/, "");
      const parsed = JSON.parse(jsonStr);

      if (!LEGAL_CATEGORIES.includes(parsed.category)) {
        parsed.category = "Business & Contract";
      }

      // Clamp confidence values
      parsed.categoryConfidence = Math.max(0, Math.min(1,
        typeof parsed.categoryConfidence === 'number' ? parsed.categoryConfidence : 0.5
      ));
      parsed.stateConfidence = Math.max(0, Math.min(1,
        typeof parsed.stateConfidence === 'number' ? parsed.stateConfidence : 0
      ));
      if (!parsed.detectedState) {
        parsed.stateConfidence = 0;
      }
      parsed.summary = typeof parsed.summary === 'string' ? parsed.summary : '';

      res.json({ success: true, data: parsed });
      return;
    } catch (error) {
      console.error("Gemini analysis failed, falling back to keywords:", error.message);
    }
  }

  const result = analyzeWithKeywords(description);
  res.json({ success: true, data: result });
});

// @desc    Create a consultation request
// @route   POST /api/consultations
export const createConsultation = asyncHandler(async (req, res) => {
  const { lawyerId, category, description } = req.body;

  const lawyer = await prisma.lawyerProfile.findUnique({
    where: { id: lawyerId },
  });

  if (!lawyer) {
    res.status(404);
    throw new Error("Lawyer not found");
  }

  if (!lawyer.isAvailable) {
    res.status(400);
    throw new Error("Lawyer is not currently available");
  }

  const consultation = await prisma.consultation.create({
    data: {
      clientId: req.user.id,
      lawyerId,
      category,
      description,
    },
    include: {
      client: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      lawyer: {
        include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
      },
    },
  });

  // Create the client's first message from the description
  if (description && description.trim()) {
    const firstMessage = await prisma.message.create({
      data: {
        consultationId: consultation.id,
        senderId: req.user.id,
        content: description.trim(),
        messageType: "TEXT",
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
    });

    // Notify via socket
    try {
      const io = getIO();
      io.to(`consultation:${consultation.id}`).emit("new-message", firstMessage);
      io.to(`user:${consultation.lawyer.user.id}`).emit("new-message", firstMessage);
    } catch {}
  }

  res.status(201).json({ success: true, data: consultation });
});

// @desc    Get user's consultations
// @route   GET /api/consultations
export const getConsultations = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const where = {};

  if (req.user.role === "CLIENT") {
    where.clientId = req.user.id;
  } else if (req.user.role === "LAWYER") {
    const profile = await prisma.lawyerProfile.findUnique({
      where: { userId: req.user.id },
    });
    where.lawyerId = profile.id;
  }

  if (status) where.status = status;

  const skip = (Number(page) - 1) * Number(limit);

  const [consultations, total] = await Promise.all([
    prisma.consultation.findMany({
      where,
      include: {
        client: { select: { firstName: true, lastName: true, avatar: true } },
        lawyer: {
          include: { user: { select: { firstName: true, lastName: true, avatar: true } } },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            content: true,
            messageType: true,
            createdAt: true,
            senderId: true,
            sender: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.consultation.count({ where }),
  ]);

  // Flatten last message for each consultation
  const data = consultations.map((c) => ({
    ...c,
    lastMessage: c.messages[0] || null,
    messages: undefined,
  }));

  res.json({
    success: true,
    data,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

// @desc    Get single consultation
// @route   GET /api/consultations/:id
export const getConsultation = asyncHandler(async (req, res) => {
  const consultation = await prisma.consultation.findUnique({
    where: { id: req.params.id },
    include: {
      client: { select: { firstName: true, lastName: true, avatar: true, email: true } },
      lawyer: {
        include: { user: { select: { firstName: true, lastName: true, avatar: true } } },
      },
      payment: true,
      review: true,
    },
  });

  if (!consultation) {
    res.status(404);
    throw new Error("Consultation not found");
  }

  // Only allow participants to view
  const lawyerProfile = await prisma.lawyerProfile.findUnique({
    where: { userId: req.user.id },
  });
  const isParticipant =
    consultation.clientId === req.user.id ||
    consultation.lawyerId === lawyerProfile?.id ||
    req.user.role === "ADMIN";

  if (!isParticipant) {
    res.status(403);
    throw new Error("Not authorized to view this consultation");
  }

  res.json({ success: true, data: consultation });
});

// @desc    Update consultation status
// @route   PUT /api/consultations/:id/status
export const updateConsultationStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const now = new Date();
  const trialEndAt = status === "TRIAL"
    ? new Date(now.getTime() + 3 * 60 * 1000) // 3 minutes from now
    : undefined;

  const consultation = await prisma.consultation.update({
    where: { id: req.params.id },
    data: {
      status,
      ...(status === "TRIAL" && { startedAt: now, trialEndAt }),
      ...(status === "ACTIVE" && !trialEndAt && { startedAt: now }),
      ...(status === "COMPLETED" && { endedAt: now }),
      ...(status === "CANCELLED" && { endedAt: now }),
    },
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
      lawyer: {
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });

  // Emit status change to both participants
  try {
    const io = getIO();
    io.to(`consultation:${consultation.id}`).emit("consultation-status-change", {
      consultationId: consultation.id,
      status: consultation.status,
      trialEndAt: consultation.trialEndAt,
    });

    // Also notify personal rooms
    io.to(`user:${consultation.clientId}`).emit("consultation-status-change", {
      consultationId: consultation.id,
      status: consultation.status,
      trialEndAt: consultation.trialEndAt,
    });
    if (consultation.lawyer?.user) {
      io.to(`user:${consultation.lawyer.user.id}`).emit("consultation-status-change", {
        consultationId: consultation.id,
        status: consultation.status,
        trialEndAt: consultation.trialEndAt,
      });
    }
  } catch {}

  // Auto-generate AI summary when consultation is completed
  if (status === "COMPLETED") {
    generateConsultationSummary(consultation.id).catch(() => {});
    const lawyerName = `${consultation.lawyer.user.firstName} ${consultation.lawyer.user.lastName}`;
    notifyConsultationCompleted(consultation.clientId, lawyerName, consultation.id);
    cancelTrialNotifications(consultation.id);
  }

  // Notify client if cancelled by lawyer
  if (status === "CANCELLED") {
    const lawyerName = `${consultation.lawyer.user.firstName} ${consultation.lawyer.user.lastName}`;
    notifyConsultationCancelled(consultation.clientId, lawyerName, consultation.id);
    cancelTrialNotifications(consultation.id);
  }

  res.json({ success: true, data: consultation });
});

// @desc    Add a review to a consultation
// @route   POST /api/consultations/:id/review
export const addReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;

  const consultation = await prisma.consultation.findUnique({
    where: { id: req.params.id },
  });

  if (!consultation) {
    res.status(404);
    throw new Error("Consultation not found");
  }

  if (consultation.clientId !== req.user.id) {
    res.status(403);
    throw new Error("Only the client can review");
  }

  if (consultation.status !== "COMPLETED") {
    res.status(400);
    throw new Error("Can only review completed consultations");
  }

  const review = await prisma.review.create({
    data: {
      consultationId: consultation.id,
      reviewerId: req.user.id,
      lawyerProfileId: consultation.lawyerId,
      rating,
      comment,
    },
  });

  // Update lawyer average rating
  const reviews = await prisma.review.aggregate({
    where: { lawyerProfileId: consultation.lawyerId },
    _avg: { rating: true },
    _count: true,
  });

  const lawyerProfile = await prisma.lawyerProfile.update({
    where: { id: consultation.lawyerId },
    data: {
      rating: reviews._avg.rating || 0,
      totalReviews: reviews._count,
    },
    include: { user: { select: { id: true } } },
  });

  // Get reviewer name for notification
  const reviewer = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { firstName: true, lastName: true },
  });
  const reviewerName = reviewer ? `${reviewer.firstName} ${reviewer.lastName}` : "A client";
  notifyNewReview(lawyerProfile.user.id, reviewerName, rating, consultation.id);

  // Check for five-star milestone (every 10 five-star reviews)
  if (rating === 5) {
    const fiveStarCount = await prisma.review.count({
      where: { lawyerProfileId: consultation.lawyerId, rating: 5 },
    });
    if (fiveStarCount > 0 && fiveStarCount % 10 === 0) {
      notifyRatingMilestone(lawyerProfile.user.id, fiveStarCount);
    }
  }

  res.status(201).json({ success: true, data: review });
});

// @desc    Request a formal consultation (audio/video)
// @route   POST /api/consultations/:id/request
export const requestConsultation = asyncHandler(async (req, res) => {
  const { type } = req.body; // 'audio' or 'video'

  if (!type || !["audio", "video"].includes(type)) {
    res.status(400);
    throw new Error("Type must be 'audio' or 'video'");
  }

  const consultation = await prisma.consultation.findUnique({
    where: { id: req.params.id },
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
      lawyer: {
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });

  if (!consultation) {
    res.status(404);
    throw new Error("Consultation not found");
  }

  if (consultation.clientId !== req.user.id) {
    res.status(403);
    throw new Error("Only the client can request a consultation");
  }

  if (consultation.status !== "PENDING") {
    res.status(400);
    throw new Error("Consultation must be in PENDING status to request");
  }

  if (consultation.requestedType) {
    res.status(400);
    throw new Error("A consultation has already been requested");
  }

  // Update consultation with requested type
  const updated = await prisma.consultation.update({
    where: { id: req.params.id },
    data: { requestedType: type },
    include: {
      client: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      lawyer: {
        include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
      },
    },
  });

  // Create a system message
  const clientName = `${consultation.client.firstName} ${consultation.client.lastName}`;
  const systemMessage = await prisma.message.create({
    data: {
      consultationId: consultation.id,
      senderId: req.user.id,
      content: `${clientName} has requested an ${type} consultation`,
      messageType: "SYSTEM",
    },
    include: {
      sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
    },
  });

  // Notify via socket
  try {
    const io = getIO();

    // Broadcast system message to consultation room
    io.to(`consultation:${consultation.id}`).emit("new-message", systemMessage);

    // Notify the lawyer in their personal room
    io.to(`user:${consultation.lawyer.user.id}`).emit("consultation-request", {
      consultationId: consultation.id,
      type,
      clientName,
    });
  } catch {}

  res.json({ success: true, data: updated });
});
