# Provider OAuth setup

Atrium can connect Linear, Jira Cloud, GitLab, and Gitea through each provider’s authorize screen. GitHub uses a **GitHub App** (installation tokens that refresh automatically). Without OAuth or App credentials, admins can still paste a personal access token.

OAuth is enabled per provider when both env vars are set:

```bash
{PROVIDER}_CLIENT_ID=...
{PROVIDER}_CLIENT_SECRET=...
```

`BETTER_AUTH_URL` must be the public origin Atrium is served from (no trailing slash). Classic OAuth callback URLs are:

```text
{BETTER_AUTH_URL}/api/integrations/oauth/{provider}/callback
```

Print those URLs for your current env:

```bash
pnpm oauth:redirects
```

## GitHub (GitHub App)

Prefer a deployment-wide **GitHub App**. Atrium mints short-lived installation tokens with the App private key, so sync does not depend on a long-lived user OAuth token.

### Create the App

1. Open [GitHub → Developer settings → GitHub Apps](https://github.com/settings/apps) → **New GitHub App**.
2. **GitHub App name:** `Atrium` (or your deployment name).
3. **Homepage URL:** your `BETTER_AUTH_URL` (production: `https://atrium.techflowlabs.gr`; local: `http://127.0.0.1:38471`).
4. **Callback URL:** not required for installation-only auth. You can leave user authorization disabled.
5. **Setup URL (optional):** `{BETTER_AUTH_URL}/api/integrations/github/setup` — Atrium also accepts this as the post-install redirect when the install flow includes `state`.
6. **Webhook:** active. **Webhook URL:** `{BETTER_AUTH_URL}/api/webhooks/github/app`. Set a webhook secret and keep it for env.
7. **Repository permissions:** Issues Read & write, Metadata Read-only, Pull requests Read-only.
8. **Organization permissions** (and/or account): Projects Read & write (Projects v2 Status).
9. **Subscribe to events:** Issues, Pull request, Projects v2 item (and related project item events as listed in the App UI).
10. Create the App, note the **App slug** (from the public page URL `github.com/apps/{slug}`), **Client ID**, and generate a **private key** (`.pem`).

### Env

Put these in `/opt/atrium/.env` (production) or `.env.local` (dev). Compose passes them into **app** and **worker**:

```bash
GITHUB_APP_CLIENT_ID=Iv23...
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_APP_SLUG=atrium
GITHUB_APP_WEBHOOK_SECRET=...
```

Use literal `\n` in the PEM string if the secret is a single line. Restart / redeploy after changing env.

### Connect in Atrium

1. As an owner/admin, open **Integrations**.
2. Choose GitHub → **Install GitHub App**.
3. Pick the org or user and the repositories Atrium may access.
4. After redirect back, open the integration and link repositories. Project Status sync uses the mapped Projects v2 board (see the project **Manage** section).

Reinstall once if you previously connected with a classic OAuth App or a dead PAT — Dead letters with `Bad credentials` clear after a successful App install and retry.

### Legacy classic OAuth

`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` still enable the old user OAuth path when no GitHub App env is set. Prefer the App. Tokens from classic OAuth are not refreshed automatically.

## GitLab.com

1. Open [GitLab → Preferences → Applications](https://gitlab.com/-/user_settings/applications) (or a group/instance application).
2. Name: `Atrium`.
3. Redirect URI: `{BETTER_AUTH_URL}/api/integrations/oauth/gitlab/callback`.
4. Confidential: **Yes**.
5. Scopes: `api`, `read_user`.
6. Save, then copy **Application ID** and **Secret** into `.env.local`:

```bash
GITLAB_CLIENT_ID=...
GITLAB_CLIENT_SECRET=...
```

7. Restart `pnpm dev`.

OAuth targets `https://gitlab.com`. Self-managed GitLab can still connect with a personal access token and site URL on the token form.

## Gitea

1. On your Gitea instance open **Settings → Applications → OAuth2 Applications** (or the site admin equivalent).
2. Name: `Atrium`.
3. Redirect URI: `{BETTER_AUTH_URL}/api/integrations/oauth/gitea/callback`.
4. Create the application, then copy **Client ID** and **Client Secret** into `.env.local`:

```bash
GITEA_CLIENT_ID=...
GITEA_CLIENT_SECRET=...
# Optional — defaults to https://gitea.com
GITEA_SITE_URL=https://gitea.example.com
```

5. Restart `pnpm dev`.

Atrium requests `read:user`, `read:repository`, and `write:issue`. OAuth uses `GITEA_SITE_URL` (or `https://gitea.com`). Self-hosted instances can also connect with a personal access token and site URL on the token form.

## Linear

1. Create an OAuth application in the [Linear API settings](https://linear.app/settings/api).
2. Callback: `{BETTER_AUTH_URL}/api/integrations/oauth/linear/callback`.
3. Scopes used by Atrium: `read`, `write`.

```bash
LINEAR_CLIENT_ID=...
LINEAR_CLIENT_SECRET=...
```

## Jira Cloud

1. Create an OAuth 2.0 (3LO) app in the [Atlassian developer console](https://developer.atlassian.com/console/myapps/).
2. Callback: `{BETTER_AUTH_URL}/api/integrations/oauth/jira/callback`.
3. Scopes: `read:jira-work`, `write:jira-work`, `offline_access`.

```bash
JIRA_CLIENT_ID=...
JIRA_CLIENT_SECRET=...
```

## Local checklist

1. `BETTER_AUTH_URL` matches the browser origin (`http://127.0.0.1:38471` for `pnpm dev`).
2. For GitHub App: Client ID, private key, slug, and webhook secret are set; Setup and Webhook URLs match `BETTER_AUTH_URL`.
3. For other providers: callback URLs in the provider consoles match `pnpm oauth:redirects` exactly.
4. Env is loaded and the app (and worker, in production) was restarted.
5. On **Integrations**, GitHub shows **Install GitHub App** when App env is configured; other providers show **Continue with …** when OAuth is configured.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| No Install / OAuth button | Missing App or `{PROVIDER}_CLIENT_*` env, or server not restarted |
| `redirect_uri` / Setup URL mismatch | URL in the GitHub App settings differs from `BETTER_AUTH_URL` |
| OAuth / install state expired | Took longer than 15 minutes; start again from Integrations |
| Dead letters `Bad credentials` | Legacy OAuth/PAT revoked; Install the GitHub App and retry |
| Webhook `/app` 500 | Old deploy without the static App webhook route; redeploy |
