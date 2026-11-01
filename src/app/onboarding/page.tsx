import { Suspense } from "react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { ScreenLoader } from "@/components/screen-loader";
import { parseMotionEnabled } from "@/lib/apply-theme";
import { parseColorPalette, parseThemeMode } from "@/lib/theme";
import { getSessionUser } from "@/server/auth/session";
import { workspaceContext } from "@/server/auth/workspace";
import { providerCatalog } from "@/server/integrations/catalog";
import { listIntegrations } from "@/server/integrations/service";
import { listMcpTokens, mcpServerUrl } from "@/server/mcp/tokens";
import { readAppearanceFlags, readProfilePreferences } from "@/server/onboarding/service";

export const instant = false;

export default function OnboardingPage() {
  return (
    <Suspense fallback={<ScreenLoader />}>
      <OnboardingContent />
    </Suspense>
  );
}

async function OnboardingContent() {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { workspaces, current } = await workspaceContext(user.id);
  const [integrations, tokens, profile, flags] = await Promise.all([
    listIntegrations(user.id, current.id),
    listMcpTokens(user.id),
    readProfilePreferences(user.id),
    readAppearanceFlags(user.id),
  ]);
  const cookieStore = await cookies();
  const { providers, oauth } = await providerCatalog(user.id, current.id);
  const canAdmin = current.role === "owner" || current.role === "admin";
  const workspaceOptions = workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name }));

  return (
    <OnboardingWizard
      callbackBase={(process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "")}
      userName={user.name}
      profile={profile}
      appearance={{
        theme: parseThemeMode(cookieStore.get("atrium_theme")?.value),
        palette: parseColorPalette(cookieStore.get("atrium_palette")?.value),
        animationsEnabled: flags?.animationsEnabled ?? parseMotionEnabled(cookieStore.get("atrium_motion")?.value),
        providerTileStyles: flags?.providerTileStyles ?? parseMotionEnabled(cookieStore.get("atrium_provider_tiles")?.value),
        groupRelatedTasks:
          flags?.groupRelatedTasks
          ?? parseMotionEnabled(cookieStore.get("atrium_group_related_tasks")?.value),
      }}
      workspace={{ id: current.id, name: current.name }}
      canAdmin={canAdmin}
      integrations={integrations}
      providers={providers}
      oauth={oauth}
      mcp={{
        serverUrl: mcpServerUrl(),
        workspaces: workspaceOptions,
        tokens,
        currentWorkspaceId: current.id,
      }}
    />
  );
}
