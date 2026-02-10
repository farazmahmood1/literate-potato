import { Router } from "express";
import {
  createDispute,
  getMyDisputes,
  getDispute,
  respondToDispute,
  addEvidence,
  escalateDispute,
  withdrawDispute,
  proposeResolution,
  acceptResolution,
} from "../controllers/dispute.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(protect);

router.post("/", createDispute);
router.get("/", getMyDisputes);
router.get("/:id", getDispute);
router.post("/:id/respond", respondToDispute);
router.post("/:id/evidence", addEvidence);
router.put("/:id/escalate", escalateDispute);
router.put("/:id/withdraw", withdrawDispute);
router.put("/:id/propose-resolution", proposeResolution);
router.put("/:id/accept-resolution", acceptResolution);

export default router;
