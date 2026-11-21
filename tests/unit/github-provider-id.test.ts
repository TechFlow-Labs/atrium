import { describe, expect, it } from "vitest";
import {
  githubIssueNumber,
  githubIssueProviderId,
  githubRepoFromIssueUrl,
} from "@/server/integrations/github";

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

describe("githubIssueNumber", () => {
  it("extracts the issue number from a namespaced id", () => {
    expect(githubIssueNumber("semantic-software/emblem-ergani-scanner#23")).toBe("23");
    expect(githubIssueNumber("23")).toBe("23");
  });
});

describe("githubRepoFromIssueUrl", () => {
  it("parses owner/repo from an issue URL", () => {
    expect(
      githubRepoFromIssueUrl("https://github.com/semantic-software/ergani-employer-scanner/issues/23"),
    ).toBe("semantic-software/ergani-employer-scanner");
    expect(githubRepoFromIssueUrl(null)).toBeNull();
  });
});
