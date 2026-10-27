import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { PriorityIcon, StatusIcon } from "@/components/task-meta-icons";
import { ProviderIcon } from "@/components/provider-icon";
import { Badge } from "@/components/ui/badge";
import { cn, formatWhen } from "@/lib/utils";

export type DashboardTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: Date | string | null;
  provider: string | null;
  updated_at: Date | string;
};

export type ProjectDashboardStats = {
  total: number;
  open: number;
  inProgress: number;
  blocked: number;
  done: number;
  cancelled: number;
  attention: number;
  dueSoon: number;
  doneWeek: number;
  completion: number;
};

export function buildProjectDashboardStats(tasks: DashboardTask[], nowMs: number): ProjectDashboardStats {
  const weekEnd = nowMs + 7 * 24 * 60 * 60 * 1000;
  const weekStart = nowMs - 7 * 24 * 60 * 60 * 1000;
  let open = 0;
  let inProgress = 0;
  let blocked = 0;
  let done = 0;
  let cancelled = 0;
  let attention = 0;
  let dueSoon = 0;
  let doneWeek = 0;

  for (const task of tasks) {
    if (task.status === "open") open += 1;
    else if (task.status === "in_progress") inProgress += 1;
    else if (task.status === "blocked") blocked += 1;
    else if (task.status === "done") done += 1;
    else if (task.status === "cancelled") cancelled += 1;

    const openish = task.status === "open" || task.status === "in_progress" || task.status === "blocked";
    if (openish && (task.priority === "urgent" || task.priority === "high")) attention += 1;
    if (openish && task.due_at) {
      const due = new Date(task.due_at).getTime();
      if (due <= weekEnd) dueSoon += 1;
    }
    if (task.status === "done") {
      const updated = new Date(task.updated_at).getTime();
      if (updated >= weekStart) doneWeek += 1;
    }
  }

  const active = open + inProgress + blocked + done;
  const completion = active === 0 ? 0 : Math.round((done / active) * 100);

  return {
    total: tasks.length,
    open,
    inProgress,
    blocked,
    done,
    cancelled,
    attention,
    dueSoon,
    doneWeek,
    completion,
  };
}

export function ProjectStatCard({
  href,
  label,
  value,
  hint,
  icon: Icon,
  iconClassName,
  inert = false,
}: {
  href: string;
  label: string;
  value: number | string;
  hint: string;
  icon?: LucideIcon;
  iconClassName?: string;
  /** When true, render as a static tile (e.g. customize mode). */
  inert?: boolean;
}) {
  const className =
    "group flex h-full min-h-[7.5rem] flex-col rounded-lg border bg-card p-4 transition hover:border-foreground/20 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
        {Icon ? (
          <Icon
            className={cn("size-4 shrink-0 text-muted transition group-hover:text-foreground", iconClassName)}
            aria-hidden="true"
          />
        ) : null}
      </div>
      <p className="mt-2 text-3xl font-medium tabular-nums">{value}</p>
      <p className="mt-auto pt-1 flex items-center gap-1 text-xs text-muted transition group-hover:text-foreground">
        {hint}
        <ArrowRight className="size-3 opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
      </p>
    </>
  );
  if (inert) {
    return <div className={className}>{body}</div>;
  }
  return (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}

export function ProjectTaskPanel({
  title,
  href,
  empty,
  count,
  children,
}: {
  title: string;
  href: string;
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
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium transition hover:underline">
          View all
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      {!filled ? <p className="mt-3 text-sm text-muted">{empty}</p> : <div className="mt-3 space-y-3">{children}</div>}
    </section>
  );
}

export function ProjectTaskLine({ task }: { task: DashboardTask }) {
  return (
    <Link
      href={`/tasks/${task.id}`}
      className="block rounded-lg border border-border/80 bg-background px-3 py-2.5 shadow-sm transition hover:border-foreground/20 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="font-medium leading-snug">{task.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone={task.status}>
          <StatusIcon status={task.status} className="size-3.5" />
          {task.status.replace("_", " ")}
        </Badge>
        <Badge tone={task.priority}>
          <PriorityIcon priority={task.priority} className="size-3.5" />
          {task.priority}
        </Badge>
        {task.due_at ? <Badge tone="due">{formatWhen(task.due_at)}</Badge> : null}
        <ProviderIcon provider={task.provider} />
      </div>
    </Link>
  );
}

export function ProjectStatusBreakdown({
  stats,
  caption,
}: {
  stats: ProjectDashboardStats;
  caption?: string;
}) {
  const rows = [
    { key: "open", label: "Open", value: stats.open, tone: "bg-sky-500" },
    { key: "in_progress", label: "In progress", value: stats.inProgress, tone: "bg-amber-500" },
    { key: "blocked", label: "Blocked", value: stats.blocked, tone: "bg-rose-500" },
    { key: "done", label: "Done", value: stats.done, tone: "bg-emerald-500" },
    { key: "cancelled", label: "Cancelled", value: stats.cancelled, tone: "bg-stone-400" },
  ] as const;
  const total = Math.max(stats.total, 1);

  return (
    <section className="flex h-full min-h-[13.5rem] flex-col rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl">Status mix</h2>
          <p className="text-xs text-muted">{caption ?? `${stats.total} tasks in this project`}</p>
        </div>
        <p className="text-sm tabular-nums text-muted">{stats.completion}% done</p>
      </div>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-accent">
        {rows.map((row) =>
          row.value > 0 ? (
            <div
              key={row.key}
              className={row.tone}
              style={{ width: `${(row.value / total) * 100}%` }}
              title={`${row.label}: ${row.value}`}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-2 text-sm">
            <span className="inline-flex items-center gap-2">
              <span className={`size-2.5 rounded-full ${row.tone}`} aria-hidden="true" />
              {row.label}
            </span>
            <span className="tabular-nums text-muted">{row.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
