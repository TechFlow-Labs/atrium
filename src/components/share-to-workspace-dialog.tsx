"use client";

import { useActionState, useEffect, useState, useTransition, type ReactNode } from "react";
import { Share2 } from "lucide-react";
import {
  listIntegrationShareTargetsAction,
  type ActionState,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/field";
import { MenuSelect } from "@/components/ui/menu-select";

type WorkspaceOption = { id: string; name: string; kind: string };

export function ShareToWorkspaceDialog({
  workspaceId,
  title,
  description,
  action,
  hiddenFields,
  triggerLabel = "Share",
  triggerVariant = "outline",
  triggerSize = "sm",
  disabled = false,
  children,
}: {
  workspaceId: string;
  title: string;
  description: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  hiddenFields?: Record<string, string>;
  triggerLabel?: string;
  triggerVariant?: "outline" | "ghost" | "default";
  triggerSize?: "default" | "sm" | "icon";
  disabled?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<WorkspaceOption[]>([]);
  const [targetWorkspaceId, setTargetWorkspaceId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [state, formAction, pending] = useActionState(action, {});

  useEffect(() => {
    if (state.notice && open) {
      setOpen(false);
    }
  }, [state.notice, open]);

  function openDialog() {
    setOpen(true);
    setTargetWorkspaceId("");
    setLoadError(null);
    startLoad(async () => {
      const result = await listIntegrationShareTargetsAction(workspaceId);
      if ("error" in result) {
        setLoadError(result.error ?? "Could not load workspaces");
        setTargets([]);
        return;
      }
      setTargets(result.workspaces);
      if (result.workspaces.length === 0) {
        setLoadError("Join another workspace as an owner or admin to share there");
      } else {
        setTargetWorkspaceId(result.workspaces[0]!.id);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        disabled={disabled}
        onClick={openDialog}
      >
        {children ?? (
          <>
            <Share2 className="size-3.5" aria-hidden="true" />
            {triggerLabel}
          </>
        )}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setLoadError(null);
        }}
      >
        <DialogContent className="w-[min(100%-2rem,28rem)]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <form action={formAction} className="grid gap-4">
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="targetWorkspaceId" value={targetWorkspaceId} />
            {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}

            <div>
              <Label htmlFor="share-target-workspace">Workspace</Label>
              <MenuSelect
                id="share-target-workspace"
                value={targetWorkspaceId}
                onValueChange={setTargetWorkspaceId}
                className="mt-1"
                aria-label="Destination workspace"
                required
                disabled={loading || targets.length === 0}
                placeholder={loading ? "Loading workspaces…" : "Choose a workspace"}
                options={targets.map((workspace) => ({
                  value: workspace.id,
                  label: workspace.name,
                  description: workspace.kind,
                }))}
              />
            </div>

            {loadError || state.error ? (
              <p className="text-sm text-destructive">{loadError ?? state.error}</p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={pending || loading || !targetWorkspaceId || Boolean(loadError)}
              >
                {pending ? "Sharing…" : "Share"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
