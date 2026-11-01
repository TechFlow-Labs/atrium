"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { CalendarDays, Clock3, FolderKanban, UserRound } from "lucide-react";
import { updateTaskDetailAction } from "@/app/actions";
import { MarkdownContent } from "@/components/markdown-content";
import { PriorityIcon, StatusIcon, SyncStateIcon, syncStateLabel } from "@/components/task-meta-icons";
import { MenuSelect } from "@/components/ui/menu-select";
import { toggleMarkdownCheckboxAt } from "@/lib/markdown-checkboxes";
import { cn, formatWhen } from "@/lib/utils";

function dueInputValue(dueAt: Date | string | null): string {
  if (!dueAt) return "";
  const date = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

const STATUS_OPTIONS = [
  { value: "open", label: "Open", icon: <StatusIcon status="open" /> },
  { value: "in_progress", label: "In progress", icon: <StatusIcon status="in_progress" /> },
  { value: "blocked", label: "Blocked", icon: <StatusIcon status="blocked" /> },
  { value: "done", label: "Done", icon: <StatusIcon status="done" /> },
  { value: "cancelled", label: "Cancelled", icon: <StatusIcon status="cancelled" /> },
];

const PRIORITY_OPTIONS = [
  { value: "none", label: "No priority", icon: <PriorityIcon priority="none" /> },
  { value: "low", label: "Low", icon: <PriorityIcon priority="low" /> },
  { value: "medium", label: "Medium", icon: <PriorityIcon priority="medium" /> },
  { value: "high", label: "High", icon: <PriorityIcon priority="high" /> },
  { value: "urgent", label: "Urgent", icon: <PriorityIcon priority="urgent" /> },
];

const BADGE_TRIGGER: Record<string, string> = {
  open: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  in_progress: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  blocked: "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200",
  done: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  cancelled: "border-border bg-secondary text-muted",
  none: "border-border bg-secondary text-muted",
  low: "border-border bg-secondary text-muted",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  high: "border-orange-500/30 bg-orange-500/10 text-orange-900 dark:text-orange-200",
  urgent: "border-rose-500/35 bg-rose-500/15 text-rose-900 dark:text-rose-200",
};

export function TaskDetailForm({
  workspaceId,
  taskId,
  version: initialVersion,
  title: initialTitle,
  description: initialDescription,
  status: initialStatus,
  priority: initialPriority,
  dueAt: initialDueAt,
  projectId,
  projectName,
  assigneeLabel,
  updatedAt,
  syncState,
  canWrite,
}: {
  workspaceId: string;
  taskId: string;
  version: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  dueAt: Date | string | null;
  projectId: string;
  projectName: string;
  assigneeLabel: string | null;
  updatedAt: Date | string;
  syncState: string;
  canWrite: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [status, setStatus] = useState(initialStatus);
  const [priority, setPriority] = useState(initialPriority);
  const [dueAt, setDueAt] = useState(dueInputValue(initialDueAt));
  const [editingDescription, setEditingDescription] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pending, startTransition] = useTransition();
  const titleRef = useRef(initialTitle);
  const descriptionRef = useRef(initialDescription);
  const dueRef = useRef(dueInputValue(initialDueAt));
  const versionRef = useRef(initialVersion);
  function saveField(field: "title" | "description" | "status" | "priority" | "dueAt", value: string) {
    if (!canWrite) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("workspaceId", workspaceId);
      formData.set("taskId", taskId);
      formData.set("version", String(versionRef.current));
      formData.set("silent", "1");
      formData.set(field, value);
      const result = await updateTaskDetailAction({}, formData);
      if (result.error) {
        setError(result.error);
        setSavedFlash(false);
        return;
      }
      setError(null);
      if (typeof result.version === "number") {
        versionRef.current = result.version;
      }
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1200);
    });
  }

  function finishDescriptionEdit() {
    setEditingDescription(false);
    if (description === descriptionRef.current) return;
    descriptionRef.current = description;
    saveField("description", description);
  }

  function toggleDescriptionCheckbox(index: number, checked: boolean) {
    if (!canWrite) return;
    const next = toggleMarkdownCheckboxAt(description, index, checked);
    if (next === description) return;
    setDescription(next);
    descriptionRef.current = next;
    saveField("description", next);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {canWrite ? (
          <input
            id="task-detail-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              const next = title.trim();
              if (!next || next === titleRef.current) {
                if (!next) setTitle(titleRef.current);
                return;
              }
              titleRef.current = next;
              setTitle(next);
              saveField("title", next);
            }}
            aria-label="Title"
            className="w-full bg-transparent text-4xl leading-tight outline-none placeholder:text-muted focus-visible:ring-0"
            placeholder="Task title"
          />
        ) : (
          <h1 className="text-4xl leading-tight">{title}</h1>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {canWrite ? (
            <>
              <MenuSelect
                id="task-detail-status"
                value={status}
                aria-label="Status"
                className="w-auto"
                triggerClassName={cn(
                  "h-7 w-auto gap-1.5 rounded-full border px-2.5 text-xs font-medium capitalize",
                  BADGE_TRIGGER[status] ?? BADGE_TRIGGER.open,
                )}
                options={STATUS_OPTIONS}
                onValueChange={(next) => {
                  if (next === status) return;
                  setStatus(next);
                  saveField("status", next);
                }}
              />
              <MenuSelect
                id="task-detail-priority"
                value={priority}
                aria-label="Priority"
                className="w-auto"
                triggerClassName={cn(
                  "h-7 w-auto gap-1.5 rounded-full border px-2.5 text-xs font-medium capitalize",
                  BADGE_TRIGGER[priority] ?? BADGE_TRIGGER.none,
                )}
                options={PRIORITY_OPTIONS}
                onValueChange={(next) => {
                  if (next === priority) return;
                  setPriority(next);
                  saveField("priority", next);
                }}
              />
            </>
          ) : (
            <>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium capitalize",
                  BADGE_TRIGGER[status] ?? BADGE_TRIGGER.open,
                )}
              >
                <StatusIcon status={status} className="size-3.5" />
                {status.replace("_", " ")}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium capitalize",
                  BADGE_TRIGGER[priority] ?? BADGE_TRIGGER.none,
                )}
              >
                <PriorityIcon priority={priority} className="size-3.5" />
                {priority}
              </span>
            </>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <SyncStateIcon state={syncState} className="size-3.5" />
            {syncStateLabel(syncState)}
          </span>
          {pending ? <span className="text-xs text-muted">Saving…</span> : null}
          {!pending && savedFlash ? <span className="text-xs text-muted">Saved</span> : null}
        </div>
      </div>

      {canWrite && editingDescription ? (
        <textarea
          id="task-detail-description"
          value={description}
          autoFocus
          onChange={(event) => setDescription(event.target.value)}
          onFocus={(event) => {
            const length = event.currentTarget.value.length;
            event.currentTarget.setSelectionRange(length, length);
          }}
          onBlur={finishDescriptionEdit}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setDescription(descriptionRef.current);
              setEditingDescription(false);
            }
          }}
          rows={Math.max(3, description.split("\n").length + 1)}
          aria-label="Description"
          placeholder="Add a description…"
          className="w-full resize-y rounded-lg border border-transparent bg-muted/15 px-3 py-2.5 text-sm leading-relaxed outline-none ring-0 placeholder:text-muted focus-visible:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : canWrite ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setEditingDescription(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setEditingDescription(true);
            }
          }}
          className="cursor-text rounded-lg bg-muted/15 px-3 py-2.5 outline-none transition hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={description.trim() ? "Edit description" : "Add description"}
        >
          {description.trim() ? (
            <MarkdownContent content={description} onToggleCheckbox={toggleDescriptionCheckbox} />
          ) : (
            <p className="text-sm text-muted">Add a description…</p>
          )}
        </div>
      ) : description.trim() ? (
        <div className="rounded-lg bg-muted/15 px-3 py-2.5">
          <MarkdownContent content={description} />
        </div>
      ) : (
        <p className="text-sm text-muted">No description for this task.</p>
      )}

      <dl className="grid gap-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-2">
        <div className="flex gap-3">
          <FolderKanban className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
          <div className="min-w-0">
            <dt className="text-xs uppercase tracking-wide text-muted">Project</dt>
            <dd className="mt-0.5">
              <Link href={`/projects/${projectId}`} className="underline underline-offset-2">
                {projectName}
              </Link>
            </dd>
          </div>
        </div>
        <div className="flex gap-3">
          <UserRound className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
          <div className="min-w-0">
            <dt className="text-xs uppercase tracking-wide text-muted">Assignee</dt>
            <dd className="mt-0.5">{assigneeLabel || "Unassigned"}</dd>
          </div>
        </div>
        <div className="flex gap-3">
          <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
          <div className="min-w-0">
            <dt className="text-xs uppercase tracking-wide text-muted">Due</dt>
            <dd className="mt-0.5">
              {canWrite ? (
                <input
                  id="task-detail-due"
                  type="date"
                  value={dueAt}
                  aria-label="Due date"
                  onChange={(event) => setDueAt(event.target.value)}
                  onBlur={() => {
                    if (dueAt === dueRef.current) return;
                    dueRef.current = dueAt;
                    saveField("dueAt", dueAt);
                  }}
                  className="w-full max-w-[12rem] rounded-md border border-transparent bg-transparent px-0 py-0.5 outline-none hover:border-border focus-visible:border-border focus-visible:ring-2 focus-visible:ring-ring"
                />
              ) : (
                formatWhen(initialDueAt)
              )}
            </dd>
          </div>
        </div>
        <div className="flex gap-3">
          <Clock3 className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
          <div className="min-w-0">
            <dt className="text-xs uppercase tracking-wide text-muted">Updated</dt>
            <dd className="mt-0.5">{formatWhen(updatedAt)}</dd>
          </div>
        </div>
      </dl>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!canWrite ? (
        <p className="text-sm text-muted">Your role can view this task. Members and above can edit it.</p>
      ) : null}
    </div>
  );
}
