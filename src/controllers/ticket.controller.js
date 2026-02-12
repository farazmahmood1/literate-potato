import asyncHandler from "express-async-handler";
import prisma from "../lib/prisma.js";

const TICKET_INCLUDE = {
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
      email: true,
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

// @desc    Create a new support ticket
// @route   POST /api/tickets
export const createTicket = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { subject, description, category } = req.body;

  const ticket = await prisma.supportTicket.create({
    data: { userId, subject, description, category },
    include: TICKET_INCLUDE,
  });

  res.status(201).json({ success: true, data: ticket });
});

// @desc    Get user's tickets (paginated, filterable)
// @route   GET /api/tickets
export const getMyTickets = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { status, page = 1, limit = 20 } = req.query;

  const where = { userId };
  if (status) where.status = status;

  const skip = (Number(page) - 1) * Number(limit);

  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      include: {
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

// @desc    Get single ticket with replies
// @route   GET /api/tickets/:id
export const getTicket = asyncHandler(async (req, res) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: req.params.id },
    include: TICKET_INCLUDE,
  });

  if (!ticket) {
    res.status(404);
    throw new Error("Ticket not found");
  }
  if (ticket.userId !== req.user.id) {
    res.status(403);
    throw new Error("Not authorized");
  }

  res.json({ success: true, data: ticket });
});

// @desc    User adds reply to their ticket
// @route   POST /api/tickets/:id/replies
export const addReply = asyncHandler(async (req, res) => {
  const userId = req.user.id;
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
  if (ticket.userId !== userId) {
    res.status(403);
    throw new Error("Not authorized");
  }
  if (ticket.status === "CLOSED") {
    res.status(400);
    throw new Error("Cannot reply to a closed ticket");
  }

  // If ticket was RESOLVED, reopen it when user replies
  const shouldReopen = ticket.status === "RESOLVED";

  const [reply] = await Promise.all([
    prisma.ticketReply.create({
      data: { ticketId: ticket.id, userId, message: message.trim(), isAdmin: false },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
      },
    }),
    shouldReopen
      ? prisma.supportTicket.update({
          where: { id: ticket.id },
          data: { status: "OPEN", resolvedAt: null },
        })
      : Promise.resolve(),
  ]);

  res.status(201).json({ success: true, data: reply });
});

// @desc    User closes their own ticket
// @route   PUT /api/tickets/:id/close
export const closeTicket = asyncHandler(async (req, res) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: req.params.id },
  });
  if (!ticket) {
    res.status(404);
    throw new Error("Ticket not found");
  }
  if (ticket.userId !== req.user.id) {
    res.status(403);
    throw new Error("Not authorized");
  }
  if (ticket.status === "CLOSED") {
    res.status(400);
    throw new Error("Ticket is already closed");
  }

  const updated = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { status: "CLOSED" },
    include: TICKET_INCLUDE,
  });

  res.json({ success: true, data: updated });
});
