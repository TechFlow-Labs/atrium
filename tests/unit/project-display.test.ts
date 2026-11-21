import { describe, expect, it } from "vitest";
import { projectDisplayName, projectIssueLabels } from "@/lib/project-display";

describe("projectIssueLabels", () => {
  it("shows board title as primary and repo as codebase when both exist", () => {
    expect(
      projectIssueLabels({
        name: "semantic-software/emblem-ergani-scanner",
        provider: "github",
        provider_project_id: "semantic-software/emblem-ergani-scanner",
        github_project_title: "Ergani Employee App",
      }),
    ).toEqual({
      primary: "Ergani Employee App",
      codebase: "semantic-software/emblem-ergani-scanner",
    });
  });

  it("shows nickname as primary and repo as codebase", () => {
    expect(
      projectIssueLabels({
        name: "semantic-software/ergani-employer-scanner",
        nickname: "Ergani Employer App",
        provider: "github",
        provider_project_id: "semantic-software/ergani-employer-scanner",
        github_project_title: "Backlog",
      }),
    ).toEqual({
      primary: "Ergani Employer App",
      codebase: "semantic-software/ergani-employer-scanner",
    });
  });

  it("omits codebase when there is no board or nickname", () => {
    expect(
      projectIssueLabels({
        name: "semantic-software/emblem-ergani-scanner",
        provider: "github",
        provider_project_id: "semantic-software/emblem-ergani-scanner",
      }),
    ).toEqual({
      primary: projectDisplayName({
        name: "semantic-software/emblem-ergani-scanner",
        provider: "github",
        provider_project_id: "semantic-software/emblem-ergani-scanner",
      }),
      codebase: null,
    });
  });

  it("omits codebase when the board is explicitly disabled", () => {
    expect(
      projectIssueLabels({
        name: "semantic-software/emblem-ergani-scanner",
        provider: "github",
        provider_project_id: "semantic-software/emblem-ergani-scanner",
        github_project_title: "Ergani Employee App",
        github_board_disabled: true,
      }),
    ).toEqual({
      primary: "emblem-ergani-scanner",
      codebase: null,
    });
  });
});
