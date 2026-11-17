import { createPrivateKey, randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { sql } from "drizzle-orm";
import { writeAudit } from "../audit";
import { requireAction } from "../authz/membership";
import { sha256 } from "../crypto/secrets";
import { withUser } from "../db/client";
import { textArray } from "../db/sql";
import { sealCredential } from "./credentials";
import { providerFetch } from "./http";
import { ProviderError, type StoredCredential } from "./types";

export type GithubAppConfig = {
  clientId: string;
  privateKeyPem: string;
  slug: string;
  webhookSecret: string | null;
};

function normalizePem(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes("BEGIN") && trimmed.includes("\\n")) {
    return trimmed.replace(/\\n/g, "\n");
  }
  return trimmed;
}

export function resolveGithubAppConfig(): GithubAppConfig | null {
  const clientId = process.env.GITHUB_APP_CLIENT_ID?.trim();
  const privateKeyPem = process.env.GITHUB_APP_PRIVATE_KEY
    ? normalizePem(process.env.GITHUB_APP_PRIVATE_KEY)
    : "";
  const slug = process.env.GITHUB_APP_SLUG?.trim();
  if (!clientId || !privateKeyPem || !slug) return null;
  return {
    clientId,
    privateKeyPem,
    slug,
    webhookSecret: process.env.GITHUB_APP_WEBHOOK_SECRET?.trim() || null,
  };
}

export function isGithubAppConfigured(): boolean {
  return resolveGithubAppConfig() !== null;
}

export function githubAppSetupUrl(): string {
  const base = process.env.BETTER_AUTH_URL?.replace(/\/$/, "");
  if (!base) throw new Error("BETTER_AUTH_URL is required for GitHub App setup");
  return `${base}/api/integrations/github/setup`;
}

export async function signGithubAppJwt(config: GithubAppConfig = requiredConfig()): Promise<string> {
  // GitHub downloads PKCS#1 (`BEGIN RSA PRIVATE KEY`); Node accepts PKCS#1 and PKCS#8.
  const key = createPrivateKey(config.privateKeyPem);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 9 * 60)
    .setIssuer(config.clientId)
    .sign(key);
}

function requiredConfig(): GithubAppConfig {
  const config = resolveGithubAppConfig();
  if (!config) {
    throw new ProviderError(
      "GitHub App is not configured. Set GITHUB_APP_CLIENT_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_SLUG.",
      "unavailable",
      false,
    );
  }
  return config;
}

export async function mintInstallationToken(
  installationId: string,
  config: GithubAppConfig = requiredConfig(),
): Promise<Pick<StoredCredential, "accessToken" | "expiresAt">> {
  const jwt = await signGithubAppJwt(config);
  const response = await providerFetch(
    `https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${jwt}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
    },
  );
  const body = (await response.json()) as { token?: string; expires_at?: string; message?: string };
  if (!body.token) {
    throw new ProviderError(
      body.message ?? "GitHub did not return an installation access token",
      "unauthorized",
      false,
      response.status,
    );
  }
  return {
    accessToken: body.token,
    expiresAt: body.expires_at ?? new Date(Date.now() + 55 * 60 * 1000).toISOString(),
  };
}

export async function describeInstallation(
  installationId: string,
  config: GithubAppConfig = requiredConfig(),
): Promise<{ accountLabel: string; externalAccountId: string }> {
  const jwt = await signGithubAppJwt(config);
  const response = await providerFetch(
    `https://api.github.com/app/installations/${encodeURIComponent(installationId)}`,
    {
      headers: {
        authorization: `Bearer ${jwt}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
    },
  );
  const body = (await response.json()) as {
    id?: number;
    account?: { login?: string; id?: number } | null;
    message?: string;
  };
  if (!body.id) {
    throw new ProviderError(body.message ?? "GitHub installation was not found", "not_found", false, response.status);
  }
  const login = body.account?.login ?? `installation-${body.id}`;
  return {
    accountLabel: `${login} (GitHub App)`,
    externalAccountId: String(body.id),
  };
}

/** Store install state and return the GitHub App installation URL. */
export async function beginGithubAppInstall(userId: string, workspaceId: string): Promise<string> {
  const config = requiredConfig();
  const state = randomBytes(24).toString("base64url");
  await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "integration.manage");
    await tx.execute(sql`
      insert into oauth_states (workspace_id, user_id, provider, state_hash, code_verifier_ciphertext, expires_at)
      values (
        ${workspaceId}::uuid,
        current_setting('app.current_user_id', true),
        'github',
        ${sha256(state)},
        ${sealCredential({ accessToken: "github-app-install" })},
        now() + interval '15 minutes'
      )
    `);
  });
  const url = new URL(`https://github.com/apps/${encodeURIComponent(config.slug)}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function completeGithubAppInstall(
  userId: string,
  installationId: string,
  state: string,
): Promise<{ workspaceId: string; integrationId: string }> {
  const config = requiredConfig();
  return withUser(userId, async (tx) => {
    const states = await tx.execute<{
      workspace_id: string;
    }>(sql`
      delete from oauth_states
      where state_hash = ${sha256(state)}
        and user_id = current_setting('app.current_user_id', true)
        and provider = 'github'
        and expires_at > now()
      returning workspace_id
    `);
    const saved = states[0];
    if (!saved) throw new Error("GitHub App install state expired or was already used");
    await requireAction(tx, saved.workspace_id, "integration.manage");

    const token = await mintInstallationToken(installationId, config);
    const account = await describeInstallation(installationId, config);
    const credential: StoredCredential = {
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
      githubInstallationId: installationId,
      webhookSecret: config.webhookSecret ?? undefined,
      accountLabel: account.accountLabel,
    };

    const existing = await tx.execute<{ id: string }>(sql`
      select id from integrations
      where workspace_id = ${saved.workspace_id}::uuid
        and provider = 'github'
        and external_account_id = ${account.externalAccountId}
        and status <> 'revoked'
      limit 1
    `);

    let integrationId = existing[0]?.id;
    if (integrationId) {
      await tx.execute(sql`
        update integrations
        set status = 'connected',
            display_name = ${account.accountLabel},
            credential_ciphertext = ${sealCredential(credential)},
            scopes = ${textArray(["github_app"])},
            last_error = null,
            last_validated_at = now(),
            revoked_at = null
        where id = ${integrationId}::uuid
      `);
    } else {
      const rows = await tx.execute<{ id: string }>(sql`
        insert into integrations (
          workspace_id, provider, status, display_name, external_account_id, credential_ciphertext,
          scopes, connected_by, last_validated_at
        ) values (
          ${saved.workspace_id}::uuid,
          'github',
          'connected',
          ${account.accountLabel},
          ${account.externalAccountId},
          ${sealCredential(credential)},
          ${textArray(["github_app"])},
          current_setting('app.current_user_id', true),
          now()
        ) returning id
      `);
      integrationId = rows[0]?.id;
    }
    if (!integrationId) throw new Error("GitHub App integration was not saved");

    await writeAudit(tx, {
      workspaceId: saved.workspace_id,
      action: "integration.connected",
      entityType: "integration",
      entityId: integrationId,
      metadata: { provider: "github", method: "github_app", installationId },
    });
    return { workspaceId: saved.workspace_id, integrationId };
  });
}

export async function findGithubIntegrationByInstallationId(
  installationId: string,
): Promise<{ id: string; workspace_id: string } | null> {
  const { getDb } = await import("../db/client");
  const rows = await getDb().execute<{ id: string; workspace_id: string }>(sql`
    select id, workspace_id
    from integrations
    where provider = 'github'
      and status = 'connected'
      and external_account_id = ${installationId}
    order by last_validated_at desc nulls last
    limit 1
  `);
  return rows[0] ?? null;
}

/** Test helper: mint without requiring env when config is injected. */
export async function refreshGithubAppCredential(
  credential: StoredCredential,
  config?: GithubAppConfig,
): Promise<StoredCredential> {
  const installationId = credential.githubInstallationId;
  if (!installationId) {
    throw new ProviderError("GitHub credential is missing an installation id", "unauthorized", false);
  }
  const token = await mintInstallationToken(installationId, config ?? requiredConfig());
  return {
    ...credential,
    accessToken: token.accessToken,
    expiresAt: token.expiresAt,
  };
}
