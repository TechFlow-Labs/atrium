import { sql } from "drizzle-orm";
import { writeAudit } from "../audit";
import { requireAction } from "../authz/membership";
import { decryptSecret, encryptSecret } from "../crypto/secrets";
import { assertSafeOutboundUrl } from "../crypto/ssrf";
import { withUser, type Tx } from "../db/client";
import { OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/oauth-providers";

export type OAuthAppSource = "workspace" | "environment";

export type ResolvedOAuthApp = {
  clientId: string;
  clientSecret: string;
  siteUrl: string | null;
  source: OAuthAppSource;
};

// What the settings UI may show. Secrets are never included.
export type OAuthAppOverview = {
  source: OAuthAppSource | null;
  clientId: string | null;
  siteUrl: string | null;
};

export type OAuthAppInput = {
  provider: OAuthProvider;
  clientId: string;
  // Empty keeps the stored secret, so the form does not need to re-enter it.
  clientSecret: string;
  siteUrl: string;
};

function envPrefix(provider: OAuthProvider): string {
  return provider.toUpperCase();
}

function environmentApp(provider: OAuthProvider): ResolvedOAuthApp | null {
  const clientId = process.env[`${envPrefix(provider)}_CLIENT_ID`];
  const clientSecret = process.env[`${envPrefix(provider)}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    siteUrl: provider === "gitea" ? process.env.GITEA_SITE_URL ?? null : null,
    source: "environment",
  };
}

// The credentials an OAuth flow should use. Workspace settings win, and the
// server environment is the fallback, so an existing deployment keeps working.
export async function resolveOAuthApp(tx: Tx, workspaceId: string, provider: OAuthProvider): Promise<ResolvedOAuthApp | null> {
  const rows = await tx.execute<{ client_id: string; client_secret_ciphertext: string; site_url: string | null }>(sql`
    select client_id, client_secret_ciphertext, site_url from oauth_app_settings
    where workspace_id = ${workspaceId}::uuid and provider = ${provider}
  `);
  const row = rows[0];
  if (row) {
    return {
      clientId: row.client_id,
      clientSecret: decryptSecret(row.client_secret_ciphertext),
      siteUrl: row.site_url,
      source: "workspace",
    };
  }
  return environmentApp(provider);
}

// Status for every provider. Client IDs are shown to owners and admins only,
// because row-level security hides the rows from other roles.
export async function oauthAppOverview(
  userId: string,
  workspaceId: string,
): Promise<Record<OAuthProvider, OAuthAppOverview>> {
  const rows = await withUser(userId, (tx) =>
    tx.execute<{ provider: string; client_id: string; site_url: string | null }>(sql`
      select provider, client_id, site_url from oauth_app_settings
      where workspace_id = ${workspaceId}::uuid
    `),
  );
  const stored = new Map(rows.map((row) => [row.provider, row]));
  return Object.fromEntries(
    OAUTH_PROVIDERS.map((provider) => {
      const row = stored.get(provider);
      if (row) {
        return [provider, { source: "workspace", clientId: row.client_id, siteUrl: row.site_url }];
      }
      const fromEnvironment = environmentApp(provider);
      return [
        provider,
        {
          source: fromEnvironment ? "environment" : null,
          clientId: null,
          siteUrl: fromEnvironment?.siteUrl ?? null,
        },
      ];
    }),
  ) as Record<OAuthProvider, OAuthAppOverview>;
}

async function normalizeSiteUrl(raw: string): Promise<string> {
  const candidate = raw.includes("://") ? raw : `https://${raw}`;
  const url = await assertSafeOutboundUrl(candidate);
  return url.origin;
}

export async function saveOAuthApp(userId: string, workspaceId: string, input: OAuthAppInput): Promise<void> {
  const siteUrl = input.provider === "gitea" && input.siteUrl.trim() ? await normalizeSiteUrl(input.siteUrl.trim()) : null;
  await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "integration.manage");
    const existing = await tx.execute<{ client_secret_ciphertext: string }>(sql`
      select client_secret_ciphertext from oauth_app_settings
      where workspace_id = ${workspaceId}::uuid and provider = ${input.provider}
    `);
    const secret = input.clientSecret
      ? encryptSecret(input.clientSecret)
      : existing[0]?.client_secret_ciphertext;
    if (!secret) throw new Error("Enter the client secret");
    await tx.execute(sql`
      insert into oauth_app_settings (workspace_id, provider, client_id, client_secret_ciphertext, site_url, updated_by)
      values (
        ${workspaceId}::uuid,
        ${input.provider},
        ${input.clientId},
        ${secret},
        ${siteUrl},
        current_setting('app.current_user_id', true)
      )
      on conflict (workspace_id, provider) do update set
        client_id = excluded.client_id,
        client_secret_ciphertext = excluded.client_secret_ciphertext,
        site_url = excluded.site_url,
        updated_by = excluded.updated_by,
        updated_at = now()
    `);
    await writeAudit(tx, {
      workspaceId,
      action: "integration.oauth_app_saved",
      entityType: "integration_oauth_app",
      entityId: input.provider,
      metadata: { provider: input.provider, secretChanged: Boolean(input.clientSecret) },
    });
  });
}

export async function deleteOAuthApp(userId: string, workspaceId: string, provider: OAuthProvider): Promise<void> {
  await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "integration.manage");
    await tx.execute(sql`
      delete from oauth_app_settings
      where workspace_id = ${workspaceId}::uuid and provider = ${provider}
    `);
    await writeAudit(tx, {
      workspaceId,
      action: "integration.oauth_app_removed",
      entityType: "integration_oauth_app",
      entityId: provider,
      metadata: { provider },
    });
  });
}

/**
 * Copy OAuth app settings from one workspace to another inside an open transaction.
 * Returns false when the source has no saved app for that provider.
 */
export async function copyOAuthAppSettings(
  tx: Tx,
  sourceWorkspaceId: string,
  targetWorkspaceId: string,
  provider: OAuthProvider,
): Promise<boolean> {
  const source = await tx.execute<{
    client_id: string;
    client_secret_ciphertext: string;
    site_url: string | null;
  }>(sql`
    select client_id, client_secret_ciphertext, site_url
    from oauth_app_settings
    where workspace_id = ${sourceWorkspaceId}::uuid and provider = ${provider}
  `);
  const row = source[0];
  if (!row) return false;

  // Re-encrypt so each workspace owns its own ciphertext blob.
  const plaintext = decryptSecret(row.client_secret_ciphertext);
  const ciphertext = encryptSecret(plaintext);

  await tx.execute(sql`
    insert into oauth_app_settings (workspace_id, provider, client_id, client_secret_ciphertext, site_url, updated_by)
    values (
      ${targetWorkspaceId}::uuid,
      ${provider},
      ${row.client_id},
      ${ciphertext},
      ${row.site_url},
      current_setting('app.current_user_id', true)
    )
    on conflict (workspace_id, provider) do update set
      client_id = excluded.client_id,
      client_secret_ciphertext = excluded.client_secret_ciphertext,
      site_url = excluded.site_url,
      updated_by = excluded.updated_by,
      updated_at = now()
  `);
  return true;
}

/** Copy workspace OAuth app settings into another workspace the caller can administer. */
export async function shareOAuthAppToWorkspace(
  userId: string,
  sourceWorkspaceId: string,
  targetWorkspaceId: string,
  provider: OAuthProvider,
): Promise<void> {
  if (sourceWorkspaceId === targetWorkspaceId) {
    throw new Error("Choose a different workspace");
  }
  await withUser(userId, async (tx) => {
    await requireAction(tx, sourceWorkspaceId, "integration.manage");
    await requireAction(tx, targetWorkspaceId, "integration.manage");

    const copied = await copyOAuthAppSettings(tx, sourceWorkspaceId, targetWorkspaceId, provider);
    if (!copied) {
      throw new Error("This workspace has no saved OAuth app for that provider");
    }

    await writeAudit(tx, {
      workspaceId: sourceWorkspaceId,
      action: "integration.oauth_app_shared",
      entityType: "integration_oauth_app",
      entityId: provider,
      metadata: { provider, toWorkspaceId: targetWorkspaceId },
    });
    await writeAudit(tx, {
      workspaceId: targetWorkspaceId,
      action: "integration.oauth_app_shared_in",
      entityType: "integration_oauth_app",
      entityId: provider,
      metadata: { provider, fromWorkspaceId: sourceWorkspaceId },
    });
  });
}
