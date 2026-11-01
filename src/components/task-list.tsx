"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Link2 } from "lucide-react";
import {
  ProviderIcon,
  providerAccents,
  providerKey,
  providerLabel,
} from "@/components/provider-icon";
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
  projectName: string;
  assigneeLabel: string | null;
};

export function TaskList({
  tasks,
  canWrite,
  providerTileStyles = true,
  groupRelated = true,
  linkEdges = [],
}: {
  tasks: TaskListItem[];
  canWrite: boolean;
  providerTileStyles?: boolean;
  groupRelated?: boolean;
  linkEdges?: TaskLinkEdge[];
}) {
  if (!groupRelated || linkEdges.length === 0) {
    return (
      <ul className="divide-y overflow-hidden rounded-lg border bg-card" data-reveal-items="">
        {tasks.map((task) => (
          <TaskListRow
            key={task.id}
            task={task}
            canWrite={canWrite}
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
  providerTileStyles,
  related = false,
  relations,
}: {
  task: TaskListItem;
  canWrite: boolean;
  providerTileStyles: boolean;
  related?: boolean;
  relations?: RelationDescriptor[];
}) {
  const accent = providerTileStyles ? taskProviderAccent(task.provider) : null;
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
          />
        </div>
      ) : null}

      <Link
        href={`/tasks/${task.id}`}
        aria-label={`Open ${task.title}`}
        className={cn(
          "grid min-w-0 flex-1 grid-cols-1 items-start gap-x-3 gap-y-3 p-3 sm:p-4",
          "lg:grid-cols-[minmax(14rem,2.2fr)_minmax(10rem,1.2fr)_7rem_8rem_8rem] lg:items-center lg:gap-x-5",
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
            <Badge tone="project">{task.projectName}</Badge>
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
