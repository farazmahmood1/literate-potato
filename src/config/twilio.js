import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

export const sendSMS = async (to, body) => {
  const message = await client.messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
  });
  return message;
};

// Twilio Verify: send OTP to phone number
export const sendPhoneVerification = async (to) => {
  const verification = await client.verify.v2
    .services(VERIFY_SERVICE_SID)
    .verifications.create({ to, channel: "sms" });
  return verification;
};

// Twilio Verify: check OTP code
export const checkPhoneVerification = async (to, code) => {
  const verificationCheck = await client.verify.v2
    .services(VERIFY_SERVICE_SID)
    .verificationChecks.create({ to, code });
  return verificationCheck;
};

export default client;
