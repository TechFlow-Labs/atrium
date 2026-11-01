"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { Plus, Search } from "lucide-react";
import {
  listRemoteProjectsForCreateAction,
  type ActionState,
} from "@/app/actions";
import { ProviderIcon, providerLabel } from "@/components/provider-icon";
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
import { Radio } from "@/components/ui/radio";
import { cn } from "@/lib/utils";

type ProjectOption = {
  id: string;
  name: string;
  provider?: string | null;
  ownershipMode?: "native" | "external" | "hybrid";
};

export type TaskFormIntegration = {
  id: string;
  provider: string;
  displayName: string;
};

type RemoteProjectOption = {
  providerId: string;
  name: string;
  key: string | null;
  url: string | null;
};

export function TaskForm({
  workspaceId,
  projectId,
  projects,
  integrations = [],
  returnTo,
  action,
  triggerLabel = "New task",
}: {
  workspaceId: string;
  projectId: string;
  projects?: ProjectOption[];
  integrations?: TaskFormIntegration[];
  returnTo: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const [seenError, setSeenError] = useState<string | null>(null);
  const showProjectPicker = (projects?.length ?? 0) > 1;
  const canSyncToProvider = integrations.length > 0;

  const defaultDestination: "atrium" | "provider" =
    projectId || (projects?.length ?? 0) > 0 ? "atrium" : "provider";
  const [destination, setDestination] = useState<"atrium" | "provider">(defaultDestination);
  const providerOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: { value: string; label: string }[] = [];
    for (const integration of integrations) {
      if (seen.has(integration.provider)) continue;
      seen.add(integration.provider);
      options.push({ value: integration.provider, label: providerLabel(integration.provider) });
    }
    return options;
  }, [integrations]);

  const [provider, setProvider] = useState(providerOptions[0]?.value ?? "");
  const connections = useMemo(
    () => integrations.filter((integration) => integration.provider === provider),
    [integrations, provider],
  );
  const [integrationId, setIntegrationId] = useState(connections[0]?.id ?? "");
  const [remoteProjects, setRemoteProjects] = useState<RemoteProjectOption[]>([]);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteQuery, setRemoteQuery] = useState("");
  const [selectedRemoteId, setSelectedRemoteId] = useState("");
  const [loadingRemotes, startLoadRemotes] = useTransition();

  if (state.error && state.error !== seenError) {
    setSeenError(state.error);
    if (!open) setOpen(true);
  }

  useEffect(() => {
    if (!providerOptions.some((option) => option.value === provider)) {
      setProvider(providerOptions[0]?.value ?? "");
    }
  }, [provider, providerOptions]);

  useEffect(() => {
    if (!connections.some((connection) => connection.id === integrationId)) {
      setIntegrationId(connections[0]?.id ?? "");
    }
  }, [connections, integrationId]);

  useEffect(() => {
    if (!open || destination !== "provider" || !integrationId) {
      return;
    }
    let cancelled = false;
    startLoadRemotes(async () => {
      setRemoteError(null);
      setRemoteProjects([]);
      setSelectedRemoteId("");
      setRemoteQuery("");
      const result = await listRemoteProjectsForCreateAction(workspaceId, integrationId);
      if (cancelled) return;
      if ("error" in result) {
        setRemoteError(result.error);
        return;
      }
      setRemoteProjects(result.projects);
      setSelectedRemoteId(result.projects[0]?.providerId ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [open, destination, integrationId, workspaceId]);

  const filteredRemotes = useMemo(() => {
    const needle = remoteQuery.trim().toLowerCase();
    if (!needle) return remoteProjects;
    return remoteProjects.filter(
      (project) =>
        project.name.toLowerCase().includes(needle)
        || project.providerId.toLowerCase().includes(needle)
        || (project.key?.toLowerCase().includes(needle) ?? false),
    );
  }, [remoteProjects, remoteQuery]);

  const fallbackRemoteId = filteredRemotes[0]?.providerId ?? "";
  if (
    filteredRemotes.length > 0
    && !filteredRemotes.some((project) => project.providerId === selectedRemoteId)
    && selectedRemoteId !== fallbackRemoteId
  ) {
    setSelectedRemoteId(fallbackRemoteId);
  }

  const selectedRemote =
    filteredRemotes.find((project) => project.providerId === selectedRemoteId)
    ?? filteredRemotes[0]
    ?? null;

  const atriumProjectOptions = (projects ?? []).map((project) => ({
    value: project.id,
    label: project.name,
    description: project.provider ? providerLabel(project.provider) : "Atrium",
    icon: <ProviderIcon provider={project.provider ?? "native"} />,
  }));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setDestination(defaultDestination);
          setRemoteError(null);
          setRemoteQuery("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="size-4" aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a task</DialogTitle>
          <DialogDescription>
            Create a task in this workspace, or sync it to a connected provider project.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="destination" value={destination} />

          {canSyncToProvider ? (
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Destination</legend>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 has-[:checked]:border-primary">
                <Radio
                  name="destinationChoice"
                  value="atrium"
                  checked={destination === "atrium"}
                  onChange={() => setDestination("atrium")}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">Atrium project</span>
                  <span className="block text-xs text-muted">Keep the task in this workspace only.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 has-[:checked]:border-primary">
                <Radio
                  name="destinationChoice"
                  value="provider"
                  checked={destination === "provider"}
                  onChange={() => setDestination("provider")}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">Sync to a provider</span>
                  <span className="block text-xs text-muted">
                    Create on Linear, Jira, GitLab, and similar, then keep it in sync.
                  </span>
                </span>
              </label>
            </fieldset>
          ) : null}

          {destination === "atrium" ? (
            showProjectPicker ? (
              <div>
                <Label htmlFor="task-project">Project</Label>
                <MenuSelect
                  id="task-project"
                  name="projectId"
                  defaultValue={projectId}
                  className="mt-1"
                  aria-label="Project"
                  required
                  options={atriumProjectOptions}
                />
              </div>
            ) : (
              <input type="hidden" name="projectId" value={projectId} />
            )
          ) : (
            <div className="grid gap-4">
              <div>
                <Label htmlFor="task-source">Source</Label>
                <MenuSelect
                  id="task-source"
                  value={provider}
                  onValueChange={setProvider}
                  className="mt-1"
                  aria-label="Source"
                  required
                  options={providerOptions.map((option) => ({
                    value: option.value,
                    label: option.label,
                    icon: <ProviderIcon provider={option.value} />,
                  }))}
                />
              </div>

              {connections.length > 1 ? (
                <div>
                  <Label htmlFor="task-connection">Account</Label>
                  <MenuSelect
                    id="task-connection"
                    name="integrationId"
                    value={integrationId}
                    onValueChange={setIntegrationId}
                    className="mt-1"
                    aria-label="Account"
                    required
                    options={connections.map((connection) => ({
                      value: connection.id,
                      label: connection.displayName,
                      icon: <ProviderIcon provider={connection.provider} />,
                      description: providerLabel(connection.provider),
                    }))}
                  />
                </div>
              ) : (
                <input type="hidden" name="integrationId" value={integrationId} />
              )}

              <div>
                <Label htmlFor="task-remote-search">Provider project</Label>
                <div className="relative mt-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                    aria-hidden="true"
                  />
                  <Input
                    id="task-remote-search"
                    value={remoteQuery}
                    onChange={(event) => setRemoteQuery(event.target.value)}
                    placeholder="Search projects"
                    className="pl-9"
                    disabled={loadingRemotes || !integrationId}
                  />
                </div>
                {loadingRemotes ? (
                  <p className="mt-2 text-sm text-muted">Loading projects…</p>
                ) : remoteError ? (
                  <p className="mt-2 text-sm text-destructive">{remoteError}</p>
                ) : filteredRemotes.length === 0 ? (
                  <p className="mt-2 rounded-lg border border-dashed px-3 py-6 text-sm text-muted">
                    No projects found for this account.
                  </p>
                ) : (
                  <ul className="mt-2 max-h-48 divide-y overflow-auto rounded-lg border bg-card">
                    {filteredRemotes.map((project) => {
                      const checked = selectedRemote?.providerId === project.providerId;
                      return (
                        <li key={project.providerId}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm",
                              checked ? "bg-muted/40" : "hover:bg-muted/20",
                            )}
                          >
                            <Radio
                              name="providerProjectId"
                              value={project.providerId}
                              required
                              checked={checked}
                              onChange={() => setSelectedRemoteId(project.providerId)}
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{project.name}</span>
                              {project.key ? (
                                <span className="block truncate text-xs text-muted">{project.key}</span>
                              ) : null}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <input type="hidden" name="providerProjectName" value={selectedRemote?.name ?? ""} />
                <input type="hidden" name="providerProjectKey" value={selectedRemote?.key ?? ""} />
                <input type="hidden" name="providerProjectUrl" value={selectedRemote?.url ?? ""} />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required className="mt-1" autoFocus />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" className="mt-1" rows={3} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="task-status">Status</Label>
              <MenuSelect
                id="task-status"
                name="status"
                defaultValue="open"
                className="mt-1"
                aria-label="Status"
                options={[
                  { value: "open", label: "Open" },
                  { value: "in_progress", label: "In progress" },
                  { value: "blocked", label: "Blocked" },
                  { value: "done", label: "Done" },
                  { value: "cancelled", label: "Cancelled" },
                ]}
              />
            </div>
            <div>
              <Label htmlFor="task-priority">Priority</Label>
              <MenuSelect
                id="task-priority"
                name="priority"
                defaultValue="medium"
                className="mt-1"
                aria-label="Priority"
                options={[
                  { value: "none", label: "No priority" },
                  { value: "low", label: "Low" },
                  { value: "medium", label: "Medium" },
                  { value: "high", label: "High" },
                  { value: "urgent", label: "Urgent" },
                ]}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="task-due">Due date</Label>
            <Input id="task-due" name="dueAt" type="date" className="mt-1" aria-label="Due date" />
          </div>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                pending
                || (destination === "provider" && (loadingRemotes || !selectedRemote || !integrationId))
              }
            >
              {pending ? "Saving…" : destination === "provider" ? "Create and sync" : "Create task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
