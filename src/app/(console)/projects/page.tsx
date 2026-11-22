import { Suspense } from "react";
import { ScreenLoader } from "@/components/screen-loader";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createProjectAction } from "@/app/actions";
import { ProjectsPageClient } from "@/components/projects-page-client";
import { getSessionUser } from "@/server/auth/session";
import { workspaceContext } from "@/server/auth/workspace";
import { listIntegrations } from "@/server/integrations/service";
import { isTaskProvider } from "@/server/integrations/types";
import { listProducts } from "@/server/products/service";
import { loadProjectsPanel } from "@/server/projects/panel";
import {
  DEFAULT_PROJECTS_LAYOUT,
  parseProjectsLayout,
  parseProjectsLayoutCookie,
} from "@/lib/projects-layout";
import { withUser } from "@/server/db/client";
import { sql } from "drizzle-orm";

export const instant = false;

export default function ProjectsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  return (
    <Suspense fallback={<ScreenLoader />}>
      <ProjectsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ProjectsContent({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { current } = await workspaceContext(user.id);
  const params = await searchParams;
  const status = params.status === "archived" || params.status === "all" ? params.status : "active";
  // eslint-disable-next-line react-hooks/purity -- connection() already opted this request out of prerender
  const now = Date.now();
  const cookieStore = await cookies();
  const [panel, prefRows, integrations, products] = await Promise.all([
    loadProjectsPanel(user.id, current.id, { status, query: params.q }, now),
    withUser(user.id, (tx) =>
      tx.execute<{ projects_layout: unknown }>(sql`
        select projects_layout from user_preferences
        where user_id = current_setting('app.current_user_id', true)
      `),
    ),
    listIntegrations(user.id, current.id),
    listProducts(user.id, current.id, { status: "active" }),
  ]);
  const canWrite = current.role === "owner" || current.role === "admin";
  const linkableIntegrations = integrations
    .filter(
      (integration) =>
        isTaskProvider(integration.provider)
        && integration.status === "connected"
        && integration.hasCredential,
    )
    .map((integration) => ({
      id: integration.id,
      provider: integration.provider,
      displayName: integration.display_name,
    }));
  const productOptions = products.map((product) => ({
    id: product.id,
    name: product.name,
    parentId: product.parent_id,
  }));
  const layout =
    parseProjectsLayoutCookie(cookieStore.get("atrium_projects_layout")?.value) ??
    (prefRows[0]?.projects_layout != null
      ? parseProjectsLayout(prefRows[0].projects_layout)
      : DEFAULT_PROJECTS_LAYOUT);

  return (
    <ProjectsPageClient
      workspaceId={current.id}
      workspaceName={current.name}
      canWrite={canWrite}
      createAction={createProjectAction}
      integrations={linkableIntegrations}
      products={productOptions}
      initialLayout={layout}
      initial={panel}
    />
  );
}
