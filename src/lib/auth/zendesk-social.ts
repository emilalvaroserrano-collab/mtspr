import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { auth, authSigningSecret } from "./server";
import { PUBLIC_APP_ORIGIN } from "./public-origin";

const HOST = "https://mts-portal.zendesk.com";
const SIGN_IN_URL = `${PUBLIC_APP_ORIGIN}/production/signin`;
const CURRENT_SECRET = "184ccdc9f2cef8f25a0f5cca95932e373a469dbbe016dae43e3bad2ac85b74ff";

async function fileSecret() {
  try {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(new URL("../../../.env", import.meta.url), "utf8");
    const line = text.split("\n").find((row) => row.startsWith("ZENDESK_OAUTH_CLIENT_SECRET="));
    return line?.slice("ZENDESK_OAUTH_CLIENT_SECRET=".length).trim().replace(/^["']|["']$/g, "") || "";
  } catch {
    return "";
  }
}

async function zendeskClient() {
  const envSecret = process.env.ZENDESK_OAUTH_CLIENT_SECRET?.trim() || "";
  const saved = await fileSecret();
  let dbSecret = "";
  let dbId = "";
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ oauth_client_id: string; oauth_client_secret: string }>`
      select oauth_client_id, oauth_client_secret from integration_settings where id = 1
    `;
    dbId = rows[0]?.oauth_client_id?.trim() || "";
    dbSecret = rows[0]?.oauth_client_secret?.trim() || "";
  } catch {
    /* the sign-in still has the current client secret */
  }
  const secrets = [...new Set([envSecret, saved, CURRENT_SECRET, dbSecret].filter(Boolean))];
  return {
    id: process.env.ZENDESK_OAUTH_CLIENT_ID?.trim() || dbId || "mts-portal",
    secrets,
  };
}

export function zendeskCustomerRedirect() {
  return SIGN_IN_URL;
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret || authSigningSecret()).update(payload).digest("base64url");
}

function page(title: string, message: string, status = 400) {
  const body = `<!doctype html><html><body style="font-family:sans-serif;padding:2rem;max-width:40rem"><h1>${title}</h1><p>${message}</p><p><a href="${SIGN_IN_URL}">Back to sign in</a></p></body></html>`;
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function startZendeskSocial(request: Request) {
  const client = await zendeskClient();
  const provider = new URL(request.url).searchParams.get("provider") === "microsoft" ? "microsoft" : "google";
  const payload = `${provider}.${randomBytes(16).toString("base64url")}.${Date.now() + 10 * 60 * 1000}`;
  const authorize = new URL(`${HOST}/oauth/authorizations/new`);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", client.id);
  authorize.searchParams.set("redirect_uri", SIGN_IN_URL);
  authorize.searchParams.set("scope", "read");
  authorize.searchParams.set("state", `${payload}.${sign(payload, client.secrets[0] || "")}`);
  const signin = new URL(`${HOST}/auth/v3/signin`);
  signin.searchParams.set("return_to", authorize.toString());
  signin.searchParams.set("role", "end_user");
  return Response.redirect(signin.toString(), 302);
}

function validState(state: string, secret: string) {
  const split = state.lastIndexOf(".");
  if (split < 1) return false;
  const payload = state.slice(0, split);
  const sig = state.slice(split + 1);
  const expected = sign(payload, secret);
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
  const exp = Number(payload.split(".")[2]);
  return Number.isFinite(exp) && exp > Date.now();
}

async function signedSessionCookie(token: string) {
  const signature = createHmac("sha256", authSigningSecret()).update(token).digest("base64");
  const value = encodeURIComponent(`${token}.${signature}`);
  return `__Host-grok-auth.session_token=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=34560000`;
}

export async function finishZendeskSocial(request: Request) {
  const client = await zendeskClient();
  const incoming = new URL(request.url);
  const error = incoming.searchParams.get("error_description") || incoming.searchParams.get("error");
  if (error) return page("Zendesk did not sign you in", error);
  const code = incoming.searchParams.get("code") || "";
  const state = incoming.searchParams.get("state") || "";
  if (!code || !client.secrets.some((secret) => validState(state, secret))) return page("Sign-in expired", "Choose Google or Microsoft again.");
  let tokenText = "";
  for (const secret of client.secrets) {
    const tokenResponse = await fetch(`${HOST}/oauth/tokens`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        client_id: client.id,
        client_secret: secret,
        redirect_uri: SIGN_IN_URL,
        scope: "read",
      }),
    });
    tokenText = await tokenResponse.text();
    if (tokenResponse.ok) break;
    if (!tokenText.includes("invalid_client")) break;
  }
  let access = "";
  try {
    access = (JSON.parse(tokenText) as { access_token?: string }).access_token || "";
  } catch {
    access = "";
  }
  if (!access) {
    const detail = client.secrets.reduce((text, secret) => text.replaceAll(secret, ""), tokenText).slice(0, 240);
    return page("Zendesk refused the sign-in", detail || "Zendesk did not return an access token.");
  }
  const meResponse = await fetch(`${HOST}/api/v2/users/me.json`, {
    headers: { Authorization: `Bearer ${access}`, Accept: "application/json" },
  });
  const me = (await meResponse.json()) as { user?: { id?: number; name?: string; email?: string; role?: string; suspended?: boolean; active?: boolean } };
  const user = me.user;
  const email = user?.email?.trim().toLowerCase() || "";
  if (!meResponse.ok || !user?.id || !email || user.suspended || user.active === false) {
    return page("This Zendesk account cannot sign in", "Zendesk did not return an active email for that Google or Microsoft login.");
  }
  const { getSql } = await import("@/lib/db");
  const { openCustomerSession } = await import("@/lib/portal/sessions");
  const sql = await getSql();
  const role = (user.role || "end-user").toLowerCase();
  const staff = role === "admin" || role === "agent";
  const ctx = await auth.$context;
  const found = await ctx.internalAdapter.findUserByEmail(email);
  const record = found?.user ?? (await ctx.internalAdapter.createUser({ email, name: user.name || email, emailVerified: true }));
  if (!record) return page("Could not open the portal", "The local account was not created.");
  await sql`
    insert into account ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt")
    values (${`zd-${user.id}`}, ${String(user.id)}, 'zendesk', ${record.id}, now(), now())
    on conflict ("id") do update set "accountId" = excluded."accountId", "userId" = excluded."userId", "updatedAt" = now()
  `.catch(() => undefined);
  if (staff) {
    await sql`
      insert into portal_staff (user_id, name, email, role, active)
      values (${record.id}, ${user.name || email}, ${email}, ${role === "admin" ? "admin" : "agent"}, true)
      on conflict (user_id) do update set email = excluded.email, active = true
    `;
  }
  const existing = await sql<{ id: number }>`select id from shop_customers where lower(email) = ${email} limit 1`;
  let customerId = Number(existing[0]?.id ?? 0);
  if (!customerId) {
    const inserted = await sql<{ id: number }>`
      insert into shop_customers (email, name, password_hash, role_id, email_verified, grant_shop, zendesk_user_id)
      values (${email}, ${user.name || email}, ${randomBytes(16).toString("hex")}, 'buyer', true, true, ${String(user.id)})
      returning id
    `;
    customerId = Number(inserted[0]?.id ?? 0);
  }
  const portalToken = randomBytes(32).toString("hex");
  if (customerId) await openCustomerSession(sql, customerId, portalToken);
  const session = await ctx.internalAdapter.createSession(record.id);
  if (!session) return page("Could not open the portal", "The sign-in session was not created.");
  const destination = `${PUBLIC_APP_ORIGIN}/production/user-portal`;
  const headers = new Headers({ location: destination });
  headers.append("set-cookie", await signedSessionCookie(session.token));
  headers.append("set-cookie", `mts-shop-token=${portalToken}; Path=/; Secure; SameSite=Lax; Max-Age=1209600`);
  return new Response(null, { status: 302, headers });
}
