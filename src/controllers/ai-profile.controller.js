import asyncHandler from "express-async-handler";
import {
  extractProfileFromDocument,
  extractProfileFromText,
  extractProfileFromUrl,
  extractProfileFromAudio,
  fetchUrlContent,
  fetchMultipleUrlsContent,
  generateProfileQuestion,
  detectStateFromBarNumber,
  transcribeAudio as transcribeAudioService,
} from "../services/openai-profile.service.js";

// @desc    Parse profile input (document, text, audio, URL) using AI
// @route   POST /api/ai-profile/parse
export const parseProfileInput = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const { file, audio, text, url, linkedinUrl } = body;

  // Support both 'url' (new) and 'linkedinUrl' (legacy) fields
  const profileUrl = url || linkedinUrl;

  let extractedProfile = null;

  if (file && file.base64 && file.mimeType) {
    extractedProfile = await extractProfileFromDocument(file.base64, file.mimeType);
  } else if (audio && audio.base64 && audio.mimeType) {
    extractedProfile = await extractProfileFromAudio(audio.base64, audio.mimeType);
  } else if (profileUrl) {
    // Detect multiple URLs (separated by whitespace, newlines, or commas)
    const urls = profileUrl
      .split(/[\s,]+/)
      .map((u) => u.trim())
      .filter((u) => u.startsWith("http://") || u.startsWith("https://"));

    let content;
    if (urls.length > 1) {
      // Multiple URLs: scrape all and combine data
      content = await fetchMultipleUrlsContent(urls);
    } else {
      content = await fetchUrlContent(urls[0] || profileUrl);
    }

    const input = text
      ? `${content}\n\nAdditional context from user:\n${text}`
      : content;
    extractedProfile = await extractProfileFromUrl(input, urls[0] || profileUrl);
  } else if (text) {
    extractedProfile = await extractProfileFromText(text);
  } else {
    res.status(400);
    throw new Error("No input provided. Please upload a document, record audio, or enter text.");
  }

  // Store URL if provided
  if (profileUrl && extractedProfile) {
    // Store the first valid URL
    const firstUrl = profileUrl
      .split(/[\s,]+/)
      .find((u) => u.trim().startsWith("http"));
    extractedProfile.linkedInUrl = firstUrl || profileUrl;
  }

  res.json({ success: true, data: extractedProfile });
});

// @desc    AI conversation for profile building
// @route   POST /api/ai-profile/chat
export const askProfileQuestion = asyncHandler(async (req, res) => {
  const { currentProfile, message, history = [] } = req.body;

  if (!currentProfile) {
    res.status(400);
    throw new Error("Current profile state is required");
  }

  // If user sent a message, extract data from it and generate next question
  let updatedProfile = { ...currentProfile };

  if (message) {
    try {
      const extracted = await extractProfileFromText(
        `The lawyer was asked about their profile and responded: "${message}". ` +
        `Their current profile is: ${JSON.stringify(currentProfile)}`
      );

      // Merge only non-null extracted values into the profile
      for (const [key, value] of Object.entries(extracted)) {
        if (value !== null && value !== undefined) {
          if (Array.isArray(value) && value.length > 0) {
            updatedProfile[key] = value;
          } else if (!Array.isArray(value) && value) {
            updatedProfile[key] = value;
          }
        }
      }
    } catch {
      // If extraction fails, continue with question generation
    }
  }

  const result = await generateProfileQuestion(updatedProfile, history);

  res.json({
    success: true,
    data: {
      ...result,
      updatedProfile,
    },
  });
});

// @desc    Transcribe audio to text (pure speech-to-text, no profile extraction)
// @route   POST /api/ai-profile/transcribe
export const transcribeAudio = asyncHandler(async (req, res) => {
  const { audio } = req.body;

  if (!audio || !audio.base64 || !audio.mimeType) {
    res.status(400);
    throw new Error("Audio data with base64 and mimeType is required");
  }

  const text = await transcribeAudioService(audio.base64, audio.mimeType);

  res.json({ success: true, data: { text } });
});

// @desc    Detect state from bar license number
// @route   POST /api/ai-profile/bar-lookup
export const lookupBarNumber = asyncHandler(async (req, res) => {
  const { barNumber } = req.body;

  if (!barNumber) {
    res.status(400);
    throw new Error("Bar number is required");
  }

  const result = detectStateFromBarNumber(barNumber);

  res.json({
    success: true,
    data: result || { state: null, stateName: null },
  });
});
