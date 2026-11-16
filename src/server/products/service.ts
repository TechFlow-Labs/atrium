import { sql } from "drizzle-orm";
import { writeAudit } from "../audit";
import { requireAction } from "../authz/membership";
import { withUser, type Tx } from "../db/client";
import { areDevMocksVisible, DEV_MOCK_NAME_PREFIX } from "../dev/mock-data";

/** Projects alias in product joins is `pr` (products already use `p`). */
function sqlProductProjectVisible(showMocks: boolean) {
  if (showMocks) return sql`true`;
  return sql`(pr.id is null or pr.name not like ${`${DEV_MOCK_NAME_PREFIX}%`})`;
}

export type ProductRecord = {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  status: "active" | "archived";
  archived_at: Date | null;
  created_at: Date;
  project_count: number;
  open_issues: number;
  in_progress_issues: number;
  attention_issues: number;
  blocked_issues: number;
  done_issues: number;
  total_issues: number;
  completion: number;
};

export type ProductsAnalytics = {
  portfolio: {
    active: number;
    archived: number;
    total: number;
    projects: number;
  };
  issues: {
    total: number;
    open: number;
    inProgress: number;
    blocked: number;
    done: number;
    attention: number;
    dueSoon: number;
    completion: number;
  };
};

export type WorkspaceProductPortfolio = {
  workspace_id: string;
  workspace_name: string;
  workspace_kind: string;
  workspace_icon: string | null;
  role: string;
  product_count: number;
  project_count: number;
  open_issues: number;
  attention_issues: number;
  completion: number;
  products: ProductRecord[];
};

const PRODUCT_STATS_SELECT = sql`
  p.id, p.workspace_id, p.name, p.description, p.status, p.archived_at, p.created_at,
  count(distinct pr.id)::int as project_count,
  count(t.id) filter (where t.deleted_at is null)::int as total_issues,
  count(t.id) filter (
    where t.deleted_at is null and t.status in ('open', 'in_progress', 'blocked')
  )::int as open_issues,
  count(t.id) filter (where t.deleted_at is null and t.status = 'in_progress')::int as in_progress_issues,
  count(t.id) filter (
    where t.deleted_at is null
      and t.status in ('open', 'in_progress', 'blocked')
      and t.priority in ('urgent', 'high')
  )::int as attention_issues,
  count(t.id) filter (where t.deleted_at is null and t.status = 'blocked')::int as blocked_issues,
  count(t.id) filter (where t.deleted_at is null and t.status = 'done')::int as done_issues
`;

function withCompletion(rows: Array<Omit<ProductRecord, "completion"> & { completion?: number }>): ProductRecord[] {
  return rows.map((row) => {
    const active = row.open_issues + row.done_issues;
    return {
      ...row,
      completion: active === 0 ? 0 : Math.round((row.done_issues / active) * 100),
    };
  });
}

/** Resolve an explicit product id, or the workspace's General product. */
export async function resolveProductId(
  tx: Tx,
  workspaceId: string,
  productId?: string | null,
): Promise<string> {
  if (productId) {
    const rows = await tx.execute<{ id: string }>(sql`
      select id from products
      where id = ${productId}::uuid and workspace_id = ${workspaceId}::uuid and status = 'active'
    `);
    if (!rows[0]) throw new Error("Product not found");
    return rows[0].id;
  }
  const general = await tx.execute<{ id: string }>(sql`
    select id from products
    where workspace_id = ${workspaceId}::uuid and name = 'General' and status = 'active'
    order by created_at
    limit 1
  `);
  if (general[0]) return general[0].id;
  const any = await tx.execute<{ id: string }>(sql`
    select id from products
    where workspace_id = ${workspaceId}::uuid and status = 'active'
    order by created_at
    limit 1
  `);
  if (!any[0]) throw new Error("No product found in this workspace — create a product first");
  return any[0].id;
}

export async function listProducts(
  userId: string,
  workspaceId: string,
  filter: { status?: "active" | "archived" | "all"; query?: string } = {},
): Promise<ProductRecord[]> {
  const showMocks = await areDevMocksVisible();
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");
    const status = filter.status ?? "active";
    const query = filter.query?.trim() ?? "";
    const rows = await tx.execute<Omit<ProductRecord, "completion">>(sql`
      select ${PRODUCT_STATS_SELECT}
      from products p
      left join projects pr on pr.product_id = p.id and ${sqlProductProjectVisible(showMocks)}
      left join tasks t on t.project_id = pr.id and t.workspace_id = p.workspace_id
      where p.workspace_id = ${workspaceId}::uuid
        and (${status} = 'all' or p.status = ${status})
        and (
          ${query} = ''
          or p.name ilike ${"%" + query + "%"}
        )
      group by p.id, p.workspace_id, p.name, p.description, p.status, p.archived_at, p.created_at
      order by p.name
    `);
    return withCompletion(rows);
  });
}

export async function getProductsAnalytics(
  userId: string,
  workspaceId: string,
  filter: { status?: "active" | "archived" | "all" } = {},
  nowMs: number = Date.now(),
): Promise<ProductsAnalytics> {
  const status = filter.status ?? "active";
  const weekEnd = new Date(nowMs + 7 * 24 * 60 * 60 * 1000).toISOString();
  const showMocks = await areDevMocksVisible();

  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");

    const portfolioRows = await tx.execute<{
      active: number;
      archived: number;
      total: number;
      projects: number;
    }>(sql`
      select
        count(*) filter (where p.status = 'active')::int as active,
        count(*) filter (where p.status = 'archived')::int as archived,
        count(*)::int as total,
        (
          select count(*)::int
          from projects pr
          join products prod on prod.id = pr.product_id
          where pr.workspace_id = ${workspaceId}::uuid
            and ${sqlProductProjectVisible(showMocks)}
            and (${status} = 'all' or prod.status = ${status})
        ) as projects
      from products p
      where p.workspace_id = ${workspaceId}::uuid
    `);

    const issueRows = await tx.execute<{
      total: number;
      open: number;
      in_progress: number;
      blocked: number;
      done: number;
      attention: number;
      due_soon: number;
    }>(sql`
      select
        count(*)::int as total,
        count(*) filter (where t.status = 'open')::int as open,
        count(*) filter (where t.status = 'in_progress')::int as in_progress,
        count(*) filter (where t.status = 'blocked')::int as blocked,
        count(*) filter (where t.status = 'done')::int as done,
        count(*) filter (
          where t.status in ('open', 'in_progress', 'blocked')
            and t.priority in ('urgent', 'high')
        )::int as attention,
        count(*) filter (
          where t.status not in ('done', 'cancelled')
            and t.due_at is not null
            and t.due_at <= ${weekEnd}
        )::int as due_soon
      from tasks t
      join projects pr on pr.id = t.project_id
      join products p on p.id = pr.product_id
      where t.workspace_id = ${workspaceId}::uuid
        and t.deleted_at is null
        and (${status} = 'all' or p.status = ${status})
        and ${sqlProductProjectVisible(showMocks)}
    `);

    const portfolio = portfolioRows[0] ?? { active: 0, archived: 0, total: 0, projects: 0 };
    const issues = issueRows[0] ?? {
      total: 0,
      open: 0,
      in_progress: 0,
      blocked: 0,
      done: 0,
      attention: 0,
      due_soon: 0,
    };
    const activeIssues = issues.open + issues.in_progress + issues.blocked + issues.done;
    const completion = activeIssues === 0 ? 0 : Math.round((issues.done / activeIssues) * 100);

    return {
      portfolio,
      issues: {
        total: issues.total,
        open: issues.open,
        inProgress: issues.in_progress,
        blocked: issues.blocked,
        done: issues.done,
        attention: issues.attention,
        dueSoon: issues.due_soon,
        completion,
      },
    };
  });
}

/** Products + stats for every workspace the user belongs to. */
export async function listWorkspaceProductPortfolios(
  userId: string,
  filter: { status?: "active" | "archived" | "all"; query?: string } = {},
): Promise<WorkspaceProductPortfolio[]> {
  const showMocks = await areDevMocksVisible();
  const status = filter.status ?? "active";
  const query = filter.query?.trim() ?? "";

  return withUser(userId, async (tx) => {
    const workspaces = await tx.execute<{
      id: string;
      name: string;
      kind: string;
      icon: string | null;
      role: string;
    }>(sql`
      select w.id, w.name, w.kind, w.icon, m.role
      from workspaces w
      join workspace_members m on m.workspace_id = w.id
      where m.user_id = current_setting('app.current_user_id', true)
      order by w.name
    `);

    const portfolios: WorkspaceProductPortfolio[] = [];
    for (const workspace of workspaces) {
      const rows = await tx.execute<Omit<ProductRecord, "completion">>(sql`
        select ${PRODUCT_STATS_SELECT}
        from products p
        left join projects pr on pr.product_id = p.id and ${sqlProductProjectVisible(showMocks)}
        left join tasks t on t.project_id = pr.id and t.workspace_id = p.workspace_id
        where p.workspace_id = ${workspace.id}::uuid
          and (${status} = 'all' or p.status = ${status})
          and (
            ${query} = ''
            or p.name ilike ${"%" + query + "%"}
          )
        group by p.id, p.workspace_id, p.name, p.description, p.status, p.archived_at, p.created_at
        order by p.name
      `);
      const products = withCompletion(rows);
      const open_issues = products.reduce((sum, product) => sum + product.open_issues, 0);
      const attention_issues = products.reduce((sum, product) => sum + product.attention_issues, 0);
      const done_issues = products.reduce((sum, product) => sum + product.done_issues, 0);
      const active = open_issues + done_issues;
      portfolios.push({
        workspace_id: workspace.id,
        workspace_name: workspace.name,
        workspace_kind: workspace.kind,
        workspace_icon: workspace.icon,
        role: workspace.role,
        product_count: products.length,
        project_count: products.reduce((sum, product) => sum + product.project_count, 0),
        open_issues,
        attention_issues,
        completion: active === 0 ? 0 : Math.round((done_issues / active) * 100),
        products,
      });
    }
    return portfolios;
  });
}

export async function getProduct(
  userId: string,
  workspaceId: string,
  productId: string,
): Promise<ProductRecord | null> {
  const showMocks = await areDevMocksVisible();
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");
    const rows = await tx.execute<Omit<ProductRecord, "completion">>(sql`
      select ${PRODUCT_STATS_SELECT}
      from products p
      left join projects pr on pr.product_id = p.id and ${sqlProductProjectVisible(showMocks)}
      left join tasks t on t.project_id = pr.id and t.workspace_id = p.workspace_id
      where p.workspace_id = ${workspaceId}::uuid and p.id = ${productId}::uuid
      group by p.id, p.workspace_id, p.name, p.description, p.status, p.archived_at, p.created_at
    `);
    return withCompletion(rows)[0] ?? null;
  });
}

export async function createProduct(
  userId: string,
  workspaceId: string,
  input: { name: string; description?: string },
): Promise<string> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new Error("Product name must be between 2 and 120 characters");
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "project.create");
    const rows = await tx.execute<{ id: string }>(sql`
      insert into products (workspace_id, name, description, created_by)
      values (
        ${workspaceId}::uuid,
        ${name},
        ${input.description?.trim() ?? ""},
        current_setting('app.current_user_id', true)
      )
      returning id
    `);
    const id = rows[0]?.id;
    if (!id) throw new Error("Product was not created");
    await writeAudit(tx, {
      workspaceId,
      action: "product.created",
      entityType: "product",
      entityId: id,
    });
    return id;
  });
}

export async function updateProduct(
  userId: string,
  workspaceId: string,
  productId: string,
  input: { name?: string; description?: string },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "project.update");
    const name = input.name?.trim();
    if (name !== undefined && (name.length < 2 || name.length > 120)) {
      throw new Error("Product name must be between 2 and 120 characters");
    }
    const rows = await tx.execute(sql`
      update products
      set name = coalesce(${name ?? null}, name),
          description = coalesce(${input.description ?? null}, description)
      where id = ${productId}::uuid and workspace_id = ${workspaceId}::uuid
      returning id
    `);
    if (!rows[0]) throw new Error("Product not found");
    await writeAudit(tx, {
      workspaceId,
      action: "product.updated",
      entityType: "product",
      entityId: productId,
    });
  });
}

export async function archiveProduct(
  userId: string,
  workspaceId: string,
  productId: string,
  archived: boolean,
): Promise<void> {
  await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "project.archive");
    if (archived) {
      const open = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from projects
        where product_id = ${productId}::uuid and status = 'active'
      `);
      if ((open[0]?.n ?? 0) > 0) {
        throw new Error("Archive or move active projects in this product first");
      }
    }
    const rows = await tx.execute(sql`
      update products
      set status = ${archived ? "archived" : "active"},
          archived_at = case when ${archived} then now() else null end
      where id = ${productId}::uuid and workspace_id = ${workspaceId}::uuid
      returning id
    `);
    if (!rows[0]) throw new Error("Product not found");
    await writeAudit(tx, {
      workspaceId,
      action: archived ? "product.archived" : "product.restored",
      entityType: "product",
      entityId: productId,
    });
  });
}

export async function deleteProduct(userId: string, workspaceId: string, productId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "project.delete");
    const product = await tx.execute<{ name: string }>(sql`
      select name from products where id = ${productId}::uuid and workspace_id = ${workspaceId}::uuid
    `);
    if (!product[0]) throw new Error("Product not found");
    await writeAudit(tx, {
      workspaceId,
      action: "product.deleted",
      entityType: "product",
      entityId: productId,
      metadata: { name: product[0].name },
    });
    await tx.execute(sql`select delete_product(${productId}::uuid)`);
  });
}
