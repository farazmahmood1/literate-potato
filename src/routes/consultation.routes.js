import { Router } from "express";
import { body } from "express-validator";
import {
  createConsultation,
  getConsultations,
  getConsultation,
  updateConsultationStatus,
  addReview,
  analyzeIssue,
  requestConsultation,
  getRecentContacts,
} from "../controllers/consultation.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

const router = Router();

router.use(protect);

router.post(
  "/",
  [
    body("lawyerId").notEmpty().withMessage("Lawyer ID is required"),
    body("category").notEmpty().withMessage("Category is required"),
    body("description").notEmpty().withMessage("Description is required"),
  ],
  validate,
  createConsultation
);

router.post(
  "/analyze",
  [body("description").isLength({ min: 20 }).withMessage("Description must be at least 20 characters")],
  validate,
  analyzeIssue
);

router.get("/", getConsultations);
router.get("/recent-contacts", getRecentContacts);
router.get("/:id", getConsultation);

router.put(
  "/:id/status",
  [body("status").isIn(["PENDING", "ACTIVE", "COMPLETED", "CANCELLED"]).withMessage("Invalid status")],
  validate,
  updateConsultationStatus
);

router.post(
  "/:id/request",
  [body("type").isIn(["audio", "video"]).withMessage("Type must be 'audio' or 'video'")],
  validate,
  requestConsultation
);

router.post(
  "/:id/review",
  [
    body("rating").isInt({ min: 1, max: 5 }).withMessage("Rating must be between 1 and 5"),
    body("comment").optional().isString(),
  ],
  validate,
  addReview
);

export default router;
