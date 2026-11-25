"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { IssueCategoryIcon } from "@/components/issue-kind-icons";
import { IssueTypeOption } from "@/components/issue-type-option";
import { ISSUE_CATEGORIES, issueCategory } from "@/lib/issue-kinds";
import { cn } from "@/lib/utils";

export function IssueKindPickerDialog({
  open,
  onOpenChange,
  onSelect,
  onSkip,
  allowSkip = false,
  trigger,
  title = "What kind of issue?",
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelect: (categoryId: string, typeId: string) => void;
  onSkip?: () => void;
  allowSkip?: boolean;
  trigger?: React.ReactNode;
  title?: string;
}) {
  const [step, setStep] = useState<"category" | "type">("category");
  const [categoryId, setCategoryId] = useState("");
  const selectedCategory = issueCategory(categoryId);

  function reset() {
    setStep("category");
    setCategoryId("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange?.(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="w-[min(100%-2rem,46rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === "type" && selectedCategory ? (
              <IssueCategoryIcon categoryId={selectedCategory.id} className="size-5 text-foreground" />
            ) : null}
            {step === "category" ? title : selectedCategory?.label}
          </DialogTitle>
          <DialogDescription>
            {step === "category"
              ? "Pick the area of work. The type you choose next adds the steps that kind of issue usually needs."
              : "Pick a type. Its steps are added on the issue."}
          </DialogDescription>
        </DialogHeader>
        {step === "category" ? (
          <div className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {ISSUE_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className="rounded-lg border bg-card px-3 py-3 text-left transition hover:border-foreground/30 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setCategoryId(category.id);
                    setStep("type");
                  }}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <IssueCategoryIcon categoryId={category.id} className="text-foreground" />
                    {category.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{category.description}</span>
                </button>
              ))}
            </div>
            {allowSkip ? (
              <button
                type="button"
                className={cn(
                  "rounded-lg border border-dashed bg-card px-3 py-3 text-left transition",
                  "hover:border-foreground/30 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                onClick={() => {
                  onSkip?.();
                  handleOpenChange(false);
                }}
              >
                <span className="block text-sm font-medium">Clear category and type</span>
                <span className="mt-0.5 block text-xs text-muted">
                  Leave them blank. Existing subtasks stay; new ones are not added.
                </span>
              </button>
            ) : null}
          </div>
        ) : null}
        {step === "type" && selectedCategory ? (
          <div className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {selectedCategory.types.map((type) => (
                <IssueTypeOption
                  key={type.id}
                  type={type}
                  onSelect={() => {
                    onSelect(selectedCategory.id, type.id);
                    handleOpenChange(false);
                  }}
                />
              ))}
            </div>
            <div className="flex justify-start">
              <Button type="button" variant="outline" onClick={() => setStep("category")}>
                Back
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
