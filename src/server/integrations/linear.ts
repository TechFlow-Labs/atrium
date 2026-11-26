import { verifyHmacSha256 } from "../crypto/secrets";
import { providerFetch } from "./http";
import { mapPriorityFromProvider, mapPriorityToProvider, mapStatusFromProvider, mapStatusToProvider } from "./mappings";
import {
  operationMarker,
  ProviderError,
  type FieldMappings,
  type IntegrationAdapter,
  type RemoteTask,
  type TaskPriority,
  type TaskStatus,
} from "./types";

const ENDPOINT = "https://api.linear.app/graphql";

type IssueNode = {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  url: string;
  priority: number;
  dueDate?: string | null;
  updatedAt: string;
  archivedAt?: string | null;
  state?: { id: string; name: string; type: string } | null;
  assignee?: { id: string; name: string } | null;
  team?: { id: string } | null;
};

const CAPABILITIES = {
  createTask: true,
  updateTask: true,
  archiveTask: true,
  webhooks: true,
  comments: true,
  fields: { title: true, description: true, status: true, priority: true, assignee: true, dueDate: true },
};

type CommentNode = {
  id: string;
  body: string;
  createdAt: string;
  url?: string | null;
  user?: { id: string; name: string } | null;
};

const COMMENT_FIELDS = `id body createdAt url user { id name }`;

function defaultMappings(): FieldMappings {
  return {
    status: { open: "unstarted", todo: "unstarted", in_progress: "started", blocked: "started", done: "completed", cancelled: "canceled" },
    priority: { none: "0", low: "4", medium: "3", high: "2", urgent: "1" },
    assignees: {},
  };
}

export function normalizeLinearToken(token: string): string {
  return token.trim().replace(/^Bearer\s+/i, "");
}

export function linearAuthorization(token: string): string {
  const value = normalizeLinearToken(token);
  if (value.startsWith("lin_api_")) return value;
  return `Bearer ${value}`;
}

async function gql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await providerFetch(ENDPOINT, {
    method: "POST",
    headers: { authorization: linearAuthorization(token), "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (body.errors?.length) {
    throw new ProviderError(body.errors.map((error) => error.message).join("; "), "validation", false);
  }
  if (!body.data) throw new ProviderError("Linear returned an empty response", "unavailable", true);
  return body.data;
}

function toRemote(node: IssueNode, mappings: FieldMappings): RemoteTask {
  const status = mapStatusFromProvider(mappings, node.state?.type ?? node.state?.name ?? "unstarted");
  return {
    providerId: node.id,
    providerProjectId: node.team?.id ?? "",
    title: node.title,
    description: node.description ?? "",
    status,
    priority: mapPriorityFromProvider(mappings, node.priority),
    dueAt: node.dueDate ? new Date(node.dueDate).toISOString() : null,
    assigneeProviderId: node.assignee?.id ?? null,
    assigneeLabel: node.assignee?.name ?? null,
    url: node.url,
    updatedAt: node.updatedAt,
    archived: Boolean(node.archivedAt),
    raw: { identifier: node.identifier, state: node.state?.name ?? null },
  };
}

const ISSUE_FIELDS = `
  id identifier title description url priority dueDate updatedAt archivedAt
  state { id name type } assignee { id name } team { id }
`;

export const linearAdapter: IntegrationAdapter = {
  provider: "linear",
  defaultMappings,
  getCapabilities: () => CAPABILITIES,
  async validateConnection(ctx) {
    const data = await gql<{ viewer: { id: string; name: string } }>(
      ctx.credentials.accessToken,
      `query { viewer { id name } }`,
      {},
    );
    return { accountLabel: data.viewer.name, externalAccountId: data.viewer.id };
  },
  async listProjects(ctx, cursor) {
    const data = await gql<{
      teams: { nodes: Array<{ id: string; name: string; key: string }>; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
    }>(
      ctx.credentials.accessToken,
      `query($after: String) { teams(first: 50, after: $after) { nodes { id name key } pageInfo { hasNextPage endCursor } } }`,
      { after: cursor ?? null },
    );
    return {
      items: data.teams.nodes.map((team) => ({
        providerId: team.id,
        key: team.key,
        name: team.name,
        url: `https://linear.app/team/${team.key}`,
      })),
      nextCursor: data.teams.pageInfo.hasNextPage ? data.teams.pageInfo.endCursor : null,
    };
  },
  async listTasks(ctx, query) {
    const data = await gql<{
      issues: { nodes: IssueNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
    }>(
      ctx.credentials.accessToken,
      `query($after: String, $team: ID!) {
        issues(first: 50, after: $after, filter: { team: { id: { eq: $team } } }) {
          nodes { ${ISSUE_FIELDS} }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after: query.cursor ?? null, team: query.providerProjectId },
    );
    return {
      items: data.issues.nodes.map((node) => toRemote(node, ctx.mappings)),
      nextCursor: data.issues.pageInfo.hasNextPage ? data.issues.pageInfo.endCursor : null,
    };
  },
  async getTask(ctx, providerId) {
    const data = await gql<{ issue: IssueNode | null }>(
      ctx.credentials.accessToken,
      `query($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`,
      { id: providerId },
    );
    if (!data.issue) throw new ProviderError("Linear issue was not found", "not_found", false, 404);
    return toRemote(data.issue, ctx.mappings);
  },
  async createTask(ctx, input) {
    const marker = operationMarker(input.operationId);
    const existing = await gql<{ issues: { nodes: IssueNode[] } }>(
      ctx.credentials.accessToken,
      `query($term: String!, $team: ID!) {
        issues(first: 5, filter: { team: { id: { eq: $team } }, description: { contains: $term } }) { nodes { ${ISSUE_FIELDS} } }
      }`,
      { term: marker, team: input.providerProjectId },
    );
    const replay = existing.issues.nodes[0];
    if (replay) return toRemote(replay, ctx.mappings);
    const description = `${input.description ?? ""}\n\n${marker}`.trim();
    const stateId = linearStateId(mapStatusToProvider(ctx.mappings, input.status ?? "open"));
    const data = await gql<{ issueCreate: { success: boolean; issue: IssueNode | null } }>(
      ctx.credentials.accessToken,
      `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { ${ISSUE_FIELDS} } } }`,
      {
        input: {
          teamId: input.providerProjectId,
          title: input.title,
          description,
          priority: Number(mapPriorityToProvider(ctx.mappings, input.priority ?? "none")),
          dueDate: input.dueAt ? input.dueAt.slice(0, 10) : undefined,
          assigneeId: input.assigneeProviderId ?? undefined,
          stateId,
        },
      },
    );
    if (!data.issueCreate.issue) throw new ProviderError("Linear did not return the created issue", "unavailable", true);
    return toRemote(data.issueCreate.issue, ctx.mappings);
  },
  async updateTask(ctx, providerId, input) {
    const patch: Record<string, unknown> = {};
    if (input.title) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.priority) patch.priority = Number(mapPriorityToProvider(ctx.mappings, input.priority));
    if (input.dueAt !== undefined) patch.dueDate = input.dueAt ? input.dueAt.slice(0, 10) : null;
    if (input.assigneeProviderId !== undefined) patch.assigneeId = input.assigneeProviderId;
    if (input.status) {
      const stateId = linearStateId(mapStatusToProvider(ctx.mappings, input.status));
      if (!stateId) {
        throw new ProviderError(
          "Map this status to a Linear state id before changing it",
          "unsupported",
          false,
        );
      }
      patch.stateId = stateId;
    }
    const data = await gql<{ issueUpdate: { success: boolean; issue: IssueNode | null } }>(
      ctx.credentials.accessToken,
      `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { ${ISSUE_FIELDS} } } }`,
      { id: providerId, input: patch },
    );
    if (!data.issueUpdate.issue) throw new ProviderError("Linear did not return the updated issue", "unavailable", true);
    return toRemote(data.issueUpdate.issue, ctx.mappings);
  },
  async archiveTask(ctx, providerId) {
    const data = await gql<{ issueArchive: { success: boolean } }>(
      ctx.credentials.accessToken,
      `mutation($id: String!) { issueArchive(id: $id) { success } }`,
      { id: providerId },
    );
    if (!data.issueArchive.success) throw new ProviderError("Linear could not archive the issue", "unavailable", true);
    const task = await this.getTask(ctx, providerId, "");
    return { ...task, archived: true, status: "cancelled" as TaskStatus };
  },
  async listComments(ctx, query) {
    const data = await gql<{
      issue: { comments: { nodes: CommentNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } | null;
    }>(
      ctx.credentials.accessToken,
      `query($id: String!, $after: String) {
        issue(id: $id) {
          comments(first: 50, after: $after) {
            nodes { ${COMMENT_FIELDS} }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { id: query.providerTaskId, after: query.cursor ?? null },
    );
    if (!data.issue) throw new ProviderError("Linear issue was not found", "not_found", false, 404);
    return {
      items: data.issue.comments.nodes.map((node) => ({
        providerId: node.id,
        body: node.body,
        authorLabel: node.user?.name ?? "Unknown",
        authorProviderId: node.user?.id ?? null,
        createdAt: node.createdAt,
        url: node.url ?? null,
      })),
      nextCursor: data.issue.comments.pageInfo.hasNextPage ? data.issue.comments.pageInfo.endCursor : null,
    };
  },
  async createComment(ctx, input) {
    const body = input.body.trim();
    if (!body) throw new ProviderError("Comment cannot be empty", "validation", false);
    const data = await gql<{ commentCreate: { success: boolean; comment: CommentNode | null } }>(
      ctx.credentials.accessToken,
      `mutation($input: CommentCreateInput!) {
        commentCreate(input: $input) { success comment { ${COMMENT_FIELDS} } }
      }`,
      { input: { issueId: input.providerTaskId, body } },
    );
    if (!data.commentCreate.comment) {
      throw new ProviderError("Linear did not return the created comment", "unavailable", true);
    }
    const node = data.commentCreate.comment;
    return {
      providerId: node.id,
      body: node.body,
      authorLabel: node.user?.name ?? "Unknown",
      authorProviderId: node.user?.id ?? null,
      createdAt: node.createdAt,
      url: node.url ?? null,
    };
  },
  async verifyWebhook(ctx, request) {
    const secret = ctx.credentials.webhookSecret;
    if (!secret) return false;
    const signature = request.headers["linear-signature"] ?? "";
    return verifyHmacSha256(secret, request.rawBody, signature);
  },
  async parseWebhook(ctx, request) {
    const body = JSON.parse(request.rawBody) as {
      action?: string;
      type?: string;
      data?: IssueNode & { teamId?: string };
    };
    if (body.type !== "Issue" || !body.data?.id) return { events: [] };
    if (body.action === "remove") {
      return {
        events: [{ kind: "task.delete", providerId: body.data.id, providerProjectId: body.data.teamId ?? body.data.team?.id ?? null }],
      };
    }
    const node = { ...body.data, team: body.data.team ?? (body.data.teamId ? { id: body.data.teamId } : null) };
    return { events: [{ kind: "task.upsert", task: toRemote(node, ctx.mappings) }] };
  },
};

export function linearPriority(priority: TaskPriority): number {
  return Number(mapPriorityToProvider(defaultMappings(), priority));
}

function linearStateId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}
