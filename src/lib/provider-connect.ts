const LABELS: Record<string, string> = {
  linear: "Linear",
  jira: "Jira",
  github: "GitHub",
  gitlab: "GitLab",
  gitea: "Gitea",
  slack: "Slack",
  figma: "Figma",
  obsidian: "Obsidian",
};

function labelFor(provider: string): string {
  return LABELS[provider] ?? provider;
}

/** Primary CTA when an OAuth / install app is already configured. */
export function providerAppConnectLabel(provider: string): string {
  if (provider === "github") return "Install GitHub App";
  if (provider === "slack") return "Add to Slack";
  if (provider === "figma") return "Continue with Figma";
  return `Continue with ${labelFor(provider)}`;
}

/** Tile badge when the provider can use an app (OAuth or GitHub App). */
export function providerAppBadge(input: {
  provider: string;
  oauthReady: boolean;
  githubApp?: boolean;
}): { tone: "connected" | "neutral"; label: string } {
  if (input.provider === "obsidian") {
    return { tone: "neutral", label: "Path / token" };
  }
  if (input.provider === "github" && input.githubApp) {
    return { tone: "connected", label: "App ready" };
  }
  if (input.oauthReady) {
    return { tone: "connected", label: "App ready" };
  }
  return { tone: "neutral", label: "App setup" };
}
