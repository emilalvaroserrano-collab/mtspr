import { createHash } from "node:crypto";
import type { Sql } from "@/lib/db";

type Row = Record<string, unknown>;

export type PortalSessionView = {
  id: number;
  label: string;
  ip: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
};

function text(row: Row, key: string) {
  const value = row[key];
  return value == null ? "" : String(value);
}

function number(row: Row, key: string) {
  const value = Number(row[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function deviceLabel(agent: string) {
  const value = agent.toLowerCase();
  const device = /iphone/.test(value) ? "iPhone" : /ipad/.test(value) ? "iPad" : /android/.test(value) ? "Android" : /mac os/.test(value) ? "Mac" : /windows/.test(value) ? "Windows" : "Browser";
  const browser = /edg\//.test(value) ? "Edge" : /chrome\//.test(value) ? "Chrome" : /safari\//.test(value) && !/chrome/.test(value) ? "Safari" : /firefox\//.test(value) ? "Firefox" : "";
  return browser ? `${device} · ${browser}` : device;
}

async function requestMeta() {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const agent = (request.headers.get("user-agent") || "").slice(0, 240);
    const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0]?.trim().slice(0, 64) || "";
    return { agent, ip, label: deviceLabel(agent) };
  } catch {
    return { agent: "", ip: "", label: "Browser" };
  }
}

export async function openCustomerSession(sql: Sql, customerId: number, token: string) {
  const hash = hashSessionToken(token);
  const meta = await requestMeta();
  await sql`
    update portal_sessions
    set revoked_at = now()
    where shop_customer_id = ${customerId}
      and revoked_at is null
      and id not in (
        select id from portal_sessions
        where shop_customer_id = ${customerId} and revoked_at is null
        order by last_seen_at desc
        limit 7
      )
  `;
  await sql`
    insert into portal_sessions (shop_customer_id, token_hash, user_agent, ip, label, expires_at)
    values (${customerId}, ${hash}, ${meta.agent}, ${meta.ip}, ${meta.label}, now() + interval '14 days')
    on conflict (token_hash) do update set
      revoked_at = null,
      last_seen_at = now(),
      expires_at = now() + interval '14 days',
      label = excluded.label,
      ip = excluded.ip,
      user_agent = excluded.user_agent
  `;
  await sql`
    update shop_customers
    set session_token = ${token}, session_expires = now() + interval '14 days'
    where id = ${customerId}
  `;
}

export async function customerBySession(sql: Sql, token: string) {
  const value = token.trim();
  if (!value) return undefined;
  const hash = hashSessionToken(value);
  const rows = await sql<Row>`
    select c.*, s.id as session_id
    from portal_sessions s
    join shop_customers c on c.id = s.shop_customer_id
    where s.token_hash = ${hash} and s.revoked_at is null and s.expires_at > now()
    limit 1
  `;
  if (rows[0]) {
    await sql`
      update portal_sessions
      set last_seen_at = now(),
          expires_at = least(created_at + interval '30 days', now() + interval '14 days')
      where id = ${number(rows[0], "session_id")} and revoked_at is null
    `;
    return rows[0];
  }
  const legacy = await sql<Row>`
    select * from shop_customers
    where session_token = ${value} and session_expires > now()
    limit 1
  `;
  if (!legacy[0]) return undefined;
  await openCustomerSession(sql, number(legacy[0], "id"), value);
  return legacy[0];
}

export async function listCustomerSessions(sql: Sql, token: string): Promise<PortalSessionView[]> {
  const customer = await customerBySession(sql, token);
  if (!customer) return [];
  const current = hashSessionToken(token.trim());
  const rows = await sql<Row>`
    select id, label, ip, created_at, last_seen_at, token_hash
    from portal_sessions
    where shop_customer_id = ${number(customer, "id")} and revoked_at is null and expires_at > now()
    order by last_seen_at desc
  `;
  return rows.map((row) => ({
    id: number(row, "id"),
    label: text(row, "label") || "Browser",
    ip: text(row, "ip"),
    createdAt: text(row, "created_at"),
    lastSeenAt: text(row, "last_seen_at"),
    current: text(row, "token_hash") === current,
  }));
}

export async function revokeCustomerSession(sql: Sql, token: string, sessionId: number) {
  const customer = await customerBySession(sql, token);
  if (!customer) throw new Error("Sign in again.");
  const rows = await sql<Row>`
    select token_hash from portal_sessions
    where id = ${sessionId} and shop_customer_id = ${number(customer, "id")} and revoked_at is null
    limit 1
  `;
  if (!rows[0]) throw new Error("That session is already closed.");
  await sql`update portal_sessions set revoked_at = now() where id = ${sessionId}`;
  const current = text(rows[0], "token_hash") === hashSessionToken(token.trim());
  if (current) {
    await sql`update shop_customers set session_token = '', session_expires = now() where id = ${number(customer, "id")} and session_token = ${token.trim()}`;
  }
  return { current };
}

export async function revokeOtherCustomerSessions(sql: Sql, token: string) {
  const customer = await customerBySession(sql, token);
  if (!customer) throw new Error("Sign in again.");
  const current = hashSessionToken(token.trim());
  await sql`
    update portal_sessions
    set revoked_at = now()
    where shop_customer_id = ${number(customer, "id")} and revoked_at is null and token_hash <> ${current}
  `;
  return { ok: true };
}

export async function revokeCurrentCustomerSession(sql: Sql, token: string) {
  const value = token.trim();
  if (!value) return;
  const hash = hashSessionToken(value);
  await sql`update portal_sessions set revoked_at = now() where token_hash = ${hash} and revoked_at is null`;
  await sql`update shop_customers set session_token = '', session_expires = now() where session_token = ${value}`;
}
