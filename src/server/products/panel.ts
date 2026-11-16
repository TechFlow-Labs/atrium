import {
  getProductsAnalytics,
  listProducts,
  listWorkspaceProductPortfolios,
  type ProductRecord,
  type ProductsAnalytics,
  type WorkspaceProductPortfolio,
} from "./service";

export type ProductsPanelFilter = {
  status?: "active" | "archived" | "all";
  scope?: "current" | "all";
  query?: string;
};

export type ProductsPanelPayload = {
  status: "active" | "archived" | "all";
  scope: "current" | "all";
  products: ProductRecord[];
  analytics: ProductsAnalytics;
  portfolios: WorkspaceProductPortfolio[];
};

export async function loadProductsPanel(
  userId: string,
  workspaceId: string,
  filter: ProductsPanelFilter = {},
  nowMs: number = Date.now(),
): Promise<ProductsPanelPayload> {
  const status = filter.status ?? "active";
  const scope = filter.scope ?? "current";
  const emptyAnalytics: ProductsAnalytics = {
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
  };

  const [products, analytics, portfolios] = await Promise.all([
    scope === "current"
      ? listProducts(userId, workspaceId, { status, query: filter.query })
      : Promise.resolve([]),
    scope === "current"
      ? getProductsAnalytics(userId, workspaceId, { status }, nowMs)
      : Promise.resolve(emptyAnalytics),
    scope === "all"
      ? listWorkspaceProductPortfolios(userId, { status, query: filter.query })
      : Promise.resolve([]),
  ]);

  return { status, scope, products, analytics, portfolios };
}
