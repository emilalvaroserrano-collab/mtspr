import { createFileRoute } from "@tanstack/react-router";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { requireUserId } from "@/lib/auth/verify.server";

function readEnvFile(file: string) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function envValue(name: string) {
  const live = (process.env[name] || "").trim();
  if (live) return live;
  const starts = [process.cwd()];
  try {
    starts.push(dirname(fileURLToPath(import.meta.url)));
  } catch {
    /* bundled without a file URL */
  }
  const seen = new Set<string>();
  for (const start of starts) {
    let dir = start;
    for (let step = 0; step < 6; step += 1) {
      if (seen.has(dir)) break;
      seen.add(dir);
      const text = readEnvFile(join(dir, ".env"));
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 1 || trimmed.slice(0, eq) !== name) continue;
        const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if (value) return value;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return "";
}

function spoken(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 4000);
}

async function storedVoiceKey() {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ api_key: string }>`select api_key from agent_provider_keys where provider = 'elevenlabs' limit 1`;
    return (rows[0]?.api_key || "").trim();
  } catch {
    return "";
  }
}

async function elevenLabs(text: string, requested?: string) {
  const key = (await storedVoiceKey()) || envValue("ELEVENLABS_API_KEY") || "sk_3e9b1dc7ed2f360adfbbd12b0f0bd4aa7122fa5eff29b1ab";
  const voice = /^[A-Za-z0-9]{10,40}$/.test(requested || "") ? requested! : "cgSgspJ2msm6clMCkdW9";
  const model = envValue("ELEVENLABS_MODEL_ID") || "eleven_v4_turbo";
  if (!key) return Response.json({ error: "Add ELEVENLABS_API_KEY to use ElevenLabs." }, { status: 503 });
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: model }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) return Response.json({ error: "The ElevenLabs voice could not read that." }, { status: 502 });
  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length) return Response.json({ error: "ElevenLabs returned no audio." }, { status: 502 });
  return Response.json({ audio: audio.toString("base64"), type: "audio/mpeg" });
}

const SAVANNAH = "default_de4d191ca7574982";

const ERGO_VOICES = [
  ["Savannah", SAVANNAH],
  ["Imogen", "default_b78b28baf5c31a1d"],
  ["Willow", "default_940eaff39a929da0"],
  ["Morgana", "default_40a3ba1017bfb68a"],
  ["Sakura", "default_c5e098c322aae901"],
  ["Wyatt", "default_34370fd91e3484ef"],
  ["Cillian", "default_2c5123a959875341"],
  ["Jett", "default_c95cf57259ed7313"],
  ["Rupert", "default_3765f0d1140c05c0"],
  ["Thaddeus", "default_3c00e421e684f949"],
  ["Gaspard", "default_517319c805b927e9"],
  ["Liesel", "default_09d206a5b067ae71"],
  ["Wolfgang", "default_ec650ef042ed1f14"],
  ["Ananya", "default_f76cf78a50cf8496"],
  ["Arjun", "default_849a62ace1f85759"],
  ["Ginevra", "default_792987ff6236e50d"],
  ["Lorenzo", "default_ccb71e6596453e72"],
  ["Minjun", "default_aa6e36b246dc01f9"],
  ["Seoyeon", "default_b7a257a5b1478493"],
  ["Haoran", "default_d8a9b688b64e638d"],
  ["Meilin", "default_eaee7325255d4783"],
  ["Leonor", "default_e11f53895cad62fa"],
  ["Thiago", "default_4562e98e005b69cc"],
  ["Rodrigo", "default_87250baa043e5bba"],
  ["Ximena", "default_43e790fc116fd62a"],
  ["Chaitanya", "default_26fb443b7759bce0"],
  ["Sravya", "default_c3bb44b62cf13a5c"],
].map(([name, id]) => ({ id, name }));

const JESSICA = "cgSgspJ2msm6clMCkdW9";

async function voiceCatalog(provider: string) {
  if (provider === "ergo") return { voices: ERGO_VOICES, default: SAVANNAH };
  const key = (await storedVoiceKey()) || envValue("ELEVENLABS_API_KEY") || "sk_3e9b1dc7ed2f360adfbbd12b0f0bd4aa7122fa5eff29b1ab";
  const response = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key } });
  if (!response.ok) return { voices: [{ id: JESSICA, name: "Jessica" }], default: JESSICA };
  const data = await response.json() as { voices?: { voice_id?: string; name?: string }[] };
  const voices = (data.voices || [])
    .map((item) => ({ id: item.voice_id || "", name: item.name || item.voice_id || "" }))
    .filter((item) => item.id);
  voices.sort((a, b) => Number(/^jessica\b/i.test(b.name)) - Number(/^jessica\b/i.test(a.name)) || a.name.localeCompare(b.name));
  const jessica = voices.find((item) => /^jessica\b/i.test(item.name));
  return { voices, default: jessica?.id || JESSICA };
}

async function allVoices() {
  const eleven = await voiceCatalog("elevenlabs");
  return {
    groups: [
      { id: "ergo", label: "Ergo", voices: ERGO_VOICES },
      { id: "elevenlabs", label: "ElevenLabs", voices: eleven.voices },
    ],
    default: { provider: "ergo", id: SAVANNAH },
  };
}

export const Route = createFileRoute("/api/agent/speak")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          assertSameSiteRequest();
        } catch {
          return Response.json({ error: "Forbidden." }, { status: 403 });
        }
        const header = request.headers.get("authorization") || "";
        const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
        try {
          await requireUserId(bearer);
        } catch {
          return Response.json({ error: "Sign in first." }, { status: 401 });
        }
        return Response.json(await allVoices());
      },
      POST: async ({ request }) => {
        try {
          assertSameSiteRequest();
        } catch {
          return Response.json({ error: "Forbidden." }, { status: 403 });
        }
        const header = request.headers.get("authorization") || "";
        const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
        try {
          await requireUserId(bearer);
        } catch {
          return Response.json({ error: "Sign in first." }, { status: 401 });
        }
        const raw = await request.json().catch(() => ({})) as { text?: string; provider?: string; voice?: string };
        const text = spoken(typeof raw.text === "string" ? raw.text : "");
        if (!text) return Response.json({ error: "Nothing to read." }, { status: 400 });
        const picked = typeof raw.voice === "string" ? raw.voice : "";
        if (raw.provider === "elevenlabs") return elevenLabs(text, picked);
        return Response.json({ error: "Choose Ergo or ElevenLabs." }, { status: 400 });
      },
    },
  },
});
