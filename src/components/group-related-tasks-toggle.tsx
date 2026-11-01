"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Link2 } from "lucide-react";
import { groupRelatedTasksAction } from "@/app/actions";
import { cn } from "@/lib/utils";

export function GroupRelatedTasksToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<boolean | null>(null);
  const on = draft ?? enabled;

  function setEnabled(next: boolean) {
    if (next === on || pending) return;
    setDraft(next);
    const formData = new FormData();
    formData.set("groupRelatedTasks", next ? "on" : "off");
    startTransition(async () => {
      await groupRelatedTasksAction(formData);
      router.refresh();
      setDraft(null);
    });
  }

  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={pending}
      onClick={() => setEnabled(!on)}
      title={on ? "Grouping related tasks on" : "Grouping related tasks off"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:opacity-60",
        on
          ? "border-foreground/20 bg-foreground text-background"
          : "border-border bg-card text-muted hover:bg-accent hover:text-foreground",
      )}
    >
      <Link2 className="size-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">Related</span>
      <span className="sr-only">{on ? "Disable related-task grouping" : "Enable related-task grouping"}</span>
    </button>
  );
}
