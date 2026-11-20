import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

const KEY_ID = () => (process.env.ZENDESK_END_USER_JWT_KEY_ID || "app_6b00a0eaa858f26dd7106963").trim();
const SECRET = () => (process.env.ZENDESK_END_USER_JWT_SECRET || "").trim();

export function endUserExternalId(email: string) {
  return `mts:${email.trim().toLowerCase()}`;
}

export function endUserJwtConfigured() {
  return Boolean(SECRET());
}

export async function signZendeskEndUser(user: { email: string; name: string; externalId?: string }) {
  const secret = SECRET();
  if (!secret) return "";
  const email = user.email.trim().toLowerCase();
  const externalId = user.externalId || endUserExternalId(email);
  return new SignJWT({
    scope: "user",
    external_id: externalId,
    email,
    email_verified: true,
    name: user.name.trim() || email,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT", kid: KEY_ID() })
    .setIssuedAt()
    .setExpirationTime("1h")
    .setJti(randomUUID())
    .sign(new TextEncoder().encode(secret));
}

export async function readZendeskEndUserJwt(token: string) {
  const secret = SECRET();
  if (!secret || !token) return null;
  const { payload, protectedHeader } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ["HS256"],
  });
  if (protectedHeader.kid !== KEY_ID()) return null;
  return payload;
}
