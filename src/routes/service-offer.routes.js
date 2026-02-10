import { Router } from "express";
import { protect, authorize } from "../middlewares/auth.middleware.js";
import {
  createServiceOffer,
  getServiceOffers,
  updateServiceOfferStatus,
} from "../controllers/service-offer.controller.js";

const router = Router();

// Mounted at /api/consultations
router.post("/:id/service-offers", protect, authorize("LAWYER"), createServiceOffer);
router.get("/:id/service-offers", protect, getServiceOffers);

export default router;

// Separate router for /api/service-offers
export const serviceOfferRouter = Router();
serviceOfferRouter.put("/:id/status", protect, updateServiceOfferStatus);
