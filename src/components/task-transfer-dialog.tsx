"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { ArrowRightLeft } from "lucide-react";
import {
  listTransferDestinationsAction,
  listTransferProjectsAction,
  transferTasksAction,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/field";
import { MenuSelect } from "@/components/ui/menu-select";

type WorkspaceOption = { id: string; name: string; kind: string };
type ProjectOption = { id: string; name: string };

export function TaskTransferDialog({
  workspaceId,
  taskIds,
  triggerLabel = "Transfer",
  triggerVariant = "outline",
  disabled = false,
  onBeforeOpen,
}: {
  workspaceId: string;
  taskIds?: string[];
  triggerLabel?: string;
  triggerVariant?: "outline" | "ghost" | "default";
  disabled?: boolean;
  /** Called when opening; return task ids to transfer (e.g. from bulk selection). */
  onBeforeOpen?: () => string[] | null;
}) {
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState<string[]>(taskIds ?? []);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [destinationWorkspaceId, setDestinationWorkspaceId] = useState("");
  const [destinationProjectId, setDestinationProjectId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingTargets, startLoadTargets] = useTransition();
  const [loadingProjects, startLoadProjects] = useTransition();
  const [state, formAction, pending] = useActionState(transferTasksAction, {});

  const countLabel = useMemo(() => {
    if (ids.length === 1) return "1 task";
    return `${ids.length} tasks`;
  }, [ids.length]);

  useEffect(() => {
    if (taskIds) setIds(taskIds);
  }, [taskIds]);

  function openDialog() {
    const nextIds = onBeforeOpen ? onBeforeOpen() : (taskIds ?? ids);
    if (!nextIds || nextIds.length === 0) {
      setLoadError("Select at least one task to transfer");
      setOpen(true);
      setIds([]);
      return;
    }
    setIds(nextIds);
    setLoadError(null);
    setDestinationWorkspaceId("");
    setDestinationProjectId("");
    setProjects([]);
    setOpen(true);
    startLoadTargets(async () => {
      const result = await listTransferDestinationsAction(workspaceId);
      if ("error" in result) {
        setLoadError(result.error ?? "Could not load workspaces");
        setWorkspaces([]);
        return;
      }
      setWorkspaces(result.workspaces);
      if (result.workspaces.length === 0) {
        setLoadError("Join another workspace as a member before transferring tasks");
      }
    });
  }

  function onWorkspaceChange(next: string) {
    setDestinationWorkspaceId(next);
    setDestinationProjectId("");
    setProjects([]);
    if (!next) return;
    startLoadProjects(async () => {
      const result = await listTransferProjectsAction(next);
      if ("error" in result) {
        setLoadError(result.error ?? "Could not load projects");
        setProjects([]);
        return;
      }
      setLoadError(null);
      setProjects(result.projects);
      if (result.projects[0]) setDestinationProjectId(result.projects[0].id);
      else setLoadError("The destination workspace has no active projects");
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setLoadError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={triggerVariant}
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault();
            openDialog();
          }}
        >
          <ArrowRightLeft className="size-4" aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer to another workspace</DialogTitle>
          <DialogDescription>
            Moves {countLabel} into a project in another workspace. Comments come along; the
            originals are removed from this workspace. Provider sync links stay with the source and
            are not reattached.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="destinationWorkspaceId" value={destinationWorkspaceId} />
          <input type="hidden" name="destinationProjectId" value={destinationProjectId} />
          {ids.map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}

          <div>
            <Label htmlFor="transfer-workspace">Workspace</Label>
            <MenuSelect
              id="transfer-workspace"
              value={destinationWorkspaceId}
              onValueChange={onWorkspaceChange}
              className="mt-1"
              aria-label="Destination workspace"
              required
              disabled={loadingTargets || workspaces.length === 0}
              placeholder={loadingTargets ? "Loading workspaces…" : "Choose a workspace"}
              options={workspaces.map((workspace) => ({
                value: workspace.id,
                label: workspace.name,
                description: workspace.kind,
              }))}
            />
          </div>

          <div>
            <Label htmlFor="transfer-project">Project</Label>
            <MenuSelect
              id="transfer-project"
              value={destinationProjectId}
              onValueChange={setDestinationProjectId}
              className="mt-1"
              aria-label="Destination project"
              required
              disabled={!destinationWorkspaceId || loadingProjects || projects.length === 0}
              placeholder={
                !destinationWorkspaceId
                  ? "Choose a workspace first"
                  : loadingProjects
                    ? "Loading projects…"
                    : "Choose a project"
              }
              options={projects.map((project) => ({
                value: project.id,
                label: project.name,
              }))}
            />
          </div>

          {loadError || state.error ? (
            <p className="text-sm text-destructive">{loadError ?? state.error}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                pending ||
                ids.length === 0 ||
                !destinationWorkspaceId ||
                !destinationProjectId ||
                Boolean(loadError)
              }
            >
              {pending ? "Transferring…" : "Transfer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
