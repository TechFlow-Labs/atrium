import { sql } from "drizzle-orm";
import { requireAction } from "../authz/membership";
import { withUser } from "../db/client";
import { textArray } from "../db/sql";
import { areDevMocksVisible, sqlDevMockProjectVisible, sqlDevMockTaskVisible } from "../dev/mock-data";
import { CHAT_PROVIDERS, NOTE_PROVIDERS, PROVIDERS, type ProviderId } from "../integrations/types";

const STALE_MS = 15 * 60 * 1000;

const PROVIDER_SOURCES = new Set<string>(PROVIDERS.filter((provider) => provider !== "fake"));
const NON_TASK_PROVIDER_SQL = textArray([...CHAT_PROVIDERS, ...NOTE_PROVIDERS]);

export type HomeSource = "" | "atrium" | ProviderId;

function parseHomeSource(source?: string | null): HomeSource {
  const value = source?.trim() ?? "";
  if (!value || value === "all") return "";
  if (value === "atrium" || value === "native") return "atrium";
  if (PROVIDER_SOURCES.has(value)) return value as ProviderId;
  return "";
}

export async function homeFeed(userId: string, workspaceId: string, now: number, source?: string | null) {
  const selected = parseHomeSource(source);
  const atriumOnly = selected === "atrium";
  const providerSource = selected && selected !== "atrium" ? selected : "";
  const showMocks = await areDevMocksVisible();

  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");
    const weekEnd = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    const weekStart = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    const taskSourceMatch = sql`(
      ${selected} = ''
      or (${atriumOnly ? "atrium" : ""} = 'atrium' and t.provider is null)
      or (${providerSource} <> '' and t.provider = ${providerSource})
    )`;
    const mockProjectOk = sqlDevMockProjectVisible(showMocks);
    const mockTaskOk = sqlDevMockTaskVisible(showMocks);

    const priorities = await tx.execute(sql`
      select t.id, t.title, t.priority, t.status, t.due_at, p.name as project_name, t.provider, t.external_url
      from tasks t join projects p on p.id = t.project_id
      where t.workspace_id = ${workspaceId}::uuid
        and t.deleted_at is null
        and t.status in ('open', 'in_progress', 'blocked')
        and t.priority in ('urgent', 'high')
        and ${taskSourceMatch}
        and ${mockProjectOk}
      order by case t.priority when 'urgent' then 0 else 1 end, t.due_at nulls last
      limit 8
    `);
    const dueSoon = await tx.execute(sql`
      select t.id, t.title, t.due_at, t.status, p.name as project_name, t.provider
      from tasks t join projects p on p.id = t.project_id
      where t.workspace_id = ${workspaceId}::uuid
        and t.deleted_at is null
        and t.status not in ('done', 'cancelled')
        and t.due_at is not null
        and t.due_at <= ${weekEnd}
        and ${taskSourceMatch}
        and ${mockProjectOk}
      order by t.due_at
      limit 8
    `);
    const blocked = await tx.execute(sql`
      select t.id, t.title, p.name as project_name, t.provider
      from tasks t join projects p on p.id = t.project_id
      where t.workspace_id = ${workspaceId}::uuid
        and t.deleted_at is null
        and t.status = 'blocked'
        and ${taskSourceMatch}
        and ${mockProjectOk}
      order by t.updated_at desc limit 8
    `);
    const activity = await tx.execute(sql`
      select e.id, e.direction as action, e.entity_type, e.provider_id as entity_id, e.created_at, e.status
      from sync_events e
      left join integrations i on i.id = e.integration_id
      where e.workspace_id = ${workspaceId}::uuid
        and (
          ${providerSource} = ''
          or i.provider = ${providerSource}
        )
        and ${atriumOnly ? sql`false` : sql`true`}
      order by e.created_at desc limit 12
    `);
    const sources = await tx.execute<{ provider: string; display_name: string }>(sql`
      with connected as (
        select distinct on (i.provider) i.provider, i.display_name, 0 as rank
        from integrations i
        where i.workspace_id = ${workspaceId}::uuid
          and i.status <> 'revoked'
          and i.provider <> all(${NON_TASK_PROVIDER_SQL})
        order by i.provider, i.display_name
      ),
      from_tasks as (
        select distinct t.provider, initcap(t.provider) as display_name, 1 as rank
        from tasks t
        where t.workspace_id = ${workspaceId}::uuid
          and t.deleted_at is null
          and t.provider is not null
          and t.provider <> all(${NON_TASK_PROVIDER_SQL})
          and not exists (select 1 from connected c where c.provider = t.provider)
          and ${mockTaskOk}
      )
      select provider, display_name from (
        select provider, display_name, rank from connected
        union all
        select provider, display_name, rank from from_tasks
      ) sources
      order by rank, provider
    `);
    const health = await tx.execute<{
      display_name: string;
      provider: string;
      status: string;
      last_success_at: Date | null;
      last_error: string | null;
    }>(sql`
      select i.display_name, i.provider, i.status, s.last_success_at, coalesce(s.last_error, i.last_error) as last_error
      from integrations i
      left join integration_sync_cursors s on s.integration_id = i.id and s.resource = 'issues'
      where i.workspace_id = ${workspaceId}::uuid
        and i.status <> 'revoked'
        and i.provider <> all(${NON_TASK_PROVIDER_SQL})
        and (${providerSource} = '' or i.provider = ${providerSource})
        and ${atriumOnly ? sql`false` : sql`true`}
    `);
    const statsRows = await tx.execute<{
      open_count: number;
      in_progress_count: number;
      blocked_count: number;
      attention_count: number;
      due_soon_count: number;
      done_week_count: number;
      project_count: number;
      integration_count: number;
    }>(sql`
      select
        (select count(*)::int from tasks t
          where t.workspace_id = ${workspaceId}::uuid and t.deleted_at is null and t.status = 'open'
            and ${taskSourceMatch}
            and ${mockTaskOk}) as open_count,
        (select count(*)::int from tasks t
          where t.workspace_id = ${workspaceId}::uuid and t.deleted_at is null and t.status = 'in_progress'
            and ${taskSourceMatch}
            and ${mockTaskOk}) as in_progress_count,
        (select count(*)::int from tasks t
          where t.workspace_id = ${workspaceId}::uuid and t.deleted_at is null and t.status = 'blocked'
            and ${taskSourceMatch}
            and ${mockTaskOk}) as blocked_count,
        (select count(*)::int from tasks t
          where t.workspace_id = ${workspaceId}::uuid and t.deleted_at is null
            and t.status in ('open', 'in_progress', 'blocked')
            and t.priority in ('urgent', 'high')
            and ${taskSourceMatch}
            and ${mockTaskOk}) as attention_count,
        (select count(*)::int from tasks t
          where t.workspace_id = ${workspaceId}::uuid and t.deleted_at is null
            and t.status not in ('done', 'cancelled')
            and t.due_at is not null
            and t.due_at <= ${weekEnd}
            and ${taskSourceMatch}
            and ${mockTaskOk}) as due_soon_count,
        (select count(*)::int from tasks t
          where t.workspace_id = ${workspaceId}::uuid and t.deleted_at is null
            and t.status = 'done'
            and t.updated_at >= ${weekStart}
            and ${taskSourceMatch}
            and ${mockTaskOk}) as done_week_count,
        (select count(*)::int from projects p
          where p.workspace_id = ${workspaceId}::uuid and p.status = 'active'
            and ${mockProjectOk}
            and (
              ${selected} = ''
              or (${atriumOnly ? "atrium" : ""} = 'atrium' and p.ownership_mode = 'native')
              or exists (
                select 1 from project_connections c
                join integrations i on i.id = c.integration_id
                where c.project_id = p.id and i.provider = ${providerSource} and ${providerSource} <> ''
              )
            )) as project_count,
        (select count(*)::int from integrations i
          where i.workspace_id = ${workspaceId}::uuid and i.status <> 'revoked'
            and (${providerSource} = '' or i.provider = ${providerSource})
            and ${atriumOnly ? sql`false` : sql`true`}) as integration_count
    `);
    const prefs = await tx.execute<{ notify_sync_errors: boolean }>(sql`
      select notify_sync_errors from user_preferences
      where user_id = current_setting('app.current_user_id', true)
    `);
    const showErrors = prefs[0]?.notify_sync_errors !== false;
    const stats = statsRows[0] ?? {
      open_count: 0,
      in_progress_count: 0,
      blocked_count: 0,
      attention_count: 0,
      due_soon_count: 0,
      done_week_count: 0,
      project_count: 0,
      integration_count: 0,
    };
    return {
      source: selected,
      sources,
      priorities,
      dueSoon,
      blocked,
      activity: atriumOnly ? [] : activity,
      weekEnd,
      stats: {
        open: stats.open_count,
        inProgress: stats.in_progress_count,
        blocked: stats.blocked_count,
        attention: stats.attention_count,
        dueSoon: stats.due_soon_count,
        doneWeek: stats.done_week_count,
        projects: stats.project_count,
        integrations: atriumOnly ? 0 : stats.integration_count,
      },
      health: atriumOnly
        ? []
        : health.map((row) => ({
            ...row,
            last_error: showErrors ? row.last_error : null,
            stale: row.status === "connected" && (!row.last_success_at || now - new Date(row.last_success_at).getTime() > STALE_MS),
          })),
    };
  });
}

export async function searchWorkspace(userId: string, workspaceId: string, query: string) {
  const term = query.trim();
  if (term.length < 2) return { projects: [], tasks: [] };
  const showMocks = await areDevMocksVisible();
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");
    const like = `%${term}%`;
    const projects = await tx.execute(sql`
      select p.id, p.name, p.ownership_mode from projects p
      where p.workspace_id = ${workspaceId}::uuid
        and p.name ilike ${like}
        and ${sqlDevMockProjectVisible(showMocks)}
      order by p.name limit 8
    `);
    const tasks = await tx.execute(sql`
      select t.id, t.title, t.status, t.provider from tasks t
      where t.workspace_id = ${workspaceId}::uuid
        and t.deleted_at is null
        and (t.title ilike ${like} or t.description ilike ${like})
        and ${sqlDevMockTaskVisible(showMocks)}
      order by t.updated_at desc limit 8
    `);
    return { projects, tasks };
  });
}

export async function calendarTasks(userId: string, workspaceId: string, start: string, end: string) {
  const showMocks = await areDevMocksVisible();
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");
    return tx.execute(sql`
      select t.id, t.title, t.due_at, t.created_at, t.status, t.priority, t.provider,
             p.id as project_id, p.name as project_name, p.nickname as project_nickname
      from tasks t join projects p on p.id = t.project_id
      where t.workspace_id = ${workspaceId}::uuid
        and t.deleted_at is null
        and t.due_at >= ${new Date(start).toISOString()}
        and t.due_at < ${new Date(end).toISOString()}
        and ${sqlDevMockProjectVisible(showMocks)}
      order by p.name, t.due_at
    `);
  });
}

export async function listAudit(userId: string, workspaceId: string) {
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "audit.read");
    return tx.execute(sql`
      select a.id, a.action, a.entity_type, a.entity_id, a.metadata, a.created_at, u.name as actor_name
      from audit_events a
      left join "user" u on u.id = a.actor_user_id
      where a.workspace_id = ${workspaceId}::uuid
      order by a.created_at desc
      limit 200
    `);
  });
}
