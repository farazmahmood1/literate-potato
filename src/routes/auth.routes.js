import { Router } from "express";
import { syncUser, getMe } from "../controllers/auth.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = Router();

// Note: Clerk webhook is registered in app.js BEFORE JSON parser for svix signature verification

// Sync Clerk user to our DB (requires Clerk session)
router.post("/sync", syncUser);

// Get current user from our DB
router.get("/me", protect, getMe);

export default router;
