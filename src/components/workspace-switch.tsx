"use client";

import { useState, useTransition } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { switchWorkspaceAction } from "@/app/actions";
import { CreateWorkspaceForm } from "@/components/create-workspace-form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WorkspaceContextDef } from "@/lib/workspace-contexts";
import { contextIcon, contextLabel } from "@/lib/workspace-contexts";
import { workspaceIconOrFallback } from "@/lib/workspace-icons";
import { cn } from "@/lib/utils";

type WorkspaceOption = {
  id: string;
  name: string;
  role: string;
  kind: string;
  icon?: string | null;
};

export function WorkspaceSwitch({
  currentId,
  workspaces,
  contexts = [],
}: {
  currentId: string;
  workspaces: WorkspaceOption[];
  contexts?: WorkspaceContextDef[];
}) {
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const current = workspaces.find((workspace) => workspace.id === currentId) ?? workspaces[0];
  if (!current) return null;

  const groups = groupWorkspaces(workspaces, contexts);

  function selectWorkspace(workspaceId: string) {
    if (workspaceId === currentId || pending) return;
    const formData = new FormData();
    formData.set("workspaceId", workspaceId);
    startTransition(() => {
      void switchWorkspaceAction(formData);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          id="workspace-switch"
          disabled={pending}
          className={cn(
            "inline-flex h-9 max-w-[min(100vw-12rem,20rem)] items-center gap-2 rounded-md border bg-card px-2.5 text-left text-sm outline-none",
            "hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
          )}
          aria-label={`Workspace: ${current.name}`}
        >
          <span aria-hidden="true" className="shrink-0 text-base leading-none">
            {workspaceIconOrFallback(
              current.icon,
              current.kind,
              contextIcon(contexts, current.kind),
            )}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{current.name}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[min(100vw-2rem,22rem)]">
          {groups.map((group, index) => (
            <div key={group.slug}>
              {index > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
              {group.workspaces.map((workspace) => (
                <WorkspaceMenuItem
                  key={workspace.id}
                  workspace={workspace}
                  contexts={contexts}
                  selected={workspace.id === currentId}
                  onSelect={selectWorkspace}
                />
              ))}
            </div>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setCreateOpen(true);
            }}
          >
            <span
              aria-hidden="true"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border bg-background"
            >
              <Plus className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Add workspace</span>
              <span className="block text-xs text-muted">Create a new workspace</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWorkspaceForm
        contexts={contexts}
        open={createOpen}
        onOpenChange={setCreateOpen}
        trigger={null}
      />
    </>
  );
}

function groupWorkspaces(workspaces: WorkspaceOption[], contexts: WorkspaceContextDef[]) {
  const order = new Map(contexts.map((context, index) => [context.slug, index]));
  const buckets = new Map<string, WorkspaceOption[]>();
  for (const workspace of workspaces) {
    const list = buckets.get(workspace.kind) ?? [];
    list.push(workspace);
    buckets.set(workspace.kind, list);
  }
  return [...buckets.entries()]
    .sort((a, b) => {
      const ai = order.get(a[0]) ?? Number.MAX_SAFE_INTEGER;
      const bi = order.get(b[0]) ?? Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return contextLabel(contexts, a[0]).localeCompare(contextLabel(contexts, b[0]));
    })
    .map(([slug, items]) => ({
      slug,
      label: contextLabel(contexts, slug),
      workspaces: items,
    }));
}

function WorkspaceMenuItem({
  workspace,
  contexts,
  selected,
  onSelect,
}: {
  workspace: WorkspaceOption;
  contexts: WorkspaceContextDef[];
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <DropdownMenuItem
      onSelect={() => onSelect(workspace.id)}
      className={cn(selected && "bg-accent/70")}
    >
      <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-base">
        {workspaceIconOrFallback(workspace.icon, workspace.kind, contextIcon(contexts, workspace.kind))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{workspace.name}</span>
        <span className="block truncate text-xs text-muted capitalize">{workspace.role}</span>
      </span>
      {selected ? <Check className="size-4 shrink-0 text-foreground" aria-hidden="true" /> : null}
    </DropdownMenuItem>
  );
}
