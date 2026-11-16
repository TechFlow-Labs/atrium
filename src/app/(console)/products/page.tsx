import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createProductAction } from "@/app/actions";
import { ProductsPageClient } from "@/components/products-page-client";
import { ScreenLoader } from "@/components/screen-loader";
import { getSessionUser } from "@/server/auth/session";
import { workspaceContext } from "@/server/auth/workspace";
import { loadProductsPanel } from "@/server/products/panel";

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
  const panel = await loadProductsPanel(user.id, current.id, { status, scope, query: params.q }, now);
  const canWrite = current.role === "owner" || current.role === "admin";

  return (
    <ProductsPageClient
      workspaceId={current.id}
      workspaceName={current.name}
      canWrite={canWrite}
      createAction={createProductAction}
      initial={panel}
    />
  );
}
