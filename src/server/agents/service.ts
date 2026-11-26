import { sql } from "drizzle-orm";
import { requireAction } from "../authz/membership";
import { encryptSecret } from "../crypto/secrets";
import { withUser, type Tx } from "../db/client";
import { createMcpToken } from "../mcp/tokens";

export type WorkspaceAgent = {
  id: string;
  user_id: string;
  display_name: string;
  webhook_url: string;
  created_at: Date;
};

export type AssigneeChoice = {
  userId: string;
  name: string;
  agent: boolean;
};

function assertWebhookUrl(value: string): string {
  const url = value.trim();
  if (url.length < 8 || url.length > 500) throw new Error("Webhook URL must be between 8 and 500 characters");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Webhook URL is not valid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Webhook URL must start with http:// or https://");
  }
  return url;
}

export async function listWorkspaceAgents(userId: string, workspaceId: string): Promise<WorkspaceAgent[]> {
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");
    return tx.execute<WorkspaceAgent>(sql`
      select id, user_id, display_name, webhook_url, created_at
      from workspace_agents
      where workspace_id = ${workspaceId}::uuid
        and disabled_at is null
      order by display_name
    `);
  });
}

export async function listAssigneeChoices(userId: string, workspaceId: string): Promise<AssigneeChoice[]> {
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");
    const rows = await tx.execute<{ user_id: string; name: string; agent: boolean }>(sql`
      select m.user_id, u.name, (a.id is not null) as agent
      from workspace_members m
      join "user" u on u.id = m.user_id
      left join workspace_agents a
        on a.user_id = m.user_id
       and a.workspace_id = m.workspace_id
       and a.disabled_at is null
      where m.workspace_id = ${workspaceId}::uuid
        and not exists (
          select 1 from workspace_agents retired
          where retired.user_id = m.user_id
            and retired.workspace_id = m.workspace_id
            and retired.disabled_at is not null
        )
      order by u.name
    `);
    return rows.map((row) => ({ userId: row.user_id, name: row.name, agent: row.agent }));
  });
}

export async function createWorkspaceAgent(
  userId: string,
  workspaceId: string,
  input: { name: string; webhookUrl: string; webhookSecret: string },
): Promise<{ agentId: string; token: string }> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new Error("Agent name must be between 2 and 80 characters");
  const webhookUrl = assertWebhookUrl(input.webhookUrl);
  const secret = input.webhookSecret.trim();
  if (secret.length < 8 || secret.length > 200) {
    throw new Error("Webhook secret must be between 8 and 200 characters");
  }
  const agentUserId = crypto.randomUUID();
  const email = `agent+${agentUserId}@agents.atrium.local`;
  const ciphertext = encryptSecret(secret);

  const agentId = await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "integration.manage");
    const created = await tx.execute<{ id: string }>(sql`
      select create_workspace_agent(
        ${workspaceId}::uuid,
        ${agentUserId},
        ${name},
        ${email},
        ${webhookUrl},
        ${ciphertext}
      ) as id
    `);
    const id = created[0]?.id;
    if (!id) throw new Error("Agent was not created");
    return id;
  });

  const issued = await createMcpToken(agentUserId, {
    name: `${name} MCP`,
    workspaceId,
    scopes: ["read", "write"],
  });
  return { agentId, token: issued.token };
}

export async function disableWorkspaceAgent(userId: string, workspaceId: string, agentId: string): Promise<void> {
  const agentUserId = await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "integration.manage");
    const rows = await tx.execute<{ user_id: string }>(sql`
      select disable_workspace_agent(${workspaceId}::uuid, ${agentId}::uuid) as user_id
    `);
    const id = rows[0]?.user_id;
    if (!id) throw new Error("Agent was not disabled");
    return id;
  });
  await withUser(agentUserId, async (tx) => {
    await tx.execute(sql`
      update mcp_tokens
      set revoked_at = now()
      where user_id = current_setting('app.current_user_id', true)
        and workspace_id = ${workspaceId}::uuid
        and revoked_at is null
    `);
  });
}

export async function enqueueAgentDispatch(
  tx: Tx,
  input: {
    workspaceId: string;
    taskId: string;
    version: number;
    assigneeUserId: string | null;
    title: string;
    description: string;
    projectId: string;
    issueCategory: string | null;
    issueType: string | null;
  },
): Promise<string | null> {
  if (!input.assigneeUserId) return null;
  const payload = {
    event: "task.todo",
    taskId: input.taskId,
    version: input.version,
    title: input.title,
    description: input.description,
    projectId: input.projectId,
    issueCategory: input.issueCategory,
    issueType: input.issueType,
  };
  const rows = await tx.execute<{ id: string }>(sql`
    insert into agent_dispatches (workspace_id, agent_id, task_id, task_version, payload)
    select ${input.workspaceId}::uuid, a.id, ${input.taskId}::uuid, ${input.version}, ${JSON.stringify(payload)}::jsonb
    from workspace_agents a
    where a.workspace_id = ${input.workspaceId}::uuid
      and a.user_id = ${input.assigneeUserId}
      and a.disabled_at is null
    on conflict (task_id, task_version) do nothing
    returning id
  `);
  return rows[0]?.id ?? null;
}
