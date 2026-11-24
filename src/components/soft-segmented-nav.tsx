"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function SoftSegmentedNav<T extends string>({
  "aria-label": ariaLabel,
  value,
  options,
  onChange,
  "data-tour": dataTour,
}: {
  "aria-label": string;
  value: T;
  options: Array<{ value: T; label: string; icon: LucideIcon }>;
  onChange: (value: T) => void;
  "data-tour"?: string;
}) {
  return (
    <nav
      data-tour={dataTour}
      className="flex items-center gap-0.5 rounded-md border bg-card p-0.5 text-xs"
      aria-label={ariaLabel}
    >
      {options.map(({ value: optionValue, label, icon: Icon }) => {
        const active = value === optionValue;
        return (
          <button
            key={optionValue}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => {
              if (!active) onChange(optionValue);
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-1 transition",
              active
                ? "bg-foreground text-background"
                : "text-muted hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-3" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
