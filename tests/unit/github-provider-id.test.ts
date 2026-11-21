import { describe, expect, it } from "vitest";
import { githubIssueProviderId } from "@/server/integrations/github";

describe("githubIssueProviderId", () => {
  it("namespaces issue numbers by repository", () => {
    expect(githubIssueProviderId("semantic-software/emblem-ergani-scanner", 18)).toBe(
      "semantic-software/emblem-ergani-scanner#18",
    );
    expect(githubIssueProviderId("semantic-software/ergani-employer-scanner", 18)).toBe(
      "semantic-software/ergani-employer-scanner#18",
    );
  });
});
