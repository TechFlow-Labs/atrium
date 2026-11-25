"use client";

import { useRef, useState } from "react";
import { ListChecks } from "lucide-react";
import { IssueTypeIcon } from "@/components/issue-kind-icons";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { IssueType } from "@/lib/issue-kinds";
import { cn } from "@/lib/utils";

export function IssueTypeOption({
  type,
  onSelect,
}: {
  type: IssueType;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  function clearCloseTimer() {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function showPreview() {
    clearCloseTimer();
    setOpen(true);
  }

  function hidePreview() {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          className={cn(
            "rounded-lg border bg-card px-3 py-3 text-left transition",
            "hover:border-foreground/30 hover:bg-accent/40",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            open && "border-foreground/30 bg-accent/40",
          )}
          onMouseEnter={showPreview}
          onMouseLeave={hidePreview}
          onFocus={showPreview}
          onBlur={hidePreview}
          onClick={onSelect}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <IssueTypeIcon typeId={type.id} className="text-foreground" />
            {type.label}
          </span>
          <span className="mt-0.5 block text-xs text-muted">{type.description}</span>
          <span className="mt-2 flex items-center gap-1 text-xs text-muted">
            <ListChecks className="size-3.5 shrink-0" aria-hidden="true" />
            {type.subtasks.length} subtasks · hover to preview
          </span>
        </button>
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={10}
        collisionPadding={16}
        className="w-[min(100vw-2rem,20rem)] p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onMouseEnter={showPreview}
        onMouseLeave={hidePreview}
      >
        <div className="border-b px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Subtasks included</p>
          <p className="mt-0.5 text-sm font-medium">{type.label}</p>
        </div>
        <ol className="max-h-[min(24rem,60vh)] space-y-3 overflow-y-auto p-3">
          {type.subtasks.map((subtask, index) => (
            <li key={subtask.title} className="grid gap-0.5">
              <p className="text-sm font-medium">
                <span className="mr-1.5 text-muted">{index + 1}.</span>
                {subtask.title}
              </p>
              <p className="pl-5 text-xs leading-relaxed text-muted">{subtask.description}</p>
            </li>
          ))}
        </ol>
      </PopoverContent>
    </Popover>
  );
}
