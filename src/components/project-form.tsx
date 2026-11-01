"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { Plus, Search } from "lucide-react";
import {
  linkProjectAction,
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

export type ProjectFormIntegration = {
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

export function ProjectForm({
  workspaceId,
  action,
  integrations = [],
}: {
  workspaceId: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  integrations?: ProjectFormIntegration[];
}) {
  const [open, setOpen] = useState(false);
  const [createState, createAction, createPending] = useActionState<ActionState, FormData>(action, {});
  const [linkState, linkAction, linkPending] = useActionState<ActionState, FormData>(linkProjectAction, {});
  const [seenError, setSeenError] = useState<string | null>(null);

  const canLinkProvider = integrations.length > 0;
  const [mode, setMode] = useState<"native" | "integration">("native");

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

  const pending = mode === "native" ? createPending : linkPending;
  const error = mode === "native" ? createState.error : linkState.error;

  if (error && error !== seenError) {
    setSeenError(error);
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
    if (!open || mode !== "integration" || !integrationId) return;
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
  }, [open, mode, integrationId, workspaceId]);

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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setRemoteError(null);
          setRemoteQuery("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="size-4" aria-hidden="true" />
          New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(100%-2rem,36rem)]">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Create a native Atrium project, or link one from a connected integration.
          </DialogDescription>
        </DialogHeader>

        <form action={mode === "native" ? createAction : linkAction} className="grid gap-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />

          {canLinkProvider ? (
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Source</legend>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 has-[:checked]:border-primary">
                <Radio
                  name="projectSource"
                  value="native"
                  checked={mode === "native"}
                  onChange={() => setMode("native")}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">Native in Atrium</span>
                  <span className="block text-xs text-muted">
                    Owned here. You can link a provider later from Integrations.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 has-[:checked]:border-primary">
                <Radio
                  name="projectSource"
                  value="integration"
                  checked={mode === "integration"}
                  onChange={() => setMode("integration")}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">From an integration</span>
                  <span className="block text-xs text-muted">
                    Pick a project from Linear, Jira, GitHub, GitLab, or Gitea.
                  </span>
                </span>
              </label>
            </fieldset>
          ) : null}

          {mode === "native" ? (
            <>
              <div>
                <Label htmlFor="project-name">Name</Label>
                <Input id="project-name" name="name" required className="mt-1" autoFocus />
              </div>
              <div>
                <Label htmlFor="project-description">Description</Label>
                <Textarea id="project-description" name="description" className="mt-1" rows={3} />
              </div>
            </>
          ) : (
            <div className="grid gap-4">
              <div>
                <Label htmlFor="project-source">Integration</Label>
                <MenuSelect
                  id="project-source"
                  value={provider}
                  onValueChange={setProvider}
                  className="mt-1"
                  aria-label="Integration"
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
                  <Label htmlFor="project-connection">Account</Label>
                  <MenuSelect
                    id="project-connection"
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
                <Label htmlFor="project-remote-search">Provider project</Label>
                <div className="relative mt-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                    aria-hidden="true"
                  />
                  <Input
                    id="project-remote-search"
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
                  <ul className="mt-2 max-h-56 divide-y overflow-auto rounded-lg border bg-card">
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
                <input type="hidden" name="name" value={selectedRemote?.name ?? ""} />
                <input type="hidden" name="key" value={selectedRemote?.key ?? ""} />
                <input type="hidden" name="url" value={selectedRemote?.url ?? ""} />
              </div>
            </div>
          )}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                pending
                || (mode === "integration" && (loadingRemotes || !selectedRemote || !integrationId))
              }
            >
              {pending
                ? mode === "integration"
                  ? "Linking…"
                  : "Creating…"
                : mode === "integration"
                  ? "Link project"
                  : "Create project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
