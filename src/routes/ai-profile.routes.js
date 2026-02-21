import express from "express";
import {
  parseProfileInput,
  askProfileQuestion,
  lookupBarNumber,
  transcribeAudio,
} from "../controllers/ai-profile.controller.js";

const router = express.Router();

// No protect middleware — these are used during registration before the
// user has a reliable Clerk session. They only call OpenAI and don't
// access user-specific data.
router.post("/parse", parseProfileInput);
router.post("/chat", askProfileQuestion);
router.post("/bar-lookup", lookupBarNumber);
router.post("/transcribe", transcribeAudio);

export default router;
