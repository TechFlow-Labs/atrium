"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { mappingAction, publishAction, updateProjectAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/field";
import { MenuSelect } from "@/components/ui/menu-select";

type GithubBoard = {
  id: string;
  title: string;
  number: number;
  url: string;
};

type FieldMappings = {
  status?: Record<string, string>;
  priority?: Record<string, string>;
  githubProjectNodeId?: string;
};

export function ProjectManageDialog({
  workspaceId,
  project,
  products,
  mappings,
  githubBoards,
}: {
  workspaceId: string;
  project: {
    id: string;
    name: string;
    nickname: string | null;
    description: string;
    ownership_mode: "native" | "external" | "hybrid";
    product_id: string | null;
    provider: string | null;
    integration_id: string | null;
    publish_outbound: boolean;
  };
  products: Array<{ id: string; name: string }>;
  mappings: FieldMappings | null | undefined;
  githubBoards: GithubBoard[];
}) {
  const [open, setOpen] = useState(false);
  const map = mappings ?? null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" data-tour="project-manage">
          <Settings2 className="size-4" aria-hidden="true" />
          Manage
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(100%-2rem,40rem)]">
        <DialogHeader>
          <DialogTitle>Manage project</DialogTitle>
          <DialogDescription>
            Settings, mappings, and publishing for {project.nickname?.trim() || project.name}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <form action={updateProjectAction} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="projectId" value={project.id} />
            <div>
              <Label htmlFor="manage-nickname">Nickname</Label>
              <Input
                id="manage-nickname"
                name="nickname"
                defaultValue={project.nickname ?? ""}
                placeholder="Friendly name in Atrium"
                className="mt-1"
                maxLength={80}
              />
            </div>
            <div>
              <Label htmlFor="manage-name">Name</Label>
              <Input
                id="manage-name"
                name="name"
                defaultValue={project.name}
                className="mt-1"
                readOnly={project.ownership_mode === "external"}
              />
              {project.ownership_mode === "external" ? (
                <p className="mt-1 text-xs text-muted">
                  Provider name stays as the source of truth. Use nickname for a shorter label.
                </p>
              ) : null}
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="manage-description">Description</Label>
              <Textarea
                id="manage-description"
                name="description"
                defaultValue={project.description}
                className="mt-1"
              />
            </div>
            {products.length > 0 ? (
              <div className="md:col-span-2">
                <Label htmlFor="manage-productId">Product</Label>
                <MenuSelect
                  id="manage-productId"
                  name="productId"
                  defaultValue={project.product_id ?? undefined}
                  className="mt-1"
                  aria-label="Product"
                  required
                  options={products.map((product) => ({
                    value: product.id,
                    label: product.name,
                  }))}
                />
              </div>
            ) : null}
            <Button type="submit">Save project</Button>
          </form>

          {project.ownership_mode === "native" && project.integration_id ? (
            <form action={publishAction} className="rounded-md border bg-background p-4 text-sm">
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="projectId" value={project.id} />
              <input
                type="hidden"
                name="enabled"
                value={project.publish_outbound ? "false" : "true"}
              />
              <p>
                Outbound publishing is {project.publish_outbound ? "on" : "off"}. Native fields stay
                authoritative here. Turning publishing on sends changes to the provider as an
                explicit sync.
              </p>
              <Button className="mt-3" variant="outline" type="submit">
                {project.publish_outbound ? "Stop publishing" : "Publish to provider"}
              </Button>
            </form>
          ) : null}

          {map ? (
            <form action={mappingAction}>
              <h3 className="text-lg font-medium">Field mappings</h3>
              <p className="mt-1 text-sm text-muted">
                Map Atrium statuses and priorities onto provider values. Linear status changes need a
                state id, not a display name. For GitHub, map statuses to Project Status option names
                (for example Todo, In Progress, Done) when a board is linked below.
              </p>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="projectId" value={project.id} />
              {project.provider === "github" ? (
                <div className="mt-3">
                  <Label htmlFor="manage-githubProjectNodeId">GitHub Project board</Label>
                  <MenuSelect
                    id="manage-githubProjectNodeId"
                    name="githubProjectNodeId"
                    className="mt-1"
                    aria-label="GitHub Project board"
                    defaultValue={map.githubProjectNodeId ?? ""}
                    options={[
                      {
                        value: "",
                        label: githubBoards.length
                          ? "Auto (first board linked to the repository)"
                          : "No boards found — reconnect GitHub with project scopes",
                      },
                      ...githubBoards.map((board) => ({
                        value: board.id,
                        label: `${board.title} (#${board.number})`,
                      })),
                      ...(map.githubProjectNodeId
                        && !githubBoards.some((board) => board.id === map.githubProjectNodeId)
                        ? [{
                            value: map.githubProjectNodeId,
                            label: `Saved board (${map.githubProjectNodeId})`,
                          }]
                        : []),
                    ]}
                  />
                  <p className="mt-1 text-xs text-muted">
                    Two-way Status sync uses this Projects v2 board. Webhook deliveries need the
                    Projects v2 item event on the org or user that owns the board.
                  </p>
                </div>
              ) : null}
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {(["open", "in_progress", "blocked", "done", "cancelled"] as const).map((status) => (
                  <label key={status} className="text-sm">
                    {status}
                    <Input
                      name={`status_${status}`}
                      defaultValue={map.status?.[status] ?? ""}
                      className="mt-1"
                    />
                  </label>
                ))}
                {(["none", "low", "medium", "high", "urgent"] as const).map((priority) => (
                  <label key={priority} className="text-sm">
                    {priority}
                    <Input
                      name={`priority_${priority}`}
                      defaultValue={map.priority?.[priority] ?? ""}
                      className="mt-1"
                    />
                  </label>
                ))}
              </div>
              <Button className="mt-3" type="submit">
                Save mappings
              </Button>
            </form>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
