import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  mintInstallationToken,
  refreshGithubAppCredential,
  resolveGithubAppConfig,
  signGithubAppJwt,
  type GithubAppConfig,
} from "@/server/integrations/github-app";
import { setProviderFetch } from "@/server/integrations/http";
import { credentialNeedsRefresh } from "@/server/integrations/token-refresh";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GitHub App auth helpers", () => {
  afterEach(() => {
    setProviderFetch(null);
    delete process.env.GITHUB_APP_CLIENT_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_APP_SLUG;
    delete process.env.GITHUB_APP_WEBHOOK_SECRET;
  });

  it("treats installation credentials as needing refresh near expiry", () => {
    expect(
      credentialNeedsRefresh({
        accessToken: "ghs",
        githubInstallationId: "42",
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
      }),
    ).toBe(true);
    expect(
      credentialNeedsRefresh({
        accessToken: "ghs",
        githubInstallationId: "42",
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      }),
    ).toBe(false);
    expect(credentialNeedsRefresh({ accessToken: "pat" })).toBe(false);
  });

  it("resolves app config from env and mints installation tokens", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const config: GithubAppConfig = {
      clientId: "Iv23test",
      privateKeyPem: pem,
      slug: "atrium",
      webhookSecret: "hook",
    };
    process.env.GITHUB_APP_CLIENT_ID = config.clientId;
    process.env.GITHUB_APP_PRIVATE_KEY = config.privateKeyPem;
    process.env.GITHUB_APP_SLUG = config.slug;
    process.env.GITHUB_APP_WEBHOOK_SECRET = "hook";

    expect(resolveGithubAppConfig()?.slug).toBe("atrium");
    const jwt = await signGithubAppJwt(config);
    expect(jwt.split(".")).toHaveLength(3);

    setProviderFetch(async (url) => {
      expect(url).toContain("/app/installations/99/access_tokens");
      return json({
        token: "ghs_fresh",
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      });
    });
    const minted = await mintInstallationToken("99", config);
    expect(minted.accessToken).toBe("ghs_fresh");

    const refreshed = await refreshGithubAppCredential(
      {
        accessToken: "ghs_old",
        githubInstallationId: "99",
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      },
      config,
    );
    expect(refreshed.accessToken).toBe("ghs_fresh");
    expect(refreshed.githubInstallationId).toBe("99");
  });
});
