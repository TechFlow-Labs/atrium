"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import type { ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/field";

export function ProductForm({
  workspaceId,
  action,
  parentId,
  triggerLabel = "New Product",
  title = "New product",
  description = "Products group projects under a workspace. Create one before adding projects.",
  submitLabel = "Create product",
  variant = "default",
}: {
  workspaceId: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  parentId?: string;
  triggerLabel?: string;
  title?: string;
  description?: string;
  submitLabel?: string;
  variant?: "default" | "outline" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const [seenError, setSeenError] = useState<string | null>(null);

  if (state.error && state.error !== seenError) {
    setSeenError(state.error);
    if (!open) setOpen(true);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={variant}>
          <Plus className="size-4" aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(100%-2rem,28rem)]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
          <div>
            <Label htmlFor="product-name">Name</Label>
            <Input id="product-name" name="name" required className="mt-1" autoFocus />
          </div>
          <div>
            <Label htmlFor="product-description">Description</Label>
            <Textarea id="product-description" name="description" className="mt-1" rows={3} />
          </div>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : submitLabel}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
