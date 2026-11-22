"use client";

import { useActionState, useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { groupProductsAction, type ActionState } from "@/app/actions";
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
import { Input, Label, Textarea } from "@/components/ui/field";

type GroupableProduct = {
  id: string;
  name: string;
  child_count: number;
  parent_id: string | null;
  status: "active" | "archived";
};

export function GroupProductsDialog({
  workspaceId,
  products,
}: {
  workspaceId: string;
  products: GroupableProduct[];
}) {
  const candidates = useMemo(
    () =>
      products.filter(
        (product) =>
          product.status === "active" && !product.parent_id && product.child_count === 0,
      ),
    [products],
  );
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, formAction, pending] = useActionState<ActionState, FormData>(groupProductsAction, {});
  const [seenError, setSeenError] = useState<string | null>(null);

  if (state.error && state.error !== seenError) {
    setSeenError(state.error);
    if (!open) setOpen(true);
  }

  if (candidates.length < 2) return null;

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
          <Layers className="size-4" aria-hidden="true" />
          Group products
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(100%-2rem,28rem)]">
        <DialogHeader>
          <DialogTitle>Group into a product</DialogTitle>
          <DialogDescription>
            Create a parent product and convert the selected products into its subproducts.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          {[...selected].map((id) => (
            <input key={id} type="hidden" name="childIds" value={id} />
          ))}
          <div>
            <Label htmlFor="group-product-name">Parent name</Label>
            <Input id="group-product-name" name="name" required className="mt-1" autoFocus />
          </div>
          <div>
            <Label htmlFor="group-product-description">Description</Label>
            <Textarea id="group-product-description" name="description" className="mt-1" rows={2} />
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Products to include</legend>
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
              {candidates.map((product) => {
                const checked = selected.has(product.id);
                return (
                  <li key={product.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/60">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggle(product.id, value === true)}
                        aria-label={`Include ${product.name}`}
                      />
                      <span className="text-sm">{product.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted">Select at least two products.</p>
          </fieldset>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <Button type="submit" disabled={pending || selected.size < 2}>
            {pending ? "Grouping…" : "Create parent"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
