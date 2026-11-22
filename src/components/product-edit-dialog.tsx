"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import {
  archiveProductAction,
  deleteProductAction,
  updateProductAction,
} from "@/app/actions";
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

export function ProductEditDialog({
  workspaceId,
  product,
  canDelete,
}: {
  workspaceId: string;
  product: {
    id: string;
    name: string;
    description: string;
    status: "active" | "archived";
    child_count?: number;
    project_count?: number;
  };
  canDelete: boolean;
}) {
  const deleteHint =
    (product.child_count ?? 0) > 0
      ? "Move or delete subproducts first to remove this product."
      : (product.project_count ?? 0) > 0
        ? "Delete projects first to remove this product."
        : null;
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Pencil className="size-4" aria-hidden="true" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(100%-2rem,28rem)]">
        <DialogHeader>
          <DialogTitle>Edit product</DialogTitle>
          <DialogDescription>
            Update the name and description for {product.name}.
          </DialogDescription>
        </DialogHeader>
        <form action={updateProductAction} className="grid gap-3">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="productId" value={product.id} />
          <div>
            <Label htmlFor="edit-product-name">Name</Label>
            <Input
              id="edit-product-name"
              name="name"
              defaultValue={product.name}
              required
              className="mt-1"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="edit-product-description">Description</Label>
            <Textarea
              id="edit-product-description"
              name="description"
              defaultValue={product.description}
              className="mt-1"
              rows={3}
            />
          </div>
          <Button type="submit">Save changes</Button>
        </form>
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <form action={archiveProductAction}>
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="productId" value={product.id} />
            <input
              type="hidden"
              name="archived"
              value={product.status === "archived" ? "false" : "true"}
            />
            <Button type="submit" variant="secondary">
              {product.status === "archived" ? "Restore product" : "Archive product"}
            </Button>
          </form>
          {canDelete ? (
            <form action={deleteProductAction}>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="productId" value={product.id} />
              <Button type="submit" variant="destructive">
                Delete product
              </Button>
            </form>
          ) : deleteHint ? (
            <p className="text-xs text-muted">{deleteHint}</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
