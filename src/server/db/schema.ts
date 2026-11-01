import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true, mode: "date" }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true, mode: "date" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  kind: text("kind").notNull(),
  icon: text("icon"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const workspaceContexts = pgTable("workspace_contexts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  slug: text("slug").notNull(),
  label: text("label").notNull(),
  icon: text("icon"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").$type<"owner" | "admin" | "member" | "viewer">().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const workspaceInvitations = pgTable("workspace_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  email: text("email").notNull(),
  role: text("role").$type<"admin" | "member" | "viewer">().notNull(),
  tokenHash: text("token_hash").notNull(),
  invitedBy: text("invited_by").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  name: text("name").notNull(),
  nickname: text("nickname"),
  description: text("description").notNull().default(""),
  status: text("status").$type<"active" | "archived">().notNull().default("active"),
  ownershipMode: text("ownership_mode").$type<"native" | "external" | "hybrid">().notNull(),
  createdBy: text("created_by").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const milestones = pgTable("milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  projectId: uuid("project_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }),
  status: text("status").$type<"open" | "done">().notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    milestoneId: uuid("milestone_id"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").$type<"open" | "in_progress" | "blocked" | "done" | "cancelled">().notNull(),
    priority: text("priority").$type<"none" | "low" | "medium" | "high" | "urgent">().notNull(),
    dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }),
    assigneeUserId: text("assignee_user_id"),
    assigneeProviderId: text("assignee_provider_id"),
    assigneeLabel: text("assignee_label"),
    provider: text("provider").$type<"linear" | "jira" | "github" | "gitlab" | "gitea" | "fake" | null>(),
    externalUrl: text("external_url"),
    syncState: text("sync_state").$type<"pending" | "synced" | "error" | "tombstone">().notNull().default("synced"),
    syncError: text("sync_error"),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("tasks_project_idx").on(table.projectId)],
);

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  provider: text("provider")
    .$type<"linear" | "jira" | "github" | "gitlab" | "gitea" | "fake" | "slack" | "obsidian">()
    .notNull(),
  status: text("status").$type<"connected" | "error" | "revoked">().notNull(),
  displayName: text("display_name").notNull(),
  externalAccountId: text("external_account_id"),
  credentialCiphertext: text("credential_ciphertext"),
  scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
  connectedBy: text("connected_by").notNull(),
  lastValidatedAt: timestamp("last_validated_at", { withTimezone: true, mode: "date" }),
  lastError: text("last_error"),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const projectConnections = pgTable("project_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  projectId: uuid("project_id").notNull(),
  integrationId: uuid("integration_id").notNull(),
  providerProjectId: text("provider_project_id").notNull(),
  providerProjectKey: text("provider_project_key"),
  providerProjectName: text("provider_project_name").notNull(),
  providerProjectUrl: text("provider_project_url"),
  fieldMappings: jsonb("field_mappings").notNull().default({}),
  publishOutbound: boolean("publish_outbound").notNull().default(false),
  syncInbound: boolean("sync_inbound").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const externalRecords = pgTable(
  "external_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    integrationId: uuid("integration_id").notNull(),
    entityType: text("entity_type").$type<"issue" | "pull_request" | "project" | "comment" | "other">().notNull(),
    providerId: text("provider_id").notNull(),
    localEntityType: text("local_entity_type"),
    localEntityId: uuid("local_entity_id"),
    providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true, mode: "date" }),
    fingerprint: text("fingerprint"),
    lastOutboundFingerprint: text("last_outbound_fingerprint"),
    lastOutboundOperationId: text("last_outbound_operation_id"),
    recentOutboundFingerprints: text("recent_outbound_fingerprints").array().notNull().default(sql`'{}'::text[]`),
    raw: jsonb("raw").notNull().default({}),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("external_identity").on(table.integrationId, table.entityType, table.providerId)],
);

export const syncEvents = pgTable("sync_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  integrationId: uuid("integration_id"),
  direction: text("direction").$type<"inbound" | "outbound">().notNull(),
  entityType: text("entity_type").notNull(),
  providerId: text("provider_id"),
  operationId: text("operation_id"),
  fingerprint: text("fingerprint"),
  status: text("status").$type<"pending" | "processed" | "skipped" | "failed" | "dead">().notNull(),
  error: text("error"),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
});

export const outboxEvents = pgTable("outbox_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  integrationId: uuid("integration_id"),
  operationId: text("operation_id").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").$type<"pending" | "processing" | "succeeded" | "failed" | "dead">().notNull(),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(8),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
  lockedBy: text("locked_by"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id"),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull().default({}),
  status: text("status").$type<"pending" | "processing" | "succeeded" | "failed" | "dead">().notNull(),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(8),
  runAt: timestamp("run_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
  lockedBy: text("locked_by"),
  lastError: text("last_error"),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const integrationSyncCursors = pgTable("integration_sync_cursors", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  integrationId: uuid("integration_id").notNull(),
  resource: text("resource").notNull(),
  cursor: text("cursor"),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true, mode: "date" }),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true, mode: "date" }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  deliveryId: text("delivery_id").notNull(),
  integrationId: uuid("integration_id"),
  workspaceId: uuid("workspace_id"),
  signatureValid: boolean("signature_valid").notNull(),
  bodySha256: text("body_sha256").notNull(),
  payload: jsonb("payload").notNull().default({}),
  status: text("status").notNull(),
  error: text("error"),
  receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
});

export const conflicts = pgTable("conflicts", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  taskId: uuid("task_id"),
  integrationId: uuid("integration_id"),
  field: text("field").notNull(),
  localValue: jsonb("local_value"),
  remoteValue: jsonb("remote_value"),
  status: text("status").$type<"open" | "resolved">().notNull().default("open"),
  resolution: text("resolution").$type<"keep_local" | "keep_remote" | null>(),
  resolvedBy: text("resolved_by"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id"),
  actorUserId: text("actor_user_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id").primaryKey(),
  timezone: text("timezone").notNull().default("UTC"),
  theme: text("theme").$type<"light" | "dark">().notNull().default("light"),
  palette: text("palette")
    .$type<"grove" | "harbor" | "ember" | "slate" | "dusk">()
    .notNull()
    .default("grove"),
  notifySyncErrors: boolean("notify_sync_errors").notNull().default(true),
  notifyAssignments: boolean("notify_assignments").notNull().default(true),
  animationsEnabled: boolean("animations_enabled").notNull().default(true),
  providerTileStyles: boolean("provider_tile_styles").notNull().default(true),
  groupRelatedTasks: boolean("group_related_tasks").notNull().default(true),
  projectsLayout: jsonb("projects_layout"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  bucketKey: text("bucket_key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true, mode: "date" }).notNull(),
});

export const oauthStates = pgTable("oauth_states", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(),
  stateHash: text("state_hash").notNull(),
  codeVerifierCiphertext: text("code_verifier_ciphertext").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    taskId: uuid("task_id").notNull(),
    body: text("body").notNull(),
    authorUserId: text("author_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("task_comments_task_idx").on(table.taskId)],
);

export const taskLinks = pgTable(
  "task_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    fromTaskId: uuid("from_task_id").notNull(),
    toTaskId: uuid("to_task_id").notNull(),
    linkType: text("link_type").$type<"blocks" | "relates_to" | "duplicate">().notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("task_links_from_idx").on(table.fromTaskId),
    index("task_links_to_idx").on(table.toTaskId),
  ],
);

export const fakeProviderTasks = pgTable("fake_provider_tasks", {
  id: text("id").primaryKey(),
  integrationId: uuid("integration_id").notNull(),
  providerProjectId: text("provider_project_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull(),
  priority: text("priority").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }),
  assigneeProviderId: text("assignee_provider_id"),
  archived: boolean("archived").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  raw: jsonb("raw").notNull().default({}),
});

export const fakeProviderProjects = pgTable("fake_provider_projects", {
  integrationId: uuid("integration_id").notNull(),
  providerProjectId: text("provider_project_id").notNull(),
  name: text("name").notNull(),
  key: text("key"),
  url: text("url"),
});

export const fakeProviderComments = pgTable(
  "fake_provider_comments",
  {
    id: text("id").primaryKey(),
    integrationId: uuid("integration_id").notNull(),
    providerProjectId: text("provider_project_id").notNull(),
    providerTaskId: text("provider_task_id").notNull(),
    body: text("body").notNull(),
    authorLabel: text("author_label").notNull().default("Fake user"),
    authorProviderId: text("author_provider_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("fake_provider_comments_task_idx").on(table.integrationId, table.providerTaskId)],
);

export const mcpTokens = pgTable(
  "mcp_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    workspaceId: uuid("workspace_id"),
    name: text("name").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    scopes: text("scopes").array().notNull().default(sql`'{"read","write"}'::text[]`),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("mcp_tokens_user_idx").on(table.userId),
    index("mcp_tokens_workspace_idx").on(table.workspaceId),
  ],
);
