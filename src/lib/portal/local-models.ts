import { execFile } from "node:child_process";

export type LocalProvider = "ollama-local" | "opencode-local";

const DEFAULT_HOST: Record<LocalProvider, string> = {
  "ollama-local": "http://127.0.0.1:11434",
  "opencode-local": "http://127.0.0.1:4096",
};

export function isLocalProvider(value: string): value is LocalProvider {
  return value === "ollama-local" || value === "opencode-local";
}

export function localOrigin(provider: LocalProvider, stored = "") {
  const env = provider === "ollama-local" ? process.env.OLLAMA_HOST : process.env.OPENCODE_HOST;
  const raw = (stored.startsWith("http://") || stored.startsWith("https://") ? stored : env || DEFAULT_HOST[provider]).trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That address is not a local host.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Use an http address on this machine.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local") || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  if (!local) throw new Error("Use the address of this machine or the local network. A public address is not allowed.");
  return url.origin;
}

function runCli(command: string, args: string[], timeout = 8000) {
  return new Promise<string>((resolve, reject) => {
    execFile(command, args, { timeout, maxBuffer: 1_000_000 }, (error, stdout, stderr) => {
      if (stdout.trim()) resolve(stdout);
      else reject(new Error((stderr || error?.message || `${command} is not installed`).replace(/\s+/g, " ").trim().slice(0, 180)));
    });
  });
}

async function readJson(url: string, timeout = 2500) {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`${response.status}`);
  return (await response.json()) as unknown;
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Record<string, unknown>[] : [];
}

function text(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function listLocalModels(provider: LocalProvider, stored = "") {
  const origin = localOrigin(provider, stored);
  if (provider === "ollama-local") return listOllama(origin);
  return listOpenCode(origin);
}

async function listOllama(origin: string) {
  try {
    const payload = await readJson(`${origin}/api/tags`) as { models?: unknown };
    const names = rows(payload.models).map((row) => text(row, "name") || text(row, "model")).filter((name) => name && !/embed|whisper/i.test(name));
    if (names.length) return unique(names);
  } catch { /* the daemon may be down; the CLI is next */ }
  const listed = await runCli("ollama", ["list"]);
  const names = listed.split("\n").slice(1).map((line) => line.trim().split(/\s+/)[0] || "").filter((name) => name && name !== "NAME" && !/embed|whisper/i.test(name));
  if (!names.length) throw new Error("Ollama is installed, but no chat model is pulled yet.");
  return unique(names);
}

async function listOpenCode(origin: string) {
  const found: string[] = [];
  for (const path of ["/config/providers", "/provider"]) {
    try {
      collectModels(await readJson(`${origin}${path}`), found);
    } catch { /* try the CLI */ }
  }
  if (found.length) return unique(found);
  const listed = await runCli("opencode", ["models"]);
  const names = listed.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && !/\s/.test(line));
  if (!names.length) throw new Error("OpenCode is installed, but it has no models configured.");
  return unique(names);
}

function collectModels(value: unknown, into: string[], provider = "") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectModels(item, into, provider);
    return;
  }
  const row = value as Record<string, unknown>;
  const id = text(row, "id");
  const nextProvider = provider || id;
  const models = row.models;
  if (models && typeof models === "object" && !Array.isArray(models)) {
    for (const key of Object.keys(models)) into.push(key.includes("/") || !nextProvider ? key : `${nextProvider}/${key}`);
  }
  for (const item of rows(models)) {
    const model = text(item, "id") || text(item, "name");
    if (model) into.push(model.includes("/") || !nextProvider ? model : `${nextProvider}/${model}`);
  }
  for (const key of ["all", "providers", "data"]) collectModels(row[key], into, nextProvider);
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 80);
}

export function safeModel(value: string) {
  const model = value.trim();
  if (!/^[A-Za-z0-9_.:/@+-]{1,120}$/.test(model)) throw new Error("That model name is not valid.");
  return model;
}

export async function askOllamaCli(model: string, prompt: string) {
  const safe = safeModel(model);
  return runCli("ollama", ["run", safe, prompt.slice(0, 12000)], 120000);
}

export async function askOpenCodeCli(model: string, prompt: string) {
  const safe = safeModel(model);
  return runCli("opencode", ["run", "--model", safe, prompt.slice(0, 12000)], 120000);
}
