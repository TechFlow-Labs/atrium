"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MenuSelect } from "@/components/ui/menu-select";

export const TASK_BULK_FORM_ID = "tasks-bulk";

function taskSelectBoxes(formId: string): HTMLElement[] {
  const form = document.getElementById(formId);
  if (!form) return [];
  return [...form.querySelectorAll<HTMLElement>("[data-task-select]")];
}

export function TaskBulkActions({ formId = TASK_BULK_FORM_ID }: { formId?: string }) {
  const [selectState, setSelectState] = useState<boolean | "indeterminate">(false);

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

  function setAllSelected(next: boolean) {
    for (const box of taskSelectBoxes(formId)) {
      const checked = box.getAttribute("data-state") === "checked";
      if (checked !== next) box.click();
    }
    setSelectState(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-reveal="">
      <label className="inline-flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm">
        <Checkbox
          checked={selectState}
          onCheckedChange={(value) => setAllSelected(value === true)}
          aria-label="Select all tasks"
        />
        <span>Select all</span>
      </label>
      <MenuSelect
        name="status"
        form={formId}
        defaultValue=""
        aria-label="Bulk status"
        className="w-auto min-w-40"
        options={[
          { value: "", label: "Keep status" },
          { value: "done", label: "Mark done" },
          { value: "open", label: "Reopen" },
          { value: "blocked", label: "Mark blocked" },
        ]}
      />
      <MenuSelect
        name="priority"
        form={formId}
        defaultValue=""
        aria-label="Bulk priority"
        className="w-auto min-w-40"
        options={[
          { value: "", label: "Keep priority" },
          { value: "urgent", label: "Urgent" },
          { value: "high", label: "High" },
          { value: "low", label: "Low" },
        ]}
      />
      <Button type="submit" form={formId} variant="outline">
        Apply to selected
      </Button>
    </div>
  );
}
