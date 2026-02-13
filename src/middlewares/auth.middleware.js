import { clerkMiddleware, getAuth } from "@clerk/express";
import prisma from "../lib/prisma.js";

// Throttle cache for lastActiveAt updates (prevents DB write on every request)
const _lastActiveCache = {};

// Clerk middleware - attach to app level
export const clerk = clerkMiddleware();

// Protect routes - requires authenticated Clerk session + syncs user to DB
export const protect = async (req, res, next) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      res.status(401);
      throw new Error("Not authorized, no session");
    }

    // Find user by clerkId in our database
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: {
        id: true,
        clerkId: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isVerified: true,
      },
    });

    if (!user) {
      res.status(401);
      throw new Error("User not found in database. Please sync your account first via POST /api/auth/sync.");
    }

    req.user = user;

    // Fire-and-forget lastActiveAt update (throttled: once per 30s per user)
    const now = Date.now();
    const cacheKey = user.id;
    if (!_lastActiveCache[cacheKey] || now - _lastActiveCache[cacheKey] > 30000) {
      _lastActiveCache[cacheKey] = now;
      prisma.user.update({
        where: { id: user.id },
        data: { lastActiveAt: new Date() },
      }).catch(() => {});
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Authorize by role
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      res.status(403);
      return next(new Error("Not authorized for this action"));
    }
    next();
  };
};
