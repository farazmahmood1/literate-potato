import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import { getIO } from "../config/socket.js";
import {
  notifyNewJobPost,
  notifyJobPostAccepted,
  notifyConsultationAccepted,
  scheduleTrialNotifications,
} from "../services/notification.service.js";

// @desc    Create a job post (broadcast to all lawyers in state)
// @route   POST /api/job-posts
export const createJobPost = asyncHandler(async (req, res) => {
  const { category, state, urgency, description, summary } = req.body;

  // Check for existing open job post by this client for same issue
  const existing = await prisma.jobPost.findFirst({
    where: {
      clientId: req.user.id,
      category,
      state,
      status: "OPEN",
    },
  });

  if (existing) {
    res.status(400);
    throw new Error("You already have an open job post for this category and state");
  }

  // Create job post with 15min expiry
  // Find all verified lawyers in this state with matching specialization
  // Notify online + offline lawyers. Exclude busy lawyers.
  const matchingLawyers = await prisma.lawyerProfile.findMany({
    where: {
      licenseState: state,
      specializations: { has: category },
      verificationStatus: "VERIFIED",
      onlineStatus: { not: "busy" },
    },
    include: {
      user: { select: { id: true, expoPushToken: true } },
    },
  });

  // Create job post with 15min expiry — store lawyersNotified count
  const jobPost = await prisma.jobPost.create({
    data: {
      clientId: req.user.id,
      category,
      state,
      urgency: urgency || "medium",
      description,
      summary: summary || description.substring(0, 300),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      lawyersNotified: matchingLawyers.length,
    },
    include: {
      client: { select: { firstName: true, lastName: true, avatar: true } },
    },
  });

  const clientName = `${jobPost.client.firstName} ${jobPost.client.lastName}`;
  const onlineLawyersCount = matchingLawyers.filter(
    (l) => l.onlineStatus === "online"
  ).length;

  // Send push notification + socket event to each matching lawyer
  for (const lawyer of matchingLawyers) {
    // Socket notification
    try {
      const io = getIO();
      io.to(`user:${lawyer.user.id}`).emit("new-job-post", {
        jobPostId: jobPost.id,
        category,
        state,
        urgency: jobPost.urgency,
        summary: jobPost.summary,
        clientName,
        createdAt: jobPost.createdAt,
      });
    } catch {}

    // Push notification
    notifyNewJobPost(lawyer.user.id, clientName, category, state, jobPost.id);
  }

  res.status(201).json({
    success: true,
    data: {
      ...jobPost,
      lawyersNotified: matchingLawyers.length,
      onlineLawyersCount,
    },
  });
});

// @desc    Get job posts for lawyers (in their state)
// @route   GET /api/job-posts
export const getJobPosts = asyncHandler(async (req, res) => {
  const { status = "OPEN", page = 1, limit = 20 } = req.query;

  let where = {};

  if (req.user.role === "LAWYER") {
    // Lawyers see open job posts in their state
    const profile = await prisma.lawyerProfile.findUnique({
      where: { userId: req.user.id },
      select: { licenseState: true, specializations: true },
    });

    if (!profile) {
      res.status(404);
      throw new Error("Lawyer profile not found");
    }

    where = {
      state: profile.licenseState,
      status: status === "all" ? undefined : status,
    };

    // If filtering by OPEN, only show matching specializations
    if (status === "OPEN") {
      where.category = { in: profile.specializations };
    }
  } else {
    // Clients see their own job posts
    where = {
      clientId: req.user.id,
      ...(status !== "all" && { status }),
    };
  }

  // Clean undefined values
  Object.keys(where).forEach((k) => where[k] === undefined && delete where[k]);

  const skip = (Number(page) - 1) * Number(limit);

  const [jobPosts, total] = await Promise.all([
    prisma.jobPost.findMany({
      where,
      include: {
        client: { select: { firstName: true, lastName: true, avatar: true } },
        acceptedByLawyer: {
          include: { user: { select: { firstName: true, lastName: true, avatar: true } } },
        },
        _count: { select: { views: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.jobPost.count({ where }),
  ]);

  // Track views for LAWYER users viewing OPEN posts
  if (req.user.role === "LAWYER" && jobPosts.length > 0) {
    try {
      const lawyerProfile = await prisma.lawyerProfile.findUnique({
        where: { userId: req.user.id },
        include: { user: { select: { firstName: true, lastName: true } } },
      });

      if (lawyerProfile) {
        const lawyerName = `${lawyerProfile.user.firstName} ${lawyerProfile.user.lastName}`;
        const io = getIO();

        for (const jp of jobPosts) {
          if (jp.status !== "OPEN") continue;

          const existing = await prisma.jobPostView.findUnique({
            where: {
              jobPostId_lawyerId: {
                jobPostId: jp.id,
                lawyerId: lawyerProfile.id,
              },
            },
          });

          if (!existing) {
            await prisma.jobPostView.create({
              data: {
                jobPostId: jp.id,
                lawyerId: lawyerProfile.id,
                lawyerName,
              },
            });

            const viewCount = await prisma.jobPostView.count({
              where: { jobPostId: jp.id },
            });

            io.to(`user:${jp.clientId}`).emit("job-post-viewed", {
              jobPostId: jp.id,
              viewCount,
              lawyerName,
            });
          }
        }
      }
    } catch (err) {
      // Silent fail for view tracking
      if (process.env.NODE_ENV !== "production") {
        console.warn("View tracking error:", err.message);
      }
    }
  }

  // Map viewCount from _count onto each job post
  const enriched = jobPosts.map((jp) => ({
    ...jp,
    viewCount: jp._count?.views ?? 0,
    _count: undefined,
  }));

  res.json({
    success: true,
    data: enriched,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

// @desc    Get a single job post
// @route   GET /api/job-posts/:id
export const getJobPost = asyncHandler(async (req, res) => {
  const jobPost = await prisma.jobPost.findUnique({
    where: { id: req.params.id },
    include: {
      client: { select: { firstName: true, lastName: true, avatar: true, email: true } },
      acceptedByLawyer: {
        include: { user: { select: { firstName: true, lastName: true, avatar: true } } },
      },
      consultation: {
        select: { id: true, status: true },
      },
      views: {
        select: { lawyerName: true, viewedAt: true },
        orderBy: { viewedAt: "desc" },
        take: 10,
      },
      _count: {
        select: { views: true },
      },
    },
  });

  if (!jobPost) {
    res.status(404);
    throw new Error("Job post not found");
  }

  res.json({
    success: true,
    data: {
      ...jobPost,
      viewCount: jobPost._count.views,
      recentViewers: jobPost.views,
    },
  });
});

// @desc    Lawyer accepts a job post → creates consultation with trial
// @route   PUT /api/job-posts/:id/accept
export const acceptJobPost = asyncHandler(async (req, res) => {
  const lawyerProfile = await prisma.lawyerProfile.findUnique({
    where: { userId: req.user.id },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  });

  if (!lawyerProfile) {
    res.status(404);
    throw new Error("Lawyer profile not found");
  }

  const jobPost = await prisma.jobPost.findUnique({
    where: { id: req.params.id },
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  if (!jobPost) {
    res.status(404);
    throw new Error("Job post not found");
  }

  if (jobPost.status !== "OPEN") {
    res.status(400);
    throw new Error(`Job post is no longer open (status: ${jobPost.status})`);
  }

  // Check license state matches
  if (lawyerProfile.licenseState !== jobPost.state) {
    res.status(403);
    throw new Error("You are not licensed in this state");
  }

  const now = new Date();
  const trialEndAt = new Date(now.getTime() + 3 * 60 * 1000); // 3 min trial

  // Create consultation + update job post in a transaction
  const [consultation, updatedJobPost] = await prisma.$transaction([
    prisma.consultation.create({
      data: {
        clientId: jobPost.clientId,
        lawyerId: lawyerProfile.id,
        category: jobPost.category,
        description: jobPost.description,
        status: "TRIAL",
        startedAt: now,
        trialEndAt,
      },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        lawyer: {
          include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
        },
      },
    }),
    prisma.jobPost.update({
      where: { id: req.params.id },
      data: {
        status: "ACCEPTED",
        acceptedByLawyerId: lawyerProfile.id,
      },
    }),
  ]);

  // Link consultation to job post (separate update since we need the consultation id)
  await prisma.jobPost.update({
    where: { id: req.params.id },
    data: { consultationId: consultation.id },
  });

  // Create system message
  const lawyerName = `${lawyerProfile.user.firstName} ${lawyerProfile.user.lastName}`;
  await prisma.message.create({
    data: {
      consultationId: consultation.id,
      senderId: req.user.id,
      content: `${lawyerName} has accepted your job post. Your 3-minute free trial has started!`,
      messageType: "SYSTEM",
    },
  });

  // Also send the client's description as first message
  const firstMessage = await prisma.message.create({
    data: {
      consultationId: consultation.id,
      senderId: jobPost.clientId,
      content: jobPost.description,
      messageType: "TEXT",
    },
    include: {
      sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
    },
  });

  // Socket notifications
  try {
    const io = getIO();

    // Notify client
    io.to(`user:${jobPost.clientId}`).emit("job-post-accepted", {
      jobPostId: jobPost.id,
      consultationId: consultation.id,
      lawyerName,
      trialEndAt: trialEndAt.toISOString(),
    });

    // Emit consultation status change
    io.to(`consultation:${consultation.id}`).emit("consultation-status-change", {
      consultationId: consultation.id,
      status: "TRIAL",
      trialEndAt: trialEndAt.toISOString(),
    });

    // Emit first message to both
    io.to(`user:${jobPost.clientId}`).emit("new-message", firstMessage);
    io.to(`user:${req.user.id}`).emit("new-message", firstMessage);

    // Notify other lawyers that this job post is taken
    io.emit("job-post-status-change", {
      jobPostId: jobPost.id,
      status: "ACCEPTED",
    });
  } catch {}

  // Push notifications
  notifyJobPostAccepted(jobPost.clientId, lawyerName, jobPost.id, consultation.id);
  notifyConsultationAccepted(jobPost.clientId, lawyerName, consultation.id, trialEndAt.toISOString());
  scheduleTrialNotifications(jobPost.clientId, lawyerName, consultation.id);

  res.json({
    success: true,
    data: {
      jobPost: updatedJobPost,
      consultation,
    },
  });
});

// @desc    Lawyer declines a job post (just hides it for them)
// @route   PUT /api/job-posts/:id/decline
export const declineJobPost = asyncHandler(async (req, res) => {
  const jobPost = await prisma.jobPost.findUnique({
    where: { id: req.params.id },
  });

  if (!jobPost) {
    res.status(404);
    throw new Error("Job post not found");
  }

  if (jobPost.status !== "OPEN") {
    res.status(400);
    throw new Error("Job post is no longer open");
  }

  // We don't change the job post status — just acknowledge the decline
  // Other lawyers can still accept it
  res.json({ success: true, message: "Job post declined" });
});

// @desc    Client closes their job post
// @route   PUT /api/job-posts/:id/close
export const closeJobPost = asyncHandler(async (req, res) => {
  const jobPost = await prisma.jobPost.findUnique({
    where: { id: req.params.id },
  });

  if (!jobPost) {
    res.status(404);
    throw new Error("Job post not found");
  }

  if (jobPost.clientId !== req.user.id) {
    res.status(403);
    throw new Error("Not authorized");
  }

  if (jobPost.status !== "OPEN") {
    res.status(400);
    throw new Error("Job post is not open");
  }

  const updated = await prisma.jobPost.update({
    where: { id: req.params.id },
    data: { status: "CLOSED" },
  });

  // Notify via socket
  try {
    const io = getIO();
    io.emit("job-post-status-change", {
      jobPostId: jobPost.id,
      status: "CLOSED",
    });
  } catch {}

  res.json({ success: true, data: updated });
});
