import { sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import { resolveOAuthApp, type ResolvedOAuthApp } from "./oauth-apps";
import { openCredential, sealCredential } from "./credentials";
import { ProviderError, type ProviderId, type StoredCredential } from "./types";
import { isOAuthProvider } from "@/lib/oauth-providers";
import { giteaOAuthSiteUrl } from "./gitea-site";

/** Refresh a couple of minutes before expiry so in-flight sync jobs don't race the clock. */
const REFRESH_SKEW_MS = 2 * 60 * 1000;

export function credentialNeedsRefresh(credential: StoredCredential): boolean {
  if (!credential.refreshToken) return false;
  if (!credential.expiresAt) return false;
  const expiresAt = Date.parse(credential.expiresAt);
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt <= Date.now() + REFRESH_SKEW_MS;
}

async function refreshWithApp(
  provider: ProviderId,
  credential: StoredCredential,
  app: ResolvedOAuthApp,
): Promise<StoredCredential> {
  const refreshToken = credential.refreshToken;
  if (!refreshToken) {
    throw new ProviderError("Provider access token expired. Reconnect this integration.", "unauthorized", false);
  }

  if (provider === "linear") {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: app.clientId,
      client_secret: app.clientSecret,
      refresh_token: refreshToken,
    });
    const response = await fetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!json.access_token) {
      throw new ProviderError(
        json.error_description ?? json.error ?? "Linear could not refresh the access token. Reconnect this integration.",
        "unauthorized",
        false,
      );
    }
    return {
      ...credential,
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? refreshToken,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : credential.expiresAt,
    };
  }

  if (provider === "gitlab") {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: app.clientId,
      client_secret: app.clientSecret,
      refresh_token: refreshToken,
    });
    const response = await fetch("https://gitlab.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!json.access_token) {
      throw new ProviderError(
        json.error ?? "GitLab could not refresh the access token. Reconnect this integration.",
        "unauthorized",
        false,
      );
    }
    return {
      ...credential,
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? refreshToken,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : credential.expiresAt,
      siteUrl: credential.siteUrl ?? "https://gitlab.com",
    };
  }

  if (provider === "gitea") {
    const site = giteaOAuthSiteUrl(app.siteUrl ?? credential.siteUrl);
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: app.clientId,
      client_secret: app.clientSecret,
      refresh_token: refreshToken,
    });
    const response = await fetch(`${site}/login/oauth/access_token`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!json.access_token) {
      throw new ProviderError(
        json.error ?? "Gitea could not refresh the access token. Reconnect this integration.",
        "unauthorized",
        false,
      );
    }
    return {
      ...credential,
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? refreshToken,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : credential.expiresAt,
      siteUrl: site,
    };
  }

  if (provider === "jira") {
    const response = await fetch("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: app.clientId,
        client_secret: app.clientSecret,
        refresh_token: refreshToken,
      }),
    });
    const json = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!json.access_token) {
      throw new ProviderError(
        json.error_description ?? json.error ?? "Jira could not refresh the access token. Reconnect this integration.",
        "unauthorized",
        false,
      );
    }
    return {
      ...credential,
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? refreshToken,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : credential.expiresAt,
    };
  }

  // GitHub OAuth apps issue non-expiring tokens; nothing to refresh.
  return credential;
}

/**
 * Proactively refresh OAuth access tokens before calling a provider.
 * Persists the rotated credential so workers and page loads share the new token.
 */
export async function ensureFreshCredentials(
  tx: Tx,
  input: {
    integrationId: string;
    workspaceId: string;
    provider: ProviderId;
    ciphertext: string | null;
  },
  force = false,
): Promise<StoredCredential> {
  let ciphertext = input.ciphertext;
  // After a prior refresh in this request, re-read so we use the rotated refresh token.
  if (force) {
    const rows = await tx.execute<{ credential_ciphertext: string | null }>(sql`
      select credential_ciphertext from integrations where id = ${input.integrationId}::uuid limit 1
    `);
    ciphertext = rows[0]?.credential_ciphertext ?? ciphertext;
  }

  const credentials = openCredential(ciphertext);
  if (!credentials) {
    throw new ProviderError("Integration is disconnected", "unauthorized", false);
  }
  if (!credentials.refreshToken) return credentials;
  if (!force && !credentialNeedsRefresh(credentials)) return credentials;
  if (!isOAuthProvider(input.provider) || input.provider === "github") return credentials;

  const app = await resolveOAuthApp(tx, input.workspaceId, input.provider);
  if (!app) {
    throw new ProviderError(
      "Access token expired. Reconnect this integration (OAuth app settings are required to refresh).",
      "unauthorized",
      false,
    );
  }

  const next = await refreshWithApp(input.provider, credentials, app);
  await tx.execute(sql`
    update integrations
    set credential_ciphertext = ${sealCredential(next)},
        last_error = null,
        status = 'connected',
        last_validated_at = now()
    where id = ${input.integrationId}::uuid
  `);
  return next;
}

export function isUnauthorizedProviderError(error: unknown): boolean {
  return error instanceof ProviderError && error.code === "unauthorized";
}
