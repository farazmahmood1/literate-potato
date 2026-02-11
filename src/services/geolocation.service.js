import geoip from "geoip-lite";

/**
 * Resolve state and city from an IP address.
 * Uses bundled MaxMind GeoLite2 database — no API calls.
 */
export function getLocationFromIp(ip) {
  if (!ip) return { state: null, city: null };

  // Strip IPv6 prefix from IPv4-mapped addresses
  const cleanIp = ip.replace(/^::ffff:/, "");

  // Skip private/localhost IPs
  if (
    cleanIp === "127.0.0.1" ||
    cleanIp === "::1" ||
    cleanIp.startsWith("192.168.") ||
    cleanIp.startsWith("10.") ||
    cleanIp.startsWith("172.16.")
  ) {
    return { state: null, city: null };
  }

  const geo = geoip.lookup(cleanIp);

  if (!geo || geo.country !== "US") {
    return { state: null, city: null };
  }

  return {
    state: geo.region || null, // 2-letter state code, e.g. "CA"
    city: geo.city || null,
  };
}

/**
 * Extract client IP from Express request.
 * Handles X-Forwarded-For (Vercel/proxies), Cloudflare, and direct connection.
 */
export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers["x-real-ip"] || req.ip || req.connection?.remoteAddress || null;
}
