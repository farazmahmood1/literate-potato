import stripe from "../config/stripe.js";
import prisma from "../lib/prisma.js";

/**
 * Issue a Stripe refund for a consultation's payment.
 * @param {string} consultationId
 * @param {number|null} amountCents — null or 0 = full refund, positive int = partial
 * @returns {object} Stripe refund object
 */
export async function issueStripeRefund(consultationId, amountCents = null) {
  const payment = await prisma.payment.findUnique({
    where: { consultationId },
  });

  if (!payment) throw new Error("No payment found for this consultation");
  if (!payment.stripePaymentId) throw new Error("No Stripe payment ID on record");
  if (payment.status !== "SUCCEEDED") throw new Error("Payment is not in SUCCEEDED status");

  const refundParams = {
    payment_intent: payment.stripePaymentId,
    reason: "requested_by_customer",
    metadata: { consultationId },
  };

  // Partial refund
  if (amountCents && amountCents > 0 && amountCents < payment.amount) {
    refundParams.amount = amountCents;
  }

  const refund = await stripe.refunds.create(refundParams);

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "REFUNDED" },
  });

  return refund;
}
