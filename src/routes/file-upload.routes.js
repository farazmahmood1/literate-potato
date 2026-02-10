import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { uploadFile } from "../controllers/file-upload.controller.js";

const router = Router();

// Mounted at /api/files
router.post("/", protect, uploadFile);

export default router;
