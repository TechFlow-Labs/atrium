"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRight,
  CheckSquare,
  FolderPlus,
  Plug,
  Plus,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type CreateOption = {
  href: string;
  title: string;
  description: string;
  detail: string;
  icon: LucideIcon;
};

const OPTIONS: CreateOption[] = [
  {
    href: "/tasks",
    title: "New issue",
    description: "Add work to a project",
    detail: "Create an issue in this workspace. Native projects accept full edits; provider projects only expose supported fields.",
    icon: CheckSquare,
  },
  {
    href: "/projects",
    title: "New project",
    description: "Start a native project",
    detail: "Native projects are owned in Atrium. You can link a Linear, Jira, GitHub, or GitLab board later from Integrations.",
    icon: FolderPlus,
  },
  {
    href: "/integrations",
    title: "Connect provider",
    description: "Sync an external tracker",
    detail: "Connect Linear, Jira, GitHub, or GitLab with a token or OAuth. Credentials stay encrypted on the server.",
    icon: Plug,
  },
];

export function CreateMenu() {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  function clearCloseTimer() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function openHoverMenu() {
    if (modalOpen) return;
    clearCloseTimer();
    setHoverOpen(true);
  }

  function scheduleCloseHoverMenu() {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setHoverOpen(false), 160);
  }

  useEffect(() => () => clearCloseTimer(), []);

  useEffect(() => {
    if (!hoverOpen || modalOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setHoverOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setHoverOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [hoverOpen, modalOpen]);

  return (
    <>
      <div
        ref={rootRef}
        className="relative"
        onPointerEnter={openHoverMenu}
        onPointerLeave={scheduleCloseHoverMenu}
      >
        <button
          type="button"
          aria-label="Create"
          title="Create"
          aria-haspopup="menu"
          aria-expanded={hoverOpen}
          aria-controls={menuId}
          onClick={() => {
            clearCloseTimer();
            setHoverOpen(false);
            setModalOpen(true);
          }}
          className={cn(
            "group inline-flex size-9 items-center justify-center rounded-md border bg-card text-foreground outline-none",
            "transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out",
            "hover:border-foreground/20 hover:bg-accent hover:shadow-md",
            "motion-safe:hover:scale-105 motion-safe:active:scale-95",
            "focus-visible:ring-2 focus-visible:ring-ring",
            hoverOpen && "border-foreground/20 bg-accent shadow-md",
          )}
        >
          <Plus
            className="size-4 transition-transform duration-200 ease-out motion-safe:group-hover:rotate-90 motion-safe:group-hover:scale-110"
            aria-hidden="true"
          />
        </button>

        {hoverOpen && !modalOpen ? (
          <div
            className="absolute right-0 top-full z-50 pt-2"
            onPointerEnter={openHoverMenu}
          >
            <div
              id={menuId}
              role="menu"
              aria-label="Create"
              className="menu-surface w-64 overflow-hidden rounded-lg border bg-card p-1 text-foreground shadow-lg"
              data-state="open"
              data-side="bottom"
            >
              <p className="px-2 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-muted">
                Create
              </p>
              <div className="-mx-1 my-1 h-px bg-border" />
              {OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <Link
                    key={option.href}
                    href={option.href}
                    role="menuitem"
                    onClick={() => setHoverOpen(false)}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm outline-none transition hover:bg-accent focus-visible:bg-accent"
                  >
                    <Icon className="size-4 shrink-0 text-muted" aria-hidden="true" />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">{option.title}</span>
                      <span className="text-xs text-muted">{option.description}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="w-[min(100%-2rem,56rem)] max-h-[min(90dvh,40rem)] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-5 pr-12">
            <DialogTitle className="text-2xl md:text-3xl">Create</DialogTitle>
            <DialogDescription className="max-w-2xl">
              Pick something to add to this workspace. Hover + for the quick menu, or choose a tile below for the full path.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto p-6">
            <div className="grid gap-4 md:grid-cols-3">
              {OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <Link
                    key={option.href}
                    href={option.href}
                    onClick={() => setModalOpen(false)}
                    className={cn(
                      "group flex h-full flex-col rounded-2xl border bg-background p-5 text-left transition",
                      "hover:border-foreground/20 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                  >
                    <span className="inline-flex size-12 items-center justify-center rounded-xl border bg-card text-foreground">
                      <Icon className="size-6" aria-hidden="true" />
                    </span>
                    <span className="mt-5 flex items-center gap-2">
                      <span className="text-xl font-medium">{option.title}</span>
                      <ArrowRight
                        className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-foreground"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="mt-1 text-sm text-muted">{option.description}</span>
                    <span className="mt-4 text-sm leading-relaxed text-muted">{option.detail}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
