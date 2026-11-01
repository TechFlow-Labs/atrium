"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteProjectAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ProjectDeleteDialog({
  workspaceId,
  projectId,
  projectName,
  ownershipMode,
  triggerVariant = "ghost",
  triggerSize = "icon",
  triggerLabel,
}: {
  workspaceId: string;
  projectId: string;
  projectName: string;
  ownershipMode: "native" | "external" | "hybrid";
  triggerVariant?: "outline" | "ghost" | "destructive";
  triggerSize?: "default" | "sm" | "icon";
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(deleteProjectAction, {});
  const showLabel = triggerSize !== "icon";

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        aria-label={triggerLabel ?? `Delete ${projectName}`}
        title={triggerLabel ?? "Delete project"}
        className={triggerSize === "icon" ? "text-muted hover:text-destructive" : undefined}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash2 className="size-4" aria-hidden="true" />
        {showLabel ? triggerLabel ?? "Delete" : <span className="sr-only">{triggerLabel ?? "Delete"}</span>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(100%-2rem,28rem)]">
          <DialogHeader>
            <DialogTitle>Delete {projectName}?</DialogTitle>
            <DialogDescription>
              This permanently removes the project and its tasks from Atrium.
              {ownershipMode === "external"
                ? " The linked provider project stays untouched."
                : " Connected providers are not changed."}
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="grid gap-4">
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="projectId" value={projectId} />
            {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? "Deleting…" : "Delete project"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
