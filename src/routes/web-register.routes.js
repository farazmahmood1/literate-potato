import { Router } from "express";
import { webRegister } from "../controllers/web-register.controller.js";

const router = Router();

// Public endpoint - no authentication required
router.post("/", webRegister);

export default router;
