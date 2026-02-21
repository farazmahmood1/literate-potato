import openai from "../config/openai.js";
import prisma from "../lib/prisma.js";

/**
 * Generate an AI summary of a completed consultation based on its messages.
 */
export async function generateConsultationSummary(consultationId) {
  const consultation = await prisma.consultation.findUnique({
    where: { id: consultationId },
    include: {
      client: { select: { firstName: true, lastName: true } },
      lawyer: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
      messages: {
        where: { messageType: "TEXT" },
        orderBy: { createdAt: "asc" },
        select: { content: true, senderId: true, createdAt: true },
      },
    },
  });

  if (!consultation || consultation.messages.length === 0) {
    return null;
  }

  const clientName = `${consultation.client.firstName} ${consultation.client.lastName}`;
  const lawyerName = `${consultation.lawyer.user.firstName} ${consultation.lawyer.user.lastName}`;

  // Build transcript
  const transcript = consultation.messages
    .map((m) => {
      const who = m.senderId === consultation.clientId ? clientName : lawyerName;
      return `${who}: ${m.content}`;
    })
    .join("\n");

  if (!openai) {
    // Fallback: basic summary
    const summary = {
      overview: `Consultation about ${consultation.category} between ${clientName} and ${lawyerName}.`,
      keyPoints: ["Consultation completed"],
      advice: "Please refer to the chat transcript for details.",
      nextSteps: [],
      messageCount: consultation.messages.length,
    };
    await prisma.consultation.update({
      where: { id: consultationId },
      data: { summary },
    });
    return summary;
  }

  try {
    const prompt = `You are a legal consultation summarizer. Analyze the following chat transcript between a client and a lawyer, and produce a JSON summary with these fields:
- "overview": A 2-3 sentence overview of the consultation
- "keyPoints": An array of 3-5 key points discussed
- "advice": The main legal advice given by the lawyer (1-2 sentences)
- "nextSteps": An array of recommended next steps for the client
- "messageCount": ${consultation.messages.length}

Return ONLY valid JSON, no other text.

Category: ${consultation.category}
Client: ${clientName}
Lawyer: ${lawyerName}

Transcript:
${transcript.substring(0, 8000)}`;

    // AbortController with 10s timeout — summaries are longer but shouldn't block indefinitely
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 1000,
    }, { signal: controller.signal });

    clearTimeout(timeoutId);

    const summary = JSON.parse(response.choices[0].message.content);
    summary.messageCount = consultation.messages.length;

    await prisma.consultation.update({
      where: { id: consultationId },
      data: { summary },
    });

    return summary;
  } catch (err) {
    console.error("Summary generation failed:", err.message);
    return null;
  }
}
