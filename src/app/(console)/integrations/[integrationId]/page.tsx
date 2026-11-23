import { Suspense } from "react";
import { ScreenLoader } from "@/components/screen-loader";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { fakeProjectAction, linkProjectAction, testConnectionAction } from "@/app/actions";
import { LinkProjectForm } from "@/components/link-project-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { getSessionUser } from "@/server/auth/session";
import { workspaceContext } from "@/server/auth/workspace";
import { listIntegrations, listRemoteProjects } from "@/server/integrations/service";

export const instant = false;

export default function IntegrationDetail({ params }: { params: Promise<{ integrationId: string }> }) {
  return (
    <Suspense fallback={<ScreenLoader />}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: { params: Promise<{ integrationId: string }> }) {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { integrationId } = await params;
  const { current } = await workspaceContext(user.id);
  const integration = (await listIntegrations(user.id, current.id)).find((item) => item.id === integrationId);
  if (!integration) notFound();
  if (integration.provider === "slack") redirect("/chats");
  if (integration.provider === "obsidian") redirect("/notes");
  if (integration.provider === "figma") redirect("/integrations");
  const canAdmin = current.role === "owner" || current.role === "admin";
  let projects: Awaited<ReturnType<typeof listRemoteProjects>> = [];
  let loadError: string | null = null;
  if (canAdmin && integration.hasCredential && integration.status !== "revoked") {
    try {
      projects = await listRemoteProjects(user.id, current.id, integration.id);
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Could not list provider projects";
    }
  }
  return (
    <div className="space-y-6">
      <div data-tour="connection-status">
        <h1 className="text-4xl">{integration.display_name}</h1>
        <div className="mt-2 flex gap-2">
          <Badge tone="external">{integration.provider}</Badge>
          <Badge tone={integration.status}>{integration.status}</Badge>
          <Badge tone={integration.hasCredential ? "synced" : "revoked"}>{integration.hasCredential ? "credential stored" : "credential removed"}</Badge>
        </div>
        <p className="mt-3 text-sm text-muted">Webhook endpoint: /api/webhooks/{integration.provider}/{integration.id}</p>
      </div>
      {canAdmin ? (
        <form data-tour="connection-test" action={testConnectionAction}>
          <input type="hidden" name="workspaceId" value={current.id} />
          <input type="hidden" name="integrationId" value={integration.id} />
          <Button type="submit" variant="outline">Test connection</Button>
        </form>
      ) : null}
      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      {integration.provider === "fake" && canAdmin ? (
        <form action={fakeProjectAction} className="flex gap-2">
          <input type="hidden" name="workspaceId" value={current.id} />
          <input type="hidden" name="integrationId" value={integration.id} />
          <Input name="name" placeholder="Remote project name" required />
          <Button type="submit">Add fake project</Button>
        </form>
      ) : null}
      {projects.length === 0 ? (
        <p className="text-sm text-muted">No provider projects were returned.</p>
      ) : (
        <div data-tour="connection-link" className="space-y-3">
          <div>
            <h2 className="text-2xl">Link a project</h2>
            <p className="text-sm text-muted">
              Filter by {integration.provider === "github" || integration.provider === "gitea" ? "owner or organization" : integration.provider === "gitlab" ? "group or namespace" : "namespace"} before linking.
            </p>
          </div>
          <LinkProjectForm
            workspaceId={current.id}
            integrationId={integration.id}
            projects={projects}
            provider={integration.provider}
            accountLabel={integration.display_name}
            action={linkProjectAction}
          />
        </div>
      )}
    </div>
  );
}
