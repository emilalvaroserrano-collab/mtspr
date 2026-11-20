const TOKEN = /^[A-Za-z0-9_-]{8,128}$/;

export function sharedEmailToken(pathname: string) {
  const match = pathname.match(/^\/verification\/shared_email\/([^/]+)\/?$/);
  if (!match) return "";
  try {
    const token = decodeURIComponent(match[1]);
    return TOKEN.test(token) ? token : "";
  } catch {
    return "";
  }
}

export async function verifySharedEmail(token: string) {
  const host = (process.env.ZENDESK_SUBDOMAIN || "mts-portal").replace(/[^a-z0-9-]/gi, "") || "mts-portal";
  const response = await fetch(`https://${host}.zendesk.com/verification/shared_email/${encodeURIComponent(token)}`, {
    redirect: "manual",
    headers: { Accept: "text/html" },
  });
  const location = response.headers.get("location") || "";
  const body = response.status >= 300 ? "" : await response.text();
  if (/email verified|has been verified/i.test(body) || /verified/i.test(location)) return "verified";
  if (/expired|could not|couldn|invalid/i.test(body)) return "expired";
  return "checked";
}

export function verificationRedirect(result: string) {
  if (result === "verified") return "/production/signin?verified=1";
  if (result === "expired") return "/production/signin?verified=expired";
  return "/production/signin";
}
