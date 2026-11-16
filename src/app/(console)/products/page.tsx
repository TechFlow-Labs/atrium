import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Archive, Building2, CircleDot, Layers } from "lucide-react";
import { createProductAction } from "@/app/actions";
import { ProductsBoard } from "@/components/products-board";
import { ScreenLoader } from "@/components/screen-loader";
import { getSessionUser } from "@/server/auth/session";
import { workspaceContext } from "@/server/auth/workspace";
import {
  getProductsAnalytics,
  listProducts,
  listWorkspaceProductPortfolios,
} from "@/server/products/service";
import { cn } from "@/lib/utils";

export const instant = false;

export default function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; scope?: string }>;
}) {
  return (
    <Suspense fallback={<ScreenLoader />}>
      <ProductsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ProductsContent({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; scope?: string }>;
}) {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { current } = await workspaceContext(user.id);
  const params = await searchParams;
  const status = params.status === "archived" || params.status === "all" ? params.status : "active";
  const scope = params.scope === "all" ? "all" : "current";
  // eslint-disable-next-line react-hooks/purity -- connection() already opted this request out of prerender
  const now = Date.now();

  const [products, analytics, portfolios] = await Promise.all([
    scope === "current"
      ? listProducts(user.id, current.id, { status, query: params.q })
      : Promise.resolve([]),
    scope === "current"
      ? getProductsAnalytics(user.id, current.id, { status }, now)
      : Promise.resolve({
          portfolio: { active: 0, archived: 0, total: 0, projects: 0 },
          issues: {
            total: 0,
            open: 0,
            inProgress: 0,
            blocked: 0,
            done: 0,
            attention: 0,
            dueSoon: 0,
            completion: 0,
          },
        }),
    scope === "all"
      ? listWorkspaceProductPortfolios(user.id, { status, query: params.q })
      : Promise.resolve([]),
  ]);

  const canWrite = current.role === "owner" || current.role === "admin";
  const statusQuery = status === "active" ? "" : `status=${status}`;
  const scopeBase = (nextScope: "current" | "all") => {
    const parts = [
      nextScope === "all" ? "scope=all" : "",
      statusQuery,
      params.q ? `q=${encodeURIComponent(params.q)}` : "",
    ].filter(Boolean);
    return parts.length ? `/products?${parts.join("&")}` : "/products";
  };
  const statusHref = (value: "active" | "archived" | "all") => {
    const parts = [
      scope === "all" ? "scope=all" : "",
      value === "active" ? "" : `status=${value}`,
      params.q ? `q=${encodeURIComponent(params.q)}` : "",
    ].filter(Boolean);
    return parts.length ? `/products?${parts.join("&")}` : "/products";
  };

  const scopeNav = (
    <nav
      className="flex items-center gap-1 rounded-md border bg-card p-0.5 text-sm"
      aria-label="Product scope"
    >
      {(
        [
          { href: scopeBase("current"), value: "current", label: "This workspace", icon: CircleDot },
          { href: scopeBase("all"), value: "all", label: "All workspaces", icon: Building2 },
        ] as const
      ).map(({ href, value, label, icon: Icon }) => {
        const active = scope === value;
        return (
          <Link
            key={value}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 transition",
              active
                ? "bg-foreground text-background"
                : "text-muted hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const statusNav = (
    <nav
      data-tour="product-status"
      className="flex items-center gap-1 rounded-md border bg-card p-0.5 text-sm"
      aria-label="Product status"
    >
      {(
        [
          { href: statusHref("active"), value: "active", label: "Active", icon: CircleDot },
          { href: statusHref("archived"), value: "archived", label: "Archived", icon: Archive },
          { href: statusHref("all"), value: "all", label: "All", icon: Layers },
        ] as const
      ).map(({ href, value, label, icon: Icon }) => {
        const active = status === value;
        return (
          <Link
            key={value}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 transition",
              active
                ? "bg-foreground text-background"
                : "text-muted hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <ProductsBoard
      workspaceId={current.id}
      workspaceName={current.name}
      canWrite={canWrite}
      createAction={createProductAction}
      statusNav={statusNav}
      scopeNav={scopeNav}
      scope={scope}
      analytics={analytics}
      products={products}
      portfolios={portfolios}
    />
  );
}
