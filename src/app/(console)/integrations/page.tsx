import { Suspense } from "react";
import { ScreenLoader } from "@/components/screen-loader";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AgentsPanel } from "@/components/agents-panel";
import { IntegrationsOnboarding } from "@/components/integrations-onboarding";
import { McpPanel } from "@/components/mcp-panel";
import { getSessionUser } from "@/server/auth/session";
import { workspaceContext } from "@/server/auth/workspace";
import { providerCatalog } from "@/server/integrations/catalog";
import { listIntegrations } from "@/server/integrations/service";
import { listWorkspaceAgents } from "@/server/agents/service";
import { listMcpTokens, mcpServerUrl } from "@/server/mcp/tokens";

export const instant = false;

export default function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <Suspense fallback={<ScreenLoader />}>
      <IntegrationsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function IntegrationsContent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { workspaces, current } = await workspaceContext(user.id);
  const [integrations, tokens, agents] = await Promise.all([
    listIntegrations(user.id, current.id),
    listMcpTokens(user.id),
    listWorkspaceAgents(user.id, current.id),
  ]);
  const canAdmin = current.role === "owner" || current.role === "admin";
  const { providers, oauth, githubApp } = await providerCatalog(user.id, current.id);
  const callbackBase = (process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
  const params = await searchParams;
  return (
    <div className="space-y-10">
      <div data-tour="integrations-providers">
        <IntegrationsOnboarding
          callbackBase={callbackBase}
          workspaceId={current.id}
          integrations={integrations}
          providers={providers}
          oauth={oauth}
          githubApp={githubApp}
          canAdmin={canAdmin}
          error={params.error ?? null}
        />
      </div>
      <AgentsPanel workspaceId={current.id} agents={agents} canAdmin={canAdmin} />
      <div data-tour="integrations-mcp">
        <McpPanel
          serverUrl={mcpServerUrl()}
          workspaces={workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name }))}
          tokens={tokens}
          currentWorkspaceId={current.id}
        />
      </div>
    </div>
  );
}
