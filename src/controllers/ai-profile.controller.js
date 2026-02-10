import asyncHandler from "express-async-handler";
import {
  extractProfileFromDocument,
  extractProfileFromText,
  extractProfileFromAudio,
  fetchLinkedInContent,
  generateProfileQuestion,
  detectStateFromBarNumber,
  transcribeAudio as transcribeAudioService,
} from "../services/gemini.service.js";

// @desc    Parse profile input (document, text, audio, LinkedIn) using AI
// @route   POST /api/ai-profile/parse
export const parseProfileInput = asyncHandler(async (req, res) => {
  const { file, audio, text, linkedinUrl } = req.body;

  let extractedProfile = null;

  if (file && file.base64 && file.mimeType) {
    extractedProfile = await extractProfileFromDocument(file.base64, file.mimeType);
  } else if (audio && audio.base64 && audio.mimeType) {
    extractedProfile = await extractProfileFromAudio(audio.base64, audio.mimeType);
  } else if (linkedinUrl) {
    // Actually fetch the LinkedIn page and extract its content
    const content = await fetchLinkedInContent(linkedinUrl);
    const input = text
      ? `LinkedIn profile data:\n${content}\n\nAdditional context from user:\n${text}`
      : `LinkedIn profile data:\n${content}`;
    extractedProfile = await extractProfileFromText(input);
  } else if (text) {
    extractedProfile = await extractProfileFromText(text);
  } else {
    res.status(400);
    throw new Error("No input provided. Please upload a document, record audio, or enter text.");
  }

  // Store LinkedIn URL if provided
  if (linkedinUrl && extractedProfile) {
    extractedProfile.linkedInUrl = linkedinUrl;
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
