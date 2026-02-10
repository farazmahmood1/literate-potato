// In-memory OTP store with automatic TTL cleanup
// Used for email OTP (phone OTP is managed by Twilio Verify)

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

const store = new Map();

export const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const storeOtp = (key, code) => {
  // Clear any existing entry for this key
  clearOtp(key);

  const timer = setTimeout(() => {
    store.delete(key);
  }, OTP_EXPIRY_MS);

  store.set(key, {
    code,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    attempts: 0,
    timer,
  });
};

export const verifyOtp = (key, code) => {
  const entry = store.get(key);

  if (!entry) {
    return { valid: false, reason: "No OTP found. Please request a new code." };
  }

  if (Date.now() > entry.expiresAt) {
    clearOtp(key);
    return {
      valid: false,
      reason: "OTP has expired. Please request a new code.",
    };
  }

  entry.attempts += 1;

  if (entry.attempts > MAX_ATTEMPTS) {
    clearOtp(key);
    return {
      valid: false,
      reason: "Too many failed attempts. Please request a new code.",
    };
  }

  if (entry.code !== code) {
    return { valid: false, reason: "Invalid code. Please try again." };
  }

  // Success - clean up
  clearOtp(key);
  return { valid: true };
};

export const clearOtp = (key) => {
  const entry = store.get(key);
  if (entry) {
    clearTimeout(entry.timer);
    store.delete(key);
  }
};
