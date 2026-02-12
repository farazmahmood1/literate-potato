import { Router } from "express";
import { body } from "express-validator";
import { createLawyerProfile, getLawyers, getFeaturedLawyers, getLawyer, getLawyerReviews, updateLawyerProfile, uploadProfilePhoto, recordProfileView } from "../controllers/lawyer.controller.js";
import { protect, authorize } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

const router = Router();

router.get("/", getLawyers);
router.get("/featured", getFeaturedLawyers);
router.get("/:id", getLawyer);
router.get("/:id/reviews", getLawyerReviews);
router.post("/:id/view", protect, recordProfileView);

router.post(
  "/profile",
  protect,
  [
    body("barNumber").notEmpty().withMessage("Bar number is required"),
    body("licenseState").notEmpty().withMessage("License state is required"),
    body("specializations").optional().isArray().withMessage("Specializations must be an array"),
  ],
  validate,
  createLawyerProfile
);

router.put("/profile", protect, authorize("LAWYER"), updateLawyerProfile);
router.post("/profile/photo", protect, authorize("LAWYER"), uploadProfilePhoto);

export default router;
