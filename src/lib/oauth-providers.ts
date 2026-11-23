// Providers that use OAuth. Shared by the server and the client, so keep this
// file free of server-only imports.
export const OAUTH_PROVIDERS = ["linear", "jira", "github", "gitlab", "gitea", "slack"] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export const OAUTH_PROVIDER_LABELS: Record<OAuthProvider, string> = {
  linear: "Linear",
  jira: "Jira Cloud",
  github: "GitHub",
  gitlab: "GitLab",
  gitea: "Gitea",
  slack: "Slack",
};

export function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}
