import { Suspense } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Circle,
  CircleDot,
  Gauge,
  ListTodo,
  Siren,
} from "lucide-react";
import { ScreenLoader } from "@/components/screen-loader";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { archiveProjectAction, createMilestoneAction, createTaskAction, mappingAction, publishAction, updateProjectAction } from "@/app/actions";
import { OpenInProviderButton, ProviderIcon } from "@/components/provider-icon";
import {
  buildProjectDashboardStats,
  ProjectStatCard,
  ProjectStatusBreakdown,
  ProjectTaskLine,
  ProjectTaskPanel,
} from "@/components/project-dashboard";
import { TaskForm } from "@/components/task-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/field";
import { getSessionUser } from "@/server/auth/session";
import { workspaceContext } from "@/server/auth/workspace";
import { getProject, listMilestones } from "@/server/projects/service";
import { listTasks } from "@/server/tasks/service";
import { sql } from "drizzle-orm";
import { withUser } from "@/server/db/client";
import { projectDisplayName } from "@/lib/project-display";
import { formatWhen } from "@/lib/utils";

export const instant = false;

export default function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  return (
    <Suspense fallback={<ScreenLoader />}>
      <ProjectContent params={params} />
    </Suspense>
  );
}

async function ProjectContent({ params }: { params: Promise<{ projectId: string }> }) {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { projectId } = await params;
  const { current } = await workspaceContext(user.id);
  const project = await getProject(user.id, current.id, projectId);
  if (!project) notFound();
  const tasks = await listTasks(user.id, current.id, { projectId });
  const milestones = await listMilestones(user.id, current.id, projectId);
  const records = await withUser(user.id, (tx) => tx.execute(sql`
    select entity_type, provider_id, raw from external_records
    where workspace_id = ${current.id}::uuid and local_entity_id is null
      and entity_type = 'pull_request'
    order by updated_at desc limit 20
  `));
  const canAdmin = current.role === "owner" || current.role === "admin";
  const canWrite = canAdmin || current.role === "member";
  const mappings = await withUser(user.id, (tx) => tx.execute<{ field_mappings: { status?: Record<string, string>; priority?: Record<string, string> } }>(sql`
    select field_mappings from project_connections where project_id = ${projectId}::uuid
  `));
  const map = mappings[0]?.field_mappings;
  // eslint-disable-next-line react-hooks/purity -- connection() already opted this request out of prerender
  const now = Date.now();
  const stats = buildProjectDashboardStats(tasks, now);
  const title = projectDisplayName(project);
  const projectFilter = encodeURIComponent(project.id);
  const openish = (status: string) => status === "open" || status === "in_progress" || status === "blocked";
  const attentionTasks = tasks
    .filter((task) => openish(task.status) && (task.priority === "urgent" || task.priority === "high"))
    .slice(0, 5);
  const inProgressTasks = tasks.filter((task) => task.status === "in_progress").slice(0, 5);
  const blockedTasks = tasks.filter((task) => task.status === "blocked").slice(0, 5);
  const recentTasks = [...tasks]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 8);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            <Link href="/projects" className="transition hover:text-foreground">
              Projects
            </Link>
            {" · "}
            {project.ownership_mode} project
          </p>
          <h1 className="text-4xl">{title}</h1>
          {project.nickname?.trim() ? <p className="mt-1 text-sm text-muted">{project.name}</p> : null}
          <p className="mt-2 max-w-2xl text-sm text-muted">{project.description || "No description yet."}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={project.ownership_mode === "native" ? "native" : "external"}>{project.ownership_mode}</Badge>
            {project.provider ? <Badge tone="external">{project.provider}</Badge> : null}
            {project.provider_project_url ? (
              <OpenInProviderButton provider={project.provider} href={project.provider_project_url} />
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/tasks?project=${projectFilter}`}>All tasks</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/tasks?view=board&project=${projectFilter}`}>Board</Link>
          </Button>
          {canWrite ? (
            <TaskForm
              workspaceId={current.id}
              projectId={project.id}
              returnTo={`/projects/${project.id}`}
              action={createTaskAction}
            />
          ) : null}
          {canAdmin ? (
            <form action={archiveProjectAction}>
              <input type="hidden" name="workspaceId" value={current.id} />
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="archived" value={project.status === "active" ? "true" : "false"} />
              <Button variant="outline" type="submit">{project.status === "active" ? "Archive" : "Restore"}</Button>
            </form>
          ) : null}
        </div>
      </div>

      <section data-tour="project-counts" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ProjectStatCard
          href={`/tasks?project=${projectFilter}&priority=attention`}
          label="Needs attention"
          value={stats.attention}
          hint="Urgent and high priority"
          icon={Siren}
          iconClassName="text-rose-600"
        />
        <ProjectStatCard
          href={`/tasks?project=${projectFilter}&status=in_progress`}
          label="In progress"
          value={stats.inProgress}
          hint="Actively being worked"
          icon={CircleDot}
          iconClassName="text-amber-500"
        />
        <ProjectStatCard
          href={`/tasks?project=${projectFilter}&status=blocked`}
          label="Blocked"
          value={stats.blocked}
          hint="Waiting on a dependency"
          icon={AlertTriangle}
          iconClassName="text-rose-500"
        />
        <ProjectStatCard
          href={`/tasks?project=${projectFilter}&status=done`}
          label="Done this week"
          value={stats.doneWeek}
          hint="Closed in the last seven days"
          icon={CheckCircle2}
          iconClassName="text-emerald-500"
        />
        <ProjectStatCard
          href={`/tasks?project=${projectFilter}&status=open`}
          label="Open"
          value={stats.open}
          hint="Not started yet"
          icon={Circle}
          iconClassName="text-sky-500"
        />
        <ProjectStatCard
          href={`/tasks?project=${projectFilter}`}
          label="Due soon"
          value={stats.dueSoon}
          hint="Deadlines in the next seven days"
          icon={CalendarClock}
          iconClassName="text-amber-500"
        />
        <ProjectStatCard
          href={`/tasks?project=${projectFilter}`}
          label="All tasks"
          value={stats.total}
          hint="Everything in this project"
          icon={ListTodo}
          iconClassName="text-stone-400"
        />
        <ProjectStatCard
          href={`/tasks?project=${projectFilter}&status=done`}
          label="Completion"
          value={`${stats.completion}%`}
          hint={`${stats.done} of ${stats.open + stats.inProgress + stats.blocked + stats.done} active`}
          icon={Gauge}
          iconClassName="text-emerald-500"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <ProjectStatusBreakdown stats={stats} />
        <section className="rounded-lg border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl">Milestones</h2>
              <p className="text-xs text-muted">{milestones.length} tracked</p>
            </div>
          </div>
          {project.ownership_mode !== "native" ? (
            <p className="mt-3 text-sm text-muted">Milestones for external projects stay with the provider.</p>
          ) : null}
          {milestones.length === 0 && project.ownership_mode === "native" ? (
            <p className="mt-3 text-sm text-muted">No milestones yet.</p>
          ) : null}
          <ul className="mt-3 space-y-2">
            {milestones.slice(0, 6).map((milestone) => (
              <li key={String(milestone.id)} className="rounded-md border bg-background px-3 py-2 text-sm">
                {String(milestone.name)} · {formatWhen(milestone.due_at as Date | null)} · {String(milestone.status)}
              </li>
            ))}
          </ul>
          {canAdmin && project.ownership_mode === "native" ? (
            <form action={createMilestoneAction} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="workspaceId" value={current.id} />
              <input type="hidden" name="projectId" value={project.id} />
              <Input name="name" placeholder="Milestone name" required />
              <Input name="dueAt" type="date" />
              <Button type="submit">Add milestone</Button>
            </form>
          ) : null}
        </section>
      </section>

      <section className="grid gap-4 md:grid-cols-3 md:items-start">
        <ProjectTaskPanel
          title="Needs attention"
          href={`/tasks?project=${projectFilter}&priority=attention`}
          empty="Nothing urgent is open."
          count={stats.attention}
        >
          {attentionTasks.map((task) => (
            <ProjectTaskLine key={task.id} task={task} />
          ))}
        </ProjectTaskPanel>
        <ProjectTaskPanel
          title="In progress"
          href={`/tasks?project=${projectFilter}&status=in_progress`}
          empty="No work is in progress."
          count={stats.inProgress}
        >
          {inProgressTasks.map((task) => (
            <ProjectTaskLine key={task.id} task={task} />
          ))}
        </ProjectTaskPanel>
        <ProjectTaskPanel
          title="Blocked"
          href={`/tasks?project=${projectFilter}&status=blocked`}
          empty="Nothing is blocked."
          count={stats.blocked}
        >
          {blockedTasks.map((task) => (
            <ProjectTaskLine key={task.id} task={task} />
          ))}
        </ProjectTaskPanel>
      </section>

      <section data-tour="project-updates">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl">Recent tasks</h2>
            <p className="text-sm text-muted">Latest updates across this project.</p>
          </div>
          <Link
            href={`/tasks?project=${projectFilter}`}
            className="text-sm font-medium transition hover:underline"
          >
            Open full list
          </Link>
        </div>
        {recentTasks.length === 0 ? <p className="mt-3 text-sm text-muted">This project has no tasks yet.</p> : null}
        <ul className="mt-3 divide-y rounded-lg border bg-card">
          {recentTasks.map((task) => (
            <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm">
              <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1 transition-colors hover:text-foreground">
                <p className="font-medium underline-offset-2 hover:underline">{task.title}</p>
                <p className="text-xs text-muted">
                  {task.status.replace("_", " ")} · {task.priority}
                  {task.due_at ? ` · due ${formatWhen(task.due_at)}` : ""}
                </p>
              </Link>
              <ProviderIcon provider={task.provider} />
            </li>
          ))}
        </ul>
      </section>

      {records.length > 0 ? (
        <section>
          <h2 className="text-2xl">Pull requests</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {records.map((record) => (
              <li key={String(record.provider_id)} className="rounded-md border bg-card px-3 py-2">
                #{String(record.provider_id)} {String((record.raw as { title?: string }).title ?? "")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(canAdmin || map) ? (
        <details data-tour="project-manage" className="rounded-lg border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden">
            Manage project
            <span className="ml-2 text-xs font-normal text-muted">Settings, mappings, and publishing</span>
          </summary>
          <div className="space-y-6 border-t px-4 py-4">
            {canAdmin ? (
              <form action={updateProjectAction} className="grid gap-3 md:grid-cols-2">
                <input type="hidden" name="workspaceId" value={current.id} />
                <input type="hidden" name="projectId" value={project.id} />
                <div>
                  <Label htmlFor="nickname">Nickname</Label>
                  <Input
                    id="nickname"
                    name="nickname"
                    defaultValue={project.nickname ?? ""}
                    placeholder="Friendly name in Atrium"
                    className="mt-1"
                    maxLength={80}
                  />
                </div>
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={project.name}
                    className="mt-1"
                    readOnly={project.ownership_mode === "external"}
                  />
                  {project.ownership_mode === "external" ? (
                    <p className="mt-1 text-xs text-muted">
                      Provider name stays as the source of truth. Use nickname for a shorter label.
                    </p>
                  ) : null}
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" defaultValue={project.description} className="mt-1" />
                </div>
                <Button type="submit">Save project</Button>
              </form>
            ) : null}
            {project.ownership_mode === "native" && project.integration_id && canAdmin ? (
              <form action={publishAction} className="rounded-md border bg-background p-4 text-sm">
                <input type="hidden" name="workspaceId" value={current.id} />
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="enabled" value={project.publish_outbound ? "false" : "true"} />
                <p>
                  Outbound publishing is {project.publish_outbound ? "on" : "off"}. Native fields stay authoritative
                  here. Turning publishing on sends changes to the provider as an explicit sync.
                </p>
                <Button className="mt-3" variant="outline" type="submit">
                  {project.publish_outbound ? "Stop publishing" : "Publish to provider"}
                </Button>
              </form>
            ) : null}
            {map && canAdmin ? (
              <form action={mappingAction}>
                <h3 className="text-lg font-medium">Field mappings</h3>
                <p className="mt-1 text-sm text-muted">
                  Map Atrium statuses and priorities onto provider values. Linear status changes need a state id, not a
                  display name.
                </p>
                <input type="hidden" name="workspaceId" value={current.id} />
                <input type="hidden" name="projectId" value={project.id} />
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {(["open", "in_progress", "blocked", "done", "cancelled"] as const).map((status) => (
                    <label key={status} className="text-sm">
                      {status}
                      <Input name={`status_${status}`} defaultValue={map.status?.[status] ?? ""} className="mt-1" />
                    </label>
                  ))}
                  {(["none", "low", "medium", "high", "urgent"] as const).map((priority) => (
                    <label key={priority} className="text-sm">
                      {priority}
                      <Input name={`priority_${priority}`} defaultValue={map.priority?.[priority] ?? ""} className="mt-1" />
                    </label>
                  ))}
                </div>
                <Button className="mt-3" type="submit">
                  Save mappings
                </Button>
              </form>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
