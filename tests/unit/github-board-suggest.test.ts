import { describe, expect, it } from "vitest";
import { suggestGithubBoard } from "@/server/integrations/github-projects";

const board = (id: string, title: string) => ({
  id,
  title,
  number: 1,
  url: `https://github.com/orgs/acme/projects/${id}`,
});

describe("suggestGithubBoard", () => {
  it("returns the only board", () => {
    const only = board("1", "Backlog");
    expect(suggestGithubBoard([only], "acme/emblem-ergani-scanner")).toEqual(only);
  });

  it("matches a unique repo-name token in the board title", () => {
    const match = board("12", "Backlog · Ergani Employee App");
    const other = board("3", "Platform roadmap");
    expect(
      suggestGithubBoard([match, other], "semantic-software/emblem-ergani-scanner"),
    ).toEqual(match);
  });

  it("returns null when multiple boards match the same token", () => {
    expect(
      suggestGithubBoard(
        [board("1", "Ergani backlog"), board("2", "Ergani ops")],
        "acme/emblem-ergani-scanner",
      ),
    ).toBeNull();
  });

  it("returns null when nothing matches among many boards", () => {
    expect(
      suggestGithubBoard(
        [board("1", "Platform"), board("2", "Growth")],
        "acme/emblem-ergani-scanner",
      ),
    ).toBeNull();
  });
});
