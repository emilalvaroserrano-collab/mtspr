import { createFileRoute } from "@tanstack/react-router";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { requireUserId } from "@/lib/auth/verify.server";
import { streamDeskReply } from "@/lib/portal/mts-agent";

export const Route = createFileRoute("/api/agent/stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          assertSameSiteRequest();
        } catch {
          return Response.json({ error: "Forbidden." }, { status: 403 });
        }
        const header = request.headers.get("authorization") || "";
        const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
        let userId = "";
        try {
          userId = await requireUserId(bearer);
        } catch {
          return Response.json({ error: "Sign in first." }, { status: 401 });
        }
        const raw = await request.json().catch(() => ({}));
        const encoder = new TextEncoder();
        const body = new ReadableStream({
          async start(controller) {
            const send = (event: { type: "delta" | "log" | "done" | "error"; text?: string; logs?: string[]; chatId?: number }) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            };
            try {
              await streamDeskReply(userId, raw, send);
            } catch (cause) {
              send({ type: "error", text: cause instanceof Error ? cause.message : "The agent could not reply." });
            }
            controller.close();
          },
        });
        return new Response(body, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
