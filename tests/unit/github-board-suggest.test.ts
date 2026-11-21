import { describe, expect, it } from "vitest";
import { resolveGithubProjectNodeId, suggestGithubBoard } from "@/server/integrations/github-projects";
import { GITHUB_BOARD_NONE } from "@/server/integrations/types";

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

describe("resolveGithubProjectNodeId", () => {
  it("returns null when the board is explicitly disabled", async () => {
    await expect(
      resolveGithubProjectNodeId("token", "acme/repo", { githubProjectNodeId: GITHUB_BOARD_NONE }),
    ).resolves.toBeNull();
  });

  it("returns a configured board id without calling GitHub", async () => {
    await expect(
      resolveGithubProjectNodeId("token", "acme/repo", { githubProjectNodeId: "PVT_abc" }),
    ).resolves.toBe("PVT_abc");
  });
});
