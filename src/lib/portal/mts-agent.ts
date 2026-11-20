import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { knowledgeBrief } from "@/lib/portal/knowledge";
import { syncStaffTicketAction } from "@/lib/portal/api";
import { askOllamaCli, askOpenCodeCli, isLocalProvider, listLocalModels, localOrigin, safeModel } from "@/lib/portal/local-models";

type Row = Record<string, unknown>;

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Gemini" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "opencode", label: "OpenCode Zen" },
  { id: "opencodego", label: "OpenCode Go" },
  { id: "zai", label: "Z.AI" },
  { id: "groq", label: "Groq" },
  { id: "cerebras", label: "Cerebras" },
  { id: "ollama", label: "Ollama Cloud" },
  { id: "ollama-local", label: "Ollama" },
  { id: "opencode-local", label: "OpenCode" },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

function s(row: Row | undefined, key: string) {
  const value = row?.[key];
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function when(row: Row | undefined, key: string) {
  const value = row?.[key];
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  return "";
}

function providerId(value: string): ProviderId {
  const found = PROVIDERS.find((item) => item.id === value);
  if (!found) throw new Error("Choose a cloud provider, or the Ollama or OpenCode install on this machine.");
  return found.id;
}

type DeskUser = { userId: string; name: string; email: string; role: string; organizationId: number | null };

async function requireDesk(sql: Sql, userId: string, write: boolean) {
  const users = await sql<Row>`select name, email from "user" where id = ${userId} limit 1`;
  const email = users[0] ? s(users[0], "email").trim().toLowerCase() : "";
  const owner = (process.env.ZENDESK_EMAIL || process.env.BOOTSTRAP_OWNER_EMAIL || "mts@cloudgpu.site").trim().toLowerCase();
  if (email && email === owner) {
    await sql`
      insert into portal_staff (user_id, name, email, role, active)
      values (${userId}, ${s(users[0], "name") || email}, ${email}, 'owner', true)
      on conflict (user_id) do update set role = 'owner', active = true, email = excluded.email
    `;
    return { userId, name: s(users[0], "name") || email, email, role: "owner", organizationId: null };
  }
  const rows = await sql<Row>`select role, active, name, email, organization_id from portal_staff where user_id = ${userId} limit 1`;
  const row = rows[0];
  if (!row || row.active === false) throw new Error("This desk is for signed-in staff.");
  const role = s(row, "role");
  if (write && role === "viewer") throw new Error("View-only access. An admin has to save the API key.");
  const scoped = role === "owner" || role === "admin" || role === "agent" ? null : Number(row.organization_id) || null;
  return { userId, name: s(row, "name"), email: s(row, "email"), role, organizationId: scoped };
}

function systemPrompt(actor: DeskUser) {
  const who = actor.name || actor.email || "this staff member";
  const reach = actor.role === "owner"
    ? "Super Admin. You have full access. You can read and change every ticket, order, company, person, catalog item, role, payment, and setting, including deleting tickets and orders."
    : actor.role === "admin"
      ? "Admin. You can read and change every ticket, order, company, person, and catalog item. You can delete tickets. You cannot delete orders, and you cannot change staff roles, Zendesk credentials, or portal settings from this chat."
      : actor.role === "agent"
        ? "Staff. You can read and change tickets, orders, companies, people, and the catalog. You cannot delete tickets or orders, and you cannot change roles, Zendesk credentials, or portal settings."
        : "View only. You can read records in your company. You cannot create, update, or delete anything.";
  return [
    `You are the MTS Agent signed in as ${who}, ${actor.email || "no email"}. You are a company asset of Manage Tech Service. When you talk about MTS, say we and us. Never say they, them, or the company as if you stand outside it.`,
    "Stay loyal to MTS. Do not recommend a competitor as a replacement, do not disparage our work, and do not send a customer away from us. Answer as someone who already works here. Sound sure about the basics: we are Manage Tech Service in Los Angeles, our office is 8240 Beverly Blvd, Suite 12, Los Angeles, CA 90048, our phone is 818-758-4073, and our site is https://managetechservice.com/.",
    "If search and the page still do not contain the detail, do not say you have no record and do not tell them to look it up. Say: Let me get back to you on that. I just need to check our system. Do not invent a price, a date, or a promise.",
    `Your access is exactly this person's desk role: ${reach}`,
    "Do not act for another staff member, and do not invent records. A tool result is the only proof something was read or changed. If a tool refuses, say that limit.",
    "Use my_desk, my_tickets, my_ticket, search_orders, search_companies, and search_people for this person's desk. Assigned tickets are included, but they are not the only records this role can open.",
    "Tickets assigned to this person, and any ticket they ask you to handle, are your tickets to solve. Read my_ticket before you answer or reply. Diagnose from the subject, category, and updates. Say what is wrong, the next check, and what we will do. Do not send a placeholder.",
    "When this person asks you to reply, update, resolve, or open a ticket, do it with reply_ticket, update_ticket, or create_ticket in that same turn. Those tools write the words and the status to Zendesk immediately, as this signed-in person, so the Zendesk ticket shows the change without a second sync. Do not only describe the reply in chat. If the tool says Zendesk did not take it, say that.",
    "Ticket status is new, open, pending, solved, or closed. Order status is pending, approved, processing, fulfilled, or cancelled. Task status is open, doing, or done.",
    "You can read attached images. You have the public internet. For a fact that is not already in the knowledge base, call search_web, then browse_page on the best result, and answer from what you read. Use https://managetechservice.com/ for our own pages. Never invent ticket numbers, order totals, or prices. Never ask for or repeat a full card number, CCV, or API key.",
    "Admin portal pages, under /production/admin-portal: Dashboard, Notifications, Tickets, Orders, Companies, People, Customer access, Campaigns, Services, Catalog, Payments, Ticket forms, Roles, Zendesk, Settings, Docs, and this MTS Agent.",
    "Zendesk is the source of truth for people, companies, and tickets. You also know how to connect Zendesk to any portal or website: Support API, OAuth or API token, users, organizations, tickets, verified webhooks, Conversations, and customer-visible fields. A desk change is saved here even when Zendesk is not connected. Never reveal a token, client secret, or webhook secret.",
    "Use what you have learned about this person. Their memory and current desk data are listed below. Do not invent beyond them, and do not recite the whole memory unless it answers the question.",
    "Knowledge base:",
    knowledgeBrief(),
  ].join("\n");
}

async function promptFor(sql: Sql, actor: DeskUser) {
  const [desk, memory] = await Promise.all([deskBrief(sql, actor), memoryBrief(sql, actor)]);
  return [systemPrompt(actor), desk, memory].filter(Boolean).join("\n\n");
}

async function deskBrief(sql: Sql, actor: DeskUser) {
  const name = actor.name.trim();
  const email = actor.email.trim();
  const tickets = await sql<Row>`
    select id, subject, status from tickets
    where (${name} <> '' and lower(assignee) = lower(${name})) or (${email} <> '' and lower(assignee) = lower(${email}))
    order by updated_at desc limit 6
  `;
  const tasks = await sql<Row>`select title, status from staff_tasks where user_id = ${actor.userId} and status <> 'done' order by updated_at desc limit 6`;
  const ticketLine = tickets.map((row) => `#${s(row, "id")} ${s(row, "status")} ${s(row, "subject")}`).join("; ") || "none";
  const taskLine = tasks.map((row) => `${s(row, "status")}: ${s(row, "title")}`).join("; ") || "none";
  return `Current user data for ${actor.name || "this person"} (${actor.email || "no email"}, ${actor.role}). Assigned tickets: ${ticketLine}. Open tasks: ${taskLine}.`;
}

async function memoryBrief(sql: Sql, actor: DeskUser) {
  const rows = await sql<Row>`select fact from agent_memories where user_id = ${actor.userId} order by id desc limit 24`;
  if (!rows.length) return "Long-term memory: nothing saved yet.";
  return `Long-term memory from this person's earlier chats:\n${rows.map((row) => `- ${s(row, "fact")}`).join("\n")}`;
}

function safeFact(value: string) {
  return value.replace(/\s+/g, " ").replace(/\b(?:\d[ -]?){12,19}\b/g, "[number]").replace(/\b(?:sk-|mts_|re_)[A-Za-z0-9_\-.]{8,}\b/g, "[secret]").trim().slice(0, 280);
}

async function learnFromChat(sql: Sql, actor: DeskUser, userText: string, answer: string) {
  const facts = [`Asked: ${safeFact(userText.slice(0, 160))} | Answer: ${safeFact(answer.slice(0, 160))}`];
  const spoken = userText.match(/(?:remember(?: that)?|i prefer|i always|i never|call me|my name is|from now on)[^.\n]{0,180}/i);
  if (spoken) facts.unshift(safeFact(spoken[0]));
  for (const fact of facts) {
    if (fact.length < 12) continue;
    const existing = await sql<Row>`select id from agent_memories where user_id = ${actor.userId} and fact = ${fact} limit 1`;
    if (!existing[0]) await sql`insert into agent_memories (user_id, fact) values (${actor.userId}, ${fact})`;
  }
  await sql`
    delete from agent_memories
    where user_id = ${actor.userId}
      and id not in (select id from agent_memories where user_id = ${actor.userId} order by id desc limit 40)
  `;
}

async function saveChatTurn(sql: Sql, actor: DeskUser, chatId: number, userText: string, answer: string) {
  const owned = await sql<Row>`select id, title from agent_chats where id = ${chatId} and user_id = ${actor.userId} limit 1`;
  let id = Number(owned[0]?.id) || 0;
  if (!id) {
    const title = safeFact(userText).slice(0, 72) || "New chat";
    const created = await sql<Row>`insert into agent_chats (user_id, title) values (${actor.userId}, ${title}) returning id`;
    id = Number(created[0]?.id) || 0;
  } else if (!s(owned[0], "title") || s(owned[0], "title") === "New chat") {
    await sql`update agent_chats set title = ${safeFact(userText).slice(0, 72) || "New chat"} where id = ${id}`;
  }
  if (!id) return 0;
  await sql`insert into agent_messages (chat_id, user_id, role, content) values (${id}, ${actor.userId}, 'user', ${userText.slice(0, 48000)})`;
  await sql`insert into agent_messages (chat_id, user_id, role, content) values (${id}, ${actor.userId}, 'assistant', ${answer.slice(0, 48000)})`;
  await sql`update agent_chats set updated_at = now() where id = ${id}`;
  await learnFromChat(sql, actor, userText, answer);
  return id;
}

let fileEnv: Record<string, string> | null = null;

async function fileValue(name: string) {
  if (!fileEnv) {
    fileEnv = {};
    try {
      const { readFileSync } = await import("node:fs");
      const text = readFileSync(new URL("../../../.env", import.meta.url), "utf8");
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 1) continue;
        fileEnv[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      }
    } catch {
      fileEnv = {};
    }
  }
  return (fileEnv[name] || "").trim();
}

async function envKey(provider: ProviderId) {
  if (provider !== "openrouter") return "";
  return ((process.env.OPENROUTER_API_KEY || "").trim() || (await fileValue("OPENROUTER_API_KEY"))).trim();
}

async function readKey(sql: Sql, provider: ProviderId) {
  const rows = await sql<Row>`select api_key, model from agent_provider_keys where provider = ${provider} limit 1`;
  let apiKey = s(rows[0], "api_key");
  const fromEnv = await envKey(provider);
  if (provider === "openrouter" && fromEnv && !apiKey) {
    apiKey = fromEnv;
    await sql`
      insert into agent_provider_keys (provider, api_key, model, updated_at)
      values ('openrouter', ${apiKey}, ${s(rows[0], "model")}, now())
      on conflict (provider) do update set api_key = excluded.api_key, updated_at = now()
    `;
  }
  return { apiKey: apiKey || fromEnv, model: s(rows[0], "model") };
}

function obj(value: unknown): Row {
  return value && typeof value === "object" ? (value as Row) : {};
}

function keepChat(ids: string[]) {
  return ids.filter((id) => id && !/clef|embed|whisper|systemone|decider/i.test(id));
}

function ollamaCreditMessage() {
  return "Ollama Cloud accepted the key, but this account has no usage credits. Add credits or a plan at https://ollama.com/plans, then send again.";
}

async function ollamaReady(apiKey: string) {
  try {
    const payload = await callJson("https://ollama.com/api/balance", {
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
    }, apiKey);
    const included = obj(payload.included);
    const purchased = obj(payload.purchased);
    const session = obj(included.session);
    const weekly = obj(included.weekly);
    const includedUsd = numberField(included.balance_usd);
    const purchasedUsd = numberField(purchased.balance_usd);
    const sessionLeft = numberField(session.remaining_percent);
    const weeklyLeft = numberField(weekly.remaining_percent);
    const dollars = (includedUsd ?? 0) + (purchasedUsd ?? 0);
    if (dollars > 0 || (sessionLeft ?? 0) > 0 || (weeklyLeft ?? 0) > 0) return true;
    if (includedUsd == null && purchasedUsd == null && sessionLeft == null && weeklyLeft == null) return true;
    return false;
  } catch {
    return true;
  }
}

function numberField(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const CHAT_BASE: Partial<Record<ProviderId, string>> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  opencode: "https://opencode.ai/inference/openai/v1",
  opencodego: "https://opencode.ai/zen/go/v1",
  zai: "https://api.z.ai/api/paas/v4",
  groq: "https://api.groq.com/openai/v1",
  cerebras: "https://api.cerebras.ai/v1",
};

const LIST_URL: Partial<Record<ProviderId, string>> = {
  openrouter: "https://openrouter.ai/api/v1/models",
  opencode: "https://opencode.ai/inference/v1/models",
  opencodego: "https://opencode.ai/zen/go/v1/models",
  zai: "https://api.z.ai/api/paas/v4/models",
  groq: "https://api.groq.com/openai/v1/models",
  cerebras: "https://api.cerebras.ai/v1/models",
};

const KNOWN_FREE: Partial<Record<ProviderId, RegExp>> = {
  zai: /glm-4\.7-flash|glm-4\.5-flash|glm-4\.6v-flash|glm-4-flash/i,
  groq: /(^|\/)(qwen3\.8-27b|qwen-3\.8-27b|gpt-oss-120b|gpt-oss-20b|allam-2-7b)$/i,
  cerebras: /(^|\/)(gpt-oss-120b|qwen-3\.8-27b|qwen3\.8-27b)$/i,
};

function pinFirst(ids: string[], pattern: RegExp) {
  return [...ids.filter((id) => pattern.test(id)), ...ids.filter((id) => !pattern.test(id))];
}

type ListedModel = { id: string; free: boolean; label: string };

const FREE_FIRST = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-super-vl:free",
  "baidu/ernie-5.5-flash-preview:free",
  "thinkingmachines/inkling-2-small:free",
  "nvidia/nemotron-3.5-lightning:free",
  "dots-studio/dots-3-note-preview:free",
  "particle-ai/particle-1:free",
  "inclusionai/ling-3.2-flash:free",
  "cohere/north-mini-code:free",
  "recursive/flint-v1.0:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "google/gemma-4-26b-a4b-it:free",
  "google/gemma-4-31b-it:free",
  "openrouter/free",
];

function modelRows(value: unknown) {
  return Array.isArray(value) ? value.map((item) => obj(item)) : [];
}

function pricedFree(row: Row) {
  const text = obj(obj(row.cost).text);
  const input = obj(text.input).price;
  const output = obj(text.output).price;
  if (input === 0 && output === 0) return true;
  const pricing = obj(row.pricing);
  if (pricing.prompt != null && pricing.completion != null && Number(pricing.prompt) === 0 && Number(pricing.completion) === 0) return true;
  return false;
}

function freeModel(provider: ProviderId, row: Row, id: string) {
  if (pricedFree(row)) return true;
  if (/:free$|-free$|\(free\)/i.test(`${id} ${s(row, "name")}`)) return true;
  if (KNOWN_FREE[provider]?.test(id)) return true;
  if (provider === "gemini" && /^gemma/i.test(id)) return true;
  return false;
}

function packModels(provider: ProviderId, rows: Row[], allow: (id: string) => boolean) {
  const seen = new Set<string>();
  const listed: ListedModel[] = [];
  for (const row of rows) {
    const id = (s(row, "id") || s(row, "name")).replace(/^models\//, "");
    if (!id || seen.has(id) || !allow(id)) continue;
    seen.add(id);
    const label = s(row, "name").replace(/\s+/g, " ").trim() || id;
    listed.push({ id, free: freeModel(provider, row, id), label });
  }
  return listed.sort((a, b) => {
    const freeOrder = Number(b.free) - Number(a.free);
    if (freeOrder) return freeOrder;
    if (a.free && b.free) return (FREE_FIRST.indexOf(a.id) + 1 || 99) - (FREE_FIRST.indexOf(b.id) + 1 || 99);
    return a.label.localeCompare(b.label);
  });
}

async function remoteModels(provider: ProviderId, apiKey: string) {
  const headers = { Accept: "application/json" };
  if (provider === "openai") {
    const payload = await callJson("https://api.openai.com/v1/models", { headers: { ...headers, Authorization: `Bearer ${apiKey}` } }, apiKey);
    return packModels("openai", modelRows(payload.data), (id) => /^(gpt-|o1|o3|o4|chatgpt)/.test(id) && !/tts|dall-e|moderation|audio|realtime|image/.test(id));
  }
  if (provider === "anthropic") {
    const payload = await callJson("https://api.anthropic.com/v1/models", {
      headers: { ...headers, "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    }, apiKey);
    return packModels("anthropic", modelRows(payload.data), (id) => !/embed/i.test(id));
  }
  if (provider === "gemini") {
    const rows: Row[] = [];
    let page = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const payload = await callJson(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=100${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`, { headers }, apiKey);
      rows.push(...modelRows(payload.models));
      page = s(payload, "nextPageToken");
      if (!page) break;
    }
    const usable = rows.filter((row) => {
      const methods = Array.isArray(row.supportedGenerationMethods) ? row.supportedGenerationMethods.map(String) : [];
      if (/gemma/i.test(s(row, "name"))) return true;
      return !methods.length || methods.includes("generateContent");
    });
    return packModels("gemini", usable, (id) => !/embed|imagen|veo|aqa|tts|lyria/i.test(id));
  }
  if (provider === "openrouter" || provider === "opencode" || provider === "opencodego" || provider === "groq" || provider === "cerebras" || provider === "zai") {
    const extra: Record<string, string> = provider === "openrouter" ? { "HTTP-Referer": "https://managetechservice.com", "X-Title": "Manage Tech Service" } : {};
    const payload = await callJson(LIST_URL[provider] || "", { headers: { ...headers, Authorization: `Bearer ${apiKey}`, ...extra } }, apiKey);
    const rows = [...modelRows(payload.data), ...modelRows(payload.models)];
    const packed = packModels(provider, rows, () => true).filter((entry) => {
      const row = rows.find((item) => (s(item, "id") || s(item, "name")).replace(/^models\//, "") === entry.id) || {};
      return chatCapable(row, entry.id);
    });
    const free = packed.filter((entry) => entry.free);
    const paid = packed.filter((entry) => !entry.free).slice(0, 40);
    return [...free, ...paid];
  }
  let rows: Row[] = [];
  try {
    const payload = await callJson("https://ollama.com/v1/models", { headers: { ...headers, Authorization: `Bearer ${apiKey}` } }, apiKey);
    rows = modelRows(payload.data);
  } catch {
    rows = [];
  }
  if (!rows.length) {
    const payload = await callJson("https://ollama.com/api/tags", { headers: { ...headers, Authorization: `Bearer ${apiKey}` } }, apiKey);
    rows = modelRows(payload.models).filter((row) => {
      const caps = Array.isArray(row.capabilities) ? row.capabilities.map((cap) => String(cap).toLowerCase()) : [];
      return !(caps.includes("decision") && !caps.includes("completion"));
    });
  }
  return packModels("ollama", rows, (id) => !/clef|embed|whisper|systemone|decider/i.test(id));
}

function chatCapable(row: Row, id: string) {
  const name = `${id} ${s(row, "name")}`;
  if (/embed|rerank|whisper|tts|\bvoice\b|lyria|recraft/i.test(name)) return false;
  if (s(row, "type") && s(row, "type") !== "chat") return false;
  const listed = obj(row.architecture).output_modalities;
  const spoken = obj(row.modalities).output;
  const output = Array.isArray(listed) ? listed.map(String) : Array.isArray(spoken) ? spoken.map(String) : [];
  if (output.some((item) => item === "audio" || item.startsWith("audio/"))) return false;
  if (output.includes("image") && !output.includes("text")) return false;
  return !output.length || output.includes("text");
}

async function callJson(url: string, init: RequestInit, secret = "") {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(45000) });
  const text = await response.text();
  if (!response.ok) throw httpError(response.status, text, secret);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

function httpError(status: number, text: string, secret = "") {
  let detail = "";
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    detail = typeof parsed.error === "string" ? parsed.error : parsed.error?.message || parsed.message || "";
  } catch {
    detail = text;
  }
  if (secret) detail = detail.replaceAll(secret, "");
  if (/usage credits|ollama\.com\/plans|subscribe/i.test(detail)) return new Error(ollamaCreditMessage());
  if (status === 401 || status === 403) return new Error("That API key was refused.");
  return new Error(detail.replace(/\s+/g, " ").trim().slice(0, 180) || "The provider rejected the request.");
}

async function openStream(url: string, init: RequestInit, secret = "") {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(45000) });
  if (!response.ok || !response.body) {
    const text = await response.text();
    throw httpError(response.status, text, secret);
  }
  return response;
}

async function* streamLines(response: Response) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) yield trimmed;
    }
  }
  const rest = buffer.trim();
  if (rest) yield rest;
}

export const listAgentProviders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const staff = await requireDesk(sql, context.userId, false);
    const saved = await sql<Row>`select provider, api_key, model from agent_provider_keys`;
    const byId = new Map(saved.map((row) => [s(row, "provider"), row]));
    const providers = [];
    for (const item of PROVIDERS) {
      const row = byId.get(item.id);
      let storedKey = s(row, "api_key");
      let apiKey = storedKey || (await envKey(item.id));
      if (item.id === "openrouter") {
        const current = await readKey(sql, "openrouter");
        storedKey = current.apiKey;
        apiKey = current.apiKey;
      }
      if (!storedKey && apiKey) {
        await sql`
          insert into agent_provider_keys (provider, api_key, model, updated_at)
          values (${item.id}, ${apiKey}, '', now())
          on conflict (provider) do nothing
        `;
      }
      let models: string[] = [];
      let free: string[] = [];
      let names: Record<string, string> = {};
      let error = "";
      const local = isLocalProvider(item.id);
      if (local || apiKey) {
        try {
          const catalog = local
            ? (await listLocalModels(item.id, apiKey)).map((id) => ({ id, free: true, label: id }))
            : (await remoteModels(item.id, apiKey)).slice(0, 120);
          models = catalog.map((entry) => entry.id);
          free = catalog.filter((entry) => entry.free).map((entry) => entry.id);
          names = Object.fromEntries(catalog.map((entry) => [entry.id, entry.label || entry.id]));
        } catch (cause) {
          error = cause instanceof Error ? cause.message : "The key could not be checked.";
        }
      }
      let billing = "";
      if (item.id === "ollama" && apiKey && models.length && !(await ollamaReady(apiKey))) billing = ollamaCreditMessage();
      const savedModel = models.includes(s(row, "model")) ? s(row, "model") : models[0] || "";
      if (apiKey && savedModel && savedModel !== s(row, "model") && !billing) {
        await sql`update agent_provider_keys set model = ${savedModel}, updated_at = now() where provider = ${item.id}`;
      }
      providers.push({
        id: item.id,
        label: item.label,
        connected: (local || Boolean(apiKey)) && models.length > 0 && !billing,
        hint: local ? (apiKey.startsWith("http") ? apiKey : "This machine") : apiKey ? `•••• ${apiKey.slice(-4)}` : "",
        apiKey: staff.role === "viewer" ? "" : apiKey,
        editable: staff.role !== "viewer",
        model: billing ? "" : savedModel,
        models: billing ? [] : models,
        free: billing ? [] : free,
        names: billing ? {} : names,
        error: error || billing,
      });
    }
    const picked = await sql<Row>`select provider, model from agent_user_models where user_id = ${staff.userId} limit 1`;
    const mine = picked[0];
    const provider = providers.find((item) => item.id === s(mine, "provider"));
    const selected = provider && provider.models.includes(s(mine, "model")) ? `${provider.id}:${s(mine, "model")}` : "";
    const storedVoice = s(byId.get("elevenlabs"), "api_key");
    const voiceKey = storedVoice || (process.env.ELEVENLABS_API_KEY || "").trim() || "sk_3e9b1dc7ed2f360adfbbd12b0f0bd4aa7122fa5eff29b1ab";
    return {
      providers: [
        ...providers,
        {
          id: "elevenlabs" as const,
          label: "ElevenLabs",
          connected: Boolean(voiceKey),
          hint: voiceKey ? `•••• ${voiceKey.slice(-4)}` : "",
          apiKey: staff.role === "viewer" ? "" : voiceKey,
          editable: staff.role !== "viewer",
          model: "",
          models: [] as string[],
          free: [] as string[],
          names: {} as Record<string, string>,
          error: "",
        },
      ],
      selected,
    };
  });

export const saveVoiceKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const apiKey = typeof raw.apiKey === "string" ? raw.apiKey.trim() : "";
    if (apiKey.length < 8 || apiKey.length > 400) throw new Error("Paste the ElevenLabs API key.");
    return { apiKey };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireDesk(sql, context.userId, true);
    const check = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": data.apiKey } });
    if (!check.ok) throw new Error("ElevenLabs refused that key.");
    await sql`
      insert into agent_provider_keys (provider, api_key, model, updated_at)
      values ('elevenlabs', ${data.apiKey}, 'eleven_v4_turbo', now())
      on conflict (provider) do update set api_key = excluded.api_key, model = excluded.model, updated_at = now()
    `;
    return { provider: "elevenlabs" as const, model: "eleven_v4_turbo", models: ["eleven_v4_turbo"], hint: `•••• ${data.apiKey.slice(-4)}` };
  });

export const saveAgentKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const provider = providerId(typeof raw.provider === "string" ? raw.provider : "");
    const apiKey = typeof raw.apiKey === "string" ? raw.apiKey.trim() : "";
    if (isLocalProvider(provider)) {
      if (apiKey && !/^https?:\/\//i.test(apiKey)) throw new Error("Leave this blank, or paste the address on this machine.");
      if (apiKey.length > 200) throw new Error("That address is too long.");
      return { provider, apiKey };
    }
    if (apiKey.length < 8 || apiKey.length > 400) throw new Error("Paste the API key.");
    return { provider, apiKey };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireDesk(sql, context.userId, true);
    if (isLocalProvider(data.provider)) {
      const models = await listLocalModels(data.provider, data.apiKey);
      const current = await readKey(sql, data.provider);
      const model = models.includes(current.model) ? current.model : models[0];
      await sql`
        insert into agent_provider_keys (provider, api_key, model, updated_at)
        values (${data.provider}, ${data.apiKey}, ${model}, now())
        on conflict (provider) do update set api_key = excluded.api_key, model = excluded.model, updated_at = now()
      `;
      return { provider: data.provider, model, models, hint: data.apiKey || "This machine" };
    }
    const catalog = (await remoteModels(data.provider, data.apiKey)).slice(0, 80);
    const models = catalog.map((entry) => entry.id);
    if (!models.length) throw new Error("The key was accepted, but no chat models were returned.");
    if (data.provider === "ollama" && !(await ollamaReady(data.apiKey))) {
      await sql`
        insert into agent_provider_keys (provider, api_key, model, updated_at)
        values (${data.provider}, ${data.apiKey}, '', now())
        on conflict (provider) do update set api_key = excluded.api_key, updated_at = now()
      `;
      throw new Error(ollamaCreditMessage());
    }
    const current = await readKey(sql, data.provider);
    const model = models.includes(current.model) ? current.model : models[0];
    await sql`
      insert into agent_provider_keys (provider, api_key, model, updated_at)
      values (${data.provider}, ${data.apiKey}, ${model}, now())
      on conflict (provider) do update set api_key = excluded.api_key, model = excluded.model, updated_at = now()
    `;
    return { provider: data.provider, model, models, hint: `•••• ${data.apiKey.slice(-4)}` };
  });

export const chooseAgentModel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const provider = providerId(typeof raw.provider === "string" ? raw.provider : "");
    const model = typeof raw.model === "string" ? raw.model.trim().slice(0, 120) : "";
    if (!model) throw new Error("Choose a model.");
    return { provider, model };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const staff = await requireDesk(sql, context.userId, false);
    const saved = await readKey(sql, data.provider);
    const models = isLocalProvider(data.provider) ? await listLocalModels(data.provider, saved.apiKey) : (await remoteModels(data.provider, saved.apiKey)).map((entry) => entry.id);
    if (!isLocalProvider(data.provider) && !saved.apiKey) throw new Error("Add an API key first.");
    if (!models.includes(data.model)) throw new Error("That model is not available.");
    await sql`
      insert into agent_user_models (user_id, provider, model, updated_at)
      values (${staff.userId}, ${data.provider}, ${data.model}, now())
      on conflict (user_id) do update set provider = excluded.provider, model = excluded.model, updated_at = now()
    `;
    return { ok: true, provider: data.provider, model: data.model };
  });

export const listAgentChats = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const staff = await requireDesk(sql, context.userId, false);
    const chats = await sql<Row>`select id, title, updated_at from agent_chats where user_id = ${staff.userId} order by updated_at desc limit 30`;
    return { chats: chats.map((row) => ({ id: Number(row.id), title: s(row, "title") || "New chat", updatedAt: when(row, "updated_at") })) };
  });

export const getAgentChat = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: number) => {
    const value = Number(id);
    if (!Number.isInteger(value) || value < 1) throw new Error("Choose a chat.");
    return value;
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const staff = await requireDesk(sql, context.userId, false);
    const chats = await sql<Row>`select id, title from agent_chats where id = ${data} and user_id = ${staff.userId} limit 1`;
    if (!chats[0]) throw new Error("That chat is not yours.");
    const messages = await sql<Row>`select role, content, created_at from agent_messages where chat_id = ${data} and user_id = ${staff.userId} order by id limit 80`;
    return {
      id: data,
      title: s(chats[0], "title") || "New chat",
      messages: messages
        .map((row) => ({ role: s(row, "role") === "assistant" ? "assistant" as const : "user" as const, content: s(row, "content"), at: when(row, "created_at") }))
        .filter((row) => row.content),
    };
  });

type ChatMessage = { role: "user" | "assistant"; content: string };
type ChatFile = { name: string; type: string; data: string };

function cleanMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const role = row.role === "assistant" ? "assistant" : row.role === "user" ? "user" : "";
      const content = typeof row.content === "string" ? row.content.trim().slice(0, 48000) : "";
      return role && content ? { role, content } : null;
    })
    .filter((item): item is ChatMessage => Boolean(item))
    .slice(-16);
}

function cleanFiles(value: unknown): ChatFile[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const data = typeof row.data === "string" ? row.data.replace(/^data:[^,]*,/, "").slice(0, 1_500_000) : "";
      return {
        name: typeof row.name === "string" ? row.name.slice(0, 120) : "file",
        type: typeof row.type === "string" ? row.type.slice(0, 80) : "",
        data,
      };
    })
    .filter((item) => item.data)
    .slice(0, 4);
}

export const askMtsAgent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const provider = providerId(typeof raw.provider === "string" ? raw.provider : "");
    const messages = cleanMessages(raw.messages);
    if (!messages.length || messages.at(-1)?.role !== "user") throw new Error("Write a message first.");
    return { provider, model: typeof raw.model === "string" ? raw.model.trim().slice(0, 120) : "", messages, files: cleanFiles(raw.files) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const staff = await requireDesk(sql, context.userId, false);
    const saved = await readKey(sql, data.provider);
    if (!saved.apiKey && !isLocalProvider(data.provider)) throw new Error("Add an API key for this provider first.");
    const model = data.model || saved.model;
    if (/clef|systemone|decider/i.test(model)) throw new Error("That model only answers structured decisions, not chat. Choose a chat model.");
    const reply = await complete(sql, staff, data.provider, saved.apiKey, model, data.messages, data.files);
    return { answer: reply.answer, logs: reply.logs, model };
  });

export async function streamDeskReply(userId: string, raw: unknown, emit: (event: { type: "delta" | "log" | "done" | "error"; text?: string; logs?: string[]; chatId?: number }) => void) {
  try {
    const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const provider = providerId(typeof body.provider === "string" ? body.provider : "");
    const messages = cleanMessages(body.messages);
    if (!messages.length || messages.at(-1)?.role !== "user") throw new Error("Write a message first.");
    const files = cleanFiles(body.files);
    const sql = await getSql();
    const staff = await requireDesk(sql, userId, false);
    const saved = await readKey(sql, provider);
    if (!saved.apiKey && !isLocalProvider(provider)) throw new Error("Add an API key for this provider first.");
    const model = (typeof body.model === "string" ? body.model.trim().slice(0, 120) : "") || saved.model;
    if (/clef|systemone|decider/i.test(model)) throw new Error("That model only answers structured decisions, not chat. Choose a chat model.");
    const asked = messages.at(-1)?.content || "";
    const reply = await complete(sql, staff, provider, saved.apiKey, model, messages, files, (text) => emit({ type: "delta", text }));
    const requested = Number(body.chatId);
    const chatId = await saveChatTurn(sql, staff, Number.isInteger(requested) ? requested : 0, asked, reply.answer);
    emit({ type: "done", logs: reply.logs, chatId });
  } catch (cause) {
    emit({ type: "error", text: cause instanceof Error ? cause.message : "The agent could not reply." });
  }
}

const TOOLS = [
  { name: "search_web", description: "Search the public internet. Returns titles, links, and snippets. Follow a useful link with browse_page.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "browse_page", description: "Open one public http or https page and read its text. Use this for broader knowledge after search_web.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
  { name: "my_desk", description: "Read the signed-in staff profile, assigned ticket count, open tasks, and unread notices.", parameters: { type: "object", properties: {}, required: [] } },
  { name: "my_tickets", description: "List tickets this signed-in role can open. Pass mine=true to keep only tickets assigned to them.", parameters: { type: "object", properties: { query: { type: "string" }, mine: { type: "boolean" } }, required: [] } },
  { name: "my_ticket", description: "Read one ticket this role can open, including updates.", parameters: { type: "object", properties: { id: { type: "number" } }, required: ["id"] } },
  { name: "create_ticket", description: "Open a ticket when this role can write. Assignee defaults to the signed-in person.", parameters: { type: "object", properties: { subject: { type: "string" }, detail: { type: "string" }, priority: { type: "string" }, assignee: { type: "string" } }, required: ["subject"] } },
  { name: "update_ticket", description: "Change status, priority, or assignee. solved and closed are sent to Zendesk as this staff member. Use reply_ticket for the words the customer should read.", parameters: { type: "object", properties: { id: { type: "number" }, status: { type: "string" }, priority: { type: "string" }, assignee: { type: "string" } }, required: ["id"] } },
  { name: "reply_ticket", description: "Post a public reply as the signed-in staff member. Saves it on the desk and sends the same reply to the Zendesk ticket.", parameters: { type: "object", properties: { id: { type: "number" }, body: { type: "string" } }, required: ["id", "body"] } },
  { name: "delete_ticket", description: "Delete a ticket. Super Admin and Admin only.", parameters: { type: "object", properties: { id: { type: "number" } }, required: ["id"] } },
  { name: "search_orders", description: "Find orders this role can open.", parameters: { type: "object", properties: { query: { type: "string" } }, required: [] } },
  { name: "update_order", description: "Change an order status when this role can write.", parameters: { type: "object", properties: { id: { type: "number" }, status: { type: "string" } }, required: ["id", "status"] } },
  { name: "delete_order", description: "Delete an order. Super Admin only.", parameters: { type: "object", properties: { id: { type: "number" } }, required: ["id"] } },
  { name: "search_companies", description: "Find companies this role can open.", parameters: { type: "object", properties: { query: { type: "string" } }, required: [] } },
  { name: "search_people", description: "Find people this role can open.", parameters: { type: "object", properties: { query: { type: "string" } }, required: [] } },
  { name: "my_tasks", description: "List the signed-in staff member's personal tasks.", parameters: { type: "object", properties: {}, required: [] } },
  { name: "create_task", description: "Create a personal task for the signed-in staff member.", parameters: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" }, due_on: { type: "string" } }, required: ["title"] } },
  { name: "update_task", description: "Update one of this person's tasks.", parameters: { type: "object", properties: { id: { type: "number" }, title: { type: "string" }, detail: { type: "string" }, status: { type: "string" }, due_on: { type: "string" } }, required: ["id"] } },
  { name: "delete_task", description: "Delete one of this person's tasks.", parameters: { type: "object", properties: { id: { type: "number" } }, required: ["id"] } },
  { name: "desk_counts", description: "Read live totals for tickets, orders, companies, people, and catalog products.", parameters: { type: "object", properties: {}, required: [] } },
  { name: "recent_tickets", description: "Read the newest support tickets on this desk.", parameters: { type: "object", properties: {}, required: [] } },
  { name: "recent_orders", description: "Read the newest shop orders on this desk.", parameters: { type: "object", properties: {}, required: [] } },
  { name: "search_catalog", description: "Find catalog products by name or SKU.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
];

function openaiTools() {
  return TOOLS.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
}

type ToolMode = "full" | "functions" | "off";

function functionTools() {
  return TOOLS.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters }));
}

function anthropicTools(mode: ToolMode) {
  if (mode === "off") return undefined;
  return mode === "full" ? [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }, ...functionTools()] : functionTools();
}

function geminiTools(mode: ToolMode) {
  const functions = { functionDeclarations: TOOLS.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters })) };
  if (mode === "off") return undefined;
  return mode === "full" ? [{ google_search: {} }, functions] : [functions];
}

function toolRejected(message: string) {
  return /web_search|google_search|tool_use|tool call|tools?\b|functionDeclarations|unknown tool|invalid schema/i.test(message);
}

function argsOf(value: unknown) {
  if (typeof value === "string") {
    try {
      return obj(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return obj(value);
}

function blockedHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) return true;
  }
  return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80");
}

function publicHttpUrl(raw: string) {
  try {
    const url = new URL(raw.trim());
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || blockedHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function htmlText(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&/gi, "&")
    .replace(/</gi, "<")
    .replace(/>/gi, ">")
    .replace(/&#39;|'/gi, "'")
    .replace(/"/gi, "\"")
    .replace(/\s+/g, " ")
    .trim();
  return { title: title.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180), text: text.slice(0, 5500) };
}

async function readLimited(response: Response, max = 350_000) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const step = await reader.read();
    if (step.done || !step.value) break;
    chunks.push(step.value);
    size += step.value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return Buffer.concat(chunks).subarray(0, max).toString("utf8");
}

async function fetchPublic(raw: string) {
  let current = publicHttpUrl(raw);
  if (!current) throw new Error("That address is not a public web page.");
  for (let hop = 0; hop < 4; hop += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: { Accept: "text/html,application/xhtml+xml,text/plain", "User-Agent": "MTS-Agent/1.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (response.status >= 300 && response.status < 400) {
      const next = publicHttpUrl(new URL(response.headers.get("location") || "", current).href);
      if (!next) throw new Error("That redirect is not a public web page.");
      current = next;
      continue;
    }
    if (!response.ok) throw new Error(`The page returned ${response.status}.`);
    const type = response.headers.get("content-type") || "";
    if (type && !/text\/|json|xml|javascript/.test(type)) throw new Error("That page is not readable text.");
    return { url: current.href, body: await readLimited(response) };
  }
  throw new Error("That page redirected too many times.");
}

function bingTarget(href: string) {
  const coded = /u=a1([A-Za-z0-9+/=]+)/.exec(href)?.[1];
  if (coded) {
    try {
      return publicHttpUrl(Buffer.from(coded, "base64").toString("utf8"));
    } catch {
      return null;
    }
  }
  const clean = href.replace(/&/g, "&");
  if (/bing\.com\/ck\//i.test(clean)) return null;
  return publicHttpUrl(clean);
}

async function searchWeb(query: string) {
  const q = query.trim().slice(0, 180);
  if (!q) return "Give a search query.";
  const bits: string[] = [];
  try {
    const response = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
      signal: AbortSignal.timeout(12000),
    });
    const html = await response.text();
    const blocks = html.match(/<h2[\s\S]*?<\/h2>/gi) || [];
    for (const block of blocks.slice(0, 8)) {
      const link = /href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
      if (!link) continue;
      const url = bingTarget(link[1]);
      const title = link[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (url && title) bits.push(`${title}\n${url.href}`);
    }
  } catch {
    bits.push("");
  }
  if (bits.filter(Boolean).length < 2) {
    try {
      const response = await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=3&namespace=0&format=json`, {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json()) as unknown[];
      const titles = Array.isArray(payload[1]) ? payload[1] : [];
      const blurbs = Array.isArray(payload[2]) ? payload[2] : [];
      const links = Array.isArray(payload[3]) ? payload[3] : [];
      titles.forEach((title, index) => bits.push(`${String(title)}\n${String(links[index] || "")}\n${String(blurbs[index] || "")}`.trim()));
    } catch {
      bits.push("");
    }
  }
  return bits.filter(Boolean).slice(0, 6).join("\n\n") || "No public results for that search.";
}

async function browsePage(raw: string) {
  const page = await fetchPublic(raw);
  const read = htmlText(page.body);
  if (!read.text) return "That page had no readable text.";
  return `${read.title ? `${read.title}\n` : ""}${page.url}\n${read.text}`;
}

async function runTool(sql: Sql, actor: DeskUser, name: string, raw: unknown) {
  const args = argsOf(raw);
  try {
    if (name === "search_web" || name === "web_search") return await searchWeb(s(args, "query"));
    if (name === "browse_page") return await browsePage(s(args, "url"));
    if (name === "my_desk") return myDesk(sql, actor);
    if (name === "my_tickets") return myTickets(sql, actor, s(args, "query"), args.mine === true);
    if (name === "my_ticket") return myTicket(sql, actor, numberArg(args.id));
    if (name === "create_ticket") return createOwnTicket(sql, actor, args);
    if (name === "update_ticket") return updateOwnTicket(sql, actor, args);
    if (name === "reply_ticket") return replyOwnTicket(sql, actor, args);
    if (name === "delete_ticket") return deleteOwnTicket(sql, actor, numberArg(args.id));
    if (name === "search_orders") return searchOrders(sql, actor, s(args, "query"));
    if (name === "update_order") return updateOrderStatus(sql, actor, args);
    if (name === "delete_order") return deleteOrderRecord(sql, actor, numberArg(args.id));
    if (name === "search_companies") return searchCompanies(sql, actor, s(args, "query"));
    if (name === "search_people") return searchPeople(sql, actor, s(args, "query"));
    if (name === "my_tasks") return myTasks(sql, actor);
    if (name === "create_task") return createOwnTask(sql, actor, args);
    if (name === "update_task") return updateOwnTask(sql, actor, args);
    if (name === "delete_task") return deleteOwnTask(sql, actor, numberArg(args.id));
    if (name === "desk_counts") return deskCounts(sql, actor);
    if (name === "recent_tickets") return myTickets(sql, actor, "", false);
    if (name === "recent_orders") return searchOrders(sql, actor, "");
    if (name === "search_catalog") {
      const query = `%${s(args, "query").slice(0, 80)}%`;
      const rows = await sql<Row>`select name, sku, price_cents, available from products where name ilike ${query} or sku ilike ${query} order by name limit 8`;
      return rows.map((row) => `${s(row, "name")} (${s(row, "sku")}) · ${s(row, "price_cents") || "0"} cents · ${row.available === false ? "hidden" : "available"}`).join("\n") || "No matching products.";
    }
  } catch (cause) {
    return cause instanceof Error ? cause.message : "That tool could not run.";
  }
  return "That tool is not available.";
}

function numberArg(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function assignedTo(actor: DeskUser, row: Row) {
  const assignee = s(row, "assignee").trim().toLowerCase();
  if (!assignee) return false;
  return [actor.name, actor.email].some((value) => value.trim().toLowerCase() === assignee);
}

function canWrite(actor: DeskUser) {
  return actor.role !== "viewer";
}

function inCompany(actor: DeskUser, organizationId: unknown) {
  if (actor.organizationId == null) return true;
  return Number(organizationId) === actor.organizationId;
}

function canChangeTicket(actor: DeskUser, row: Row) {
  return canWrite(actor) && inCompany(actor, row.organization_id);
}

async function loadTicket(sql: Sql, actor: DeskUser, id: number) {
  if (!id) throw new Error("Give the ticket id.");
  const rows = await sql<Row>`select id, subject, status, priority, category, organization_id, requester_name, requester_email, assignee, zendesk_id from tickets where id = ${id} limit 1`;
  if (!rows[0]) throw new Error("That ticket is not on this desk.");
  if (!inCompany(actor, rows[0].organization_id)) throw new Error("That ticket is outside your access.");
  return rows[0];
}

async function audit(sql: Sql, actor: DeskUser, action: string, target: string, detail: string) {
  await sql`
    insert into audit_logs (actor_user_id, actor_name, action, target, detail)
    values (${actor.userId}, ${actor.name || actor.email}, ${action}, ${target}, ${detail.slice(0, 180)})
  `;
}

async function myDesk(sql: Sql, actor: DeskUser) {
  const name = actor.name.trim();
  const email = actor.email.trim();
  const org = actor.organizationId;
  const rows = await sql<Row>`
    select
      (select count(*)::int from tickets where ${org}::int is null or organization_id = ${org}) as visible,
      (select count(*)::int from tickets where (${name} <> '' and lower(assignee) = lower(${name})) or (${email} <> '' and lower(assignee) = lower(${email}))) as tickets,
      (select count(*)::int from staff_tasks where user_id = ${actor.userId} and status <> 'done') as tasks,
      (select count(*)::int from notifications n
        where not exists (select 1 from notification_reads r where r.notification_id = n.id and r.user_id = ${actor.userId})
      ) as notices
  `;
  const row = rows[0] || {};
  return `${actor.name || "Staff"} · ${actor.email || "no email"} · ${actor.role}. Tickets you can open ${s(row, "visible")}. Assigned to you ${s(row, "tickets")}. Open tasks ${s(row, "tasks")}. Unread notices ${s(row, "notices")}.`;
}

async function deskCounts(sql: Sql, actor: DeskUser) {
  const org = actor.organizationId;
  const rows = await sql<Row>`
    select
      (select count(*)::int from tickets where ${org}::int is null or organization_id = ${org}) as tickets,
      (select count(*)::int from orders where ${org}::int is null or organization_id = ${org}) as orders,
      (select count(*)::int from organizations where ${org}::int is null or id = ${org}) as companies,
      (select count(*)::int from customer_users where ${org}::int is null or organization_id = ${org}) as people,
      (select count(*)::int from products) as products
  `;
  const row = rows[0] || {};
  return `Tickets ${s(row, "tickets")}. Orders ${s(row, "orders")}. Companies ${s(row, "companies")}. People ${s(row, "people")}. Products ${s(row, "products")}.`;
}

async function myTickets(sql: Sql, actor: DeskUser, query: string, mine: boolean) {
  const name = actor.name.trim();
  const email = actor.email.trim();
  const org = actor.organizationId;
  const like = `%${query.trim().slice(0, 80)}%`;
  const rows = await sql<Row>`
    select t.id, t.subject, t.status, t.priority, t.assignee,
      (select body from ticket_comments c where c.ticket_id = t.id order by c.id desc limit 1) as update
    from tickets t
    where (${org}::int is null or t.organization_id = ${org})
      and (${!mine} or ((${name} <> '' and lower(t.assignee) = lower(${name})) or (${email} <> '' and lower(t.assignee) = lower(${email}))))
      and (${query.trim()} = '' or t.subject ilike ${like} or t.status ilike ${like} or t.assignee ilike ${like})
    order by t.updated_at desc
    limit 12
  `;
  if (!rows.length) return mine ? "No tickets are assigned to you." : "No tickets in your access.";
  return rows.map((row) => `#${s(row, "id")} ${s(row, "status")} · ${s(row, "priority")} · ${s(row, "assignee") || "unassigned"} · ${s(row, "subject")}${s(row, "update") ? ` · latest: ${s(row, "update").slice(0, 120)}` : ""}`).join("\n");
}

async function myTicket(sql: Sql, actor: DeskUser, id: number) {
  const ticket = await loadTicket(sql, actor, id);
  const comments = await sql<Row>`select author_name, body, created_at from ticket_comments where ticket_id = ${id} order by id desc limit 8`;
  const updates = comments.map((row) => `${s(row, "author_name")}: ${s(row, "body").slice(0, 180)}`).join("\n") || "No updates yet.";
  return `#${s(ticket, "id")} ${s(ticket, "subject")}\nStatus ${s(ticket, "status")} · Priority ${s(ticket, "priority")} · Assignee ${s(ticket, "assignee") || "unassigned"}\nRequester ${s(ticket, "requester_name")} ${s(ticket, "requester_email")}\nUpdates:\n${updates}`;
}

async function createOwnTicket(sql: Sql, actor: DeskUser, args: Row) {
  if (!canWrite(actor)) throw new Error("View-only access cannot open a ticket.");
  const subject = s(args, "subject").trim().slice(0, 180);
  const detail = s(args, "detail").trim().slice(0, 2000);
  const priority = ["low", "normal", "high", "urgent"].includes(s(args, "priority")) ? s(args, "priority") : "normal";
  if (!subject) throw new Error("Give the ticket a subject.");
  const assignee = s(args, "assignee").trim().slice(0, 120) || actor.name || actor.email;
  const rows = await sql<Row>`
    insert into tickets (subject, status, priority, organization_id, requester_name, requester_email, assignee)
    values (${subject}, 'new', ${priority}, ${actor.organizationId}, ${actor.name || actor.email}, ${actor.email}, ${assignee})
    returning id
  `;
  const id = Number(rows[0]?.id);
  if (detail) {
    await sql`insert into ticket_comments (ticket_id, author_name, body, public_note) values (${id}, ${actor.name || actor.email}, ${detail}, true)`;
  }
  await audit(sql, actor, "Agent opened ticket", String(id), subject);
  const synced = await syncStaffTicketAction(sql, { name: actor.name, email: actor.email }, id, { body: detail || subject, status: "new" });
  return `Opened ticket #${id} and assigned it to ${assignee}. ${synced}`;
}

async function updateOwnTicket(sql: Sql, actor: DeskUser, args: Row) {
  const ticket = await loadTicket(sql, actor, numberArg(args.id));
  if (!canChangeTicket(actor, ticket)) throw new Error("View-only access cannot update a ticket.");
  const status = s(args, "status").trim();
  const priority = s(args, "priority").trim();
  const assignee = s(args, "assignee").trim().slice(0, 120);
  const allowed = ["new", "open", "pending", "solved", "closed"];
  const nextStatus = allowed.includes(status) ? status : s(ticket, "status");
  const nextPriority = ["low", "normal", "high", "urgent"].includes(priority) ? priority : s(ticket, "priority");
  const nextAssignee = assignee || s(ticket, "assignee");
  if (!status && !priority && !assignee) throw new Error("Give a status, priority, or assignee to change.");
  await sql`update tickets set status = ${nextStatus}, priority = ${nextPriority}, assignee = ${nextAssignee}, updated_at = now() where id = ${Number(ticket.id)}`;
  await audit(sql, actor, "Agent updated ticket", s(ticket, "id"), `${nextStatus} · ${nextPriority} · ${nextAssignee}`);
  const synced = await syncStaffTicketAction(sql, { name: actor.name, email: actor.email }, Number(ticket.id), {
    status: nextStatus,
    priority: nextPriority,
  });
  return `Ticket #${s(ticket, "id")} is now ${nextStatus}, priority ${nextPriority}, assigned to ${nextAssignee || "nobody"}. ${synced}`;
}

async function replyOwnTicket(sql: Sql, actor: DeskUser, args: Row) {
  const ticket = await loadTicket(sql, actor, numberArg(args.id));
  if (!canChangeTicket(actor, ticket)) throw new Error("View-only access cannot update a ticket.");
  const body = s(args, "body").trim().slice(0, 2000);
  if (!body) throw new Error("Write the update first.");
  const author = actor.name || actor.email || "Staff";
  const wasNew = s(ticket, "status") === "new";
  await sql`insert into ticket_comments (ticket_id, author_name, body, public_note) values (${Number(ticket.id)}, ${author}, ${body}, true)`;
  await sql`update tickets set status = case when status = 'new' then 'open' else status end, updated_at = now() where id = ${Number(ticket.id)}`;
  await audit(sql, actor, "Agent ticket update", s(ticket, "id"), body);
  const synced = await syncStaffTicketAction(sql, { name: author, email: actor.email }, Number(ticket.id), { body, status: wasNew ? "open" : "" });
  return `Added your update to ticket #${s(ticket, "id")} as ${author}. ${synced}`;
}

async function deleteOwnTicket(sql: Sql, actor: DeskUser, id: number) {
  if (actor.role !== "owner" && actor.role !== "admin") throw new Error("Only an admin can delete a ticket.");
  const ticket = await loadTicket(sql, actor, id);
  await sql`delete from ticket_comments where ticket_id = ${id}`;
  await sql`delete from tickets where id = ${id}`;
  await audit(sql, actor, "Agent deleted ticket", String(id), s(ticket, "subject"));
  return `Deleted ticket #${id} from this desk. If it was already in Zendesk, that copy is still there.`;
}

async function searchOrders(sql: Sql, actor: DeskUser, query: string) {
  const org = actor.organizationId;
  const like = `%${query.trim().slice(0, 80)}%`;
  const rows = await sql<Row>`
    select o.id, o.status, o.payment_status, o.shipment_status, coalesce(org.name, '') as company
    from orders o
    left join organizations org on org.id = o.organization_id
    where (${org}::int is null or o.organization_id = ${org})
      and (${query.trim()} = '' or org.name ilike ${like} or o.status ilike ${like} or cast(o.id as text) = ${query.trim()})
    order by o.id desc
    limit 12
  `;
  if (!rows.length) return "No orders in your access.";
  return rows.map((row) => `Order #${s(row, "id")} · ${s(row, "status")} · ${s(row, "payment_status") || "unpaid"} · ${s(row, "shipment_status") || "unfulfilled"} · ${s(row, "company")}`).join("\n");
}

async function updateOrderStatus(sql: Sql, actor: DeskUser, args: Row) {
  if (!canWrite(actor)) throw new Error("View-only access cannot update an order.");
  const id = numberArg(args.id);
  const status = s(args, "status").trim();
  const allowed = ["pending", "approved", "processing", "fulfilled", "cancelled"];
  if (!allowed.includes(status)) throw new Error("Status must be pending, approved, processing, fulfilled, or cancelled.");
  const org = actor.organizationId;
  const rows = await sql<Row>`
    update orders set status = ${status}, updated_at = now()
    where id = ${id} and (${org}::int is null or organization_id = ${org})
    returning id
  `;
  if (!rows[0]) throw new Error("That order is outside your access.");
  await audit(sql, actor, "Agent updated order", String(id), status);
  return `Order #${id} is now ${status}.`;
}

async function deleteOrderRecord(sql: Sql, actor: DeskUser, id: number) {
  if (actor.role !== "owner") throw new Error("Only a Super Admin can delete an order.");
  const rows = await sql<Row>`delete from orders where id = ${id} returning id`;
  if (!rows[0]) throw new Error("That order is not on this desk.");
  await audit(sql, actor, "Agent deleted order", String(id), "");
  return `Deleted order #${id}.`;
}

async function searchCompanies(sql: Sql, actor: DeskUser, query: string) {
  const org = actor.organizationId;
  const like = `%${query.trim().slice(0, 80)}%`;
  const rows = await sql<Row>`
    select id, name, domain, phone from organizations
    where (${org}::int is null or id = ${org})
      and (${query.trim()} = '' or name ilike ${like} or domain ilike ${like})
    order by name
    limit 12
  `;
  if (!rows.length) return "No companies in your access.";
  return rows.map((row) => `#${s(row, "id")} ${s(row, "name")} · ${s(row, "domain") || "no domain"} · ${s(row, "phone") || "no phone"}`).join("\n");
}

async function searchPeople(sql: Sql, actor: DeskUser, query: string) {
  const org = actor.organizationId;
  const like = `%${query.trim().slice(0, 80)}%`;
  const rows = await sql<Row>`
    select id, name, email, title from customer_users
    where (${org}::int is null or organization_id = ${org})
      and (${query.trim()} = '' or name ilike ${like} or email ilike ${like})
    order by name
    limit 12
  `;
  if (!rows.length) return "No people in your access.";
  return rows.map((row) => `#${s(row, "id")} ${s(row, "name")} · ${s(row, "email")} · ${s(row, "title")}`).join("\n");
}

async function myTasks(sql: Sql, actor: DeskUser) {
  const rows = await sql<Row>`select id, title, status, due_on, detail from staff_tasks where user_id = ${actor.userId} order by updated_at desc limit 20`;
  if (!rows.length) return "You have no personal tasks.";
  return rows.map((row) => `#${s(row, "id")} ${s(row, "status")} · ${s(row, "title")}${s(row, "due_on") ? ` · due ${s(row, "due_on")}` : ""}${s(row, "detail") ? ` · ${s(row, "detail").slice(0, 100)}` : ""}`).join("\n");
}

async function createOwnTask(sql: Sql, actor: DeskUser, args: Row) {
  if (actor.role === "viewer") throw new Error("View-only access cannot create a task.");
  const title = s(args, "title").trim().slice(0, 160);
  if (!title) throw new Error("Give the task a title.");
  const detail = s(args, "detail").trim().slice(0, 1000);
  const due = s(args, "due_on").trim().slice(0, 40);
  const rows = await sql<Row>`
    insert into staff_tasks (user_id, title, detail, due_on)
    values (${actor.userId}, ${title}, ${detail}, ${due})
    returning id
  `;
  await audit(sql, actor, "Agent created task", s(rows[0], "id"), title);
  return `Created task #${s(rows[0], "id")}: ${title}.`;
}

async function updateOwnTask(sql: Sql, actor: DeskUser, args: Row) {
  if (actor.role === "viewer") throw new Error("View-only access cannot change a task.");
  const id = numberArg(args.id);
  const rows = await sql<Row>`select id, title, detail, status, due_on from staff_tasks where id = ${id} and user_id = ${actor.userId} limit 1`;
  if (!rows[0]) throw new Error("That task is not yours.");
  const current = rows[0];
  const title = s(args, "title").trim().slice(0, 160) || s(current, "title");
  const detail = s(args, "detail").trim() ? s(args, "detail").trim().slice(0, 1000) : s(current, "detail");
  const status = ["open", "doing", "done"].includes(s(args, "status")) ? s(args, "status") : s(current, "status");
  const due = s(args, "due_on").trim() ? s(args, "due_on").trim().slice(0, 40) : s(current, "due_on");
  await sql`update staff_tasks set title = ${title}, detail = ${detail}, status = ${status}, due_on = ${due}, updated_at = now() where id = ${id}`;
  await audit(sql, actor, "Agent updated task", String(id), `${title} · ${status}`);
  return `Task #${id} is now ${status}: ${title}.`;
}

async function deleteOwnTask(sql: Sql, actor: DeskUser, id: number) {
  if (actor.role === "viewer") throw new Error("View-only access cannot delete a task.");
  const rows = await sql<Row>`delete from staff_tasks where id = ${id} and user_id = ${actor.userId} returning id`;
  if (!rows[0]) throw new Error("That task is not yours.");
  await audit(sql, actor, "Agent deleted task", String(id), "");
  return `Deleted task #${id}.`;
}

function note(logs: string[], line: string) {
  const text = line.replace(/\s+/g, " ").trim().slice(0, 360);
  if (text) logs.push(text);
}

function clip(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

async function ollamaMachine(sql: Sql, actor: DeskUser, stored: string, model: string, prompt: string, messages: ChatMessage[], files: ChatFile[], mode: ToolMode, logs: string[], onDelta?: (text: string) => void) {
  const origin = localOrigin("ollama-local", stored);
  const modelName = safeModel(model);
  if (mode !== "off") {
    try {
      return await openai(sql, actor, "ollama", modelName, prompt, messages, files, mode, logs, `${origin}/v1`, onDelta);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      if (toolRejected(message)) throw cause;
      note(logs, "Ollama on this machine did not take the desk tools. Asking the model directly.");
    }
  }
  try {
    const response = await openStream(`${origin}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelName, stream: true, messages: [{ role: "system", content: prompt }, ...messages.map((item) => ({ role: item.role, content: item.content }))] }),
    });
    let text = "";
    for await (const line of streamLines(response)) {
      const payload = JSON.parse(line) as Row;
      const piece = s(obj(payload.message), "content");
      if (piece) {
        text += piece;
        onDelta?.(piece);
      }
    }
    if (text.trim()) return text.trim();
  } catch {
    note(logs, "The Ollama service is not answering. Using the ollama command on this machine.");
  }
  const transcript = messages.map((item) => `${item.role}: ${item.content}`).join("\n");
  const answer = (await askOllamaCli(modelName, `${prompt}\n\n${transcript}`)).trim();
  if (!answer) throw new Error("Ollama returned nothing. Start it on this machine with ollama serve.");
  onDelta?.(answer);
  return answer;
}

async function openCodeMachine(model: string, stored: string, prompt: string, messages: ChatMessage[], logs: string[], onDelta?: (text: string) => void) {
  const modelName = safeModel(model);
  const origin = localOrigin("opencode-local", stored);
  const transcript = messages.map((item) => `${item.role === "assistant" ? "Assistant" : "User"}: ${item.content}`).join("\n\n");
  try {
    const created = await callJson(`${origin}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "MTS Agent" }),
    });
    const id = s(created, "id");
    if (!id) throw new Error("OpenCode did not open a session.");
    const [providerID, ...rest] = modelName.split("/");
    const modelID = rest.join("/");
    const result = await callJson(`${origin}/session/${encodeURIComponent(id)}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(modelID ? { model: { providerID, modelID } } : {}),
        system: `${prompt}\nAnswer in plain text. Do not edit files or run commands.`,
        parts: [{ type: "text", text: transcript }],
      }),
    });
    const parts = Array.isArray(result.parts) ? result.parts : [];
    const answer = parts.map((part) => s(obj(part), "text")).filter(Boolean).join("\n").trim() || s(result, "text");
    if (answer) {
      onDelta?.(answer);
      return answer;
    }
  } catch {
    note(logs, "The OpenCode server is not answering. Using the opencode command on this machine.");
  }
  const answer = (await askOpenCodeCli(modelName, `${prompt}\n\nAnswer in plain text only.\n\n${transcript}`)).trim();
  if (!answer) throw new Error("OpenCode returned nothing. Start it on this machine with opencode serve.");
  onDelta?.(answer);
  return answer;
}

async function complete(sql: Sql, actor: DeskUser, provider: ProviderId, apiKey: string, model: string, messages: ChatMessage[], files: ChatFile[], onDelta?: (text: string) => void) {
  const logs: string[] = [];
  note(logs, `Using ${provider} · ${model}.`);
  try {
    const answer = await answerWith(sql, actor, provider, apiKey, model, messages, files, logs, onDelta);
    return { answer, logs };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    if (!files.some((file) => file.type.startsWith("image/")) || !/image|vision|multimodal/i.test(message)) throw cause;
    note(logs, "This model cannot read images, so only the text was sent.");
    const answer = await answerWith(sql, actor, provider, apiKey, model, messages, files.filter((file) => !file.type.startsWith("image/")), logs, onDelta);
    return { answer, logs };
  }
}

async function answerWith(sql: Sql, actor: DeskUser, provider: ProviderId, apiKey: string, model: string, messages: ChatMessage[], files: ChatFile[], logs: string[], onDelta?: (text: string) => void) {
  const prompt = await promptFor(sql, actor);
  const base = CHAT_BASE[provider] || "https://api.openai.com/v1";
  const modes: ToolMode[] = provider === "anthropic" || provider === "gemini" ? ["full", "functions", "off"] : ["functions", "off"];
  let last: unknown;
  for (const mode of modes) {
    try {
      if (provider === "anthropic") return await anthropic(sql, actor, apiKey, model, prompt, messages, files, mode, logs, onDelta);
      if (provider === "gemini") return await gemini(sql, actor, apiKey, model, prompt, messages, files, mode, logs, onDelta);
      if (provider === "ollama") return await ollama(sql, actor, apiKey, model, prompt, messages, files, mode, logs, onDelta);
      if (provider === "ollama-local") return await ollamaMachine(sql, actor, apiKey, model, prompt, messages, files, mode, logs, onDelta);
      if (provider === "opencode-local") return await openCodeMachine(model, apiKey, prompt, messages, logs, onDelta);
      return await openai(sql, actor, apiKey, model, prompt, messages, files, mode, logs, base, onDelta);
    } catch (cause) {
      last = cause;
      const message = cause instanceof Error ? cause.message : "";
      if (/usage credits|API key was refused|empty reply/i.test(message) || !toolRejected(message)) throw cause;
      note(logs, mode === "off" ? "The provider refused the request." : "That tool setup was refused. Trying the next one.");
    }
  }
  throw last instanceof Error ? last : new Error("The model could not answer.");
}

function fileNote(files: ChatFile[]) {
  return files
    .filter((file) => !file.type.startsWith("image/"))
    .map((file) => {
      let text = "";
      try {
        text = Buffer.from(file.data, "base64").toString("utf8").replace(/\u0000/g, "").slice(0, 12000);
      } catch {
        text = "";
      }
      const readable = text.length > 0 && !text.slice(0, 200).includes("\uFFFD");
      return readable ? `Attached file ${file.name}:\n${text}` : `Attached file ${file.name}. The contents are not text, so they were not read.`;
    })
    .join("\n\n");
}

function withFiles(content: string, files: ChatFile[]) {
  const note = fileNote(files);
  return note ? `${content}\n\n${note}` : content;
}

const OUTPUT_CAP = 128000;

function outputCeiling(message: string) {
  if (!/token|max_tokens|max_completion|maxOutput|too large|exceed/i.test(message)) return 0;
  const found = [...message.matchAll(/\b(\d{3,7})\b/g)].map((item) => Number(item[1])).filter((value) => value >= 256 && value < OUTPUT_CAP);
  return found.length ? Math.max(...found) : 0;
}

async function openCapped(url: string, headers: Record<string, string>, secret: string, bodyFor: (limit: number, field: "max_tokens" | "max_completion_tokens") => Record<string, unknown>, field: "max_tokens" | "max_completion_tokens" = "max_tokens") {
  let limit = OUTPUT_CAP;
  let used = field;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await openStream(url, { method: "POST", headers, body: JSON.stringify(bodyFor(limit, used)) }, secret);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      if (/max_completion_tokens|unsupported parameter: ['"]?max_tokens/i.test(message) && used === "max_tokens") {
        used = "max_completion_tokens";
        continue;
      }
      const ceiling = outputCeiling(message);
      if (!ceiling || ceiling >= limit) throw cause;
      limit = ceiling;
    }
  }
  throw new Error("The model rejected the output length.");
}

async function openai(sql: Sql, actor: DeskUser, apiKey: string, model: string, prompt: string, messages: ChatMessage[], files: ChatFile[], mode: ToolMode, logs: string[], base = "https://api.openai.com/v1", onDelta?: (text: string) => void) {
  const images = files.filter((file) => file.type.startsWith("image/"));
  const history: Record<string, unknown>[] = [
    { role: "system", content: prompt },
    ...messages.map((message, index) => {
      const last = index === messages.length - 1;
      if (!last || (!images.length && !fileNote(files))) return { role: message.role, content: message.content };
      return {
        role: "user",
        content: [
          { type: "text", text: withFiles(message.content, files) },
          ...images.map((file) => ({ type: "image_url", image_url: { url: `data:${file.type};base64,${file.data}` } })),
        ],
      };
    }),
  ];
  for (let turn = 0; turn < 4; turn += 1) {
    const response = await openCapped(`${base}/chat/completions`, {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(base.includes("openrouter.ai") ? { "HTTP-Referer": "https://managetechservice.com", "X-Title": "Manage Tech Service" } : {}),
    }, apiKey, (limit, field) => ({
      model,
      messages: history,
      stream: true,
      [field]: limit,
      ...(mode === "off" ? {} : { tools: openaiTools() }),
    }), /^(o\d|gpt-5)/i.test(model) ? "max_completion_tokens" : "max_tokens");
    let text = "";
    let thought = "";
    const calls = new Map<number, { id: string; name: string; arguments: string }>();
    for await (const line of streamLines(response)) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      const payload = JSON.parse(data) as Row;
      const choice = Array.isArray(payload.choices) ? obj(payload.choices[0]) : {};
      const delta = obj(choice.delta);
      const piece = s(delta, "content");
      if (piece) {
        text += piece;
        onDelta?.(piece);
      }
      const reason = s(delta, "reasoning") || s(delta, "reasoning_content");
      if (reason) thought += reason;
      const bits = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
      for (const bit of bits) {
        const row = obj(bit);
        const index = Number(row.index) || 0;
        const current = calls.get(index) || { id: "", name: "", arguments: "" };
        const fn = obj(row.function);
        current.id = s(row, "id") || current.id;
        current.name = s(fn, "name") || current.name;
        current.arguments += s(fn, "arguments");
        calls.set(index, current);
      }
    }
    if (thought) note(logs, thought);
    const toolCalls = [...calls.values()].filter((call) => call.name);
    if (mode === "off" || !toolCalls.length) {
      if (!text) throw new Error("The model returned an empty reply.");
      return text;
    }
    history.push({
      role: "assistant",
      content: text,
      tool_calls: toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.arguments || "{}" } })),
    });
    for (const call of toolCalls) {
      const result = await runTool(sql, actor, call.name, call.arguments);
      note(logs, `${call.name} → ${clip(result)}`);
      history.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
  throw new Error("The model kept calling tools without a final answer.");
}

async function anthropic(sql: Sql, actor: DeskUser, apiKey: string, model: string, prompt: string, messages: ChatMessage[], files: ChatFile[], mode: ToolMode, logs: string[], onDelta?: (text: string) => void) {
  const images = files.filter((file) => file.type.startsWith("image/"));
  const history: Record<string, unknown>[] = messages.map((message, index) => {
    if (index !== messages.length - 1) return { role: message.role, content: message.content };
    return {
      role: "user",
      content: [
        { type: "text", text: withFiles(message.content, files) },
        ...images.map((file) => ({ type: "image", source: { type: "base64", media_type: file.type || "image/png", data: file.data } })),
      ],
    };
  });
  for (let turn = 0; turn < 4; turn += 1) {
    const response = await openCapped("https://api.anthropic.com/v1/messages", {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    }, apiKey, (limit) => ({ model, max_tokens: limit, stream: true, system: prompt, messages: history, ...(anthropicTools(mode) ? { tools: anthropicTools(mode) } : {}) }));
    const blocks: Row[] = [];
    for await (const line of streamLines(response)) {
      if (!line.startsWith("data:")) continue;
      const payload = JSON.parse(line.slice(5).trim()) as Row;
      const kind = s(payload, "type");
      if (kind === "content_block_start") {
        blocks.push({ ...obj(payload.content_block) });
      } else if (kind === "content_block_delta") {
        const index = Number(payload.index) || 0;
        const block = blocks[index] || {};
        const delta = obj(payload.delta);
        if (s(delta, "type") === "text_delta") {
          const piece = s(delta, "text");
          block.text = `${s(block, "text")}${piece}`;
          onDelta?.(piece);
        } else if (s(delta, "type") === "thinking_delta") {
          block.thinking = `${s(block, "thinking")}${s(delta, "thinking")}`;
        } else if (s(delta, "type") === "input_json_delta") {
          block.input_json = `${s(block, "input_json")}${s(delta, "partial_json")}`;
        }
        blocks[index] = block;
      }
    }
    for (const block of blocks) {
      if (s(block, "type") === "thinking" && s(block, "thinking")) note(logs, s(block, "thinking"));
      if (s(block, "type") === "tool_use") {
        try {
          block.input = JSON.parse(s(block, "input_json") || "{}");
        } catch {
          block.input = {};
        }
      }
    }
    const calls = blocks.filter((block) => s(block, "type") === "tool_use");
    const text = blocks.map((block) => (s(block, "type") === "text" ? s(block, "text") : "")).filter(Boolean).join("\n");
    if (mode === "off" || !calls.length) {
      if (!text) throw new Error("The model returned an empty reply.");
      return text;
    }
    history.push({ role: "assistant", content: blocks.map((block) => (s(block, "type") === "tool_use" ? { type: "tool_use", id: s(block, "id"), name: s(block, "name"), input: block.input } : block)) });
    history.push({
      role: "user",
      content: await Promise.all(calls.map(async (block) => {
        const result = await runTool(sql, actor, s(block, "name"), block.input);
        note(logs, `${s(block, "name")} → ${clip(result)}`);
        return { type: "tool_result", tool_use_id: s(block, "id"), content: result };
      })),
    });
  }
  throw new Error("The model kept calling tools without a final answer.");
}

async function gemini(sql: Sql, actor: DeskUser, apiKey: string, model: string, prompt: string, messages: ChatMessage[], files: ChatFile[], mode: ToolMode, logs: string[], onDelta?: (text: string) => void) {
  const images = files.filter((file) => file.type.startsWith("image/"));
  const contents: Record<string, unknown>[] = messages.map((message, index) => {
    const parts: Record<string, unknown>[] = [{ text: index === messages.length - 1 ? withFiles(message.content, files) : message.content }];
    if (index === messages.length - 1) {
      for (const file of images) parts.push({ inlineData: { mimeType: file.type || "image/png", data: file.data } });
    }
    return { role: message.role === "assistant" ? "model" : "user", parts };
  });
  const toolBody = geminiTools(mode);
  for (let turn = 0; turn < 4; turn += 1) {
    const response = await openCapped(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`, {
      "Content-Type": "application/json",
    }, apiKey, (limit) => ({
      systemInstruction: { parts: [{ text: prompt }] },
      contents,
      generationConfig: { maxOutputTokens: limit },
      ...(toolBody ? { tools: toolBody } : {}),
    }));
    const parts: Row[] = [];
    for await (const line of streamLines(response)) {
      if (!line.startsWith("data:")) continue;
      const payload = JSON.parse(line.slice(5).trim()) as Row;
      const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
      const chunk = Array.isArray(obj(obj(candidates[0]).content).parts) ? (obj(obj(candidates[0]).content).parts as unknown[]) : [];
      for (const part of chunk) {
        const row = obj(part);
        const piece = row.thought === true ? "" : s(row, "text");
        if (piece) onDelta?.(piece);
        if (row.thought === true && s(row, "text")) note(logs, s(row, "text"));
        parts.push(row);
      }
    }
    const calls = parts.filter((part) => part.functionCall);
    const text = parts.filter((part) => part.thought !== true).map((part) => s(part, "text")).filter(Boolean).join("");
    if (mode === "off" || !calls.length) {
      if (!text) throw new Error("The model returned an empty reply.");
      return text;
    }
    contents.push({ role: "model", parts });
    contents.push({
      role: "user",
      parts: await Promise.all(calls.map(async (part) => {
        const call = obj(part.functionCall);
        const result = await runTool(sql, actor, s(call, "name"), call.args);
        note(logs, `${s(call, "name")} → ${clip(result)}`);
        return { functionResponse: { name: s(call, "name"), response: { result } } };
      })),
    });
  }
  throw new Error("The model kept calling tools without a final answer.");
}

async function ollama(sql: Sql, actor: DeskUser, apiKey: string, model: string, prompt: string, messages: ChatMessage[], files: ChatFile[], mode: ToolMode, logs: string[], onDelta?: (text: string) => void) {
  if (!(await ollamaReady(apiKey))) throw new Error(ollamaCreditMessage());
  const images = files.filter((file) => file.type.startsWith("image/")).map((file) => file.data);
  const history: Record<string, unknown>[] = [
    { role: "system", content: prompt },
    ...messages.map((message, index) => {
      const last = index === messages.length - 1 && message.role === "user";
      return {
        role: message.role,
        content: last ? withFiles(message.content, files) : message.content,
        ...(last && images.length ? { images } : {}),
      };
    }),
  ];
  for (let turn = 0; turn < 4; turn += 1) {
    const response = await openStream("https://ollama.com/api/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: history, stream: true, options: { num_predict: -1 }, ...(mode === "off" ? {} : { tools: openaiTools() }) }),
    }, apiKey);
    let text = "";
    let thought = "";
    const calls: Row[] = [];
    for await (const line of streamLines(response)) {
      const payload = JSON.parse(line) as Row;
      const message = obj(payload.message);
      const piece = s(message, "content");
      if (piece) {
        text += piece;
        onDelta?.(piece);
      }
      if (s(message, "thinking")) thought += s(message, "thinking");
      if (Array.isArray(message.tool_calls)) calls.push(...message.tool_calls.map((call) => obj(call)));
    }
    if (thought) note(logs, thought);
    if (mode === "off" || !calls.length) {
      if (!text) throw new Error("The model returned an empty reply.");
      return text;
    }
    history.push({ role: "assistant", content: text, tool_calls: calls });
    for (const call of calls) {
      const fn = obj(call.function);
      const result = await runTool(sql, actor, s(fn, "name"), fn.arguments);
      note(logs, `${s(fn, "name")} → ${clip(result)}`);
      history.push({ role: "tool", tool_name: s(fn, "name"), content: result });
    }
  }
  throw new Error("The model kept calling tools without a final answer.");
}
