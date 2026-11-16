import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  AlertTriangle,
  CircleDot,
  FolderKanban,
  Gauge,
  ListTodo,
  Siren,
} from "lucide-react";
import {
  archiveProductAction,
  createProjectAction,
  deleteProductAction,
  updateProductAction,
} from "@/app/actions";
import { ProjectCard } from "@/components/project-card";
import { ProjectStatCard } from "@/components/project-dashboard";
import { ProjectForm } from "@/components/project-form";
import { ScreenLoader } from "@/components/screen-loader";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/field";
import { getSessionUser } from "@/server/auth/session";
import { workspaceContext } from "@/server/auth/workspace";
import { listIntegrations } from "@/server/integrations/service";
import { isTaskProvider } from "@/server/integrations/types";
import { getProduct } from "@/server/products/service";
import { listProjects } from "@/server/projects/service";

export const instant = false;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  return (
    <Suspense fallback={<ScreenLoader />}>
      <ProductDetailContent params={params} />
    </Suspense>
  );
}

async function ProductDetailContent({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { productId } = await params;
  if (!UUID_RE.test(productId)) notFound();

  const { current } = await workspaceContext(user.id);
  const product = await getProduct(user.id, current.id, productId);
  if (!product) notFound();

  const [projects, integrations] = await Promise.all([
    listProjects(user.id, current.id, { status: "all", productId }),
    listIntegrations(user.id, current.id),
  ]);
  const canWrite = current.role === "owner" || current.role === "admin";
  const linkableIntegrations = integrations
    .filter(
      (integration) =>
        isTaskProvider(integration.provider)
        && integration.status === "connected"
        && integration.hasCredential,
    )
    .map((integration) => ({
      id: integration.id,
      provider: integration.provider,
      displayName: integration.display_name,
    }));
  const canDelete = canWrite && product.project_count === 0;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Products
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-4xl">{product.name}</h1>
            {product.description ? (
              <p className="mt-1 text-sm text-muted">{product.description}</p>
            ) : (
              <p className="mt-1 text-sm text-muted">
                {product.project_count} {product.project_count === 1 ? "project" : "projects"} ·{" "}
                {product.open_issues} open issues · {product.completion}% complete
              </p>
            )}
          </div>
          {canWrite && product.status === "active" ? (
            <ProjectForm
              workspaceId={current.id}
              productId={product.id}
              products={[{ id: product.id, name: product.name }]}
              action={createProjectAction}
              integrations={linkableIntegrations}
            />
          ) : null}
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-tour="product-detail-stats">
        <ProjectStatCard
          href="/projects"
          label="Projects"
          value={product.project_count}
          hint="In this product"
          icon={FolderKanban}
        />
        <ProjectStatCard
          href="/tasks?priority=attention"
          label="Needs attention"
          value={product.attention_issues}
          hint={`${product.blocked_issues} blocked`}
          icon={Siren}
          iconClassName="text-amber-500"
        />
        <ProjectStatCard
          href="/tasks"
          label="Completion"
          value={`${product.completion}%`}
          hint={`${product.open_issues} open · ${product.done_issues} done`}
          icon={Gauge}
          iconClassName="text-emerald-500"
        />
        <ProjectStatCard
          href="/tasks?status=open"
          label="Open issues"
          value={product.open_issues}
          hint={`${product.total_issues} total`}
          icon={CircleDot}
        />
        <ProjectStatCard
          href="/tasks?status=in_progress"
          label="In progress"
          value={product.in_progress_issues}
          hint="Actively worked"
          icon={ListTodo}
        />
        <ProjectStatCard
          href="/tasks?status=blocked"
          label="Blocked"
          value={product.blocked_issues}
          hint="Waiting on something"
          icon={AlertTriangle}
          iconClassName="text-rose-500"
        />
      </section>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted">
          No projects in this product yet.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              workspaceId={current.id}
              project={project}
              canWrite={canWrite}
            />
          ))}
        </ul>
      )}

      {canWrite ? (
        <section className="max-w-xl space-y-6 rounded-xl border bg-card p-5">
          <h2 className="text-lg font-medium">Product settings</h2>
          <form action={updateProductAction} className="grid gap-3">
            <input type="hidden" name="workspaceId" value={current.id} />
            <input type="hidden" name="productId" value={product.id} />
            <div>
              <Label htmlFor="edit-product-name">Name</Label>
              <Input
                id="edit-product-name"
                name="name"
                defaultValue={product.name}
                required
                className="mt-1"
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
            <Button type="submit" variant="secondary">
              Save changes
            </Button>
          </form>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <form action={archiveProductAction}>
              <input type="hidden" name="workspaceId" value={current.id} />
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
                <input type="hidden" name="workspaceId" value={current.id} />
                <input type="hidden" name="productId" value={product.id} />
                <Button type="submit" variant="destructive">
                  Delete product
                </Button>
              </form>
            ) : (
              <p className="text-xs text-muted">
                Delete projects first to remove this product.
              </p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
