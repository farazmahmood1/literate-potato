import { Router } from "express";
import { body } from "express-validator";
import {
  createJobPost,
  getJobPosts,
  getJobPost,
  acceptJobPost,
  declineJobPost,
  closeJobPost,
} from "../controllers/job-post.controller.js";
import { protect, authorize } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

const router = Router();

router.use(protect);

// Client creates a job post
router.post(
  "/",
  authorize("CLIENT"),
  [
    body("category").notEmpty().withMessage("Category is required"),
    body("state").notEmpty().withMessage("State is required"),
    body("description").isLength({ min: 20 }).withMessage("Description must be at least 20 characters"),
    body("summary").notEmpty().withMessage("Summary is required"),
  ],
  validate,
  createJobPost
);

// Get job posts (lawyers see open ones in their state, clients see their own)
router.get("/", getJobPosts);

// Get single job post
router.get("/:id", getJobPost);

// Lawyer accepts a job post
router.put("/:id/accept", authorize("LAWYER"), acceptJobPost);

// Lawyer declines a job post (hides from their list)
router.put("/:id/decline", authorize("LAWYER"), declineJobPost);

// Client closes their job post
router.put("/:id/close", authorize("CLIENT"), closeJobPost);

export default router;
