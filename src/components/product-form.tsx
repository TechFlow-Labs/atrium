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
}: {
  workspaceId: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
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
        <Button type="button">
          <Plus className="size-4" aria-hidden="true" />
          New Product
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(100%-2rem,28rem)]">
        <DialogHeader>
          <DialogTitle>New product</DialogTitle>
          <DialogDescription>
            Products group projects under a workspace. Create one before adding projects.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />
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
            {pending ? "Creating…" : "Create product"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
