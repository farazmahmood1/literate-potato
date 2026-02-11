import asyncHandler from "express-async-handler";
import { clerkClient } from "@clerk/express";
import prisma from "../lib/prisma.js";
import { getClientIp, getLocationFromIp } from "../services/geolocation.service.js";

// @desc    Register a new user from the portfolio website (no auth required)
// @route   POST /api/web-register
export const webRegister = asyncHandler(async (req, res) => {
  const {
    role,
    firstName,
    lastName,
    email,
    password,
    phone,
    // Lawyer-specific fields
    title,
    barNumber,
    licenseState,
    specializations,
    consultationRate,
    yearsExperience,
    bio,
    professionalSummary,
    education,
    previousFirms,
    certifications,
    languages,
    courtLevels,
    linkedInUrl,
    licenseImage,
    idImage,
  } = req.body;

  // Validate required fields
  if (!firstName || !lastName || !email || !password) {
    res.status(400);
    throw new Error("First name, last name, email, and password are required");
  }

  if (!role || !["CLIENT", "LAWYER"].includes(role)) {
    res.status(400);
    throw new Error("Role must be CLIENT or LAWYER");
  }

  if (password.length < 8) {
    res.status(400);
    throw new Error("Password must be at least 8 characters");
  }

  if (role === "LAWYER") {
    if (!barNumber || !licenseState || !specializations?.length) {
      res.status(400);
      throw new Error(
        "Bar number, license state, and at least one specialization are required for lawyers"
      );
    }
  }

  // Create Clerk user server-side
  let clerkUser;
  try {
    clerkUser = await clerkClient.users.createUser({
      firstName,
      lastName,
      emailAddress: [email],
      password,
    });
  } catch (error) {
    if (error.errors?.[0]?.code === "form_identifier_exists") {
      res.status(409);
      throw new Error(
        "An account with this email already exists. Please download the app and sign in."
      );
    }
    if (error.errors?.[0]?.message) {
      res.status(400);
      throw new Error(error.errors[0].message);
    }
    throw error;
  }

  // Resolve location from IP
  const ip = getClientIp(req);
  const { state: regState, city: regCity } = getLocationFromIp(ip);

  // Create user in our database
  const user = await prisma.user.create({
    data: {
      clerkId: clerkUser.id,
      email,
      firstName,
      lastName,
      phone: phone || null,
      avatar: clerkUser.imageUrl,
      role,
      isVerified: false,
      registrationState: role === "LAWYER" ? licenseState : regState,
      registrationCity: regCity,
      registrationIp: ip,
    },
  });

  // If lawyer, create lawyer profile with all fields
  if (role === "LAWYER") {
    await prisma.lawyerProfile.create({
      data: {
        userId: user.id,
        barNumber,
        licenseState,
        title: title || null,
        specializations,
        consultationRate: consultationRate ? parseInt(consultationRate) : 3000,
        yearsExperience: yearsExperience ? parseInt(yearsExperience) : 0,
        bio: bio || null,
        professionalSummary: professionalSummary || null,
        education: education?.length ? education : undefined,
        previousFirms: previousFirms?.length ? previousFirms : undefined,
        certifications: certifications?.length ? certifications : undefined,
        languages: languages?.length ? languages : ["English"],
        courtLevels: courtLevels?.length ? courtLevels : [],
        linkedInUrl: linkedInUrl || null,
        licenseImage: licenseImage || null,
        idImage: idImage || null,
        verificationStatus: "PENDING",
      },
    });
  }

  res.status(201).json({
    success: true,
    message:
      role === "LAWYER"
        ? "Lawyer account created successfully. Download the app to complete verification and start accepting consultations."
        : "Account created successfully. Download the app to start finding qualified lawyers instantly.",
    data: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    },
  });
});
