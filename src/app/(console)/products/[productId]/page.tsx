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
import { createProductAction, createProjectAction } from "@/app/actions";
import { AttachSubproductsDialog } from "@/components/attach-subproducts-dialog";
import { ProductEditDialog } from "@/components/product-edit-dialog";
import { ProductForm } from "@/components/product-form";
import { ProjectCard } from "@/components/project-card";
import { ProjectStatCard } from "@/components/project-dashboard";
import { ProjectForm } from "@/components/project-form";
import { ScreenLoader } from "@/components/screen-loader";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/server/auth/session";
import { workspaceContext } from "@/server/auth/workspace";
import { listIntegrations } from "@/server/integrations/service";
import { isTaskProvider } from "@/server/integrations/types";
import { getProduct, listProducts } from "@/server/products/service";
import { enrichGithubBoardTitles } from "@/server/projects/panel";
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

  const [listedProjects, integrations, siblingProducts, parent, children] = await Promise.all([
    listProjects(user.id, current.id, { status: "all", productId }),
    listIntegrations(user.id, current.id),
    listProducts(user.id, current.id, { status: "active" }),
    product.parent_id
      ? getProduct(user.id, current.id, product.parent_id)
      : Promise.resolve(null),
    listProducts(user.id, current.id, { status: "all", parentId: product.id }),
  ]);
  const projects = await enrichGithubBoardTitles(user.id, current.id, listedProjects);
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
  const canDelete = canWrite && product.project_count === 0 && product.child_count === 0;
  const isRoot = !product.parent_id;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={parent ? `/products/${parent.id}` : "/products"}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {parent ? parent.name : "Products"}
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
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href={`/tasks?product=${encodeURIComponent(product.id)}`}>View issues</Link>
            </Button>
            {canWrite ? (
              <ProductEditDialog
                workspaceId={current.id}
                product={{
                  id: product.id,
                  name: product.name,
                  description: product.description,
                  status: product.status,
                  child_count: product.child_count,
                  project_count: product.project_count,
                }}
                canDelete={canDelete}
              />
            ) : null}
            {canWrite && isRoot && product.status === "active" ? (
              <>
                <AttachSubproductsDialog
                  workspaceId={current.id}
                  parentId={product.id}
                  products={siblingProducts}
                />
                <ProductForm
                  workspaceId={current.id}
                  action={createProductAction}
                  parentId={product.id}
                  triggerLabel="Add subproduct"
                  title="New subproduct"
                  description={`Create a subproduct under ${product.name}.`}
                  submitLabel="Create subproduct"
                  variant="outline"
                />
              </>
            ) : null}
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
          href={`/tasks?product=${encodeURIComponent(product.id)}&priority=attention`}
          label="Needs attention"
          value={product.attention_issues}
          hint={`${product.blocked_issues} blocked`}
          icon={Siren}
          iconClassName="text-amber-500"
        />
        <ProjectStatCard
          href={`/tasks?product=${encodeURIComponent(product.id)}`}
          label="Completion"
          value={`${product.completion}%`}
          hint={`${product.open_issues} open · ${product.done_issues} done`}
          icon={Gauge}
          iconClassName="text-emerald-500"
        />
        <ProjectStatCard
          href={`/tasks?product=${encodeURIComponent(product.id)}&status=open`}
          label="Open issues"
          value={product.open_issues}
          hint={`${product.total_issues} total`}
          icon={CircleDot}
        />
        <ProjectStatCard
          href={`/tasks?product=${encodeURIComponent(product.id)}&status=in_progress`}
          label="In progress"
          value={product.in_progress_issues}
          hint="Actively worked"
          icon={ListTodo}
        />
        <ProjectStatCard
          href={`/tasks?product=${encodeURIComponent(product.id)}&status=blocked`}
          label="Blocked"
          value={product.blocked_issues}
          hint="Waiting on something"
          icon={AlertTriangle}
          iconClassName="text-rose-500"
        />
      </section>

      {isRoot ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xl font-medium">Subproducts</h2>
              <p className="text-sm text-muted">
                Nested products under {product.name}. Projects stay on each subproduct.
              </p>
            </div>
          </div>
          {children.length === 0 ? (
            <div className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted">
              No subproducts yet.
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {children.map((child) => (
                <li key={child.id}>
                  <Link
                    href={`/products/${child.id}`}
                    className="flex min-h-[9rem] flex-col rounded-xl border bg-card p-4 transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-[0_12px_28px_-18px_rgba(0,0,0,0.55)]"
                  >
                    <h3 className="text-base font-medium leading-snug">{child.name}</h3>
                    {child.description ? (
                      <p className="mt-2 line-clamp-2 text-sm text-muted">{child.description}</p>
                    ) : null}
                    <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-2 pt-4 text-xs">
                      <div>
                        <dt className="text-muted">Projects</dt>
                        <dd className="mt-0.5 tabular-nums font-medium">{child.project_count}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Open issues</dt>
                        <dd className="mt-0.5 tabular-nums font-medium">{child.open_issues}</dd>
                      </div>
                    </dl>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-medium">Projects</h2>
          <p className="text-sm text-muted">Projects owned by this product.</p>
        </div>
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
      </section>
    </div>
  );
}
