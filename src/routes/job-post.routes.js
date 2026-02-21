import { Router } from "express";
import { body } from "express-validator";
import {
  createJobPost,
  getJobPosts,
  getJobPost,
  recordView,
  acceptJobPost,
  declineJobPost,
  closeJobPost,
  deleteJobPost,
  getOnlineLawyersForJob,
} from "../controllers/job-post.controller.js";
import { protect, authorize } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

const router = Router();

router.use(protect);

// Client creates a job post (broadcast to online lawyers in category, or targeted invite)
router.post(
  "/",
  authorize("CLIENT"),
  [
    body("category").notEmpty().withMessage("Category is required"),
    body("state").optional(),
    body("description").isLength({ min: 20 }).withMessage("Description must be at least 20 characters"),
    body("summary").notEmpty().withMessage("Summary is required"),
    body("targetLawyerId").optional().isUUID().withMessage("Invalid target lawyer ID"),
  ],
  validate,
  createJobPost
);

// Get job posts (lawyers see open ones matching their specializations, clients see their own)
router.get("/", getJobPosts);

// Get single job post
router.get("/:id", getJobPost);

// Client gets online lawyers matching a job post's category (live socket presence)
router.get("/:id/online-lawyers", authorize("CLIENT"), getOnlineLawyersForJob);

// Lawyer records a view on a job post
router.post("/:id/view", authorize("LAWYER"), recordView);

// Lawyer accepts a job post
router.put("/:id/accept", authorize("LAWYER"), acceptJobPost);

// Lawyer declines a job post (hides from their list)
router.put("/:id/decline", authorize("LAWYER"), declineJobPost);

// Client closes their job post
router.put("/:id/close", authorize("CLIENT"), closeJobPost);

// Client deletes their job post (non-ACCEPTED only)
router.delete("/:id", authorize("CLIENT"), deleteJobPost);

export default router;
