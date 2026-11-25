"use client";

import { useTransition } from "react";
import { updateTaskAction } from "@/app/actions";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type TaskSubtaskItem = {
  id: string;
  title: string;
  status: string;
  version: number;
};

export function TaskSubtasks({
  workspaceId,
  parentTaskId,
  subtasks,
  canWrite,
}: {
  workspaceId: string;
  parentTaskId: string;
  subtasks: TaskSubtaskItem[];
  canWrite: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const done = subtasks.filter((subtask) => subtask.status === "done").length;

  function toggle(subtask: TaskSubtaskItem) {
    if (!canWrite) return;
    const data = new FormData();
    data.set("workspaceId", workspaceId);
    data.set("taskId", subtask.id);
    data.set("version", String(subtask.version));
    data.set("status", subtask.status === "done" ? "open" : "done");
    data.set("silent", "1");
    data.set("returnTo", `/tasks/${parentTaskId}`);
    startTransition(() => {
      void updateTaskAction(data);
    });
  }

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="text-sm font-medium">Subtasks</h2>
        <p className="text-xs text-muted">
          {done} of {subtasks.length} done
        </p>
      </div>
      <ul className={cn("divide-y", pending && "opacity-70")}>
        {subtasks.map((subtask) => {
          const checked = subtask.status === "done";
          return (
            <li key={subtask.id} className="flex items-center gap-3 px-4 py-2.5">
              <Checkbox
                checked={checked}
                disabled={!canWrite || pending}
                aria-label={checked ? `Reopen ${subtask.title}` : `Complete ${subtask.title}`}
                onCheckedChange={() => toggle(subtask)}
              />
              <span className={cn("text-sm", checked && "text-muted line-through")}>{subtask.title}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
