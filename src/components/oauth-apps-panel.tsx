"use client";

import { useActionState } from "react";
import { deleteOAuthAppAction, saveOAuthAppAction, shareOAuthAppAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { ShareToWorkspaceDialog } from "@/components/share-to-workspace-dialog";
import { OAUTH_PROVIDER_LABELS, OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/oauth-providers";
import type { OAuthAppOverview } from "@/server/integrations/oauth-apps";
import { IntegrationGuide } from "@/components/integration-guide";

const SOURCE_LABELS: Record<NonNullable<OAuthAppOverview["source"]>, string> = {
  workspace: "Saved in this workspace",
  environment: "From the server environment",
};

// Lets owners and admins add, change, or remove the OAuth app for each provider.
// Values saved here take priority over the server's environment variables.
export function OAuthAppsPanel({
  workspaceId,
  canAdmin,
  callbackBase,
  overview,
}: {
  workspaceId: string;
  canAdmin: boolean;
  callbackBase: string;
  overview: Record<OAuthProvider, OAuthAppOverview>;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl">OAuth apps</h2>
        <p className="text-sm text-muted">
          Register an OAuth app with each provider and paste its client ID and secret here. Each provider&apos;s callback
          URL must be added to its app settings. Secrets are encrypted and never shown again.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {OAUTH_PROVIDERS.map((provider) => (
          <OAuthAppCard
            key={provider}
            provider={provider}
            workspaceId={workspaceId}
            canAdmin={canAdmin}
            callbackUrl={`${callbackBase}/api/integrations/oauth/${provider}/callback`}
            callbackBase={callbackBase}
            status={overview[provider]}
          />
        ))}
      </div>
    </section>
  );
}

function OAuthAppCard({
  provider,
  workspaceId,
  canAdmin,
  callbackUrl,
  callbackBase,
  status,
}: {
  provider: OAuthProvider;
  workspaceId: string;
  canAdmin: boolean;
  callbackUrl: string;
  callbackBase: string;
  status: OAuthAppOverview;
}) {
  const [state, formAction, pending] = useActionState(saveOAuthAppAction, {});
  const label = OAUTH_PROVIDER_LABELS[provider];
  const sourceLabel = status.source ? SOURCE_LABELS[status.source] : "Not configured";

  return (
    <article className="space-y-3 rounded-lg border bg-card p-4">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-lg">{label}</h3>
        <span className="text-xs text-muted">{sourceLabel}</span>
      </header>
      <p className="break-all text-xs text-muted">
        Callback URL: <span className="font-mono">{callbackUrl}</span>
      </p>
      <IntegrationGuide provider={provider} callbackBase={callbackBase} />

      {canAdmin ? (
        <form action={formAction} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="provider" value={provider} />
          <div>
            <Label htmlFor={`${provider}-client-id`}>Client ID</Label>
            <Input
              id={`${provider}-client-id`}
              name="clientId"
              defaultValue={status.clientId ?? ""}
              required
              autoComplete="off"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor={`${provider}-client-secret`}>Client secret</Label>
            <Input
              id={`${provider}-client-secret`}
              name="clientSecret"
              type="password"
              autoComplete="new-password"
              placeholder={status.source === "workspace" ? "Saved. Leave blank to keep it." : ""}
              className="mt-1"
            />
          </div>
          {provider === "gitea" ? (
            <div className="md:col-span-2">
              <Label htmlFor="gitea-site-url">Gitea site URL</Label>
              <Input
                id="gitea-site-url"
                name="siteUrl"
                defaultValue={status.siteUrl ?? ""}
                placeholder="https://gitea.example.com"
                className="mt-1"
              />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 md:col-span-2">
            <p aria-live="polite" className="text-sm text-muted">
              {state.error ? <span className="text-destructive">{state.error}</span> : state.notice ?? ""}
            </p>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving" : "Save"}
            </Button>
          </div>
        </form>
      ) : null}

      {canAdmin && status.source === "workspace" ? (
        <div className="flex flex-wrap items-center gap-2">
          <ShareToWorkspaceDialog
            workspaceId={workspaceId}
            title={`Share ${label} OAuth app`}
            description="Copies the client ID and secret into another workspace you administer. Each workspace keeps its own encrypted copy."
            action={shareOAuthAppAction}
            hiddenFields={{ provider }}
            triggerLabel="Share to workspace"
          />
          <form action={deleteOAuthAppAction}>
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="provider" value={provider} />
            <Button type="submit" variant="outline" size="sm">
              Remove workspace settings
            </Button>
          </form>
        </div>
      ) : null}
    </article>
  );
}
