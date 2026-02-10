// Simple in-memory rate limiter (no external dependency)
// For production at scale, replace with express-rate-limit + Redis store.

const requests = new Map();

export const rateLimit = ({ windowMs = 60000, max = 5 } = {}) => {
  // Cleanup stale entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of requests) {
      if (now - entry.startTime > windowMs) {
        requests.delete(key);
      }
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const key = req.ip + req.originalUrl;
    const now = Date.now();
    const entry = requests.get(key);

    if (!entry || now - entry.startTime > windowMs) {
      requests.set(key, { startTime: now, count: 1 });
      return next();
    }

    entry.count += 1;

    if (entry.count > max) {
      res.status(429).json({
        success: false,
        message: "Too many requests. Please try again later.",
      });
      return;
    }

    next();
  };
};
