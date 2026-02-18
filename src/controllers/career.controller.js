import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";

// ──── Admin Career Posting CRUD ────

// @desc    Get all career postings (admin)
// @route   GET /api/admin/careers
export const getCareerPostings = asyncHandler(async (req, res) => {
  const { status, department, page = 1, limit = 20 } = req.query;
  const where = {};
  if (status) where.status = status;
  if (department) where.department = department;

  const skip = (Number(page) - 1) * Number(limit);
  const [postings, total] = await Promise.all([
    prisma.careerPosting.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
      include: { _count: { select: { applications: true } } },
    }),
    prisma.careerPosting.count({ where }),
  ]);

  res.json({
    success: true,
    data: postings,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// @desc    Get single career posting (admin)
// @route   GET /api/admin/careers/:id
export const getCareerPosting = asyncHandler(async (req, res) => {
  const posting = await prisma.careerPosting.findUnique({
    where: { id: req.params.id },
    include: {
      applications: { orderBy: { createdAt: "desc" } },
      _count: { select: { applications: true } },
    },
  });

  if (!posting) {
    res.status(404);
    throw new Error("Career posting not found");
  }

  res.json({ success: true, data: posting });
});

// @desc    Create career posting (admin)
// @route   POST /api/admin/careers
export const createCareerPosting = asyncHandler(async (req, res) => {
  const { title, department, location, employmentType, description, requirements, salaryMin, salaryMax, status } = req.body;

  if (!title || !department || !location || !description || !requirements) {
    res.status(400);
    throw new Error("Title, department, location, description, and requirements are required");
  }

  const posting = await prisma.careerPosting.create({
    data: {
      title,
      department,
      location,
      employmentType: employmentType || "FULL_TIME",
      description,
      requirements,
      salaryMin: salaryMin ? Number(salaryMin) : null,
      salaryMax: salaryMax ? Number(salaryMax) : null,
      status: status || "DRAFT",
    },
  });

  res.status(201).json({ success: true, data: posting });
});

// @desc    Update career posting (admin)
// @route   PUT /api/admin/careers/:id
export const updateCareerPosting = asyncHandler(async (req, res) => {
  const { title, department, location, employmentType, description, requirements, salaryMin, salaryMax, status } = req.body;
  const data = {};
  if (title !== undefined) data.title = title;
  if (department !== undefined) data.department = department;
  if (location !== undefined) data.location = location;
  if (employmentType !== undefined) data.employmentType = employmentType;
  if (description !== undefined) data.description = description;
  if (requirements !== undefined) data.requirements = requirements;
  if (salaryMin !== undefined) data.salaryMin = salaryMin ? Number(salaryMin) : null;
  if (salaryMax !== undefined) data.salaryMax = salaryMax ? Number(salaryMax) : null;
  if (status !== undefined) data.status = status;

  const posting = await prisma.careerPosting.update({
    where: { id: req.params.id },
    data,
  });

  res.json({ success: true, data: posting });
});

// @desc    Delete career posting (admin)
// @route   DELETE /api/admin/careers/:id
export const deleteCareerPosting = asyncHandler(async (req, res) => {
  await prisma.careerPosting.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: "Career posting deleted" });
});

// @desc    Get applications for a posting (admin)
// @route   GET /api/admin/careers/:id/applications
export const getApplications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [applications, total] = await Promise.all([
    prisma.careerApplication.findMany({
      where: { postingId: req.params.id },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.careerApplication.count({ where: { postingId: req.params.id } }),
  ]);

  res.json({
    success: true,
    data: applications,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// @desc    Delete an application (admin)
// @route   DELETE /api/admin/careers/applications/:id
export const deleteApplication = asyncHandler(async (req, res) => {
  await prisma.careerApplication.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: "Application deleted" });
});

// ──── Public Career Routes (for portfolio website) ────

// @desc    Get active career postings (public)
// @route   GET /api/careers
export const getPublicCareerPostings = asyncHandler(async (req, res) => {
  const postings = await prisma.careerPosting.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      department: true,
      location: true,
      employmentType: true,
      description: true,
      requirements: true,
      salaryMin: true,
      salaryMax: true,
      createdAt: true,
    },
  });

  res.json({ success: true, data: postings });
});

// @desc    Get single active career posting (public)
// @route   GET /api/careers/:id
export const getPublicCareerPosting = asyncHandler(async (req, res) => {
  const posting = await prisma.careerPosting.findFirst({
    where: { id: req.params.id, status: "ACTIVE" },
    select: {
      id: true,
      title: true,
      department: true,
      location: true,
      employmentType: true,
      description: true,
      requirements: true,
      salaryMin: true,
      salaryMax: true,
      createdAt: true,
    },
  });

  if (!posting) {
    res.status(404);
    throw new Error("Career posting not found");
  }

  res.json({ success: true, data: posting });
});

// @desc    Submit application for a career posting (public)
// @route   POST /api/careers/:id/apply
export const submitApplication = asyncHandler(async (req, res) => {
  const { fullName, email, phone, resumeUrl, coverLetter, linkedInUrl } = req.body;

  if (!fullName || !email) {
    res.status(400);
    throw new Error("Full name and email are required");
  }

  // Verify posting exists and is active
  const posting = await prisma.careerPosting.findFirst({
    where: { id: req.params.id, status: "ACTIVE" },
  });

  if (!posting) {
    res.status(404);
    throw new Error("Career posting not found or no longer accepting applications");
  }

  const application = await prisma.careerApplication.create({
    data: {
      postingId: req.params.id,
      fullName,
      email,
      phone: phone || null,
      resumeUrl: resumeUrl || null,
      coverLetter: coverLetter || null,
      linkedInUrl: linkedInUrl || null,
    },
  });

  res.status(201).json({ success: true, data: application });
});
