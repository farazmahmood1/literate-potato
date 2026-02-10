import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import {
  initiateCall,
  acceptCall,
  declineCall,
  endCall,
  getCallToken,
} from "../controllers/call.controller.js";

const router = Router();

router.post("/", protect, initiateCall);
router.put("/:callId/accept", protect, acceptCall);
router.put("/:callId/decline", protect, declineCall);
router.put("/:callId/end", protect, endCall);
router.get("/:callId/token", protect, getCallToken);

export default router;
