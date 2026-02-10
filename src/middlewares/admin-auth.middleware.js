import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || "lawyer-direct-admin-secret-change-me";

/**
 * Protect admin routes using JWT (not Clerk).
 * Expects: Authorization: Bearer <token>
 */
export const adminProtect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401);
      throw new Error("Not authorized, no token");
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });

    if (!user || user.role !== "ADMIN") {
      res.status(403);
      throw new Error("Not authorized, admin access required");
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      res.status(401);
      error.message = "Not authorized, invalid or expired token";
    }
    next(error);
  }
};

export function signAdminToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "24h" });
}
