import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const MtsAgentPage = lazy(() => import("@/components/mts-agent-page").then((mod) => ({ default: mod.MtsAgentPage })));

export const Route = createFileRoute("/production/admin-portal/agent")({
  component: AgentRoute,
});

function AgentRoute() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Opening MTS Agent…</p>}>
      <MtsAgentPage />
    </Suspense>
  );
}
