import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export const SENDGRID_FROM_EMAIL =
  process.env.SENDGRID_FROM_EMAIL || "support@fynosign.com";

export default sgMail;
