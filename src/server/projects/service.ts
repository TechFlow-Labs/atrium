import { sql } from "drizzle-orm";
import { writeAudit } from "../audit";
import { requireAction } from "../authz/membership";
import { withUser } from "../db/client";
import { areDevMocksVisible, sqlDevMockProjectVisible } from "../dev/mock-data";

export type ProjectRecord = {
  id: string;
  workspace_id: string;
  name: string;
  nickname: string | null;
  description: string;
  status: "active" | "archived";
  ownership_mode: "native" | "external" | "hybrid";
  archived_at: Date | null;
  created_at: Date;
  provider: string | null;
  provider_project_name: string | null;
  provider_project_url: string | null;
  provider_project_id: string | null;
  integration_id: string | null;
  publish_outbound: boolean | null;
};

function normalizeNickname(value: string | null): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.length > 80) throw new Error("Nickname must be 80 characters or fewer");
  return trimmed;
}

export async function listProjects(
  userId: string,
  workspaceId: string,
  filter: { status?: "active" | "archived" | "all"; query?: string } = {},
): Promise<ProjectRecord[]> {
  const showMocks = await areDevMocksVisible();
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");
    const status = filter.status ?? "active";
    const query = filter.query?.trim() ?? "";
    return tx.execute<ProjectRecord>(sql`
      select p.id, p.workspace_id, p.name, p.nickname, p.description, p.status, p.ownership_mode,
             p.archived_at, p.created_at,
             i.provider, c.provider_project_name, c.provider_project_url, c.provider_project_id,
             c.integration_id, c.publish_outbound
      from projects p
      left join project_connections c on c.project_id = p.id
      left join integrations i on i.id = c.integration_id
      where p.workspace_id = ${workspaceId}::uuid
        and (${status} = 'all' or p.status = ${status})
        and (
          ${query} = ''
          or p.name ilike ${"%" + query + "%"}
          or coalesce(p.nickname, '') ilike ${"%" + query + "%"}
        )
        and ${sqlDevMockProjectVisible(showMocks)}
      order by coalesce(nullif(btrim(p.nickname), ''), p.name)
    `);
  });
}

export type ProjectsAnalytics = {
  portfolio: {
    active: number;
    archived: number;
    native: number;
    external: number;
    hybrid: number;
    total: number;
  };
  tasks: {
    total: number;
    open: number;
    inProgress: number;
    blocked: number;
    done: number;
    cancelled: number;
    attention: number;
    dueSoon: number;
    doneWeek: number;
    completion: number;
  };
  busiest: Array<{
    id: string;
    name: string;
    nickname: string | null;
    ownership_mode: "native" | "external" | "hybrid";
    open_count: number;
    attention_count: number;
    total_count: number;
  }>;
};

export async function getProjectsAnalytics(
  userId: string,
  workspaceId: string,
  filter: { status?: "active" | "archived" | "all" } = {},
  nowMs: number = Date.now(),
): Promise<ProjectsAnalytics> {
  const status = filter.status ?? "active";
  const weekEnd = new Date(nowMs + 7 * 24 * 60 * 60 * 1000).toISOString();
  const weekStart = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  const showMocks = await areDevMocksVisible();

  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");

    const portfolioRows = await tx.execute<{
      active: number;
      archived: number;
      native: number;
      external: number;
      hybrid: number;
      total: number;
    }>(sql`
      select
        count(*) filter (where p.status = 'active')::int as active,
        count(*) filter (where p.status = 'archived')::int as archived,
        count(*) filter (where p.ownership_mode = 'native')::int as native,
        count(*) filter (where p.ownership_mode = 'external')::int as external,
        count(*) filter (where p.ownership_mode = 'hybrid')::int as hybrid,
        count(*)::int as total
      from projects p
      where p.workspace_id = ${workspaceId}::uuid
        and ${sqlDevMockProjectVisible(showMocks)}
    `);

    const taskRows = await tx.execute<{
      total: number;
      open: number;
      in_progress: number;
      blocked: number;
      done: number;
      cancelled: number;
      attention: number;
      due_soon: number;
      done_week: number;
    }>(sql`
      select
        count(*)::int as total,
        count(*) filter (where t.status = 'open')::int as open,
        count(*) filter (where t.status = 'in_progress')::int as in_progress,
        count(*) filter (where t.status = 'blocked')::int as blocked,
        count(*) filter (where t.status = 'done')::int as done,
        count(*) filter (where t.status = 'cancelled')::int as cancelled,
        count(*) filter (
          where t.status in ('open', 'in_progress', 'blocked')
            and t.priority in ('urgent', 'high')
        )::int as attention,
        count(*) filter (
          where t.status not in ('done', 'cancelled')
            and t.due_at is not null
            and t.due_at <= ${weekEnd}
        )::int as due_soon,
        count(*) filter (
          where t.status = 'done'
            and t.updated_at >= ${weekStart}
        )::int as done_week
      from tasks t
      join projects p on p.id = t.project_id
      where t.workspace_id = ${workspaceId}::uuid
        and t.deleted_at is null
        and (${status} = 'all' or p.status = ${status})
        and ${sqlDevMockProjectVisible(showMocks)}
    `);

    const busiest = await tx.execute<{
      id: string;
      name: string;
      nickname: string | null;
      ownership_mode: "native" | "external" | "hybrid";
      open_count: number;
      attention_count: number;
      total_count: number;
    }>(sql`
      select
        p.id,
        p.name,
        p.nickname,
        p.ownership_mode,
        count(*) filter (
          where t.deleted_at is null
            and t.status in ('open', 'in_progress', 'blocked')
        )::int as open_count,
        count(*) filter (
          where t.deleted_at is null
            and t.status in ('open', 'in_progress', 'blocked')
            and t.priority in ('urgent', 'high')
        )::int as attention_count,
        count(*) filter (where t.deleted_at is null)::int as total_count
      from projects p
      left join tasks t on t.project_id = p.id and t.workspace_id = p.workspace_id
      where p.workspace_id = ${workspaceId}::uuid
        and (${status} = 'all' or p.status = ${status})
        and ${sqlDevMockProjectVisible(showMocks)}
      group by p.id, p.name, p.nickname, p.ownership_mode
      having count(*) filter (
        where t.deleted_at is null
          and t.status in ('open', 'in_progress', 'blocked')
      ) > 0
      order by open_count desc, attention_count desc, coalesce(nullif(btrim(p.nickname), ''), p.name)
      limit 5
    `);

    const portfolio = portfolioRows[0] ?? {
      active: 0,
      archived: 0,
      native: 0,
      external: 0,
      hybrid: 0,
      total: 0,
    };
    const task = taskRows[0] ?? {
      total: 0,
      open: 0,
      in_progress: 0,
      blocked: 0,
      done: 0,
      cancelled: 0,
      attention: 0,
      due_soon: 0,
      done_week: 0,
    };
    const activeTasks = task.open + task.in_progress + task.blocked + task.done;
    const completion = activeTasks === 0 ? 0 : Math.round((task.done / activeTasks) * 100);

    return {
      portfolio,
      tasks: {
        total: task.total,
        open: task.open,
        inProgress: task.in_progress,
        blocked: task.blocked,
        done: task.done,
        cancelled: task.cancelled,
        attention: task.attention,
        dueSoon: task.due_soon,
        doneWeek: task.done_week,
        completion,
      },
      busiest,
    };
  });
}

export async function getProject(userId: string, workspaceId: string, projectId: string): Promise<ProjectRecord | null> {
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");
    const rows = await tx.execute<ProjectRecord>(sql`
      select p.id, p.workspace_id, p.name, p.nickname, p.description, p.status, p.ownership_mode,
             p.archived_at, p.created_at,
             i.provider, c.provider_project_name, c.provider_project_url, c.provider_project_id,
             c.integration_id, c.publish_outbound
      from projects p
      left join project_connections c on c.project_id = p.id
      left join integrations i on i.id = c.integration_id
      where p.workspace_id = ${workspaceId}::uuid and p.id = ${projectId}::uuid
    `);
    return rows[0] ?? null;
  });
}

export async function createNativeProject(
  userId: string,
  workspaceId: string,
  input: { name: string; description?: string },
): Promise<string> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new Error("Project name must be between 2 and 120 characters");
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "project.create");
    const rows = await tx.execute<{ id: string }>(sql`
      insert into projects (workspace_id, name, description, ownership_mode, created_by)
      values (${workspaceId}::uuid, ${name}, ${input.description?.trim() ?? ""}, 'native', current_setting('app.current_user_id', true))
      returning id
    `);
    const id = rows[0]?.id;
    if (!id) throw new Error("Project was not created");
    await writeAudit(tx, { workspaceId, action: "project.created", entityType: "project", entityId: id, metadata: { ownership: "native" } });
    return id;
  });
}

export async function updateProject(
  userId: string,
  workspaceId: string,
  projectId: string,
  input: { name?: string; nickname?: string | null; description?: string },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "project.update");
    const name = input.name?.trim();
    if (name !== undefined && (name.length < 2 || name.length > 120)) {
      throw new Error("Project name must be between 2 and 120 characters");
    }
    const nicknameProvided = input.nickname !== undefined;
    const nickname = nicknameProvided ? normalizeNickname(input.nickname ?? null) : null;
    const rows = await tx.execute(sql`
      update projects
      set name = coalesce(${name ?? null}, name),
          nickname = case when ${nicknameProvided} then ${nickname} else nickname end,
          description = coalesce(${input.description ?? null}, description)
      where id = ${projectId}::uuid and workspace_id = ${workspaceId}::uuid
      returning id
    `);
    if (!rows[0]) throw new Error("Project not found");
    await writeAudit(tx, { workspaceId, action: "project.updated", entityType: "project", entityId: projectId });
  });
}

export async function archiveProject(userId: string, workspaceId: string, projectId: string, archived: boolean) {
  await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "project.archive");
    const rows = await tx.execute(sql`
      update projects
      set status = ${archived ? "archived" : "active"},
          archived_at = case when ${archived} then now() else null end
      where id = ${projectId}::uuid and workspace_id = ${workspaceId}::uuid
      returning id
    `);
    if (!rows[0]) throw new Error("Project not found");
    await writeAudit(tx, {
      workspaceId,
      action: archived ? "project.archived" : "project.restored",
      entityType: "project",
      entityId: projectId,
    });
  });
}

/** Permanently remove a project from Atrium (tasks cascade). Provider projects stay. */
export async function deleteProject(userId: string, workspaceId: string, projectId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "project.delete");
    const existing = await tx.execute<{
      id: string;
      name: string;
      ownership_mode: "native" | "external" | "hybrid";
    }>(sql`
      select id, name, ownership_mode
      from projects
      where id = ${projectId}::uuid and workspace_id = ${workspaceId}::uuid
    `);
    const project = existing[0];
    if (!project) throw new Error("Project not found");

    await writeAudit(tx, {
      workspaceId,
      action: "project.deleted",
      entityType: "project",
      entityId: projectId,
      metadata: { name: project.name, ownership: project.ownership_mode },
    });

    await tx.execute(sql`select delete_project(${projectId}::uuid)`);
  });
}

export async function listMilestones(userId: string, workspaceId: string, projectId: string) {
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");
    return tx.execute(sql`
      select id, name, description, due_at, status
      from milestones
      where workspace_id = ${workspaceId}::uuid and project_id = ${projectId}::uuid
      order by due_at nulls last, name
    `);
  });
}

export async function createMilestone(
  userId: string,
  workspaceId: string,
  projectId: string,
  input: { name: string; dueAt?: string | null; description?: string },
) {
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Milestone name must be at least 2 characters");
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "milestone.write");
    const project = await tx.execute<{ ownership_mode: string }>(sql`
      select ownership_mode from projects where id = ${projectId}::uuid and workspace_id = ${workspaceId}::uuid
    `);
    if (!project[0]) throw new Error("Project not found");
    if (project[0].ownership_mode !== "native") {
      throw new Error("Milestones are stored on native projects. External milestones stay with the provider.");
    }
    const rows = await tx.execute<{ id: string }>(sql`
      insert into milestones (workspace_id, project_id, name, description, due_at)
      values (
        ${workspaceId}::uuid,
        ${projectId}::uuid,
        ${name},
        ${input.description?.trim() ?? ""},
        ${input.dueAt ? new Date(input.dueAt).toISOString() : null}
      )
      returning id
    `);
    return rows[0]?.id;
  });
}
