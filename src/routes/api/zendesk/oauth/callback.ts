import { createFileRoute } from "@tanstack/react-router";
import { zendeskAdminCallback } from "@/lib/portal/zendesk-admin-grant";

export const Route = createFileRoute("/api/zendesk/oauth/callback")({
  server: {
    handlers: {
      GET: ({ request }) => zendeskAdminCallback(request),
    },
  },
});
