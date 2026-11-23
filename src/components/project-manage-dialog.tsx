"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { Settings2 } from "lucide-react";
import {
  listGithubBoardsForCreateAction,
  listRemoteProjectsForCreateAction,
  mappingAction,
  publishAction,
  updateProjectSettingsAction,
  type ActionState,
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
import { Input, Label, Textarea } from "@/components/ui/field";
import { MenuSelect } from "@/components/ui/menu-select";

type GithubBoard = {
  id: string;
  title: string;
  number: number;
  url: string;
};

type RemoteProjectOption = {
  providerId: string;
  name: string;
  key: string | null;
  url: string | null;
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
  githubBoards: initialGithubBoards,
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
    provider_project_id: string | null;
    provider_project_name: string | null;
    provider_project_url: string | null;
    integration_id: string | null;
    publish_outbound: boolean;
    figma_file_url: string | null;
    figma_file_name: string | null;
  };
  products: Array<{ id: string; name: string }>;
  mappings: FieldMappings | null | undefined;
  githubBoards: GithubBoard[];
}) {
  const [open, setOpen] = useState(false);
  const [saveState, saveAction, savePending] = useActionState<ActionState, FormData>(
    updateProjectSettingsAction,
    {},
  );
  const map = mappings ?? null;
  const isGithub = project.provider === "github";
  const canEditCodebase = Boolean(project.integration_id && project.provider_project_id);

  const [remotes, setRemotes] = useState<RemoteProjectOption[]>([]);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [loadingRemotes, startLoadRemotes] = useTransition();
  const [selectedCodebaseId, setSelectedCodebaseId] = useState(
    project.provider_project_id ?? "",
  );
  const [boards, setBoards] = useState<GithubBoard[]>(initialGithubBoards);
  const [boardId, setBoardId] = useState(map?.githubProjectNodeId ?? "");
  const [loadingBoards, startLoadBoards] = useTransition();

  const selectedRemote = useMemo(
    () => remotes.find((remote) => remote.providerId === selectedCodebaseId) ?? null,
    [remotes, selectedCodebaseId],
  );

  const codebaseOptions = useMemo(() => {
    const options = remotes.map((remote) => ({
      value: remote.providerId,
      label: remote.name,
      description: remote.key || remote.providerId,
    }));
    if (
      selectedCodebaseId
      && !options.some((option) => option.value === selectedCodebaseId)
    ) {
      options.unshift({
        value: selectedCodebaseId,
        label: project.provider_project_name || selectedCodebaseId,
        description: selectedCodebaseId,
      });
    }
    return options;
  }, [remotes, selectedCodebaseId, project.provider_project_name]);

  useEffect(() => {
    if (!open || !canEditCodebase || !project.integration_id) return;
    startLoadRemotes(async () => {
      const result = await listRemoteProjectsForCreateAction(
        workspaceId,
        project.integration_id!,
      );
      if ("error" in result) {
        setRemoteError(result.error);
        setRemotes([]);
        return;
      }
      setRemoteError(null);
      setRemotes(result.projects);
    });
  }, [open, canEditCodebase, project.integration_id, workspaceId]);

  useEffect(() => {
    if (!open) return;
    setSelectedCodebaseId(project.provider_project_id ?? "");
    setBoardId(map?.githubProjectNodeId ?? "");
    setBoards(initialGithubBoards);
  }, [open, project.provider_project_id, map?.githubProjectNodeId, initialGithubBoards]);

  function onCodebaseChange(nextId: string) {
    setSelectedCodebaseId(nextId);
    if (!isGithub || !project.integration_id || !nextId) return;
    if (nextId === project.provider_project_id) {
      setBoards(initialGithubBoards);
      setBoardId(map?.githubProjectNodeId ?? "");
      return;
    }
    setBoardId("");
    startLoadBoards(async () => {
      const result = await listGithubBoardsForCreateAction(
        workspaceId,
        project.integration_id!,
        nextId,
      );
      if ("error" in result) {
        setBoards([]);
        return;
      }
      setBoards(result.boards);
    });
  }

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
          <form action={saveAction} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="projectId" value={project.id} />
            {canEditCodebase ? (
              <>
                <input
                  type="hidden"
                  name="providerProjectName"
                  value={selectedRemote?.name || project.provider_project_name || selectedCodebaseId}
                />
                <input
                  type="hidden"
                  name="providerProjectKey"
                  value={selectedRemote?.key ?? ""}
                />
                <input
                  type="hidden"
                  name="providerProjectUrl"
                  value={selectedRemote?.url || project.provider_project_url || ""}
                />
              </>
            ) : null}
            {saveState.error ? (
              <p className="md:col-span-2 text-sm text-destructive" role="alert">
                {saveState.error}
              </p>
            ) : null}
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
            {canEditCodebase ? (
              <div className="md:col-span-2">
                <Label htmlFor="manage-codebase">
                  {isGithub ? "Codebase" : "Provider project"}
                </Label>
                <MenuSelect
                  id="manage-codebase"
                  name="providerProjectId"
                  className="mt-1"
                  aria-label={isGithub ? "Codebase" : "Provider project"}
                  value={selectedCodebaseId}
                  onValueChange={onCodebaseChange}
                  disabled={codebaseOptions.length === 0}
                  required
                  options={codebaseOptions}
                  placeholder={
                    loadingRemotes
                      ? "Loading repositories…"
                      : isGithub
                        ? "Select a repository"
                        : "Select a project"
                  }
                />
                {remoteError ? (
                  <p className="mt-1 text-xs text-destructive">{remoteError}</p>
                ) : (
                  <p className="mt-1 text-xs text-muted">
                    {isGithub
                      ? "Changing the repository clears the linked Project board until you pick one again."
                      : "Changing the linked provider project restarts inbound sync for this connection."}
                  </p>
                )}
              </div>
            ) : null}
            <div className="md:col-span-2">
              <Label htmlFor="manage-description">Description</Label>
              <Textarea
                id="manage-description"
                name="description"
                defaultValue={project.description}
                className="mt-1"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="manage-figma">Figma file</Label>
              <Input
                id="manage-figma"
                name="figmaFileUrl"
                defaultValue={project.figma_file_url ?? ""}
                placeholder="https://www.figma.com/design/…"
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted">
                {project.figma_file_name
                  ? `Linked: ${project.figma_file_name}. Clear the field and save to remove.`
                  : "Paste a Figma design, board, or prototype URL. Connect Figma under Integrations for comments."}
              </p>
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
            <Button type="submit" disabled={savePending}>
              {savePending ? "Saving…" : "Save project"}
            </Button>
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
              {isGithub ? (
                <div className="mt-3">
                  <Label htmlFor="manage-githubProjectNodeId">GitHub Project board</Label>
                  <MenuSelect
                    id="manage-githubProjectNodeId"
                    name="githubProjectNodeId"
                    className="mt-1"
                    aria-label="GitHub Project board"
                    value={boardId}
                    onValueChange={setBoardId}
                    disabled={loadingBoards}
                    options={[
                      {
                        value: "",
                        label: loadingBoards
                          ? "Loading boards…"
                          : boards.length
                            ? "Auto (first board linked to the repository)"
                            : "Auto — no boards found on this repository yet",
                      },
                      {
                        value: "none",
                        label: "No board",
                      },
                      ...boards.map((board) => ({
                        value: board.id,
                        label: `${board.title} (#${board.number})`,
                      })),
                      ...(boardId
                        && boardId !== "none"
                        && !boards.some((board) => board.id === boardId)
                        ? [{
                            value: boardId,
                            label: `Saved board (${boardId})`,
                          }]
                        : []),
                    ]}
                  />
                  <p className="mt-1 text-xs text-muted">
                    {boardId === "none"
                      ? "Status sync stays on GitHub Issues only. Project board Status will not be read or written."
                      : "Two-way Status sync uses this Projects v2 board. Webhook deliveries need the Projects v2 item event on the org or user that owns the board."}
                    {selectedCodebaseId !== project.provider_project_id
                      ? " Save the project codebase first, then save mappings for the new repository."
                      : null}
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
