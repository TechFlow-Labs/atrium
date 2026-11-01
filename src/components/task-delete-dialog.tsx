"use client";

import { useActionState, useEffect, useMemo, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { deleteTasksAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function TaskDeleteDialog({
  workspaceId,
  taskIds,
  hasRemoteTasks = false,
  returnTo = "/tasks",
  triggerLabel = "Delete",
  triggerVariant = "outline",
  triggerSize,
  triggerClassName,
  trigger,
  disabled = false,
  onBeforeOpen,
}: {
  workspaceId: string;
  taskIds?: string[];
  /** Whether any selected tasks are linked to a provider issue. */
  hasRemoteTasks?: boolean;
  returnTo?: string;
  triggerLabel?: string;
  triggerVariant?: "outline" | "ghost" | "default" | "destructive";
  triggerSize?: "default" | "sm" | "icon";
  triggerClassName?: string;
  trigger?: ReactNode;
  disabled?: boolean;
  onBeforeOpen?: () => { ids: string[]; hasRemote: boolean } | null;
}) {
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState<string[]>(taskIds ?? []);
  const [remote, setRemote] = useState(hasRemoteTasks);
  const [alsoRemote, setAlsoRemote] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(deleteTasksAction, {});

  useEffect(() => {
    if (taskIds) setIds(taskIds);
  }, [taskIds]);

  useEffect(() => {
    setRemote(hasRemoteTasks);
  }, [hasRemoteTasks]);

  const countLabel = useMemo(() => {
    if (ids.length === 1) return "this task";
    return `${ids.length} tasks`;
  }, [ids.length]);

  function openDialog() {
    if (onBeforeOpen) {
      const next = onBeforeOpen();
      if (!next || next.ids.length === 0) {
        setSelectionError("Select at least one task to delete");
        setIds([]);
        setRemote(false);
        setOpen(true);
        return;
      }
      setIds(next.ids);
      setRemote(next.hasRemote);
    } else {
      setIds(taskIds ?? []);
      setRemote(hasRemoteTasks);
    }
    setAlsoRemote(false);
    setSelectionError(null);
    setOpen(true);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setAlsoRemote(false);
          setSelectionError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ? (
          <span
            className="inline-flex"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!disabled) openDialog();
            }}
          >
            {trigger}
          </span>
        ) : (
          <Button
            type="button"
            variant={triggerVariant}
            size={triggerSize}
            className={triggerClassName}
            disabled={disabled}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openDialog();
            }}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {triggerSize === "icon" ? <span className="sr-only">{triggerLabel}</span> : triggerLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[min(100%-2rem,28rem)]">
        <DialogHeader>
          <DialogTitle>Delete {countLabel}?</DialogTitle>
          <DialogDescription>
            This removes {countLabel} from Atrium. Provider issues stay unless you opt in below.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          {ids.map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}
          {alsoRemote ? <input type="hidden" name="alsoRemote" value="true" /> : null}

          {remote ? (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5">
              <Checkbox
                checked={alsoRemote}
                onCheckedChange={(value) => setAlsoRemote(value === true)}
                className="mt-0.5"
                aria-label="Also delete in connected providers"
              />
              <span>
                <span className="block text-sm font-medium">Also delete in connected providers</span>
                <span className="block text-xs text-muted">
                  Archive or close matching issues in Linear, Jira, GitHub, GitLab, and similar when
                  the provider supports it.
                </span>
              </span>
            </label>
          ) : (
            <p className="text-sm text-muted">
              These tasks are only in Atrium, so nothing will change in external trackers.
            </p>
          )}

          {selectionError || state.error ? (
            <p className="text-sm text-destructive">{selectionError ?? state.error}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={pending || ids.length === 0 || Boolean(selectionError)}
            >
              {pending ? "Deleting…" : alsoRemote ? "Delete everywhere" : "Delete from Atrium"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
