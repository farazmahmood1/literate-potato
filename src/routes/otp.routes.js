import { Router } from "express";
import { body } from "express-validator";
import { sendOtp, verifyOtpCode } from "../controllers/otp.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { rateLimit } from "../middlewares/rateLimit.middleware.js";

const router = Router();

// Rate limit: max 5 OTP sends per IP per minute
const otpSendLimiter = rateLimit({ windowMs: 60 * 1000, max: 5 });

// POST /api/otp/send
router.post(
  "/send",
  otpSendLimiter,
  [
    body("channel")
      .isIn(["phone", "email"])
      .withMessage("Channel must be 'phone' or 'email'"),
    body("destination")
      .notEmpty()
      .withMessage("Destination (phone number or email) is required"),
  ],
  validate,
  sendOtp
);

// POST /api/otp/verify
router.post(
  "/verify",
  [
    body("channel")
      .isIn(["phone", "email"])
      .withMessage("Channel must be 'phone' or 'email'"),
    body("destination").notEmpty().withMessage("Destination is required"),
    body("code")
      .isLength({ min: 6, max: 6 })
      .isNumeric()
      .withMessage("Code must be a 6-digit number"),
  ],
  validate,
  verifyOtpCode
);

export default router;
