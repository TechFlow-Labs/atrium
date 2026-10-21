import { Suspense } from "react";
import { ScreenLoader } from "@/components/screen-loader";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { getSessionUser } from "@/server/auth/session";
import { workspaceContext } from "@/server/auth/workspace";
import { ensurePersonalWorkspace, listWorkspaceContexts } from "@/server/workspaces/service";
import { getSeenGuideVersions } from "@/server/guides/service";
import { getOnboardingPending } from "@/server/onboarding/service";
import {
  areDevMocksVisible,
  ensureDevMockDataForAccount,
  isLocalDev,
  localDevLabel,
} from "@/server/dev/mock-data";

export const instant = false;

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ScreenLoader />}>
      <Frame>{children}</Frame>
    </Suspense>
  );
}

async function Frame({ children }: { children: React.ReactNode }) {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (await getOnboardingPending(user.id)) redirect("/onboarding");
  await ensurePersonalWorkspace(user.id, user.name);
  const [{ workspaces, current }, contexts, seenGuides] = await Promise.all([
    workspaceContext(user.id),
    listWorkspaceContexts(user.id),
    getSeenGuideVersions(user.id),
  ]);
  const localDev = isLocalDev();
  if (localDev) {
    await ensureDevMockDataForAccount(user.id, workspaces);
  }
  const cookieStore = await cookies();
  const theme = cookieStore.get("atrium_theme")?.value === "dark" ? "dark" : "light";
  const sidebarCollapsed = cookieStore.get("atrium_sidebar")?.value === "collapsed";
  const mocksVisible = localDev ? await areDevMocksVisible() : true;
  return (
    <Shell
      user={user}
      workspaces={workspaces}
      current={current}
      contexts={contexts}
      seenGuides={seenGuides}
      theme={theme}
      sidebarCollapsed={sidebarCollapsed}
      sidebarOrder={cookieStore.get("atrium_sidebar_order")?.value}
      sidebarGroups={cookieStore.get("atrium_sidebar_groups")?.value}
      devTools={localDev ? { mocksVisible, envLabel: localDevLabel() } : null}
    >
      {children}
    </Shell>
  );
}
