import { Router } from "express";
import { body } from "express-validator";
import {
  createJobPost,
  getJobPosts,
  getJobPost,
  acceptJobPost,
  declineJobPost,
  closeJobPost,
  deleteJobPost,
} from "../controllers/job-post.controller.js";
import { protect, authorize } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

const router = Router();

router.use(protect);

// Client creates a job post (broadcast or targeted invite)
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
  // Validate state is required for broadcast posts (no targetLawyerId)
  (req, res, next) => {
    if (!req.body.targetLawyerId && !req.body.state) {
      return res.status(400).json({
        success: false,
        errors: [{ msg: "State is required for broadcast job posts" }],
      });
    }
    next();
  },
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

// Client deletes their job post (non-ACCEPTED only)
router.delete("/:id", authorize("CLIENT"), deleteJobPost);

export default router;
