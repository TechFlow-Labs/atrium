"use client";

import { useState } from "react";
import { WORKSPACE_ICONS, workspaceIconOrFallback } from "@/lib/workspace-icons";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function WorkspaceIconPicker({
  name = "icon",
  defaultValue,
  id = "workspace-icon",
}: {
  name?: string;
  defaultValue?: string | null;
  id?: string;
}) {
  const initial =
    defaultValue && (WORKSPACE_ICONS as readonly string[]).includes(defaultValue)
      ? defaultValue
      : WORKSPACE_ICONS[0];
  const [selected, setSelected] = useState(initial ?? "🏠");
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium" id={`${id}-label`}>
        Icon
      </p>
      <input type="hidden" name={name} value={selected} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            id={id}
            aria-labelledby={`${id}-label`}
            className="h-11 w-full justify-start gap-2 px-3"
          >
            <span className="inline-flex size-8 items-center justify-center rounded-md border bg-background text-lg" aria-hidden="true">
              {selected}
            </span>
            Choose icon
          </Button>
        </PopoverTrigger>
        <PopoverContent
          id={`${id}-panel`}
          side="bottom"
          align="start"
          className="w-[min(100vw-2rem,28rem)]"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <p className="mb-3 text-xs text-muted">Pick an icon for the sidebar and workspace switcher.</p>
          <div
            className="max-h-64 overflow-y-auto p-1.5"
            role="listbox"
            aria-label="Workspace icons"
          >
            <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
              {WORKSPACE_ICONS.map((icon) => {
                const active = icon === selected;
                return (
                  <button
                    key={icon}
                    type="button"
                    role="option"
                    aria-selected={active}
                    aria-label={`Workspace icon ${icon}`}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-xl border bg-background text-2xl transition",
                      "hover:border-foreground/20 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active && "border-foreground/25 bg-accent/50 ring-2 ring-ring",
                    )}
                    onClick={() => {
                      setSelected(icon);
                      setOpen(false);
                    }}
                  >
                    <span aria-hidden="true">{icon}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function WorkspaceIconBadge({
  icon,
  kind,
  contextIcon,
  className,
}: {
  icon?: string | null;
  kind: string;
  contextIcon?: string | null;
  className?: string;
}) {
  const value = workspaceIconOrFallback(icon, kind, contextIcon);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card text-base",
        className,
      )}
    >
      {value}
    </span>
  );
}
