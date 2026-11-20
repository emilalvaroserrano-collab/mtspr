import { createFileRoute } from "@tanstack/react-router";
import { finishZendeskSocial } from "@/lib/auth/zendesk-social";

export const Route = createFileRoute("/api/zendesk/customer/callback")({
  server: {
    handlers: {
      GET: ({ request }) => finishZendeskSocial(request),
    },
  },
});
