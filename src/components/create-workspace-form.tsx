"use client";

import { Plus } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import { createWorkspaceAction, type ActionState } from "@/app/actions";
import { WorkspaceIconPicker } from "@/components/workspace-icon-picker";
import { WorkspaceKindPicker } from "@/components/workspace-kind-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/field";
import type { WorkspaceContextDef } from "@/lib/workspace-contexts";

export function CreateWorkspaceForm({
  contexts,
  open: controlledOpen,
  onOpenChange,
  trigger,
}: {
  contexts: WorkspaceContextDef[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Pass `null` to render the dialog without a trigger (controlled open). */
  trigger?: ReactNode | null;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [state, action, pending] = useActionState<ActionState, FormData>(createWorkspaceAction, {});
  const defaultKind =
    contexts.find((context) => context.slug === "work")?.slug ?? contexts[0]?.slug ?? "work";
  const defaultIcon =
    contexts.find((context) => context.slug === defaultKind)?.icon ?? "🏢";
  const showDefaultTrigger = trigger === undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showDefaultTrigger ? (
        <DialogTrigger asChild>
          <Button type="button">
            <Plus className="size-4" aria-hidden="true" />
            Create workspace
          </Button>
        </DialogTrigger>
      ) : trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : null}
      <DialogContent className="w-[min(100%-2rem,32rem)]">
        <DialogHeader>
          <DialogTitle>Create a workspace</DialogTitle>
          <DialogDescription>Contexts keep different kinds of work separated.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <div className="grid gap-2">
              <Label htmlFor="create-workspace-name">Name</Label>
              <Input id="create-workspace-name" name="name" placeholder="Northwind Studio" required />
            </div>
            <WorkspaceKindPicker
              id="create-workspace-kind"
              contexts={contexts}
              defaultValue={defaultKind}
            />
          </div>
          <WorkspaceIconPicker defaultValue={defaultIcon} id="create-workspace-icon" />
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <Button type="submit" className="w-full" size="lg" disabled={pending}>
            {pending ? "Creating…" : "Create workspace"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
