import asyncHandler from "express-async-handler";
import crypto from "crypto";
import prisma from "../lib/prisma.js";

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers["x-real-ip"] || req.ip || "unknown";
}

function detectDeviceType(ua) {
  if (!ua) return "desktop";
  const lower = ua.toLowerCase();
  if (/ipad|tablet|kindle|silk|playbook/.test(lower)) return "tablet";
  if (/mobile|android|iphone|ipod|opera mini|iemobile|wpdesktop|windows phone|blackberry/.test(lower)) return "mobile";
  return "desktop";
}

// @desc    Track a site visit (public, no auth)
// @route   POST /api/tracking/visit
export const trackVisit = asyncHandler(async (req, res) => {
  const { path = "/", referrer } = req.body;
  const ip = getClientIp(req);
  const userAgent = req.headers["user-agent"] || "unknown";
  const fingerprint = crypto.createHash("sha256").update(`${ip}|${userAgent}`).digest("hex");
  const deviceType = detectDeviceType(userAgent);

  // Dedup: only insert one record per fingerprint per calendar day
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const existing = await prisma.siteVisit.findFirst({
    where: {
      fingerprint,
      createdAt: { gte: todayStart },
    },
  });

  if (!existing) {
    await prisma.siteVisit.create({
      data: { fingerprint, ipAddress: ip, userAgent, deviceType, path, referrer },
    });
  }

  res.json({ ok: true });
});
