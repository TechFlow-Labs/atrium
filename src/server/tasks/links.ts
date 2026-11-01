import { sql } from "drizzle-orm";
import { writeAudit } from "../audit";
import { requireAction } from "../authz/membership";
import { withUser, type Tx } from "../db/client";
import { textArray } from "../db/sql";
import type { ProviderId, TaskPriority, TaskStatus } from "../integrations/types";

export const TASK_LINK_TYPES = ["blocks", "relates_to", "duplicate"] as const;
export type TaskLinkType = (typeof TASK_LINK_TYPES)[number];

export type TaskLinkRelation =
  | "blocks"
  | "blocked_by"
  | "relates_to"
  | "duplicates"
  | "duplicated_by";

export type TaskLinkView = {
  id: string;
  relation: TaskLinkRelation;
  linkType: TaskLinkType;
  taskId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  provider: ProviderId | null;
  projectName: string;
};

export type TaskLinkSearchHit = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  provider: ProviderId | null;
  projectName: string;
};

const LINK_TYPE_SET = new Set<string>(TASK_LINK_TYPES);

function assertLinkType(value: string): asserts value is TaskLinkType {
  if (!LINK_TYPE_SET.has(value)) {
    throw new Error("Choose blocks, relates to, or duplicate");
  }
}

function relationFor(linkType: TaskLinkType, outbound: boolean): TaskLinkRelation {
  if (linkType === "blocks") return outbound ? "blocks" : "blocked_by";
  if (linkType === "duplicate") return outbound ? "duplicates" : "duplicated_by";
  return "relates_to";
}

async function loadTaskInWorkspace(
  tx: Tx,
  workspaceId: string,
  taskId: string,
): Promise<{ id: string; workspace_id: string } | null> {
  const rows = await tx.execute<{ id: string; workspace_id: string }>(sql`
    select id, workspace_id
    from tasks
    where id = ${taskId}::uuid
      and workspace_id = ${workspaceId}::uuid
      and deleted_at is null
    limit 1
  `);
  return rows[0] ?? null;
}

export async function listTaskLinks(userId: string, taskId: string): Promise<TaskLinkView[] | null> {
  return withUser(userId, async (tx) => {
    const taskRows = await tx.execute<{ id: string; workspace_id: string }>(sql`
      select id, workspace_id from tasks
      where id = ${taskId}::uuid and deleted_at is null
      limit 1
    `);
    const task = taskRows[0];
    if (!task) return null;
    await requireAction(tx, task.workspace_id, "task.read");

    const rows = await tx.execute<{
      id: string;
      link_type: TaskLinkType;
      outbound: boolean;
      related_id: string;
      title: string;
      status: TaskStatus;
      priority: TaskPriority;
      provider: ProviderId | null;
      project_name: string;
    }>(sql`
      select l.id,
             l.link_type,
             true as outbound,
             t.id as related_id,
             t.title,
             t.status,
             t.priority,
             t.provider,
             coalesce(nullif(btrim(p.nickname), ''), p.name) as project_name
      from task_links l
      join tasks t on t.id = l.to_task_id
      join projects p on p.id = t.project_id
      where l.from_task_id = ${taskId}::uuid
        and t.deleted_at is null

      union all

      select l.id,
             l.link_type,
             false as outbound,
             t.id as related_id,
             t.title,
             t.status,
             t.priority,
             t.provider,
             coalesce(nullif(btrim(p.nickname), ''), p.name) as project_name
      from task_links l
      join tasks t on t.id = l.from_task_id
      join projects p on p.id = t.project_id
      where l.to_task_id = ${taskId}::uuid
        and t.deleted_at is null

      order by link_type, title
    `);

    return rows.map((row) => ({
      id: row.id,
      relation: relationFor(row.link_type, row.outbound),
      linkType: row.link_type,
      taskId: row.related_id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      provider: row.provider,
      projectName: row.project_name,
    }));
  });
}

export async function addTaskLink(
  userId: string,
  workspaceId: string,
  input: { fromTaskId: string; toTaskId: string; linkType: string },
): Promise<string> {
  assertLinkType(input.linkType);
  let fromTaskId = input.fromTaskId;
  let toTaskId = input.toTaskId;
  if (!fromTaskId || !toTaskId) throw new Error("Choose a related task");
  if (fromTaskId === toTaskId) throw new Error("A task cannot link to itself");

  if (input.linkType === "relates_to" && fromTaskId > toTaskId) {
    const swap = fromTaskId;
    fromTaskId = toTaskId;
    toTaskId = swap;
  }

  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.write");
    const fromTask = await loadTaskInWorkspace(tx, workspaceId, fromTaskId);
    const toTask = await loadTaskInWorkspace(tx, workspaceId, toTaskId);
    if (!fromTask || !toTask) throw new Error("Both tasks must be in this workspace");

    const existing = await tx.execute<{ id: string }>(sql`
      select id from task_links
      where from_task_id = ${fromTaskId}::uuid
        and to_task_id = ${toTaskId}::uuid
        and link_type = ${input.linkType}
      limit 1
    `);
    if (existing[0]) return existing[0].id;

    if (input.linkType === "blocks" || input.linkType === "duplicate") {
      const reverse = await tx.execute<{ id: string }>(sql`
        select id from task_links
        where from_task_id = ${toTaskId}::uuid
          and to_task_id = ${fromTaskId}::uuid
          and link_type = ${input.linkType}
        limit 1
      `);
      if (reverse[0]) {
        throw new Error(
          input.linkType === "blocks"
            ? "Those tasks already have a blocks relationship the other way"
            : "Those tasks already have a duplicate relationship the other way",
        );
      }
    }

    const rows = await tx.execute<{ id: string }>(sql`
      insert into task_links (workspace_id, from_task_id, to_task_id, link_type, created_by)
      values (
        ${workspaceId}::uuid,
        ${fromTaskId}::uuid,
        ${toTaskId}::uuid,
        ${input.linkType},
        current_setting('app.current_user_id', true)
      )
      returning id
    `);
    const id = rows[0]?.id;
    if (!id) throw new Error("Could not create the link");

    await writeAudit(tx, {
      workspaceId,
      action: "task.link_added",
      entityType: "task",
      entityId: input.fromTaskId,
      metadata: { linkId: id, linkType: input.linkType, toTaskId: input.toTaskId },
    });
    return id;
  });
}

export async function removeTaskLink(userId: string, workspaceId: string, linkId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.write");
    const rows = await tx.execute<{ id: string; from_task_id: string; link_type: TaskLinkType }>(sql`
      delete from task_links
      where id = ${linkId}::uuid
        and workspace_id = ${workspaceId}::uuid
      returning id, from_task_id, link_type
    `);
    const removed = rows[0];
    if (!removed) throw new Error("Link not found");
    await writeAudit(tx, {
      workspaceId,
      action: "task.link_removed",
      entityType: "task",
      entityId: removed.from_task_id,
      metadata: { linkId: removed.id, linkType: removed.link_type },
    });
  });
}

export type TaskLinkEdge = {
  fromTaskId: string;
  toTaskId: string;
  linkType: TaskLinkType;
};

/** Edges among the given task ids (any link type), for list/board grouping. */
export async function listTaskLinkEdgesForTasks(
  userId: string,
  workspaceId: string,
  taskIds: string[],
): Promise<TaskLinkEdge[]> {
  if (taskIds.length === 0) return [];
  const idFilter = textArray(taskIds);
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");
    const rows = await tx.execute<{
      from_task_id: string;
      to_task_id: string;
      link_type: TaskLinkType;
    }>(sql`
      select from_task_id, to_task_id, link_type
      from task_links
      where workspace_id = ${workspaceId}::uuid
        and from_task_id = any(${idFilter}::uuid[])
        and to_task_id = any(${idFilter}::uuid[])
    `);
    return rows.map((row) => ({
      fromTaskId: row.from_task_id,
      toTaskId: row.to_task_id,
      linkType: row.link_type,
    }));
  });
}

export async function searchTasksForLink(
  userId: string,
  workspaceId: string,
  input: { query: string; excludeTaskId: string; limit?: number },
): Promise<TaskLinkSearchHit[]> {
  const query = input.query.trim();
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 30);
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");
    const rows = await tx.execute<{
      id: string;
      title: string;
      status: TaskStatus;
      priority: TaskPriority;
      provider: ProviderId | null;
      project_name: string;
    }>(sql`
      select t.id, t.title, t.status, t.priority, t.provider,
             coalesce(nullif(btrim(p.nickname), ''), p.name) as project_name
      from tasks t
      join projects p on p.id = t.project_id
      where t.workspace_id = ${workspaceId}::uuid
        and t.deleted_at is null
        and t.id <> ${input.excludeTaskId}::uuid
        and (
          ${query} = ''
          or t.title ilike ${"%" + query + "%"}
        )
      order by t.updated_at desc
      limit ${limit}
    `);
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      provider: row.provider,
      projectName: row.project_name,
    }));
  });
}
