import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { writeAudit } from "../audit";
import { requireAction } from "../authz/membership";
import { withUser, type Tx } from "../db/client";
import { textArray } from "../db/sql";
import { areDevMocksVisible, sqlDevMockProjectVisible } from "../dev/mock-data";
import { issueType } from "@/lib/issue-kinds";
import { projectIssueLabels } from "@/lib/project-display";
import { getAdapter } from "../integrations/registry";
import type { ProviderId, TaskPriority, TaskStatus } from "../integrations/types";
import type { CanonicalField } from "../sync/fingerprint";

const TASK_PROVIDER_SOURCES = new Set(["linear", "jira", "github", "gitlab", "gitea", "fake"]);

function parseFilterList(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return [...new Set(raw.split(",").map((part) => part.trim()).filter(Boolean))];
}

export type TaskRecord = {
  id: string;
  workspace_id: string;
  project_id: string;
  /** Display label: nickname, GitHub Project board title, or project name. */
  project_name: string;
  /** Repo / codebase when distinct from the board/nickname label. */
  codebase_label: string | null;
  ownership_mode: "native" | "external" | "hybrid";
  milestone_id: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: Date | null;
  assignee_user_id: string | null;
  assignee_label: string | null;
  provider: ProviderId | null;
  external_url: string | null;
  sync_state: "pending" | "synced" | "error" | "tombstone";
  sync_error: string | null;
  version: number;
  deleted_at: Date | null;
  updated_at: Date;
  parent_task_id: string | null;
  issue_category: string | null;
  issue_type: string | null;
};

type TaskRow = Omit<TaskRecord, "project_name" | "codebase_label"> & {
  project_raw_name: string;
  project_nickname: string | null;
  provider_project_id: string | null;
  provider_project_name: string | null;
  github_project_title: string | null;
  github_board_disabled: boolean;
  connection_provider: ProviderId | null;
};

function toTaskRecord(row: TaskRow): TaskRecord {
  const labels = projectIssueLabels({
    name: row.project_raw_name,
    nickname: row.project_nickname,
    provider: row.connection_provider ?? row.provider,
    provider_project_id: row.provider_project_id,
    provider_project_name: row.provider_project_name,
    github_project_title: row.github_project_title,
    github_board_disabled: row.github_board_disabled,
  });
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    project_id: row.project_id,
    project_name: labels.primary,
    codebase_label: labels.codebase,
    ownership_mode: row.ownership_mode,
    milestone_id: row.milestone_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    due_at: row.due_at,
    assignee_user_id: row.assignee_user_id,
    assignee_label: row.assignee_label,
    provider: row.provider,
    external_url: row.external_url,
    sync_state: row.sync_state,
    sync_error: row.sync_error,
    version: row.version,
    deleted_at: row.deleted_at,
    updated_at: row.updated_at,
    parent_task_id: row.parent_task_id,
    issue_category: row.issue_category,
    issue_type: row.issue_type,
  };
}

const TASK_PROJECT_SELECT = sql`
  t.id, t.workspace_id, t.project_id,
  p.name as project_raw_name,
  p.nickname as project_nickname,
  p.ownership_mode,
  t.milestone_id, t.parent_task_id, t.issue_category, t.issue_type,
  t.title, t.description, t.status, t.priority, t.due_at,
  t.assignee_user_id, coalesce(u.name, t.assignee_label) as assignee_label,
  t.provider, t.external_url, t.sync_state, t.sync_error, t.version, t.deleted_at, t.updated_at,
  c.provider_project_id,
  c.provider_project_name,
  nullif(c.field_mappings->>'githubProjectTitle', '') as github_project_title,
  coalesce(c.field_mappings->>'githubProjectNodeId' = 'none', false) as github_board_disabled,
  i.provider as connection_provider
`;

export type TaskInput = {
  projectId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: string | null;
  assigneeUserId?: string | null;
  milestoneId?: string | null;
  issueCategory?: string | null;
  issueType?: string | null;
};

const STATUSES = new Set(["open", "in_progress", "blocked", "done", "cancelled"]);
const PRIORITIES = new Set(["none", "low", "medium", "high", "urgent"]);

function assertStatus(value: string): asserts value is TaskStatus {
  if (!STATUSES.has(value)) throw new Error("Status must be open, in progress, blocked, done, or cancelled");
}
function assertPriority(value: string): asserts value is TaskPriority {
  if (!PRIORITIES.has(value)) throw new Error("Priority must be none, low, medium, high, or urgent");
}

type ConnectionRow = {
  id: string;
  integration_id: string;
  provider_project_id: string;
  publish_outbound: boolean;
  field_mappings: unknown;
  provider: ProviderId;
  status: string;
  credential_ciphertext: string | null;
};

async function loadConnection(tx: Tx, projectId: string): Promise<ConnectionRow | null> {
  const rows = await tx.execute<ConnectionRow>(sql`
    select c.id, c.integration_id, c.provider_project_id, c.publish_outbound, c.field_mappings,
           i.provider, i.status, i.credential_ciphertext
    from project_connections c
    join integrations i on i.id = c.integration_id
    where c.project_id = ${projectId}::uuid
  `);
  return rows[0] ?? null;
}

function assertSupported(
  provider: ProviderId,
  fields: CanonicalField[],
): void {
  const caps = getAdapter(provider).getCapabilities();
  const unsupported = fields.filter((field) => {
    if (field === "title") return !caps.fields.title;
    if (field === "description") return !caps.fields.description;
    if (field === "status") return !caps.fields.status;
    if (field === "priority") return !caps.fields.priority;
    if (field === "dueAt") return !caps.fields.dueDate;
    if (field === "assignee") return !caps.fields.assignee;
    return false;
  });
  if (unsupported.length > 0) {
    throw new Error(`${provider} does not support ${unsupported.join(", ")}. The change was not saved.`);
  }
}

async function enqueueOutbox(
  tx: Tx,
  input: {
    workspaceId: string;
    integrationId: string;
    taskId: string;
    projectId: string;
    connectionId: string;
    providerProjectId: string;
    kind: "create" | "update" | "archive";
    touched: CanonicalField[];
    providerTaskId?: string | null;
  },
): Promise<void> {
  const operationId = randomUUID();
  const task = await tx.execute<{
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    due_at: Date | null;
    assignee_provider_id: string | null;
  }>(sql`
    select title, description, status, priority, due_at, assignee_provider_id
    from tasks where id = ${input.taskId}::uuid
  `);
  const current = task[0];
  if (!current) throw new Error("Task not found");
  const payload = {
    taskId: input.taskId,
    projectId: input.projectId,
    connectionId: input.connectionId,
    providerProjectId: input.providerProjectId,
    providerTaskId: input.providerTaskId ?? null,
    kind: input.kind,
    touched: input.touched,
    fields: {
      title: current.title,
      description: current.description,
      status: current.status,
      priority: current.priority,
      dueAt: current.due_at ? new Date(current.due_at).toISOString() : null,
      assigneeProviderId: current.assignee_provider_id,
    },
  };
  await tx.execute(sql`
    insert into outbox_events (
      workspace_id, integration_id, operation_id, type, payload, status
    ) values (
      ${input.workspaceId}::uuid,
      ${input.integrationId}::uuid,
      ${operationId},
      ${"task." + input.kind},
      ${JSON.stringify(payload)}::jsonb,
      'pending'
    )
  `);
  await tx.execute(sql`
    insert into sync_events (
      workspace_id, integration_id, direction, entity_type, operation_id, status, payload
    ) values (
      ${input.workspaceId}::uuid,
      ${input.integrationId}::uuid,
      'outbound',
      'issue',
      ${operationId},
      'pending',
      ${JSON.stringify({ taskId: input.taskId, kind: input.kind, touched: input.touched })}::jsonb
    )
  `);
}

export async function getTask(
  userId: string,
  taskId: string,
): Promise<TaskRecord | null> {
  return withUser(userId, async (tx) => {
    // RLS scopes rows to workspaces the caller can access.
    const rows = await tx.execute<TaskRow>(sql`
      select ${TASK_PROJECT_SELECT}
      from tasks t
      join projects p on p.id = t.project_id
      left join project_connections c on c.project_id = p.id
      left join integrations i on i.id = c.integration_id
      left join "user" u on u.id = t.assignee_user_id
      where t.id = ${taskId}::uuid
        and t.deleted_at is null
      limit 1
    `);
    const task = rows[0];
    if (!task) return null;
    await requireAction(tx, task.workspace_id, "task.read");
    return toTaskRecord(task);
  });
}

export type ChildTask = {
  id: string;
  title: string;
  status: TaskStatus;
  version: number;
};

export async function listChildTasks(userId: string, taskId: string): Promise<ChildTask[]> {
  return withUser(userId, async (tx) => {
    const rows = await tx.execute<ChildTask & {
      issue_category: string | null;
      issue_type: string | null;
      workspace_id: string;
    }>(sql`
      select c.id, c.title, c.status, c.version, p.issue_category, p.issue_type, p.workspace_id
      from tasks c
      join tasks p on p.id = c.parent_task_id
      where c.parent_task_id = ${taskId}::uuid
        and c.deleted_at is null
      order by c.created_at asc
    `);
    const first = rows[0];
    if (!first) return [];
    await requireAction(tx, first.workspace_id, "task.read");
    const order = (issueType(first.issue_category, first.issue_type)?.subtasks ?? []).map(
      (subtask) => subtask.title,
    );
    return [...rows].sort((a, b) => {
      const ai = order.indexOf(a.title);
      const bi = order.indexOf(b.title);
      if (ai === -1 && bi === -1) return a.title.localeCompare(b.title);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  });
}

export async function listTasks(
  userId: string,
  workspaceId: string,
  filter: {
    projectId?: string;
    productId?: string;
    status?: string;
    priority?: string;
    source?: string;
    assignee?: string;
    query?: string;
    includeDeleted?: boolean;
    dueBefore?: string;
    dueAfter?: string;
  } = {},
): Promise<TaskRecord[]> {
  const showMocks = await areDevMocksVisible();
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");
    const query = filter.query?.trim() ?? "";
    const dueBefore = filter.dueBefore?.trim() || null;
    const dueAfter = filter.dueAfter?.trim() || null;
    const statuses = parseFilterList(filter.status);
    const priorities = [
      ...new Set(
        parseFilterList(filter.priority).flatMap((priority) =>
          priority === "attention" ? (["urgent", "high"] as const) : [priority],
        ),
      ),
    ];
    // Prefer explicit multi project list; keep single projectId for callers that still pass it alone.
    const projectIds = parseFilterList(filter.projectId);
    const productIds = parseFilterList(filter.productId);
    const sources = parseFilterList(filter.source);
    const assigneeKeys = parseFilterList(filter.assignee);
    const wantUnassigned = assigneeKeys.includes("unassigned");
    const assigneeMatches = assigneeKeys.filter((key) => key !== "unassigned");
    const wantAtrium = sources.some((source) => source === "atrium" || source === "native");
    const providerSources = sources.filter((source) => TASK_PROVIDER_SOURCES.has(source));
    const statusFilter = textArray(statuses);
    const priorityFilter = textArray(priorities);
    const projectFilter = textArray(projectIds);
    const productFilter = textArray(productIds);
    const providerFilter = textArray(providerSources);
    const assigneeFilter = textArray(assigneeMatches);
    const assigneeFilterLower = textArray(assigneeMatches.map((key) => key.toLowerCase()));
    const rows = await tx.execute<TaskRow>(sql`
      select ${TASK_PROJECT_SELECT}
      from tasks t
      join projects p on p.id = t.project_id
      left join project_connections c on c.project_id = p.id
      left join integrations i on i.id = c.integration_id
      left join "user" u on u.id = t.assignee_user_id
      where t.workspace_id = ${workspaceId}::uuid
        and t.parent_task_id is null
        and (${filter.includeDeleted ?? false} or t.deleted_at is null)
        and (
          cardinality(${productFilter}) = 0
          or p.product_id = any(${productFilter}::uuid[])
        )
        and (
          cardinality(${projectFilter}) = 0
          or t.project_id = any(${projectFilter}::uuid[])
        )
        and (
          cardinality(${statusFilter}) = 0
          or t.status = any(${statusFilter})
        )
        and (
          cardinality(${priorityFilter}) = 0
          or t.priority = any(${priorityFilter})
        )
        and (
          ${assigneeKeys.length === 0}
          or (
            (
              ${wantUnassigned}
              and t.assignee_user_id is null
              and nullif(t.assignee_provider_id, '') is null
              and nullif(t.assignee_label, '') is null
            )
            or (
              cardinality(${assigneeFilter}) > 0
              and (
                t.assignee_user_id = any(${assigneeFilter})
                or t.assignee_provider_id = any(${assigneeFilter})
                or lower(coalesce(t.assignee_label, '')) = any(${assigneeFilterLower})
              )
            )
          )
        )
        and (${query} = '' or t.title ilike ${"%" + query + "%"} or t.description ilike ${"%" + query + "%"})
        and (${dueBefore}::timestamptz is null or t.due_at <= ${dueBefore}::timestamptz)
        and (${dueAfter}::timestamptz is null or t.due_at >= ${dueAfter}::timestamptz)
        and (
          ${sources.length === 0}
          or (
            (${wantAtrium} and t.provider is null)
            or (
              cardinality(${providerFilter}) > 0
              and t.provider = any(${providerFilter})
            )
          )
        )
        and ${sqlDevMockProjectVisible(showMocks)}
      order by
        case t.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end,
        t.due_at nulls last,
        t.updated_at desc
      limit 300
    `);
    return rows.map(toTaskRecord);
  });
}

export type TaskAssigneeOption = {
  value: string;
  label: string;
};

/** Distinct assignees for the Issues filter (workspace users + provider labels). */
export async function listTaskAssignees(
  userId: string,
  workspaceId: string,
): Promise<TaskAssigneeOption[]> {
  const showMocks = await areDevMocksVisible();
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");
    const rows = await tx.execute<{ value: string; label: string }>(sql`
      select distinct on (lower(value))
        value,
        label
      from (
        select
          coalesce(nullif(t.assignee_user_id, ''), nullif(t.assignee_provider_id, ''), nullif(t.assignee_label, '')) as value,
          coalesce(nullif(u.name, ''), nullif(t.assignee_label, ''), nullif(t.assignee_provider_id, '')) as label
        from tasks t
        join projects p on p.id = t.project_id
        left join "user" u on u.id = t.assignee_user_id
        where t.workspace_id = ${workspaceId}::uuid
          and t.deleted_at is null
          and ${sqlDevMockProjectVisible(showMocks)}
          and (
            nullif(t.assignee_user_id, '') is not null
            or nullif(t.assignee_provider_id, '') is not null
            or nullif(t.assignee_label, '') is not null
          )
      ) assignees
      where value is not null and label is not null
      order by lower(value), label
    `);
    return rows
      .map((row) => ({ value: row.value, label: row.label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });
}

export async function createTask(userId: string, workspaceId: string, input: TaskInput): Promise<string> {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 200) throw new Error("Title must be between 1 and 200 characters");
  const status = input.status ?? "open";
  const priority = input.priority ?? "medium";
  assertStatus(status);
  assertPriority(priority);
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.write");
    const projects = await tx.execute<{ id: string; ownership_mode: string; status: string }>(sql`
      select id, ownership_mode, status from projects
      where id = ${input.projectId}::uuid and workspace_id = ${workspaceId}::uuid
    `);
    const project = projects[0];
    if (!project || project.status !== "active") throw new Error("Active project not found");
    if (project.ownership_mode === "hybrid") {
      throw new Error("Hybrid ownership is reserved and is not enabled");
    }
    const connection = await loadConnection(tx, project.id);
    if (project.ownership_mode === "external") {
      if (!connection || connection.status !== "connected" || !connection.credential_ciphertext) {
        throw new Error("Connect the provider before creating tasks on this project");
      }
      const caps = getAdapter(connection.provider).getCapabilities();
      if (!caps.createTask) throw new Error("This provider cannot create tasks from Atrium");
      assertSupported(connection.provider, ["title", "description", "status", "priority", "dueAt", "assignee"].filter((field) => {
        if (field === "description") return Boolean(input.description);
        if (field === "dueAt") return input.dueAt !== undefined;
        if (field === "assignee") return input.assigneeUserId !== undefined;
        return true;
      }) as CanonicalField[]);
    }
    const kind = issueType(input.issueCategory, input.issueType);
    if ((input.issueCategory || input.issueType) && !kind) {
      throw new Error("Choose an issue category and type");
    }
    const assigneeProvider = input.assigneeUserId
      ? ((connection?.field_mappings as { assignees?: Record<string, string> } | null)?.assignees?.[input.assigneeUserId] ?? null)
      : null;
    if (project.ownership_mode === "external" && input.assigneeUserId && !assigneeProvider) {
      const caps = getAdapter(connection!.provider).getCapabilities();
      if (caps.fields.assignee) {
        throw new Error("Map this member to a provider user before assigning them");
      }
    }
    const inserted = await tx.execute<{ id: string }>(sql`
      insert into tasks (
        workspace_id, project_id, milestone_id, parent_task_id, issue_category, issue_type,
        title, description, status, priority, due_at,
        assignee_user_id, assignee_provider_id, provider, sync_state, created_by
      ) values (
        ${workspaceId}::uuid,
        ${input.projectId}::uuid,
        ${input.milestoneId ?? null}::uuid,
        null,
        ${kind ? input.issueCategory ?? null : null},
        ${kind ? input.issueType ?? null : null},
        ${title},
        ${input.description?.trim() ?? ""},
        ${status},
        ${priority},
        ${input.dueAt ? new Date(input.dueAt).toISOString() : null},
        ${input.assigneeUserId ?? null},
        ${assigneeProvider},
        ${project.ownership_mode === "external" ? connection?.provider ?? null : null},
        ${project.ownership_mode === "external" || connection?.publish_outbound ? "pending" : "synced"},
        current_setting('app.current_user_id', true)
      )
      returning id
    `);
    const id = inserted[0]?.id;
    if (!id) throw new Error("Task was not created");
    if (project.ownership_mode === "external" && connection) {
      await enqueueOutbox(tx, {
        workspaceId,
        integrationId: connection.integration_id,
        taskId: id,
        projectId: project.id,
        connectionId: connection.id,
        providerProjectId: connection.provider_project_id,
        kind: "create",
        touched: ["title", "description", "status", "priority", "dueAt", "assignee"],
      });
    } else if (connection?.publish_outbound) {
      await enqueueOutbox(tx, {
        workspaceId,
        integrationId: connection.integration_id,
        taskId: id,
        projectId: project.id,
        connectionId: connection.id,
        providerProjectId: connection.provider_project_id,
        kind: "create",
        touched: ["title", "description", "status", "priority"],
      });
    }
    if (kind) {
      for (const subtask of kind.subtasks) {
        await tx.execute(sql`
          insert into tasks (
            workspace_id, project_id, parent_task_id, title, description, status, priority,
            provider, sync_state, created_by
          ) values (
            ${workspaceId}::uuid,
            ${input.projectId}::uuid,
            ${id}::uuid,
            ${subtask.title},
            ${subtask.description},
            'open',
            'low',
            null,
            'synced',
            current_setting('app.current_user_id', true)
          )
        `);
      }
    }
    await writeAudit(tx, { workspaceId, action: "task.created", entityType: "task", entityId: id, metadata: { projectId: project.id, issueCategory: input.issueCategory ?? null, issueType: input.issueType ?? null, subtasks: kind?.subtasks.length ?? 0 } });
    return id;
  });
}

export async function updateTask(
  userId: string,
  workspaceId: string,
  taskId: string,
  input: Partial<TaskInput> & { version: number },
): Promise<void> {
  if (input.title !== undefined && (input.title.trim().length < 1 || input.title.trim().length > 200)) {
    throw new Error("Title must be between 1 and 200 characters");
  }
  if (input.status) assertStatus(input.status);
  if (input.priority) assertPriority(input.priority);
  await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.write");
    const existing = await tx.execute<{
      id: string;
      project_id: string;
      ownership_mode: "native" | "external" | "hybrid";
      provider: ProviderId | null;
      version: number;
      provider_task_id: string | null;
      parent_task_id: string | null;
      issue_category: string | null;
      issue_type: string | null;
    }>(sql`
      select t.id, t.project_id, p.ownership_mode, t.provider, t.version, e.provider_id as provider_task_id,
        t.parent_task_id, t.issue_category, t.issue_type
      from tasks t
      join projects p on p.id = t.project_id
      left join external_records e on e.local_entity_id = t.id and e.entity_type = 'issue' and e.deleted_at is null
      where t.id = ${taskId}::uuid and t.workspace_id = ${workspaceId}::uuid and t.deleted_at is null
    `);
    const task = existing[0];
    if (!task) throw new Error("Task not found");
    if (task.ownership_mode === "hybrid") throw new Error("Hybrid ownership is reserved and is not enabled");
    if (task.parent_task_id && (input.issueCategory !== undefined || input.issueType !== undefined)) {
      throw new Error("Subtasks cannot have their own category");
    }
    const kindChanging = input.issueCategory !== undefined || input.issueType !== undefined;
    const nextCategory = kindChanging ? (input.issueCategory ?? null) : task.issue_category;
    const nextType = kindChanging ? (input.issueType ?? null) : task.issue_type;
    const kind = issueType(nextCategory, nextType);
    if (kindChanging && (nextCategory || nextType) && !kind) {
      throw new Error("Choose an issue category and type");
    }
    if (kindChanging && Boolean(nextCategory) !== Boolean(nextType)) {
      throw new Error("Choose an issue category and type");
    }
    const touched: CanonicalField[] = [];
    if (input.title !== undefined) touched.push("title");
    if (input.description !== undefined) touched.push("description");
    if (input.status !== undefined) touched.push("status");
    if (input.priority !== undefined) touched.push("priority");
    if (input.dueAt !== undefined) touched.push("dueAt");
    if (input.assigneeUserId !== undefined) touched.push("assignee");
    const connection = await loadConnection(tx, task.project_id);
    const pushes = !task.parent_task_id && (task.ownership_mode === "external" || Boolean(connection?.publish_outbound));
    if (pushes && connection) {
      assertSupported(connection.provider, touched);
      if (!connection.credential_ciphertext || connection.status !== "connected") {
        throw new Error("The provider is disconnected. Reconnect it before editing synchronized tasks.");
      }
    }
    let assigneeProvider: string | null | undefined;
    if (input.assigneeUserId !== undefined) {
      assigneeProvider = input.assigneeUserId
        ? ((connection?.field_mappings as { assignees?: Record<string, string> } | null)?.assignees?.[input.assigneeUserId] ?? null)
        : null;
      if (pushes && input.assigneeUserId && connection && !assigneeProvider && getAdapter(connection.provider).getCapabilities().fields.assignee) {
        throw new Error("Map this member to a provider user before assigning them");
      }
    }
    const updated = await tx.execute(sql`
      update tasks set
        title = coalesce(${input.title?.trim() ?? null}, title),
        description = coalesce(${input.description ?? null}, description),
        status = coalesce(${input.status ?? null}, status),
        priority = coalesce(${input.priority ?? null}, priority),
        due_at = case when ${input.dueAt !== undefined} then ${input.dueAt ? new Date(input.dueAt).toISOString() : null} else due_at end,
        assignee_user_id = case when ${input.assigneeUserId !== undefined} then ${input.assigneeUserId ?? null} else assignee_user_id end,
        assignee_provider_id = case when ${assigneeProvider !== undefined} then ${assigneeProvider ?? null} else assignee_provider_id end,
        milestone_id = case when ${input.milestoneId !== undefined} then ${input.milestoneId ?? null}::uuid else milestone_id end,
        issue_category = case when ${kindChanging} then ${kind ? nextCategory : null} else issue_category end,
        issue_type = case when ${kindChanging} then ${kind ? nextType : null} else issue_type end,
        sync_state = case when ${pushes} then 'pending' else sync_state end,
        version = version + 1
      where id = ${taskId}::uuid and version = ${input.version} and deleted_at is null
      returning id
    `);
    if (!updated[0]) throw new Error("This task changed while you were editing. Reload it and try again.");
    if (kindChanging && kind) {
      const children = await tx.execute<{ count: number }>(sql`
        select count(*)::int as count
        from tasks
        where parent_task_id = ${taskId}::uuid
          and deleted_at is null
      `);
      if ((children[0]?.count ?? 0) === 0) {
        for (const subtask of kind.subtasks) {
          await tx.execute(sql`
            insert into tasks (
              workspace_id, project_id, parent_task_id, title, description, status, priority,
              provider, sync_state, created_by
            ) values (
              ${workspaceId}::uuid,
              ${task.project_id}::uuid,
              ${taskId}::uuid,
              ${subtask.title},
              ${subtask.description},
              'open',
              'low',
              null,
              'synced',
              current_setting('app.current_user_id', true)
            )
          `);
        }
      }
    }
    if (pushes && connection && touched.length > 0) {
      await enqueueOutbox(tx, {
        workspaceId,
        integrationId: connection.integration_id,
        taskId,
        projectId: task.project_id,
        connectionId: connection.id,
        providerProjectId: connection.provider_project_id,
        providerTaskId: task.provider_task_id,
        kind: task.provider_task_id ? "update" : "create",
        touched,
      });
    }
    await writeAudit(tx, {
      workspaceId,
      action: "task.updated",
      entityType: "task",
      entityId: taskId,
      metadata: {
        fields: touched,
        ...(kindChanging
          ? { issueCategory: kind ? nextCategory : null, issueType: kind ? nextType : null }
          : {}),
      },
    });
  });
}

export async function bulkUpdateTasks(
  userId: string,
  workspaceId: string,
  input: { ids: string[]; status?: TaskStatus; priority?: TaskPriority },
): Promise<number> {
  if (input.ids.length === 0) throw new Error("Choose at least one task");
  if (input.ids.length > 100) throw new Error("Bulk updates are limited to 100 tasks");
  if (!input.status && !input.priority) throw new Error("Choose a status or priority to apply");
  let count = 0;
  for (const id of input.ids) {
    const rows = await listTasks(userId, workspaceId, {});
    const task = rows.find((row) => row.id === id);
    if (!task || task.deleted_at) throw new Error("One of the selected tasks is no longer available");
    await updateTask(userId, workspaceId, id, {
      version: task.version,
      status: input.status,
      priority: input.priority,
    });
    count += 1;
  }
  return count;
}

/**
 * Soft-delete tasks in Atrium. Optionally enqueue provider archives for synced issues.
 */
export async function deleteTasks(
  userId: string,
  workspaceId: string,
  input: { ids: string[]; alsoRemote?: boolean },
): Promise<number> {
  const ids = [...new Set(input.ids.map(String).filter(Boolean))];
  if (ids.length === 0) throw new Error("Choose at least one task");
  if (ids.length > 100) throw new Error("Deletes are limited to 100 tasks");

  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.write");
    let count = 0;

    for (const taskId of ids) {
      const existing = await tx.execute<{
        id: string;
        project_id: string;
        ownership_mode: "native" | "external" | "hybrid";
        provider_task_id: string | null;
      }>(sql`
        select t.id, t.project_id, p.ownership_mode, e.provider_id as provider_task_id
        from tasks t
        join projects p on p.id = t.project_id
        left join external_records e
          on e.local_entity_id = t.id
         and e.entity_type = 'issue'
         and e.deleted_at is null
        where t.id = ${taskId}::uuid
          and t.workspace_id = ${workspaceId}::uuid
          and t.deleted_at is null
      `);
      const task = existing[0];
      if (!task) throw new Error("One of the selected tasks is no longer available");
      if (task.ownership_mode === "hybrid") {
        throw new Error("Hybrid ownership is reserved and is not enabled");
      }

      const removed = await tx.execute<{ id: string }>(sql`
        update tasks
        set deleted_at = coalesce(deleted_at, now()),
            sync_state = 'tombstone',
            version = version + 1
        where id = ${taskId}::uuid
          and workspace_id = ${workspaceId}::uuid
          and deleted_at is null
        returning id
      `);
      if (!removed[0]) throw new Error("One of the selected tasks is no longer available");

      await tx.execute(sql`
        update tasks
        set deleted_at = coalesce(deleted_at, now()),
            version = version + 1
        where parent_task_id = ${taskId}::uuid
          and workspace_id = ${workspaceId}::uuid
          and deleted_at is null
      `);

      await tx.execute(sql`
        update external_records
        set deleted_at = coalesce(deleted_at, now())
        where local_entity_id = ${taskId}::uuid
          and entity_type = 'issue'
          and deleted_at is null
      `);

      await tx.execute(sql`
        delete from task_links
        where workspace_id = ${workspaceId}::uuid
          and (from_task_id = ${taskId}::uuid or to_task_id = ${taskId}::uuid)
      `);

      const connection = await loadConnection(tx, task.project_id);
      const canPushRemote =
        Boolean(input.alsoRemote)
        && Boolean(task.provider_task_id)
        && Boolean(connection)
        && connection!.status === "connected"
        && Boolean(connection!.credential_ciphertext)
        && (task.ownership_mode === "external" || Boolean(connection!.publish_outbound))
        && getAdapter(connection!.provider).getCapabilities().archiveTask
        && Boolean(connection!.provider_project_id);

      if (canPushRemote && connection && task.provider_task_id) {
        if (!connection.provider_project_id) {
          throw new Error("Could not archive one of the provider issues");
        }
        await enqueueOutbox(tx, {
          workspaceId,
          integrationId: connection.integration_id,
          taskId,
          projectId: task.project_id,
          connectionId: connection.id,
          providerProjectId: connection.provider_project_id,
          providerTaskId: task.provider_task_id,
          kind: "archive",
          touched: ["status"],
        });
      }

      await writeAudit(tx, {
        workspaceId,
        action: "task.deleted",
        entityType: "task",
        entityId: taskId,
        metadata: {
          alsoRemote: Boolean(input.alsoRemote && canPushRemote),
          providerTaskId: task.provider_task_id,
        },
      });
      count += 1;
    }

    return count;
  });
}

export type TransferTasksResult = {
  transferred: Array<{ fromId: string; toId: string }>;
};

/**
 * Copy tasks into another workspace/project, then soft-delete the sources.
 * workspace_id is immutable in the DB, so transfer is recreate + archive.
 */
export async function transferTasks(
  userId: string,
  sourceWorkspaceId: string,
  input: { ids: string[]; destinationWorkspaceId: string; destinationProjectId: string },
): Promise<TransferTasksResult> {
  const ids = [...new Set(input.ids.map(String).filter(Boolean))];
  if (ids.length === 0) throw new Error("Choose at least one task");
  if (ids.length > 100) throw new Error("Transfers are limited to 100 tasks");
  if (!input.destinationWorkspaceId) throw new Error("Choose a destination workspace");
  if (!input.destinationProjectId) throw new Error("Choose a destination project");
  if (input.destinationWorkspaceId === sourceWorkspaceId) {
    throw new Error("Choose a different workspace to transfer into");
  }

  await withUser(userId, async (tx) => {
    await requireAction(tx, sourceWorkspaceId, "task.write");
    await requireAction(tx, input.destinationWorkspaceId, "task.write");
    const project = await tx.execute<{ id: string; status: string }>(sql`
      select id, status from projects
      where id = ${input.destinationProjectId}::uuid
        and workspace_id = ${input.destinationWorkspaceId}::uuid
    `);
    if (!project[0] || project[0].status !== "active") {
      throw new Error("Active destination project not found");
    }
  });

  const sourceTasks = await listTasks(userId, sourceWorkspaceId, {});
  const selected = ids.map((id) => {
    const task = sourceTasks.find((row) => row.id === id);
    if (!task || task.deleted_at) throw new Error("One of the selected tasks is no longer available");
    return task;
  });

  const linkRows = await withUser(userId, async (tx) => {
    await requireAction(tx, sourceWorkspaceId, "task.read");
    return tx.execute<{ from_task_id: string; to_task_id: string; link_type: string }>(sql`
      select from_task_id, to_task_id, link_type
      from task_links
      where workspace_id = ${sourceWorkspaceId}::uuid
        and from_task_id = any(${textArray(ids)}::uuid[])
        and to_task_id = any(${textArray(ids)}::uuid[])
    `);
  });

  const idMap = new Map<string, string>();
  for (const task of selected) {
    const keepAssignee = task.assignee_user_id
      ? await withUser(userId, async (tx) => {
          const rows = await tx.execute<{ id: string }>(sql`
            select user_id as id from workspace_members
            where workspace_id = ${input.destinationWorkspaceId}::uuid
              and user_id = ${task.assignee_user_id}::uuid
            limit 1
          `);
          return Boolean(rows[0]);
        })
      : false;

    const newId = await createTask(userId, input.destinationWorkspaceId, {
      projectId: input.destinationProjectId,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueAt: task.due_at ? new Date(task.due_at).toISOString() : null,
      assigneeUserId: keepAssignee ? task.assignee_user_id : null,
      milestoneId: null,
      issueCategory: task.issue_category,
      issueType: task.issue_type,
    });
    idMap.set(task.id, newId);

    await withUser(userId, async (tx) => {
      await requireAction(tx, sourceWorkspaceId, "task.write");
      await requireAction(tx, input.destinationWorkspaceId, "task.write");

      await tx.execute(sql`
        insert into task_comments (workspace_id, task_id, body, author_user_id, created_at)
        select
          ${input.destinationWorkspaceId}::uuid,
          ${newId}::uuid,
          body,
          author_user_id,
          created_at
        from task_comments
        where task_id = ${task.id}::uuid
        order by created_at asc
      `);

      const removed = await tx.execute<{ id: string }>(sql`
        update tasks
        set deleted_at = coalesce(deleted_at, now()),
            sync_state = 'tombstone',
            version = version + 1
        where id = ${task.id}::uuid
          and workspace_id = ${sourceWorkspaceId}::uuid
          and deleted_at is null
        returning id
      `);
      if (!removed[0]) throw new Error("One of the selected tasks is no longer available");

      await tx.execute(sql`
        update tasks
        set deleted_at = coalesce(deleted_at, now()),
            version = version + 1
        where parent_task_id = ${task.id}::uuid
          and workspace_id = ${sourceWorkspaceId}::uuid
          and deleted_at is null
      `);

      await tx.execute(sql`
        delete from task_links
        where workspace_id = ${sourceWorkspaceId}::uuid
          and (from_task_id = ${task.id}::uuid or to_task_id = ${task.id}::uuid)
      `);

      await writeAudit(tx, {
        workspaceId: sourceWorkspaceId,
        action: "task.transferred",
        entityType: "task",
        entityId: task.id,
        metadata: {
          toWorkspaceId: input.destinationWorkspaceId,
          toProjectId: input.destinationProjectId,
          toTaskId: newId,
        },
      });
      await writeAudit(tx, {
        workspaceId: input.destinationWorkspaceId,
        action: "task.transferred_in",
        entityType: "task",
        entityId: newId,
        metadata: {
          fromWorkspaceId: sourceWorkspaceId,
          fromTaskId: task.id,
        },
      });
    });
  }

  for (const link of linkRows) {
    const fromId = idMap.get(link.from_task_id);
    const toId = idMap.get(link.to_task_id);
    if (!fromId || !toId || fromId === toId) continue;
    await withUser(userId, async (tx) => {
      await requireAction(tx, input.destinationWorkspaceId, "task.write");
      await tx.execute(sql`
        insert into task_links (workspace_id, from_task_id, to_task_id, link_type, created_by)
        values (
          ${input.destinationWorkspaceId}::uuid,
          ${fromId}::uuid,
          ${toId}::uuid,
          ${link.link_type},
          current_setting('app.current_user_id', true)
        )
        on conflict do nothing
      `);
    });
  }

  return {
    transferred: [...idMap.entries()].map(([fromId, toId]) => ({ fromId, toId })),
  };
}
