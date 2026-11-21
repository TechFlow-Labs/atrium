"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, FolderKanban, Link2 } from "lucide-react";
import {
  ProviderIcon,
  providerAccents,
  providerKey,
  providerLabel,
} from "@/components/provider-icon";
import { TaskDeleteDialog } from "@/components/task-delete-dialog";
import { PriorityIcon, StatusIcon, SyncStateIcon, syncStateLabel } from "@/components/task-meta-icons";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  groupTasksByLinks,
  relationsBetweenTasks,
  type RelationDescriptor,
  type TaskLinkEdge,
} from "@/lib/task-link-groups";
import { cn, formatWhen } from "@/lib/utils";

function taskProviderAccent(provider: string | null | undefined) {
  return providerAccents[providerKey(provider)] ?? providerAccents.native!;
}

export type TaskListItem = {
  id: string;
  syncState: string;
  provider: string | null;
  externalUrl: string | null;
  title: string;
  description: string;
  status: string;
  priority: string;
  dueAt: Date | string | null;
  projectId?: string;
  projectName: string;
  codebaseLabel?: string | null;
  assigneeLabel: string | null;
};

function groupTasksByProject(tasks: TaskListItem[]): Array<{
  projectId: string;
  projectName: string;
  tasks: TaskListItem[];
}> {
  const groups: Array<{ projectId: string; projectName: string; tasks: TaskListItem[] }> = [];
  const indexById = new Map<string, number>();
  for (const task of tasks) {
    const projectId = task.projectId || task.projectName || "unknown";
    const existing = indexById.get(projectId);
    if (existing == null) {
      indexById.set(projectId, groups.length);
      groups.push({ projectId, projectName: task.projectName || "Untitled project", tasks: [task] });
      continue;
    }
    groups[existing]!.tasks.push(task);
  }
  return groups;
}

export function TaskList({
  tasks,
  canWrite,
  workspaceId,
  providerTileStyles = true,
  groupRelated = true,
  groupByProject = false,
  linkEdges = [],
}: {
  tasks: TaskListItem[];
  canWrite: boolean;
  workspaceId: string;
  providerTileStyles?: boolean;
  groupRelated?: boolean;
  /** When filtering by product, cluster issues under each project. */
  groupByProject?: boolean;
  linkEdges?: TaskLinkEdge[];
}) {
  if (groupByProject) {
    const projectGroups = groupTasksByProject(tasks);
    return (
      <div className="space-y-4" data-reveal-items="">
        {projectGroups.map((group) => (
          <ProjectIssueGroup
            key={group.projectId}
            projectId={group.projectId}
            projectName={group.projectName}
            tasks={group.tasks}
            canWrite={canWrite}
            workspaceId={workspaceId}
            providerTileStyles={providerTileStyles}
          />
        ))}
      </div>
    );
  }

  if (!groupRelated || linkEdges.length === 0) {
    return (
      <ul className="divide-y overflow-hidden rounded-lg border bg-card" data-reveal-items="">
        {tasks.map((task) => (
          <TaskListRow
            key={task.id}
            task={task}
            canWrite={canWrite}
            workspaceId={workspaceId}
            providerTileStyles={providerTileStyles}
          />
        ))}
      </ul>
    );
  }

  const segments = groupTasksByLinks(tasks, linkEdges);

  return (
    <div className="space-y-3" data-reveal-items="">
      {segments.map((segment) => {
        if (segment.kind === "single") {
          return (
            <ul key={segment.task.id} className="overflow-hidden rounded-lg border bg-card">
              <TaskListRow
                task={segment.task}
                canWrite={canWrite}
                workspaceId={workspaceId}
                providerTileStyles={providerTileStyles}
              />
            </ul>
          );
        }
        return (
          <section
            key={segment.groupId}
            className="overflow-hidden rounded-lg border border-primary/20 bg-muted/15 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_8%,transparent)]"
            aria-label={`${segment.tasks.length} related tasks`}
          >
            <div className="flex items-center gap-2 border-b border-primary/10 px-3 py-2 text-xs font-medium text-muted sm:px-4">
              <Link2 className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>
                {segment.tasks.length} related
              </span>
            </div>
            <ul className="divide-y divide-border/80 bg-card/80">
              {segment.tasks.map((task, index) => {
                const previous = segment.tasks[index - 1];
                const relations = previous
                  ? relationsBetweenTasks(previous, task, linkEdges)
                  : [];
                return (
                  <TaskListRow
                    key={task.id}
                    task={task}
                    canWrite={canWrite}
                    workspaceId={workspaceId}
                    providerTileStyles={providerTileStyles}
                    related
                    relations={
                      previous
                        ? relations.length > 0
                          ? relations
                          : [{
                              subject: previous.title,
                              verb: "related to",
                              object: task.title,
                              subjectIsUpper: true,
                            }]
                        : undefined
                    }
                  />
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ProjectIssueGroup({
  projectId,
  projectName,
  tasks,
  canWrite,
  workspaceId,
  providerTileStyles,
}: {
  projectId: string;
  projectName: string;
  tasks: TaskListItem[];
  canWrite: boolean;
  workspaceId: string;
  providerTileStyles: boolean;
}) {
  const [open, setOpen] = useState(true);
  const panelId = `project-issues-${projectId}`;
  const canOpenProject = /^[0-9a-f-]{36}$/i.test(projectId);

  return (
    <section
      className="overflow-hidden rounded-lg border bg-card"
      aria-label={`${projectName}: ${tasks.length} issues`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-2 py-1.5 sm:px-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "group flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition",
            "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted transition-transform duration-200 ease-out motion-reduce:transition-none",
              !open && "-rotate-90",
            )}
            aria-hidden="true"
          />
          <FolderKanban className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium">{projectName}</h2>
            <p className="text-xs text-muted">
              {tasks.length} {tasks.length === 1 ? "issue" : "issues"}
            </p>
          </div>
        </button>
        {canOpenProject ? (
          <Link
            href={`/projects/${projectId}`}
            className="shrink-0 px-2 text-xs font-medium text-muted transition hover:text-foreground hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            Open project
          </Link>
        ) : null}
      </div>
      <div
        id={panelId}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <ul
            className={cn(
              "divide-y transition-opacity duration-200 ease-out motion-reduce:transition-none",
              open ? "opacity-100" : "opacity-0",
            )}
          >
            {tasks.map((task) => (
              <TaskListRow
                key={task.id}
                task={task}
                canWrite={canWrite}
                workspaceId={workspaceId}
                providerTileStyles={providerTileStyles}
                hideProjectBadge
              />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function RelationConnector({ relations }: { relations: RelationDescriptor[] }) {
  const summary = relations
    .map((relation) => `${relation.subject} ${relation.verb} ${relation.object}`)
    .join("; ");
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-0 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
      aria-label={`Relationship: ${summary}`}
    >
      {relations.map((relation) => {
        const down = relation.subjectIsUpper;
        const Arrow = down ? ArrowDown : ArrowUp;
        return (
          <span
            key={`${relation.subject}-${relation.verb}-${relation.object}`}
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-card py-0.5 pl-2 pr-1.5 text-[11px] font-semibold tracking-wide text-foreground shadow-sm"
          >
            <span className="text-primary">{relation.verb}</span>
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Arrow className="size-2.5 stroke-[2.5]" aria-hidden="true" />
            </span>
          </span>
        );
      })}
    </div>
  );
}

function TaskListRow({
  task,
  canWrite,
  workspaceId,
  providerTileStyles,
  related = false,
  relations,
  hideProjectBadge = false,
}: {
  task: TaskListItem;
  canWrite: boolean;
  workspaceId: string;
  providerTileStyles: boolean;
  related?: boolean;
  relations?: RelationDescriptor[];
  hideProjectBadge?: boolean;
}) {
  const accent = providerTileStyles ? taskProviderAccent(task.provider) : null;
  const isRemote = Boolean(task.provider) || Boolean(task.externalUrl);
  return (
    <li className={cn("relative flex items-stretch", accent && accent.wash)}>
      {relations?.length ? <RelationConnector relations={relations} /> : null}
      {accent ? (
        <div className={cn("w-1 shrink-0 self-stretch", accent.bar)} aria-hidden="true" />
      ) : null}
      {canWrite ? (
        <div className="flex shrink-0 items-start px-3 pt-4 sm:px-4 sm:pt-5 lg:items-center lg:pt-0">
          <Checkbox
            name="ids"
            value={task.id}
            aria-label={`Select ${task.title}`}
            data-task-select=""
            data-task-provider={task.provider ?? ""}
            data-task-external={task.externalUrl ? "1" : "0"}
          />
        </div>
      ) : null}

      <Link
        href={`/tasks/${task.id}`}
        aria-label={`Open ${task.title}`}
        className={cn(
          "grid min-w-0 flex-1 grid-cols-1 items-start gap-x-3 gap-y-3 p-3 sm:p-4",
          "lg:grid-cols-[minmax(14rem,2fr)_minmax(10rem,1.1fr)_7rem_7.5rem_7.5rem_2.5rem] lg:items-center lg:gap-x-5",
          "transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          !canWrite && "pl-3 sm:pl-4",
        )}
      >
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium leading-snug">
            {related ? <Link2 className="size-3.5 shrink-0 text-muted" aria-hidden="true" /> : null}
            <span className="min-w-0">{task.title}</span>
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {hideProjectBadge ? null : (
              <>
                <Badge tone="project">{task.projectName}</Badge>
                {task.codebaseLabel ? (
                  <Badge tone="none" className="normal-case">
                    {task.codebaseLabel}
                  </Badge>
                ) : null}
              </>
            )}
            <Badge tone={task.assigneeLabel ? "due" : "none"}>
              {task.assigneeLabel || "Unassigned"}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 lg:contents">
          <div className="flex flex-wrap items-center gap-1.5 lg:flex-col lg:items-start lg:gap-1.5">
            <Badge tone={task.status}>
              <StatusIcon status={task.status} className="size-3.5" />
              {task.status.replace("_", " ")}
            </Badge>
            <Badge tone={task.priority}>
              <PriorityIcon priority={task.priority} className="size-3.5" />
              {task.priority}
            </Badge>
          </div>
          <Meta label="Due">{formatWhen(task.dueAt)}</Meta>
          <Meta label="Sync">
            <SyncStateIcon state={task.syncState} className="size-3.5" />
            {syncStateLabel(task.syncState)}
          </Meta>
          <Meta label="Source" className={accent ? accent.ink : undefined}>
            <ProviderIcon provider={task.provider} />
            {providerLabel(task.provider)}
          </Meta>
        </div>
      </Link>

      {canWrite ? (
        <div
          className="flex shrink-0 items-start px-2 pt-3 sm:px-3 sm:pt-4 lg:items-center lg:pt-0"
          onClick={(event) => event.stopPropagation()}
        >
          <TaskDeleteDialog
            workspaceId={workspaceId}
            taskIds={[task.id]}
            hasRemoteTasks={isRemote}
            triggerLabel={`Delete ${task.title}`}
            triggerVariant="ghost"
            triggerSize="icon"
            triggerClassName="text-muted hover:text-destructive"
          />
        </div>
      ) : null}
    </li>
  );
}

function Meta({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-label={label}
      className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs text-muted", className)}
    >
      {children}
    </div>
  );
}
