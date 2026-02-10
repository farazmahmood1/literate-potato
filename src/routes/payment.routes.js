import { Router } from "express";
import express from "express";
import { body } from "express-validator";
import { createPaymentIntent, stripeWebhook, getPayments, getEarningsSummary } from "../controllers/payment.controller.js";
import { protect, authorize } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

const router = Router();

// Stripe webhook needs raw body
router.post("/webhook", express.raw({ type: "application/json" }), stripeWebhook);

router.use(protect);

router.post(
  "/create-intent",
  [body("consultationId").notEmpty().withMessage("Consultation ID is required")],
  validate,
  createPaymentIntent
);

router.get("/", getPayments);

router.get("/earnings/summary", authorize("LAWYER"), getEarningsSummary);

export default router;
