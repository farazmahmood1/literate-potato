import asyncHandler from "express-async-handler";
import {
  sendPhoneVerification,
  checkPhoneVerification,
} from "../config/twilio.js";
import sgMail, { SENDGRID_FROM_EMAIL } from "../config/sendgrid.js";
import { generateOtp, storeOtp, verifyOtp } from "../utils/otpStore.js";

// Normalize phone to E.164 format
const normalizePhone = (phone) => {
  let normalized = phone.replace(/[^\d+]/g, "");
  if (!normalized.startsWith("+")) {
    normalized = "+1" + normalized; // default US
  }
  return normalized;
};

// @desc    Send OTP code (phone via Twilio Verify, email via SendGrid)
// @route   POST /api/otp/send
export const sendOtp = asyncHandler(async (req, res) => {
  const { channel, destination } = req.body;

  if (channel === "phone") {
    const normalizedPhone = normalizePhone(destination);

    // Dev mode: skip Twilio, use static code "123456"
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV] Phone OTP for ${normalizedPhone}: 123456`);
      return res.json({
        success: true,
        message: "Verification code sent to phone",
        data: { status: "pending", channel: "phone" },
      });
    }

    try {
      const verification = await sendPhoneVerification(normalizedPhone);
      res.json({
        success: true,
        message: "Verification code sent to phone",
        data: { status: verification.status, channel: "phone" },
      });
    } catch (error) {
      res.status(400);
      throw new Error(
        error.message || "Failed to send verification code to phone"
      );
    }
  } else if (channel === "email") {
    const code = generateOtp();
    storeOtp(destination.toLowerCase(), code);

    try {
      await sgMail.send({
        to: destination,
        from: { email: SENDGRID_FROM_EMAIL, name: "Lawyer Direct" },
        subject: "Your Verification Code - Lawyer Direct",
        text: `Your verification code is: ${code}. This code expires in 5 minutes.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #1A2B5F; margin-bottom: 16px;">Verification Code</h2>
            <p style="color: #6B7280; font-size: 16px;">Your verification code is:</p>
            <div style="background: #F3F4F8; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
              <span style="font-size: 36px; font-weight: 700; color: #1A2B5F; letter-spacing: 8px;">${code}</span>
            </div>
            <p style="color: #9CA3AF; font-size: 14px;">This code expires in 5 minutes. If you didn't request this, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
            <p style="color: #9CA3AF; font-size: 12px;">Lawyer Direct</p>
          </div>
        `,
      });

      res.json({
        success: true,
        message: "Verification code sent to email",
        data: { status: "pending", channel: "email" },
      });
    } catch (error) {
      res.status(500);
      throw new Error("Failed to send verification email. Please try again.");
    }
  } else {
    res.status(400);
    throw new Error("Invalid channel. Must be 'phone' or 'email'.");
  }
});

// @desc    Verify OTP code
// @route   POST /api/otp/verify
export const verifyOtpCode = asyncHandler(async (req, res) => {
  const { channel, destination, code } = req.body;

  if (channel === "phone") {
    const normalizedPhone = normalizePhone(destination);

    // Dev mode: accept static code "123456"
    if (process.env.NODE_ENV !== "production") {
      if (code === "123456") {
        return res.json({
          success: true,
          message: "Phone verified successfully",
          data: { status: "approved", channel: "phone" },
        });
      }
      res.status(400);
      throw new Error("Invalid verification code. Use 123456 in dev mode.");
    }

    try {
      const check = await checkPhoneVerification(normalizedPhone, code);

      if (check.status === "approved") {
        res.json({
          success: true,
          message: "Phone verified successfully",
          data: { status: "approved", channel: "phone" },
        });
      } else {
        res.status(400);
        throw new Error("Invalid verification code");
      }
    } catch (error) {
      if (error.status === 404) {
        res.status(400);
        throw new Error(
          "Verification code expired or not found. Please request a new one."
        );
      }
      // Re-throw if it's already a handled error
      if (res.statusCode >= 400) throw error;
      res.status(400);
      throw new Error("Invalid or expired verification code");
    }
  } else if (channel === "email") {
    const result = verifyOtp(destination.toLowerCase(), code);

    if (result.valid) {
      res.json({
        success: true,
        message: "Email verified successfully",
        data: { status: "approved", channel: "email" },
      });
    } else {
      res.status(400);
      throw new Error(result.reason);
    }
  } else {
    res.status(400);
    throw new Error("Invalid channel. Must be 'phone' or 'email'.");
  }
});
