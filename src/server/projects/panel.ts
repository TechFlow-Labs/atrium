import { listGithubProjectsForConnection } from "@/server/integrations/service";
import { suggestGithubBoard } from "@/server/integrations/github-projects";
import { getProjectsAnalytics, listProjects, type ProjectRecord, type ProjectsAnalytics } from "./service";

export type ProjectsPanelFilter = {
  status?: "active" | "archived" | "all";
  query?: string;
};

export type ProjectsPanelPayload = {
  status: "active" | "archived" | "all";
  scopeLabel: string;
  projects: ProjectRecord[];
  analytics: ProjectsAnalytics;
};

export async function enrichGithubBoardTitles(
  userId: string,
  workspaceId: string,
  projects: ProjectRecord[],
): Promise<ProjectRecord[]> {
  const needsEnrichment = projects.filter(
    (project) =>
      project.provider === "github"
      && project.provider_project_id
      && !project.github_project_title?.trim(),
  );
  if (needsEnrichment.length === 0) return projects;

  const titles = new Map<string, string>();
  await Promise.all(
    needsEnrichment.map(async (project) => {
      try {
        const boards = await listGithubProjectsForConnection(userId, workspaceId, project.id);
        if (project.github_project_node_id) {
          const match = boards.find((board) => board.id === project.github_project_node_id);
          if (match?.title) titles.set(project.id, match.title);
          return;
        }
        const suggested = suggestGithubBoard(boards, project.provider_project_id!);
        if (suggested?.title) titles.set(project.id, suggested.title);
      } catch {
        // Keep the tile empty when GitHub is unavailable.
      }
    }),
  );

  if (titles.size === 0) return projects;
  return projects.map((project) => {
    const title = titles.get(project.id);
    return title ? { ...project, github_project_title: title } : project;
  });
}

export async function loadProjectsPanel(
  userId: string,
  workspaceId: string,
  filter: ProjectsPanelFilter = {},
  nowMs: number = Date.now(),
): Promise<ProjectsPanelPayload> {
  const status = filter.status ?? "active";
  const [projects, analytics] = await Promise.all([
    listProjects(userId, workspaceId, { status, query: filter.query }),
    getProjectsAnalytics(userId, workspaceId, { status }, nowMs),
  ]);
  const enriched = await enrichGithubBoardTitles(userId, workspaceId, projects);
  return {
    status,
    scopeLabel:
      status === "archived" ? "archived projects" : status === "all" ? "all projects" : "active projects",
    projects: enriched,
    analytics,
  };
}
