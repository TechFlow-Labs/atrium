export function projectDisplayName(project: {
  name: string;
  nickname?: string | null;
  provider?: string | null;
  provider_project_id?: string | null;
  provider_project_name?: string | null;
  github_project_title?: string | null;
}): string {
  const nickname = project.nickname?.trim();
  if (nickname) return nickname;

  const boardTitle = project.github_project_title?.trim();
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
