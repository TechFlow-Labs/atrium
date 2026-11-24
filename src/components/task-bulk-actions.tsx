"use client";

import { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { TaskDeleteDialog } from "@/components/task-delete-dialog";
import { TaskTransferDialog } from "@/components/task-transfer-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MenuSelect } from "@/components/ui/menu-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useHoverMenu } from "@/components/ui/use-hover-menu";
import { cn } from "@/lib/utils";

export const TASK_BULK_FORM_ID = "tasks-bulk";

function taskSelectBoxes(formId: string): HTMLElement[] {
  const form = document.getElementById(formId);
  if (!form) return [];
  return [...form.querySelectorAll<HTMLElement>("[data-task-select]")];
}

function selectedTaskIds(formId: string): string[] {
  const form = document.getElementById(formId);
  if (!form) return [];
  return [...form.querySelectorAll<HTMLElement>("[data-task-select][data-state='checked']")]
    .map((box) => box.getAttribute("value") ?? box.getAttribute("data-value") ?? "")
    .filter(Boolean);
}

function selectedTasksMeta(formId: string): { ids: string[]; hasRemote: boolean } {
  const form = document.getElementById(formId);
  if (!form) return { ids: [], hasRemote: false };
  const boxes = [...form.querySelectorAll<HTMLElement>("[data-task-select][data-state='checked']")];
  const ids = boxes
    .map((box) => box.getAttribute("value") ?? box.getAttribute("data-value") ?? "")
    .filter(Boolean);
  const hasRemote = boxes.some((box) => {
    const provider = box.getAttribute("data-task-provider") ?? "";
    const external = box.getAttribute("data-task-external") ?? "";
    return Boolean(provider) || external === "1";
  });
  return { ids, hasRemote };
}

export function TaskBulkActions({
  formId = TASK_BULK_FORM_ID,
  workspaceId,
}: {
  formId?: string;
  workspaceId: string;
}) {
  const [selectState, setSelectState] = useState<boolean | "indeterminate">(false);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const menu = useHoverMenu();
  const hasSelection = selectState !== false;
  const statusLabel = STATUS_OPTIONS.find((option) => option.value === status)?.label;
  const priorityLabel = PRIORITY_OPTIONS.find((option) => option.value === priority)?.label;

  function syncSelection() {
    const boxes = taskSelectBoxes(formId);
    if (boxes.length === 0) {
      setSelectState(false);
      return;
    }
    const checked = boxes.filter((box) => box.getAttribute("data-state") === "checked").length;
    if (checked === 0) setSelectState(false);
    else if (checked === boxes.length) setSelectState(true);
    else setSelectState("indeterminate");
  }

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!form) return;
    syncSelection();
    form.addEventListener("click", syncSelection);
    const observer = new MutationObserver(syncSelection);
    observer.observe(form, { subtree: true, attributes: true, attributeFilter: ["data-state"] });
    return () => {
      form.removeEventListener("click", syncSelection);
      observer.disconnect();
    };
  }, [formId]);

  useEffect(() => {
    if (!hasSelection && menu.open) menu.onOpenChange(false);
  }, [hasSelection, menu.open, menu.onOpenChange]);

  function setAllSelected(next: boolean) {
    for (const box of taskSelectBoxes(formId)) {
      const checked = box.getAttribute("data-state") === "checked";
      if (checked !== next) box.click();
    }
    setSelectState(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-reveal="">
      <Popover
        open={hasSelection && menu.open}
        onOpenChange={(next) => {
          if (!hasSelection) {
            menu.onOpenChange(false);
            return;
          }
          menu.onOpenChange(next);
        }}
      >
        <PopoverTrigger
          type="button"
          aria-label="Actions"
          disabled={!hasSelection}
          title={hasSelection ? undefined : "Select at least one issue"}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs outline-none",
            "transition hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:pointer-events-none disabled:opacity-45",
            menu.open && hasSelection && "border-foreground/20 bg-accent/40",
          )}
          {...(hasSelection ? menu.triggerProps : {})}
        >
          <ListChecks className="size-3.5" aria-hidden="true" />
          Actions
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(100vw-2rem,40rem)]"
          {...menu.contentProps}
          onPointerDown={() => menu.onOpenChange(true)}
        >
          <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-8 items-center gap-2 rounded-md border bg-card px-2.5 text-xs">
            <Checkbox
              checked={selectState}
              onCheckedChange={(value) => setAllSelected(value === true)}
              aria-label="Select all issues"
            />
            <span>Select all</span>
          </label>
          <MenuSelect
            name="status"
            form={formId}
            value={status}
            onValueChange={setStatus}
            aria-label="Bulk status"
            className="w-40"
            triggerClassName="h-8 text-xs"
            options={[{ value: "", label: "Keep status" }, ...STATUS_OPTIONS]}
          />
          <MenuSelect
            name="priority"
            form={formId}
            value={priority}
            onValueChange={setPriority}
            aria-label="Bulk priority"
            className="w-40"
            triggerClassName="h-8 text-xs"
            options={[{ value: "", label: "Keep priority" }, ...PRIORITY_OPTIONS]}
          />
          <Button type="submit" form={formId} variant="outline" size="sm">
            Apply to selected
          </Button>
          <TaskTransferDialog
            workspaceId={workspaceId}
            triggerLabel="Transfer"
            onBeforeOpen={() => {
              const ids = selectedTaskIds(formId);
              return ids.length > 0 ? ids : null;
            }}
          />
          <TaskDeleteDialog
            workspaceId={workspaceId}
            triggerLabel="Delete"
            triggerVariant="outline"
            onBeforeOpen={() => {
              const next = selectedTasksMeta(formId);
              return next.ids.length > 0 ? next : null;
            }}
          />
          </div>
        </PopoverContent>
      </Popover>
      {statusLabel ? <ActionValue group="Status" label={statusLabel} /> : null}
      {priorityLabel ? <ActionValue group="Priority" label={priorityLabel} /> : null}
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: "done", label: "Mark done" },
  { value: "open", label: "Reopen" },
  { value: "blocked", label: "Mark blocked" },
];

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "low", label: "Low" },
];

function ActionValue({ group, label }: { group: string; label: string }) {
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-md border border-foreground/20 bg-accent/30 px-2 text-xs">
      <span className="text-muted">{group}</span>
      <span className="font-medium">{label}</span>
    </span>
  );
}
