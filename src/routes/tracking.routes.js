import { Router } from "express";
import { trackVisit } from "../controllers/tracking.controller.js";

const router = Router();

// Public — no auth required
router.post("/visit", trackVisit);

export default router;
