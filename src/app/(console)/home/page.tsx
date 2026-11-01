import { Suspense } from "react";
import { ScreenLoader } from "@/components/screen-loader";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { createProjectAction } from "@/app/actions";
import { HomeActionsMenu } from "@/components/home-actions-menu";
import { HomeNoProjects } from "@/components/home-no-projects";
import { HomeSourceFilter } from "@/components/home-source-filter";
import { ProviderIcon } from "@/components/provider-icon";
import { WorkspaceIconBadge } from "@/components/workspace-icon-picker";
import { Badge } from "@/components/ui/badge";
import { getSessionUser } from "@/server/auth/session";
import { workspaceContext } from "@/server/auth/workspace";
import { homeFeed } from "@/server/home/service";
import { providerCatalog } from "@/server/integrations/catalog";
import { listIntegrations } from "@/server/integrations/service";
import { isTaskProvider } from "@/server/integrations/types";
import { formatWhen } from "@/lib/utils";

export const instant = false;

type HomeSearchParams = {
  source?: string;
};

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<HomeSearchParams>;
}) {
  return (
    <Suspense fallback={<ScreenLoader />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeContent({
  searchParams,
}: {
  searchParams: Promise<HomeSearchParams>;
}) {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { current } = await workspaceContext(user.id);
  const params = await searchParams;
  // eslint-disable-next-line react-hooks/purity -- connection() already opted this request out of prerender
  const now = Date.now();
  const feed = await homeFeed(user.id, current.id, now, params.source);
  const source = feed.source;
  const sourceQuery = source ? `&source=${encodeURIComponent(source)}` : "";
  const dueBefore = feed.weekEnd;
  const staleCount = feed.health.filter((row) => row.stale || row.last_error).length;
  const attentionHref = `/tasks?priority=attention${sourceQuery}`;
  const dueSoonHref = `/tasks?dueBefore=${encodeURIComponent(dueBefore)}${sourceQuery}`;
  const blockedHref = `/tasks?status=blocked${sourceQuery}`;
  const openHref = `/tasks?status=open${sourceQuery}`;
  const inProgressHref = `/tasks?status=in_progress${sourceQuery}`;
  const doneHref = `/tasks?status=done${sourceQuery}`;
  const projectsHref = "/projects";
  const canManageProjects = current.role === "owner" || current.role === "admin";
  const showNoProjects = feed.stats.projects === 0;
  const [integrations, catalog] = showNoProjects
    ? await Promise.all([
        listIntegrations(user.id, current.id),
        providerCatalog(user.id, current.id),
      ])
    : [null, null];
  const callbackBase = (process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
  const taskIntegrations =
    integrations
      ?.filter((item) => isTaskProvider(item.provider) && item.status !== "revoked")
      .map((item) => ({
        id: item.id,
        provider: item.provider,
        status: item.status,
        display_name: item.display_name,
        hasCredential: item.hasCredential,
      })) ?? [];
  const taskProviders = catalog?.providers.filter((provider) => isTaskProvider(provider)) ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">{current.kind}</p>
          <div className="mt-1 flex items-center gap-3">
            <WorkspaceIconBadge icon={current.icon} kind={current.kind} className="size-11 text-xl" />
            <h1 className="text-4xl">{current.name}</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Workspace dashboard — open counts jump into filtered task lists, schedule, projects, and sync.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <HomeActionsMenu
            items={[
              {
                href: `/tasks${source ? `?source=${encodeURIComponent(source)}` : ""}`,
                label: "All tasks",
                icon: "ListTodo",
              },
              {
                href: `/tasks?view=board${sourceQuery}`,
                label: "Board",
                icon: "Columns3",
              },
              { href: "/schedule", label: "Schedule", icon: "CalendarRange" },
              { href: projectsHref, label: "Projects", icon: "FolderKanban" },
              { href: "/integrations", label: "Integrations", icon: "Plug" },
              { href: "/sync", label: "Sync", icon: "RefreshCw" },
            ]}
          />
          <div className="flex items-center" data-tour="source-filter">
            <HomeSourceFilter source={source} sources={feed.sources} />
          </div>
        </div>
      </div>

      <section data-tour="home-stats" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          href={attentionHref}
          label="Needs attention"
          value={feed.stats.attention}
          hint="Urgent and high priority"
        />
        <StatCard
          href={dueSoonHref}
          label="Due this week"
          value={feed.stats.dueSoon}
          hint="Open work with a deadline"
        />
        <StatCard
          href={blockedHref}
          label="Blocked"
          value={feed.stats.blocked}
          hint="Waiting on a dependency"
        />
        <StatCard
          href={doneHref}
          label="Done this week"
          value={feed.stats.doneWeek}
          hint="Closed in the last seven days"
        />
        <StatCard href={openHref} label="Open" value={feed.stats.open} hint="Not started yet" />
        <StatCard
          href={inProgressHref}
          label="In progress"
          value={feed.stats.inProgress}
          hint="Actively being worked"
        />
        <StatCard href={projectsHref} label="Projects" value={feed.stats.projects} hint="Active in this workspace" />
        <StatCard
          href={staleCount ? "/sync" : "/integrations"}
          label="Integrations"
          value={feed.stats.integrations}
          hint={staleCount ? `${staleCount} need attention` : "Connected providers"}
          warn={staleCount > 0}
        />
      </section>

      <section data-tour="home-panels" className="mb-8 grid gap-4 md:grid-cols-3 md:items-start">
        <Panel
          title="Needs attention"
          href={attentionHref}
          empty="Nothing urgent is open."
          count={feed.stats.attention}
        >
          {feed.priorities.map((task) => (
            <TaskLine
              key={String(task.id)}
              href={`/tasks/${String(task.id)}`}
              title={String(task.title)}
              provider={task.provider as string | null}
              tags={[
                { label: String(task.priority).replace("_", " "), tone: String(task.priority) },
                { label: String(task.project_name), tone: "project" },
              ]}
            />
          ))}
        </Panel>
        <Panel
          title="Due this week"
          href={dueSoonHref}
          secondaryHref="/schedule"
          secondaryLabel="Schedule"
          empty="No deadlines in the next seven days."
          count={feed.stats.dueSoon}
        >
          {feed.dueSoon.map((task) => (
            <TaskLine
              key={String(task.id)}
              href={`/tasks/${String(task.id)}`}
              title={String(task.title)}
              provider={task.provider as string | null}
              tags={[
                { label: formatWhen(task.due_at as Date), tone: "due" },
                { label: String(task.project_name), tone: "project" },
              ]}
            />
          ))}
        </Panel>
        <Panel
          title="Blocked"
          href={blockedHref}
          empty="No blocked tasks."
          count={feed.stats.blocked}
        >
          {feed.blocked.map((task) => (
            <TaskLine
              key={String(task.id)}
              href={`/tasks/${String(task.id)}`}
              title={String(task.title)}
              provider={task.provider as string | null}
              tags={[
                { label: "blocked", tone: "blocked" },
                { label: String(task.project_name), tone: "project" },
              ]}
            />
          ))}
        </Panel>
      </section>

      {showNoProjects ? (
        <HomeNoProjects
          workspaceId={current.id}
          canManage={canManageProjects}
          integrations={taskIntegrations}
          providers={taskProviders}
          oauth={catalog?.oauth ?? {}}
          callbackBase={callbackBase}
          createAction={createProjectAction}
        />
      ) : null}
    </div>
  );
}

function StatCard({
  href,
  label,
  value,
  hint,
  warn = false,
}: {
  href: string;
  label: string;
  value: number;
  hint: string;
  warn?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border bg-card p-4 transition hover:border-foreground/20 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
        {warn ? <AlertTriangle className="size-3.5 text-rose-600" aria-hidden="true" /> : null}
      </div>
      <p className="mt-2 text-3xl font-medium tabular-nums">{value}</p>
      <p className="mt-1 flex items-center gap-1 text-xs text-muted transition group-hover:text-foreground">
        {hint}
        <ArrowRight className="size-3 opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
      </p>
    </Link>
  );
}

function Panel({
  title,
  href,
  secondaryHref,
  secondaryLabel,
  empty,
  count,
  children,
}: {
  title: string;
  href: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}) {
  const list = Array.isArray(children) ? children : [children];
  const filled = list.some(Boolean);
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl">{title}</h2>
          <p className="text-xs text-muted">{count} total</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm">
          <Link href={href} className="inline-flex items-center gap-1 font-medium transition hover:underline">
            View all
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
          {secondaryHref && secondaryLabel ? (
            <Link href={secondaryHref} className="text-xs text-muted transition hover:text-foreground">
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>
      {!filled ? <p className="mt-3 text-sm text-muted">{empty}</p> : <div className="mt-3 space-y-3">{children}</div>}
    </section>
  );
}

function TaskLine({
  title,
  tags,
  provider,
  href,
}: {
  title: string;
  tags: Array<{ label: string; tone: string }>;
  provider: string | null;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-border/80 bg-background px-3 py-2.5 shadow-sm transition hover:border-foreground/20 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="font-medium leading-snug">{title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <Badge key={`${tag.tone}-${tag.label}`} tone={tag.tone}>
            {tag.label}
          </Badge>
        ))}
        <ProviderIcon provider={provider} />
      </div>
    </Link>
  );
}
