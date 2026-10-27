import { sql } from "drizzle-orm";
import { writeAudit } from "../audit";
import { can } from "../authz/permissions";
import { currentRole } from "../authz/membership";
import { withUser } from "../db/client";

export type WorkspaceNoteSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

export type WorkspaceNote = WorkspaceNoteSummary & {
  body: string;
};

const TITLE_LIMIT = 200;
const BODY_LIMIT = 20_000;

export function draftNoteTitle(title: string, body: string): string {
  const explicit = title.trim().replace(/\s+/g, " ");
  if (explicit) return explicit.slice(0, TITLE_LIMIT);
  const firstLine = body
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  const fromBody = (firstLine ?? "").replace(/^#+\s*/, "").replace(/\s+/g, " ").slice(0, 80).trim();
  return fromBody || "Untitled note";
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function listWorkspaceNotes(
  userId: string,
  workspaceId: string,
  options: { query?: string; id?: string } = {},
): Promise<{ notes: WorkspaceNoteSummary[]; active: WorkspaceNote | null }> {
  return withUser(userId, async (tx) => {
    await currentRole(tx, workspaceId);
    const query = options.query?.trim() || null;
    const pattern = query ? `%${query}%` : null;
    const rows = await tx.execute<{ id: string; title: string; updated_at: Date | string }>(sql`
      select id, title, updated_at
      from workspace_notes
      where workspace_id = ${workspaceId}::uuid
        and (
          ${pattern}::text is null
          or title ilike ${pattern}
          or body ilike ${pattern}
        )
      order by updated_at desc
      limit 200
    `);
    const notes = rows.map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: iso(row.updated_at),
    }));
    const requested = options.id?.trim() || "";
    const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requested)
      ? requested
      : null;
    if (!id) return { notes, active: null };
    const activeRows = await tx.execute<{ id: string; title: string; body: string; updated_at: Date | string }>(sql`
      select id, title, body, updated_at
      from workspace_notes
      where workspace_id = ${workspaceId}::uuid
        and id = ${id}::uuid
    `);
    const active = activeRows[0];
    if (!active) return { notes, active: null };
    return {
      notes,
      active: {
        id: active.id,
        title: active.title,
        body: active.body,
        updatedAt: iso(active.updated_at),
      },
    };
  });
}

export async function createWorkspaceNote(
  userId: string,
  workspaceId: string,
  input: { title: string; body: string },
): Promise<string> {
  const body = input.body.trim();
  if (!body) throw new Error("Write something before saving");
  if (body.length > BODY_LIMIT) throw new Error("Notes can be up to 20,000 characters");
  const title = draftNoteTitle(input.title, body);
  return withUser(userId, async (tx) => {
    const role = await currentRole(tx, workspaceId);
    if (!can(role, "task.write")) {
      throw new Error("You can read notes in this workspace, but not save new ones.");
    }
    const rows = await tx.execute<{ id: string }>(sql`
      insert into workspace_notes (workspace_id, title, body, author_user_id)
      values (${workspaceId}::uuid, ${title}, ${body}, ${userId})
      returning id
    `);
    const id = rows[0]?.id;
    if (!id) throw new Error("Could not save the note");
    await writeAudit(tx, {
      workspaceId,
      action: "note.created",
      entityType: "note",
      entityId: id,
    });
    return id;
  });
}
