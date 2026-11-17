// Setup guides shown next to each integration. They are plain data so they can
// be used on the server and the client. Provider consoles change their labels
// over time, so keep the wording close to the goal of each step.
//
// `{callbackUrl}` is replaced with this deployment's callback for the provider.

export type IntegrationGuide = {
  provider: string;
  title: string;
  // What the user needs before starting.
  needs: string[];
  // Numbered steps on the provider's website or in Atrium.
  steps: string[];
  notes?: string[];
};

const GITHUB_OAUTH: IntegrationGuide = {
  provider: "github",
  title: "GitHub",
  needs: [
    "Server env GITHUB_APP_CLIENT_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_SLUG, and GITHUB_APP_WEBHOOK_SECRET.",
    "Permission to install the App on the org or user that owns the repositories.",
  ],
  steps: [
    "Create a GitHub App with Issues R/W, Metadata R, Pull requests R, and Projects R/W.",
    "Homepage: your Atrium address. Setup URL: {callbackBase}/api/integrations/github/setup. Webhook: {callbackBase}/api/webhooks/github/app.",
    "Put the Client ID, private key PEM, App slug, and webhook secret in the server environment, then redeploy.",
    "In Atrium, open GitHub → Install GitHub App and choose repositories.",
  ],
  notes: [
    "Installation tokens refresh automatically. Reinstall once if you previously used classic OAuth or a revoked PAT.",
    "You can still paste a personal access token as a fallback (no auto-refresh).",
  ],
};

const GITLAB_OAUTH: IntegrationGuide = {
  provider: "gitlab",
  title: "GitLab",
  needs: [
    "A GitLab.com account that can read the projects you want to sync.",
    "Your Atrium address, which is the callback URL shown below.",
  ],
  steps: [
    "Open GitLab → your profile → Edit profile → Applications (or Preferences → Applications), then choose Add new application.",
    "Name: Atrium. Redirect URI: {callbackUrl}",
    "Keep Confidential checked. Atrium keeps the secret on the server.",
    "Select the scopes api and read_user, then save.",
    "Copy the Application ID and the Secret into the GitLab fields in Atrium (or set GITLAB_CLIENT_ID and GITLAB_CLIENT_SECRET on the server).",
  ],
  notes: [
    "This guide is for GitLab.com. For a self-managed GitLab, create the application in its admin area and enter that instance's address.",
  ],
};

const GITEA_OAUTH: IntegrationGuide = {
  provider: "gitea",
  title: "Gitea",
  needs: [
    "An account on your Gitea instance.",
    "The address of your Gitea instance, for example https://gitea.example.com.",
    "Your Atrium address, which is the callback URL shown below.",
  ],
  steps: [
    "Open Gitea → Settings → Applications → OAuth2 Applications (on your instance, user settings).",
    "Application name: Atrium. Redirect URI: {callbackUrl}",
    "Create the application, then copy the Client ID and the Client Secret. Gitea shows the secret only once.",
    "In Atrium, enter the client ID and secret, and set the Gitea site URL to your instance (for example https://gitea.example.com).",
  ],
  notes: [
    "If you lose the secret, regenerate it from the same Applications page and update Atrium.",
  ],
};

const LINEAR_OAUTH: IntegrationGuide = {
  provider: "linear",
  title: "Linear",
  needs: [
    "A Linear account with access to the teams you want to sync.",
    "Your Atrium address, which is the callback URL shown below.",
  ],
  steps: [
    "Open Linear → Settings → API → OAuth applications (in some versions shown as Your Applications), then create a new OAuth2 application.",
    "Name: Atrium. Redirect URL: {callbackUrl}",
    "Save, then copy the Client ID and the Client secret into the Linear fields in Atrium (or set LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET on the server).",
    "Back in Atrium, choose Continue with Linear to authorize access.",
  ],
  notes: [
    "Atrium requests the read and write scopes.",
  ],
};

const JIRA_OAUTH: IntegrationGuide = {
  provider: "jira",
  title: "Jira Cloud",
  needs: [
    "An Atlassian account that can administer the Jira sites you want to sync.",
    "Your Atrium address, which is the callback URL shown below.",
  ],
  steps: [
    "Open the Atlassian developer console at developer.atlassian.com/console/myapps, then choose Create → OAuth 2.0 integration.",
    "Name the app Atrium, then open Authorization → OAuth 2.0 (3LO) → Add, and set the callback URL to {callbackUrl}",
    "Open Permissions → Jira API and add the scopes read:jira-work, write:jira-work, and offline_access.",
    "Open Settings to copy the Client ID and the Secret into the Jira fields in Atrium (or set JIRA_CLIENT_ID and JIRA_CLIENT_SECRET on the server).",
    "Back in Atrium, choose Continue with Jira to authorize access to your site.",
  ],
  notes: [
    "Atlassian apps have one callback URL, so use a separate app for each Atrium address.",
  ],
};

const SLACK_TOKEN: IntegrationGuide = {
  provider: "slack",
  title: "Slack",
  needs: [
    "Permission to install apps in your Slack workspace.",
    "The channels you want to show on the Chats page.",
  ],
  steps: [
    "Open api.slack.com/apps, choose Create New App → From scratch, name it, and select your workspace.",
    "Open OAuth & Permissions → Bot Token Scopes, then add channels:history, channels:read, groups:history, groups:read, and users:read.",
    "Scroll up and choose Install to Workspace, then approve the request.",
    "Copy the Bot User OAuth Token. It starts with xoxb-. Paste it into Atrium.",
    "In Slack, open each channel you want in Atrium and type /invite @YourApp (use your app's name).",
  ],
  notes: [
    "Atrium reads today's messages. It does not post to Slack.",
  ],
};

const OBSIDIAN_NOTES: IntegrationGuide = {
  provider: "obsidian",
  title: "Obsidian",
  needs: [
    "An Obsidian vault that syncs through Self-hosted LiveSync.",
    "Either the vault's folder on the same server as Atrium, or the vault bridge running on the LiveSync server.",
  ],
  steps: [
    "Same server: set OBSIDIAN_VAULT_ROOT to the folder that contains the vault (for example /root/vaults), then enter the vault path (for example /root/vaults/THEVAULT) in Atrium.",
    "Different server: deploy services/obsidian-vault-bridge on the LiveSync server, put it behind HTTPS, and set its API_TOKEN.",
    "In Atrium, enter the bridge's HTTPS address as the vault URL and the same API_TOKEN as the access token.",
    "Open Notes and refresh after LiveSync updates the vault.",
  ],
  notes: [
    "Atrium reads notes. It does not edit them.",
  ],
};

export const INTEGRATION_GUIDES: Record<string, IntegrationGuide> = {
  linear: LINEAR_OAUTH,
  jira: JIRA_OAUTH,
  github: GITHUB_OAUTH,
  gitlab: GITLAB_OAUTH,
  gitea: GITEA_OAUTH,
  slack: SLACK_TOKEN,
  obsidian: OBSIDIAN_NOTES,
};

export function integrationGuide(provider: string): IntegrationGuide | null {
  return INTEGRATION_GUIDES[provider] ?? null;
}

export function fillCallback(text: string, callbackUrl: string, callbackBase = ""): string {
  return text
    .split("{callbackUrl}")
    .join(callbackUrl)
    .split("{callbackBase}")
    .join(callbackBase || callbackUrl.replace(/\/api\/integrations\/oauth\/[^/]+\/callback$/, ""));
}
