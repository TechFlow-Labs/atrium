import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { verifyHmacSha256 } from "../crypto/secrets";
import { fakeProviderComments, fakeProviderProjects, fakeProviderTasks } from "../db/schema";
import { mapPriorityFromProvider, mapPriorityToProvider, mapStatusFromProvider, mapStatusToProvider } from "./mappings";
import {
  operationMarker,
  ProviderError,
  type AdapterContext,
  type FieldMappings,
  type IntegrationAdapter,
  type Page,
  type ParsedWebhook,
  type RemoteComment,
  type RemoteProject,
  type RemoteTask,
  type TaskWrite,
} from "./types";

const CAPABILITIES = {
  createTask: true,
  updateTask: true,
  archiveTask: true,
  webhooks: true,
  comments: true,
  fields: { title: true, description: true, status: true, priority: true, assignee: true, dueDate: true },
};

function defaultMappings(): FieldMappings {
  return {
    status: { open: "open", todo: "open", in_progress: "in_progress", blocked: "blocked", done: "done", cancelled: "cancelled" },
    priority: { none: "none", low: "low", medium: "medium", high: "high", urgent: "urgent" },
    assignees: {},
  };
}

function toRemote(row: typeof fakeProviderTasks.$inferSelect, mappings: FieldMappings): RemoteTask {
  return {
    providerId: row.id,
    providerProjectId: row.providerProjectId,
    title: row.title,
    description: row.description,
    status: mapStatusFromProvider(mappings, row.status),
    priority: mapPriorityFromProvider(mappings, row.priority),
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    assigneeProviderId: row.assigneeProviderId,
    assigneeLabel: row.assigneeProviderId,
    url: `https://fake.invalid/issues/${row.id}`,
    updatedAt: row.updatedAt.toISOString(),
    archived: row.archived,
    raw: (row.raw ?? {}) as Record<string, unknown>,
  };
}

async function findByOperation(ctx: AdapterContext, operationId: string): Promise<RemoteTask | null> {
  const rows = await ctx.tx.select().from(fakeProviderTasks).where(eq(fakeProviderTasks.integrationId, ctx.integrationId));
  const match = rows.find((row) => {
    const raw = row.raw as { operationId?: string };
    return raw.operationId === operationId || row.description.includes(operationMarker(operationId));
  });
  return match ? toRemote(match, ctx.mappings) : null;
}

export const fakeAdapter: IntegrationAdapter = {
  provider: "fake",
  defaultMappings,
  getCapabilities: () => CAPABILITIES,
  async validateConnection(ctx) {
    if (process.env.ALLOW_FAKE_PROVIDER !== "true") {
      throw new Error("The fake provider is disabled");
    }
    if (!ctx.credentials.accessToken) throw new Error("A credential is required");
    return { accountLabel: ctx.credentials.accountLabel ?? "Fake workspace", externalAccountId: "fake-account" };
  },
  async listProjects(ctx, cursor) {
    const offset = Number(cursor ?? "0") || 0;
    const rows = await ctx.tx
      .select()
      .from(fakeProviderProjects)
      .where(eq(fakeProviderProjects.integrationId, ctx.integrationId));
    const page = rows.slice(offset, offset + 50);
    const next = offset + 50 < rows.length ? String(offset + 50) : null;
    return {
      items: page.map((row) => ({
        providerId: row.providerProjectId,
        key: row.key,
        name: row.name,
        url: row.url,
      })),
      nextCursor: next,
    } satisfies Page<RemoteProject>;
  },
  async listTasks(ctx, query) {
    const offset = Number(query.cursor ?? "0") || 0;
    const rows = await ctx.tx
      .select()
      .from(fakeProviderTasks)
      .where(
        and(
          eq(fakeProviderTasks.integrationId, ctx.integrationId),
          eq(fakeProviderTasks.providerProjectId, query.providerProjectId),
        ),
      );
    const page = rows.slice(offset, offset + 50);
    return {
      items: page.map((row) => toRemote(row, ctx.mappings)),
      nextCursor: offset + 50 < rows.length ? String(offset + 50) : null,
    };
  },
  async getTask(ctx, providerId) {
    const rows = await ctx.tx
      .select()
      .from(fakeProviderTasks)
      .where(and(eq(fakeProviderTasks.id, providerId), eq(fakeProviderTasks.integrationId, ctx.integrationId)));
    const row = rows[0];
    if (!row) throw new Error("Fake task was not found");
    return toRemote(row, ctx.mappings);
  },
  async createTask(ctx, input) {
    const existing = await findByOperation(ctx, input.operationId);
    if (existing) return existing;
    const id = `fake_${randomUUID()}`;
    const description = `${input.description ?? ""}\n\n${operationMarker(input.operationId)}`.trim();
    await ctx.tx.insert(fakeProviderTasks).values({
      id,
      integrationId: ctx.integrationId,
      providerProjectId: input.providerProjectId,
      title: input.title,
      description,
      status: mapStatusToProvider(ctx.mappings, input.status ?? "open"),
      priority: mapPriorityToProvider(ctx.mappings, input.priority ?? "none"),
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      assigneeProviderId: input.assigneeProviderId ?? null,
      raw: { operationId: input.operationId },
    });
    return this.getTask(ctx, id, input.providerProjectId);
  },
  async updateTask(ctx, providerId, input) {
    const current = await this.getTask(ctx, providerId, input.providerProjectId);
    await ctx.tx
      .update(fakeProviderTasks)
      .set({
        title: input.title ?? current.title,
        description: input.description ?? current.description,
        status: input.status ? mapStatusToProvider(ctx.mappings, input.status) : mapStatusToProvider(ctx.mappings, current.status),
        priority: input.priority
          ? mapPriorityToProvider(ctx.mappings, input.priority)
          : mapPriorityToProvider(ctx.mappings, current.priority),
        dueAt: input.dueAt === undefined ? (current.dueAt ? new Date(current.dueAt) : null) : input.dueAt ? new Date(input.dueAt) : null,
        assigneeProviderId: input.assigneeProviderId === undefined ? current.assigneeProviderId : input.assigneeProviderId,
        updatedAt: new Date(),
      })
      .where(and(eq(fakeProviderTasks.id, providerId), eq(fakeProviderTasks.integrationId, ctx.integrationId)));
    return this.getTask(ctx, providerId, input.providerProjectId);
  },
  async archiveTask(ctx, providerId, providerProjectId) {
    await ctx.tx
      .update(fakeProviderTasks)
      .set({ archived: true, status: "cancelled", updatedAt: new Date() })
      .where(and(eq(fakeProviderTasks.id, providerId), eq(fakeProviderTasks.integrationId, ctx.integrationId)));
    return this.getTask(ctx, providerId, providerProjectId);
  },
  async listComments(ctx, query) {
    const offset = Number(query.cursor ?? "0") || 0;
    const rows = await ctx.tx
      .select()
      .from(fakeProviderComments)
      .where(
        and(
          eq(fakeProviderComments.integrationId, ctx.integrationId),
          eq(fakeProviderComments.providerTaskId, query.providerTaskId),
        ),
      );
    const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const page = sorted.slice(offset, offset + 50);
    return {
      items: page.map(
        (row): RemoteComment => ({
          providerId: row.id,
          body: row.body,
          authorLabel: row.authorLabel,
          authorProviderId: row.authorProviderId,
          createdAt: row.createdAt.toISOString(),
          url: null,
        }),
      ),
      nextCursor: offset + 50 < sorted.length ? String(offset + 50) : null,
    };
  },
  async createComment(ctx, input) {
    const body = input.body.trim();
    if (!body) throw new ProviderError("Comment cannot be empty", "validation", false);
    const id = `fake_cmt_${randomUUID()}`;
    const authorLabel = ctx.credentials.accountLabel ?? "Fake user";
    await ctx.tx.insert(fakeProviderComments).values({
      id,
      integrationId: ctx.integrationId,
      providerProjectId: input.providerProjectId,
      providerTaskId: input.providerTaskId,
      body,
      authorLabel,
      authorProviderId: "fake-account",
    });
    return {
      providerId: id,
      body,
      authorLabel,
      authorProviderId: "fake-account",
      createdAt: new Date().toISOString(),
      url: null,
    };
  },
  async verifyWebhook(ctx, request) {
    const secret = ctx.credentials.webhookSecret;
    if (!secret) return false;
    const signature = request.headers["x-fake-signature"] ?? "";
    return verifyHmacSha256(secret, request.rawBody, signature);
  },
  async parseWebhook(_ctx, request) {
    const body = JSON.parse(request.rawBody) as {
      action?: string;
      task?: RemoteTask;
      providerId?: string;
      providerProjectId?: string | null;
    };
    const events: ParsedWebhook["events"] = [];
    if (body.action === "delete" && body.providerId) {
      events.push({
        kind: "task.delete",
        providerId: body.providerId,
        providerProjectId: body.providerProjectId ?? null,
      });
    } else if (body.task) {
      events.push({ kind: "task.upsert", task: body.task });
    }
    return { events };
  },
};

export async function seedFakeProject(
  ctx: AdapterContext,
  project: { providerProjectId: string; name: string; key?: string },
): Promise<void> {
  await ctx.tx.insert(fakeProviderProjects).values({
    integrationId: ctx.integrationId,
    providerProjectId: project.providerProjectId,
    name: project.name,
    key: project.key ?? null,
    url: `https://fake.invalid/projects/${project.providerProjectId}`,
  });
}

export type { TaskWrite };
