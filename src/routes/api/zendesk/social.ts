import { createFileRoute } from "@tanstack/react-router";
import { startZendeskSocial } from "@/lib/auth/zendesk-social";

export const Route = createFileRoute("/api/zendesk/social")({
  server: {
    handlers: {
      GET: ({ request }) => startZendeskSocial(request),
    },
  },
});
