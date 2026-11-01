import { describe, expect, it } from "vitest";
import { credentialNeedsRefresh } from "@/server/integrations/token-refresh";

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
});
