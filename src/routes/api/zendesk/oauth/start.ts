import { createFileRoute } from "@tanstack/react-router";
import { zendeskAdminStart } from "@/lib/portal/zendesk-admin-grant";

export const Route = createFileRoute("/api/zendesk/oauth/start")({
  server: {
    handlers: {
      GET: ({ request }) => zendeskAdminStart(request),
    },
  },
});
