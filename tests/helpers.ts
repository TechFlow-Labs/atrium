import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { closeDb, getDb } from "@/server/db/client";

export async function resetDatabase(): Promise<void> {
  const url = process.env.DATABASE_URL_MIGRATE;
  if (!url) throw new Error("DATABASE_URL_MIGRATE is required");
  const admin = postgres(url, { max: 1 });
  await admin.unsafe(`
    TRUNCATE TABLE
      webhook_deliveries,
      jobs,
      outbox_events,
      sync_events,
      conflicts,
      external_records,
      integration_sync_cursors,
      project_connections,
      fake_provider_tasks,
      fake_provider_projects,
      integrations,
      oauth_app_settings,
      tasks,
      milestones,
      projects,
      workspace_invitations,
      workspace_members,
      audit_events,
      oauth_states,
      user_preferences,
      rate_limit_buckets,
      workspaces,
      session,
      account,
      verification,
      "user"
    RESTART IDENTITY CASCADE
  `);
  await admin.end();
}

export async function insertUser(name: string, email: string): Promise<string> {
  const id = randomUUID();
  await getDb().execute(sql`
    insert into "user" (id, name, email, email_verified)
    values (${id}, ${name}, ${email}, true)
  `);
  return id;
}

export async function shutdown(): Promise<void> {
  await closeDb();
}
