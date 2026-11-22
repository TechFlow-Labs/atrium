"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { GroupRelatedTasksToggle } from "@/components/group-related-tasks-toggle";
import { TasksFilterProvider } from "@/components/tasks-filter-context";
import { TaskBulkActions } from "@/components/task-bulk-actions";
import { TaskFilters, TaskViewToggle } from "@/components/task-filters";
import {
  buildTasksHref,
  filterValuesFromSearchParams,
  type FilterValues,
} from "@/lib/task-filters";

type ProjectOption = { id: string; name: string; productId?: string };
type ProductOption = { id: string; name: string };
type AssigneeOption = { value: string; label: string };

function valuesFromHref(href: string): FilterValues {
  const url = new URL(href, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  return filterValuesFromSearchParams(url.searchParams);
}

export function TasksFilterFrame({
  workspaceId,
  projects,
  products = [],
  assignees = [],
  heading,
  actions,
  canWrite = false,
  groupRelatedTasks = true,
  initialValues,
  children,
}: {
  workspaceId: string;
  projects: ProjectOption[];
  products?: ProductOption[];
  assignees?: AssigneeOption[];
  heading: ReactNode;
  actions?: ReactNode;
  canWrite?: boolean;
  groupRelatedTasks?: boolean;
  initialValues: FilterValues;
  children: ReactNode;
}) {
  const [values, setValues] = useState<FilterValues>(initialValues);

  const syncUrl = useCallback((next: FilterValues) => {
    const href = buildTasksHref(next);
    window.history.replaceState(window.history.state, "", href);
  }, []);

  function onNavigate(href: string) {
    const next = valuesFromHref(href);
    setValues(next);
    syncUrl(next);
  }

  useEffect(() => {
    function onPopState() {
      setValues(filterValuesFromSearchParams(new URLSearchParams(window.location.search)));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3" data-reveal="">
        <div className="min-w-0 max-w-2xl">{heading}</div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 pt-1">
          <div className="flex items-center" data-tour="task-view">
            <TaskViewToggle values={values} onNavigate={onNavigate} />
          </div>
          <div className="flex items-center" data-tour="task-related-group">
            <GroupRelatedTasksToggle enabled={groupRelatedTasks} />
          </div>
          <div className="flex items-center" data-tour="new-task">
            {actions}
          </div>
        </div>
      </div>
      <div className="shrink-0 space-y-3">
        <div data-reveal="" data-tour="task-filters">
          <TaskFilters
            projects={projects}
            products={products}
            assignees={assignees}
            values={values}
            onNavigate={onNavigate}
          />
        </div>
        {canWrite && values.view !== "board" ? (
          <div data-tour="task-bulk">
            <TaskBulkActions workspaceId={workspaceId} />
          </div>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col" data-reveal="" data-tour="task-list">
        <TasksFilterProvider values={values}>{children}</TasksFilterProvider>
      </div>
    </div>
  );
}
