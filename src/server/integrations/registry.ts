import { fakeAdapter } from "./fake";
import { giteaAdapter } from "./gitea";
import { githubAdapter } from "./github";
import { gitlabAdapter } from "./gitlab";
import { jiraAdapter } from "./jira";
import { linearAdapter } from "./linear";
import { type IntegrationAdapter, type ProviderId } from "./types";

const ADAPTERS: Record<ProviderId, IntegrationAdapter> = {
  fake: fakeAdapter,
  linear: linearAdapter,
  jira: jiraAdapter,
  github: githubAdapter,
  gitlab: gitlabAdapter,
  gitea: giteaAdapter,
};

export function getAdapter(provider: ProviderId): IntegrationAdapter {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new Error(`Unknown provider ${provider}`);
  if (provider === "fake" && process.env.ALLOW_FAKE_PROVIDER !== "true") {
    throw new Error("The fake provider is disabled");
  }
  return adapter;
}

export function listAdapterProviders(): ProviderId[] {
  return ["linear", "jira", "github", "gitlab", "gitea"];
}

export function listAllAdapterProviders(): ProviderId[] {
  const providers = listAdapterProviders();
  if (process.env.ALLOW_FAKE_PROVIDER === "true") providers.push("fake");
  return providers;
}

export const OAUTH_SCOPES: Record<Exclude<ProviderId, "fake">, string[]> = {
  linear: ["read", "write"],
  jira: ["read:jira-work", "write:jira-work", "offline_access"],
  github: ["repo", "read:project", "project"],
  gitlab: ["api", "read_user"],
  gitea: ["read:user", "read:repository", "write:issue"],
};
