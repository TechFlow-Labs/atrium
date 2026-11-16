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
  return {
    status,
    scopeLabel:
      status === "archived" ? "archived projects" : status === "all" ? "all projects" : "active projects",
    projects,
    analytics,
  };
}
