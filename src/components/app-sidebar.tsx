"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Building2,
  CalendarRange,
  Check,
  ChevronRight,
  FolderKanban,
  GripVertical,
  Home,
  ListTodo,
  MessagesSquare,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Minus,
  Pencil,
  Plus,
  Plug,
  RefreshCw,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { AtriumLogo, AtriumMark } from "@/components/atrium-logo";
import { cn } from "@/lib/utils";

type NavLink = { label: string; href: string; icon: LucideIcon; group: string | null };

const LINKS: NavLink[] = [
  { label: "Home", href: "/home", icon: Home, group: null },
  { label: "Projects", href: "/projects", icon: FolderKanban, group: "work" },
  { label: "Tasks", href: "/tasks", icon: ListTodo, group: "work" },
  { label: "Schedule", href: "/schedule", icon: CalendarRange, group: "work" },
  { label: "Chats", href: "/chats", icon: MessagesSquare, group: "inbox" },
  { label: "Notes", href: "/notes", icon: NotebookPen, group: "inbox" },
  { label: "Integrations", href: "/integrations", icon: Plug, group: "connect" },
  { label: "Sync", href: "/sync", icon: RefreshCw, group: "connect" },
  { label: "Workspaces", href: "/workspaces", icon: Building2, group: "manage" },
  { label: "Audit", href: "/audit", icon: ScrollText, group: "manage" },
  { label: "Settings", href: "/settings", icon: Settings, group: "manage" },
];

const GROUPS: Array<{ id: string; label: string }> = [
  { id: "work", label: "Work" },
  { id: "inbox", label: "Inbox" },
  { id: "connect", label: "Connect" },
  { id: "manage", label: "Manage" },
];

const COLLAPSED_COOKIE = "atrium_sidebar";
const ORDER_COOKIE = "atrium_sidebar_order";
const GROUPS_COOKIE = "atrium_sidebar_groups";
const DEFAULT_ORDER = LINKS.map((link) => link.href);
const LINK_BY_HREF = new Map(LINKS.map((link) => [link.href, link]));
const DEFAULT_GROUP_OPEN: Record<string, boolean> = {
  work: true,
  inbox: true,
  connect: false,
  manage: false,
};

export function parseSidebarOrder(raw?: string | null): string[] {
  const known = new Set(DEFAULT_ORDER);
  let value = raw ?? "";
  try {
    value = decodeURIComponent(value);
  } catch {
    value = raw ?? "";
  }
  if (!value.trim()) return [...DEFAULT_ORDER];
  const parsed = value
    .split(",")
    .map((part) => {
      const href = part.trim();
      // Migrate former Calendar nav entries to Schedule.
      return href === "/calendar" ? "/schedule" : href;
    })
    .filter((href) => known.has(href));
  const unique = [...new Set(parsed)];
  return unique.length > 0 ? unique : [...DEFAULT_ORDER];
}

export function parseSidebarGroups(raw?: string | null): Record<string, boolean> {
  const next = { ...DEFAULT_GROUP_OPEN };
  let value = raw ?? "";
  try {
    value = decodeURIComponent(value);
  } catch {
    value = raw ?? "";
  }
  if (!value.trim()) return next;
  for (const part of value.split(",")) {
    const [id, flag] = part.split(":").map((item) => item.trim());
    if (!id || !(id in next) || flag === undefined) continue;
    next[id] = flag === "1" || flag === "true" || flag === "open";
  }
  return next;
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((href, index) => href === b[index]);
}

function writeCollapsedCookie(collapsed: boolean) {
  document.cookie = `${COLLAPSED_COOKIE}=${collapsed ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
}

function writeOrderCookie(order: string[]) {
  document.cookie = `${ORDER_COOKIE}=${encodeURIComponent(order.join(","))}; path=/; max-age=31536000; samesite=lax`;
}

function writeGroupsCookie(open: Record<string, boolean>) {
  const payload = GROUPS.map((group) => `${group.id}:${open[group.id] ? "1" : "0"}`).join(",");
  document.cookie = `${GROUPS_COOKIE}=${encodeURIComponent(payload)}; path=/; max-age=31536000; samesite=lax`;
}

function moveSidebarItem(order: string[], href: string, index: number): string[] {
  const without = order.filter((item) => item !== href);
  const next = [...without];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, href);
  return next;
}

function insertIndexFromPointer(nav: HTMLElement, clientY: number, href: string): number {
  const rows = [...nav.querySelectorAll<HTMLElement>("[data-nav-href]")].filter(
    (row) => row.dataset.navHref !== href,
  );
  for (let index = 0; index < rows.length; index += 1) {
    const rect = rows[index]!.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return index;
  }
  return rows.length;
}

function hrefMatchesPath(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarTip({
  label,
  show,
  children,
}: {
  label: string;
  show: boolean;
  children: ReactNode;
}) {
  if (!show) return <>{children}</>;
  return (
    <div className="group/tip relative">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-full top-1/2 z-[60] ml-2 -translate-y-1/2",
          "whitespace-nowrap rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-lg",
          "opacity-0 translate-x-1 transition duration-150",
          // Hover only — focus-within kept labels stuck after click; links already have aria-label.
          "group-hover/tip:translate-x-0 group-hover/tip:opacity-100",
        )}
      >
        {label}
      </span>
    </div>
  );
}

export function AppSidebar({
  userName,
  initialCollapsed = false,
  initialOrder,
  initialGroups,
}: {
  userName: string;
  initialCollapsed?: boolean;
  initialOrder?: string;
  initialGroups?: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [order, setOrder] = useState(() => parseSidebarOrder(initialOrder));
  const [groupOpen, setGroupOpen] = useState(() => parseSidebarGroups(initialGroups));
  const [editing, setEditing] = useState(false);
  const [dragHref, setDragHref] = useState<string | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ href: string; width: number; x: number; y: number; offsetY: number } | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const restoreCollapsedRef = useRef<boolean | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: 0, y: 0, offsetY: 0 });
  const frameRef = useRef(0);

  useEffect(() => {
    writeCollapsedCookie(collapsed);
  }, [collapsed]);

  useEffect(() => {
    writeOrderCookie(order);
  }, [order]);

  useEffect(() => {
    writeGroupsCookie(groupOpen);
  }, [groupOpen]);

  function placePreview() {
    const node = previewRef.current;
    if (!node) return;
    const { x, y, offsetY } = pointerRef.current;
    node.style.transform = `translate3d(${x}px, ${y - offsetY}px, 0)`;
  }

  useLayoutEffect(() => {
    if (!preview) return;
    placePreview();
  }, [preview]);

  function toggle() {
    if (editing) restoreCollapsedRef.current = null;
    setCollapsed((value) => !value);
  }

  function startEdit() {
    restoreCollapsedRef.current = collapsed;
    setCollapsed(false);
    setEditing(true);
  }

  function finishEdit() {
    setEditing(false);
    setDragHref(null);
    setInsertAt(null);
    setPreview(null);
    if (restoreCollapsedRef.current) setCollapsed(true);
    restoreCollapsedRef.current = null;
  }

  function toggleGroup(id: string) {
    setGroupOpen((current) => ({ ...current, [id]: !current[id] }));
  }

  function onRowPointerDown(event: ReactPointerEvent<HTMLButtonElement>, href: string) {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerId = event.pointerId;
    const startY = event.clientY;
    pointerRef.current = { x: rect.left, y: event.clientY, offsetY: event.clientY - rect.top };
    let active = false;

    function onMove(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerId) return;
      pointerRef.current.x = rect.left;
      pointerRef.current.y = moveEvent.clientY;
      if (!active) {
        if (Math.abs(moveEvent.clientY - startY) < 4) return;
        active = true;
        setDragHref(href);
        setPreview({
          href,
          width: rect.width,
          x: rect.left,
          y: moveEvent.clientY,
          offsetY: moveEvent.clientY - rect.top,
        });
      }
      const nav = navRef.current;
      if (nav) {
        const index = insertIndexFromPointer(nav, moveEvent.clientY, href);
        setInsertAt((current) => (current === index ? current : index));
      }
      if (frameRef.current) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = 0;
        placePreview();
      });
    }

    function finish(endEvent: PointerEvent) {
      if (endEvent.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
      if (active) {
        const nav = navRef.current;
        const index = nav ? insertIndexFromPointer(nav, endEvent.clientY || pointerRef.current.y, href) : 0;
        setOrder((current) => moveSidebarItem(current, href, index));
      }
      setDragHref(null);
      setInsertAt(null);
      setPreview(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function nudge(href: string, direction: -1 | 1) {
    setOrder((current) => {
      const index = current.indexOf(href);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= current.length) return current;
      return moveSidebarItem(current, href, next);
    });
  }

  function removeRow(href: string) {
    setOrder((current) => {
      if (current.length <= 1) return current;
      return current.filter((item) => item !== href);
    });
    if (dragHref === href) {
      setDragHref(null);
      setInsertAt(null);
      setPreview(null);
    }
  }

  function addRow(href: string) {
    setOrder((current) => (current.includes(href) ? current : [...current, href]));
  }

  const available = LINKS.filter((link) => !order.includes(link.href));
  const isDefault = sameOrder(order, DEFAULT_ORDER);
  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const visibleHrefs = order.filter((href) => LINK_BY_HREF.has(href));
  const pinnedHrefs = visibleHrefs.filter((href) => LINK_BY_HREF.get(href)?.group == null);
  const groupedSections = GROUPS.map((group) => ({
    ...group,
    hrefs: visibleHrefs.filter((href) => LINK_BY_HREF.get(href)?.group === group.id),
  })).filter((group) => group.hrefs.length > 0);

  function renderNavRow(href: string) {
    const link = LINK_BY_HREF.get(href);
    if (!link) return null;
    const { label, icon: Icon } = link;
    const active = hrefMatchesPath(href, pathname);
    const visualIndex = visibleHrefs.filter((item) => item !== dragHref).indexOf(href);
    const rowClass = cn(
      "flex min-w-0 flex-1 items-center rounded-md text-sm transition-colors hover:bg-white/10",
      collapsed ? "justify-center p-2" : "gap-3 px-2 py-2 text-left",
      active && !editing && "bg-white/10",
      editing && "cursor-grab active:cursor-grabbing",
      dragHref === href && "pointer-events-none h-0 overflow-hidden p-0 opacity-0",
    );
    return (
      <div key={href} className="contents">
        {editing && insertAt === visualIndex ? <SidebarInsertBar /> : null}
        <div
          className={cn(
            "flex items-center gap-0.5",
            dragHref === href && "pointer-events-none h-0 overflow-hidden opacity-0",
          )}
        >
          <SidebarTip label={editing ? `Reorder ${label}` : label} show={collapsed}>
            {editing ? (
              <button
                type="button"
                data-nav-href={href}
                aria-label={`Reorder ${label}`}
                className={rowClass}
                onPointerDown={(event) => onRowPointerDown(event, href)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    nudge(href, -1);
                  } else if (event.key === "ArrowDown") {
                    event.preventDefault();
                    nudge(href, 1);
                  }
                }}
              >
                {!collapsed ? <GripVertical className="size-4 shrink-0 opacity-60" aria-hidden="true" /> : null}
                <Icon className="size-4 shrink-0 opacity-90" aria-hidden="true" />
                {!collapsed ? <span className="truncate">{label}</span> : null}
              </button>
            ) : (
              <Link
                href={href}
                data-nav-href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={rowClass}
              >
                <Icon className="size-4 shrink-0 opacity-90" aria-hidden="true" />
                {!collapsed ? <span className="truncate">{label}</span> : null}
              </Link>
            )}
          </SidebarTip>
          {editing && !collapsed ? (
            <button
              type="button"
              onClick={() => removeRow(href)}
              disabled={order.length <= 1}
              aria-label={`Remove ${label}`}
              title={order.length <= 1 ? "Keep at least one row" : `Remove ${label}`}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/55 transition hover:bg-white/10 hover:text-sidebar-foreground disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Minus className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <aside
      data-tour="sidebar"
      className={cn(
        // Keep the rail above shell-chrome-in so collapsed hover tips are not covered.
        "shell-sidebar-in relative z-40 hidden h-full min-h-0 shrink-0 flex-col justify-between bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
        collapsed ? "w-12 overflow-visible p-1.5" : "w-60 overflow-hidden p-4",
      )}
    >
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1",
          // Hover tips sit outside the rail; scrolling here would create a native horizontal bar.
          collapsed ? "overflow-visible" : "overflow-x-hidden overflow-y-auto",
        )}
      >
        <div className={cn("flex items-center gap-2", collapsed ? "justify-center" : "justify-between px-2")}>
          {!collapsed ? (
            <Link href="/home" aria-label="Atrium" className="min-w-0 text-sidebar-foreground">
              <AtriumLogo markClassName="size-7 text-emerald-200" />
            </Link>
          ) : (
            <SidebarTip label="Atrium" show>
              <Link href="/home" aria-label="Atrium" className="text-emerald-200">
                <AtriumMark className="size-6" />
              </Link>
            </SidebarTip>
          )}
          {!collapsed ? (
            <button
              type="button"
              onClick={toggle}
              className="inline-flex size-8 items-center justify-center rounded-md text-sidebar-foreground/70 transition hover:bg-white/10 hover:text-sidebar-foreground"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {collapsed ? (
          <div className="mt-2 flex justify-center">
            <SidebarTip label="Expand sidebar" show>
              <button
                type="button"
                onClick={toggle}
                className="inline-flex size-8 items-center justify-center rounded-md text-sidebar-foreground/70 transition hover:bg-white/10 hover:text-sidebar-foreground"
                aria-label="Expand sidebar"
              >
                <PanelLeftOpen className="size-4" aria-hidden="true" />
              </button>
            </SidebarTip>
          </div>
        ) : null}

        <nav
          ref={navRef}
          aria-label={editing ? "Edit navigation" : "Primary"}
          className={cn("flex flex-col gap-0.5", collapsed ? "mt-2" : "mt-4")}
        >
          {editing && !collapsed ? (
            <p className="px-2 pb-1 text-xs text-sidebar-foreground/60">
              Drag to reorder. Remove a row, or add one from the list below.
            </p>
          ) : null}

          {pinnedHrefs.map((href) => renderNavRow(href))}

          {groupedSections.map((group, groupIndex) => {
            const hasActive = group.hrefs.some((href) => hrefMatchesPath(href, pathname));
            const open = editing || collapsed || hasActive || Boolean(groupOpen[group.id]);
            const showDivider = collapsed && (pinnedHrefs.length > 0 || groupIndex > 0);
            return (
              <div key={group.id} className={cn("flex flex-col gap-0.5", !collapsed && "mt-2")}>
                {showDivider ? <div className="mx-2 my-1 h-px bg-white/10" aria-hidden="true" /> : null}
                {!collapsed ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!editing) toggleGroup(group.id);
                    }}
                    aria-expanded={open}
                    className={cn(
                      "flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/55 transition",
                      editing ? "cursor-default" : "hover:bg-white/10 hover:text-sidebar-foreground/80",
                    )}
                  >
                    <ChevronRight
                      className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
                      aria-hidden="true"
                    />
                    <span className="truncate">{group.label}</span>
                  </button>
                ) : null}
                {open ? group.hrefs.map((href) => renderNavRow(href)) : null}
              </div>
            );
          })}

          {editing && insertAt === visibleHrefs.filter((item) => item !== dragHref).length ? (
            <SidebarInsertBar />
          ) : null}
        </nav>
        {editing && !collapsed && available.length > 0 ? (
          <div className="mt-3 border-t border-white/10 pt-3">
            <p className="px-2 pb-1 text-xs text-sidebar-foreground/60">Add to sidebar</p>
            <ul className="flex flex-col gap-0.5">
              {available.map((link) => {
                const Icon = link.icon;
                return (
                  <li key={link.href}>
                    <button
                      type="button"
                      onClick={() => addRow(link.href)}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm text-sidebar-foreground/75 transition hover:bg-white/10 hover:text-sidebar-foreground"
                    >
                      <Plus className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
                      <Icon className="size-4 shrink-0 opacity-90" aria-hidden="true" />
                      <span className="truncate">{link.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <div className={cn("mt-3 flex items-center gap-2", collapsed ? "justify-center" : "px-1")}>
          <SidebarTip label={editing ? "Done editing" : "Edit navigation"} show={collapsed}>
            <button
              type="button"
              onClick={editing ? finishEdit : startEdit}
              aria-pressed={editing}
              aria-label={editing ? "Done editing navigation" : "Edit navigation"}
              className={cn(
                "inline-flex items-center justify-center rounded-md text-sidebar-foreground/70 transition hover:bg-white/10 hover:text-sidebar-foreground",
                collapsed ? "size-8" : "h-8 gap-2 px-2 text-xs",
              )}
            >
              {editing ? <Check className="size-4" aria-hidden="true" /> : <Pencil className="size-3.5" aria-hidden="true" />}
              {!collapsed ? <span>{editing ? "Done" : "Edit"}</span> : null}
            </button>
          </SidebarTip>
          {editing && !collapsed && !isDefault ? (
            <button
              type="button"
              onClick={() => setOrder([...DEFAULT_ORDER])}
              className="ml-auto h-8 rounded-md px-2 text-xs text-sidebar-foreground/60 transition hover:bg-white/10 hover:text-sidebar-foreground"
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>

      <div className={cn("flex items-center gap-2", collapsed ? "justify-center py-1.5" : "px-2 py-2")}>
        <SidebarTip label={userName} show={collapsed}>
          <span
            aria-label={userName}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[11px] font-medium"
          >
            {initials || "?"}
          </span>
        </SidebarTip>
        {!collapsed ? <span className="truncate text-sm text-sidebar-foreground/70">{userName}</span> : null}
      </div>
      {preview ? (
        <div
          ref={previewRef}
          aria-hidden="true"
          className="pointer-events-none fixed top-0 left-0 z-[80] flex items-center gap-3 rounded-md border border-white/15 bg-sidebar px-2 py-2 text-sm text-sidebar-foreground shadow-xl"
          style={{ width: preview.width }}
        >
          <GripVertical className="size-4 shrink-0 opacity-60" aria-hidden="true" />
          {(() => {
            const link = LINK_BY_HREF.get(preview.href);
            if (!link) return null;
            const Icon = link.icon;
            return (
              <>
                <Icon className="size-4 shrink-0 opacity-90" aria-hidden="true" />
                <span className="truncate">{link.label}</span>
              </>
            );
          })()}
        </div>
      ) : null}
    </aside>
  );
}

function SidebarInsertBar() {
  return (
    <div className="pointer-events-none relative z-10 h-0" aria-hidden="true">
      <div className="absolute inset-x-2 top-0 h-0.5 -translate-y-1/2 rounded-full bg-sidebar-foreground" />
      <div className="absolute left-1 top-0 size-1.5 -translate-y-1/2 rounded-full bg-sidebar-foreground" />
      <div className="absolute right-1 top-0 size-1.5 -translate-y-1/2 rounded-full bg-sidebar-foreground" />
    </div>
  );
}
