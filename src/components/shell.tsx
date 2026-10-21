import Link from "next/link";
import { Suspense } from "react";
import { RefreshCw, Search } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { AtriumLogo } from "@/components/atrium-logo";
import { AppSidebar } from "@/components/app-sidebar";
import { CreateMenu } from "@/components/create-menu";
import { DevMenu } from "@/components/dev-menu";
import { PageMotion } from "@/components/page-motion";
import { QuickActions } from "@/components/quick-actions";
import { ScreenGuide } from "@/components/screen-guide";
import { WorkspaceSwitch } from "@/components/workspace-switch";
import type { WorkspaceContextDef } from "@/lib/workspace-contexts";
import type { WorkspaceSummary } from "@/server/workspaces/service";
import type { SessionUser } from "@/server/auth/session";

export function Shell({
  user,
  workspaces,
  current,
  contexts = [],
  seenGuides = {},
  theme,
  sidebarCollapsed = false,
  sidebarOrder,
  sidebarGroups,
  devTools = null,
  children,
}: {
  user: SessionUser;
  workspaces: WorkspaceSummary[];
  current: WorkspaceSummary;
  contexts?: WorkspaceContextDef[];
  seenGuides?: Record<string, number>;
  theme: "light" | "dark";
  sidebarCollapsed?: boolean;
  sidebarOrder?: string;
  sidebarGroups?: string;
  devTools?: { mocksVisible: boolean; envLabel: string } | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh max-h-dvh overflow-hidden">
      <AppSidebar
        userName={user.name}
        initialCollapsed={sidebarCollapsed}
        initialOrder={sidebarOrder}
        initialGroups={sidebarGroups}
      />
      <div className="shell-chrome-in relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative z-20 flex shrink-0 flex-wrap items-center gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex shrink-0 items-center gap-3">
            <Link href="/home" aria-label="Atrium" className="text-foreground md:hidden">
              <AtriumLogo markClassName="size-6 text-primary" wordClassName="text-xl" />
            </Link>
            <div className="flex items-center" data-tour="workspace-switch">
              <WorkspaceSwitch currentId={current.id} workspaces={workspaces} contexts={contexts} />
            </div>
          </div>
          <form action="/search" data-tour="search" className="relative ml-auto w-full max-w-xs shrink">
            <label className="sr-only" htmlFor="global-search">Search</label>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              id="global-search"
              name="q"
              placeholder="Search"
              className="h-9 w-full rounded-md border bg-card py-1 pl-8 pr-3 text-sm"
            />
          </form>
          <div className="flex shrink-0 items-center gap-1">
            <ScreenGuide seenVersions={seenGuides} />
            <div className="flex items-center" data-tour="create">
              <CreateMenu />
            </div>
            <HeaderAction href="/sync" label="Sync" icon={RefreshCw} className="hidden sm:inline-flex" />
            {devTools ? <DevMenu mocksVisible={devTools.mocksVisible} envLabel={devTools.envLabel} /> : null}
            <AccountMenu user={user} theme={theme} />
          </div>
          <nav className="flex w-full gap-3 overflow-x-auto text-sm md:hidden">
            {[
              ["Home", "/home"],
              ["Projects", "/projects"],
              ["Tasks", "/tasks"],
              ["Schedule", "/schedule"],
              ["Chats", "/chats"],
              ["Notes", "/notes"],
            ].map(([label, href]) => (
              <Link key={href} href={href}>{label}</Link>
            ))}
          </nav>
        </header>
        <main className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto px-4 py-6 md:px-6">
          <Suspense fallback={<div className="flex min-h-0 flex-1 flex-col">{children}</div>}>
            <PageMotion>{children}</PageMotion>
          </Suspense>
        </main>
      </div>
      <QuickActions />
    </div>
  );
}

function HeaderAction({
  href,
  label,
  icon: Icon,
  className = "inline-flex",
}: {
  href: string;
  label: string;
  icon: typeof Search;
  className?: string;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className={`${className} size-9 items-center justify-center rounded-md border bg-card text-foreground transition hover:bg-accent`}
    >
      <Icon className="size-4" aria-hidden="true" />
    </Link>
  );
}
