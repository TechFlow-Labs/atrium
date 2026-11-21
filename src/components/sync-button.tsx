"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { syncNowAction } from "@/app/actions";
import { cn } from "@/lib/utils";

export function SyncButton({
  workspaceId,
  className = "inline-flex",
}: {
  workspaceId: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      title="Sync"
      aria-label="Sync"
      aria-busy={pending}
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const toastId = toast.loading("Syncing…");
          const result = await syncNowAction(workspaceId);
          toast.dismiss(toastId);
          if (result.error) {
            toast.error(result.error, {
              duration: Infinity,
              description: "Dismiss or swipe right to close.",
            });
            return;
          }
          toast.success(result.notice ?? "Sync completed successfully.", {
            duration: 4500,
          });
        });
      }}
      className={cn(
        className,
        "size-9 items-center justify-center rounded-md border bg-card text-foreground transition hover:bg-accent disabled:opacity-60",
      )}
    >
      <RefreshCw className={cn("size-4", pending && "animate-spin")} aria-hidden="true" />
    </button>
  );
}
