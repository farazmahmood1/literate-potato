import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import {
  saveLawyer,
  unsaveLawyer,
  getSavedLawyers,
} from "../controllers/saved-lawyer.controller.js";

const router = Router();

// Mounted at /api/lawyers
router.get("/saved", protect, getSavedLawyers);
router.post("/:id/save", protect, saveLawyer);
router.delete("/:id/save", protect, unsaveLawyer);

export default router;
