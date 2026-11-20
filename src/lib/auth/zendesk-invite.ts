type ZendeskInvite = { email: string; name: string; id: string };

export type ZendeskDesk = { subdomain: string; authorization: string };

const subdomain = process.env.ZENDESK_SUBDOMAIN?.trim() || "mts-portal";
const clientId = process.env.ZENDESK_OAUTH_CLIENT_ID?.trim() || "mts-portal";

let tokenCache: { token: string; expiresAt: number } | null = null;

function cleanHost(value: string) {
  return value.trim().replace(/^https?:\/\//i, "").replace(/\.zendesk\.com.*$/i, "").replace(/\/.*$/, "") || "mts-portal";
}

async function savedOauthSecret() {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ oauth_client_secret: string }>`
      select oauth_client_secret from integration_settings where id = 1
    `;
    return rows[0]?.oauth_client_secret?.trim() || "";
  } catch {
    return "";
  }
}

export async function zendeskDesk(): Promise<ZendeskDesk | null> {
  let email = (process.env.ZENDESK_EMAIL || process.env.ZENDESK_AGENT_EMAIL || "").trim();
  let apiToken = (process.env.ZENDESK_API_TOKEN || process.env.ZENDESK_TOKEN || process.env.ZENDESK_API_KEY || "").trim();
  let host = subdomain;
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ subdomain: string; email: string; api_token: string }>`
      select subdomain, email, api_token from integration_settings where id = 1
    `;
    const row = rows[0];
    if (row?.email?.trim() && row.api_token?.trim()) {
      email = row.email.trim();
      apiToken = row.api_token.trim();
      if (row.subdomain?.trim()) host = cleanHost(row.subdomain);
    }
  } catch {
    /* env credentials still apply */
  }
  if (!email || !apiToken) return null;
  return {
    subdomain: cleanHost(host),
    authorization: `Basic ${Buffer.from(`${email}/token:${apiToken}`, "utf8").toString("base64")}`,
  };
}

async function zendeskToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 15_000) return tokenCache.token;
  const secrets = [...new Set([process.env.ZENDESK_OAUTH_CLIENT_SECRET?.trim() || "", await savedOauthSecret()].filter(Boolean))];
  if (!secrets.length) throw new Error("Invitation check is unavailable.");
  const hosts = [...new Set([subdomain || "mts-portal", "mts-portal"])];
  let last = "Invitation check is unavailable.";
  for (const clientSecret of secrets) {
    for (const host of hosts) {
      const response = await fetch(`https://${host}.zendesk.com/oauth/tokens`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
          scope: "read write",
        }),
      });
      const text = await response.text();
      if (!response.ok) {
        last = `Zendesk OAuth returned ${response.status}.`;
        if (response.status === 404) continue;
        continue;
      }
      const parsed = JSON.parse(text) as { access_token?: string; expires_in?: number };
      if (!parsed.access_token) continue;
      const ttl = typeof parsed.expires_in === "number" && parsed.expires_in > 60 ? parsed.expires_in * 1000 : 30 * 60 * 1000;
      tokenCache = { token: parsed.access_token, expiresAt: Date.now() + ttl };
      return parsed.access_token;
    }
  }
  throw new Error(last);
}

export function zendeskSupportToken() {
  return zendeskToken();
}

async function authorizationHeader() {
  const desk = await zendeskDesk();
  if (desk) return { authorization: desk.authorization, host: desk.subdomain };
  return { authorization: `Bearer ${await zendeskToken()}`, host: subdomain };
}

export async function findZendeskInvite(email: string): Promise<ZendeskInvite | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return null;
  try {
    const auth = await authorizationHeader();
    const response = await fetch(`https://${auth.host}.zendesk.com/api/v2/users/search.json?query=${encodeURIComponent(`type:user email:${normalized}`)}`, {
      headers: { Accept: "application/json", Authorization: auth.authorization },
    });
    if (response.ok) {
      const body = (await response.json()) as {
        users?: { id?: number; email?: string; name?: string; active?: boolean; suspended?: boolean }[];
      };
      const match = (body.users ?? []).find((user) => user.email?.trim().toLowerCase() === normalized);
      if (!match || match.suspended || match.active === false || match.id == null) return null;
      return { email: normalized, name: match.name?.trim() || normalized, id: String(match.id) };
    }
    if (response.status === 401 || response.status === 403) {
      const mine = await ownZendeskUser(normalized, auth);
      if (mine) return mine;
    }
  } catch {
    /* The saved Zendesk credential was refused. A portal account can still sign in. */
  }
  return localInvite(normalized);
}

async function ownZendeskUser(email: string, auth: { authorization: string; host: string }): Promise<ZendeskInvite | null> {
  const response = await fetch(`https://${auth.host}.zendesk.com/api/v2/users/me.json`, {
    headers: { Accept: "application/json", Authorization: auth.authorization },
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { user?: { id?: number; email?: string; name?: string; active?: boolean; suspended?: boolean } };
  const user = body.user;
  if (!user || user.id == null || user.email?.trim().toLowerCase() !== email || user.suspended || user.active === false) return null;
  return { email, name: user.name?.trim() || email, id: String(user.id) };
}

async function localInvite(email: string): Promise<ZendeskInvite | null> {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const customers = await sql<{ name: string; email: string }>`
      select name, email from shop_customers where lower(email) = ${email}
      union all
      select name, email from customer_users where lower(email) = ${email}
      limit 1
    `;
    if (customers[0]?.email) return { email, name: customers[0].name?.trim() || email, id: "" };
    const users = await sql<{ name: string; email: string }>`select name, email from "user" where lower(email) = ${email} limit 1`;
    if (users[0]?.email) return { email, name: users[0].name?.trim() || email, id: "" };
  } catch {
    return null;
  }
  return null;
}

export async function sendZendeskPasswordCode(invited: ZendeskInvite, code: string) {
  const desk = await zendeskDesk();
  if (!desk) throw new Error("Add the Zendesk agent email and API token in the admin portal.");
  if (!/^\d+$/.test(invited.id)) throw new Error("This email is not registered in Zendesk.");
  const ticket = {
    subject: "Your Manage Tech Service verification code",
    requester_id: Number(invited.id),
    tags: ["password-code"],
    comment: {
      public: true,
      body: `Your verification code is ${code}. It expires in 15 minutes. Enter it on the Manage Tech Service sign-in page. If you did not ask for this, ignore this email.`,
    },
  };
  const send = (status?: string) =>
    fetch(`https://${desk.subdomain}.zendesk.com/api/v2/tickets.json`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: desk.authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ ticket: status ? { ...ticket, status } : ticket }),
    });
  const solved = await send("solved");
  if (solved.ok) return;
  const open = await send();
  if (open.ok) return;
  throw new Error("Zendesk could not send the verification email.");
}
