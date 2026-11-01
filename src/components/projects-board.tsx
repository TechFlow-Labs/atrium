"use client";

import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  CircleDot,
  Cloud,
  Eye,
  EyeOff,
  FolderKanban,
  GripVertical,
  House,
  LayoutDashboard,
  RotateCcw,
  Siren,
  type LucideIcon,
} from "lucide-react";
import { projectsLayoutAction, type ActionState } from "@/app/actions";
import { ProjectCard } from "@/components/project-card";
import {
  ProjectStatCard,
  ProjectStatusBreakdown,
  type ProjectDashboardStats,
} from "@/components/project-dashboard";
import { ProjectForm, type ProjectFormIntegration } from "@/components/project-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { projectDisplayName } from "@/lib/project-display";
import {
  DEFAULT_PROJECTS_LAYOUT,
  moveLayoutItem,
  PROJECT_INSIGHT_LABELS,
  PROJECT_SECTION_LABELS,
  PROJECT_STAT_LABELS,
  restoreLayoutItem,
  toggleLayoutItem,
  type ProjectInsightId,
  type ProjectSectionId,
  type ProjectStatId,
  type ProjectsLayout,
  visibleItems,
} from "@/lib/projects-layout";
import { cn } from "@/lib/utils";

type CreateProjectAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

type ProjectRow = {
  id: string;
  name: string;
  nickname: string | null;
  description: string | null;
  ownership_mode: "native" | "external" | "hybrid";
  provider: string | null;
  provider_project_name: string | null;
  provider_project_url: string | null;
};

type BusyProject = {
  id: string;
  name: string;
  nickname: string | null;
  ownership_mode: "native" | "external" | "hybrid";
  open_count: number;
  attention_count: number;
  total_count: number;
};

type StatValue = {
  href: string;
  value: number;
  hint: string;
  icon: LucideIcon;
  iconClassName: string;
};

const PROJECT_STAT_ICONS: Record<ProjectStatId, { icon: LucideIcon; className: string }> = {
  active: { icon: FolderKanban, className: "text-sky-500" },
  archived: { icon: Archive, className: "text-stone-400" },
  native: { icon: House, className: "text-emerald-500" },
  external: { icon: Cloud, className: "text-violet-500" },
  attention: { icon: Siren, className: "text-rose-600" },
  inProgress: { icon: CircleDot, className: "text-amber-500" },
  blocked: { icon: AlertTriangle, className: "text-rose-500" },
  doneWeek: { icon: CheckCircle2, className: "text-emerald-500" },
};

type LayoutKind = "section" | "stat" | "insight";

type DragState = {
  kind: LayoutKind;
  id: string;
  label: string;
  width: number;
};

type DropIndicator = {
  kind: LayoutKind;
  index: number;
  multiline: boolean;
  listLeft: number;
  listTop: number;
  listWidth: number;
  listHeight: number;
  lineX: number;
  lineY: number;
};

function DropGuideOverlay({ indicator }: { indicator: DropIndicator }) {
  const left = indicator.lineX - indicator.listLeft;
  const top = indicator.lineY - indicator.listTop;
  return (
    <div
      className="pointer-events-none fixed z-[70]"
      style={{
        left: indicator.listLeft,
        top: indicator.listTop,
        width: indicator.listWidth,
        height: indicator.listHeight,
      }}
      aria-hidden="true"
    >
      <div className="board-drop-bar absolute inset-x-0" style={{ top }}>
        <div className="absolute inset-x-1 top-0 h-0.5 -translate-y-1/2 rounded-full" />
        <div className="absolute left-0 top-0 size-2 -translate-y-1/2 rounded-full bg-foreground" />
        <div className="absolute right-0 top-0 size-2 -translate-y-1/2 rounded-full bg-foreground" />
      </div>
      {indicator.multiline ? (
        <div className="board-drop-bar-vertical absolute inset-y-0" style={{ left }}>
          <div className="absolute inset-y-1 left-0 w-0.5 -translate-x-1/2 rounded-full" />
          <div className="absolute left-0 top-0 size-2 -translate-x-1/2 rounded-full bg-foreground" />
          <div className="absolute bottom-0 left-0 size-2 -translate-x-1/2 rounded-full bg-foreground" />
        </div>
      ) : null}
    </div>
  );
}

function hitTestLayoutList(
  list: HTMLElement,
  clientX: number,
  clientY: number,
  draggedId: string | null,
): Omit<DropIndicator, "kind"> | null {
  const listRect = list.getBoundingClientRect();
  const near =
    clientX >= listRect.left - 24 &&
    clientX <= listRect.right + 24 &&
    clientY >= listRect.top - 24 &&
    clientY <= listRect.bottom + 24;
  if (!near) return null;

  const cards = [...list.querySelectorAll<HTMLElement>("[data-layout-item]")].filter(
    (card) =>
      card.closest("[data-layout-list]") === list &&
      card.dataset.layoutId !== draggedId &&
      !card.classList.contains("board-card-drag-source"),
  );
  cards.sort((a, b) => {
    const aBox = a.getBoundingClientRect();
    const bBox = b.getBoundingClientRect();
    const dy = aBox.top - bBox.top;
    if (Math.abs(dy) > 12) return dy;
    return aBox.left - bBox.left;
  });

  const tops = new Set(cards.map((card) => Math.round(card.getBoundingClientRect().top / 12)));
  const lefts = new Set(cards.map((card) => Math.round(card.getBoundingClientRect().left / 12)));
  const multiline = tops.size > 1 && lefts.size > 1;

  let index = cards.length;
  for (let i = 0; i < cards.length; i += 1) {
    const rect = cards[i]!.getBoundingClientRect();
    const before =
      clientY < rect.top + rect.height / 2 ||
      (Math.abs(clientY - (rect.top + rect.height / 2)) <= 12 && clientX < rect.left + rect.width / 2);
    if (before) {
      index = i;
      break;
    }
  }

  let lineX = listRect.left;
  let lineY = listRect.top;
  if (cards.length === 0) {
    lineX = listRect.left + listRect.width / 2;
    lineY = listRect.top + 8;
  } else if (index < cards.length) {
    const rect = cards[index]!.getBoundingClientRect();
    lineX = rect.left;
    lineY = rect.top;
  } else {
    const rect = cards[cards.length - 1]!.getBoundingClientRect();
    lineX = multiline ? rect.right : listRect.left;
    lineY = multiline ? rect.top : rect.bottom;
  }

  return {
    index,
    multiline,
    listLeft: listRect.left,
    listTop: listRect.top,
    listWidth: listRect.width,
    listHeight: listRect.height,
    lineX,
    lineY,
  };
}

export function ProjectsBoard({
  initialLayout,
  workspaceId,
  workspaceName,
  scopeLabel,
  canWrite,
  createAction,
  integrations = [],
  statusNav,
  portfolio,
  taskStats,
  busiest,
  projects,
}: {
  initialLayout: ProjectsLayout;
  workspaceId: string;
  workspaceName: string;
  scopeLabel: string;
  canWrite: boolean;
  createAction: CreateProjectAction;
  integrations?: ProjectFormIntegration[];
  statusNav: ReactNode;
  portfolio: {
    active: number;
    archived: number;
    native: number;
    external: number;
    hybrid: number;
  };
  taskStats: ProjectDashboardStats;
  busiest: BusyProject[];
  projects: ProjectRow[];
}) {
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState(initialLayout);
  const [pending, startTransition] = useTransition();
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [enteringIds, setEnteringIds] = useState<Record<string, true>>({});
  const dropIndicatorRef = useRef<DropIndicator | null>(null);
  const dragSessionRef = useRef<{ pointerId: number; active: boolean } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const frameRef = useRef(0);

  const statsCatalog: Record<ProjectStatId, StatValue> = {
    active: {
      href: "/projects",
      value: portfolio.active,
      hint: "Currently in the workspace",
      icon: PROJECT_STAT_ICONS.active.icon,
      iconClassName: PROJECT_STAT_ICONS.active.className,
    },
    archived: {
      href: "/projects?status=archived",
      value: portfolio.archived,
      hint: "Parked or completed projects",
      icon: PROJECT_STAT_ICONS.archived.icon,
      iconClassName: PROJECT_STAT_ICONS.archived.className,
    },
    native: {
      href: "/projects?status=all",
      value: portfolio.native,
      hint: "Canonical in Atrium",
      icon: PROJECT_STAT_ICONS.native.icon,
      iconClassName: PROJECT_STAT_ICONS.native.className,
    },
    external: {
      href: "/projects?status=all",
      value: portfolio.external + portfolio.hybrid,
      hint: "Mirrored from a provider",
      icon: PROJECT_STAT_ICONS.external.icon,
      iconClassName: PROJECT_STAT_ICONS.external.className,
    },
    attention: {
      href: "/tasks?priority=attention",
      value: taskStats.attention,
      hint: `Across ${scopeLabel}`,
      icon: PROJECT_STAT_ICONS.attention.icon,
      iconClassName: PROJECT_STAT_ICONS.attention.className,
    },
    inProgress: {
      href: "/tasks?status=in_progress",
      value: taskStats.inProgress,
      hint: "Actively being worked",
      icon: PROJECT_STAT_ICONS.inProgress.icon,
      iconClassName: PROJECT_STAT_ICONS.inProgress.className,
    },
    blocked: {
      href: "/tasks?status=blocked",
      value: taskStats.blocked,
      hint: "Waiting on a dependency",
      icon: PROJECT_STAT_ICONS.blocked.icon,
      iconClassName: PROJECT_STAT_ICONS.blocked.className,
    },
    doneWeek: {
      href: "/tasks?status=done",
      value: taskStats.doneWeek,
      hint: "Closed in the last seven days",
      icon: PROJECT_STAT_ICONS.doneWeek.icon,
      iconClassName: PROJECT_STAT_ICONS.doneWeek.className,
    },
  };

  function placePreview() {
    const node = previewRef.current;
    if (!node) return;
    const { x, y, offsetX, offsetY } = pointerRef.current;
    node.style.transform = `translate3d(${x - offsetX}px, ${y - offsetY}px, 0) rotate(2deg) scale(1.03)`;
  }

  function setBoardDragging(active: boolean) {
    document.body.classList.toggle("board-dragging", active);
    if (active) window.dispatchEvent(new Event("atrium-board-drag-start"));
  }

  function clearDrag() {
    dragSessionRef.current = null;
    dropIndicatorRef.current = null;
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }
    setBoardDragging(false);
    setDrag(null);
    setDropIndicator(null);
  }

  useEffect(() => () => document.body.classList.remove("board-dragging"), []);

  useLayoutEffect(() => {
    if (!drag) return;
    placePreview();
  }, [drag]);

  function showDropIndicator(next: DropIndicator | null) {
    const current = dropIndicatorRef.current;
    if (current === next) return;
    if (
      current &&
      next &&
      current.kind === next.kind &&
      current.index === next.index &&
      current.multiline === next.multiline &&
      Math.abs(current.lineX - next.lineX) < 1 &&
      Math.abs(current.lineY - next.lineY) < 1
    ) {
      return;
    }
    dropIndicatorRef.current = next;
    setDropIndicator(next);
  }

  function updateIndicatorFromPoint(clientX: number, clientY: number, kind: LayoutKind, draggedId: string) {
    const list = document.querySelector<HTMLElement>(`[data-layout-list="${kind}"]`);
    if (!list) {
      showDropIndicator(null);
      return;
    }
    const hit = hitTestLayoutList(list, clientX, clientY, draggedId);
    if (!hit) {
      showDropIndicator(null);
      return;
    }
    showDropIndicator({ kind, ...hit });
  }

  function markEntering(id: string) {
    setEnteringIds((current) => ({ ...current, [id]: true }));
    window.setTimeout(() => {
      setEnteringIds((current) => {
        if (!current[id]) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
    }, 280);
  }

  function persist(next: ProjectsLayout) {
    setLayout(next);
    startTransition(async () => {
      await projectsLayoutAction(next);
    });
  }

  function resetLayout() {
    persist(structuredClone(DEFAULT_PROJECTS_LAYOUT));
  }

  function commitMove(kind: LayoutKind, id: string, index: number) {
    if (kind === "section") {
      persist({
        ...layout,
        sections: moveLayoutItem(layout.sections, id as ProjectSectionId, index),
      });
    } else if (kind === "stat") {
      persist({
        ...layout,
        stats: moveLayoutItem(layout.stats, id as ProjectStatId, index),
      });
    } else {
      persist({
        ...layout,
        insights: moveLayoutItem(layout.insights, id as ProjectInsightId, index),
      });
    }
    markEntering(id);
  }

  function onHandlePointerDown(
    event: ReactPointerEvent<HTMLElement>,
    item: { kind: LayoutKind; id: string; label: string },
  ) {
    if (!editing || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-no-drag]")) return;

    const host = event.currentTarget.closest<HTMLElement>("[data-layout-item]");
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const width = rect.width;
    const session = { pointerId, active: false };
    dragSessionRef.current = session;
    pointerRef.current = { x: event.clientX, y: event.clientY, offsetX, offsetY };

    event.preventDefault();

    function onMove(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerId || dragSessionRef.current !== session) return;
      pointerRef.current.x = moveEvent.clientX;
      pointerRef.current.y = moveEvent.clientY;
      if (!session.active) {
        const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
        if (distance < 5) return;
        session.active = true;
        setBoardDragging(true);
        setDrag({ kind: item.kind, id: item.id, label: item.label, width });
      }
      if (frameRef.current) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = 0;
        if (dragSessionRef.current !== session) return;
        placePreview();
        updateIndicatorFromPoint(pointerRef.current.x, pointerRef.current.y, item.kind, item.id);
      });
    }

    function finish(endEvent: PointerEvent) {
      if (endEvent.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (dragSessionRef.current !== session) return;
      const wasActive = session.active;
      if (wasActive) {
        updateIndicatorFromPoint(
          endEvent.clientX || pointerRef.current.x,
          endEvent.clientY || pointerRef.current.y,
          item.kind,
          item.id,
        );
      }
      const indicator = dropIndicatorRef.current;
      clearDrag();
      if (!wasActive || !indicator || indicator.kind !== item.kind) return;
      commitMove(item.kind, item.id, indicator.index);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  const visibleSections = editing
    ? layout.sections
    : layout.sections.filter((item) => !item.hidden);
  const visibleStats = editing ? layout.stats : layout.stats.filter((item) => !item.hidden);
  const visibleInsights = editing
    ? layout.insights
    : layout.insights.filter((item) => !item.hidden);

  const hiddenStats = layout.stats.filter((item) => item.hidden);
  const hiddenInsights = layout.insights.filter((item) => item.hidden);
  const hiddenSections = layout.sections.filter((item) => item.hidden);

  return (
    <div className={cn("space-y-8", editing && "pb-24")} data-no-reveal="" data-tour="projects-board">
      <div className="flex flex-wrap items-end justify-between gap-3" data-drag-inert="">
        <div>
          <h1 className="text-4xl">Projects</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {statusNav}
          {!editing ? (
            <Button type="button" variant="outline" onClick={() => setEditing(true)}>
              <LayoutDashboard className="size-3.5" aria-hidden="true" />
              Customize
            </Button>
          ) : null}
          {canWrite ? (
            <ProjectForm workspaceId={workspaceId} action={createAction} integrations={integrations} />
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div
            className="float-bar-rise pointer-events-auto flex items-center gap-2 rounded-xl border bg-card/95 p-1.5 shadow-lg backdrop-blur-md"
            role="toolbar"
            aria-label="Customize board"
            data-drag-inert=""
          >
            <Button type="button" variant="outline" onClick={resetLayout} disabled={pending}>
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Reset
            </Button>
            <Button type="button" onClick={() => setEditing(false)} disabled={pending}>
              Done
            </Button>
          </div>
        </div>
      ) : null}

      {editing && (hiddenSections.length > 0 || hiddenStats.length > 0 || hiddenInsights.length > 0) ? (
        <div className="rounded-lg border border-dashed bg-card/60 p-3" data-drag-inert="">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Hidden</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {hiddenSections.map((item) => (
              <button
                key={`section-${item.id}`}
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs transition hover:bg-accent"
                onClick={() =>
                  persist({
                    ...layout,
                    sections: restoreLayoutItem(layout.sections, item.id),
                  })
                }
              >
                <Eye className="size-3.5" aria-hidden="true" />
                {PROJECT_SECTION_LABELS[item.id]}
              </button>
            ))}
            {hiddenStats.map((item) => (
              <button
                key={`stat-${item.id}`}
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs transition hover:bg-accent"
                onClick={() =>
                  persist({
                    ...layout,
                    stats: restoreLayoutItem(layout.stats, item.id),
                  })
                }
              >
                <Eye className="size-3.5" aria-hidden="true" />
                {PROJECT_STAT_LABELS[item.id]}
              </button>
            ))}
            {hiddenInsights.map((item) => (
              <button
                key={`insight-${item.id}`}
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs transition hover:bg-accent"
                onClick={() =>
                  persist({
                    ...layout,
                    insights: restoreLayoutItem(layout.insights, item.id),
                  })
                }
              >
                <Eye className="size-3.5" aria-hidden="true" />
                {PROJECT_INSIGHT_LABELS[item.id]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        data-layout-list={editing ? "section" : undefined}
        className="flex flex-col gap-8"
      >
        {visibleSections.map((section) => {
          const hidden = Boolean(section.hidden);
          const isDragSource = drag?.kind === "section" && drag.id === section.id;
          const isEntering = Boolean(enteringIds[section.id]);

          let body: ReactNode = null;

          if (section.id === "stats") {
            body =
              visibleStats.length === 0 && !editing ? null : (
                <section
                  data-layout-list={editing ? "stat" : undefined}
                  className={cn(
                    "grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-4",
                    hidden && editing && "opacity-50",
                    drag?.kind === "stat" && "rounded-md bg-accent/20",
                  )}
                >
                  {visibleStats.map((stat) => {
                    const meta = statsCatalog[stat.id];
                    const tileHidden = Boolean(stat.hidden);
                    const tileDragging = drag?.kind === "stat" && drag.id === stat.id;
                    const tileEntering = Boolean(enteringIds[stat.id]);
                    const card = (
                      <ProjectStatCard
                        href={meta.href}
                        label={PROJECT_STAT_LABELS[stat.id]}
                        value={meta.value}
                        hint={meta.hint}
                        icon={meta.icon}
                        iconClassName={meta.iconClassName}
                        inert={editing}
                      />
                    );
                    if (editing) {
                      return (
                        <EditableTile
                          key={stat.id}
                          id={stat.id}
                          kind="stat"
                          label={PROJECT_STAT_LABELS[stat.id]}
                          hidden={tileHidden}
                          dragging={tileDragging}
                          entering={tileEntering}
                          onPointerDown={onHandlePointerDown}
                          onToggleHidden={() =>
                            persist({
                              ...layout,
                              stats: toggleLayoutItem(layout.stats, stat.id, !tileHidden),
                            })
                          }
                        >
                          {card}
                        </EditableTile>
                      );
                    }
                    return (
                      <div key={stat.id} className="h-full min-h-0">
                        {card}
                      </div>
                    );
                  })}
                </section>
              );
          } else if (section.id === "insights") {
            const insightNodes: Record<ProjectInsightId, ReactNode> = {
              statusMix: (
                <ProjectStatusBreakdown
                  stats={taskStats}
                  caption={`${taskStats.total} tasks across ${scopeLabel}`}
                />
              ),
              busiest: (
                <section className="flex h-full min-h-[13.5rem] flex-col rounded-lg border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl">Busiest projects</h2>
                      <p className="text-xs text-muted">Most open work in this view</p>
                    </div>
                    <p className="text-sm tabular-nums text-muted">{taskStats.completion}% done</p>
                  </div>
                  {busiest.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">No open work in {scopeLabel}.</p>
                  ) : (
                    <ul className="mt-3 flex-1 space-y-2">
                      {busiest.map((project) => (
                        <li key={project.id}>
                          <Link
                            href={`/projects/${project.id}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2.5 text-sm transition hover:border-foreground/20 hover:bg-accent/40"
                            tabIndex={editing ? -1 : undefined}
                            aria-disabled={editing || undefined}
                            onClick={editing ? (event) => event.preventDefault() : undefined}
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">{projectDisplayName(project)}</p>
                              <p className="text-xs text-muted">
                                {project.open_count} open · {project.attention_count} attention ·{" "}
                                {project.total_count} total
                              </p>
                            </div>
                            <Badge tone={project.ownership_mode === "native" ? "native" : "external"}>
                              {project.ownership_mode}
                            </Badge>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ),
            };

            const shown = visibleInsights.filter((item) => editing || !item.hidden);
            if (shown.length === 0 && !editing) {
              body = null;
            } else {
              body = (
                <section
                  data-layout-list={editing ? "insight" : undefined}
                  className={cn(
                    "grid gap-4",
                    shown.filter((item) => !item.hidden).length > 1
                      ? "lg:grid-cols-2"
                      : "lg:grid-cols-1",
                    hidden && editing && "opacity-50",
                    drag?.kind === "insight" && "rounded-md bg-accent/20",
                  )}
                >
                  {shown.map((insight) => {
                    const tileHidden = Boolean(insight.hidden);
                    const tileDragging = drag?.kind === "insight" && drag.id === insight.id;
                    const tileEntering = Boolean(enteringIds[insight.id]);
                    if (editing) {
                      return (
                        <EditableTile
                          key={insight.id}
                          id={insight.id}
                          kind="insight"
                          label={PROJECT_INSIGHT_LABELS[insight.id]}
                          hidden={tileHidden}
                          dragging={tileDragging}
                          entering={tileEntering}
                          onPointerDown={onHandlePointerDown}
                          onToggleHidden={() =>
                            persist({
                              ...layout,
                              insights: toggleLayoutItem(layout.insights, insight.id, !tileHidden),
                            })
                          }
                        >
                          {insightNodes[insight.id]}
                        </EditableTile>
                      );
                    }
                    return (
                      <div key={insight.id} className="h-full min-h-0">
                        {insightNodes[insight.id]}
                      </div>
                    );
                  })}
                </section>
              );
            }
          } else {
            body = (
              <section
                className={cn("mb-10 space-y-4 pb-6", hidden && editing && "opacity-50")}
                aria-labelledby="project-portfolio-heading"
              >
                <div className="border-b border-border/80 pb-3">
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted">Portfolio</p>
                  <h2 id="project-portfolio-heading" className="mt-1 text-2xl">
                    Project list
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {projects.length === 0
                      ? `No ${scopeLabel} yet.`
                      : `${projects.length} ${scopeLabel} in ${workspaceName}.`}
                  </p>
                </div>
                {projects.length === 0 ? (
                  <div className="rounded-xl border border-dashed bg-card p-8">
                    <h3 className="text-2xl">No projects in this view</h3>
                    <p className="mt-2 text-sm text-muted">
                      Create a native project, or connect a provider and link one of its projects.
                    </p>
                    {canWrite ? (
                      <div className="mt-4">
                        <ProjectForm
                          workspaceId={workspaceId}
                          action={createAction}
                          integrations={integrations}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {projects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        workspaceId={workspaceId}
                        project={project}
                        canWrite={canWrite}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          }

          if (!editing) {
            return <div key={section.id}>{body}</div>;
          }

          return (
            <EditableBlock
              key={section.id}
              id={section.id}
              label={PROJECT_SECTION_LABELS[section.id]}
              hidden={hidden}
              dragging={isDragSource}
              entering={isEntering}
              onPointerDown={onHandlePointerDown}
              onToggleHidden={() =>
                persist({
                  ...layout,
                  sections: toggleLayoutItem(layout.sections, section.id, !hidden),
                })
              }
            >
              {body}
            </EditableBlock>
          );
        })}
      </div>

      {drag && dropIndicator && dropIndicator.kind === drag.kind ? (
        <DropGuideOverlay indicator={dropIndicator} />
      ) : null}

      {!canWrite ? (
        <p className="text-sm text-muted">Viewers and members can read projects. Owners and admins create them.</p>
      ) : null}

      {!editing && visibleItems(layout.sections).length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center">
          <p className="text-lg font-medium">Every section is hidden</p>
          <p className="mt-1 text-sm text-muted">Open Customize to bring pieces of the board back.</p>
          <Button type="button" className="mt-4" onClick={() => setEditing(true)}>
            Customize
          </Button>
        </div>
      ) : null}

      {drag ? (
        <div
          ref={previewRef}
          aria-hidden="true"
          className="board-drag-preview pointer-events-none fixed top-0 left-0 z-[80] rounded-lg border bg-card px-3 py-2 text-sm shadow-xl"
          style={{ width: drag.width }}
        >
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
            <GripVertical className="size-3.5" aria-hidden="true" />
            {drag.label}
          </div>
          <p className="mt-1 text-sm font-medium capitalize">{drag.kind}</p>
        </div>
      ) : null}
    </div>
  );
}

function EditableBlock({
  id,
  hidden,
  label,
  dragging,
  entering,
  onPointerDown,
  onToggleHidden,
  children,
}: {
  id: ProjectSectionId;
  hidden: boolean;
  label: string;
  dragging: boolean;
  entering: boolean;
  onPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    item: { kind: LayoutKind; id: string; label: string },
  ) => void;
  onToggleHidden: () => void;
  children: ReactNode;
}) {
  return (
    <div
      data-layout-item=""
      data-layout-id={id}
      className={cn(
        "board-card rounded-xl border border-dashed p-3 transition-[opacity,transform,box-shadow,background-color,border-color] duration-200 ease-out",
        dragging ? "board-card-drag-source" : "border-border/80",
        hidden && !dragging && "opacity-60",
        entering && "board-card-enter",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onPointerDown={(event) => onPointerDown(event, { kind: "section", id, label })}
          onDragStart={(event) => event.preventDefault()}
          className="inline-flex cursor-grab items-center gap-1.5 text-xs font-medium text-muted active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" aria-hidden="true" />
          {label}
        </button>
        <button
          type="button"
          data-no-drag=""
          onClick={onToggleHidden}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted transition hover:bg-accent hover:text-foreground"
        >
          {hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          {hidden ? "Show" : "Hide"}
        </button>
      </div>
      {children}
    </div>
  );
}

function EditableTile({
  id,
  kind,
  label,
  hidden,
  dragging,
  entering,
  onPointerDown,
  onToggleHidden,
  children,
}: {
  id: string;
  kind: "stat" | "insight";
  label: string;
  hidden: boolean;
  dragging: boolean;
  entering: boolean;
  onPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    item: { kind: LayoutKind; id: string; label: string },
  ) => void;
  onToggleHidden: () => void;
  children: ReactNode;
}) {
  return (
    <div
      data-layout-item=""
      data-layout-id={id}
      className={cn(
        "board-card flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-dashed bg-card/40 transition-[opacity,transform,box-shadow,background-color,border-color] duration-200 ease-out",
        dragging ? "board-card-drag-source" : null,
        hidden && !dragging && "opacity-50",
        entering && "board-card-enter",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-dashed px-2 py-1.5">
        <button
          type="button"
          onPointerDown={(event) => onPointerDown(event, { kind, id, label })}
          onDragStart={(event) => event.preventDefault()}
          className="inline-flex min-w-0 cursor-grab items-center gap-1 truncate text-[11px] font-medium text-muted active:cursor-grabbing"
          aria-label={`Drag ${label}`}
        >
          <GripVertical className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{label}</span>
        </button>
        <button
          type="button"
          data-no-drag=""
          onClick={onToggleHidden}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-accent hover:text-foreground"
          aria-label={hidden ? `Show ${label}` : `Hide ${label}`}
          title={hidden ? `Show ${label}` : `Hide ${label}`}
        >
          {hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </button>
      </div>
      <div className="min-h-0 min-w-0 flex-1 p-1.5">{children}</div>
    </div>
  );
}
