export const MTS_AUTH_CLIENT = process.env.MTS_AUTH_CLIENT_ID?.trim() || "managetech";

// No hardcoded origin. `MTS_AUTH_ORIGIN` wins; default is production; `origin` arg preserved.
export function mtsAuthOrigin(): string {
  const env = (process.env.MTS_AUTH_ORIGIN || process.env.PUBLIC_APP_ORIGIN || "").trim().replace(/\/$/, "");
  return env || "https://portal.managetechservice.com";
}
export const MTS_AUTH_ORIGIN = mtsAuthOrigin();

export function oauthUrls(origin?: string) {
  const base = (origin ?? mtsAuthOrigin()).replace(/\/$/, "");
  return {
    authorizeUrl: `${base}/api/oauth/authorize`,
    tokenUrl: `${base}/api/oauth/token`,
  };
}

export function redirectAllowed(value: string) {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return url.protocol === "http:" || url.protocol === "https:";
    if (url.protocol !== "https:") return false;
    return host === "portal.managetechservice.com" || host.endsWith(".zendesk.com") || host.endsWith(".zdusercontent.com");
  } catch {
    return false;
  }
}
