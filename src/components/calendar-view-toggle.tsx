"use client";

import { CalendarDays, GanttChart } from "lucide-react";
import { SoftSegmentedNav } from "@/components/soft-segmented-nav";
import { calendarMonthHref, type CalendarView } from "@/lib/calendar-month";
import { softReplaceUrl } from "@/lib/soft-nav";

export function CalendarViewToggle({
  monthKey,
  todayKey,
  view,
  onChange,
}: {
  monthKey: string;
  todayKey: string;
  view: CalendarView;
  onChange?: (view: CalendarView) => void;
}) {
  return (
    <SoftSegmentedNav
      aria-label="Schedule views"
      value={view}
      onChange={(next) => {
        softReplaceUrl(calendarMonthHref(monthKey, todayKey, next));
        onChange?.(next);
      }}
      options={[
        { value: "month", label: "Month", icon: CalendarDays },
        { value: "timeline", label: "Timeline", icon: GanttChart },
      ]}
    />
  );
}
