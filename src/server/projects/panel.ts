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

type BoardEnrichment = {
  title?: string;
  url?: string;
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
      && !project.github_board_disabled
      && (!project.github_project_title?.trim() || !project.github_project_url?.trim()),
  );
  if (needsEnrichment.length === 0) return projects;

  const enriched = new Map<string, BoardEnrichment>();
  await Promise.all(
    needsEnrichment.map(async (project) => {
      try {
        const boards = await listGithubProjectsForConnection(userId, workspaceId, project.id);
        if (project.github_project_node_id) {
          const match = boards.find((board) => board.id === project.github_project_node_id);
          if (match) {
            enriched.set(project.id, {
              title: match.title || undefined,
              url: match.url || undefined,
            });
          }
          return;
        }
        const suggested = suggestGithubBoard(boards, project.provider_project_id!);
        if (suggested) {
          enriched.set(project.id, {
            title: suggested.title || undefined,
            url: suggested.url || undefined,
          });
        }
      } catch {
        // Keep the tile empty when GitHub is unavailable.
      }
    }),
  );

  if (enriched.size === 0) return projects;
  return projects.map((project) => {
    const next = enriched.get(project.id);
    if (!next) return project;
    return {
      ...project,
      github_project_title: project.github_project_title?.trim() || next.title || null,
      github_project_url: project.github_project_url?.trim() || next.url || null,
    };
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
  const enrichedProjects = await enrichGithubBoardTitles(userId, workspaceId, projects);
  return {
    status,
    scopeLabel:
      status === "archived" ? "archived projects" : status === "all" ? "all projects" : "active projects",
    projects: enrichedProjects,
    analytics,
  };
}
