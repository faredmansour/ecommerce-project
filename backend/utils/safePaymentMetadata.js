const ALLOWED_KEYS = new Set(["requestId", "correlationId", "channel"]);
const ALLOWED_CHANNELS = new Set(["web", "admin", "system"]);

function isSafePaymentMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, item]) => {
    if (!ALLOWED_KEYS.has(key) || typeof item !== "string" || item.length > 128) return false;
    return key !== "channel" || ALLOWED_CHANNELS.has(item);
  });
}

module.exports = { isSafePaymentMetadata };
