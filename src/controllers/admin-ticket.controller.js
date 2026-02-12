import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";
import {
  notifyTicketReply,
  notifyTicketStatusChanged,
} from "../services/notification.service.js";

const TICKET_INCLUDE = {
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      avatar: true,
      role: true,
    },
  },
  replies: {
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  },
};

// @desc    Get all tickets (admin, paginated, filterable)
// @route   GET /api/admin/tickets
export const getAdminTickets = asyncHandler(async (req, res) => {
  const { status, category, page = 1, limit = 20 } = req.query;

  const where = {};
  if (status) where.status = status;
  if (category) where.category = category;

  const skip = (Number(page) - 1) * Number(limit);

  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        _count: { select: { replies: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.supportTicket.count({ where }),
  ]);

  res.json({
    success: true,
    data: tickets,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

// @desc    Get single ticket with replies (admin)
// @route   GET /api/admin/tickets/:id
export const getAdminTicket = asyncHandler(async (req, res) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: req.params.id },
    include: TICKET_INCLUDE,
  });

  if (!ticket) {
    res.status(404);
    throw new Error("Ticket not found");
  }

  res.json({ success: true, data: ticket });
});

// @desc    Admin replies to ticket
// @route   POST /api/admin/tickets/:id/replies
export const adminReply = asyncHandler(async (req, res) => {
  const adminId = req.user?.id || "admin";
  const { message } = req.body;

  if (!message?.trim()) {
    res.status(400);
    throw new Error("message is required");
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: req.params.id },
  });
  if (!ticket) {
    res.status(404);
    throw new Error("Ticket not found");
  }

  // Auto-move to IN_PROGRESS if OPEN
  const shouldProgress = ticket.status === "OPEN";

  const [reply] = await Promise.all([
    prisma.ticketReply.create({
      data: {
        ticketId: ticket.id,
        userId: adminId,
        message: message.trim(),
        isAdmin: true,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
      },
    }),
    shouldProgress
      ? prisma.supportTicket.update({
          where: { id: ticket.id },
          data: { status: "IN_PROGRESS" },
        })
      : Promise.resolve(),
  ]);

  // Notify user
  notifyTicketReply(ticket.userId, ticket.id, ticket.subject);

  res.status(201).json({ success: true, data: reply });
});

// @desc    Admin updates ticket status
// @route   PUT /api/admin/tickets/:id/status
export const updateTicketStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!["IN_PROGRESS", "RESOLVED", "CLOSED"].includes(status)) {
    res.status(400);
    throw new Error("Invalid status. Must be IN_PROGRESS, RESOLVED, or CLOSED");
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: req.params.id },
  });
  if (!ticket) {
    res.status(404);
    throw new Error("Ticket not found");
  }

  const data = { status };
  if (status === "RESOLVED") data.resolvedAt = new Date();

  const updated = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data,
    include: TICKET_INCLUDE,
  });

  // Notify user of status change
  if (["RESOLVED", "CLOSED"].includes(status)) {
    notifyTicketStatusChanged(ticket.userId, ticket.id, ticket.subject, status);
  }

  res.json({ success: true, data: updated });
});
