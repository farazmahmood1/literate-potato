import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import { getIO, isUserOnline } from "../config/socket.js";
import {
  notifyNewJobPost,
  notifyJobPostAccepted,
  notifyConsultationAccepted,
  scheduleTrialNotifications,
  createInAppNotification,
} from "../services/notification.service.js";

// ─── Shared helper: record a job-post view for a lawyer ───
// Returns the new total viewCount (or null if the view already existed / was skipped).
async function recordJobPostView(jobPostId, lawyerUserId) {
  const lawyerProfile = await prisma.lawyerProfile.findUnique({
    where: { userId: lawyerUserId },
    select: { id: true, user: { select: { firstName: true, lastName: true } } },
  });
  if (!lawyerProfile) return null;

  const lawyerName = `${lawyerProfile.user.firstName} ${lawyerProfile.user.lastName}`;

  // Upsert to avoid check-then-create race condition (single query instead of 2)
  try {
    await prisma.jobPostView.create({
      data: {
        jobPostId,
        lawyerId: lawyerProfile.id,
        lawyerName,
      },
    });
  } catch (err) {
    // Unique constraint violation = already viewed — skip
    if (err.code === "P2002") return null;
    throw err;
  }

  // Count total views for this post
  const viewCount = await prisma.jobPostView.count({
    where: { jobPostId },
  });

  // Notify the client (job post creator) in real-time
  try {
    const jobPost = await prisma.jobPost.findUnique({
      where: { id: jobPostId },
      select: { clientId: true },
    });
    if (jobPost) {
      const io = getIO();
      io.to(`user:${jobPost.clientId}`).emit("job-post-viewed", {
        jobPostId,
        viewCount,
        lawyerName,
      });
    }
  } catch (socketErr) {
    console.warn("[JobPost] Socket emit error in recordJobPostView:", socketErr?.message);
  }

  return viewCount;
}

// ─── Batch helper: record views for multiple job posts at once ───
// Single profile lookup, then parallel upserts. Used in getJobPosts to avoid N+1.
async function recordJobPostViewBatch(jobPostIds, lawyerUserId) {
  const lawyerProfile = await prisma.lawyerProfile.findUnique({
    where: { userId: lawyerUserId },
    select: { id: true, user: { select: { firstName: true, lastName: true } } },
  });
  if (!lawyerProfile) return;

  const lawyerName = `${lawyerProfile.user.firstName} ${lawyerProfile.user.lastName}`;

  // Use createMany with skipDuplicates — single query for all views
  await prisma.jobPostView.createMany({
    data: jobPostIds.map((jobPostId) => ({
      jobPostId,
      lawyerId: lawyerProfile.id,
      lawyerName,
    })),
    skipDuplicates: true,
  });
}

// @desc    Create a job post (broadcast to online lawyers in category, or targeted to one)
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
    // Targeted invite — only notify the specific lawyer (bypass category/online filters)
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
    // Broadcast — find verified lawyers whose specializations include the
    // job's category AND who are currently online (real-time socket check).
    // Step 1: Query DB for verified lawyers matching the category.
    const candidateLawyers = await prisma.lawyerProfile.findMany({
      where: {
        verificationStatus: "VERIFIED",
        specializations: { has: category },
      },
      include: {
        user: { select: { id: true, expoPushToken: true } },
      },
    });

    // Step 2: Filter to only lawyers confirmed online via real-time socket
    // presence (not stale DB field). This ensures the client sees an accurate
    // count and only truly reachable lawyers are notified.
    lawyersToNotify = candidateLawyers.filter(
      (l) => isUserOnline(l.user.id)
    );
  }

  // All matched lawyers are online (for broadcast), so count equals length
  const onlineLawyersCount = targetLawyerId
    ? lawyersToNotify.filter((l) => isUserOnline(l.user.id)).length
    : lawyersToNotify.length;

  // Create job post with 15min expiry — store lawyersNotified count + onlineLawyersCount
  // State is kept for informational display but NOT used for filtering
  const jobPost = await prisma.jobPost.create({
    data: {
      clientId: req.user.id,
      category,
      state: state || "",
      urgency: urgency || "medium",
      description,
      summary: summary || description.substring(0, 300),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      lawyersNotified: lawyersToNotify.length,
      onlineLawyersCount,
      ...(targetLawyerId ? { targetLawyerId } : {}),
    },
    include: {
      client: { select: { firstName: true, lastName: true, avatar: true } },
    },
  });

  const clientName = `${jobPost.client.firstName || ""} ${jobPost.client.lastName || ""}`.trim() || "Client";

  const lawyersWithTokens = lawyersToNotify.filter((l) => l.user.expoPushToken);
  console.log(
    `[JobPost] Created ${jobPost.id}${targetLawyerId ? " (targeted)" : ""} — ${lawyersToNotify.length} lawyers matched (${onlineLawyersCount} online, ${lawyersWithTokens.length} with push tokens) [category=${category}]`,
  );
  if (lawyersToNotify.length === 0) {
    console.log(`[JobPost] No online lawyers matched. Filters: category=${category}, verificationStatus=VERIFIED, onlineStatus=real-time socket. Check if lawyers are online and have "${category}" in specializations.`);
  }
  for (const l of lawyersToNotify) {
    console.log(`[JobPost]   → Lawyer ${l.id} (userId: ${l.user.id}), status: ${l.onlineStatus}, token: ${l.user.expoPushToken ? 'yes' : 'NO'}`);
  }

  // Respond immediately — dispatch notifications async (fire-and-forget).
  // This prevents the client from timing out when notifying 100+ lawyers.
  res.status(201).json({
    success: true,
    data: {
      ...jobPost,
      lawyersNotified: lawyersToNotify.length,
      onlineLawyersCount,
    },
  });

  // Fire-and-forget: send socket events + push notifications after response
  setImmediate(() => {
    for (const lawyer of lawyersToNotify) {
      try {
        const io = getIO();
        io.to(`user:${lawyer.user.id}`).emit("new-job-post", {
          jobPostId: jobPost.id,
          category,
          urgency: jobPost.urgency,
          summary: jobPost.summary,
          clientName,
          createdAt: jobPost.createdAt,
          isDirectInvite: !!targetLawyerId,
        });
      } catch (err) {
        console.warn("[JobPost] Socket emit error:", err?.message);
      }

      notifyNewJobPost(lawyer.user.id, clientName, category, jobPost.id);
    }
  });
});

// @desc    Get job posts for lawyers (matching their specializations)
// @route   GET /api/job-posts
export const getJobPosts = asyncHandler(async (req, res) => {
  const { status = "OPEN", page = 1, limit = 20 } = req.query;

  let where = {};

  if (req.user.role === "LAWYER") {
    // Lawyers see open job posts whose category matches one of their specializations,
    // PLUS any posts directly targeted to them (bypass category filter).
    const lawyerProfile = await prisma.lawyerProfile.findUnique({
      where: { userId: req.user.id },
      select: { id: true, specializations: true },
    });

    // Exclude posts the lawyer has declined
    const declinedFilter = lawyerProfile
      ? { NOT: { views: { some: { lawyerId: lawyerProfile.id, declined: true } } } }
      : {};

    const statusFilter = status !== "all" ? { status } : {};

    // Build category-matching condition: job post category must be in
    // the lawyer's specializations array (case-insensitive via `in`).
    const specializations = lawyerProfile?.specializations || [];

    // Broadcast posts matching the lawyer's specializations
    const categoryCondition = specializations.length > 0
      ? {
          ...statusFilter,
          category: { in: specializations, mode: "insensitive" },
          targetLawyerId: null,
          ...declinedFilter,
        }
      : { ...statusFilter, targetLawyerId: null, ...declinedFilter, id: "NONE" }; // No specializations = no broadcast matches

    // Targeted posts: posts specifically addressed to this lawyer (any category)
    const targetedFilter = {
      targetLawyerId: lawyerProfile?.id,
      ...statusFilter,
      ...declinedFilter,
    };

    where = {
      OR: [categoryCondition, targetedFilter],
    };

    if (process.env.NODE_ENV !== "production") {
      console.log(`[JobPost GET] lawyer=${req.user.id}, specializations=${JSON.stringify(specializations)}`);
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

  if (process.env.NODE_ENV !== "production" && req.user.role === "LAWYER") {
    console.log(`[JobPost GET] Found ${total} job posts (returned ${jobPosts.length})`);
  }

  // Track views for LAWYER users viewing OPEN posts.
  // Fire-and-forget a SINGLE batched view recording to avoid N+1 queries.
  // The frontend also records views explicitly via POST /:id/view on first sight,
  // so we don't need to block the response on this.
  if (req.user.role === "LAWYER" && jobPosts.length > 0) {
    const openPostIds = jobPosts.filter((jp) => jp.status === "OPEN").map((jp) => jp.id);
    if (openPostIds.length > 0) {
      // Fire-and-forget — don't await, don't block response
      recordJobPostViewBatch(openPostIds, req.user.id).catch((err) => {
        console.warn("[JobPost] Batch view tracking error:", err?.message);
      });
    }
  }

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

  // Track view when a LAWYER fetches a single job post
  let viewCount = jobPost._count.views;
  if (req.user.role === "LAWYER" && jobPost.status === "OPEN") {
    try {
      const newCount = await recordJobPostView(jobPost.id, req.user.id);
      if (newCount !== null) viewCount = newCount;
    } catch (err) {
      console.warn("[JobPost] View tracking error (getOne):", err?.message);
    }
  }

  res.json({
    success: true,
    data: {
      ...jobPost,
      viewCount,
      recentViewers: jobPost.views,
    },
  });
});

// @desc    Record a view for a job post (explicit frontend call)
// @route   POST /api/job-posts/:id/view
export const recordView = asyncHandler(async (req, res) => {
  if (req.user.role !== "LAWYER") {
    res.status(403);
    throw new Error("Only lawyers can record views");
  }

  const jobPost = await prisma.jobPost.findUnique({
    where: { id: req.params.id },
    select: { id: true, status: true },
  });

  if (!jobPost) {
    res.status(404);
    throw new Error("Job post not found");
  }

  const newCount = await recordJobPostView(jobPost.id, req.user.id);

  // Return current count whether this was a new or existing view
  const viewCount = newCount ?? await prisma.jobPostView.count({
    where: { jobPostId: jobPost.id },
  });

  res.json({ success: true, data: { viewCount } });
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

  // Prevent abuse: block if client already has an active (unexpired) TRIAL consultation
  const activeTrial = await prisma.consultation.findFirst({
    where: {
      clientId: jobPost.clientId,
      status: "TRIAL",
      trialEndAt: { gt: new Date() },
    },
  });
  if (activeTrial) {
    res.status(400);
    throw new Error("Client already has an active trial consultation");
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

    // Notify lawyers in the same category that this job post is taken
    const lawyersInCategory = await prisma.lawyerProfile.findMany({
      where: {
        verificationStatus: "VERIFIED",
        specializations: { has: jobPost.category },
      },
      select: { userId: true },
    });
    for (const lp of lawyersInCategory) {
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
  notifyJobPostAccepted(jobPost.clientId, lawyerName, jobPost.id, consultation.id, jobPost.category);
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

// @desc    Lawyer declines a job post (persists so it doesn't reappear)
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

  // Persist the decline via JobPostView so it doesn't reappear after refresh
  const lawyerProfile = await prisma.lawyerProfile.findUnique({
    where: { userId: req.user.id },
    include: { user: { select: { firstName: true, lastName: true } } },
  });

  if (lawyerProfile) {
    const lawyerName = `${lawyerProfile.user.firstName} ${lawyerProfile.user.lastName}`.trim();
    await prisma.jobPostView.upsert({
      where: {
        jobPostId_lawyerId: {
          jobPostId: req.params.id,
          lawyerId: lawyerProfile.id,
        },
      },
      update: { declined: true },
      create: {
        jobPostId: req.params.id,
        lawyerId: lawyerProfile.id,
        lawyerName,
        declined: true,
      },
    });
  }

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

  // Notify lawyers in the same category via socket
  try {
    const io = getIO();
    const lawyersInCategory = await prisma.lawyerProfile.findMany({
      where: {
        verificationStatus: "VERIFIED",
        specializations: { has: jobPost.category },
      },
      select: { userId: true },
    });
    for (const lp of lawyersInCategory) {
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
      const lawyersInCategory = await prisma.lawyerProfile.findMany({
        where: {
          verificationStatus: "VERIFIED",
          specializations: { has: jobPost.category },
        },
        select: { userId: true },
      });
      for (const lp of lawyersInCategory) {
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

// @desc    Get lawyers currently online (live socket presence) matching a job post's category
// @route   GET /api/job-posts/:id/online-lawyers
export const getOnlineLawyersForJob = asyncHandler(async (req, res) => {
  const jobPost = await prisma.jobPost.findUnique({
    where: { id: req.params.id },
    select: { id: true, clientId: true, category: true },
  });

  if (!jobPost) {
    res.status(404);
    throw new Error("Job post not found");
  }

  if (jobPost.clientId !== req.user.id) {
    res.status(403);
    throw new Error("Not authorized");
  }

  // Step 1: Query DB for verified lawyers whose specializations include the category
  const candidateLawyers = await prisma.lawyerProfile.findMany({
    where: {
      verificationStatus: "VERIFIED",
      specializations: { has: jobPost.category },
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      reviews: {
        where: { status: "APPROVED" },
        select: { rating: true },
      },
    },
  });

  // Step 2: Filter to only lawyers confirmed online via real-time socket presence
  // This is the SAME check used in createJobPost — isUserOnline() reads the
  // in-memory connectedUsers Map, NOT the stale DB onlineStatus field.
  const onlineLawyers = candidateLawyers.filter(
    (l) => isUserOnline(l.user.id)
  );

  console.log(
    `[JobPost] Online lawyers for ${jobPost.id}: ${onlineLawyers.length}/${candidateLawyers.length} online [category=${jobPost.category}]`
  );

  res.json({
    success: true,
    data: onlineLawyers,
  });
});

// ─── Background task: expire stale OPEN job posts ───
export function startJobPostExpiryTask() {
  const INTERVAL_MS = 60_000; // Check every minute

  setInterval(async () => {
    try {
      const { count } = await prisma.jobPost.updateMany({
        where: {
          status: "OPEN",
          expiresAt: { lt: new Date() },
        },
        data: { status: "EXPIRED" },
      });

      if (count > 0) {
        console.log(`[JobPostExpiry] Marked ${count} job post(s) as EXPIRED`);

        // Notify lawyers to remove expired posts from their dashboards
        try {
          const io = getIO();
          const expiredPosts = await prisma.jobPost.findMany({
            where: {
              status: "EXPIRED",
              updatedAt: { gte: new Date(Date.now() - INTERVAL_MS) },
            },
            select: { id: true, category: true },
          });

          for (const post of expiredPosts) {
            const lawyers = await prisma.lawyerProfile.findMany({
              where: {
                verificationStatus: "VERIFIED",
                specializations: { has: post.category },
              },
              select: { userId: true },
            });
            for (const lp of lawyers) {
              io.to(`user:${lp.userId}`).emit("job-post-status-change", {
                jobPostId: post.id,
                status: "EXPIRED",
              });
            }
          }
        } catch {}
      }
    } catch (err) {
      console.error("[JobPostExpiry] Error:", err.message);
    }
  }, INTERVAL_MS);

  console.log("[JobPostExpiry] Background task started (60s interval)");
}
