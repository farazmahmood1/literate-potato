import pkg from "agora-token";
const { RtcTokenBuilder, RtcRole } = pkg;

const AGORA_APP_ID = process.env.AGORA_APP_ID;
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

/**
 * Generate an Agora RTC token for a given channel + UID.
 * @param {string} channelName — unique channel (we use the callId)
 * @param {number} uid — integer UID (0 = server-assigned, or hash of userId)
 * @param {"publisher"|"subscriber"} role
 * @param {number} [expirationSeconds=3600] — token lifetime in seconds
 * @returns {string} RTC token
 */
export function generateRtcToken(
  channelName,
  uid,
  role = "publisher",
  expirationSeconds = 3600
) {
  if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
    throw new Error("Missing AGORA_APP_ID or AGORA_APP_CERTIFICATE in env");
  }

  const rtcRole =
    role === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

  const currentTime = Math.floor(Date.now() / 1000);
  const privilegeExpireTime = currentTime + expirationSeconds;

  return RtcTokenBuilder.buildTokenWithUid(
    AGORA_APP_ID,
    AGORA_APP_CERTIFICATE,
    channelName,
    uid,
    rtcRole,
    privilegeExpireTime,
    privilegeExpireTime
  );
}

export { AGORA_APP_ID };
