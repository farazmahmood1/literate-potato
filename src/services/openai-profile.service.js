import fetch from "node-fetch";
import openai from "../config/openai.js";
import { toFile } from "openai";

const PROFILE_SCHEMA = `{
  "professionalSummary": "6-7 line professional summary written in third person using the lawyer's name (e.g. 'John Smith is a dedicated attorney...' NOT 'I am...')",
  "education": [{"institution": "string", "degree": "string", "year": number|null}],
  "yearsExperience": number|null,
  "specializations": ["string"],
  "previousFirms": [{"name": "string", "role": "string", "years": "string"}],
  "certifications": [{"name": "string", "issuer": "string", "year": number|null}],
  "languages": ["string"],
  "courtLevels": ["string"],
  "bio": "short third-person client-facing bio using the lawyer's name (e.g. 'Jane Doe is a passionate advocate...' NOT 'I am...')",
  "consultationRate": number|null,
  "title": "law field and focus in format: '[Area] Attorney | [Specific Focus]', e.g. 'Immigration Attorney | Employment & Investment Visas', 'Family Law Attorney | Divorce & Child Custody', 'Criminal Defense Lawyer | DUI & White Collar' — NEVER generic 'Attorney at Law'",
  "websiteUrl": "any professional URL found in the content (LinkedIn, portfolio, Avvo, etc.) or null"
}`;

const EXTRACTION_PROMPT = `You are an AI assistant helping lawyers build their professional profiles on a legal marketplace app.
Extract the following structured data from the provided content. Return ONLY valid JSON matching this schema:

${PROFILE_SCHEMA}

Rules:
- CRITICAL: Write professionalSummary and bio in THIRD PERSON using the lawyer's name (e.g. "John Smith is a dedicated attorney..." NOT "I am..."). This follows professional profile conventions like Avvo.
- The professionalSummary should be 6-7 lines long, written in third person with the lawyer's name.
- The title should follow the format: "[Area] Attorney | [Specific Focus]" (e.g. "Immigration Attorney | Employment & Investment Visas"). NEVER use generic "Attorney at Law".
- Only include fields you can confidently extract. Use null for unknown numeric values and empty arrays for unknown lists.
- Map specializations to these categories when possible: Immigration, Family Law, Criminal Defense, Real Estate, Business & Contract, Employment, Personal Injury, Bankruptcy, Intellectual Property, Tax Law, Estate Planning, Small Claims, Landlord/Tenant, Consumer Protection.
- For courtLevels, use: State, Federal, Appellate, Supreme Court, District, Bankruptcy Court, Tax Court.
- For consultationRate, extract hourly rate in cents (e.g., $150/hr = 15000). Use null if not mentioned.
- Return ONLY the JSON object, no markdown fences, no explanation.`;

const URL_EXTRACTION_PROMPT = `You are an AI assistant helping lawyers build their professional profiles on Lawyer Direct, a legal marketplace app.
You are given data scraped from a lawyer's online profile (LinkedIn, Avvo, portfolio website, etc.).
Your job is to fill out as MANY fields as possible in the profile schema below. Use the scraped data as your primary source, and use your general knowledge to make reasonable inferences where the data is limited.

Return ONLY valid JSON matching this schema:
${PROFILE_SCHEMA}

CRITICAL: Write professionalSummary and bio in THIRD PERSON using the lawyer's name, following professional profile conventions (like Avvo profiles). Example: "Xiaojie Meng is a California-licensed attorney..." NOT "I am a California-licensed attorney...". The title should use pipe format: "[Area] Attorney | [Specific Focus]".

IMPORTANT RULES — fill as many fields as you can:
1. **professionalSummary**: Write a compelling 6-7 line THIRD-PERSON professional summary using the lawyer's name. Example: "Xiaojie Meng is a California-licensed attorney with extensive experience in immigration and family law. She provides dedicated legal guidance with a focus on clear communication and practical strategy. Her practice centers on helping clients navigate complex legal issues efficiently. Ms. Meng has earned recognition for her commitment to client advocacy..." Continue for 6-7 lines total. Always use the lawyer's name and appropriate pronouns.
2. **title**: Generate in the format "[Area] Attorney | [Specific Focus]". NEVER use generic "Attorney at Law". Examples: "Immigration Attorney | Employment & Investment Visas", "Family Law Attorney | Divorce & Child Custody", "Criminal Defense Lawyer | DUI & White Collar Crime", "Personal Injury Attorney | Auto Accidents & Medical Malpractice". Always reflect their actual specializations with a specific focus after the pipe.
3. **education**: If education data is available, include it. If not but the person is a lawyer, include a placeholder: [{"institution": "", "degree": "Juris Doctor (J.D.)", "year": null}].
4. **yearsExperience**: Extract from data if available. Otherwise use null.
5. **specializations**: Extract from practice areas, description, or page content. Map to these categories: Immigration, Family Law, Criminal Defense, Real Estate, Business & Contract, Employment, Personal Injury, Bankruptcy, Intellectual Property, Tax Law, Estate Planning, Small Claims, Landlord/Tenant, Consumer Protection. If no specialization data, use an empty array.
6. **previousFirms**: Extract any firm/organization mentions. If none found, use empty array.
7. **certifications**: Extract bar admissions and certifications. If a US state is known, add a bar admission entry like: {"name": "State Bar of [State]", "issuer": "[State] Bar Association", "year": null}.
8. **languages**: If languages are mentioned include them. If the lawyer's name suggests multilingual ability, include English plus the likely language. Default to ["English"] if uncertain.
9. **courtLevels**: Use: State, Federal, Appellate, Supreme Court, District, Bankruptcy Court, Tax Court. If the lawyer practices in a US state, at minimum include ["State"].
10. **bio**: Write a short, friendly, third-person client-facing bio using the lawyer's name. Example: "John is a dedicated attorney based in [location] who specializes in [areas]. He/She is passionate about helping her clients achieve the best possible outcomes."
11. **consultationRate**: Extract if mentioned, otherwise null.
12. **websiteUrl**: Use the source URL provided.

Be generous with filling fields — it's better to provide reasonable defaults the lawyer can edit than to leave fields empty.
Return ONLY the JSON object, no markdown fences, no explanation.`;

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
    linkedInUrl: parsed.websiteUrl || parsed.linkedInUrl || null,
  };
}

/**
 * Extract profile from a document (PDF) or image using GPT-5.2 vision.
 * GPT-5.2 supports images (jpeg, png, gif, webp) and PDFs via base64 data URI.
 */
export async function extractProfileFromDocument(base64Content, mimeType) {
  if (!openai) throw new Error("OpenAI API not configured");

  const dataUri = `data:${mimeType};base64,${base64Content}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUri } },
          { type: "text", text: EXTRACTION_PROMPT },
        ],
      },
    ],
    max_completion_tokens: 2000,
  });

  const text = response.choices[0].message.content;
  return sanitizeProfile(JSON.parse(text));
}

/**
 * Extract profile from plain text using GPT-5.2.
 */
export async function extractProfileFromText(text) {
  if (!openai) throw new Error("OpenAI API not configured");

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: `${EXTRACTION_PROMPT}\n\nContent:\n${text}`,
      },
    ],
    max_completion_tokens: 2000,
  });

  const responseText = response.choices[0].message.content;
  return sanitizeProfile(JSON.parse(responseText));
}

/**
 * Use OpenAI Responses API with web_search_preview to look up a lawyer online.
 * Returns a text summary of the lawyer's profile data found on the web.
 */
async function webSearchLawyer(scrapedContent, sourceUrl) {
  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    tools: [{ type: "web_search_preview" }],
    input: [
      {
        role: "user",
        content: `I need to build a professional profile for a lawyer. Here is what I know so far from a URL scrape (may be very limited due to Cloudflare blocking):\n\n${scrapedContent}\n\nSource URL: ${sourceUrl}\n\nPlease search the web for this lawyer's full profile. Look up their name + "attorney" on Avvo, Justia, the state bar website, LinkedIn, and any other legal directories. Find and list:\n- Full name\n- Practice areas / specializations\n- Education (law school, degrees, years)\n- Years of experience\n- Previous firms\n- Bar admissions / certifications\n- Languages spoken\n- Court levels practiced\n- Any awards or recognitions\n- Consultation rate if mentioned\n\nReturn ALL information you find as a detailed plain-text summary.`,
      },
    ],
    max_output_tokens: 1500,
  });

  const textOutput = response.output.find((item) => item.type === "message");
  return textOutput?.content?.[0]?.text || "";
}

/**
 * Extract profile from URL-scraped content using GPT-4.1 with web search.
 * Step 1: Web search to find the lawyer's actual data from legal directories.
 * Step 2: Chat Completions with JSON mode to structure the data into profile schema.
 */
export async function extractProfileFromUrl(scrapedContent, sourceUrl) {
  if (!openai) throw new Error("OpenAI API not configured");

  // Step 1: Use web search to find richer data about the lawyer
  let enrichedContent = scrapedContent;
  try {
    const webSearchResult = await webSearchLawyer(scrapedContent, sourceUrl);
    if (webSearchResult && webSearchResult.length > 50) {
      enrichedContent = `${scrapedContent}\n\n--- Web Search Results ---\n${webSearchResult}`;
    }
  } catch (err) {
    console.warn("Web search failed, using scraped data only:", err.message);
  }

  // Step 2: Structure the data into profile JSON using Chat Completions
  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: `${URL_EXTRACTION_PROMPT}\n\nProfile data (scraped + web search results):\n${enrichedContent}`,
      },
    ],
    max_completion_tokens: 2000,
  });

  const responseText = response.choices[0].message.content;
  const profile = sanitizeProfile(JSON.parse(responseText));

  if (sourceUrl && !profile.linkedInUrl) {
    profile.linkedInUrl = sourceUrl;
  }

  return profile;
}

/**
 * Extract profile from audio using Whisper transcription + GPT-5.2 extraction.
 */
export async function extractProfileFromAudio(base64Audio, mimeType) {
  if (!openai) throw new Error("OpenAI API not configured");

  // Transcribe audio with Whisper
  const transcribedText = await transcribeAudio(base64Audio, mimeType);

  // Extract profile from the transcription
  return extractProfileFromText(
    `The lawyer recorded an audio describing their professional background. Transcription:\n${transcribedText}`
  );
}

/**
 * Generate a follow-up question to fill missing profile fields.
 */
export async function generateProfileQuestion(currentProfile, conversationHistory) {
  if (!openai) throw new Error("OpenAI API not configured");

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

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 300,
  });

  return JSON.parse(response.choices[0].message.content);
}

/**
 * Clean a URL by removing tracking params and fragments.
 */
function cleanUrl(rawUrl) {
  try {
    const u = new URL(rawUrl.trim());
    // Remove common tracking parameters
    const trackingParams = [
      "ad_impression_guid", "utm_source", "utm_medium", "utm_campaign",
      "utm_term", "utm_content", "fbclid", "gclid", "ref", "referer",
    ];
    trackingParams.forEach((p) => u.searchParams.delete(p));
    u.hash = ""; // Remove fragment
    return u.toString();
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Parse useful info directly from an Avvo URL slug.
 * Pattern: /attorneys/{zip}-{state}-{firstname}-{lastname}-{id}.html
 */
function parseAvvoUrl(url) {
  const match = url.match(
    /avvo\.com\/attorneys\/(\d{5})-([a-z]{2})-([a-z-]+?)-(\d+)\.html/i
  );
  if (!match) return null;
  const [, zip, stateAbbr, nameSlug, avvoId] = match;
  const nameParts = nameSlug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return {
    name: nameParts.join(" "),
    state: stateAbbr.toUpperCase(),
    zip,
    avvoId,
    source: "Avvo",
  };
}

/**
 * Parse useful info directly from a LinkedIn URL slug.
 * Pattern: /in/{firstname}-{lastname}-{hash}/
 */
function parseLinkedInUrl(url) {
  const match = url.match(/linkedin\.com\/in\/([a-zA-Z0-9-]+)/i);
  if (!match) return null;
  const slug = match[1];
  // Remove trailing hash (hex string like "7b34193a")
  const cleaned = slug.replace(/-[0-9a-f]{6,}$/i, "");
  const nameParts = cleaned.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return {
    name: nameParts.join(" "),
    source: "LinkedIn",
  };
}

/**
 * Extract readable content from an HTML string.
 */
function extractHtmlContent(html, url) {
  const parts = [];

  // <title>
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    parts.push(`Title: ${titleMatch[1].replace(/\s*[|\-–]\s*(LinkedIn|Avvo|Find a Lawyer).*$/i, "").trim()}`);
  }

  // meta description (handle both name="description" and property="description")
  const descMatch = html.match(
    /<meta\s+(?:name|property)=["']description["']\s+content=["']([^"']+)["']/i
  ) || html.match(
    /<meta\s+content=["']([^"']+)["']\s+(?:name|property)=["']description["']/i
  );
  if (descMatch) parts.push(`Description: ${descMatch[1]}`);

  // og:title / og:description
  const ogTitle = html.match(
    /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i
  ) || html.match(
    /<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i
  );
  if (ogTitle && ogTitle[1] !== titleMatch?.[1]) {
    parts.push(`Headline: ${ogTitle[1]}`);
  }
  const ogDesc = html.match(
    /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i
  ) || html.match(
    /<meta\s+content=["']([^"']+)["']\s+property=["']og:description["']/i
  );
  if (ogDesc && ogDesc[1] !== descMatch?.[1]) {
    parts.push(`About: ${ogDesc[1]}`);
  }

  // JSON-LD structured data (Person, ProfilePage, Attorney, etc.)
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

  // For Avvo: extract visible text from key sections
  if (url.includes("avvo.com")) {
    // Practice areas
    const practiceMatch = html.match(/(?:practice\s*areas?|specialt(?:y|ies))[^<]*<[^>]*>([^<]{5,500})/gi);
    if (practiceMatch) parts.push(`Practice areas: ${practiceMatch.map(s => s.replace(/<[^>]+>/g, "").trim()).join(", ")}`);

    // Experience / years
    const expMatch = html.match(/(\d+)\s*(?:years?\s*(?:of\s*)?(?:experience|practice))/i);
    if (expMatch) parts.push(`Experience: ${expMatch[0]}`);

    // Rating
    const ratingMatch = html.match(/(\d+(?:\.\d+)?)\s*(?:\/\s*(?:5|10)|stars?|rating)/i);
    if (ratingMatch) parts.push(`Rating: ${ratingMatch[0]}`);

    // Education entries
    const eduMatch = html.match(/(?:education|law\s*school|J\.D\.|Juris\s*Doctor)[^<]*(?:<[^>]*>[^<]*){0,10}/gi);
    if (eduMatch) parts.push(`Education: ${eduMatch.map(s => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).join("; ")}`);

    // Languages
    const langMatch = html.match(/(?:languages?\s*(?:spoken)?)[^<]*(?:<[^>]*>[^<]*){0,10}/gi);
    if (langMatch) parts.push(`Languages: ${langMatch.map(s => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).join("; ")}`);

    // Bar admissions / licenses
    const barMatch = html.match(/(?:bar\s*admissions?|licens(?:e|ed|ure)|admitted)[^<]*(?:<[^>]*>[^<]*){0,15}/gi);
    if (barMatch) parts.push(`Bar admissions: ${barMatch.map(s => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).join("; ")}`);

    // Work experience / employment history
    const workMatch = html.match(/(?:work\s*experience|employment|professional\s*experience|career)[^<]*(?:<[^>]*>[^<]*){0,20}/gi);
    if (workMatch) parts.push(`Work experience: ${workMatch.map(s => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).join("; ")}`);

    // Awards, recognitions
    const awardMatch = html.match(/(?:awards?|recognitions?|honors?|achievements?)[^<]*(?:<[^>]*>[^<]*){0,10}/gi);
    if (awardMatch) parts.push(`Awards: ${awardMatch.map(s => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).join("; ")}`);

    // About / biography section
    const aboutMatch = html.match(/(?:about|biography|bio)\s*(?:me)?[^<]*(?:<[^>]*>[^<]*){0,20}/gi);
    if (aboutMatch) parts.push(`About: ${aboutMatch.map(s => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).join("; ")}`);

    // Fee / consultation rate
    const feeMatch = html.match(/(?:fee|consultation\s*rate|hourly\s*rate|\$\d+)[^<]*(?:<[^>]*>[^<]*){0,5}/gi);
    if (feeMatch) parts.push(`Fees: ${feeMatch.map(s => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).join("; ")}`);
  }

  // For LinkedIn: extract any visible content (when scraping succeeds, which is rare)
  if (url.includes("linkedin.com")) {
    // Headline / title (often in h1 or specific classes)
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) parts.push(`Headline: ${h1Match[1].trim()}`);

    // Experience section
    const expSection = html.match(/(?:experience|work)[^<]*(?:<[^>]*>[^<]*){0,30}/gi);
    if (expSection) parts.push(`Experience section: ${expSection.map(s => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).join("; ")}`);

    // Education section
    const eduSection = html.match(/(?:education)[^<]*(?:<[^>]*>[^<]*){0,20}/gi);
    if (eduSection) parts.push(`Education section: ${eduSection.map(s => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).join("; ")}`);
  }

  return parts;
}

/**
 * Fetch any URL (LinkedIn, Avvo, portfolio) and extract readable content.
 * Falls back to URL structure parsing if the page can't be scraped.
 */
export async function fetchUrlContent(url) {
  const cleanedUrl = cleanUrl(url);
  const parts = [];

  // Detect source type
  const isLinkedIn = url.includes("linkedin.com");
  const isAvvo = url.includes("avvo.com");
  const sourceType = isLinkedIn ? "LinkedIn" : isAvvo ? "Avvo" : "website";
  parts.push(`Source: ${sourceType} (${cleanedUrl})`);

  // Extract info from URL structure (always available as baseline)
  if (isAvvo) {
    const avvoInfo = parseAvvoUrl(url);
    if (avvoInfo) {
      parts.push(`Name (from URL): ${avvoInfo.name}`);
      parts.push(`State (from URL): ${avvoInfo.state}`);
      parts.push(`Zip (from URL): ${avvoInfo.zip}`);
    }
  } else if (isLinkedIn) {
    const liInfo = parseLinkedInUrl(url);
    if (liInfo) {
      parts.push(`Name (from URL): ${liInfo.name}`);
    }
  }

  // Try to fetch the page
  let fetchSucceeded = false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(cleanedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Read HTML even from non-200 responses (403 pages often contain useful meta tags / JSON-LD)
    const html = await res.text();
    if (html && html.length > 200) {
      const htmlParts = extractHtmlContent(html, url);
      parts.push(...htmlParts);
      fetchSucceeded = htmlParts.length > 0;
    }
  } catch {
    // Fetch failed (timeout, network error, blocked) — continue with URL-based data
  }

  // If we got basically nothing from scraping, add a hint for GPT
  if (!fetchSucceeded) {
    if (isLinkedIn) {
      parts.push(
        "Note: LinkedIn blocked the page fetch. The name above was extracted from the URL slug. " +
        "This is a LinkedIn profile for a lawyer. Extract what you can from the name and context."
      );
    } else if (isAvvo) {
      parts.push(
        "Note: Could not fully scrape the Avvo page. Use the name, state, and zip from the URL to populate the profile."
      );
    } else {
      parts.push(
        "Note: The page could not be fully loaded. Extract what you can from the available data."
      );
    }
  }

  // We should always have at least the source line + URL-parsed data
  if (parts.length <= 1) {
    throw new Error(
      "Could not extract any profile data from this URL. Please try a different URL or enter your information manually."
    );
  }

  return parts.join("\n\n");
}

/**
 * Fetch multiple URLs and combine all scraped content into one string.
 * Used when the user pastes multiple profile links (e.g., Avvo + LinkedIn).
 */
export async function fetchMultipleUrlsContent(urls) {
  const allParts = [];

  for (const url of urls) {
    try {
      const content = await fetchUrlContent(url);
      allParts.push(content);
    } catch {
      // If one URL fails, continue with the others
    }
  }

  if (allParts.length === 0) {
    throw new Error(
      "Could not extract any profile data from the provided URLs. Please try different URLs or enter your information manually."
    );
  }

  return allParts.join("\n\n---\n\n");
}

/**
 * Transcribe audio to text using Whisper.
 */
export async function transcribeAudio(base64Audio, mimeType) {
  if (!openai) throw new Error("OpenAI API not configured");

  const buffer = Buffer.from(base64Audio, "base64");

  // Determine file extension from mimeType
  const extMap = {
    "audio/mp4": "mp4",
    "audio/m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
  };
  const ext = extMap[mimeType] || "mp4";
  const file = await toFile(buffer, `audio.${ext}`, { type: mimeType });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
  });

  return transcription.text.trim();
}

// Bar number prefix → state mapping (no AI involved, stays the same)
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

export function detectStateFromBarNumber(barNumber) {
  if (!barNumber) return null;

  const upper = barNumber.toUpperCase().trim();

  const prefixMatch = upper.match(/^([A-Z]{2})[\s\-]?\d/);
  if (prefixMatch) {
    const abbr = prefixMatch[1];
    if (BAR_PREFIX_MAP[abbr]) {
      return { state: abbr, stateName: BAR_PREFIX_MAP[abbr] };
    }
  }

  return null;
}
