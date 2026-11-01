import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { writeAudit } from "../audit";
import { requireAction } from "../authz/membership";
import { withUser, type Tx } from "../db/client";
import { textArray } from "../db/sql";
import { sha256 } from "../crypto/secrets";
import { integrationView, openCredential, sealCredential } from "./credentials";
import { giteaOAuthSiteUrl } from "./gitea-site";
import { copyOAuthAppSettings, resolveOAuthApp } from "./oauth-apps";
import { seedFakeProject } from "./fake";
import { normalizeLinearToken } from "./linear";
import { getAdapter, OAUTH_SCOPES } from "./registry";
import { validateObsidianConnection } from "./obsidian";
import { validateSlackConnection } from "./slack";
import { ensureFreshCredentials } from "./token-refresh";
import { isOAuthProvider } from "@/lib/oauth-providers";
import type {
  FieldMappings,
  IntegrationProviderId,
  ProviderId,
  RemoteProject,
  StoredCredential,
} from "./types";
import { isChatProvider, isNonTaskProvider, isNoteProvider, isTaskProvider } from "./types";

export type IntegrationView = {
  id: string;
  workspace_id: string;
  provider: IntegrationProviderId;
  status: "connected" | "error" | "revoked";
  display_name: string;
  external_account_id: string | null;
  last_validated_at: Date | null;
  last_error: string | null;
  revoked_at: Date | null;
  hasCredential: boolean;
};

const SECRET_FREE = sql`id, workspace_id, provider, status, display_name, external_account_id, last_validated_at, last_error, revoked_at, credential_ciphertext`;

function parseProvider(provider: string): IntegrationProviderId {
  if (isChatProvider(provider) || isNoteProvider(provider)) return provider;
  if (!isTaskProvider(provider)) {
    throw new Error("Unknown provider");
  }
  if (provider === "fake" && process.env.ALLOW_FAKE_PROVIDER !== "true") {
    throw new Error("The fake provider is disabled");
  }
  return provider;
}

export async function listIntegrations(userId: string, workspaceId: string): Promise<IntegrationView[]> {
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");
    const rows = await tx.execute<{
      id: string;
      workspace_id: string;
      provider: IntegrationProviderId;
      status: IntegrationView["status"];
      display_name: string;
      external_account_id: string | null;
      last_validated_at: Date | null;
      last_error: string | null;
      revoked_at: Date | null;
      credential_ciphertext: string | null;
    }>(sql`
      select ${SECRET_FREE}
      from integrations
      where workspace_id = ${workspaceId}::uuid
      order by display_name
    `);
    return rows.map((row) => integrationView(row));
  });
}

async function adapterContext(tx: Tx, integrationId: string) {
  const rows = await tx.execute<{
    id: string;
    workspace_id: string;
    provider: IntegrationProviderId;
    status: string;
    credential_ciphertext: string | null;
    field_mappings: FieldMappings | null;
  }>(sql`
    select i.id, i.workspace_id, i.provider, i.status, i.credential_ciphertext, c.field_mappings
    from integrations i
    left join project_connections c on c.integration_id = i.id
    where i.id = ${integrationId}::uuid
    limit 1
  `);
  const row = rows[0];
  if (!row || row.status === "revoked" || !row.credential_ciphertext) {
    throw new Error("This integration is disconnected");
  }
  if (isChatProvider(row.provider)) {
    throw new Error("Slack is a chat connection. Open Chats instead of linking projects.");
  }
  if (isNoteProvider(row.provider)) {
    throw new Error("Obsidian is a notes connection. Open Notes instead of linking projects.");
  }
  const provider = row.provider;
  if (!isTaskProvider(provider)) {
    throw new Error("This integration cannot sync tasks");
  }
  const credentials = await ensureFreshCredentials(tx, {
    integrationId: row.id,
    workspaceId: row.workspace_id,
    provider,
    ciphertext: row.credential_ciphertext,
  });
  const adapter = getAdapter(provider);
  return {
    row,
    adapter,
    ctx: {
      tx,
      integrationId: row.id,
      credentials,
      mappings: row.field_mappings ?? adapter.defaultMappings(),
    },
  };
}

export async function connectWithToken(
  userId: string,
  workspaceId: string,
  input: {
    provider: string;
    displayName: string;
    accessToken: string;
    webhookSecret?: string;
    cloudId?: string;
    siteUrl?: string;
    refreshToken?: string;
  },
): Promise<string> {
  const provider = parseProvider(input.provider);
  const token = provider === "linear" ? normalizeLinearToken(input.accessToken) : input.accessToken.trim();
  if (token.length < 8) throw new Error("Access token is too short");
  if (provider === "slack" && !token.startsWith("xoxb-") && !token.startsWith("xoxp-")) {
    throw new Error("Paste a Slack bot token starting with xoxb-");
  }
  if (provider === "obsidian" && !input.siteUrl?.trim()) {
    throw new Error(
      "Enter the HTTPS vault bridge URL (for a vault on another VPS), or a LiveSync filesystem path on this host",
    );
  }
  if (provider === "gitea" && !input.siteUrl?.trim()) {
    throw new Error("Enter your Gitea site URL, for example https://gitea.example.com");
  }
  const displayName = input.displayName.trim();
  if (displayName.length < 2) throw new Error("Name the connection so you can recognize it later");
  const credential: StoredCredential = {
    accessToken: token,
    webhookSecret: input.webhookSecret?.trim() || undefined,
    cloudId: input.cloudId?.trim() || undefined,
    siteUrl: input.siteUrl?.trim() || undefined,
    refreshToken: input.refreshToken?.trim() || undefined,
    accountLabel: displayName,
  };
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "integration.manage");
    let validated: { externalAccountId: string; accountLabel: string };
    let scopes: ReturnType<typeof textArray>;
    if (isChatProvider(provider)) {
      validated = await validateSlackConnection(token);
      scopes = textArray(["channels:history", "channels:read", "groups:history", "groups:read", "users:read"]);
    } else if (isNoteProvider(provider)) {
      validated = await validateObsidianConnection(token, credential.siteUrl);
      scopes = textArray(["vault:read"]);
    } else {
      const adapter = getAdapter(provider);
      scopes = textArray(provider === "fake" ? [] : OAUTH_SCOPES[provider]);
      validated = await adapter.validateConnection({
        tx,
        integrationId: "00000000-0000-4000-8000-000000000000",
        credentials: credential,
        mappings: adapter.defaultMappings(),
      });
    }
    const ciphertext = sealCredential({ ...credential, accountLabel: validated.accountLabel });
    const rows = await tx.execute<{ id: string }>(sql`
      insert into integrations (
        workspace_id, provider, status, display_name, external_account_id, credential_ciphertext,
        scopes, connected_by, last_validated_at
      ) values (
        ${workspaceId}::uuid,
        ${provider},
        'connected',
        ${displayName},
        ${validated.externalAccountId},
        ${ciphertext},
        ${scopes},
        current_setting('app.current_user_id', true),
        now()
      )
      returning id
    `);
    const id = rows[0]?.id;
    if (!id) throw new Error("Integration was not saved");
    await writeAudit(tx, {
      workspaceId,
      action: "integration.connected",
      entityType: "integration",
      entityId: id,
      metadata: { provider: input.provider },
    });
    return id;
  });
}

export async function disconnectIntegration(userId: string, workspaceId: string, integrationId: string) {
  await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "integration.manage");
    const rows = await tx.execute(sql`
      update integrations
      set status = 'revoked',
          credential_ciphertext = null,
          revoked_at = now(),
          last_error = null
      where id = ${integrationId}::uuid and workspace_id = ${workspaceId}::uuid
      returning id
    `);
    if (!rows[0]) throw new Error("Integration not found");
    await writeAudit(tx, {
      workspaceId,
      action: "integration.disconnected",
      entityType: "integration",
      entityId: integrationId,
      metadata: {},
    });
  });
}

/** Workspaces (other than current) where the user can manage integrations. */
export async function listIntegrationShareTargets(
  userId: string,
  sourceWorkspaceId: string,
): Promise<Array<{ id: string; name: string; kind: string }>> {
  return withUser(userId, async (tx) => {
    await requireAction(tx, sourceWorkspaceId, "integration.manage");
    const rows = await tx.execute<{ id: string; name: string; kind: string }>(sql`
      select w.id, w.name, w.kind
      from workspaces w
      join workspace_members m on m.workspace_id = w.id
      where m.user_id = current_setting('app.current_user_id', true)
        and m.role in ('owner', 'admin')
        and w.id <> ${sourceWorkspaceId}::uuid
      order by w.kind, w.name
    `);
    return rows;
  });
}

/**
 * Clone a connected integration into another workspace.
 * Copies credentials; does not copy linked projects or sync history.
 */
export async function shareIntegrationToWorkspace(
  userId: string,
  sourceWorkspaceId: string,
  integrationId: string,
  targetWorkspaceId: string,
): Promise<string> {
  if (sourceWorkspaceId === targetWorkspaceId) {
    throw new Error("Choose a different workspace");
  }

  return withUser(userId, async (tx) => {
    await requireAction(tx, sourceWorkspaceId, "integration.manage");
    await requireAction(tx, targetWorkspaceId, "integration.manage");

    const source = await tx.execute<{
      id: string;
      provider: IntegrationProviderId;
      status: string;
      display_name: string;
      external_account_id: string | null;
      credential_ciphertext: string | null;
      scopes: string[] | null;
    }>(sql`
      select id, provider, status, display_name, external_account_id, credential_ciphertext, scopes
      from integrations
      where id = ${integrationId}::uuid
        and workspace_id = ${sourceWorkspaceId}::uuid
    `);
    const row = source[0];
    if (!row) throw new Error("Integration not found");
    if (row.status === "revoked" || !row.credential_ciphertext) {
      throw new Error("Reconnect this integration before sharing it");
    }

    const credentials = openCredential(row.credential_ciphertext);
    if (!credentials) throw new Error("Reconnect this integration before sharing it");
    const ciphertext = sealCredential(credentials);

    const inserted = await tx.execute<{ id: string }>(sql`
      insert into integrations (
        workspace_id, provider, status, display_name, external_account_id, credential_ciphertext,
        scopes, connected_by, last_validated_at
      ) values (
        ${targetWorkspaceId}::uuid,
        ${row.provider},
        'connected',
        ${row.display_name},
        ${row.external_account_id},
        ${ciphertext},
        ${textArray(row.scopes ?? [])},
        current_setting('app.current_user_id', true),
        now()
      )
      returning id
    `);
    const newId = inserted[0]?.id;
    if (!newId) throw new Error("Could not share the integration");

    // Also copy OAuth app settings when the source workspace has them, so the
    // target's Integrations OAuth card is filled the same way.
    if (isOAuthProvider(row.provider)) {
      await copyOAuthAppSettings(tx, sourceWorkspaceId, targetWorkspaceId, row.provider);
    }

    await writeAudit(tx, {
      workspaceId: sourceWorkspaceId,
      action: "integration.shared",
      entityType: "integration",
      entityId: integrationId,
      metadata: { toWorkspaceId: targetWorkspaceId, toIntegrationId: newId, provider: row.provider },
    });
    await writeAudit(tx, {
      workspaceId: targetWorkspaceId,
      action: "integration.shared_in",
      entityType: "integration",
      entityId: newId,
      metadata: { fromWorkspaceId: sourceWorkspaceId, fromIntegrationId: integrationId, provider: row.provider },
    });
    return newId;
  });
}

export async function testIntegration(userId: string, workspaceId: string, integrationId: string) {
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "integration.manage");
    try {
      const rows = await tx.execute<{
        provider: IntegrationProviderId;
        status: string;
        credential_ciphertext: string | null;
      }>(sql`
        select provider, status, credential_ciphertext
        from integrations
        where id = ${integrationId}::uuid and workspace_id = ${workspaceId}::uuid
        limit 1
      `);
      const row = rows[0];
      if (!row || row.status === "revoked" || !row.credential_ciphertext) {
        throw new Error("This integration is disconnected");
      }
      let result: { externalAccountId: string; accountLabel: string };
      if (isChatProvider(row.provider)) {
        const credentials = openCredential(row.credential_ciphertext);
        if (!credentials) throw new Error("This integration is disconnected");
        result = await validateSlackConnection(credentials.accessToken);
      } else if (isNoteProvider(row.provider)) {
        const credentials = openCredential(row.credential_ciphertext);
        if (!credentials) throw new Error("This integration is disconnected");
        result = await validateObsidianConnection(credentials.accessToken, credentials.siteUrl);
      } else {
        // adapterContext refreshes OAuth access tokens before validating.
        const { adapter, ctx } = await adapterContext(tx, integrationId);
        result = await adapter.validateConnection(ctx);
      }
      await tx.execute(sql`
        update integrations set last_validated_at = now(), last_error = null, status = 'connected',
          external_account_id = ${result.externalAccountId}
        where id = ${integrationId}::uuid
      `);
      return { ok: true as const, accountLabel: result.accountLabel };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection test failed";
      await tx.execute(sql`
        update integrations set last_error = ${message}, status = 'error' where id = ${integrationId}::uuid
      `);
      return { ok: false as const, message };
    }
  });
}

export async function listRemoteProjects(userId: string, workspaceId: string, integrationId: string): Promise<RemoteProject[]> {
  return withUser(userId, async (tx) => {
    // task.write so members can pick a remote project when creating a synced task.
    await requireAction(tx, workspaceId, "task.write");
    const { adapter, ctx } = await adapterContext(tx, integrationId);
    const projects: RemoteProject[] = [];
    let cursor: string | null = null;
    do {
      const page = await adapter.listProjects(ctx, cursor);
      projects.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor && projects.length < 200);
    return projects;
  });
}

async function findLinkedProjectId(
  tx: Tx,
  workspaceId: string,
  integrationId: string,
  providerProjectId: string,
): Promise<string | null> {
  const rows = await tx.execute<{ project_id: string }>(sql`
    select project_id
    from project_connections
    where workspace_id = ${workspaceId}::uuid
      and integration_id = ${integrationId}::uuid
      and provider_project_id = ${providerProjectId}
    limit 1
  `);
  return rows[0]?.project_id ?? null;
}

export async function createExternalProject(
  userId: string,
  workspaceId: string,
  input: { integrationId: string; providerProjectId: string; name: string; key?: string | null; url?: string | null },
): Promise<string> {
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "project.create");
    const existing = await findLinkedProjectId(tx, workspaceId, input.integrationId, input.providerProjectId);
    if (existing) return existing;
    const integrations = await tx.execute<{ provider: IntegrationProviderId; status: string }>(sql`
      select provider, status from integrations
      where id = ${input.integrationId}::uuid and workspace_id = ${workspaceId}::uuid
    `);
    const integration = integrations[0];
    if (!integration || integration.status === "revoked") throw new Error("Integration is disconnected");
    if (isNonTaskProvider(integration.provider)) {
      throw new Error(
        isNoteProvider(integration.provider)
          ? "Obsidian connections cannot link task projects"
          : "Slack connections cannot link task projects",
      );
    }
    const adapter = getAdapter(integration.provider);
    const rows = await tx.execute<{ id: string }>(sql`
      insert into projects (workspace_id, name, ownership_mode, created_by)
      values (${workspaceId}::uuid, ${input.name.trim()}, 'external', current_setting('app.current_user_id', true))
      returning id
    `);
    const projectId = rows[0]?.id;
    if (!projectId) throw new Error("Project was not created");
    const connectionRows = await tx.execute<{ id: string }>(sql`
      insert into project_connections (
        workspace_id, project_id, integration_id, provider_project_id, provider_project_key,
        provider_project_name, provider_project_url, field_mappings, publish_outbound, sync_inbound
      ) values (
        ${workspaceId}::uuid,
        ${projectId}::uuid,
        ${input.integrationId}::uuid,
        ${input.providerProjectId},
        ${input.key ?? null},
        ${input.name.trim()},
        ${input.url ?? null},
        ${JSON.stringify(adapter.defaultMappings())}::jsonb,
        false,
        true
      )
      returning id
    `);
    const connectionId = connectionRows[0]?.id;
    if (!connectionId) throw new Error("Project connection was not created");
    // Pull remote issues immediately instead of waiting for the 5-minute reconcile sweep.
    await tx.execute(sql`select enqueue_initial_reconcile(${connectionId}::uuid)`);
    await writeAudit(tx, {
      workspaceId,
      action: "project.connected",
      entityType: "project",
      entityId: projectId,
      metadata: { provider: integration.provider, providerProjectId: input.providerProjectId },
    });
    return projectId;
  });
}

/** Resolve an already-linked project, or link the remote board then return its Atrium id. */
export async function ensureExternalProjectForTask(
  userId: string,
  workspaceId: string,
  input: { integrationId: string; providerProjectId: string; name: string; key?: string | null; url?: string | null },
): Promise<string> {
  const linked = await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.write");
    return findLinkedProjectId(tx, workspaceId, input.integrationId, input.providerProjectId);
  });
  if (linked) return linked;
  return createExternalProject(userId, workspaceId, input);
}

export async function updateFieldMappings(
  userId: string,
  workspaceId: string,
  projectId: string,
  mappings: FieldMappings,
): Promise<void> {
  await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "integration.manage");
    const rows = await tx.execute(sql`
      update project_connections
      set field_mappings = ${JSON.stringify(mappings)}::jsonb
      where project_id = ${projectId}::uuid and workspace_id = ${workspaceId}::uuid
      returning id
    `);
    if (!rows[0]) throw new Error("Project connection not found");
    await writeAudit(tx, {
      workspaceId,
      action: "integration.mappings_updated",
      entityType: "project",
      entityId: projectId,
    });
  });
}

export async function setNativePublishing(userId: string, workspaceId: string, projectId: string, enabled: boolean) {
  await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "integration.manage");
    const rows = await tx.execute<{ ownership_mode: string }>(sql`
      select p.ownership_mode from projects p
      join project_connections c on c.project_id = p.id
      where p.id = ${projectId}::uuid and p.workspace_id = ${workspaceId}::uuid
    `);
    if (!rows[0]) throw new Error("Connect a provider before publishing this project");
    if (rows[0].ownership_mode !== "native") {
      throw new Error("External projects already synchronize through the provider");
    }
    await tx.execute(sql`
      update project_connections set publish_outbound = ${enabled}
      where project_id = ${projectId}::uuid
    `);
    await writeAudit(tx, {
      workspaceId,
      action: enabled ? "project.publish_enabled" : "project.publish_disabled",
      entityType: "project",
      entityId: projectId,
    });
  });
}

export async function addFakeRemoteProject(
  userId: string,
  workspaceId: string,
  integrationId: string,
  name: string,
): Promise<void> {
  if (process.env.ALLOW_FAKE_PROVIDER !== "true") throw new Error("The fake provider is disabled");
  await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "integration.manage");
    const { ctx, row } = await adapterContext(tx, integrationId);
    if (row.provider !== "fake") throw new Error("This action is only for the fake provider");
    await seedFakeProject(ctx, { providerProjectId: `fake-project-${randomBytes(4).toString("hex")}`, name });
  });
}

export function oauthRedirectUri(provider: Exclude<ProviderId, "fake">): string {
  const base = (process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
  if (!base) throw new Error("BETTER_AUTH_URL is not set");
  return `${base}/api/integrations/oauth/${provider}/callback`;
}

export async function beginOAuth(userId: string, workspaceId: string, provider: Exclude<ProviderId, "fake">): Promise<string> {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(24).toString("base64url");
  const app = await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "integration.manage");
    const resolved = await resolveOAuthApp(tx, workspaceId, provider);
    if (!resolved) throw new Error(`${provider} OAuth is not configured for this workspace or on this server`);
    await tx.execute(sql`
      insert into oauth_states (workspace_id, user_id, provider, state_hash, code_verifier_ciphertext, expires_at)
      values (
        ${workspaceId}::uuid,
        current_setting('app.current_user_id', true),
        ${provider},
        ${sha256(state)},
        ${sealCredential({ accessToken: verifier })},
        now() + interval '15 minutes'
      )
    `);
    return resolved;
  });
  const redirectUri = oauthRedirectUri(provider);
  const clientId = app.clientId;
  if (provider === "linear") {
    const url = new URL("https://linear.app/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", OAUTH_SCOPES.linear.join(","));
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }
  if (provider === "jira") {
    const url = new URL("https://auth.atlassian.com/authorize");
    url.searchParams.set("audience", "api.atlassian.com");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("scope", OAUTH_SCOPES.jira.join(" "));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }
  if (provider === "gitlab") {
    const url = new URL("https://gitlab.com/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", OAUTH_SCOPES.gitlab.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }
  if (provider === "gitea") {
    const site = giteaOAuthSiteUrl(app.siteUrl);
    const url = new URL(`${site}/login/oauth/authorize`);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", OAUTH_SCOPES.gitea.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }
  if (provider === "github") {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", OAUTH_SCOPES.github.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }
  throw new Error(`OAuth is not supported for ${provider}`);
}

export async function completeOAuth(userId: string, provider: Exclude<ProviderId, "fake">, code: string, state: string) {
  const redirectUri = oauthRedirectUri(provider);
  return withUser(userId, async (tx) => {
    const states = await tx.execute<{
      id: string;
      workspace_id: string;
      code_verifier_ciphertext: string;
      provider: string;
    }>(sql`
      delete from oauth_states
      where state_hash = ${sha256(state)}
        and user_id = current_setting('app.current_user_id', true)
        and provider = ${provider}
        and expires_at > now()
      returning id, workspace_id, code_verifier_ciphertext, provider
    `);
    const saved = states[0];
    if (!saved) throw new Error("OAuth state expired. Start the connection again.");
    const verifier = openCredential(saved.code_verifier_ciphertext)?.accessToken;
    if (!verifier) throw new Error("OAuth verifier is missing");
    const app = await resolveOAuthApp(tx, saved.workspace_id, provider);
    if (!app) throw new Error("OAuth client is not configured");
    const token = await exchangeCode(provider, {
      code,
      redirectUri,
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      siteUrl: app.siteUrl,
      verifier,
    });
    const id = await connectInside(tx, saved.workspace_id, provider, token);
    return { workspaceId: saved.workspace_id, integrationId: id };
  });
}

async function exchangeCode(
  provider: Exclude<ProviderId, "fake">,
  input: { code: string; redirectUri: string; clientId: string; clientSecret: string; siteUrl: string | null; verifier: string },
): Promise<StoredCredential> {
  if (provider === "github") {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        code: input.code,
        redirect_uri: input.redirectUri,
        code_verifier: input.verifier,
      }),
    });
    const body = (await response.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!body.access_token) {
      throw new Error(body.error_description ?? body.error ?? "GitHub did not return a token");
    }
    return { accessToken: body.access_token };
  }
  if (provider === "linear") {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      code: input.code,
      code_verifier: input.verifier,
    });
    const response = await fetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!json.access_token) throw new Error("Linear did not return a token");
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : undefined,
    };
  }
  if (provider === "gitlab") {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      code: input.code,
      code_verifier: input.verifier,
    });
    const response = await fetch("https://gitlab.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
    if (!json.access_token) throw new Error(json.error ?? "GitLab did not return a token");
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : undefined,
      siteUrl: "https://gitlab.com",
    };
  }
  if (provider === "gitea") {
    const site = giteaOAuthSiteUrl(input.siteUrl);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      code: input.code,
      code_verifier: input.verifier,
    });
    const response = await fetch(`${site}/login/oauth/access_token`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
    if (!json.access_token) throw new Error(json.error ?? "Gitea did not return a token");
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : undefined,
      siteUrl: site,
    };
  }
  if (provider !== "jira") {
    throw new Error(`OAuth token exchange is not supported for ${provider}`);
  }
  const response = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.verifier,
    }),
  });
  const json = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Jira did not return a token");
  const resources = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
    headers: { authorization: `Bearer ${json.access_token}`, accept: "application/json" },
  });
  const sites = (await resources.json()) as Array<{ id: string; url: string; name: string }>;
  const site = sites[0];
  if (!site) throw new Error("Jira token has no accessible site");
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : undefined,
    cloudId: site.id,
    siteUrl: site.url,
    accountLabel: site.name,
  };
}

async function connectInside(
  tx: Tx,
  workspaceId: string,
  provider: Exclude<ProviderId, "fake">,
  credential: StoredCredential,
): Promise<string> {
  const adapter = getAdapter(provider);
  const validated = await adapter.validateConnection({
    tx,
    integrationId: "00000000-0000-4000-8000-000000000000",
    credentials: credential,
    mappings: adapter.defaultMappings(),
  });
  const rows = await tx.execute<{ id: string }>(sql`
    insert into integrations (
      workspace_id, provider, status, display_name, external_account_id, credential_ciphertext,
      scopes, connected_by, last_validated_at
    ) values (
      ${workspaceId}::uuid,
      ${provider},
      'connected',
      ${validated.accountLabel},
      ${validated.externalAccountId},
      ${sealCredential(credential)},
      ${textArray(OAUTH_SCOPES[provider])},
      current_setting('app.current_user_id', true),
      now()
    ) returning id
  `);
  const id = rows[0]?.id;
  if (!id) throw new Error("Integration was not saved");
  await writeAudit(tx, {
    workspaceId,
    action: "integration.connected",
    entityType: "integration",
    entityId: id,
    metadata: { provider, method: "oauth" },
  });
  return id;
}

export async function syncHealth(userId: string, workspaceId: string) {
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");
    return tx.execute<{
      integration_id: string;
      display_name: string;
      provider: string;
      status: string;
      last_success_at: Date | null;
      last_error_at: Date | null;
      last_error: string | null;
    }>(sql`
      select i.id as integration_id, i.display_name, i.provider, i.status,
             s.last_success_at, s.last_error_at, s.last_error
      from integrations i
      left join integration_sync_cursors s on s.integration_id = i.id and s.resource = 'issues'
      where i.workspace_id = ${workspaceId}::uuid and i.status <> 'revoked'
      order by i.display_name
    `);
  });
}

export async function listSyncProblems(userId: string, workspaceId: string) {
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");
    const conflicts = await tx.execute(sql`
      select c.id, c.task_id, c.field, c.local_value, c.remote_value, c.created_at, t.title
      from conflicts c
      left join tasks t on t.id = c.task_id
      where c.workspace_id = ${workspaceId}::uuid and c.status = 'open'
      order by c.created_at desc
      limit 100
    `);
    const deadJobs = await tx.execute(sql`
      select id, kind, last_error, updated_at from jobs
      where workspace_id = ${workspaceId}::uuid and status = 'dead'
      order by updated_at desc limit 50
    `);
    const deadOutbox = await tx.execute(sql`
      select id, type, last_error, updated_at from outbox_events
      where workspace_id = ${workspaceId}::uuid and status = 'dead'
      order by updated_at desc limit 50
    `);
    return { conflicts, deadJobs, deadOutbox };
  });
}

export async function retryDead(userId: string, workspaceId: string, kind: "job" | "outbox", id: string) {
  await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "sync.retry");
    if (kind === "job") await tx.execute(sql`select retry_dead_job(${id}::uuid)`);
    else await tx.execute(sql`select retry_dead_outbox(${id}::uuid)`);
  });
}

export async function resolveConflict(
  userId: string,
  workspaceId: string,
  conflictId: string,
  resolution: "keep_local" | "keep_remote",
) {
  await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "conflict.resolve");
    const rows = await tx.execute<{
      id: string;
      task_id: string | null;
      field: string;
      local_value: unknown;
      remote_value: unknown;
      ownership_mode: "native" | "external" | "hybrid" | null;
    }>(sql`
      select c.id, c.task_id, c.field, c.local_value, c.remote_value, p.ownership_mode
      from conflicts c
      left join tasks t on t.id = c.task_id
      left join projects p on p.id = t.project_id
      where c.id = ${conflictId}::uuid and c.workspace_id = ${workspaceId}::uuid and c.status = 'open'
    `);
    const conflict = rows[0];
    if (!conflict?.task_id) throw new Error("Conflict not found");
    if (resolution === "keep_remote") {
      const column =
        conflict.field === "dueAt" ? "due_at" : conflict.field === "assignee" ? "assignee_provider_id" : conflict.field;
      if (!["title", "description", "status", "priority", "due_at", "assignee_provider_id"].includes(column)) {
        throw new Error("This field cannot be resolved automatically");
      }
      const value = conflict.remote_value;
      await tx.execute(sql`
        update tasks set
          title = case when ${column} = 'title' then ${value as string} else title end,
          description = case when ${column} = 'description' then ${value as string} else description end,
          status = case when ${column} = 'status' then ${value as string} else status end,
          priority = case when ${column} = 'priority' then ${value as string} else priority end,
          due_at = case when ${column} = 'due_at' then ${value ? new Date(String(value)).toISOString() : null} else due_at end,
          assignee_provider_id = case when ${column} = 'assignee_provider_id' then ${value as string} else assignee_provider_id end,
          sync_state = 'synced',
          version = version + 1
        where id = ${conflict.task_id}::uuid
      `);
    }
    await tx.execute(sql`
      update conflicts
      set status = 'resolved', resolution = ${resolution}, resolved_by = current_setting('app.current_user_id', true), resolved_at = now()
      where id = ${conflictId}::uuid
    `);
    if (resolution === "keep_local" && conflict.ownership_mode === "external") {
      const connection = await tx.execute<{
        id: string;
        integration_id: string;
        provider_project_id: string;
        provider_id: string | null;
      }>(sql`
        select c.id, c.integration_id, c.provider_project_id, e.provider_id
        from tasks t
        join project_connections c on c.project_id = t.project_id
        left join external_records e on e.local_entity_id = t.id and e.entity_type = 'issue'
        where t.id = ${conflict.task_id}::uuid
      `);
      const link = connection[0];
      if (link) {
        const operationId = randomBytes(16).toString("hex");
        await tx.execute(sql`
          insert into outbox_events (workspace_id, integration_id, operation_id, type, payload, status)
          select t.workspace_id, ${link.integration_id}::uuid, ${operationId}, 'task.update',
            jsonb_build_object(
              'taskId', t.id,
              'projectId', t.project_id,
              'connectionId', ${link.id}::text,
              'providerProjectId', ${link.provider_project_id},
              'providerTaskId', ${link.provider_id},
              'kind', 'update',
              'touched', jsonb_build_array(${conflict.field}),
              'fields', jsonb_build_object(
                'title', t.title,
                'description', t.description,
                'status', t.status,
                'priority', t.priority,
                'dueAt', t.due_at,
                'assigneeProviderId', t.assignee_provider_id
              )
            ),
            'pending'
          from tasks t where t.id = ${conflict.task_id}::uuid
        `);
      }
    }
    await writeAudit(tx, {
      workspaceId,
      action: "conflict.resolved",
      entityType: "conflict",
      entityId: conflictId,
      metadata: { resolution, field: conflict.field },
    });
  });
}
