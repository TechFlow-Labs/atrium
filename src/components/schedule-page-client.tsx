"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { loadSchedulePanelAction } from "@/app/actions";
import { CalendarGantt, type CalendarGanttTask } from "@/components/calendar-gantt";
import { CalendarMonthNav } from "@/components/calendar-month-nav";
import { CalendarViewToggle } from "@/components/calendar-view-toggle";
import { ProviderIcon } from "@/components/provider-icon";
import {
  calendarMonthHref,
  toMonthKey,
  type CalendarView,
} from "@/lib/calendar-month";
import { softReplaceUrl } from "@/lib/soft-nav";
import { cn } from "@/lib/utils";

type ScheduleTask = {
  id: string;
  title: string;
  due_at: string;
  created_at: string;
  status: string;
  priority: string;
  provider: string | null;
  project_id: string;
  project_name: string;
  project_nickname: string | null;
};

type SchedulePanel = {
  view: CalendarView;
  monthKey: string;
  startIso: string;
  endIso: string;
  label: string;
  tasks: ScheduleTask[];
};

export function SchedulePageClient({
  workspaceId,
  timeZone,
  initial,
}: {
  workspaceId: string;
  timeZone: string;
  initial: SchedulePanel;
}) {
  const todayKey = useMemo(() => toMonthKey(new Date()), []);
  const [view, setView] = useState<CalendarView>(initial.view);
  const [panel, setPanel] = useState(initial);
  const [pending, setPending] = useState(false);
  const requestId = useRef(0);

  const start = new Date(panel.startIso);
  const end = new Date(panel.endIso);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  const today = new Date();
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const startWeekday = (start.getUTCDay() + 6) % 7;
  const tasks: CalendarGanttTask[] = panel.tasks;

  function changeView(next: CalendarView) {
    if (next === view) return;
    setView(next);
    softReplaceUrl(calendarMonthHref(panel.monthKey, todayKey, next));
  }

  function changeMonth(href: string, nextMonthKey: string) {
    if (nextMonthKey === panel.monthKey) {
      softReplaceUrl(href);
      return;
    }
    softReplaceUrl(calendarMonthHref(nextMonthKey, todayKey, view));
    const id = ++requestId.current;
    setPending(true);
    void loadSchedulePanelAction(workspaceId, { month: nextMonthKey, view }).then((result) => {
      if (id !== requestId.current) return;
      setPending(false);
      if ("error" in result) return;
      setPanel({
        view: result.view,
        monthKey: result.monthKey,
        startIso: result.startIso,
        endIso: result.endIso,
        label: result.label,
        tasks: [...result.tasks],
      });
      setView(result.view);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl">Schedule</h1>
          <p className="text-sm text-muted">
            Month calendar and timeline for dated work in {timeZone}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div data-tour="schedule-view">
            <CalendarViewToggle
              monthKey={panel.monthKey}
              todayKey={todayKey}
              view={view}
              onChange={changeView}
            />
          </div>
          <div data-tour="schedule-nav">
            <CalendarMonthNav
              monthKey={panel.monthKey}
              label={panel.label}
              view={view}
              onNavigate={changeMonth}
            />
          </div>
        </div>
      </div>

      <div
        data-schedule-body=""
        className={cn("space-y-4 transition-opacity duration-150", pending && "opacity-70")}
        aria-busy={pending}
      >
        {tasks.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-card p-4 text-sm text-muted">
            Nothing is due in {panel.label}.
          </p>
        ) : null}

        <div data-tour="schedule-body">
          {view === "timeline" ? (
            <CalendarGantt monthStart={start} days={days} tasks={tasks} today={today} />
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card" data-reveal-whole="">
              <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-muted">
                {weekdayLabels.map((day) => (
                  <div key={day} className="px-2 py-2">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: startWeekday }, (_, index) => (
                  <div key={`pad-${index}`} className="min-h-28 border-b border-r bg-background/40 last:border-r-0" />
                ))}
                {Array.from({ length: days }, (_, index) => {
                  const day = new Date(start.getTime() + index * 86400000);
                  const isToday =
                    panel.monthKey === todayKey &&
                    day.getUTCFullYear() === today.getUTCFullYear() &&
                    day.getUTCMonth() === today.getUTCMonth() &&
                    day.getUTCDate() === today.getUTCDate();
                  const due = tasks.filter((task) => {
                    const value = new Date(task.due_at);
                    return (
                      value.getUTCFullYear() === day.getUTCFullYear() &&
                      value.getUTCMonth() === day.getUTCMonth() &&
                      value.getUTCDate() === day.getUTCDate()
                    );
                  });
                  const col = (startWeekday + index) % 7;
                  return (
                    <section
                      key={day.toISOString()}
                      className={cn(
                        "min-h-28 border-b p-2",
                        col < 6 && "border-r",
                        isToday && "bg-accent/35",
                      )}
                    >
                      <p
                        className={cn(
                          "inline-flex size-6 items-center justify-center rounded-full text-xs",
                          isToday ? "bg-foreground font-medium text-background" : "text-muted",
                        )}
                      >
                        {day.getUTCDate()}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {due.map((task) => (
                          <li key={String(task.id)} className="text-xs">
                            <Link
                              href={`/tasks/${String(task.id)}`}
                              className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
                            >
                              <span className="line-clamp-2">{String(task.title)}</span>
                              <ProviderIcon provider={task.provider} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
