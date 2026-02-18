import { Router } from "express";
import {
  getPublicCareerPostings,
  getPublicCareerPosting,
  submitApplication,
} from "../controllers/career.controller.js";

const router = Router();

// Public routes — no auth required
router.get("/", getPublicCareerPostings);
router.get("/:id", getPublicCareerPosting);
router.post("/:id/apply", submitApplication);

export default router;
