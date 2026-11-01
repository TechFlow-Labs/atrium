import { sql } from "drizzle-orm";
import { getAdapter } from "../integrations/registry";
import { ensureFreshCredentials } from "../integrations/token-refresh";
import { ProviderError, type FieldMappings, type ProviderId, type RemoteTask } from "../integrations/types";
import { logError } from "../log";
import { withWorker, type Tx } from "../db/client";
import { textArray } from "../db/sql";
import { nextDelayMs } from "./backoff";
import { decideInbound } from "./authority";
import {
  type CanonicalField,
  type CanonicalSnapshot,
  fingerprintSnapshot,
} from "./fingerprint";

type OutboxPayload = {
  taskId: string;
  projectId: string;
  connectionId: string;
  providerProjectId: string;
  providerTaskId: string | null;
  kind: "create" | "update" | "archive";
  touched: CanonicalField[];
  fields: {
    title: string;
    description: string;
    status: RemoteTask["status"];
    priority: RemoteTask["priority"];
    dueAt: string | null;
    assigneeProviderId: string | null;
  };
};

type ClaimedOutbox = {
  id: string;
  workspace_id: string;
  integration_id: string | null;
  operation_id: string;
  type: string;
  payload: OutboxPayload;
  attempts: number;
  max_attempts: number;
};

type ClaimedJob = {
  id: string;
  workspace_id: string | null;
  kind: string;
  payload: { deliveryId?: string; connectionId?: string };
  attempts: number;
  max_attempts: number;
};

function snapshotFromRemote(remote: RemoteTask): CanonicalSnapshot {
  return {
    title: remote.title,
    description: remote.description,
    status: remote.status,
    priority: remote.priority,
    dueAt: remote.dueAt,
    assignee: remote.assigneeProviderId,
  };
}

function snapshotFromTask(task: {
  title: string;
  description: string;
  status: CanonicalSnapshot["status"];
  priority: CanonicalSnapshot["priority"];
  due_at: Date | string | null;
  assignee_provider_id: string | null;
  assignee_user_id: string | null;
  ownership_mode: string;
}): CanonicalSnapshot {
  const due = task.due_at ? new Date(task.due_at).toISOString() : null;
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueAt: due,
    assignee: task.ownership_mode === "external" ? task.assignee_provider_id : task.assignee_user_id,
  };
}

async function rememberFingerprint(tx: Tx, input: {
  workspaceId: string;
  integrationId: string;
  providerId: string;
  taskId: string;
  remote: RemoteTask;
  operationId: string | null;
}): Promise<void> {
  const fingerprint = fingerprintSnapshot(snapshotFromRemote(input.remote));
  await tx.execute(sql`
    insert into external_records (
      workspace_id, integration_id, entity_type, provider_id, local_entity_type, local_entity_id,
      provider_updated_at, fingerprint, last_outbound_fingerprint, last_outbound_operation_id,
      recent_outbound_fingerprints, raw
    ) values (
      ${input.workspaceId}::uuid,
      ${input.integrationId}::uuid,
      'issue',
      ${input.providerId},
      'task',
      ${input.taskId}::uuid,
      ${input.remote.updatedAt ? new Date(input.remote.updatedAt).toISOString() : null},
      ${fingerprint},
      ${input.operationId ? fingerprint : null},
      ${input.operationId},
      ${textArray(input.operationId ? [fingerprint] : [])},
      ${JSON.stringify(input.remote.raw)}::jsonb
    )
    on conflict (integration_id, entity_type, provider_id) do update set
      local_entity_id = excluded.local_entity_id,
      provider_updated_at = excluded.provider_updated_at,
      fingerprint = excluded.fingerprint,
      last_outbound_fingerprint = coalesce(excluded.last_outbound_fingerprint, external_records.last_outbound_fingerprint),
      last_outbound_operation_id = coalesce(excluded.last_outbound_operation_id, external_records.last_outbound_operation_id),
      recent_outbound_fingerprints = (
        case when ${input.operationId}::text is null then external_records.recent_outbound_fingerprints
        else (array[${fingerprint}]::text[] || external_records.recent_outbound_fingerprints)[1:5]
        end
      ),
      raw = excluded.raw,
      deleted_at = null
  `);
}

async function writeProjection(tx: Tx, taskId: string, remote: RemoteTask, provider: ProviderId): Promise<void> {
  await tx.execute(sql`
    update tasks set
      title = ${remote.title},
      description = ${remote.description},
      status = ${remote.archived ? "cancelled" : remote.status},
      priority = ${remote.priority},
      due_at = ${remote.dueAt ? new Date(remote.dueAt).toISOString() : null},
      assignee_provider_id = ${remote.assigneeProviderId},
      assignee_label = ${remote.assigneeLabel},
      provider = ${provider},
      external_url = ${remote.url},
      sync_state = ${remote.archived ? "tombstone" : "synced"},
      sync_error = null,
      deleted_at = ${remote.archived ? new Date().toISOString() : null},
      version = version + 1
    where id = ${taskId}::uuid
  `);
}

export async function applyInboundTask(input: {
  integrationId: string;
  workspaceId: string;
  provider: ProviderId;
  remote: RemoteTask;
}): Promise<"applied" | "skipped" | "conflict" | "created"> {
  return withWorker(async (tx) => {
    const connections = await tx.execute<{
      project_id: string;
      ownership_mode: "native" | "external" | "hybrid";
      sync_inbound: boolean;
    }>(sql`
      select c.project_id, p.ownership_mode, c.sync_inbound
      from project_connections c
      join projects p on p.id = c.project_id
      where c.integration_id = ${input.integrationId}::uuid
        and c.provider_project_id = ${input.remote.providerProjectId}
    `);
    const connection = connections[0];
    if (!connection || !connection.sync_inbound) return "skipped";
    if (connection.ownership_mode === "hybrid") return "skipped";

    const records = await tx.execute<{
      local_entity_id: string | null;
      recent_outbound_fingerprints: string[] | null;
    }>(sql`
      select local_entity_id, recent_outbound_fingerprints
      from external_records
      where integration_id = ${input.integrationId}::uuid
        and entity_type = 'issue'
        and provider_id = ${input.remote.providerId}
    `);
    const record = records[0];
    if (!record?.local_entity_id) {
      if (connection.ownership_mode !== "external") {
        await tx.execute(sql`
          insert into conflicts (workspace_id, integration_id, field, local_value, remote_value, status)
          values (
            ${input.workspaceId}::uuid,
            ${input.integrationId}::uuid,
            'title',
            'null'::jsonb,
            ${JSON.stringify(input.remote.title)}::jsonb,
            'open'
          )
        `);
        return "conflict";
      }
      const inserted = await tx.execute<{ id: string }>(sql`
        insert into tasks (
          workspace_id, project_id, title, description, status, priority, due_at,
          assignee_provider_id, assignee_label, provider, external_url, sync_state, created_by
        ) values (
          ${input.workspaceId}::uuid,
          ${connection.project_id}::uuid,
          ${input.remote.title},
          ${input.remote.description},
          ${input.remote.status},
          ${input.remote.priority},
          ${input.remote.dueAt ? new Date(input.remote.dueAt).toISOString() : null},
          ${input.remote.assigneeProviderId},
          ${input.remote.assigneeLabel},
          ${input.provider},
          ${input.remote.url},
          'synced',
          null
        ) returning id
      `);
      const taskId = inserted[0]?.id;
      if (!taskId) throw new Error("Projection was not created");
      await rememberFingerprint(tx, {
        workspaceId: input.workspaceId,
        integrationId: input.integrationId,
        providerId: input.remote.providerId,
        taskId,
        remote: input.remote,
        operationId: null,
      });
      return "created";
    }

    const tasks = await tx.execute<{
      id: string;
      title: string;
      description: string;
      status: CanonicalSnapshot["status"];
      priority: CanonicalSnapshot["priority"];
      due_at: Date | null;
      assignee_provider_id: string | null;
      assignee_user_id: string | null;
    }>(sql`select * from tasks where id = ${record.local_entity_id}::uuid`);
    const task = tasks[0];
    if (!task) return "skipped";
    const pending = await tx.execute<{ payload: OutboxPayload }>(sql`
      select payload from outbox_events
      where integration_id = ${input.integrationId}::uuid
        and status in ('pending', 'processing')
    `);
    const pendingFields = pending
      .map((row) => row.payload)
      .filter((payload) => payload?.taskId === task.id)
      .flatMap((payload) => payload.touched ?? []);
    const decision = decideInbound({
      ownership: connection.ownership_mode,
      projection: snapshotFromTask({ ...task, ownership_mode: connection.ownership_mode }),
      incoming: snapshotFromRemote(input.remote),
      pendingOutboundFields: pendingFields,
      recentOutboundFingerprints: record.recent_outbound_fingerprints ?? [],
    });
    if (decision.type === "skip_echo") {
      await tx.execute(sql`
        insert into sync_events (workspace_id, integration_id, direction, entity_type, provider_id, status, fingerprint)
        values (${input.workspaceId}::uuid, ${input.integrationId}::uuid, 'inbound', 'issue', ${input.remote.providerId}, 'skipped',
          ${fingerprintSnapshot(snapshotFromRemote(input.remote))})
      `);
      return "skipped";
    }
    if (decision.type === "conflict") {
      for (const field of decision.fields) {
        const local = snapshotFromTask({ ...task, ownership_mode: connection.ownership_mode })[field];
        const remote = snapshotFromRemote(input.remote)[field];
        await tx.execute(sql`
          insert into conflicts (workspace_id, task_id, integration_id, field, local_value, remote_value, status)
          values (
            ${input.workspaceId}::uuid,
            ${task.id}::uuid,
            ${input.integrationId}::uuid,
            ${field},
            ${JSON.stringify(local)}::jsonb,
            ${JSON.stringify(remote)}::jsonb,
            'open'
          )
          on conflict (task_id, field) where status = 'open' do nothing
        `);
      }
      return "conflict";
    }
    await writeProjection(tx, task.id, input.remote, input.provider);
    await rememberFingerprint(tx, {
      workspaceId: input.workspaceId,
      integrationId: input.integrationId,
      providerId: input.remote.providerId,
      taskId: task.id,
      remote: input.remote,
      operationId: null,
    });
    return "applied";
  });
}

export async function tombstoneTask(integrationId: string, workspaceId: string, providerId: string): Promise<void> {
  await withWorker(async (tx) => {
    const rows = await tx.execute<{ local_entity_id: string | null }>(sql`
      select local_entity_id from external_records
      where integration_id = ${integrationId}::uuid and entity_type = 'issue' and provider_id = ${providerId}
    `);
    const taskId = rows[0]?.local_entity_id;
    if (taskId) {
      await tx.execute(sql`
        update tasks set deleted_at = coalesce(deleted_at, now()), sync_state = 'tombstone', version = version + 1
        where id = ${taskId}::uuid
      `);
    }
    await tx.execute(sql`
      update external_records set deleted_at = coalesce(deleted_at, now())
      where integration_id = ${integrationId}::uuid and entity_type = 'issue' and provider_id = ${providerId}
    `);
    await tx.execute(sql`
      insert into sync_events (workspace_id, integration_id, direction, entity_type, provider_id, status)
      values (${workspaceId}::uuid, ${integrationId}::uuid, 'inbound', 'issue', ${providerId}, 'processed')
    `);
  });
}

async function finishOutbox(id: string, status: "succeeded" | "pending" | "dead", error: string | null, delayMs = 0): Promise<void> {
  await withWorker(async (tx) => {
    await tx.execute(sql`
      update outbox_events set
        status = ${status},
        attempts = case when ${status} = 'succeeded' then attempts else attempts + 1 end,
        next_attempt_at = now() + make_interval(secs => ${Math.ceil(delayMs / 1000)}),
        last_error = ${error},
        locked_at = null,
        locked_by = null
      where id = ${id}::uuid
    `);
    if (status === "dead" || status === "succeeded") {
      await tx.execute(sql`
        update sync_events set status = ${status === "succeeded" ? "processed" : "dead"}, processed_at = now(), error = ${error}
        where operation_id = (select operation_id from outbox_events where id = ${id}::uuid)
          and direction = 'outbound'
      `);
    }
  });
}

export async function processOutboxRow(row: ClaimedOutbox): Promise<void> {
  if (row.attempts >= row.max_attempts) {
    await finishOutbox(row.id, "dead", "Retry limit reached");
    return;
  }
  try {
    const payload = row.payload;
    const remote = await withWorker(async (tx) => {
      const integrations = await tx.execute<{
        id: string;
        workspace_id: string;
        provider: ProviderId;
        status: string;
        credential_ciphertext: string | null;
        field_mappings: FieldMappings;
      }>(sql`
        select i.id, i.workspace_id, i.provider, i.status, i.credential_ciphertext, c.field_mappings
        from integrations i
        join project_connections c on c.integration_id = i.id and c.id = ${payload.connectionId}::uuid
        where i.id = ${row.integration_id}::uuid
      `);
      const integration = integrations[0];
      if (!integration || integration.status !== "connected" || !integration.credential_ciphertext) {
        throw new ProviderError("Integration is disconnected", "unauthorized", false);
      }
      const credentials = await ensureFreshCredentials(tx, {
        integrationId: integration.id,
        workspaceId: integration.workspace_id,
        provider: integration.provider,
        ciphertext: integration.credential_ciphertext,
      });
      const adapter = getAdapter(integration.provider);
      const ctx = {
        tx,
        integrationId: integration.id,
        credentials,
        mappings: integration.field_mappings ?? adapter.defaultMappings(),
      };
      let result: RemoteTask;
      if (payload.kind === "archive") {
        if (!adapter.archiveTask || !payload.providerTaskId) {
          throw new ProviderError("This provider cannot archive tasks", "unsupported", false);
        }
        result = await adapter.archiveTask(ctx, payload.providerTaskId, payload.providerProjectId);
      } else if (payload.kind === "update" && payload.providerTaskId) {
        result = await adapter.updateTask(ctx, payload.providerTaskId, {
          ...payload.fields,
          providerProjectId: payload.providerProjectId,
          operationId: row.operation_id,
        });
      } else {
        result = await adapter.createTask(ctx, {
          ...payload.fields,
          providerProjectId: payload.providerProjectId,
          operationId: row.operation_id,
        });
      }
      await writeProjection(tx, payload.taskId, result, integration.provider);
      await rememberFingerprint(tx, {
        workspaceId: row.workspace_id,
        integrationId: integration.id,
        providerId: result.providerId,
        taskId: payload.taskId,
        remote: result,
        operationId: row.operation_id,
      });
      return result;
    });
    void remote;
    await finishOutbox(row.id, "succeeded", null);
  } catch (error) {
    const providerError = error instanceof ProviderError ? error : null;
    const retryable = providerError ? providerError.retryable : true;
    const message = error instanceof Error
      ? `${error.message}${error.cause instanceof Error ? ` :: ${error.cause.message}` : ""}`
      : "Sync failed";
    const attempts = row.attempts + 1;
    if (!retryable || attempts >= row.max_attempts) {
      await finishOutbox(row.id, "dead", message);
      await withWorker(async (tx) => {
        await tx.execute(sql`
          update tasks set sync_state = 'error', sync_error = ${message}
          where id = ${(row.payload).taskId}::uuid
        `);
      });
      logError("outbox failed", { outboxId: row.id, message });
      return;
    }
    const delay = providerError?.retryAfterMs ?? nextDelayMs(attempts);
    await finishOutbox(row.id, "pending", message, delay);
  }
}

export async function reconcileConnection(connectionId: string): Promise<void> {
  const meta = await withWorker(async (tx) => {
    const rows = await tx.execute<{
      integration_id: string;
      workspace_id: string;
      provider: ProviderId;
      provider_project_id: string;
      field_mappings: FieldMappings;
      credential_ciphertext: string | null;
      status: string;
      cursor: string | null;
    }>(sql`
      select c.integration_id, c.workspace_id, i.provider, c.provider_project_id, c.field_mappings,
             i.credential_ciphertext, i.status, s.cursor
      from project_connections c
      join integrations i on i.id = c.integration_id
      left join integration_sync_cursors s on s.integration_id = i.id and s.resource = 'issues'
      where c.id = ${connectionId}::uuid and c.sync_inbound = true
    `);
    return rows[0] ?? null;
  });
  if (!meta || meta.status !== "connected" || !meta.credential_ciphertext) return;
  const credentials = await withWorker(async (tx) =>
    ensureFreshCredentials(tx, {
      integrationId: meta.integration_id,
      workspaceId: meta.workspace_id,
      provider: meta.provider,
      ciphertext: meta.credential_ciphertext,
    }),
  ).catch(() => null);
  if (!credentials) return;
  const adapter = getAdapter(meta.provider);
  const startedAtNull = !meta.cursor;
  const seen: string[] = [];
  let cursor = meta.cursor;
  let guard = 0;
  try {
    do {
      const page = await withWorker(async (tx) =>
        adapter.listTasks(
          { tx, integrationId: meta.integration_id, credentials, mappings: meta.field_mappings ?? adapter.defaultMappings() },
          { providerProjectId: meta.provider_project_id, cursor },
        ),
      );
      for (const remote of page.items) {
        seen.push(remote.providerId);
        await applyInboundTask({
          integrationId: meta.integration_id,
          workspaceId: meta.workspace_id,
          provider: meta.provider,
          remote: { ...remote, providerProjectId: remote.providerProjectId || meta.provider_project_id },
        });
      }
      cursor = page.nextCursor;
      guard += 1;
    } while (cursor && guard < 20);
    if (startedAtNull && !cursor) {
      await withWorker(async (tx) => {
        const existing = await tx.execute<{ provider_id: string }>(sql`
          select provider_id from external_records
          where integration_id = ${meta.integration_id}::uuid and entity_type = 'issue' and deleted_at is null
        `);
        for (const row of existing) {
          if (!seen.includes(row.provider_id)) {
            await tx.execute(sql`
              update tasks set deleted_at = coalesce(deleted_at, now()), sync_state = 'tombstone'
              where id in (
                select local_entity_id from external_records
                where integration_id = ${meta.integration_id}::uuid and provider_id = ${row.provider_id} and local_entity_id is not null
              )
            `);
            await tx.execute(sql`
              update external_records set deleted_at = now()
              where integration_id = ${meta.integration_id}::uuid and provider_id = ${row.provider_id}
            `);
          }
        }
      });
    }
    await withWorker(async (tx) => {
      await tx.execute(sql`
        insert into integration_sync_cursors (workspace_id, integration_id, resource, cursor, last_success_at, last_error)
        values (${meta.workspace_id}::uuid, ${meta.integration_id}::uuid, 'issues', ${cursor}, now(), null)
        on conflict (integration_id, resource) do update set
          cursor = excluded.cursor,
          last_success_at = now(),
          last_error = null,
          updated_at = now()
      `);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reconciliation failed";
    await withWorker(async (tx) => {
      await tx.execute(sql`
        insert into integration_sync_cursors (workspace_id, integration_id, resource, cursor, last_error_at, last_error)
        values (${meta.workspace_id}::uuid, ${meta.integration_id}::uuid, 'issues', ${cursor}, now(), ${message})
        on conflict (integration_id, resource) do update set
          last_error_at = now(),
          last_error = excluded.last_error,
          updated_at = now()
      `);
    });
    throw error;
  }
}

async function finishJob(id: string, status: "succeeded" | "pending" | "dead", error: string | null, delayMs = 0) {
  await withWorker(async (tx) => {
    await tx.execute(sql`
      update jobs set
        status = ${status},
        attempts = case when ${status} = 'succeeded' then attempts else attempts + 1 end,
        run_at = now() + make_interval(secs => ${Math.ceil(delayMs / 1000)}),
        last_error = ${error},
        locked_at = null,
        locked_by = null
      where id = ${id}::uuid
    `);
  });
}

export async function processJob(row: ClaimedJob): Promise<void> {
  if (row.attempts >= row.max_attempts) {
    await finishJob(row.id, "dead", "Retry limit reached");
    return;
  }
  try {
    if (row.kind === "process_webhook" && row.payload.deliveryId) {
      await processWebhookDelivery(row.payload.deliveryId);
    } else if (row.kind === "reconcile" && row.payload.connectionId) {
      await reconcileConnection(row.payload.connectionId);
    }
    await finishJob(row.id, "succeeded", null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job failed";
    const retryable = !(error instanceof ProviderError) || error.retryable;
    const attempts = row.attempts + 1;
    if (!retryable || attempts >= row.max_attempts) {
      await finishJob(row.id, "dead", message);
      return;
    }
    await finishJob(row.id, "pending", message, error instanceof ProviderError && error.retryAfterMs ? error.retryAfterMs : nextDelayMs(attempts));
  }
}

export async function processWebhookDelivery(deliveryId: string): Promise<void> {
  const delivery = await withWorker(async (tx) => {
    const rows = await tx.execute<{
      id: string;
      provider: ProviderId;
      integration_id: string | null;
      workspace_id: string | null;
      payload: unknown;
      status: string;
      signature_valid: boolean;
    }>(sql`select * from webhook_deliveries where id = ${deliveryId}::uuid`);
    return rows[0] ?? null;
  });
  if (!delivery || !delivery.signature_valid || !delivery.integration_id || !delivery.workspace_id) return;
  if (delivery.status === "processed") return;
  const integration = await withWorker(async (tx) => {
    const rows = await tx.execute<{
      provider: ProviderId;
      workspace_id: string;
      credential_ciphertext: string | null;
      field_mappings: FieldMappings | null;
    }>(sql`
      select i.provider, i.workspace_id, i.credential_ciphertext, c.field_mappings
      from integrations i
      left join project_connections c on c.integration_id = i.id
      where i.id = ${delivery.integration_id}::uuid
      limit 1
    `);
    return rows[0] ?? null;
  });
  if (!integration?.credential_ciphertext) throw new ProviderError("Integration is disconnected", "unauthorized", false);
  const credentials = await withWorker(async (tx) =>
    ensureFreshCredentials(tx, {
      integrationId: delivery.integration_id!,
      workspaceId: integration.workspace_id,
      provider: integration.provider,
      ciphertext: integration.credential_ciphertext,
    }),
  );
  const adapter = getAdapter(delivery.provider);
  const stored = delivery.payload as { body?: unknown; event?: string | null };
  const rawBody = JSON.stringify(stored?.body ?? delivery.payload);
  const headers: Record<string, string> = {};
  if (stored?.event) headers["x-github-event"] = stored.event;
  const parsed = await withWorker(async (tx) =>
    adapter.parseWebhook(
      {
        tx,
        integrationId: delivery.integration_id!,
        credentials,
        mappings: integration.field_mappings ?? adapter.defaultMappings(),
      },
      { rawBody, headers },
    ),
  );
  for (const event of parsed.events) {
    if (event.kind === "task.delete") {
      await tombstoneTask(delivery.integration_id, delivery.workspace_id, event.providerId);
    } else if (event.kind === "task.upsert") {
      await applyInboundTask({
        integrationId: delivery.integration_id,
        workspaceId: delivery.workspace_id,
        provider: delivery.provider,
        remote: event.task,
      });
    } else {
      await withWorker(async (tx) => {
        await tx.execute(sql`
          insert into external_records (
            workspace_id, integration_id, entity_type, provider_id, raw
          ) values (
            ${delivery.workspace_id}::uuid,
            ${delivery.integration_id}::uuid,
            ${event.entityType},
            ${event.providerId},
            ${JSON.stringify({ title: event.title, url: event.url, ...event.raw })}::jsonb
          )
          on conflict (integration_id, entity_type, provider_id) do update set raw = excluded.raw, deleted_at = null
        `);
      });
    }
  }
  await withWorker(async (tx) => {
    await tx.execute(sql`
      update webhook_deliveries set status = 'processed', processed_at = now() where id = ${deliveryId}::uuid
    `);
  });
}

export async function claimAndRun(workerId: string): Promise<number> {
  const outbox = await withWorker(async (tx) => {
    return tx.execute<ClaimedOutbox>(sql`select * from claim_outbox(${workerId}, 10)`);
  });
  for (const row of outbox) {
    await processOutboxRow(row);
  }
  const jobs = await withWorker(async (tx) => {
    return tx.execute<ClaimedJob>(sql`select * from claim_jobs(${workerId}, 10)`);
  });
  for (const job of jobs) {
    await processJob(job);
  }
  return outbox.length + jobs.length;
}

export async function scheduleReconcile(now = Date.now()): Promise<void> {
  const bucket = Math.floor(now / (5 * 60 * 1000));
  await withWorker(async (tx) => {
    const connections = await tx.execute<{ id: string; workspace_id: string; last_success_at: Date | null }>(sql`
      select c.id, c.workspace_id, s.last_success_at
      from project_connections c
      join integrations i on i.id = c.integration_id
      left join integration_sync_cursors s on s.integration_id = i.id and s.resource = 'issues'
      where c.sync_inbound = true and i.status = 'connected' and i.credential_ciphertext is not null
    `);
    for (const connection of connections) {
      const stale = !connection.last_success_at || now - new Date(connection.last_success_at).getTime() > 5 * 60 * 1000;
      if (!stale) continue;
      await tx.execute(sql`
        insert into jobs (workspace_id, kind, payload, status, idempotency_key)
        values (
          ${connection.workspace_id}::uuid,
          'reconcile',
          ${JSON.stringify({ connectionId: connection.id })}::jsonb,
          'pending',
          ${`reconcile:${connection.id}:${bucket}`}
        )
        on conflict (idempotency_key) do nothing
      `);
    }
  });
}

export function startEmbeddedWorker(): void {
  const state = globalThis as { __atriumWorker?: NodeJS.Timeout };
  if (state.__atriumWorker) return;
  state.__atriumWorker = setInterval(() => {
    scheduleReconcile()
      .then(() => claimAndRun("embedded"))
      .catch((error: unknown) => {
        logError("embedded worker failed", { error: error instanceof Error ? error.message : "unknown" });
      });
  }, 2000);
  state.__atriumWorker.unref?.();
}
