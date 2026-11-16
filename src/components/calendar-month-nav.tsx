"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useHoverMenu } from "@/components/ui/use-hover-menu";
import {
  calendarMonthHref,
  parseMonthKey,
  shiftMonthKey,
  toMonthKey,
  type CalendarView,
} from "@/lib/calendar-month";
import { cn } from "@/lib/utils";

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function CalendarMonthNav({
  monthKey,
  label,
  view = "month",
  onNavigate,
}: {
  monthKey: string;
  label: string;
  view?: CalendarView;
  onNavigate?: (href: string, nextMonthKey: string) => void;
}) {
  const router = useRouter();
  const menu = useHoverMenu();
  const todayKey = useMemo(() => toMonthKey(new Date()), []);
  const { year: selectedYear, monthIndex: selectedMonth } = parseMonthKey(monthKey);
  const [pickerYear, setPickerYear] = useState(selectedYear);

  const isCurrentMonth = monthKey === todayKey;

  function goTo(nextKey: string) {
    menu.onOpenChange(false);
    const href = calendarMonthHref(nextKey, todayKey, view);
    if (onNavigate) {
      onNavigate(href, nextKey);
      return;
    }
    router.push(href);
  }

  function openPicker(open: boolean) {
    if (open) setPickerYear(selectedYear);
    menu.onOpenChange(open);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Previous month"
        title="Previous month"
        onClick={() => goTo(shiftMonthKey(monthKey, -1))}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Button>

      <Popover open={menu.open} onOpenChange={openPicker}>
        <PopoverTrigger
          type="button"
          aria-label="Choose month"
          className={cn(
            "inline-flex h-9 min-w-[11rem] items-center justify-between gap-2 rounded-md border border-border bg-card px-3 text-sm outline-none transition",
            "hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring",
            menu.open && "border-foreground/25 bg-accent",
          )}
          {...menu.triggerProps}
        >
          <span className="inline-flex items-center gap-2 truncate">
            <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden="true" />
            <span className="font-medium">{label}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-3" {...menu.contentProps}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Previous year"
              onClick={() => setPickerYear((year) => year - 1)}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <p className="text-sm font-medium tabular-nums">{pickerYear}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Next year"
              onClick={() => setPickerYear((year) => year + 1)}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-1.5" role="listbox" aria-label="Select month">
            {MONTH_SHORT.map((name, index) => {
              const key = `${pickerYear}-${String(index + 1).padStart(2, "0")}`;
              const selected = pickerYear === selectedYear && index === selectedMonth;
              const isToday = key === todayKey;
              return (
                <button
                  key={name}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  title={`${MONTH_LABELS[index]} ${pickerYear}`}
                  onClick={() => goTo(key)}
                  className={cn(
                    "rounded-md px-2 py-2 text-sm transition outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "bg-foreground text-background"
                      : isToday
                        ? "border border-foreground/25 bg-accent/60 hover:bg-accent"
                        : "hover:bg-accent",
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Next month"
        title="Next month"
        onClick={() => goTo(shiftMonthKey(monthKey, 1))}
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>

      <Button
        type="button"
        variant="outline"
        disabled={isCurrentMonth}
        onClick={() => goTo(todayKey)}
      >
        Today
      </Button>
    </div>
  );
}
