import { createHmac, timingSafeEqual } from "node:crypto";
import { nextLink, providerFetch } from "./http";
import { mapPriorityToProvider, mapStatusFromProvider } from "./mappings";
import {
  operationMarker,
  ProviderError,
  type FieldMappings,
  type IntegrationAdapter,
  type TaskPriority,
} from "./types";

type GlIssue = {
  id: number;
  iid: number;
  title: string;
  description?: string | null;
  state: "opened" | "closed";
  web_url: string;
  updated_at: string;
  labels: string[];
  assignee?: { id: number; username: string; name: string } | null;
  due_date?: string | null;
};

type GlProject = {
  id: number;
  path_with_namespace: string;
  name: string;
  web_url: string;
};

const CAPABILITIES = {
  createTask: true,
  updateTask: true,
  archiveTask: true,
  webhooks: true,
  comments: true,
  fields: { title: true, description: true, status: true, priority: true, assignee: true, dueDate: true },
};

type GlNote = {
  id: number;
  body: string;
  created_at: string;
  system?: boolean;
  author?: { id: number; username: string; name: string } | null;
};

function defaultMappings(): FieldMappings {
  return {
    status: { open: "opened", todo: "opened", in_progress: "opened", blocked: "opened", done: "closed", cancelled: "closed" },
    priority: {
      none: "priority::none",
      low: "priority::low",
      medium: "priority::medium",
      high: "priority::high",
      urgent: "priority::urgent",
    },
    assignees: {},
  };
}

function baseUrl(siteUrl?: string | null): string {
  const raw = (siteUrl ?? "https://gitlab.com").trim().replace(/\/$/, "");
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.origin;
  } catch {
    throw new ProviderError("GitLab site URL is invalid", "validation", false);
  }
}

function projectPath(projectId: string): string {
  const trimmed = projectId.trim();
  if (!trimmed) throw new ProviderError("GitLab project is required", "validation", false);
  return encodeURIComponent(trimmed);
}

function priorityFromLabels(labels: string[], mappings: FieldMappings): TaskPriority {
  for (const [priority, label] of Object.entries(mappings.priority ?? {})) {
    if (label && labels.includes(label)) return priority as TaskPriority;
  }
  return "none";
}

function toRemote(issue: GlIssue, projectId: string, mappings: FieldMappings) {
  const closed = issue.state === "closed";
  return {
    providerId: String(issue.iid),
    providerProjectId: projectId,
    title: issue.title,
    description: issue.description ?? "",
    status: closed ? mapStatusFromProvider(mappings, "closed") : "open",
    priority: priorityFromLabels(issue.labels ?? [], mappings),
    dueAt: issue.due_date ? `${issue.due_date}T00:00:00.000Z` : null,
    assigneeProviderId: issue.assignee ? String(issue.assignee.id) : null,
    assigneeLabel: issue.assignee?.name ?? issue.assignee?.username ?? null,
    url: issue.web_url,
    updatedAt: issue.updated_at,
    archived: closed,
    raw: { id: issue.id, labels: issue.labels ?? [] },
  };
}

async function gl<T>(
  path: string,
  token: string,
  siteUrl: string | undefined,
  init: RequestInit = {},
): Promise<{ data: T; response: Response }> {
  const response = await providerFetch(`${baseUrl(siteUrl)}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (response.status === 204) return { data: undefined as T, response };
  const data = (await response.json()) as T;
  return { data, response };
}

function verifyToken(secret: string, payload: string, header: string): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const provided = header.trim();
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const gitlabAdapter: IntegrationAdapter = {
  provider: "gitlab",
  defaultMappings,
  getCapabilities: () => CAPABILITIES,
  async validateConnection(ctx) {
    const { data } = await gl<{ id: number; username: string; name: string }>(
      "/api/v4/user",
      ctx.credentials.accessToken,
      ctx.credentials.siteUrl,
    );
    return { accountLabel: data.username || data.name, externalAccountId: String(data.id) };
  },
  async listProjects(ctx, cursor) {
    const page = cursor ?? "1";
    const { data, response } = await gl<GlProject[]>(
      `/api/v4/projects?membership=true&simple=true&order_by=last_activity_at&per_page=50&page=${encodeURIComponent(page)}`,
      ctx.credentials.accessToken,
      ctx.credentials.siteUrl,
    );
    const nextPage = response.headers.get("x-next-page");
    const link = nextLink(response.headers.get("link"));
    const next = nextPage || (link ? new URL(link).searchParams.get("page") : null);
    return {
      items: data.map((item) => ({
        providerId: item.path_with_namespace,
        key: String(item.id),
        name: item.path_with_namespace,
        url: item.web_url,
      })),
      nextCursor: next || null,
    };
  },
  async listTasks(ctx, query) {
    const page = query.cursor ?? "1";
    const { data, response } = await gl<GlIssue[]>(
      `/api/v4/projects/${projectPath(query.providerProjectId)}/issues?state=all&per_page=50&page=${encodeURIComponent(page)}`,
      ctx.credentials.accessToken,
      ctx.credentials.siteUrl,
    );
    const nextPage = response.headers.get("x-next-page");
    return {
      items: data.map((issue) => toRemote(issue, query.providerProjectId, ctx.mappings)),
      nextCursor: nextPage || null,
    };
  },
  async getTask(ctx, providerId, providerProjectId) {
    const { data } = await gl<GlIssue>(
      `/api/v4/projects/${projectPath(providerProjectId)}/issues/${encodeURIComponent(providerId)}`,
      ctx.credentials.accessToken,
      ctx.credentials.siteUrl,
    );
    return toRemote(data, providerProjectId, ctx.mappings);
  },
  async createTask(ctx, input) {
    const marker = operationMarker(input.operationId);
    const search = await gl<GlIssue[]>(
      `/api/v4/projects/${projectPath(input.providerProjectId)}/issues?search=${encodeURIComponent(marker)}&per_page=5`,
      ctx.credentials.accessToken,
      ctx.credentials.siteUrl,
    );
    const replay = search.data.find((issue) => (issue.description ?? "").includes(marker));
    if (replay) return toRemote(replay, input.providerProjectId, ctx.mappings);
    const labels = [mapPriorityToProvider(ctx.mappings, input.priority ?? "none")];
    const { data } = await gl<GlIssue>(
      `/api/v4/projects/${projectPath(input.providerProjectId)}/issues`,
      ctx.credentials.accessToken,
      ctx.credentials.siteUrl,
      {
        method: "POST",
        body: JSON.stringify({
          title: input.title,
          description: `${input.description ?? ""}\n\n${marker}`.trim(),
          labels: labels.join(","),
          due_date: input.dueAt ? input.dueAt.slice(0, 10) : undefined,
          assignee_ids: input.assigneeProviderId ? [Number(input.assigneeProviderId)] : undefined,
        }),
      },
    );
    return toRemote(data, input.providerProjectId, ctx.mappings);
  },
  async updateTask(ctx, providerId, input) {
    const current = await this.getTask(ctx, providerId, input.providerProjectId);
    const labels = new Set(((current.raw.labels as string[] | undefined) ?? []).filter((label) => !label.startsWith("priority::")));
    if (input.priority) labels.add(mapPriorityToProvider(ctx.mappings, input.priority));
    const body: Record<string, unknown> = { labels: [...labels].join(",") };
    if (input.title) body.title = input.title;
    if (input.description !== undefined) body.description = input.description;
    if (input.status) body.state_event = input.status === "done" || input.status === "cancelled" ? "close" : "reopen";
    if (input.dueAt !== undefined) body.due_date = input.dueAt ? input.dueAt.slice(0, 10) : null;
    if (input.assigneeProviderId !== undefined) {
      body.assignee_ids = input.assigneeProviderId ? [Number(input.assigneeProviderId)] : [];
    }
    const { data } = await gl<GlIssue>(
      `/api/v4/projects/${projectPath(input.providerProjectId)}/issues/${encodeURIComponent(providerId)}`,
      ctx.credentials.accessToken,
      ctx.credentials.siteUrl,
      { method: "PUT", body: JSON.stringify(body) },
    );
    return toRemote(data, input.providerProjectId, ctx.mappings);
  },
  async archiveTask(ctx, providerId, providerProjectId) {
    return this.updateTask(ctx, providerId, { providerProjectId, operationId: providerId, status: "done" });
  },
  async listComments(ctx, query) {
    const page = query.cursor ?? "1";
    const { data, response } = await gl<GlNote[]>(
      `/api/v4/projects/${projectPath(query.providerProjectId)}/issues/${encodeURIComponent(query.providerTaskId)}/notes?sort=asc&per_page=50&page=${encodeURIComponent(page)}`,
      ctx.credentials.accessToken,
      ctx.credentials.siteUrl,
    );
    const nextPage = response.headers.get("x-next-page");
    return {
      items: data
        .filter((note) => !note.system)
        .map((note) => ({
          providerId: String(note.id),
          body: note.body,
          authorLabel: note.author?.name || note.author?.username || "Unknown",
          authorProviderId: note.author ? String(note.author.id) : null,
          createdAt: note.created_at,
          url: null,
        })),
      nextCursor: nextPage || null,
    };
  },
  async createComment(ctx, input) {
    const body = input.body.trim();
    if (!body) throw new ProviderError("Comment cannot be empty", "validation", false);
    const { data } = await gl<GlNote>(
      `/api/v4/projects/${projectPath(input.providerProjectId)}/issues/${encodeURIComponent(input.providerTaskId)}/notes`,
      ctx.credentials.accessToken,
      ctx.credentials.siteUrl,
      { method: "POST", body: JSON.stringify({ body }) },
    );
    return {
      providerId: String(data.id),
      body: data.body,
      authorLabel: data.author?.name || data.author?.username || "Unknown",
      authorProviderId: data.author ? String(data.author.id) : null,
      createdAt: data.created_at,
      url: null,
    };
  },
  async verifyWebhook(ctx, request) {
    const secret = ctx.credentials.webhookSecret;
    if (!secret) return false;
    const token = request.headers["x-gitlab-token"] ?? "";
    if (token && token === secret) return true;
    const signature = request.headers["x-gitlab-webhook-signature"] ?? "";
    return signature ? verifyToken(secret, request.rawBody, signature) : false;
  },
  async parseWebhook(ctx, request) {
    const event = request.headers["x-gitlab-event"] ?? "";
    const body = JSON.parse(request.rawBody) as {
      object_kind?: string;
      project?: { path_with_namespace?: string };
      object_attributes?: GlIssue & { action?: string };
    };
    const projectId = body.project?.path_with_namespace ?? null;
    if ((event === "Issue Hook" || body.object_kind === "issue") && body.object_attributes && projectId) {
      const issue = body.object_attributes;
      if (issue.action === "close" && issue.state === "closed") {
        // still upsert so local state matches
      }
      return { events: [{ kind: "task.upsert", task: toRemote(issue, projectId, ctx.mappings) }] };
    }
    return { events: [] };
  },
};
