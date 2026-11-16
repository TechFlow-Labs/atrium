import { Suspense } from "react";
import { ScreenLoader } from "@/components/screen-loader";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { SchedulePageClient } from "@/components/schedule-page-client";
import { parseCalendarView, toMonthKey } from "@/lib/calendar-month";
import { getSessionUser } from "@/server/auth/session";
import { workspaceContext } from "@/server/auth/workspace";
import { calendarTasks } from "@/server/home/service";
import { sql } from "drizzle-orm";
import { withUser } from "@/server/db/client";

export const instant = false;

function parseMonthParam(monthParam: string | undefined): Date {
  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
    return new Date();
  }
  const [year, month] = monthParam.split("-").map(Number);
  const anchor = new Date(Date.UTC(year!, (month ?? 1) - 1, 1));
  if (Number.isNaN(anchor.getTime())) return new Date();
  return anchor;
}

export default function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string }>;
}) {
  return (
    <Suspense fallback={<ScreenLoader />}>
      <ScheduleContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ScheduleContent({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string }>;
}) {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { current } = await workspaceContext(user.id);
  const prefs = await withUser(user.id, (tx) =>
    tx.execute<{ timezone: string }>(sql`
      select timezone from user_preferences where user_id = current_setting('app.current_user_id', true)
    `),
  );
  const timeZone = prefs[0]?.timezone ?? "UTC";
  const params = await searchParams;
  const view = parseCalendarView(params.view);
  const anchor = parseMonthParam(params.month);
  const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1));
  const monthKey = toMonthKey(start);
  const taskRows = await calendarTasks(user.id, current.id, start.toISOString(), end.toISOString());
  const tasks = taskRows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    due_at: row.due_at instanceof Date ? row.due_at.toISOString() : String(row.due_at),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    status: String(row.status),
    priority: String(row.priority),
    provider: (row.provider as string | null) ?? null,
    project_id: String(row.project_id),
    project_name: String(row.project_name),
    project_nickname: (row.project_nickname as string | null) ?? null,
  }));
  const label = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(start);

  return (
    <SchedulePageClient
      workspaceId={current.id}
      timeZone={timeZone}
      initial={{
        view,
        monthKey,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        label,
        tasks,
      }}
    />
  );
}
