import { verifyHmacSha256 } from "../crypto/secrets";
import { giteaOAuthSiteUrl } from "./gitea-site";
import { nextLink, providerFetch } from "./http";
import { mapPriorityToProvider, mapStatusFromProvider } from "./mappings";
import {
  operationMarker,
  ProviderError,
  type FieldMappings,
  type IntegrationAdapter,
  type RemoteTask,
  type TaskPriority,
} from "./types";

type GtLabel = { id: number; name: string };
type GtUser = { id: number; login: string; full_name?: string };

type GtIssue = {
  id: number;
  number: number;
  title: string;
  body?: string | null;
  state: "open" | "closed";
  html_url: string;
  updated_at: string;
  labels: GtLabel[];
  assignee?: GtUser | null;
  due_date?: string | null;
  pull_request?: unknown;
};

type GtRepo = {
  id: number;
  full_name: string;
  name: string;
  html_url: string;
};

const CAPABILITIES = {
  createTask: true,
  updateTask: true,
  archiveTask: true,
  webhooks: true,
  comments: true,
  fields: { title: true, description: true, status: true, priority: true, assignee: true, dueDate: true },
};

type GtComment = {
  id: number;
  body: string;
  html_url?: string;
  created_at: string;
  user?: GtUser | null;
};

function defaultMappings(): FieldMappings {
  return {
    status: { open: "open", in_progress: "open", blocked: "open", done: "closed", cancelled: "closed" },
    priority: {
      none: "priority:none",
      low: "priority:low",
      medium: "priority:medium",
      high: "priority:high",
      urgent: "priority:urgent",
    },
    assignees: {},
  };
}

function baseUrl(siteUrl?: string | null): string {
  try {
    return giteaOAuthSiteUrl(siteUrl);
  } catch {
    throw new ProviderError("Gitea site URL is invalid", "validation", false);
  }
}

/** OAuth access tokens are JWTs and expect Bearer; personal access tokens use the historical `token` prefix. */
function authorizationHeader(token: string): string {
  return token.includes(".") ? `Bearer ${token}` : `token ${token}`;
}

function repo(projectId: string): string {
  if (!/^[^/\s]+\/[^/\s]+$/.test(projectId)) {
    throw new ProviderError("Gitea repository must look like owner/name", "validation", false);
  }
  return projectId;
}

function priorityFromLabels(labels: GtLabel[], mappings: FieldMappings): TaskPriority {
  const names = labels.map((label) => label.name);
  for (const [priority, label] of Object.entries(mappings.priority ?? {})) {
    if (label && names.includes(label)) return priority as TaskPriority;
  }
  return "none";
}

function toRemote(issue: GtIssue, projectId: string, mappings: FieldMappings): RemoteTask {
  const closed = issue.state === "closed";
  return {
    providerId: String(issue.number),
    providerProjectId: projectId,
    title: issue.title,
    description: issue.body ?? "",
    status: closed ? mapStatusFromProvider(mappings, "closed") : "open",
    priority: priorityFromLabels(issue.labels ?? [], mappings),
    dueAt: issue.due_date ? (issue.due_date.includes("T") ? issue.due_date : `${issue.due_date}T00:00:00.000Z`) : null,
    assigneeProviderId: issue.assignee?.login ?? null,
    assigneeLabel: issue.assignee?.full_name || issue.assignee?.login || null,
    url: issue.html_url,
    updatedAt: issue.updated_at,
    archived: closed,
    raw: { id: issue.id, labels: (issue.labels ?? []).map((label) => label.name) },
  };
}

async function gt<T>(
  path: string,
  token: string,
  siteUrl: string | undefined,
  init: RequestInit = {},
): Promise<{ data: T; response: Response }> {
  const headers: Record<string, string> = {
    authorization: authorizationHeader(token),
    accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body) headers["content-type"] = "application/json";
  const response = await providerFetch(`${baseUrl(siteUrl)}${path}`, {
    ...init,
    headers,
  });
  if (response.status === 204) return { data: undefined as T, response };
  const data = (await response.json()) as T;
  return { data, response };
}

async function labelIdsForNames(
  token: string,
  siteUrl: string | undefined,
  projectId: string,
  names: string[],
): Promise<number[]> {
  if (names.length === 0) return [];
  const wanted = new Set(names);
  const { data } = await gt<GtLabel[]>(
    `/api/v1/repos/${repo(projectId)}/labels?limit=50`,
    token,
    siteUrl,
  );
  return data.filter((label) => wanted.has(label.name)).map((label) => label.id);
}

export const giteaAdapter: IntegrationAdapter = {
  provider: "gitea",
  defaultMappings,
  getCapabilities: () => CAPABILITIES,
  async validateConnection(ctx) {
    const { data } = await gt<{ id: number; login: string; full_name?: string }>(
      "/api/v1/user",
      ctx.credentials.accessToken,
      ctx.credentials.siteUrl,
    );
    return { accountLabel: data.login || data.full_name || String(data.id), externalAccountId: String(data.id) };
  },
  async listProjects(ctx, cursor) {
    const page = cursor ?? "1";
    const { data, response } = await gt<GtRepo[]>(
      `/api/v1/user/repos?limit=50&page=${encodeURIComponent(page)}&sort=updated`,
      ctx.credentials.accessToken,
      ctx.credentials.siteUrl,
    );
    const link = nextLink(response.headers.get("link"));
    const next = link ? new URL(link).searchParams.get("page") : null;
    return {
      items: data.map((item) => ({
        providerId: item.full_name,
        key: item.name,
        name: item.full_name,
        url: item.html_url,
      })),
      nextCursor: next,
    };
  },
  async listTasks(ctx, query) {
    const page = query.cursor ?? "1";
    const { data, response } = await gt<GtIssue[]>(
      `/api/v1/repos/${repo(query.providerProjectId)}/issues?state=all&type=issues&limit=50&page=${encodeURIComponent(page)}`,
      ctx.credentials.accessToken,
      ctx.credentials.siteUrl,
    );
    const link = nextLink(response.headers.get("link"));
    return {
      items: data.filter((issue) => !issue.pull_request).map((issue) => toRemote(issue, query.providerProjectId, ctx.mappings)),
      nextCursor: link ? new URL(link).searchParams.get("page") : null,
    };
  },
  async getTask(ctx, providerId, providerProjectId) {
    const { data } = await gt<GtIssue>(
      `/api/v1/repos/${repo(providerProjectId)}/issues/${encodeURIComponent(providerId)}`,
      ctx.credentials.accessToken,
      ctx.credentials.siteUrl,
    );
    return toRemote(data, providerProjectId, ctx.mappings);
  },
  async createTask(ctx, input) {
    const marker = operationMarker(input.operationId);
    const search = await gt<GtIssue[]>(
      `/api/v1/repos/${repo(input.providerProjectId)}/issues?q=${encodeURIComponent(marker)}&type=issues&limit=5`,
      ctx.credentials.accessToken,
      ctx.credentials.siteUrl,
    );
    const replay = search.data.find((issue) => (issue.body ?? "").includes(marker));
    if (replay) return toRemote(replay, input.providerProjectId, ctx.mappings);
    const priorityLabel = mapPriorityToProvider(ctx.mappings, input.priority ?? "none");
    const labels = await labelIdsForNames(
      ctx.credentials.accessToken,
      ctx.credentials.siteUrl,
      input.providerProjectId,
      [priorityLabel],
    );
    const body: Record<string, unknown> = {
      title: input.title,
      body: `${input.description ?? ""}\n\n${marker}`.trim(),
    };
    if (labels.length > 0) body.labels = labels;
    if (input.dueAt) body.due_date = input.dueAt.slice(0, 10);
    if (input.assigneeProviderId) body.assignee = input.assigneeProviderId;
    const { data } = await gt<GtIssue>(
      `/api/v1/repos/${repo(input.providerProjectId)}/issues`,
      ctx.credentials.accessToken,
      ctx.credentials.siteUrl,
      { method: "POST", body: JSON.stringify(body) },
    );
    return toRemote(data, input.providerProjectId, ctx.mappings);
  },
  async updateTask(ctx, providerId, input) {
    const current = await this.getTask(ctx, providerId, input.providerProjectId);
    const existingNames = ((current.raw.labels as string[] | undefined) ?? []).filter(
      (label) => !label.startsWith("priority:"),
    );
    if (input.priority) existingNames.push(mapPriorityToProvider(ctx.mappings, input.priority));
    const labels = await labelIdsForNames(
      ctx.credentials.accessToken,
      ctx.credentials.siteUrl,
      input.providerProjectId,
      existingNames,
    );
    const body: Record<string, unknown> = {};
    if (labels.length > 0 || input.priority) body.labels = labels;
    if (input.title) body.title = input.title;
    if (input.description !== undefined) body.body = input.description;
    if (input.status) body.state = input.status === "done" || input.status === "cancelled" ? "closed" : "open";
    if (input.dueAt !== undefined) body.due_date = input.dueAt ? input.dueAt.slice(0, 10) : null;
    if (input.assigneeProviderId !== undefined) {
      body.assignee = input.assigneeProviderId || null;
    }
    const { data } = await gt<GtIssue>(
      `/api/v1/repos/${repo(input.providerProjectId)}/issues/${encodeURIComponent(providerId)}`,
      ctx.credentials.accessToken,
      ctx.credentials.siteUrl,
      { method: "PATCH", body: JSON.stringify(body) },
    );
    return toRemote(data, input.providerProjectId, ctx.mappings);
  },
  async archiveTask(ctx, providerId, providerProjectId) {
    return this.updateTask(ctx, providerId, { providerProjectId, operationId: providerId, status: "done" });
  },
  async listComments(ctx, query) {
    const page = query.cursor ?? "1";
    const { data, response } = await gt<GtComment[]>(
      `/api/v1/repos/${repo(query.providerProjectId)}/issues/${encodeURIComponent(query.providerTaskId)}/comments?limit=50&page=${encodeURIComponent(page)}`,
      ctx.credentials.accessToken,
      ctx.credentials.siteUrl,
    );
    const link = nextLink(response.headers.get("link"));
    return {
      items: data.map((comment) => ({
        providerId: String(comment.id),
        body: comment.body,
        authorLabel: comment.user?.full_name || comment.user?.login || "Unknown",
        authorProviderId: comment.user ? String(comment.user.id) : null,
        createdAt: comment.created_at,
        url: comment.html_url ?? null,
      })),
      nextCursor: link ? new URL(link).searchParams.get("page") : null,
    };
  },
  async createComment(ctx, input) {
    const body = input.body.trim();
    if (!body) throw new ProviderError("Comment cannot be empty", "validation", false);
    const { data } = await gt<GtComment>(
      `/api/v1/repos/${repo(input.providerProjectId)}/issues/${encodeURIComponent(input.providerTaskId)}/comments`,
      ctx.credentials.accessToken,
      ctx.credentials.siteUrl,
      { method: "POST", body: JSON.stringify({ body }) },
    );
    return {
      providerId: String(data.id),
      body: data.body,
      authorLabel: data.user?.full_name || data.user?.login || "Unknown",
      authorProviderId: data.user ? String(data.user.id) : null,
      createdAt: data.created_at,
      url: data.html_url ?? null,
    };
  },
  async verifyWebhook(ctx, request) {
    const secret = ctx.credentials.webhookSecret;
    if (!secret) return false;
    const giteaSig = request.headers["x-gitea-signature"] ?? "";
    if (giteaSig && verifyHmacSha256(secret, request.rawBody, giteaSig)) return true;
    const hubSig = request.headers["x-hub-signature-256"] ?? "";
    return hubSig ? verifyHmacSha256(secret, request.rawBody, hubSig) : false;
  },
  async parseWebhook(ctx, request) {
    const event = request.headers["x-gitea-event"] ?? request.headers["x-github-event"] ?? "";
    const body = JSON.parse(request.rawBody) as {
      action?: string;
      repository?: { full_name?: string };
      issue?: GtIssue;
      pull_request?: { id: number; number: number; title: string; html_url: string; state: string };
    };
    const projectId = body.repository?.full_name ?? null;
    if ((event === "issues" || event === "issue") && body.issue && projectId) {
      if (body.action === "deleted") {
        return { events: [{ kind: "task.delete", providerId: String(body.issue.number), providerProjectId: projectId }] };
      }
      return { events: [{ kind: "task.upsert", task: toRemote(body.issue, projectId, ctx.mappings) }] };
    }
    if ((event === "pull_request" || event === "pull_request_sync") && body.pull_request && projectId) {
      return {
        events: [{
          kind: "record.upsert",
          entityType: "pull_request",
          providerId: String(body.pull_request.number),
          providerProjectId: projectId,
          title: body.pull_request.title,
          url: body.pull_request.html_url,
          raw: { state: body.pull_request.state },
        }],
      };
    }
    return { events: [] };
  },
};
