import { GoogleGenerativeAI } from "@google/generative-ai";

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

export default gemini;
