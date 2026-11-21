import { verifyHmacSha256 } from "../crypto/secrets";
import { nextLink, providerFetch } from "./http";
import {
  atriumStatusFromProjectName,
  getIssueProjectStatus,
  resolveGithubProjectNodeId,
  resolveIssueFromNodeId,
  setIssueProjectStatus,
} from "./github-projects";
import { mapPriorityToProvider } from "./mappings";
import {
  GITHUB_BOARD_NONE,
  operationMarker,
  ProviderError,
  type FieldMappings,
  type IntegrationAdapter,
  type RemoteTask,
  type TaskPriority,
  type TaskStatus,
} from "./types";

type GhIssue = {
  id: number;
  node_id?: string;
  number: number;
  title: string;
  body?: string | null;
  state: "open" | "closed";
  html_url: string;
  updated_at: string;
  labels: Array<{ name: string }>;
  assignee?: { login: string } | null;
  pull_request?: unknown;
};

const CAPABILITIES = {
  createTask: true,
  updateTask: true,
  archiveTask: true,
  webhooks: true,
  comments: true,
  fields: { title: true, description: true, status: true, priority: true, assignee: false, dueDate: false },
};

type GhComment = {
  id: number;
  body?: string | null;
  html_url: string;
  created_at: string;
  user?: { id: number; login: string } | null;
};

function defaultMappings(): FieldMappings {
  return {
    // Issue open/closed fallbacks; when a GitHub Project is linked, prefer Status option names
    // (Todo / In Progress / Done) via heuristics or explicit mappings on the project page.
    status: {
      open: "Todo",
      in_progress: "In Progress",
      blocked: "In Progress",
      done: "Done",
      cancelled: "Done",
    },
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

function priorityFromLabels(labels: Array<{ name: string }>, mappings: FieldMappings): TaskPriority {
  const names = labels.map((label) => label.name);
  for (const [priority, label] of Object.entries(mappings.priority ?? {})) {
    if (label && names.includes(label)) return priority as TaskPriority;
  }
  return "none";
}

function toRemote(
  issue: GhIssue,
  projectId: string,
  mappings: FieldMappings,
  projectStatusName?: string | null,
): RemoteTask {
  const closed = issue.state === "closed";
  const status = atriumStatusFromProjectName(projectStatusName, mappings, closed);
  return {
    providerId: String(issue.number),
    providerProjectId: projectId,
    title: issue.title,
    description: issue.body ?? "",
    status,
    priority: priorityFromLabels(issue.labels ?? [], mappings),
    dueAt: null,
    assigneeProviderId: issue.assignee?.login ?? null,
    assigneeLabel: issue.assignee?.login ?? null,
    url: issue.html_url,
    updatedAt: issue.updated_at,
    archived: closed || status === "done" || status === "cancelled",
    raw: {
      nodeId: issue.node_id ?? issue.id,
      restId: issue.id,
      labels: (issue.labels ?? []).map((label) => label.name),
      projectStatus: projectStatusName ?? null,
    },
  };
}

async function gh<T>(url: string, token: string, init: RequestInit = {}): Promise<{ data: T; response: Response }> {
  const response = await providerFetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const data = (await response.json()) as T;
  return { data, response };
}

function repo(projectId: string): string {
  if (!/^[^/\s]+\/[^/\s]+$/.test(projectId)) {
    throw new ProviderError("GitHub repository must look like owner/name", "validation", false);
  }
  return projectId;
}

async function enrichWithProjectStatus(
  token: string,
  providerProjectId: string,
  issue: GhIssue,
  mappings: FieldMappings,
): Promise<RemoteTask> {
  try {
    const projectNodeId = await resolveGithubProjectNodeId(token, providerProjectId, mappings);
    if (!projectNodeId) return toRemote(issue, providerProjectId, mappings, null);
    const info = await getIssueProjectStatus(token, providerProjectId, issue.number, projectNodeId);
    return toRemote(issue, providerProjectId, mappings, info?.statusName ?? null);
  } catch {
    // Projects API may be unavailable (missing scope / no board). Fall back to issue state.
    return toRemote(issue, providerProjectId, mappings, null);
  }
}

async function pushProjectStatus(
  token: string,
  providerProjectId: string,
  issue: GhIssue,
  status: TaskStatus,
  mappings: FieldMappings,
): Promise<string | null> {
  const projectNodeId = await resolveGithubProjectNodeId(token, providerProjectId, mappings);
  if (!projectNodeId) return null;
  const issueNodeId = typeof issue.node_id === "string" ? issue.node_id : null;
  const result = await setIssueProjectStatus(
    token,
    providerProjectId,
    issue.number,
    issueNodeId,
    status,
    mappings,
    projectNodeId,
  );
  return result?.statusName ?? null;
}

export const githubAdapter: IntegrationAdapter = {
  provider: "github",
  defaultMappings,
  getCapabilities: () => CAPABILITIES,
  async validateConnection(ctx) {
    if (ctx.credentials.githubInstallationId) {
      const { data } = await gh<{
        id: number;
        account?: { login?: string; id?: number } | null;
      }>("https://api.github.com/installation", ctx.credentials.accessToken);
      const login = data.account?.login ?? `installation-${data.id}`;
      return {
        accountLabel: ctx.credentials.accountLabel ?? `${login} (GitHub App)`,
        externalAccountId: String(ctx.credentials.githubInstallationId),
      };
    }
    const { data } = await gh<{ id: number; login: string }>("https://api.github.com/user", ctx.credentials.accessToken);
    return { accountLabel: data.login, externalAccountId: String(data.id) };
  },
  async listProjects(ctx, cursor) {
    const page = cursor ?? "1";
    if (ctx.credentials.githubInstallationId) {
      const { data, response } = await gh<{
        repositories: Array<{ full_name: string; name: string; html_url: string }>;
      }>(
        `https://api.github.com/installation/repositories?per_page=50&page=${encodeURIComponent(page)}`,
        ctx.credentials.accessToken,
      );
      const link = nextLink(response.headers.get("link"));
      const next = link ? new URL(link).searchParams.get("page") : null;
      return {
        items: (data.repositories ?? []).map((item) => ({
          providerId: item.full_name,
          key: item.name,
          name: item.full_name,
          url: item.html_url,
        })),
        nextCursor: next,
      };
    }
    const { data, response } = await gh<Array<{ full_name: string; name: string; html_url: string }>>(
      `https://api.github.com/user/repos?per_page=50&page=${encodeURIComponent(page)}&sort=updated`,
      ctx.credentials.accessToken,
    );
    const link = nextLink(response.headers.get("link"));
    const next = link ? new URL(link).searchParams.get("page") : null;
    return {
      items: data.map((item) => ({ providerId: item.full_name, key: item.name, name: item.full_name, url: item.html_url })),
      nextCursor: next,
    };
  },
  async listTasks(ctx, query) {
    const page = query.cursor ?? "1";
    const { data, response } = await gh<GhIssue[]>(
      `https://api.github.com/repos/${repo(query.providerProjectId)}/issues?state=all&per_page=50&page=${encodeURIComponent(page)}`,
      ctx.credentials.accessToken,
    );
    const link = nextLink(response.headers.get("link"));
    const issues = data.filter((issue) => !issue.pull_request);
    const items: RemoteTask[] = [];
    for (const issue of issues) {
      items.push(await enrichWithProjectStatus(ctx.credentials.accessToken, query.providerProjectId, issue, ctx.mappings));
    }
    return {
      items,
      nextCursor: link ? new URL(link).searchParams.get("page") : null,
    };
  },
  async getTask(ctx, providerId, providerProjectId) {
    const { data } = await gh<GhIssue>(
      `https://api.github.com/repos/${repo(providerProjectId)}/issues/${encodeURIComponent(providerId)}`,
      ctx.credentials.accessToken,
    );
    return enrichWithProjectStatus(ctx.credentials.accessToken, providerProjectId, data, ctx.mappings);
  },
  async createTask(ctx, input) {
    const marker = operationMarker(input.operationId);
    const searchUrl = `https://api.github.com/search/issues?q=${encodeURIComponent(`${marker} repo:${input.providerProjectId} in:body`)}`;
    const { data: search } = await gh<{ items: GhIssue[] }>(searchUrl, ctx.credentials.accessToken);
    const replay = search.items?.[0];
    if (replay) {
      return enrichWithProjectStatus(ctx.credentials.accessToken, input.providerProjectId, replay, ctx.mappings);
    }
    const labels = [mapPriorityToProvider(ctx.mappings, input.priority ?? "none")];
    const { data } = await gh<GhIssue>(`https://api.github.com/repos/${repo(input.providerProjectId)}/issues`, ctx.credentials.accessToken, {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        body: `${input.description ?? ""}\n\n${marker}`.trim(),
        labels,
      }),
    });
    let projectStatus: string | null = null;
    if (input.status) {
      try {
        projectStatus = await pushProjectStatus(
          ctx.credentials.accessToken,
          input.providerProjectId,
          data,
          input.status,
          ctx.mappings,
        );
      } catch {
        // Issue was created; Project Status can be set on a later update once scopes/board exist.
      }
    }
    return toRemote(data, input.providerProjectId, ctx.mappings, projectStatus);
  },
  async updateTask(ctx, providerId, input) {
    const { data: currentIssue } = await gh<GhIssue>(
      `https://api.github.com/repos/${repo(input.providerProjectId)}/issues/${encodeURIComponent(providerId)}`,
      ctx.credentials.accessToken,
    );
    const current = await enrichWithProjectStatus(
      ctx.credentials.accessToken,
      input.providerProjectId,
      currentIssue,
      ctx.mappings,
    );
    const labels = new Set(((current.raw.labels as string[] | undefined) ?? []).filter((label) => !label.startsWith("priority:")));
    if (input.priority) labels.add(mapPriorityToProvider(ctx.mappings, input.priority));
    const body: Record<string, unknown> = { labels: [...labels] };
    if (input.title) body.title = input.title;
    if (input.description !== undefined) body.body = input.description;
    if (input.status) body.state = input.status === "done" || input.status === "cancelled" ? "closed" : "open";
    const { data } = await gh<GhIssue>(
      `https://api.github.com/repos/${repo(input.providerProjectId)}/issues/${encodeURIComponent(providerId)}`,
      ctx.credentials.accessToken,
      { method: "PATCH", body: JSON.stringify(body) },
    );

    let projectStatus = (current.raw.projectStatus as string | null | undefined) ?? null;
    if (input.status) {
      try {
        projectStatus = await pushProjectStatus(
          ctx.credentials.accessToken,
          input.providerProjectId,
          data,
          input.status,
          ctx.mappings,
        );
      } catch {
        // Issue REST update already succeeded; Project Status needs project scope + a linked board.
      }
    } else {
      try {
        const enriched = await enrichWithProjectStatus(
          ctx.credentials.accessToken,
          input.providerProjectId,
          data,
          ctx.mappings,
        );
        projectStatus = (enriched.raw.projectStatus as string | null | undefined) ?? null;
      } catch {
        projectStatus = null;
      }
    }
    return toRemote(data, input.providerProjectId, ctx.mappings, projectStatus);
  },
  async archiveTask(ctx, providerId, providerProjectId) {
    return this.updateTask(ctx, providerId, { providerProjectId, operationId: providerId, status: "done" });
  },
  async listComments(ctx, query) {
    const page = query.cursor ?? "1";
    const { data, response } = await gh<GhComment[]>(
      `https://api.github.com/repos/${repo(query.providerProjectId)}/issues/${encodeURIComponent(query.providerTaskId)}/comments?per_page=50&page=${encodeURIComponent(page)}`,
      ctx.credentials.accessToken,
    );
    const link = nextLink(response.headers.get("link"));
    return {
      items: data.map((comment) => ({
        providerId: String(comment.id),
        body: comment.body ?? "",
        authorLabel: comment.user?.login ?? "Unknown",
        authorProviderId: comment.user ? String(comment.user.id) : null,
        createdAt: comment.created_at,
        url: comment.html_url,
      })),
      nextCursor: link ? new URL(link).searchParams.get("page") : null,
    };
  },
  async createComment(ctx, input) {
    const body = input.body.trim();
    if (!body) throw new ProviderError("Comment cannot be empty", "validation", false);
    const { data } = await gh<GhComment>(
      `https://api.github.com/repos/${repo(input.providerProjectId)}/issues/${encodeURIComponent(input.providerTaskId)}/comments`,
      ctx.credentials.accessToken,
      { method: "POST", body: JSON.stringify({ body }) },
    );
    return {
      providerId: String(data.id),
      body: data.body ?? body,
      authorLabel: data.user?.login ?? "Unknown",
      authorProviderId: data.user ? String(data.user.id) : null,
      createdAt: data.created_at,
      url: data.html_url,
    };
  },
  async verifyWebhook(ctx, request) {
    const secret = ctx.credentials.webhookSecret;
    if (!secret) return false;
    const signature = request.headers["x-hub-signature-256"] ?? "";
    return verifyHmacSha256(secret, request.rawBody, signature);
  },
  async parseWebhook(ctx, request) {
    const event = request.headers["x-github-event"] ?? "";
    const body = JSON.parse(request.rawBody) as {
      action?: string;
      repository?: { full_name?: string };
      issue?: GhIssue;
      pull_request?: { id: number; number: number; title: string; html_url: string; state: string };
      projects_v2_item?: {
        node_id?: string;
        content_node_id?: string;
        content_type?: string;
        project_node_id?: string;
      };
    };
    const projectId = body.repository?.full_name ?? null;
    if (event === "issues" && body.issue && projectId) {
      if (body.action === "deleted") {
        return { events: [{ kind: "task.delete", providerId: String(body.issue.number), providerProjectId: projectId }] };
      }
      const task = await enrichWithProjectStatus(
        ctx.credentials.accessToken,
        projectId,
        body.issue,
        ctx.mappings,
      );
      return { events: [{ kind: "task.upsert", task }] };
    }
    if (event === "projects_v2_item" && body.projects_v2_item?.content_type === "Issue") {
      const contentId = body.projects_v2_item.content_node_id;
      if (!contentId) return { events: [] };
      try {
        const issue = await resolveIssueFromNodeId(ctx.credentials.accessToken, contentId);
        if (!issue) return { events: [] };
        const configured = ctx.mappings.githubProjectNodeId?.trim();
        if (configured === GITHUB_BOARD_NONE) return { events: [] };
        if (configured && body.projects_v2_item.project_node_id && configured !== body.projects_v2_item.project_node_id) {
          return { events: [] };
        }
        const ghIssue: GhIssue = {
          id: 0,
          node_id: issue.nodeId,
          number: issue.number,
          title: issue.title,
          body: issue.body,
          state: issue.state,
          html_url: issue.url,
          updated_at: issue.updatedAt,
          labels: issue.labels.map((name) => ({ name })),
          assignee: issue.assignee ? { login: issue.assignee } : null,
        };
        const task = await enrichWithProjectStatus(
          ctx.credentials.accessToken,
          issue.providerProjectId,
          ghIssue,
          {
            ...ctx.mappings,
            githubProjectNodeId: body.projects_v2_item.project_node_id ?? ctx.mappings.githubProjectNodeId,
          },
        );
        return { events: [{ kind: "task.upsert", task }] };
      } catch {
        return { events: [] };
      }
    }
    if (event === "pull_request" && body.pull_request && projectId) {
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
