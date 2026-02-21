import openai from "../config/openai.js";

function buildModerationPrompt(content, senderRole) {
  return `You are a content moderation system for a legal services platform where lawyers and clients communicate. Analyze the following message and determine if it should be blocked.

ALLOW these (they are normal in legal contexts):
- Discussions of crimes, criminal charges, legal cases
- Legal terminology including sensitive topics (assault, fraud, murder, theft, etc.)
- Descriptions of injuries, accidents, or distressing events
- Frank discussion of legal disputes, lawsuits, damages
- Emotional expressions about legal situations (frustration, fear, anger about a case)
- Questions about legal rights, processes, and procedures
- Threats of legal action ("I will sue", "I will take this to court", "file a motion")

BLOCK these:
- PROFANITY: Gratuitous vulgar language not related to quoting evidence or legal discussion
- HARASSMENT: Direct personal attacks, bullying, intimidation of the other party in this chat
- HATE_SPEECH: Slurs, discriminatory language targeting race, gender, religion, ethnicity, sexual orientation
- SEXUAL_CONTENT: Sexually explicit content unrelated to a legal case (e.g., sexual harassment case discussion is allowed)
- THREATS: Direct threats of physical violence against the other person (not legal threats like "I will sue")
- SPAM: Repetitive nonsensical text, promotional spam, cryptocurrency scams
- PII: Social Security numbers (XXX-XX-XXXX pattern), full credit card numbers (13-19 consecutive digits), bank account numbers shared with routing numbers
- PHISHING: Requests to click suspicious links, requests for passwords or login credentials, fake payment links
- IMPERSONATION: Falsely claiming to be a judge, law enforcement officer, or government official

Respond with ONLY valid JSON:
{"allowed": true}
or
{"allowed": false, "reason": "Brief user-friendly explanation", "category": "CATEGORY_NAME"}

Message from ${senderRole || "USER"}:
"""
${content}
"""`;
}

/**
 * Moderate a chat message using OpenAI GPT-5.2.
 *
 * @param {string} content - The message text to moderate
 * @param {object} context - Optional context about the sender
 * @param {string} context.senderRole - 'CLIENT' or 'LAWYER'
 * @param {string} context.senderId - User ID (for logging only)
 * @returns {Promise<{ allowed: boolean, reason?: string, category?: string }>}
 */
export async function moderateMessage(content, context = {}) {
  if (!openai) {
    console.warn("[Moderation] OpenAI not configured — allowing message (fail-open)");
    return { allowed: true };
  }

  if (!content || content.trim().length === 0) {
    return { allowed: true };
  }

  try {
    const prompt = buildModerationPrompt(content, context.senderRole);

    // AbortController with 3s timeout — prevents slow OpenAI responses from blocking messages
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 150,
    }, { signal: controller.signal });

    clearTimeout(timeoutId);

    const parsed = JSON.parse(response.choices[0].message.content);

    if (typeof parsed.allowed !== "boolean") {
      console.warn("[Moderation] Invalid OpenAI response shape — allowing (fail-open):", response.choices[0].message.content);
      return { allowed: true };
    }

    if (!parsed.allowed) {
      console.log(`[Moderation] Blocked message from ${context.senderId || "unknown"} — category: ${parsed.category}, reason: ${parsed.reason}`);
    }

    return {
      allowed: parsed.allowed,
      reason: parsed.reason || undefined,
      category: parsed.category || undefined,
    };
  } catch (err) {
    if (err.name === "AbortError") {
      console.warn("[Moderation] OpenAI timeout (3s) — allowing message (fail-open)");
    } else {
      console.error("[Moderation] OpenAI API error — allowing message (fail-open):", err.message);
    }
    return { allowed: true };
  }
}
