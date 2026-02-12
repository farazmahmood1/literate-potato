import { Router } from "express";
import { body } from "express-validator";
import {
  createTicket,
  getMyTickets,
  getTicket,
  addReply,
  closeTicket,
} from "../controllers/ticket.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

const router = Router();

router.use(protect);

router.post(
  "/",
  [
    body("subject").notEmpty().withMessage("Subject is required"),
    body("description")
      .notEmpty()
      .withMessage("Description is required")
      .isLength({ min: 10 })
      .withMessage("Description must be at least 10 characters"),
    body("category")
      .isIn(["BILLING", "TECHNICAL", "ACCOUNT", "LEGAL", "OTHER"])
      .withMessage("Invalid category"),
  ],
  validate,
  createTicket
);

router.get("/", getMyTickets);
router.get("/:id", getTicket);

router.post(
  "/:id/replies",
  [body("message").notEmpty().withMessage("Message is required")],
  validate,
  addReply
);

router.put("/:id/close", closeTicket);

export default router;
