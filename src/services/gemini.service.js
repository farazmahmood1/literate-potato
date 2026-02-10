import fetch from "node-fetch";
import gemini from "../config/gemini.js";

const PROFILE_SCHEMA = `{
  "professionalSummary": "2-3 sentence summary of their legal career",
  "education": [{"institution": "string", "degree": "string", "year": number|null}],
  "yearsExperience": number|null,
  "specializations": ["string"],
  "previousFirms": [{"name": "string", "role": "string", "years": "string"}],
  "certifications": [{"name": "string", "issuer": "string", "year": number|null}],
  "languages": ["string"],
  "courtLevels": ["string"],
  "bio": "short client-facing bio",
  "consultationRate": number|null,
  "title": "professional title, e.g. 'Partner at Smith & Associates' or 'Senior Immigration Attorney'",
  "linkedInUrl": "LinkedIn profile URL if found in the content, or null"
}`;

const EXTRACTION_PROMPT = `You are an AI assistant helping lawyers build their professional profiles on a legal marketplace app.
Extract the following structured data from the provided content. Return ONLY valid JSON matching this schema:

${PROFILE_SCHEMA}

Rules:
- Only include fields you can confidently extract. Use null for unknown numeric values and empty arrays for unknown lists.
- Map specializations to these categories when possible: Immigration, Family Law, Criminal Defense, Real Estate, Business & Contract, Employment, Personal Injury, Bankruptcy, Intellectual Property, Tax Law, Estate Planning, Small Claims, Landlord/Tenant, Consumer Protection.
- For courtLevels, use: State, Federal, Appellate, Supreme Court, District, Bankruptcy Court, Tax Court.
- For consultationRate, extract hourly rate in cents (e.g., $150/hr = 15000). Use null if not mentioned.
- Return ONLY the JSON object, no markdown fences, no explanation.`;

function parseGeminiJson(text) {
  const cleaned = text.trim().replace(/^```json?\s*/, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

function sanitizeProfile(parsed) {
  return {
    title: parsed.title || null,
    professionalSummary: parsed.professionalSummary || null,
    education: Array.isArray(parsed.education) ? parsed.education : [],
    yearsExperience: typeof parsed.yearsExperience === "number" ? parsed.yearsExperience : null,
    specializations: Array.isArray(parsed.specializations) ? parsed.specializations : [],
    previousFirms: Array.isArray(parsed.previousFirms) ? parsed.previousFirms : [],
    certifications: Array.isArray(parsed.certifications) ? parsed.certifications : [],
    languages: Array.isArray(parsed.languages) ? parsed.languages : [],
    courtLevels: Array.isArray(parsed.courtLevels) ? parsed.courtLevels : [],
    bio: parsed.bio || null,
    consultationRate: typeof parsed.consultationRate === "number" ? parsed.consultationRate : null,
    linkedInUrl: parsed.linkedInUrl || null,
  };
}

export async function extractProfileFromDocument(base64Content, mimeType) {
  if (!gemini) throw new Error("Gemini API not configured");

  const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent([
    { inlineData: { mimeType, data: base64Content } },
    EXTRACTION_PROMPT,
  ]);

  const text = result.response.text();
  return sanitizeProfile(parseGeminiJson(text));
}

export async function extractProfileFromText(text) {
  if (!gemini) throw new Error("Gemini API not configured");

  const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent([
    `${EXTRACTION_PROMPT}\n\nContent:\n${text}`,
  ]);

  const responseText = result.response.text();
  return sanitizeProfile(parseGeminiJson(responseText));
}

export async function extractProfileFromAudio(base64Audio, mimeType) {
  if (!gemini) throw new Error("Gemini API not configured");

  const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent([
    { inlineData: { mimeType, data: base64Audio } },
    `First, transcribe the audio. Then, ${EXTRACTION_PROMPT}`,
  ]);

  const text = result.response.text();
  return sanitizeProfile(parseGeminiJson(text));
}

export async function generateProfileQuestion(currentProfile, conversationHistory) {
  if (!gemini) throw new Error("Gemini API not configured");

  const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });

  const missingFields = [];
  if (!currentProfile.professionalSummary) missingFields.push("professional summary");
  if (!currentProfile.education?.length) missingFields.push("education");
  if (!currentProfile.yearsExperience) missingFields.push("years of experience");
  if (!currentProfile.specializations?.length) missingFields.push("practice areas/specializations");
  if (!currentProfile.courtLevels?.length) missingFields.push("court levels");
  if (!currentProfile.languages?.length || currentProfile.languages.length === 0) missingFields.push("languages spoken");

  if (missingFields.length === 0) {
    return { complete: true, message: "Your profile looks great! Review the details and submit when ready." };
  }

  const prompt = `You are an AI assistant helping a lawyer complete their profile on Lawyer Direct.

Current profile data: ${JSON.stringify(currentProfile)}
Missing fields: ${missingFields.join(", ")}
Conversation so far: ${JSON.stringify(conversationHistory)}

Generate ONE friendly, conversational follow-up question to fill the most important missing field.
Return ONLY valid JSON: {"question": "your question here", "targetField": "fieldName"}
Do not ask about fields already filled. Be specific and friendly.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return parseGeminiJson(text);
}

/**
 * Fetch a LinkedIn public profile page and extract readable content
 * (meta tags, JSON-LD structured data, visible text snippets).
 */
export async function fetchLinkedInContent(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`LinkedIn returned HTTP ${res.status}`);
  }

  const html = await res.text();
  const parts = [];

  // <title>
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    parts.push(`Title: ${titleMatch[1].replace(/\s*\|\s*LinkedIn\s*$/, "").trim()}`);
  }

  // meta description
  const descMatch = html.match(
    /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i
  );
  if (descMatch) parts.push(`Description: ${descMatch[1]}`);

  // og:title / og:description (may differ from basic meta)
  const ogTitle = html.match(
    /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i
  );
  if (ogTitle && ogTitle[1] !== titleMatch?.[1]) {
    parts.push(`Headline: ${ogTitle[1]}`);
  }
  const ogDesc = html.match(
    /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i
  );
  if (ogDesc && ogDesc[1] !== descMatch?.[1]) {
    parts.push(`About: ${ogDesc[1]}`);
  }

  // JSON-LD structured data (Person, ProfilePage, etc.)
  const jsonLdRegex =
    /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      parts.push(`Structured data: ${JSON.stringify(data)}`);
    } catch {
      // ignore malformed JSON-LD
    }
  }

  if (parts.length === 0) {
    throw new Error(
      "Could not extract profile data from LinkedIn. The profile may be private or LinkedIn blocked the request."
    );
  }

  return parts.join("\n\n");
}

// Bar number prefix → state mapping
const BAR_PREFIX_MAP = {
  "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
  "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
  "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
  "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
  "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
  "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
  "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
  "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
  "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
  "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
  "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
  "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
  "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia",
};

export async function transcribeAudio(base64Audio, mimeType) {
  if (!gemini) throw new Error("Gemini API not configured");

  const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent([
    { inlineData: { mimeType, data: base64Audio } },
    "Transcribe this audio recording to text. Return ONLY the transcribed text, nothing else. " +
    "No JSON, no formatting, no markdown, no explanation — just the spoken words as plain text.",
  ]);

  return result.response.text().trim();
}

export function detectStateFromBarNumber(barNumber) {
  if (!barNumber) return null;

  const upper = barNumber.toUpperCase().trim();

  // Check for explicit prefix patterns: "NY-12345", "CA12345", "NY 12345"
  const prefixMatch = upper.match(/^([A-Z]{2})[\s\-]?\d/);
  if (prefixMatch) {
    const abbr = prefixMatch[1];
    if (BAR_PREFIX_MAP[abbr]) {
      return { state: abbr, stateName: BAR_PREFIX_MAP[abbr] };
    }
  }

  return null;
}
