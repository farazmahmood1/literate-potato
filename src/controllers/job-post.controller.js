import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import { getIO } from "../config/socket.js";
import {
  notifyNewJobPost,
  notifyJobPostAccepted,
  notifyConsultationAccepted,
  scheduleTrialNotifications,
} from "../services/notification.service.js";

// @desc    Create a job post (broadcast to all lawyers, or targeted to one)
// @route   POST /api/job-posts
export const createJobPost = asyncHandler(async (req, res) => {
  const { category, state, urgency, description, summary, targetLawyerId } = req.body;

  // For broadcast posts, check for existing open job post by this client for same category
  if (!targetLawyerId) {
    const existing = await prisma.jobPost.findFirst({
      where: {
        clientId: req.user.id,
        category,
        status: "OPEN",
        targetLawyerId: null,
      },
    });

    if (existing) {
      res.status(400);
      throw new Error("You already have an open job post for this category");
    }
  }

  // Determine which lawyers to notify
  let lawyersToNotify = [];

  if (targetLawyerId) {
    // Targeted invite — only notify the specific lawyer (bypass state/verification filters)
    const targetLawyer = await prisma.lawyerProfile.findUnique({
      where: { id: targetLawyerId },
      include: {
        user: { select: { id: true, expoPushToken: true } },
      },
    });

    if (!targetLawyer) {
      res.status(404);
      throw new Error("Target lawyer not found");
    }

    lawyersToNotify = [targetLawyer];
  } else {
    // Broadcast — find verified lawyers licensed in the job post's state, exclude busy
    // Note: onlineStatus can be null for lawyers who haven't toggled status yet,
    // so we explicitly exclude only "busy" (null and "online"/"offline" are allowed)
    lawyersToNotify = await prisma.lawyerProfile.findMany({
      where: {
        verificationStatus: "VERIFIED",
        OR: [
          { onlineStatus: null },
          { onlineStatus: { not: "busy" } },
        ],
        ...(state ? { licenseState: state } : {}),
      },
      include: {
        user: { select: { id: true, expoPushToken: true } },
      },
    });
  }

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
      lawyersNotified: lawyersToNotify.length,
      ...(targetLawyerId ? { targetLawyerId } : {}),
    },
    include: {
      client: { select: { firstName: true, lastName: true, avatar: true } },
    },
  });

  const clientName = `${jobPost.client.firstName} ${jobPost.client.lastName}`;
  const onlineLawyersCount = lawyersToNotify.filter(
    (l) => l.onlineStatus === "online"
  ).length;

  const lawyersWithTokens = lawyersToNotify.filter((l) => l.user.expoPushToken);
  console.log(
    `[JobPost] Created ${jobPost.id}${targetLawyerId ? " (targeted)" : ""} — ${lawyersToNotify.length} lawyers matched (${onlineLawyersCount} online, ${lawyersWithTokens.length} with push tokens)`,
  );
  if (lawyersToNotify.length === 0) {
    console.log(`[JobPost] No lawyers matched. Filters: state=${state}, verificationStatus=VERIFIED. Check if test lawyers are verified.`);
  }
  for (const l of lawyersToNotify) {
    console.log(`[JobPost]   → Lawyer ${l.id} (userId: ${l.user.id}), status: ${l.onlineStatus}, token: ${l.user.expoPushToken ? 'yes' : 'NO'}`);
  }

  // Send push notification + socket event to each lawyer
  for (const lawyer of lawyersToNotify) {
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
        isDirectInvite: !!targetLawyerId,
      });
    } catch (err) {
      console.warn("[JobPost] Socket emit error:", err?.message);
    }

    // Push notification
    notifyNewJobPost(lawyer.user.id, clientName, category, state, jobPost.id);
  }

  res.status(201).json({
    success: true,
    data: {
      ...jobPost,
      lawyersNotified: lawyersToNotify.length,
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
    // Lawyers see open job posts filtered by their licensed state,
    // PLUS any posts directly targeted to them (bypass state filter)
    const lawyerProfile = await prisma.lawyerProfile.findUnique({
      where: { userId: req.user.id },
      select: { id: true, licenseState: true },
    });

    const stateFilter = {
      ...(status !== "all" && { status }),
      ...(lawyerProfile?.licenseState && { state: lawyerProfile.licenseState }),
    };

    const targetedFilter = {
      targetLawyerId: lawyerProfile?.id,
      ...(status !== "all" && { status }),
    };

    where = {
      OR: [stateFilter, targetedFilter],
    };
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

    // Notify lawyers in the same state that this job post is taken
    const lawyersInState = await prisma.lawyerProfile.findMany({
      where: {
        verificationStatus: "VERIFIED",
        ...(jobPost.state ? { licenseState: jobPost.state } : {}),
      },
      select: { userId: true },
    });
    for (const lp of lawyersInState) {
      io.to(`user:${lp.userId}`).emit("job-post-status-change", {
        jobPostId: jobPost.id,
        status: "ACCEPTED",
      });
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Socket emit error (acceptJobPost):", err?.message);
    }
  }

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

  // Notify lawyers in the same state via socket
  try {
    const io = getIO();
    const lawyersInState = await prisma.lawyerProfile.findMany({
      where: {
        verificationStatus: "VERIFIED",
        ...(jobPost.state ? { licenseState: jobPost.state } : {}),
      },
      select: { userId: true },
    });
    for (const lp of lawyersInState) {
      io.to(`user:${lp.userId}`).emit("job-post-status-change", {
        jobPostId: jobPost.id,
        status: "CLOSED",
      });
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Socket emit error (closeJobPost):", err?.message);
    }
  }

  res.json({ success: true, data: updated });
});

// @desc    Delete a job post (client only, non-ACCEPTED posts)
// @route   DELETE /api/job-posts/:id
export const deleteJobPost = asyncHandler(async (req, res) => {
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

  if (jobPost.status === "ACCEPTED") {
    res.status(400);
    throw new Error("Cannot delete an accepted job post that has an active consultation");
  }

  // If still OPEN, notify lawyers before deleting
  if (jobPost.status === "OPEN") {
    try {
      const io = getIO();
      const lawyersInState = await prisma.lawyerProfile.findMany({
        where: {
          verificationStatus: "VERIFIED",
          ...(jobPost.state ? { licenseState: jobPost.state } : {}),
        },
        select: { userId: true },
      });
      for (const lp of lawyersInState) {
        io.to(`user:${lp.userId}`).emit("job-post-status-change", {
          jobPostId: jobPost.id,
          status: "CLOSED",
        });
      }
    } catch {
      // Silent fail for socket
    }
  }

  // Hard delete — JobPostViews cascade via onDelete: Cascade in schema
  await prisma.jobPost.delete({ where: { id: req.params.id } });

  res.json({ success: true, message: "Job post deleted" });
});
