import { describe, expect, it } from "vitest";
import {
  canForceRefreshCredentials,
  credentialNeedsRefresh,
} from "@/server/integrations/token-refresh";

describe("credentialNeedsRefresh", () => {
  it("is false without a refresh token", () => {
    expect(
      credentialNeedsRefresh({
        accessToken: "a",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    ).toBe(false);
  });

  it("is false when the access token is still fresh", () => {
    expect(
      credentialNeedsRefresh({
        accessToken: "a",
        refreshToken: "r",
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      }),
    ).toBe(false);
  });

  it("is true when the access token is expired or nearly expired", () => {
    expect(
      credentialNeedsRefresh({
        accessToken: "a",
        refreshToken: "r",
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
      }),
    ).toBe(true);
    expect(
      credentialNeedsRefresh({
        accessToken: "a",
        refreshToken: "r",
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      }),
    ).toBe(true);
  });

  it("is true for GitHub App tokens that are expired or nearly expired", () => {
    expect(
      credentialNeedsRefresh({
        accessToken: "a",
        githubInstallationId: "123",
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
      }),
    ).toBe(true);
  });
});

describe("canForceRefreshCredentials", () => {
  it("is true for GitHub App installations", () => {
    expect(
      canForceRefreshCredentials({
        accessToken: "a",
        githubInstallationId: "123",
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      }),
    ).toBe(true);
  });

  it("is true when a refresh token is present", () => {
    expect(
      canForceRefreshCredentials({
        accessToken: "a",
        refreshToken: "r",
      }),
    ).toBe(true);
  });

  it("is false for static tokens", () => {
    expect(canForceRefreshCredentials({ accessToken: "a" })).toBe(false);
  });
});
