"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Tags } from "lucide-react";
import { setTaskIssueKindAction } from "@/app/actions";
import { IssueCategoryIcon, IssueTypeIcon } from "@/components/issue-kind-icons";
import { IssueKindPickerDialog } from "@/components/issue-kind-picker";
import { Button } from "@/components/ui/button";
import { issueCategory, issueKindLabel, issueType } from "@/lib/issue-kinds";

export function TaskIssueKind({
  workspaceId,
  taskId,
  version,
  issueCategory: categoryId,
  issueType: typeId,
  canWrite,
  isSubtask = false,
}: {
  workspaceId: string;
  taskId: string;
  version: number;
  issueCategory: string | null;
  issueType: string | null;
  canWrite: boolean;
  isSubtask?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const category = issueCategory(categoryId);
  const type = issueType(categoryId, typeId);
  const label = issueKindLabel(categoryId, typeId);

  if (isSubtask) return null;

  function apply(nextCategoryId: string, nextTypeId: string) {
    startTransition(async () => {
      const result = await setTaskIssueKindAction({
        workspaceId,
        taskId,
        version,
        issueCategory: nextCategoryId,
        issueType: nextTypeId,
      });
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setOpen(false);
      router.refresh();
    });
  }

  function clear() {
    startTransition(async () => {
      const result = await setTaskIssueKindAction({
        workspaceId,
        taskId,
        version,
        issueCategory: "",
        issueType: "",
      });
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex gap-3 sm:col-span-2">
      <Tags className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <dt className="text-xs uppercase tracking-wide text-muted">Category · Type</dt>
        <dd className="mt-0.5">
          {label && category && type ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5">
                <IssueCategoryIcon categoryId={category.id} className="text-foreground" />
                {category.label}
                <span className="text-muted">·</span>
                <IssueTypeIcon typeId={type.id} className="text-foreground" />
                {type.label}
              </span>
              {canWrite ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => setOpen(true)}
                  >
                    {pending ? "Saving…" : "Change type"}
                  </Button>
                  <IssueKindPickerDialog
                    open={open}
                    onOpenChange={setOpen}
                    onSelect={apply}
                    onSkip={clear}
                    allowSkip
                    title="Change issue kind"
                  />
                </>
              ) : null}
            </div>
          ) : canWrite ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted">Not set</span>
              <IssueKindPickerDialog
                open={open}
                onOpenChange={setOpen}
                onSelect={apply}
                title="Set issue kind"
                trigger={
                  <Button type="button" variant="outline" size="sm" disabled={pending}>
                    {pending ? "Saving…" : "Set category and type"}
                  </Button>
                }
              />
            </div>
          ) : (
            <span className="text-muted">Not set</span>
          )}
          {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
        </dd>
      </div>
    </div>
  );
}
