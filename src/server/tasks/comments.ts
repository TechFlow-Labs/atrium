import { sql } from "drizzle-orm";
import { writeAudit } from "../audit";
import { requireAction } from "../authz/membership";
import { withUser, type Tx } from "../db/client";
import { getAdapter } from "../integrations/registry";
import { ensureFreshCredentials, isUnauthorizedProviderError } from "../integrations/token-refresh";
import type { FieldMappings, ProviderId, RemoteComment, StoredCredential } from "../integrations/types";

export type TaskCommentView = {
  id: string;
  body: string;
  authorLabel: string;
  createdAt: string;
  url: string | null;
  source: "native" | ProviderId;
};

export type TaskCommentsResult = {
  comments: TaskCommentView[];
  source: "native" | ProviderId;
  canComment: boolean;
  unavailableReason: string | null;
};

type TaskCommentContext = {
  taskId: string;
  workspaceId: string;
  projectId: string;
  provider: ProviderId | null;
  providerTaskId: string | null;
  providerProjectId: string | null;
  integrationId: string | null;
  credentialCiphertext: string | null;
  integrationStatus: string | null;
  fieldMappings: FieldMappings | null;
};

async function loadCommentContext(tx: Tx, taskId: string): Promise<TaskCommentContext | null> {
  const rows = await tx.execute<{
    task_id: string;
    workspace_id: string;
    project_id: string;
    provider: ProviderId | null;
    provider_task_id: string | null;
    provider_project_id: string | null;
    integration_id: string | null;
    credential_ciphertext: string | null;
    integration_status: string | null;
    field_mappings: FieldMappings | null;
  }>(sql`
    select t.id as task_id,
           t.workspace_id,
           t.project_id,
           t.provider,
           e.provider_id as provider_task_id,
           c.provider_project_id,
           c.integration_id,
           i.credential_ciphertext,
           i.status as integration_status,
           c.field_mappings
    from tasks t
    left join external_records e
      on e.local_entity_id = t.id
     and e.entity_type = 'issue'
     and e.deleted_at is null
    left join project_connections c on c.project_id = t.project_id
    left join integrations i on i.id = c.integration_id
    where t.id = ${taskId}::uuid
      and t.deleted_at is null
    limit 1
  `);
  const row = rows[0];
  if (!row) return null;
  return {
    taskId: row.task_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    provider: row.provider,
    providerTaskId: row.provider_task_id,
    providerProjectId: row.provider_project_id,
    integrationId: row.integration_id,
    credentialCiphertext: row.credential_ciphertext,
    integrationStatus: row.integration_status,
    fieldMappings: row.field_mappings,
  };
}

function toView(comment: RemoteComment, source: ProviderId): TaskCommentView {
  return {
    id: comment.providerId,
    body: comment.body,
    authorLabel: comment.authorLabel,
    createdAt: comment.createdAt,
    url: comment.url,
    source,
  };
}

async function listNativeComments(tx: Tx, taskId: string): Promise<TaskCommentView[]> {
  const rows = await tx.execute<{
    id: string;
    body: string;
    author_label: string;
    created_at: Date;
  }>(sql`
    select c.id, c.body, coalesce(u.name, 'Member') as author_label, c.created_at
    from task_comments c
    left join "user" u on u.id = c.author_user_id
    where c.task_id = ${taskId}::uuid
    order by c.created_at asc
    limit 200
  `);
  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    authorLabel: row.author_label,
    createdAt: new Date(row.created_at).toISOString(),
    url: null,
    source: "native" as const,
  }));
}

export async function listTaskComments(userId: string, taskId: string): Promise<TaskCommentsResult | null> {
  return withUser(userId, async (tx) => {
    const ctx = await loadCommentContext(tx, taskId);
    if (!ctx) return null;
    await requireAction(tx, ctx.workspaceId, "task.read");

    if (!ctx.provider) {
      const comments = await listNativeComments(tx, taskId);
      return {
        comments,
        source: "native",
        canComment: true,
        unavailableReason: null,
      };
    }

    if (!ctx.integrationId || ctx.integrationStatus !== "connected" || !ctx.credentialCiphertext) {
      return {
        comments: [],
        source: ctx.provider,
        canComment: false,
        unavailableReason: "Reconnect this integration to load and post comments.",
      };
    }
    if (!ctx.providerTaskId || !ctx.providerProjectId) {
      return {
        comments: [],
        source: ctx.provider,
        canComment: false,
        unavailableReason: "Comments will be available after this task finishes syncing to the provider.",
      };
    }

    const adapter = getAdapter(ctx.provider);
    const listComments = adapter.listComments;
    if (!adapter.getCapabilities().comments || !listComments) {
      return {
        comments: [],
        source: ctx.provider,
        canComment: false,
        unavailableReason: `${ctx.provider} comments are not supported yet.`,
      };
    }

    let credentials: StoredCredential;
    try {
      credentials = await ensureFreshCredentials(tx, {
        integrationId: ctx.integrationId,
        workspaceId: ctx.workspaceId,
        provider: ctx.provider,
        ciphertext: ctx.credentialCiphertext,
      });
    } catch (error) {
      return {
        comments: [],
        source: ctx.provider,
        canComment: false,
        unavailableReason:
          error instanceof Error ? error.message : "Reconnect this integration to load and post comments.",
      };
    }

    const load = async (creds: StoredCredential) =>
      listComments(
        {
          tx,
          integrationId: ctx.integrationId!,
          credentials: creds,
          mappings: ctx.fieldMappings ?? adapter.defaultMappings(),
        },
        {
          providerTaskId: ctx.providerTaskId!,
          providerProjectId: ctx.providerProjectId!,
        },
      );

    try {
      let page;
      try {
        page = await load(credentials);
      } catch (error) {
        if (!isUnauthorizedProviderError(error) || !credentials.refreshToken) throw error;
        const refreshed = await ensureFreshCredentials(
          tx,
          {
            integrationId: ctx.integrationId,
            workspaceId: ctx.workspaceId,
            provider: ctx.provider,
            ciphertext: ctx.credentialCiphertext,
          },
          true,
        );
        page = await load(refreshed);
      }
      return {
        comments: page.items.map((comment) => toView(comment, ctx.provider!)),
        source: ctx.provider,
        canComment: Boolean(adapter.createComment),
        unavailableReason: null,
      };
    } catch (error) {
      return {
        comments: [],
        source: ctx.provider,
        canComment: false,
        unavailableReason: error instanceof Error ? error.message : "Could not load comments from the provider.",
      };
    }
  });
}

export async function addTaskComment(userId: string, taskId: string, body: string): Promise<void> {
  const text = body.trim();
  if (text.length < 1 || text.length > 10000) {
    throw new Error("Comment must be between 1 and 10,000 characters");
  }

  await withUser(userId, async (tx) => {
    const ctx = await loadCommentContext(tx, taskId);
    if (!ctx) throw new Error("Task not found");
    await requireAction(tx, ctx.workspaceId, "task.write");

    if (!ctx.provider) {
      await tx.execute(sql`
        insert into task_comments (workspace_id, task_id, body, author_user_id)
        values (
          ${ctx.workspaceId}::uuid,
          ${taskId}::uuid,
          ${text},
          ${userId}
        )
      `);
      await writeAudit(tx, {
        workspaceId: ctx.workspaceId,
        action: "task.comment_added",
        entityType: "task",
        entityId: taskId,
        metadata: { source: "native" },
      });
      return;
    }

    if (!ctx.integrationId || ctx.integrationStatus !== "connected" || !ctx.credentialCiphertext) {
      throw new Error("Reconnect this integration before commenting");
    }
    if (!ctx.providerTaskId || !ctx.providerProjectId) {
      throw new Error("Wait for this task to finish syncing before commenting");
    }

    const adapter = getAdapter(ctx.provider);
    if (!adapter.getCapabilities().comments || !adapter.createComment) {
      throw new Error(`${ctx.provider} comments are not supported yet`);
    }
    const credentials = await ensureFreshCredentials(tx, {
      integrationId: ctx.integrationId,
      workspaceId: ctx.workspaceId,
      provider: ctx.provider,
      ciphertext: ctx.credentialCiphertext,
    });

    try {
      await adapter.createComment(
        {
          tx,
          integrationId: ctx.integrationId,
          credentials,
          mappings: ctx.fieldMappings ?? adapter.defaultMappings(),
        },
        {
          providerTaskId: ctx.providerTaskId,
          providerProjectId: ctx.providerProjectId,
          body: text,
        },
      );
    } catch (error) {
      if (!isUnauthorizedProviderError(error) || !credentials.refreshToken) throw error;
      const refreshed = await ensureFreshCredentials(
        tx,
        {
          integrationId: ctx.integrationId,
          workspaceId: ctx.workspaceId,
          provider: ctx.provider,
          ciphertext: ctx.credentialCiphertext,
        },
        true,
      );
      await adapter.createComment(
        {
          tx,
          integrationId: ctx.integrationId,
          credentials: refreshed,
          mappings: ctx.fieldMappings ?? adapter.defaultMappings(),
        },
        {
          providerTaskId: ctx.providerTaskId,
          providerProjectId: ctx.providerProjectId,
          body: text,
        },
      );
    }

    await writeAudit(tx, {
      workspaceId: ctx.workspaceId,
      action: "task.comment_added",
      entityType: "task",
      entityId: taskId,
      metadata: { source: ctx.provider },
    });
  });
}
