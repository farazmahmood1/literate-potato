import { Router } from "express";
import { syncUser, getMe, clerkWebhook } from "../controllers/auth.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = Router();

// Clerk webhook (no auth required - Clerk calls this)
router.post("/webhook", clerkWebhook);

// Sync Clerk user to our DB (requires Clerk session)
router.post("/sync", syncUser);

// Get current user from our DB
router.get("/me", protect, getMe);

export default router;
