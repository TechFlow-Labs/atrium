"use client";

import Link from "next/link";
import { useTransition, type ReactNode } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  CircleDot,
  FolderKanban,
  Gauge,
  ListTodo,
  Siren,
} from "lucide-react";
import { switchWorkspaceAction, type ActionState } from "@/app/actions";
import { GroupProductsDialog } from "@/components/group-products-dialog";
import { ProductForm } from "@/components/product-form";
import { ProjectStatCard } from "@/components/project-dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { nestProductRecords } from "@/lib/product-tree";
import { cn } from "@/lib/utils";
import type {
  ProductRecord,
  ProductsAnalytics,
  WorkspaceProductPortfolio,
} from "@/server/products/service";

type CreateProductAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

const PRODUCT_PROJECT_PREVIEW = 4;

function ProductCard({
  product,
  href,
  onOpenOtherWorkspace,
  nested = false,
}: {
  product: ProductRecord;
  href?: string;
  onOpenOtherWorkspace?: () => void;
  nested?: boolean;
}) {
  const projectNames = product.project_names ?? [];
  const visibleProjects = projectNames.slice(0, PRODUCT_PROJECT_PREVIEW);
  const hiddenProjectCount = Math.max(0, projectNames.length - visibleProjects.length);

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <h2 className={cn("font-medium leading-snug", nested ? "text-base" : "text-lg")}>
          {product.name}
        </h2>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {!nested && product.child_count > 0 ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {product.child_count} {product.child_count === 1 ? "subproduct" : "subproducts"}
            </span>
          ) : null}
          {product.status === "archived" ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              Archived
            </span>
          ) : null}
        </div>
      </div>
      {product.description ? (
        <p className="mt-2 line-clamp-2 text-sm text-muted">{product.description}</p>
      ) : null}
      {visibleProjects.length > 0 ? (
        <ul className="mt-2.5 space-y-0.5">
          {visibleProjects.map((name) => (
            <li
              key={name}
              className="flex items-center gap-1.5 truncate text-[11px] leading-snug text-muted"
            >
              <FolderKanban className="size-3 shrink-0 opacity-70" aria-hidden="true" />
              <span className="truncate">{name}</span>
            </li>
          ))}
          {hiddenProjectCount > 0 ? (
            <li className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="size-3 shrink-0" aria-hidden="true" />
              +{hiddenProjectCount} more
            </li>
          ) : null}
        </ul>
      ) : !nested && product.child_count > 0 ? (
        <p className="mt-2.5 text-[11px] text-muted">Projects live under subproducts</p>
      ) : null}
      <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-2 pt-4 text-xs">
        <div>
          <dt className="text-muted">Projects</dt>
          <dd className="mt-0.5 tabular-nums font-medium">{product.project_count}</dd>
        </div>
        <div>
          <dt className="text-muted">Open issues</dt>
          <dd className="mt-0.5 tabular-nums font-medium">{product.open_issues}</dd>
        </div>
        <div>
          <dt className="text-muted">Needs attention</dt>
          <dd className="mt-0.5 tabular-nums font-medium">{product.attention_issues}</dd>
        </div>
        <div>
          <dt className="text-muted">Completion</dt>
          <dd className="mt-0.5 tabular-nums font-medium">{product.completion}%</dd>
        </div>
      </dl>
    </>
  );

  const className = cn(
    "flex flex-col rounded-xl border bg-card p-4 text-left transition",
    nested ? "min-h-[9rem]" : "min-h-[11rem]",
    "hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-[0_12px_28px_-18px_rgba(0,0,0,0.55)]",
  );

  if (onOpenOtherWorkspace) {
    return (
      <button type="button" onClick={onOpenOtherWorkspace} className={cn(className, "w-full")}>
        {body}
      </button>
    );
  }

  return (
    <Link href={href ?? `/products/${product.id}`} className={className}>
      {body}
    </Link>
  );
}

function WorkspaceProductLink({
  workspaceId,
  productId,
  children,
}: {
  workspaceId: string;
  productId: string;
  children: (open: () => void, pending: boolean) => ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  function open() {
    const formData = new FormData();
    formData.set("workspaceId", workspaceId);
    formData.set("returnTo", `/products/${productId}`);
    startTransition(() => {
      void switchWorkspaceAction(formData);
    });
  }
  return <>{children(open, pending)}</>;
}

export function ProductsBoard({
  workspaceId,
  workspaceName,
  canWrite,
  createAction,
  statusNav,
  scopeNav,
  scope,
  analytics,
  products,
  portfolios,
}: {
  workspaceId: string;
  workspaceName: string;
  canWrite: boolean;
  createAction: CreateProductAction;
  statusNav: ReactNode;
  scopeNav: ReactNode;
  scope: "current" | "all";
  analytics: ProductsAnalytics;
  products: ProductRecord[];
  portfolios: WorkspaceProductPortfolio[];
}) {
  const { portfolio, issues } = analytics;
  const nestedProducts = nestProductRecords(products);

  return (
    <div className="space-y-8" data-tour="products-board">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl">Products</h1>
          <p className="mt-1 text-sm text-muted">
            {scope === "current"
              ? `Portfolio for ${workspaceName}. Workspace → Product → Project → Issue.`
              : "Products and issue stats across every workspace you belong to."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {scopeNav}
          {statusNav}
          {canWrite && scope === "current" ? (
            <>
              <GroupProductsDialog workspaceId={workspaceId} products={products} />
              <ProductForm workspaceId={workspaceId} action={createAction} />
            </>
          ) : null}
        </div>
      </div>

      <div data-products-body="" className="space-y-8 transition-opacity duration-150">
      {scope === "current" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-tour="product-stats">
            <ProjectStatCard
              href="/products"
              label="Active products"
              value={portfolio.active}
              hint={`${portfolio.archived} archived · ${portfolio.total} total`}
              icon={Boxes}
            />
            <ProjectStatCard
              href="/projects"
              label="Projects"
              value={portfolio.projects}
              hint="Across filtered products"
              icon={FolderKanban}
            />
            <ProjectStatCard
              href="/tasks?priority=attention"
              label="Needs attention"
              value={issues.attention}
              hint={`${issues.dueSoon} due soon`}
              icon={Siren}
              iconClassName="text-amber-500"
            />
            <ProjectStatCard
              href="/tasks"
              label="Completion"
              value={`${issues.completion}%`}
              hint={`${issues.open + issues.inProgress + issues.blocked} open · ${issues.done} done`}
              icon={Gauge}
              iconClassName="text-emerald-500"
            />
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ProjectStatCard
              href="/tasks?status=open"
              label="Open"
              value={issues.open}
              hint="Ready to start"
              icon={CircleDot}
            />
            <ProjectStatCard
              href="/tasks?status=in_progress"
              label="In progress"
              value={issues.inProgress}
              hint="Actively worked"
              icon={ListTodo}
            />
            <ProjectStatCard
              href="/tasks?status=blocked"
              label="Blocked"
              value={issues.blocked}
              hint="Waiting on something"
              icon={AlertTriangle}
              iconClassName="text-rose-500"
            />
            <ProjectStatCard
              href="/tasks?status=done"
              label="Done"
              value={issues.done}
              hint="Completed issues"
              icon={CheckCircle2}
              iconClassName="text-emerald-500"
            />
          </section>

          {nestedProducts.length === 0 ? (
            <div className="rounded-xl border border-dashed px-6 py-16 text-center">
              <Boxes className="mx-auto size-8 text-muted" aria-hidden="true" />
              <p className="mt-3 text-sm text-muted">No products in this view yet.</p>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {nestedProducts.map((product) => (
                <li key={product.id} className="space-y-2">
                  <ProductCard product={product} />
                  {product.children.length > 0 ? (
                    <ul className="ml-3 space-y-2 border-l border-border/70 pl-3">
                      {product.children.map((child) => (
                        <li key={child.id}>
                          <ProductCard product={child} nested />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="space-y-8">
          {portfolios.length === 0 ? (
            <div className="rounded-xl border border-dashed px-6 py-16 text-center text-sm text-muted">
              No workspaces found.
            </div>
          ) : (
            portfolios.map((portfolioRow) => {
              const nested = nestProductRecords(portfolioRow.products);
              return (
              <section key={portfolioRow.workspace_id} className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl">{portfolioRow.workspace_name}</h2>
                      {portfolioRow.workspace_id === workspaceId ? (
                        <Badge tone="native">Current</Badge>
                      ) : null}
                      <Badge tone="project">{portfolioRow.role}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {portfolioRow.product_count}{" "}
                      {portfolioRow.product_count === 1 ? "product" : "products"} ·{" "}
                      {portfolioRow.project_count}{" "}
                      {portfolioRow.project_count === 1 ? "project" : "projects"} ·{" "}
                      {portfolioRow.open_issues} open · {portfolioRow.attention_issues} attention ·{" "}
                      {portfolioRow.completion}% done
                    </p>
                  </div>
                  {portfolioRow.workspace_id !== workspaceId ? (
                    <form action={switchWorkspaceAction}>
                      <input type="hidden" name="workspaceId" value={portfolioRow.workspace_id} />
                      <input type="hidden" name="returnTo" value="/products" />
                      <Button type="submit" variant="outline" size="sm">
                        Switch workspace
                      </Button>
                    </form>
                  ) : null}
                </div>

                {nested.length === 0 ? (
                  <p className="rounded-xl border border-dashed px-4 py-8 text-sm text-muted">
                    No products in this workspace for the current filters.
                  </p>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {nested.map((product) => (
                      <li key={product.id} className="space-y-2">
                        {portfolioRow.workspace_id === workspaceId ? (
                          <ProductCard product={product} />
                        ) : (
                          <WorkspaceProductLink
                            workspaceId={portfolioRow.workspace_id}
                            productId={product.id}
                          >
                            {(open) => (
                              <ProductCard product={product} onOpenOtherWorkspace={open} />
                            )}
                          </WorkspaceProductLink>
                        )}
                        {product.children.length > 0 ? (
                          <ul className="ml-3 space-y-2 border-l border-border/70 pl-3">
                            {product.children.map((child) => (
                              <li key={child.id}>
                                {portfolioRow.workspace_id === workspaceId ? (
                                  <ProductCard product={child} nested />
                                ) : (
                                  <WorkspaceProductLink
                                    workspaceId={portfolioRow.workspace_id}
                                    productId={child.id}
                                  >
                                    {(open) => (
                                      <ProductCard
                                        product={child}
                                        nested
                                        onOpenOtherWorkspace={open}
                                      />
                                    )}
                                  </WorkspaceProductLink>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
            })
          )}
        </div>
      )}
      </div>
    </div>
  );
}
