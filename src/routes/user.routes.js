import { Router } from "express";
import { body } from "express-validator";
import { updateProfile, uploadAvatar, deleteAccount } from "../controllers/user.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

const router = Router();

router.use(protect);

router.put(
  "/profile",
  [
    body("firstName").optional().notEmpty().withMessage("First name cannot be empty"),
    body("lastName").optional().notEmpty().withMessage("Last name cannot be empty"),
  ],
  validate,
  updateProfile
);

router.put("/avatar", uploadAvatar);

router.delete("/account", deleteAccount);

export default router;
