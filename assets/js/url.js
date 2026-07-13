export function safeHttpUrl(value, allowedHosts = []) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return "";
    if (url.username || url.password) return "";
    if (allowedHosts.length && !allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return "";
    return url.href;
  } catch {
    return "";
  }
}
