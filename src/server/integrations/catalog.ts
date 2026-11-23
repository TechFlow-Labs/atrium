import { isGithubAppConfigured } from "./github-app";
import { oauthAppOverview, type OAuthAppOverview } from "./oauth-apps";
import { listAdapterProviders } from "./registry";
import { CHAT_PROVIDERS, DESIGN_PROVIDERS, NOTE_PROVIDERS } from "./types";
import type { OAuthProvider } from "@/lib/oauth-providers";

// The providers a user can connect, whether each one can use OAuth in this
// workspace, and the OAuth app status for the settings panel.
export async function providerCatalog(
  userId: string,
  workspaceId: string,
): Promise<{
  providers: string[];
  oauth: Record<string, boolean>;
  overview: Record<OAuthProvider, OAuthAppOverview>;
  githubApp: boolean;
}> {
  const providers = [
    ...listAdapterProviders().filter((provider) => provider !== "fake"),
    ...CHAT_PROVIDERS,
    ...NOTE_PROVIDERS,
    ...DESIGN_PROVIDERS,
  ];
  const overview = await oauthAppOverview(userId, workspaceId);
  const githubApp = isGithubAppConfigured();
  const oauth = Object.fromEntries(
    providers.map((provider) => {
      if (provider === "github" && githubApp) return [provider, true] as const;
      const status = overview[provider as OAuthProvider];
      return [provider, Boolean(status?.source)] as const;
    }),
  );
  return { providers, oauth, overview, githubApp };
}
