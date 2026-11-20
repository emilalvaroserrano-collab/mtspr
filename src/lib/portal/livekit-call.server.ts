import { AccessToken, RoomAgentDispatch, RoomConfiguration } from "livekit-server-sdk";
import { getSql } from "@/lib/db";
import { customerBySession } from "./sessions";

type Row = Record<string, unknown>;

function text(row: Row | undefined, key: string) {
  const value = row?.[key];
  return value == null ? "" : String(value);
}

function number(row: Row | undefined, key: string) {
  const value = Number(row?.[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export async function mintSarahCall(sessionToken: string) {
  const url = (process.env.LIVEKIT_URL || "").trim();
  const apiKey = (process.env.LIVEKIT_API_KEY || "").trim();
  const apiSecret = (process.env.LIVEKIT_API_SECRET || "").trim();
  if (!url.startsWith("wss://") || !apiKey || !apiSecret) throw new Error("Sarah's phone line is not configured.");
  const sql = await getSql();
  const customer = await customerBySession(sql, sessionToken);
  if (!customer) throw new Error("Sign in again, then call Sarah.");
  const id = number(customer, "id");
  const email = text(customer, "email").trim().toLowerCase();
  const name = text(customer, "name").trim() || email;
  if (!id || !email) throw new Error("This account cannot start a support call.");
  const room = `mts-support-${crypto.randomUUID()}`;
  const token = new AccessToken(apiKey, apiSecret, {
    identity: `customer-${id}`,
    name,
    ttl: "15m",
    metadata: JSON.stringify({ email }),
  });
  token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
  token.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName: "mts-agent",
        metadata: JSON.stringify({ mts_customer_id: id, email }),
      }),
    ],
  });
  return { serverUrl: url, token: await token.toJwt() };
}
