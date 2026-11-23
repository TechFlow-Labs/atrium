import { Suspense } from "react";
import { ScreenLoader } from "@/components/screen-loader";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createProjectAction } from "@/app/actions";
import { HomePageClient, type HomeFeedPanel } from "@/components/home-page-client";
import { getSessionUser } from "@/server/auth/session";
import { workspaceContext } from "@/server/auth/workspace";
import { homeFeed } from "@/server/home/service";
import { providerCatalog } from "@/server/integrations/catalog";
import { listIntegrations } from "@/server/integrations/service";
import { isTaskProvider } from "@/server/integrations/types";

function toHomeFeedPanel(feed: Awaited<ReturnType<typeof homeFeed>>): HomeFeedPanel {
  return {
    source: feed.source,
    sources: [...feed.sources],
    weekEnd: feed.weekEnd,
    stats: feed.stats,
    health: feed.health.map((row) => ({
      stale: Boolean(row.stale),
      last_error: row.last_error ?? null,
    })),
    priorities: feed.priorities.map((task) => ({
      id: task.id as string | number,
      title: String(task.title),
      priority: String(task.priority),
      project_name: String(task.project_name),
      provider: (task.provider as string | null) ?? null,
    })),
    dueSoon: feed.dueSoon.map((task) => ({
      id: task.id as string | number,
      title: String(task.title),
      due_at: (task.due_at as string | Date | null) ?? null,
      project_name: String(task.project_name),
      provider: (task.provider as string | null) ?? null,
    })),
    blocked: feed.blocked.map((task) => ({
      id: task.id as string | number,
      title: String(task.title),
      project_name: String(task.project_name),
      provider: (task.provider as string | null) ?? null,
    })),
    products: feed.products,
  };
}

export const instant = false;

type HomeSearchParams = {
  source?: string;
};

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<HomeSearchParams>;
}) {
  return (
    <Suspense fallback={<ScreenLoader />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeContent({
  searchParams,
}: {
  searchParams: Promise<HomeSearchParams>;
}) {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { current } = await workspaceContext(user.id);
  const params = await searchParams;
  // eslint-disable-next-line react-hooks/purity -- connection() already opted this request out of prerender
  const now = Date.now();
  const feed = await homeFeed(user.id, current.id, now, params.source);
  const canManageProjects = current.role === "owner" || current.role === "admin";
  const showNoProjects = feed.stats.projects === 0;
  const [integrations, catalog] = showNoProjects
    ? await Promise.all([
        listIntegrations(user.id, current.id),
        providerCatalog(user.id, current.id),
      ])
    : [null, null];
  const callbackBase = (process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
  const taskIntegrations =
    integrations
      ?.filter((item) => isTaskProvider(item.provider) && item.status !== "revoked")
      .map((item) => ({
        id: item.id,
        provider: item.provider,
        status: item.status,
        display_name: item.display_name,
        hasCredential: item.hasCredential,
      })) ?? [];
  const taskProviders = catalog?.providers.filter((provider) => isTaskProvider(provider)) ?? [];

  return (
    <HomePageClient
      workspaceId={current.id}
      workspaceName={current.name}
      workspaceKind={current.kind}
      workspaceIcon={current.icon}
      initialFeed={toHomeFeedPanel(feed)}
      noProjects={
        showNoProjects
          ? {
              canManage: canManageProjects,
              integrations: taskIntegrations,
              providers: taskProviders,
              oauth: catalog?.oauth ?? {},
              githubApp: catalog?.githubApp ?? false,
              callbackBase,
              createAction: createProjectAction,
            }
          : null
      }
    />
  );
}
