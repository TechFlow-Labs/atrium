"use client";

import { useState, useTransition, type FormEvent } from "react";
import { connectOAuthAction, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { providerLabel } from "@/components/provider-icon";
import type { OAuthProvider } from "@/lib/oauth-providers";
import { IntegrationGuide } from "@/components/integration-guide";

// Shown when a provider has no OAuth app yet. The values are saved to this
// workspace, then the user is sent to the provider to authorize Atrium. The
// labels show the matching server variables, for deployments that set them
// there instead.
export function OAuthSetupForm({
  workspaceId,
  provider,
  callbackBase,
}: {
  workspaceId: string;
  provider: OAuthProvider;
  callbackBase: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startConnect] = useTransition();
  const label = providerLabel(provider);
  const prefix = provider.toUpperCase();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startConnect(async () => {
      const result: ActionState = await connectOAuthAction({}, formData);
      if (result.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <IntegrationGuide provider={provider} callbackBase={callbackBase} defaultOpen />
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="provider" value={provider} />
      <p className="text-sm text-muted">
        Create a {label} app, then enter its credentials. You will be sent to {label} to authorize Atrium.
      </p>
      <div>
        <Label htmlFor={`oauth-setup-${provider}-client-id`}>Client ID</Label>
        <p className="text-xs text-muted">
          Server variable: <span className="font-mono">{prefix}_CLIENT_ID</span>
        </p>
        <Input
          id={`oauth-setup-${provider}-client-id`}
          name="clientId"
          required
          autoComplete="off"
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor={`oauth-setup-${provider}-client-secret`}>Client secret</Label>
        <p className="text-xs text-muted">
          Server variable: <span className="font-mono">{prefix}_CLIENT_SECRET</span>
        </p>
        <Input
          id={`oauth-setup-${provider}-client-secret`}
          name="clientSecret"
          type="password"
          required
          autoComplete="new-password"
          className="mt-1"
        />
      </div>
      {provider === "gitea" ? (
        <div>
          <Label htmlFor="oauth-setup-gitea-site-url">Gitea site URL</Label>
          <p className="text-xs text-muted">
            Server variable: <span className="font-mono">GITEA_SITE_URL</span>, default https://gitea.com
          </p>
          <Input
            id="oauth-setup-gitea-site-url"
            name="siteUrl"
            placeholder="https://gitea.example.com"
            className="mt-1"
          />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Starting…" : `Save app and continue to ${label}`}
      </Button>
    </form>
  );
}
