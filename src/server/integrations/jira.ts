import { verifyHmacSha256 } from "../crypto/secrets";
import { providerFetch } from "./http";
import { mapPriorityFromProvider, mapPriorityToProvider, mapStatusFromProvider, mapStatusToProvider } from "./mappings";
import {
  operationMarker,
  ProviderError,
  type FieldMappings,
  type IntegrationAdapter,
  type RemoteTask,
} from "./types";

type JiraIssue = {
  id: string;
  key: string;
  fields: {
    summary?: string;
    description?: unknown;
    duedate?: string | null;
    updated?: string;
    status?: { name?: string; statusCategory?: { key?: string } };
    priority?: { name?: string };
    assignee?: { accountId?: string; displayName?: string } | null;
    project?: { id?: string; key?: string };
    labels?: string[];
  };
};

const CAPABILITIES = {
  createTask: true,
  updateTask: true,
  archiveTask: true,
  webhooks: true,
  comments: true,
  fields: { title: true, description: true, status: true, priority: true, assignee: true, dueDate: true },
};

type JiraComment = {
  id: string;
  body?: unknown;
  created?: string;
  author?: { accountId?: string; displayName?: string } | null;
};

function defaultMappings(): FieldMappings {
  return {
    status: { open: "To Do", todo: "To Do", in_progress: "In Progress", blocked: "Blocked", done: "Done", cancelled: "Cancelled" },
    priority: { none: "Lowest", low: "Low", medium: "Medium", high: "High", urgent: "Highest" },
    assignees: {},
  };
}

function base(ctx: { credentials: { cloudId?: string; accessToken: string } }): string {
  if (!ctx.credentials.cloudId) throw new ProviderError("Jira cloud id is missing", "validation", false);
  return `https://api.atlassian.com/ex/jira/${ctx.credentials.cloudId}/rest/api/3`;
}

function adf(text: string): Record<string, unknown> {
  return { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

function adfText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const doc = value as { content?: Array<{ content?: Array<{ text?: string }> }> };
  return (doc.content ?? [])
    .flatMap((block) => block.content ?? [])
    .map((node) => node.text ?? "")
    .join("\n")
    .trim();
}

function toRemote(issue: JiraIssue, mappings: FieldMappings): RemoteTask {
  const projectId = issue.fields.project?.id ?? issue.fields.project?.key ?? "";
  return {
    providerId: issue.id,
    providerProjectId: projectId,
    title: issue.fields.summary ?? issue.key,
    description: adfText(issue.fields.description),
    status: mapStatusFromProvider(mappings, issue.fields.status?.name ?? issue.fields.status?.statusCategory?.key),
    priority: mapPriorityFromProvider(mappings, issue.fields.priority?.name),
    dueAt: issue.fields.duedate ? new Date(issue.fields.duedate).toISOString() : null,
    assigneeProviderId: issue.fields.assignee?.accountId ?? null,
    assigneeLabel: issue.fields.assignee?.displayName ?? null,
    url: null,
    updatedAt: issue.fields.updated ?? null,
    archived: false,
    raw: { key: issue.key, labels: issue.fields.labels ?? [] },
  };
}

async function jiraGet<T>(url: string, token: string): Promise<T> {
  const response = await providerFetch(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  return (await response.json()) as T;
}

export const jiraAdapter: IntegrationAdapter = {
  provider: "jira",
  defaultMappings,
  getCapabilities: () => CAPABILITIES,
  async validateConnection(ctx) {
    const resources = await jiraGet<Array<{ id: string; name: string; url: string }>>(
      "https://api.atlassian.com/oauth/token/accessible-resources",
      ctx.credentials.accessToken,
    );
    const site = resources.find((item) => item.id === ctx.credentials.cloudId) ?? resources[0];
    if (!site) throw new ProviderError("Jira did not return an accessible site", "unauthorized", false, 401);
    return { accountLabel: site.name, externalAccountId: site.id };
  },
  async listProjects(ctx, cursor) {
    const start = cursor ?? "0";
    const data = await jiraGet<{ values: Array<{ id: string; key: string; name: string }>; isLast: boolean; startAt: number; maxResults: number }>(
      `${base(ctx)}/project/search?startAt=${encodeURIComponent(start)}&maxResults=50`,
      ctx.credentials.accessToken,
    );
    const next = data.isLast ? null : String(data.startAt + data.maxResults);
    return {
      items: data.values.map((project) => ({
        providerId: project.id,
        key: project.key,
        name: project.name,
        url: ctx.credentials.siteUrl ? `${ctx.credentials.siteUrl.replace(/\/$/, "")}/browse/${project.key}` : null,
      })),
      nextCursor: next,
    };
  },
  async listTasks(ctx, query) {
    const response = await providerFetch(`${base(ctx)}/search/jql`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ctx.credentials.accessToken}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jql: `project = ${query.providerProjectId} ORDER BY updated DESC`,
        maxResults: 50,
        nextPageToken: query.cursor ?? undefined,
        fields: ["summary", "description", "status", "priority", "assignee", "duedate", "updated", "project", "labels"],
      }),
    });
    const data = (await response.json()) as { issues: JiraIssue[]; nextPageToken?: string };
    return {
      items: (data.issues ?? []).map((issue) => {
        const remote = toRemote(issue, ctx.mappings);
        return {
          ...remote,
          url: ctx.credentials.siteUrl ? `${ctx.credentials.siteUrl.replace(/\/$/, "")}/browse/${issue.key}` : null,
        };
      }),
      nextCursor: data.nextPageToken ?? null,
    };
  },
  async getTask(ctx, providerId) {
    const issue = await jiraGet<JiraIssue>(`${base(ctx)}/issue/${encodeURIComponent(providerId)}`, ctx.credentials.accessToken);
    const remote = toRemote(issue, ctx.mappings);
    return {
      ...remote,
      url: ctx.credentials.siteUrl ? `${ctx.credentials.siteUrl.replace(/\/$/, "")}/browse/${issue.key}` : remote.url,
    };
  },
  async createTask(ctx, input) {
    const marker = operationMarker(input.operationId);
    const search = await providerFetch(`${base(ctx)}/search/jql`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ctx.credentials.accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        jql: `project = ${input.providerProjectId} AND labels = "${marker.replace(/:/g, "-")}"`,
        maxResults: 1,
        fields: ["summary", "description", "status", "priority", "assignee", "duedate", "updated", "project", "labels"],
      }),
    });
    const found = (await search.json()) as { issues?: JiraIssue[] };
    if (found.issues?.[0]) return toRemote(found.issues[0], ctx.mappings);
    const label = marker.replace(/:/g, "-");
    const response = await providerFetch(`${base(ctx)}/issue`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ctx.credentials.accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        fields: {
          project: { id: input.providerProjectId },
          summary: input.title,
          issuetype: { name: "Task" },
          description: adf(`${input.description ?? ""}\n\n${marker}`.trim()),
          labels: [label],
          priority: { name: mapPriorityToProvider(ctx.mappings, input.priority ?? "none") },
          duedate: input.dueAt ? input.dueAt.slice(0, 10) : undefined,
          assignee: input.assigneeProviderId ? { accountId: input.assigneeProviderId } : undefined,
        },
      }),
    });
    const created = (await response.json()) as { id: string };
    return this.getTask(ctx, created.id, input.providerProjectId);
  },
  async updateTask(ctx, providerId, input) {
    const fields: Record<string, unknown> = {};
    if (input.title) fields.summary = input.title;
    if (input.description !== undefined) fields.description = adf(input.description);
    if (input.priority) fields.priority = { name: mapPriorityToProvider(ctx.mappings, input.priority) };
    if (input.dueAt !== undefined) fields.duedate = input.dueAt ? input.dueAt.slice(0, 10) : null;
    if (input.assigneeProviderId !== undefined) {
      fields.assignee = input.assigneeProviderId ? { accountId: input.assigneeProviderId } : null;
    }
    if (Object.keys(fields).length > 0) {
      await providerFetch(`${base(ctx)}/issue/${encodeURIComponent(providerId)}`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${ctx.credentials.accessToken}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ fields }),
      });
    }
    if (input.status) {
      const transitions = await jiraGet<{ transitions: Array<{ id: string; name: string }> }>(
        `${base(ctx)}/issue/${encodeURIComponent(providerId)}/transitions`,
        ctx.credentials.accessToken,
      );
      const wanted = mapStatusToProvider(ctx.mappings, input.status).toLowerCase();
      const transition = transitions.transitions.find((item) => item.name.toLowerCase() === wanted);
      if (!transition) {
        throw new ProviderError(`Jira has no transition named ${wanted}`, "unsupported", false);
      }
      await providerFetch(`${base(ctx)}/issue/${encodeURIComponent(providerId)}/transitions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${ctx.credentials.accessToken}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ transition: { id: transition.id } }),
      });
    }
    return this.getTask(ctx, providerId, input.providerProjectId);
  },
  async archiveTask(ctx, providerId, providerProjectId) {
    return this.updateTask(ctx, providerId, { providerProjectId, operationId: providerId, status: "cancelled" });
  },
  async listComments(ctx, query) {
    const start = query.cursor ?? "0";
    const data = await jiraGet<{
      comments: JiraComment[];
      startAt: number;
      maxResults: number;
      total: number;
    }>(
      `${base(ctx)}/issue/${encodeURIComponent(query.providerTaskId)}/comment?startAt=${encodeURIComponent(start)}&maxResults=50`,
      ctx.credentials.accessToken,
    );
    const nextAt = data.startAt + data.maxResults;
    return {
      items: (data.comments ?? []).map((comment) => ({
        providerId: comment.id,
        body: adfText(comment.body),
        authorLabel: comment.author?.displayName ?? "Unknown",
        authorProviderId: comment.author?.accountId ?? null,
        createdAt: comment.created ?? new Date().toISOString(),
        url: null,
      })),
      nextCursor: nextAt < data.total ? String(nextAt) : null,
    };
  },
  async createComment(ctx, input) {
    const text = input.body.trim();
    if (!text) throw new ProviderError("Comment cannot be empty", "validation", false);
    const response = await providerFetch(`${base(ctx)}/issue/${encodeURIComponent(input.providerTaskId)}/comment`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ctx.credentials.accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ body: adf(text) }),
    });
    const comment = (await response.json()) as JiraComment;
    return {
      providerId: comment.id,
      body: adfText(comment.body) || text,
      authorLabel: comment.author?.displayName ?? "Unknown",
      authorProviderId: comment.author?.accountId ?? null,
      createdAt: comment.created ?? new Date().toISOString(),
      url: null,
    };
  },
  async verifyWebhook(ctx, request) {
    const secret = ctx.credentials.webhookSecret;
    if (!secret) return false;
    const signature = request.headers["x-hub-signature"] ?? request.headers["x-hub-signature-256"] ?? "";
    return verifyHmacSha256(secret, request.rawBody, signature);
  },
  async parseWebhook(ctx, request) {
    const body = JSON.parse(request.rawBody) as {
      webhookEvent?: string;
      issue?: JiraIssue;
    };
    if (!body.issue) return { events: [] };
    if (body.webhookEvent === "jira:issue_deleted") {
      return {
        events: [{
          kind: "task.delete",
          providerId: body.issue.id,
          providerProjectId: body.issue.fields.project?.id ?? null,
        }],
      };
    }
    return { events: [{ kind: "task.upsert", task: toRemote(body.issue, ctx.mappings) }] };
  },
};
