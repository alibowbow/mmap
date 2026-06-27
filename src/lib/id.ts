// Stable id generation with a graceful fallback for environments
// where crypto.randomUUID is unavailable.
export function createId(prefix = "n"): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {
    // ignore and fall through to fallback
  }
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}${rand}`;
}
