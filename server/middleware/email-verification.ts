import { sharedEmailToken, verificationRedirect, verifySharedEmail } from "../../src/lib/auth/shared-email-verification";

interface VerifyEvent {
  url: URL;
  req: { method?: string };
}

export default async function emailVerificationMiddleware(event: VerifyEvent, next: () => unknown) {
  if ((event.req.method || "GET").toUpperCase() !== "GET") return next();
  const token = sharedEmailToken(event.url.pathname);
  if (!token) return next();
  const result = await verifySharedEmail(token).catch(() => "checked");
  return new Response(null, { status: 302, headers: { location: verificationRedirect(result) } });
}
