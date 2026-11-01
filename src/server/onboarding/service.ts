import { sql } from "drizzle-orm";
import { withUser } from "../db/client";

export async function getOnboardingPending(userId: string): Promise<boolean> {
  return withUser(userId, async (tx) => {
    const rows = await tx.execute<{ onboarding_pending: boolean }>(sql`
      select onboarding_pending from user_preferences
      where user_id = current_setting('app.current_user_id', true)
    `);
    return rows[0]?.onboarding_pending === true;
  });
}

export async function setOnboardingPending(userId: string, pending: boolean): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.execute(sql`
      insert into user_preferences (user_id, timezone, theme, palette, notify_sync_errors, notify_assignments, onboarding_pending)
      values (current_setting('app.current_user_id', true), 'UTC', 'light', 'grove', true, true, ${pending})
      on conflict (user_id) do update set
        onboarding_pending = excluded.onboarding_pending,
        updated_at = now()
    `);
  });
}

// Saves only the profile fields the onboarding profile step owns, so theme and
// palette choices made elsewhere are left alone.
export async function saveProfilePreferences(
  userId: string,
  input: { timezone: string; notifySync: boolean; notifyAssignments: boolean },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.execute(sql`
      insert into user_preferences (user_id, timezone, theme, palette, notify_sync_errors, notify_assignments)
      values (
        current_setting('app.current_user_id', true),
        ${input.timezone},
        'light',
        'grove',
        ${input.notifySync},
        ${input.notifyAssignments}
      )
      on conflict (user_id) do update set
        timezone = excluded.timezone,
        notify_sync_errors = excluded.notify_sync_errors,
        notify_assignments = excluded.notify_assignments,
        updated_at = now()
    `);
  });
}

export async function readProfilePreferences(userId: string): Promise<{
  timezone: string;
  notifySync: boolean;
  notifyAssignments: boolean;
}> {
  return withUser(userId, async (tx) => {
    const rows = await tx.execute<{ timezone: string; notify_sync_errors: boolean; notify_assignments: boolean }>(sql`
      select timezone, notify_sync_errors, notify_assignments from user_preferences
      where user_id = current_setting('app.current_user_id', true)
    `);
    const row = rows[0];
    return {
      timezone: row?.timezone ?? "UTC",
      notifySync: row?.notify_sync_errors ?? true,
      notifyAssignments: row?.notify_assignments ?? true,
    };
  });
}

// Null when the account has no preference row yet, so callers can fall back to
// the cookies that the settings page also uses.
export async function readAppearanceFlags(userId: string): Promise<{
  animationsEnabled: boolean;
  providerTileStyles: boolean;
  groupRelatedTasks: boolean;
} | null> {
  return withUser(userId, async (tx) => {
    const rows = await tx.execute<{
      animations_enabled: boolean;
      provider_tile_styles: boolean;
      group_related_tasks: boolean;
    }>(sql`
      select animations_enabled, provider_tile_styles, group_related_tasks from user_preferences
      where user_id = current_setting('app.current_user_id', true)
    `);
    const row = rows[0];
    if (!row) return null;
    return {
      animationsEnabled: row.animations_enabled !== false,
      providerTileStyles: row.provider_tile_styles !== false,
      groupRelatedTasks: row.group_related_tasks !== false,
    };
  });
}
