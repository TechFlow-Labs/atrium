import { describe, expect, it } from "vitest";
import { OAUTH_PROVIDERS } from "@/lib/oauth-providers";
import { fillCallback, INTEGRATION_GUIDES } from "@/lib/integration-guides";

describe("integration guides", () => {
  it("has a guide for every OAuth provider and every token provider in the UI", () => {
    for (const provider of [...OAUTH_PROVIDERS, "obsidian"]) {
      expect(INTEGRATION_GUIDES[provider], provider).toBeDefined();
    }
  });

  it("tells OAuth providers where to paste the callback URL", () => {
    for (const provider of OAUTH_PROVIDERS) {
      const guide = INTEGRATION_GUIDES[provider];
      expect(guide.steps.some((step) => step.includes("{callbackUrl}")), provider).toBe(true);
    }
  });

  it("fills the callback placeholder everywhere it appears", () => {
    expect(fillCallback("Redirect URI: {callbackUrl}", "https://a.example/cb")).toBe("Redirect URI: https://a.example/cb");
  });
});
