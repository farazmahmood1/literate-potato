import prisma from "../lib/prisma.js";

/**
 * Generate a receipt object for a payment.
 * Returns structured receipt data (PDF generation can be added later with pdf-lib).
 */
export async function generateReceipt(paymentId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      consultation: {
        include: {
          lawyer: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      },
    },
  });

  if (!payment) return null;

  const receipt = {
    receiptId: `REC-${payment.id.substring(0, 8).toUpperCase()}`,
    date: payment.createdAt,
    client: {
      name: `${payment.user.firstName} ${payment.user.lastName}`,
      email: payment.user.email,
    },
    lawyer: {
      name: `${payment.consultation.lawyer.user.firstName} ${payment.consultation.lawyer.user.lastName}`,
    },
    consultation: {
      id: payment.consultationId,
      category: payment.consultation.category,
      startedAt: payment.consultation.startedAt,
      endedAt: payment.consultation.endedAt,
    },
    payment: {
      id: payment.id,
      stripeId: payment.stripePaymentId,
      amount: payment.amount,
      currency: "USD",
      status: payment.status,
    },
    company: {
      name: "Lawyer Direct",
      tagline: "Instant Legal Consultations",
    },
  };

  return receipt;
}
