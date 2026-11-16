"use client";

import { useRef, useState } from "react";
import { Archive, Building2, CircleDot, Layers } from "lucide-react";
import { loadProductsPanelAction, type ActionState } from "@/app/actions";
import { ProductsBoard } from "@/components/products-board";
import { SoftSegmentedNav } from "@/components/soft-segmented-nav";
import { softReplaceUrl } from "@/lib/soft-nav";
import type { ProductsPanelPayload } from "@/server/products/panel";
import { cn } from "@/lib/utils";

type Status = "active" | "archived" | "all";
type Scope = "current" | "all";

function productsHref(status: Status, scope: Scope) {
  const parts = [
    scope === "all" ? "scope=all" : "",
    status === "active" ? "" : `status=${status}`,
  ].filter(Boolean);
  return parts.length ? `/products?${parts.join("&")}` : "/products";
}

export function ProductsPageClient({
  workspaceId,
  workspaceName,
  canWrite,
  createAction,
  initial,
}: {
  workspaceId: string;
  workspaceName: string;
  canWrite: boolean;
  createAction: (state: ActionState, formData: FormData) => Promise<ActionState>;
  initial: ProductsPanelPayload;
}) {
  const [status, setStatus] = useState<Status>(initial.status);
  const [scope, setScope] = useState<Scope>(initial.scope);
  const [panel, setPanel] = useState(initial);
  const [pending, setPending] = useState(false);
  const requestId = useRef(0);

  function load(nextStatus: Status, nextScope: Scope) {
    softReplaceUrl(productsHref(nextStatus, nextScope));
    const id = ++requestId.current;
    setPending(true);
    void loadProductsPanelAction(workspaceId, { status: nextStatus, scope: nextScope }).then((result) => {
      if (id !== requestId.current) return;
      setPending(false);
      if ("error" in result) return;
      setPanel(result);
    });
  }

  function changeStatus(next: Status) {
    if (next === status) return;
    setStatus(next);
    load(next, scope);
  }

  function changeScope(next: Scope) {
    if (next === scope) return;
    setScope(next);
    load(status, next);
  }

  return (
    <div className={cn(pending && "[&_[data-products-body]]:opacity-70")}>
      <ProductsBoard
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        canWrite={canWrite}
        createAction={createAction}
        scope={scope}
        analytics={panel.analytics}
        products={panel.products}
        portfolios={panel.portfolios}
        scopeNav={
          <SoftSegmentedNav
            aria-label="Product scope"
            value={scope}
            onChange={changeScope}
            options={[
              { value: "current", label: "This workspace", icon: CircleDot },
              { value: "all", label: "All workspaces", icon: Building2 },
            ]}
          />
        }
        statusNav={
          <SoftSegmentedNav
            aria-label="Product status"
            data-tour="product-status"
            value={status}
            onChange={changeStatus}
            options={[
              { value: "active", label: "Active", icon: CircleDot },
              { value: "archived", label: "Archived", icon: Archive },
              { value: "all", label: "All", icon: Layers },
            ]}
          />
        }
      />
    </div>
  );
}
