import Link from "next/link";
import { Columns3, FolderGit2 } from "lucide-react";
import { ProjectDeleteDialog } from "@/components/project-delete-dialog";
import { ProjectNicknameDialog } from "@/components/project-nickname-dialog";
import {
  OpenInProviderButton,
  ProviderIcon,
  providerAccents,
  providerKey,
  providerLabel,
} from "@/components/provider-icon";
import { Badge } from "@/components/ui/badge";
import { projectCodebaseLabel, projectDisplayName } from "@/lib/project-display";
import { cn } from "@/lib/utils";

type ProjectCardProject = {
  id: string;
  name: string;
  nickname: string | null;
  description: string | null;
  ownership_mode: "native" | "external" | "hybrid";
  provider: string | null;
  provider_project_name: string | null;
  provider_project_url: string | null;
  provider_project_id?: string | null;
  github_project_node_id?: string | null;
  github_project_title?: string | null;
};

export function ProjectCard({
  workspaceId,
  project,
  canWrite,
}: {
  workspaceId: string;
  project: ProjectCardProject;
  canWrite: boolean;
}) {
  const title = projectDisplayName(project);
  const codebase = projectCodebaseLabel(project);
  const showOriginal =
    Boolean(project.nickname?.trim())
    && project.nickname?.trim() !== project.name
    && project.name !== codebase;
  const key = providerKey(project.provider);
  const accent = providerAccents[key] ?? providerAccents.native!;
  const isGithub = project.provider === "github";
  const boardTitle = project.github_project_title?.trim() || null;
  const hasBoard = Boolean(project.github_project_node_id?.trim() || boardTitle);
  const showSplitMeta = Boolean(project.provider && codebase);

  return (
    <li
      className={cn(
        "project-tile group relative flex min-h-[12rem] overflow-hidden rounded-xl border bg-card",
        "transition duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-[0_12px_28px_-18px_rgba(0,0,0,0.55)]",
      )}
    >
      <Link
        href={`/projects/${project.id}`}
        className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open ${title} dashboard`}
      />

      <div className={cn("pointer-events-none w-1.5 shrink-0", accent.bar)} aria-hidden="true" />

      {/* pointer-events-none so the stretched Link below receives clicks; re-enable on controls. */}
      <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col">
        <div className={cn("flex min-h-[7.25rem] items-start justify-between gap-3 px-4 pb-3 pt-4", accent.wash)}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-muted">Project</p>
              <Badge tone={project.ownership_mode === "native" ? "native" : "external"}>
                {project.ownership_mode}
              </Badge>
            </div>
            <p className="serif mt-2 text-2xl leading-tight">{title}</p>
            {showOriginal ? <p className="mt-1 truncate text-xs text-muted">{project.name}</p> : null}
          </div>
          <div className="flex shrink-0 items-start gap-1">
            {canWrite ? (
              <span className="pointer-events-auto relative z-10 flex items-start gap-0.5">
                <ProjectNicknameDialog workspaceId={workspaceId} project={project} />
                <ProjectDeleteDialog
                  workspaceId={workspaceId}
                  projectId={project.id}
                  projectName={title}
                  ownershipMode={project.ownership_mode}
                />
              </span>
            ) : null}
            <ProviderIcon provider={project.provider} size="md" />
          </div>
        </div>

        <div className="flex flex-1 flex-col px-4 py-3">
          <p className="line-clamp-2 text-sm text-muted">
            {project.description || "No description yet."}
          </p>

          {showSplitMeta ? (
            <div className="mt-auto space-y-2 border-t pt-3">
              {isGithub ? (
                <div className="flex min-w-0 items-start gap-2">
                  <span
                    className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
                      accent.wash,
                      accent.ink,
                    )}
                  >
                    <Columns3 className="size-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-muted">
                      Project board
                    </p>
                    <p className={cn("truncate text-xs font-medium", accent.ink)}>
                      {boardTitle
                        || (hasBoard ? "Linked board" : "No board linked")}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  <span
                    className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
                      accent.wash,
                      accent.ink,
                    )}
                  >
                    {isGithub ? (
                      <FolderGit2 className="size-3.5" aria-hidden="true" />
                    ) : (
                      <ProviderIcon provider={project.provider} size="sm" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-muted">
                      {isGithub ? "Codebase" : providerLabel(project.provider)}
                    </p>
                    <p className={cn("truncate text-xs font-medium", accent.ink)}>{codebase}</p>
                  </div>
                </div>
                {project.provider_project_url ? (
                  <span className="pointer-events-auto relative z-10 shrink-0">
                    <OpenInProviderButton
                      provider={project.provider}
                      href={project.provider_project_url}
                      label={isGithub ? "Open repository" : undefined}
                    />
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
              <p className={cn("min-w-0 truncate text-xs font-medium", accent.ink)}>
                Native in Atrium
              </p>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
