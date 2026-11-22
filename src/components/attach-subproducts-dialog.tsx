"use client";

import { useActionState, useMemo, useState } from "react";
import { GitMerge } from "lucide-react";
import { attachProductsAsChildrenAction, type ActionState } from "@/app/actions";
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

type AttachableProduct = {
  id: string;
  name: string;
  child_count: number;
  parent_id: string | null;
  status: "active" | "archived";
};

export function AttachSubproductsDialog({
  workspaceId,
  parentId,
  products,
}: {
  workspaceId: string;
  parentId: string;
  products: AttachableProduct[];
}) {
  const candidates = useMemo(
    () =>
      products.filter(
        (product) =>
          product.id !== parentId
          && product.status === "active"
          && !product.parent_id
          && product.child_count === 0,
      ),
    [parentId, products],
  );
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    attachProductsAsChildrenAction,
    {},
  );
  const [seenError, setSeenError] = useState<string | null>(null);

  if (state.error && state.error !== seenError) {
    setSeenError(state.error);
    if (!open) setOpen(true);
  }

  if (candidates.length === 0) return null;

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSelected(new Set());
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <GitMerge className="size-4" aria-hidden="true" />
          Add existing
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(100%-2rem,28rem)]">
        <DialogHeader>
          <DialogTitle>Add existing products</DialogTitle>
          <DialogDescription>
            Convert selected top-level products into subproducts of this product.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="parentId" value={parentId} />
          {[...selected].map((id) => (
            <input key={id} type="hidden" name="childIds" value={id} />
          ))}
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
            {candidates.map((product) => {
              const checked = selected.has(product.id);
              return (
                <li key={product.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/60">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => toggle(product.id, value === true)}
                      aria-label={`Add ${product.name}`}
                    />
                    <span className="text-sm">{product.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <Button type="submit" disabled={pending || selected.size === 0}>
            {pending ? "Adding…" : "Add as subproducts"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
