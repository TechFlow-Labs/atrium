import { Suspense } from "react";
import { ScreenLoader } from "@/components/screen-loader";
import Link from "next/link";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Archive, CircleDot, Layers } from "lucide-react";
import { createProjectAction } from "@/app/actions";
import { ProjectsBoard } from "@/components/projects-board";
import { getSessionUser } from "@/server/auth/session";
import { workspaceContext } from "@/server/auth/workspace";
import { listIntegrations } from "@/server/integrations/service";
import { isTaskProvider } from "@/server/integrations/types";
import { getProjectsAnalytics, listProjects } from "@/server/projects/service";
import {
  DEFAULT_PROJECTS_LAYOUT,
  parseProjectsLayout,
  parseProjectsLayoutCookie,
} from "@/lib/projects-layout";
import { cn } from "@/lib/utils";
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
  const [projects, analytics, prefRows, integrations] = await Promise.all([
    listProjects(user.id, current.id, { status, query: params.q }),
    getProjectsAnalytics(user.id, current.id, { status }, now),
    withUser(user.id, (tx) =>
      tx.execute<{ projects_layout: unknown }>(sql`
        select projects_layout from user_preferences
        where user_id = current_setting('app.current_user_id', true)
      `),
    ),
    listIntegrations(user.id, current.id),
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
  const scopeLabel =
    status === "archived" ? "archived projects" : status === "all" ? "all projects" : "active projects";
  const layout =
    parseProjectsLayoutCookie(cookieStore.get("atrium_projects_layout")?.value) ??
    (prefRows[0]?.projects_layout != null
      ? parseProjectsLayout(prefRows[0].projects_layout)
      : DEFAULT_PROJECTS_LAYOUT);

  const statusNav = (
    <nav data-tour="project-status" className="flex items-center gap-1 rounded-md border bg-card p-0.5 text-sm" aria-label="Project status">
      {(
        [
          { href: "/projects", value: "active", label: "Active", icon: CircleDot },
          { href: "/projects?status=archived", value: "archived", label: "Archived", icon: Archive },
          { href: "/projects?status=all", value: "all", label: "All", icon: Layers },
        ] as const
      ).map(({ href, value, label, icon: Icon }) => {
        const active = status === value;
        return (
          <Link
            key={value}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 transition",
              active
                ? "bg-foreground text-background"
                : "text-muted hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <ProjectsBoard
      initialLayout={layout}
      workspaceId={current.id}
      workspaceName={current.name}
      scopeLabel={scopeLabel}
      canWrite={canWrite}
      createAction={createProjectAction}
      integrations={linkableIntegrations}
      statusNav={statusNav}
      portfolio={analytics.portfolio}
      taskStats={analytics.tasks}
      busiest={analytics.busiest}
      projects={projects}
    />
  );
}
