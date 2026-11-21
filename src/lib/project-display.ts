export function projectDisplayName(project: {
  name: string;
  nickname?: string | null;
  provider?: string | null;
  provider_project_id?: string | null;
  provider_project_name?: string | null;
  github_project_title?: string | null;
  github_board_disabled?: boolean;
}): string {
  const nickname = project.nickname?.trim();
  if (nickname) return nickname;

  const boardTitle = project.github_board_disabled
    ? null
    : project.github_project_title?.trim() || null;
  if (boardTitle) return boardTitle;

  const repo =
    project.provider_project_id?.trim()
    || project.provider_project_name?.trim()
    || "";
  if (project.provider === "github" && repo && project.name.trim() === repo) {
    const shortName = repo.split("/").pop()?.trim();
    if (shortName) return shortName;
  }

  return project.name;
}

export function projectCodebaseLabel(project: {
  provider?: string | null;
  provider_project_id?: string | null;
  provider_project_name?: string | null;
}): string | null {
  const repo =
    project.provider_project_id?.trim()
    || project.provider_project_name?.trim()
    || "";
  return repo || null;
}

/**
 * Primary label for Issues UI (board / nickname / short name) plus a distinct
 * codebase chip when the issue sits on both a GitHub Project and a repo.
 */
export function projectIssueLabels(project: {
  name: string;
  nickname?: string | null;
  provider?: string | null;
  provider_project_id?: string | null;
  provider_project_name?: string | null;
  github_project_title?: string | null;
  github_board_disabled?: boolean;
}): { primary: string; codebase: string | null } {
  const primary = projectDisplayName(project);
  const codebase = projectCodebaseLabel(project);
  if (!codebase) return { primary, codebase: null };

  const nickname = project.nickname?.trim() || null;
  const boardTitle = project.github_board_disabled
    ? null
    : project.github_project_title?.trim() || null;
  const hasBoardOrNickname = Boolean(nickname || boardTitle);
  if (!hasBoardOrNickname) return { primary, codebase: null };

  const sameAsPrimary = codebase.toLowerCase() === primary.toLowerCase()
    || codebase.split("/").pop()?.toLowerCase() === primary.toLowerCase();
  if (sameAsPrimary) return { primary, codebase: null };
  return { primary, codebase };
}
