"use client";

import { useRef, useState } from "react";
import { Archive, CircleDot, Layers } from "lucide-react";
import { loadProjectsPanelAction, type ActionState } from "@/app/actions";
import { ProjectsBoard } from "@/components/projects-board";
import { SoftSegmentedNav } from "@/components/soft-segmented-nav";
import { softReplaceUrl } from "@/lib/soft-nav";
import type { ProjectsLayout } from "@/lib/projects-layout";
import type { ProjectFormIntegration, ProjectFormProduct } from "@/components/project-form";
import type { ProjectsPanelPayload } from "@/server/projects/panel";
import { cn } from "@/lib/utils";

type Status = "active" | "archived" | "all";

export function ProjectsPageClient({
  workspaceId,
  workspaceName,
  canWrite,
  createAction,
  integrations,
  products,
  initialLayout,
  initial,
}: {
  workspaceId: string;
  workspaceName: string;
  canWrite: boolean;
  createAction: (state: ActionState, formData: FormData) => Promise<ActionState>;
  integrations: ProjectFormIntegration[];
  products: ProjectFormProduct[];
  initialLayout: ProjectsLayout;
  initial: ProjectsPanelPayload;
}) {
  const [status, setStatus] = useState<Status>(initial.status);
  const [panel, setPanel] = useState(initial);
  const [pending, setPending] = useState(false);
  const requestId = useRef(0);

  function changeStatus(next: Status) {
    if (next === status) return;
    setStatus(next);
    softReplaceUrl(next === "active" ? "/projects" : `/projects?status=${next}`);
    const id = ++requestId.current;
    setPending(true);
    void loadProjectsPanelAction(workspaceId, { status: next }).then((result) => {
      if (id !== requestId.current) return;
      setPending(false);
      if ("error" in result) return;
      setPanel(result);
    });
  }

  return (
    <div className={cn(pending && "[&_[data-projects-body]]:opacity-70")}>
      <ProjectsBoard
        initialLayout={initialLayout}
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        scopeLabel={panel.scopeLabel}
        canWrite={canWrite}
        createAction={createAction}
        integrations={integrations}
        products={products}
        statusNav={
          <SoftSegmentedNav
            aria-label="Project status"
            data-tour="project-status"
            value={status}
            onChange={changeStatus}
            options={[
              { value: "active", label: "Active", icon: CircleDot },
              { value: "archived", label: "Archived", icon: Archive },
              { value: "all", label: "All", icon: Layers },
            ]}
          />
        }
        portfolio={panel.analytics.portfolio}
        taskStats={panel.analytics.tasks}
        busiest={panel.analytics.busiest}
        projects={panel.projects}
      />
    </div>
  );
}
