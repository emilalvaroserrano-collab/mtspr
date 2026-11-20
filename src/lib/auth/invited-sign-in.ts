import { createHash, randomInt, randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { hashPassword } from "better-auth/crypto";

function emailOf(input: unknown) {
  const raw = input && typeof input === "object" ? (input as { email?: unknown }) : {};
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  if (!email.includes("@")) throw new Error("Enter the email from your invitation.");
  return email;
}

export const customerSocialAuth = createServerFn({ method: "GET" }).handler(async () => ({
  google: "zendesk",
  microsoft: "zendesk",
}));

export const signInWithInvitation = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as { email?: unknown; password?: unknown }) : {};
    const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
    const password = typeof raw.password === "string" ? raw.password : "";
    if (!email.includes("@") || password.length < 8) throw new Error("Enter the email and password from your invitation.");
    return { email, password };
  })
  .handler(async ({ data }) => {
    const { getRequestHeaders } = await import("@tanstack/react-start/server");
    const { auth } = await import("./server");
    const { findZendeskInvite } = await import("./zendesk-invite");
    const invited = await findZendeskInvite(data.email);
    if (!invited) throw new Error("Check the email from your invitation and try again.");
    const headers = getRequestHeaders();
    try {
      await auth.api.signInEmail({
        body: { email: invited.email, password: data.password, rememberMe: true },
        headers,
      });
      return { ok: true as const };
    } catch {
      try {
        await auth.api.signUpEmail({
          body: { email: invited.email, password: data.password, name: invited.name },
          headers,
        });
        return { ok: true as const };
      } catch {
        throw new Error("Email or password is incorrect.");
      }
    }
  });

async function mailer() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

export const requestPortalPassword = createServerFn({ method: "POST" })
  .validator((input: unknown) => ({ email: emailOf(input) }))
  .handler(async ({ data }) => {
    const { findZendeskInvite, sendZendeskPasswordCode, zendeskDesk } = await import("./zendesk-invite");
    if (!(await zendeskDesk())) throw new Error("Add the Zendesk agent email and API token in the admin portal.");
    const invited = await findZendeskInvite(data.email);
    if (!invited?.id) throw new Error("This email is not registered.");
    const sql = await mailer();
    const code = String(randomInt(100000, 1000000));
    await sendZendeskPasswordCode(invited, code);
    const identifier = `reset:${invited.email}`;
    await sql`delete from verification where identifier = ${identifier}`;
    await sql`
      insert into verification (id, identifier, value, "expiresAt", "createdAt", "updatedAt")
      values (${randomUUID()}, ${identifier}, ${JSON.stringify({ hash: createHash("sha256").update(code).digest("hex"), attempts: 0 })}, now() + interval '15 minutes', now(), now())
    `;
    return { ok: true as const };
  });

export const confirmPortalPassword = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as { email?: unknown; code?: unknown; password?: unknown }) : {};
    const email = emailOf(raw);
    const code = typeof raw.code === "string" ? raw.code.replace(/\s/g, "") : "";
    const password = typeof raw.password === "string" ? raw.password : "";
    if (!/^\d{6}$/.test(code)) throw new Error("Enter the 6-digit code from the email.");
    if (password.length < 8) throw new Error("Use at least 8 characters.");
    return { email, code, password };
  })
  .handler(async ({ data }) => {
    const { findZendeskInvite } = await import("./zendesk-invite");
    const invited = await findZendeskInvite(data.email);
    if (!invited) throw new Error("This email is not registered.");
    const sql = await mailer();
    const identifier = `reset:${invited.email}`;
    const rows = await sql<{ id: string; value: string; expiresAt: string | Date }>`
      select id, value, "expiresAt" from verification where identifier = ${identifier} order by "createdAt" desc limit 1
    `;
    const row = rows[0];
    if (!row || new Date(row.expiresAt).getTime() < Date.now()) {
      throw new Error("That code has expired. Request a new one.");
    }
    const stored = JSON.parse(row.value) as { hash?: string; attempts?: number };
    const attempts = Number(stored.attempts) || 0;
    if (attempts >= 5) {
      await sql`delete from verification where identifier = ${identifier}`;
      throw new Error("Too many attempts. Request a new code.");
    }
    const hash = createHash("sha256").update(data.code).digest("hex");
    if (hash !== stored.hash) {
      await sql`update verification set value = ${JSON.stringify({ hash: stored.hash, attempts: attempts + 1 })}, "updatedAt" = now() where id = ${row.id}`;
      throw new Error("That code is not correct.");
    }
    await sql`delete from verification where identifier = ${identifier}`;
    const passwordHash = await hashPassword(data.password);
    const users = await sql<{ id: string }>`select id from "user" where lower(email) = ${invited.email} limit 1`;
    const user = users[0];
    if (user) {
      const accounts = await sql<{ id: string }>`
        select id from account where "userId" = ${user.id} and "providerId" = 'credential' limit 1
      `;
      if (accounts[0]) {
        await sql`update account set password = ${passwordHash}, "updatedAt" = now() where id = ${accounts[0].id}`;
      } else {
        await sql`
          insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
          values (${randomUUID()}, ${user.id}, 'credential', ${user.id}, ${passwordHash}, now(), now())
        `;
      }
      return { ok: true as const };
    }
    const { getRequestHeaders } = await import("@tanstack/react-start/server");
    const { auth } = await import("./server");
    await auth.api.signUpEmail({
      body: { email: invited.email, password: data.password, name: invited.name },
      headers: getRequestHeaders(),
    });
    return { ok: true as const };
  });
