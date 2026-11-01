"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ChevronRight, FolderKanban, Plus } from "lucide-react";
import {
  connectTokenAction,
  oauthStartAction,
  type ActionState,
} from "@/app/actions";
import { ConnectForm } from "@/components/connect-form";
import { IntegrationGuide } from "@/components/integration-guide";
import { OAuthSetupForm } from "@/components/oauth-setup-form";
import { ProviderIcon, providerLabel } from "@/components/provider-icon";
import { Badge } from "@/components/ui/badge";
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
import { isOAuthProvider } from "@/lib/oauth-providers";

type IntegrationRow = {
  id: string;
  provider: string;
  status: string;
  display_name: string;
  hasCredential: boolean;
};

const PROVIDER_COPY: Record<string, string> = {
  linear: "Link a Linear team and sync its issues into this workspace.",
  jira: "Link a Jira Cloud project and keep issues in sync.",
  github: "Track issues from a GitHub repository you choose.",
  gitlab: "Sync issues from a GitLab project you choose.",
  gitea: "Sync issues from a Gitea repository you choose.",
};

export function HomeNoProjects({
  workspaceId,
  canManage,
  integrations,
  providers,
  oauth,
  callbackBase,
  createAction,
}: {
  workspaceId: string;
  canManage: boolean;
  integrations: IntegrationRow[];
  providers: string[];
  oauth: Record<string, boolean>;
  callbackBase: string;
  createAction: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createAction, {});

  const connected = integrations.filter(
    (item) => item.status === "connected" && item.hasCredential,
  );
  const connectedProviders = new Set(connected.map((item) => item.provider));
  const availableProviders = providers.filter((provider) => !connectedProviders.has(provider));

  return (
    <section
      className="flex min-h-[18rem] flex-col items-center justify-center gap-5 rounded-lg border border-dashed bg-card/40 px-6 py-12 text-center"
      data-tour="home-no-projects"
    >
      <div className="inline-flex size-14 items-center justify-center rounded-full border bg-background text-muted">
        <FolderKanban className="size-7" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl">No projects yet</h2>
        <p className="mx-auto max-w-md text-sm text-muted">
          This workspace has no projects. Add one from a connected provider, or create a native
          Atrium project to start tracking work.
        </p>
      </div>

      {canManage ? (
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setSelected(null);
          }}
        >
          <DialogTrigger asChild>
            <Button type="button">
              <Plus className="size-4" aria-hidden="true" />
              Add project
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[min(100%-2rem,36rem)]">
            <DialogHeader>
              <DialogTitle>Add a project</DialogTitle>
              <DialogDescription>
                Link a project from an integration, connect a provider, or create a native Atrium
                project.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium">From integrations</h3>
                  <p className="text-xs text-muted">
                    Open a connected provider to pick a remote project and sync it here.
                  </p>
                </div>
                {connected.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted">
                    No task providers connected yet. Choose one below to get started.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {connected.map((integration) => (
                      <li key={integration.id}>
                        <Link
                          href={`/integrations/${integration.id}`}
                          className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5 transition hover:border-foreground/20 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <ProviderIcon provider={integration.provider} />
                          <span className="min-w-0 flex-1 text-left">
                            <span className="block truncate text-sm font-medium">
                              {integration.display_name}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              Link a {providerLabel(integration.provider)} project
                            </span>
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {availableProviders.length > 0 ? (
                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-medium">Connect a provider</h3>
                    <p className="text-xs text-muted">Then come back to link a remote project.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {availableProviders.map((provider) => (
                      <button
                        key={provider}
                        type="button"
                        onClick={() => setSelected(provider)}
                        className="rounded-lg border bg-background p-3 text-left transition hover:border-foreground/20 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <ProviderIcon provider={provider} />
                          {oauth[provider] ? (
                            <Badge tone="connected">OAuth</Badge>
                          ) : (
                            <Badge tone="neutral">Token</Badge>
                          )}
                        </div>
                        <p className="mt-2 text-sm font-medium">{providerLabel(provider)}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {PROVIDER_COPY[provider] ?? "Connect this provider to link projects."}
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="space-y-3 border-t pt-5">
                <div>
                  <h3 className="text-sm font-medium">Or create a native project</h3>
                  <p className="text-xs text-muted">Owned in Atrium. You can link a provider later.</p>
                </div>
                <form action={formAction} className="grid gap-3">
                  <input type="hidden" name="workspaceId" value={workspaceId} />
                  <div>
                    <Label htmlFor="home-project-name">Name</Label>
                    <Input id="home-project-name" name="name" required className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="home-project-description">Description</Label>
                    <Textarea id="home-project-description" name="description" className="mt-1" rows={2} />
                  </div>
                  {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
                  <Button type="submit" disabled={pending}>
                    {pending ? "Creating…" : "Create native project"}
                  </Button>
                </form>
              </section>
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        <p className="text-sm text-muted">Ask a workspace owner or admin to add the first project.</p>
      )}

      <Dialog open={selected !== null} onOpenChange={(next) => { if (!next) setSelected(null); }}>
        <DialogContent>
          {selected ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <ProviderIcon provider={selected} size="md" />
                  <div>
                    <DialogTitle>Connect {providerLabel(selected)}</DialogTitle>
                    <DialogDescription>
                      {isOAuthProvider(selected) && !oauth[selected]
                        ? `Add the ${providerLabel(selected)} OAuth app once, then connect this workspace.`
                        : oauth[selected]
                          ? `Sign in with ${providerLabel(selected)}, or paste an access token.`
                          : `Paste an access token for ${providerLabel(selected)}.`}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              {isOAuthProvider(selected) && !oauth[selected] ? (
                <>
                  <OAuthSetupForm workspaceId={workspaceId} provider={selected} callbackBase={callbackBase} />
                  <div className="flex items-center gap-3 text-xs uppercase tracking-[0.14em] text-muted">
                    <span className="h-px flex-1 bg-border" />
                    Or paste a token
                    <span className="h-px flex-1 bg-border" />
                  </div>
                </>
              ) : null}
              {oauth[selected] ? (
                <>
                  <IntegrationGuide provider={selected} callbackBase={callbackBase} />
                  <form action={oauthStartAction}>
                    <input type="hidden" name="workspaceId" value={workspaceId} />
                    <input type="hidden" name="provider" value={selected} />
                    <Button type="submit" className="w-full">
                      Continue with {providerLabel(selected)}
                    </Button>
                  </form>
                  <div className="flex items-center gap-3 text-xs uppercase tracking-[0.14em] text-muted">
                    <span className="h-px flex-1 bg-border" />
                    Or paste a token
                    <span className="h-px flex-1 bg-border" />
                  </div>
                </>
              ) : null}
              <ConnectForm
                workspaceId={workspaceId}
                providers={[selected]}
                provider={selected}
                compact
                action={connectTokenAction as (state: ActionState, formData: FormData) => Promise<ActionState>}
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
