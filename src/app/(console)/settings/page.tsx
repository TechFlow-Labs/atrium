import Link from "next/link";
import { Suspense } from "react";
import { ScreenLoader } from "@/components/screen-loader";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { passwordAction, settingsAction } from "@/app/actions";
import { PasswordForm } from "@/components/password-form";
import { ThemeSettings } from "@/components/theme-settings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Label } from "@/components/ui/field";
import { parseMotionEnabled } from "@/lib/apply-theme";
import { parseColorPalette, parseThemeMode } from "@/lib/theme";
import { getSessionUser } from "@/server/auth/session";
import { withUser } from "@/server/db/client";
import { sql } from "drizzle-orm";

export const instant = false;

export default function SettingsPage() {
  return (
    <Suspense fallback={<ScreenLoader />}>
      <SettingsContent />
    </Suspense>
  );
}

async function SettingsContent() {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const cookieStore = await cookies();
  const theme = parseThemeMode(cookieStore.get("atrium_theme")?.value);
  const palette = parseColorPalette(cookieStore.get("atrium_palette")?.value);
  const prefs = await withUser(user.id, (tx) => tx.execute<{
    timezone: string;
    theme: string;
    notify_sync_errors: boolean;
    notify_assignments: boolean;
    animations_enabled: boolean;
    provider_tile_styles: boolean;
    group_related_tasks: boolean;
  }>(sql`select * from user_preferences where user_id = current_setting('app.current_user_id', true)`));
  const pref = prefs[0];
  const animationsEnabled = pref
    ? pref.animations_enabled !== false
    : parseMotionEnabled(cookieStore.get("atrium_motion")?.value);
  const providerTileStyles = pref
    ? pref.provider_tile_styles !== false
    : parseMotionEnabled(cookieStore.get("atrium_provider_tiles")?.value);
  const groupRelatedTasks = pref
    ? pref.group_related_tasks !== false
    : parseMotionEnabled(cookieStore.get("atrium_group_related_tasks")?.value);
  return (
    <div className="w-full space-y-8">
      <div>
        <h1 className="text-4xl">Settings</h1>
        <p className="mt-1 text-sm text-muted">Profile, appearance, and account preferences.</p>
        <Link href="/onboarding" className="mt-2 inline-block text-sm underline">Run the setup guide again</Link>
      </div>
      <div data-tour="settings-appearance">
        <ThemeSettings
          theme={theme}
          palette={palette}
          animationsEnabled={animationsEnabled}
          providerTileStyles={providerTileStyles}
          groupRelatedTasks={groupRelatedTasks}
        />
      </div>
      <div className="grid w-full gap-6 xl:grid-cols-2">
        <form id="profile" data-tour="settings-profile" action={settingsAction} className="space-y-3 rounded-lg border bg-card p-4 scroll-mt-24 md:p-5">
          <h2 className="text-xl">Profile</h2>
          <input type="hidden" name="theme" value={theme} />
          <input type="hidden" name="palette" value={palette} />
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={user.name} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="timezone">Timezone</Label>
            <Input id="timezone" name="timezone" defaultValue={pref?.timezone ?? "UTC"} className="mt-1" />
          </div>
          <label data-tour="settings-notifications" className="flex items-center gap-2.5 text-sm">
            <Checkbox name="notifySync" defaultChecked={pref?.notify_sync_errors ?? true} />
            Show sync errors on the home page
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox name="notifyAssignments" defaultChecked={pref?.notify_assignments ?? true} />
            Highlight tasks assigned to me
          </label>
          <Button type="submit">Save settings</Button>
        </form>
        <PasswordForm action={passwordAction} className="w-full max-w-none" />
      </div>
      <p className="text-sm text-muted">Signed in as {user.email}</p>
    </div>
  );
}
