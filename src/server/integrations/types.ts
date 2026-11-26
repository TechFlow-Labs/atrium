import type { Tx } from "../db/client";

export const PROVIDERS = ["linear", "jira", "github", "gitlab", "gitea", "fake"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

/** Chat-only providers stored on integrations but not task adapters. */
export const CHAT_PROVIDERS = ["slack"] as const;
export type ChatProviderId = (typeof CHAT_PROVIDERS)[number];

/** Notes-only providers stored on integrations but not task adapters. */
export const NOTE_PROVIDERS = ["obsidian"] as const;
export type NoteProviderId = (typeof NOTE_PROVIDERS)[number];

/** Design-only providers stored on integrations but not task adapters. */
export const DESIGN_PROVIDERS = ["figma"] as const;
export type DesignProviderId = (typeof DESIGN_PROVIDERS)[number];

export type IntegrationProviderId = ProviderId | ChatProviderId | NoteProviderId | DesignProviderId;

export function isChatProvider(provider: string): provider is ChatProviderId {
  return (CHAT_PROVIDERS as readonly string[]).includes(provider);
}

export function isNoteProvider(provider: string): provider is NoteProviderId {
  return (NOTE_PROVIDERS as readonly string[]).includes(provider);
}

export function isDesignProvider(provider: string): provider is DesignProviderId {
  return (DESIGN_PROVIDERS as readonly string[]).includes(provider);
}

export function isNonTaskProvider(
  provider: string,
): provider is ChatProviderId | NoteProviderId | DesignProviderId {
  return isChatProvider(provider) || isNoteProvider(provider) || isDesignProvider(provider);
}

export function isTaskProvider(provider: string): provider is ProviderId {
  return (PROVIDERS as readonly string[]).includes(provider);
}

export const TASK_STATUSES = ["open", "todo", "in_progress", "blocked", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type EntityType = "issue" | "pull_request" | "project" | "comment" | "other";

export type FieldMappings = {
  status?: Partial<Record<TaskStatus, string>>;
  priority?: Partial<Record<TaskPriority, string>>;
  assignees?: Record<string, string>;
  /**
   * GitHub Projects v2 board node id (`PVT_…`).
   * - unset / empty: auto-pick the first board linked to the repository
   * - `"none"`: explicitly disable Project board Status sync
   * - `PVT_…`: use that board
   */
  githubProjectNodeId?: string;
  /** Display title for the linked Projects v2 board, when known. */
  githubProjectTitle?: string;
  /** Public Projects v2 board URL, when known. */
  githubProjectUrl?: string;
};

/** Stored in `githubProjectNodeId` when the project should not use a Projects v2 board. */
export const GITHUB_BOARD_NONE = "none";

export type StoredCredential = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  webhookSecret?: string;
  cloudId?: string;
  siteUrl?: string;
  accountLabel?: string;
  /** GitHub App installation id. When set, accessToken is a short-lived installation token. */
  githubInstallationId?: string;
};

export type ProviderCapabilities = {
  createTask: boolean;
  updateTask: boolean;
  archiveTask: boolean;
  webhooks: boolean;
  comments: boolean;
  fields: {
    title: boolean;
    description: boolean;
    status: boolean;
    priority: boolean;
    assignee: boolean;
    dueDate: boolean;
  };
};

export type RemoteProject = {
  providerId: string;
  key: string | null;
  name: string;
  url: string | null;
};

export type RemoteTask = {
  providerId: string;
  providerProjectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  assigneeProviderId: string | null;
  assigneeLabel: string | null;
  url: string | null;
  updatedAt: string | null;
  archived: boolean;
  raw: Record<string, unknown>;
};

export type RemoteComment = {
  providerId: string;
  body: string;
  authorLabel: string;
  authorProviderId: string | null;
  createdAt: string;
  url: string | null;
};

export type TaskWrite = {
  providerProjectId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: string | null;
  assigneeProviderId?: string | null;
  operationId: string;
};

export type Page<T> = { items: T[]; nextCursor: string | null };

export type WebhookRequest = {
  rawBody: string;
  headers: Record<string, string>;
};

export type ParsedWebhookEvent =
  | { kind: "task.upsert"; task: RemoteTask }
  | { kind: "task.delete"; providerId: string; providerProjectId: string | null }
  | {
      kind: "record.upsert";
      entityType: EntityType;
      providerId: string;
      providerProjectId: string | null;
      title: string;
      url: string | null;
      raw: Record<string, unknown>;
    };

export type ParsedWebhook = { events: ParsedWebhookEvent[] };

export type AdapterContext = {
  tx: Tx;
  integrationId: string;
  credentials: StoredCredential;
  mappings: FieldMappings;
};

export interface IntegrationAdapter {
  provider: ProviderId;
  validateConnection(ctx: AdapterContext): Promise<{ accountLabel: string; externalAccountId: string }>;
  getCapabilities(): ProviderCapabilities;
  listProjects(ctx: AdapterContext, cursor?: string | null): Promise<Page<RemoteProject>>;
  listTasks(
    ctx: AdapterContext,
    query: { providerProjectId: string; cursor?: string | null },
  ): Promise<Page<RemoteTask>>;
  getTask(ctx: AdapterContext, providerId: string, providerProjectId: string): Promise<RemoteTask>;
  createTask(ctx: AdapterContext, input: TaskWrite): Promise<RemoteTask>;
  updateTask(ctx: AdapterContext, providerId: string, input: Partial<TaskWrite> & { providerProjectId: string; operationId: string }): Promise<RemoteTask>;
  archiveTask?(ctx: AdapterContext, providerId: string, providerProjectId: string): Promise<RemoteTask>;
  listComments?(
    ctx: AdapterContext,
    query: { providerTaskId: string; providerProjectId: string; cursor?: string | null },
  ): Promise<Page<RemoteComment>>;
  createComment?(
    ctx: AdapterContext,
    input: { providerTaskId: string; providerProjectId: string; body: string },
  ): Promise<RemoteComment>;
  verifyWebhook(ctx: AdapterContext, request: WebhookRequest): Promise<boolean>;
  parseWebhook(ctx: AdapterContext, request: WebhookRequest): Promise<ParsedWebhook>;
  defaultMappings(): FieldMappings;
}

export class ProviderError extends Error {
  readonly code:
    | "rate_limited"
    | "unauthorized"
    | "not_found"
    | "validation"
    | "unavailable"
    | "unsupported"
    | "conflict";
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    code: ProviderError["code"],
    retryable: boolean,
    status?: number,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export function operationMarker(operationId: string): string {
  return `ATRIUM-OP:${operationId}`;
}
