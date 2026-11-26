"use client";

import { useActionState, useState } from "react";
import { Bot, Copy, Check } from "lucide-react";
import { createWorkspaceAgentAction, disableWorkspaceAgentAction, type ActionState } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";

type AgentRow = {
  id: string;
  display_name: string;
  webhook_url: string;
};

export function AgentsPanel({
  workspaceId,
  agents,
  canAdmin,
}: {
  workspaceId: string;
  agents: AgentRow[];
  canAdmin: boolean;
}) {
  const [createState, createAction, creating] = useActionState<ActionState, FormData>(createWorkspaceAgentAction, {});
  const [copied, setCopied] = useState(false);
  const issuedToken = createState.token;

  async function copyToken() {
    if (!issuedToken) return;
    await navigator.clipboard.writeText(issuedToken);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Assignees</p>
          <h2 className="text-2xl">Agents</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            An agent is a workspace member. Assign it and move the issue to To do, and Atrium sends that webhook.
            The Hermes host is not changed from here.
          </p>
        </div>
        <Badge tone="native">
          <Bot className="size-3.5" aria-hidden="true" />
          Hermes
        </Badge>
      </div>

      {agents.length === 0 ? (
        <p className="text-sm text-muted">No agents in this workspace yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {agents.map((agent) => (
            <li key={agent.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{agent.display_name}</p>
                <p className="truncate text-xs text-muted">{agent.webhook_url}</p>
              </div>
              {canAdmin ? (
                <form action={disableWorkspaceAgentAction}>
                  <input type="hidden" name="workspaceId" value={workspaceId} />
                  <input type="hidden" name="agentId" value={agent.id} />
                  <Button type="submit" variant="outline" size="sm">
                    Disable
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canAdmin ? (
        <form action={createAction} className="grid gap-3 rounded-lg border p-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="agent-name">Name</Label>
              <Input id="agent-name" name="name" required minLength={2} maxLength={80} className="mt-1" placeholder="Hermes" />
            </div>
            <div>
              <Label htmlFor="agent-webhook">Webhook URL</Label>
              <Input
                id="agent-webhook"
                name="webhookUrl"
                type="url"
                required
                className="mt-1"
                placeholder="https://hermes.example/webhooks/atrium"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="agent-secret">Webhook secret</Label>
            <Input
              id="agent-secret"
              name="webhookSecret"
              type="password"
              required
              minLength={8}
              autoComplete="off"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted">Stored encrypted. Used to sign the To do hand-off. It is not shown again.</p>
          </div>
          {createState.error ? <p className="text-sm text-destructive">{createState.error}</p> : null}
          {createState.notice ? <p className="text-sm text-muted">{createState.notice}</p> : null}
          {issuedToken ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="max-w-full truncate rounded bg-muted px-2 py-1 text-xs">{issuedToken}</code>
              <Button type="button" variant="outline" size="sm" onClick={() => void copyToken()}>
                {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
                {copied ? "Copied" : "Copy token"}
              </Button>
            </div>
          ) : null}
          <div>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating…" : "Add agent"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted">Owners and admins can add agents.</p>
      )}
    </section>
  );
}
