import prisma from "../lib/prisma.js";
import { signAdminToken } from "../middlewares/admin-auth.middleware.js";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@lawyerdirect.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

/**
 * POST /api/admin/login
 * Validates admin credentials and returns a JWT token.
 */
export const adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400);
      throw new Error("Email and password are required");
    }

    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      res.status(401);
      throw new Error("Invalid email or password");
    }

    // Find or create admin user in DB
    let adminUser = await prisma.user.findUnique({
      where: { email: ADMIN_EMAIL },
    });

    if (!adminUser) {
      adminUser = await prisma.user.create({
        data: {
          clerkId: `admin_local_${Date.now()}`,
          email: ADMIN_EMAIL,
          firstName: "Admin",
          lastName: "User",
          role: "ADMIN",
          isVerified: true,
        },
      });
    }

    // Ensure role is ADMIN
    if (adminUser.role !== "ADMIN") {
      await prisma.user.update({
        where: { id: adminUser.id },
        data: { role: "ADMIN" },
      });
    }

    const token = signAdminToken(adminUser.id);

    res.json({
      success: true,
      token,
      user: {
        id: adminUser.id,
        email: adminUser.email,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
        role: adminUser.role,
      },
    });
  } catch (error) {
    next(error);
  }
};
