"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft, Columns3, FolderKanban, Layers3, Plus, Search } from "lucide-react";
import {
  linkProjectAction,
  listGithubBoardsForCreateAction,
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

export type ProjectFormProduct = {
  id: string;
  name: string;
  parentId?: string | null;
};

type RemoteProjectOption = {
  providerId: string;
  name: string;
  key: string | null;
  url: string | null;
};

type GithubBoardOption = {
  id: string;
  title: string;
  number: number;
  url: string;
};

type Step = "source" | "native" | "integration" | "remote";

export function ProjectForm({
  workspaceId,
  action,
  integrations = [],
  products = [],
  productId: initialProductId,
}: {
  workspaceId: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  integrations?: ProjectFormIntegration[];
  products?: ProjectFormProduct[];
  productId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [createState, createAction, createPending] = useActionState<ActionState, FormData>(action, {});
  const [linkState, linkAction, linkPending] = useActionState<ActionState, FormData>(linkProjectAction, {});
  const [seenError, setSeenError] = useState<string | null>(null);
  const [productId, setProductId] = useState(initialProductId ?? products[0]?.id ?? "");

  const canLinkProvider = integrations.length > 0;
  const [mode, setMode] = useState<"native" | "integration">("native");
  const [step, setStep] = useState<Step>("source");

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
  const [boards, setBoards] = useState<GithubBoardOption[]>([]);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [loadingBoards, startLoadBoards] = useTransition();

  const pending = mode === "native" ? createPending : linkPending;
  const error = mode === "native" ? createState.error : linkState.error;
  const isGithub = provider === "github";

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
    if (initialProductId) {
      setProductId(initialProductId);
      return;
    }
    if (!products.some((product) => product.id === productId)) {
      setProductId(products[0]?.id ?? "");
    }
  }, [initialProductId, productId, products]);

  useEffect(() => {
    if (!open || step !== "remote" || !integrationId) return;
    let cancelled = false;
    startLoadRemotes(async () => {
      setRemoteError(null);
      setRemoteProjects([]);
      setSelectedRemoteId("");
      setRemoteQuery("");
      setBoards([]);
      setSelectedBoardId("");
      setBoardError(null);
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
  }, [open, step, integrationId, workspaceId]);

  useEffect(() => {
    if (!open || step !== "remote" || !isGithub || !integrationId || !selectedRemoteId) {
      return;
    }
    let cancelled = false;
    startLoadBoards(async () => {
      setBoardError(null);
      setBoards([]);
      setSelectedBoardId("");
      const result = await listGithubBoardsForCreateAction(workspaceId, integrationId, selectedRemoteId);
      if (cancelled) return;
      if ("error" in result) {
        setBoardError(result.error);
        return;
      }
      setBoards(result.boards);
      setSelectedBoardId(result.boards[0]?.id ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [open, step, isGithub, integrationId, selectedRemoteId, workspaceId]);

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

  function resetWizard() {
    setMode("native");
    setStep("source");
    setRemoteError(null);
    setRemoteQuery("");
    setRemoteProjects([]);
    setSelectedRemoteId("");
    setBoards([]);
    setSelectedBoardId("");
    setBoardError(null);
  }

  const stepMeta = useMemo(() => {
    if (step === "source") {
      return {
        title: "New project",
        description: "Choose how this project should live in Atrium.",
        index: 1,
        total: canLinkProvider ? 3 : 2,
      };
    }
    if (step === "native") {
      return {
        title: "Native project",
        description: "Owned in Atrium. You can link a provider later.",
        index: 2,
        total: canLinkProvider ? 2 : 2,
      };
    }
    if (step === "integration") {
      return {
        title: "Choose integration",
        description: "Pick the provider account to link from.",
        index: 2,
        total: 3,
      };
    }
    return {
      title: isGithub ? "Codebase & project board" : "Provider project",
      description: isGithub
        ? "Link a GitHub repository and optionally a Projects board into one Atrium project."
        : `Pick a ${providerLabel(provider) || "provider"} project to sync.`,
      index: 3,
      total: 3,
    };
  }, [step, canLinkProvider, isGithub, provider]);

  const stepIndicator =
    stepMeta.total > 1 ? (
      <ol
        className="flex items-center gap-1"
        aria-label={`Step ${stepMeta.index} of ${stepMeta.total}`}
      >
        {Array.from({ length: stepMeta.total }, (_, offset) => {
          const stepNumber = offset + 1;
          const complete = stepNumber < stepMeta.index;
          const current = stepNumber === stepMeta.index;
          return (
            <li key={stepNumber}>
              <span
                className={cn(
                  "block h-1.5 w-8 rounded-full transition-colors",
                  complete || current ? "bg-primary" : "bg-border",
                )}
                title={`Step ${stepNumber}`}
                aria-current={current ? "step" : undefined}
              />
            </li>
          );
        })}
      </ol>
    ) : (
      <span />
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetWizard();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="size-4" aria-hidden="true" />
          New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(100%-2rem,40rem)]">
        <DialogHeader>
          <DialogTitle>{stepMeta.title}</DialogTitle>
          <DialogDescription>{stepMeta.description}</DialogDescription>
        </DialogHeader>

        {step === "source" ? (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode("native")}
                className={cn(
                  "rounded-xl border bg-background p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  mode === "native"
                    ? "border-primary ring-1 ring-primary/30"
                    : "hover:border-foreground/20 hover:bg-accent/40",
                )}
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <FolderKanban className="size-5" aria-hidden="true" />
                </span>
                <span className="mt-3 block text-sm font-medium">Native in Atrium</span>
                <span className="mt-1 block text-xs text-muted">
                  Owned here. Link a provider later if you need sync.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMode("integration")}
                disabled={!canLinkProvider}
                className={cn(
                  "rounded-xl border bg-background p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                  mode === "integration"
                    ? "border-primary ring-1 ring-primary/30"
                    : "hover:border-foreground/20 hover:bg-accent/40",
                )}
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <Layers3 className="size-5" aria-hidden="true" />
                </span>
                <span className="mt-3 block text-sm font-medium">From an integration</span>
                <span className="mt-1 block text-xs text-muted">
                  {canLinkProvider
                    ? "Connect a codebase and project board from GitHub, Linear, and more."
                    : "Connect a task provider in Integrations first."}
                </span>
              </button>
            </div>
            <div className="flex items-center justify-between gap-3">
              {stepIndicator}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => setStep(mode === "native" ? "native" : "integration")}
                  disabled={mode === "integration" && !canLinkProvider}
                >
                  Continue
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {step === "native" ? (
          <form action={createAction} className="grid gap-4">
            <input type="hidden" name="workspaceId" value={workspaceId} />
            {products.length === 1 ? (
              <input type="hidden" name="productId" value={productId} />
            ) : products.length > 1 ? (
              <div>
                <Label htmlFor="project-product">Product</Label>
                <MenuSelect
                  id="project-product"
                  name="productId"
                  value={productId}
                  onValueChange={setProductId}
                  className="mt-1"
                  aria-label="Product"
                  required
                  options={products.map((product) => ({
                    value: product.id,
                    label: product.name,
                  }))}
                />
              </div>
            ) : (
              <input type="hidden" name="productId" value={productId} />
            )}
            <div>
              <Label htmlFor="project-name">Name</Label>
              <Input id="project-name" name="name" required className="mt-1" autoFocus />
            </div>
            <div>
              <Label htmlFor="project-description">Description</Label>
              <Textarea id="project-description" name="description" className="mt-1" rows={3} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {stepIndicator}
                <Button type="button" variant="ghost" onClick={() => setStep("source")} disabled={pending}>
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Back
                </Button>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Creating…" : "Create project"}
                </Button>
              </div>
            </div>
          </form>
        ) : null}

        {step === "integration" ? (
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
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {stepIndicator}
                <Button type="button" variant="ghost" onClick={() => setStep("source")}>
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Back
                </Button>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => setStep("remote")} disabled={!integrationId}>
                  Continue
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {step === "remote" ? (
          <form action={linkAction} className="grid gap-4">
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="integrationId" value={integrationId} />
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="name" value={selectedRemote?.name ?? ""} />
            <input type="hidden" name="key" value={selectedRemote?.key ?? ""} />
            <input type="hidden" name="url" value={selectedRemote?.url ?? ""} />
            <input type="hidden" name="githubProjectNodeId" value={isGithub ? selectedBoardId : ""} />
            <input
              type="hidden"
              name="githubProjectTitle"
              value={
                isGithub
                  ? (boards.find((board) => board.id === selectedBoardId)?.title ?? "")
                  : ""
              }
            />
            <input
              type="hidden"
              name="githubProjectUrl"
              value={
                isGithub
                  ? (boards.find((board) => board.id === selectedBoardId)?.url ?? "")
                  : ""
              }
            />

            {products.length > 1 ? (
              <div>
                <Label htmlFor="project-product-link">Product</Label>
                <MenuSelect
                  id="project-product-link"
                  value={productId}
                  onValueChange={setProductId}
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

            <div className={cn("grid gap-4", isGithub && "lg:grid-cols-2")}>
              <section className="min-w-0 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                    <FolderKanban className="size-3.5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{isGithub ? "Codebase" : "Provider project"}</p>
                    <p className="text-xs text-muted">
                      {isGithub ? "GitHub repository to sync issues from" : "Remote project to link"}
                    </p>
                  </div>
                </div>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                    aria-hidden="true"
                  />
                  <Input
                    id="project-remote-search"
                    value={remoteQuery}
                    onChange={(event) => setRemoteQuery(event.target.value)}
                    placeholder={isGithub ? "Search repositories" : "Search projects"}
                    className="pl-9"
                    disabled={loadingRemotes || !integrationId}
                  />
                </div>
                {loadingRemotes ? (
                  <p className="text-sm text-muted">Loading…</p>
                ) : remoteError ? (
                  <p className="text-sm text-destructive">{remoteError}</p>
                ) : filteredRemotes.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-3 py-6 text-sm text-muted">
                    No {isGithub ? "repositories" : "projects"} found for this account.
                  </p>
                ) : (
                  <ul className="max-h-52 divide-y overflow-auto rounded-lg border bg-card">
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
              </section>

              {isGithub ? (
                <section className="min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                      <Columns3 className="size-3.5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">Project board</p>
                      <p className="text-xs text-muted">Optional Projects v2 board for Status sync</p>
                    </div>
                  </div>
                  {!selectedRemoteId ? (
                    <p className="rounded-lg border border-dashed px-3 py-6 text-sm text-muted">
                      Select a repository first.
                    </p>
                  ) : loadingBoards ? (
                    <p className="text-sm text-muted">Loading boards…</p>
                  ) : boardError ? (
                    <p className="text-sm text-destructive">{boardError}</p>
                  ) : boards.length === 0 ? (
                    <p className="rounded-lg border border-dashed px-3 py-6 text-sm text-muted">
                      No boards on this repository. You can link one later from project Manage.
                    </p>
                  ) : (
                    <ul className="max-h-52 divide-y overflow-auto rounded-lg border bg-card">
                      <li>
                        <label
                          className={cn(
                            "flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm",
                            !selectedBoardId ? "bg-muted/40" : "hover:bg-muted/20",
                          )}
                        >
                          <Radio
                            name="githubBoardChoice"
                            value=""
                            checked={!selectedBoardId}
                            onChange={() => setSelectedBoardId("")}
                          />
                          <span className="min-w-0">
                            <span className="block font-medium">Skip for now</span>
                            <span className="block text-xs text-muted">Auto-pick or configure later</span>
                          </span>
                        </label>
                      </li>
                      {boards.map((board) => {
                        const checked = selectedBoardId === board.id;
                        return (
                          <li key={board.id}>
                            <label
                              className={cn(
                                "flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm",
                                checked ? "bg-muted/40" : "hover:bg-muted/20",
                              )}
                            >
                              <Radio
                                name="githubBoardChoice"
                                value={board.id}
                                checked={checked}
                                onChange={() => setSelectedBoardId(board.id)}
                              />
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{board.title}</span>
                                <span className="block truncate text-xs text-muted">#{board.number}</span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              ) : null}
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {stepIndicator}
                <Button type="button" variant="ghost" onClick={() => setStep("integration")} disabled={pending}>
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Back
                </Button>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={pending || loadingRemotes || !selectedRemote || !integrationId}
                >
                  {pending ? "Linking…" : "Link project"}
                </Button>
              </div>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
