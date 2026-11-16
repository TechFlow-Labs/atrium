import { describe, expect, it } from "vitest";
import { ACTIONS, AuthorizationError, assertCan, can } from "@/server/authz/permissions";
import { nextDelayMs } from "@/server/sync/backoff";
import { decideInbound, authoritativeSide } from "@/server/sync/authority";
import { fingerprintSnapshot, type CanonicalSnapshot } from "@/server/sync/fingerprint";
import { decryptSecret, encryptSecret, signHmacSha256, verifyHmacSha256 } from "@/server/crypto/secrets";
import { assertSafeOutboundUrl, isPrivateAddress } from "@/server/crypto/ssrf";
import { redact } from "@/server/log";
import { ProviderError } from "@/server/integrations/types";
import { giteaAdapter } from "@/server/integrations/gitea";
import { githubAdapter } from "@/server/integrations/github";
import { jiraAdapter } from "@/server/integrations/jira";
import { linearAdapter } from "@/server/integrations/linear";
import { setDnsResolver, setProviderFetch } from "@/server/integrations/http";

const snapshot = (title: string): CanonicalSnapshot => ({
  title,
  description: "notes",
  status: "open",
  priority: "medium",
  dueAt: null,
  assignee: null,
});

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("workspace permissions", () => {
  it("lets members write tasks and keeps viewers read-only", () => {
    expect(can("viewer", "task.read")).toBe(true);
    expect(can("viewer", "task.write")).toBe(false);
    expect(can("member", "task.write")).toBe(true);
    expect(can("member", "integration.manage")).toBe(false);
    expect(can("admin", "workspace.delete")).toBe(false);
    expect(can("admin", "member.invite_admin")).toBe(false);
    expect(can("owner", "workspace.delete")).toBe(true);
    expect(ACTIONS.every((action) => can("owner", action))).toBe(true);
  });

  it("throws a named authorization error", () => {
    expect(() => assertCan("viewer", "project.create")).toThrow(AuthorizationError);
  });
});

describe("sync authority", () => {
  it("refuses hybrid ownership", () => {
    expect(authoritativeSide("external")).toBe("provider");
    expect(authoritativeSide("native")).toBe("admin");
    expect(() => authoritativeSide("hybrid")).toThrow(/Hybrid/);
  });

  it("skips echoes, applies external changes, and conflicts on native drift", () => {
    const local = snapshot("Draft");
    const same = snapshot("Draft");
    const changed = snapshot("Published");
    const fingerprint = fingerprintSnapshot(same);
    expect(decideInbound({
      ownership: "external",
      projection: local,
      incoming: same,
      pendingOutboundFields: [],
      recentOutboundFingerprints: [fingerprint],
    }).type).toBe("skip_echo");
    expect(decideInbound({
      ownership: "external",
      projection: local,
      incoming: changed,
      pendingOutboundFields: [],
      recentOutboundFingerprints: [],
    })).toEqual({ type: "apply" });
    expect(decideInbound({
      ownership: "external",
      projection: local,
      incoming: changed,
      pendingOutboundFields: ["title"],
      recentOutboundFingerprints: [],
    })).toEqual({ type: "conflict", fields: ["title"] });
    expect(decideInbound({
      ownership: "native",
      projection: local,
      incoming: changed,
      pendingOutboundFields: [],
      recentOutboundFingerprints: [],
    }).type).toBe("conflict");
  });

  it("backs off with jitter inside the upper half of the window", () => {
    expect(nextDelayMs(0, 0)).toBe(500);
    expect(nextDelayMs(0, 1)).toBe(1000);
    expect(nextDelayMs(2, 1)).toBe(4000);
    expect(nextDelayMs(20, 1)).toBe(300_000);
  });
});

describe("credentials and outbound safety", () => {
  it("round-trips a secret and rejects a tampered envelope", () => {
    const envelope = encryptSecret("linear-token");
    expect(envelope.startsWith("v1.")).toBe(true);
    expect(decryptSecret(envelope)).toBe("linear-token");
    const broken = envelope.replace(/[A-Za-z0-9]/, (char) => (char === "A" ? "B" : "A"));
    expect(() => decryptSecret(broken)).toThrow();
  });

  it("verifies HMAC signatures against the raw body", () => {
    const raw = '{"ok":true}';
    const signature = `sha256=${signHmacSha256("hook", raw).toString("hex")}`;
    expect(verifyHmacSha256("hook", raw, signature)).toBe(true);
    expect(verifyHmacSha256("hook", `${raw} `, signature)).toBe(false);
  });

  it("redacts secret-looking keys", () => {
    expect(redact({ accessToken: "abc", title: "Keep" })).toEqual({ accessToken: "[redacted]", title: "Keep" });
  });

  it("blocks private hosts and allows the provider allowlist", async () => {
    expect(isPrivateAddress("10.1.2.3")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    await expect(assertSafeOutboundUrl("http://api.github.com/user")).rejects.toThrow(/https/);
    await expect(assertSafeOutboundUrl("https://evil.example/hook", async () => ["10.0.0.8"])).rejects.toThrow(
      /blocked address/,
    );
    await expect(assertSafeOutboundUrl("https://127.0.0.1/")).rejects.toThrow(/not allowed/);
    const url = await assertSafeOutboundUrl("https://api.github.com/user");
    expect(url.hostname).toBe("api.github.com");
    const gitlab = await assertSafeOutboundUrl("https://gitlab.com/api/v4/user");
    expect(gitlab.hostname).toBe("gitlab.com");
    const giteaSaaS = await assertSafeOutboundUrl("https://gitea.com/api/v1/user");
    expect(giteaSaaS.hostname).toBe("gitea.com");
    await expect(
      assertSafeOutboundUrl("https://acme.atlassian.net/rest", async () => ["10.0.0.8"]),
    ).rejects.toThrow(/blocked address/);
    const site = await assertSafeOutboundUrl("https://acme.atlassian.net/rest", async () => ["8.8.4.4"]);
    expect(site.hostname).toBe("acme.atlassian.net");
    const selfHosted = await assertSafeOutboundUrl("https://git.example.com/api/v1/user", async () => ["8.8.4.4"]);
    expect(selfHosted.hostname).toBe("git.example.com");
  });
});

describe("provider adapters", () => {
  const ctx = {
    tx: {} as never,
    integrationId: "00000000-0000-4000-8000-000000000001",
    credentials: { accessToken: "token", webhookSecret: "hook", cloudId: "cloud", siteUrl: "https://acme.atlassian.net" },
    mappings: githubAdapter.defaultMappings(),
  };

  it("paginates GitHub repositories and normalizes rate limits", async () => {
    setProviderFetch(async (url) => {
      if (url.endsWith("/user")) return json({ id: 7, login: "ada" });
      if (url.includes("/user/repos")) {
        return json([{ full_name: "ada/board", name: "board", html_url: "https://github.com/ada/board" }], 200, {
          link: '<https://api.github.com/user/repos?page=2>; rel="next"',
        });
      }
      return json({}, 404);
    });
    const account = await githubAdapter.validateConnection(ctx);
    expect(account.externalAccountId).toBe("7");
    const page = await githubAdapter.listProjects(ctx, null);
    expect(page.items[0]?.providerId).toBe("ada/board");
    expect(page.nextCursor).toBe("2");
    setProviderFetch(async () => json({ message: "slow" }, 429, { "retry-after": "3" }));
    await expect(githubAdapter.listTasks(ctx, { providerProjectId: "ada/board", cursor: null })).rejects.toMatchObject({
      code: "rate_limited",
      retryable: true,
    } satisfies Partial<ProviderError>);
    expect(githubAdapter.getCapabilities().fields.dueDate).toBe(false);
  });

  it("parses GitHub issue and pull request webhooks", async () => {
    setProviderFetch(async (url) => {
      if (url.includes("graphql")) {
        return json({
          data: {
            repository: { projectsV2: { nodes: [] }, issue: null },
            node: null,
          },
        });
      }
      return json({}, 404);
    });
    const raw = JSON.stringify({
      action: "opened",
      repository: { full_name: "ada/board" },
      issue: {
        id: 1,
        number: 4,
        title: "Fix gate",
        body: "details",
        state: "open",
        html_url: "https://github.com/ada/board/issues/4",
        updated_at: "2026-10-15T00:00:00Z",
        labels: [{ name: "priority:high" }],
      },
    });
    const signature = signHmacSha256("hook", raw).toString("hex");
    const request = { rawBody: raw, headers: { "x-hub-signature-256": `sha256=${signature}`, "x-github-event": "issues" } };
    expect(await githubAdapter.verifyWebhook(ctx, request)).toBe(true);
    const parsed = await githubAdapter.parseWebhook({ ...ctx, mappings: githubAdapter.defaultMappings() }, request);
    expect(parsed.events[0]?.kind).toBe("task.upsert");
    const pr = await githubAdapter.parseWebhook(
      { ...ctx, mappings: githubAdapter.defaultMappings() },
      {
        rawBody: JSON.stringify({
          action: "opened",
          repository: { full_name: "ada/board" },
          pull_request: { id: 9, number: 3, title: "PR", html_url: "https://github.com/ada/board/pull/3", state: "open" },
        }),
        headers: { "x-github-event": "pull_request" },
      },
    );
    expect(pr.events[0]?.kind).toBe("record.upsert");
  });

  it("parses GitHub Projects v2 item webhooks into task upserts", async () => {
    setProviderFetch(async (url, init) => {
      if (!url.includes("graphql")) return json({}, 404);
      const body = JSON.parse(String(init?.body)) as { query: string; variables?: Record<string, string> };
      if (body.query.includes("... on Issue")) {
        return json({
          data: {
            node: {
              id: "I_issue",
              number: 4,
              title: "Fix gate",
              body: "details",
              state: "OPEN",
              url: "https://github.com/ada/board/issues/4",
              updatedAt: "2026-10-15T00:00:00Z",
              repository: { nameWithOwner: "ada/board" },
              labels: { nodes: [{ name: "priority:high" }] },
              assignees: { nodes: [] },
            },
          },
        });
      }
      if (body.query.includes("projectItems")) {
        return json({
          data: {
            repository: {
              issue: {
                id: "I_issue",
                projectItems: {
                  nodes: [
                    {
                      id: "PVTI_1",
                      project: { id: "PVT_board", title: "Delivery" },
                      fieldValues: {
                        nodes: [
                          {
                            name: "In Progress",
                            field: { id: "PVTSSF_status", name: "Status" },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        });
      }
      if (body.query.includes('field(name: "Status")')) {
        return json({
          data: {
            node: {
              field: {
                id: "PVTSSF_status",
                options: [
                  { id: "opt_todo", name: "Todo" },
                  { id: "opt_wip", name: "In Progress" },
                  { id: "opt_done", name: "Done" },
                ],
              },
            },
          },
        });
      }
      return json({ data: { repository: { projectsV2: { nodes: [{ id: "PVT_board", title: "Delivery", number: 1 }] } } } });
    });
    const parsed = await githubAdapter.parseWebhook(
      { ...ctx, mappings: { ...githubAdapter.defaultMappings(), githubProjectNodeId: "PVT_board" } },
      {
        rawBody: JSON.stringify({
          action: "edited",
          projects_v2_item: {
            node_id: "PVTI_1",
            content_node_id: "I_issue",
            content_type: "Issue",
            project_node_id: "PVT_board",
          },
        }),
        headers: { "x-github-event": "projects_v2_item" },
      },
    );
    expect(parsed.events[0]).toMatchObject({
      kind: "task.upsert",
      task: { providerId: "4", status: "in_progress", providerProjectId: "ada/board" },
    });
  });

  it("pages Linear teams and Jira projects", async () => {
    setProviderFetch(async (url, init) => {
      if (url.includes("graphql")) {
        const body = JSON.parse(String(init?.body)) as { query: string };
        if (body.query.includes("viewer")) return json({ data: { viewer: { id: "u1", name: "Ada" } } });
        return json({
          data: {
            teams: {
              nodes: [{ id: "team-1", name: "Product", key: "PRO" }],
              pageInfo: { hasNextPage: true, endCursor: "cursor-2" },
            },
          },
        });
      }
      if (url.includes("accessible-resources")) return json([{ id: "cloud", name: "Acme", url: "https://acme.atlassian.net" }]);
      if (url.includes("/project/search")) {
        return json({ values: [{ id: "100", key: "APP", name: "App" }], isLast: false, startAt: 0, maxResults: 50 });
      }
      return json({}, 500);
    });
    expect((await linearAdapter.validateConnection({ ...ctx, mappings: linearAdapter.defaultMappings() })).accountLabel).toBe("Ada");
    const teams = await linearAdapter.listProjects({ ...ctx, mappings: linearAdapter.defaultMappings() }, null);
    expect(teams.nextCursor).toBe("cursor-2");
    const projects = await jiraAdapter.listProjects({ ...ctx, mappings: jiraAdapter.defaultMappings() }, null);
    expect(projects.items[0]?.key).toBe("APP");
    expect(projects.nextCursor).toBe("50");
    let authorization = "";
    setProviderFetch(async (_url, init) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return json({ data: { viewer: { id: "u1", name: "Ada" } } });
    });
    await linearAdapter.validateConnection({
      ...ctx,
      credentials: { ...ctx.credentials, accessToken: "Bearer lin_api_example" },
      mappings: linearAdapter.defaultMappings(),
    });
    expect(authorization).toBe("lin_api_example");
    await linearAdapter.validateConnection({
      ...ctx,
      credentials: { ...ctx.credentials, accessToken: "oauth-access-token" },
      mappings: linearAdapter.defaultMappings(),
    });
    expect(authorization).toBe("Bearer oauth-access-token");
    setProviderFetch(async () => json({ errors: [{ message: "Linear rejected the key" }] }, 400));
    await expect(
      linearAdapter.validateConnection({ ...ctx, mappings: linearAdapter.defaultMappings() }),
    ).rejects.toThrow("Linear rejected the key");
    setProviderFetch(async () => json({}, 401));
    await expect(jiraAdapter.validateConnection({ ...ctx, mappings: jiraAdapter.defaultMappings() })).rejects.toBeInstanceOf(ProviderError);
    setProviderFetch(null);
  });

  it("lists Gitea repositories and verifies webhooks", async () => {
    const giteaCtx = {
      ...ctx,
      credentials: { accessToken: "token", webhookSecret: "hook", siteUrl: "https://git.example.com" },
      mappings: giteaAdapter.defaultMappings(),
    };
    setDnsResolver(async () => ["8.8.4.4"]);
    setProviderFetch(async (url) => {
      if (url.endsWith("/api/v1/user")) return json({ id: 3, login: "ada" });
      if (url.includes("/api/v1/user/repos")) {
        return json([{ full_name: "ada/board", name: "board", html_url: "https://git.example.com/ada/board" }], 200, {
          link: '<https://git.example.com/api/v1/user/repos?page=2>; rel="next"',
        });
      }
      return json({}, 404);
    });
    const account = await giteaAdapter.validateConnection(giteaCtx);
    expect(account.accountLabel).toBe("ada");
    const page = await giteaAdapter.listProjects(giteaCtx, null);
    expect(page.items[0]?.providerId).toBe("ada/board");
    expect(page.nextCursor).toBe("2");

    const raw = JSON.stringify({
      action: "opened",
      repository: { full_name: "ada/board" },
      issue: {
        id: 1,
        number: 4,
        title: "Fix gate",
        body: "details",
        state: "open",
        html_url: "https://git.example.com/ada/board/issues/4",
        updated_at: "2026-10-15T00:00:00Z",
        labels: [{ id: 1, name: "priority:high" }],
      },
    });
    const signature = signHmacSha256("hook", raw).toString("hex");
    const request = {
      rawBody: raw,
      headers: { "x-gitea-signature": signature, "x-gitea-event": "issues" },
    };
    expect(await giteaAdapter.verifyWebhook(giteaCtx, request)).toBe(true);
    const parsed = await giteaAdapter.parseWebhook(giteaCtx, request);
    expect(parsed.events[0]?.kind).toBe("task.upsert");
    setProviderFetch(null);
    setDnsResolver(undefined);
  });
});
