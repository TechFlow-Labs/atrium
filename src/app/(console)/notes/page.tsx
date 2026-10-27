import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { FileText, NotebookPen } from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";
import { ProviderIcon } from "@/components/provider-icon";
import { ScreenLoader } from "@/components/screen-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cn, formatWhen } from "@/lib/utils";
import { getSessionUser } from "@/server/auth/session";
import { workspaceContext } from "@/server/auth/workspace";
import { browseObsidianNotes } from "@/server/notes/service";
import { listWorkspaceNotes } from "@/server/notes/workspace-notes";

export const instant = false;

type NotesSearchParams = {
  q?: string;
  folder?: string;
  path?: string;
  integration?: string;
  note?: string;
};

export default function NotesPage({
  searchParams,
}: {
  searchParams: Promise<NotesSearchParams>;
}) {
  return (
    <Suspense fallback={<ScreenLoader />}>
      <NotesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function NotesContent({
  searchParams,
}: {
  searchParams: Promise<NotesSearchParams>;
}) {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const { current } = await workspaceContext(user.id);
  const canAdmin = current.role === "owner" || current.role === "admin";
  const [feed, saved] = await Promise.all([
    browseObsidianNotes(user.id, current.id, {
      query: params.q,
      folder: params.folder,
      path: params.path,
      integrationId: params.integration,
    }),
    listWorkspaceNotes(user.id, current.id, {
      query: params.q,
      id: params.note,
    }),
  ]);
  const atriumNotes = params.folder ? [] : saved.notes;
  const atriumActive = params.folder ? null : saved.active;
  const folders = [...new Set(feed.notes.map((note) => note.folder).filter(Boolean))].sort();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-4xl">Notes</h1>
          <p className="mt-2 text-sm text-muted">
            Markdown from a connected Obsidian vault, and notes you save from the button at the bottom right.
          </p>
        </div>
        {canAdmin ? (
          <Button asChild variant="outline">
            <Link href="/integrations">Manage Obsidian</Link>
          </Button>
        ) : null}
      </div>

      {feed.connections.length === 0 && atriumNotes.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card px-4 py-10 text-center">
          <NotebookPen className="mx-auto size-8 text-muted" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted">
            No Obsidian vault connected yet.
            {canAdmin
              ? " Connect the LiveSync vault path on Integrations, or write a note with the button at the bottom right."
              : " Ask an owner or admin to connect Obsidian, or save a note with the button at the bottom right."}
          </p>
          {canAdmin ? (
            <Button asChild className="mt-4">
              <Link href="/integrations">Connect Obsidian</Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {feed.errors.length > 0 ? (
        <ul className="space-y-2">
          {feed.errors.map((error) => (
            <li
              key={error.integrationId}
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error.message}
            </li>
          ))}
        </ul>
      ) : null}

      {feed.connections.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {feed.connections.map((connection) => (
            <Badge key={connection.id} tone={connection.status === "connected" ? "connected" : "neutral"}>
              <span className="inline-flex items-center gap-1.5">
                <ProviderIcon provider="obsidian" />
                {connection.displayName}
              </span>
            </Badge>
          ))}
        </div>
      ) : null}

      {feed.connections.length > 0 ? (
        <form data-tour="notes-filters" className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3" method="get">
          {params.path ? <input type="hidden" name="path" value={params.path} /> : null}
          {params.integration ? <input type="hidden" name="integration" value={params.integration} /> : null}
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="notes-q" className="text-xs font-medium text-foreground/70">
              Search
            </label>
            <Input
              id="notes-q"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Filter by title or path"
              className="mt-1"
            />
          </div>
          <div className="min-w-[10rem]">
            <label htmlFor="notes-folder" className="text-xs font-medium text-foreground/70">
              Folder
            </label>
            <select
              id="notes-folder"
              name="folder"
              defaultValue={params.folder ?? ""}
              className="mt-1 flex h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">All folders</option>
              {folders.map((folder) => (
                <option key={folder} value={folder}>
                  {folder}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline">
            Apply
          </Button>
        </form>
      ) : null}

      {feed.connections.length > 0 && feed.notes.length === 0 && atriumNotes.length === 0 && feed.errors.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card px-4 py-8 text-sm text-muted">
          No markdown notes matched. Widen the search or confirm the vault path is readable over your HTTPS proxy.
        </p>
      ) : null}

      {feed.notes.length > 0 || atriumNotes.length > 0 ? (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
          <ul data-tour="notes-list" className="max-h-[70vh] divide-y overflow-y-auto rounded-lg border bg-card lg:max-h-none">
            {atriumNotes.map((note) => {
              const active = atriumActive?.id === note.id;
              const href = `/notes?${new URLSearchParams({
                ...(params.q ? { q: params.q } : {}),
                note: note.id,
              }).toString()}`;
              return (
                <li key={note.id}>
                  <Link
                    href={href}
                    className={cn(
                      "block px-3 py-3 transition hover:bg-accent/40",
                      active && "bg-accent/50",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <NotebookPen className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{note.title}</p>
                        <p className="truncate text-xs text-muted">Saved in Atrium</p>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
            {feed.notes.map((note) => {
              const active = !atriumActive && feed.active?.path === note.path && feed.activeIntegrationId === note.integrationId;
              const href = `/notes?${new URLSearchParams({
                ...(params.q ? { q: params.q } : {}),
                ...(params.folder ? { folder: params.folder } : {}),
                path: note.path,
                integration: note.integrationId,
              }).toString()}`;
              return (
                <li key={`${note.integrationId}:${note.path}`}>
                  <Link
                    href={href}
                    className={cn(
                      "block px-3 py-3 transition hover:bg-accent/40",
                      active && "bg-accent/50",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{note.title}</p>
                        <p className="truncate text-xs text-muted">{note.path}</p>
                        {feed.connections.length > 1 ? (
                          <p className="mt-0.5 truncate text-xs text-muted">{note.integrationName}</p>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          <section data-tour="notes-reader" className="min-h-[20rem] rounded-lg border bg-card">
            {atriumActive ? (
              <div className="flex h-full min-h-0 flex-col">
                <header className="border-b px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted">Note</p>
                      <h2 className="mt-1 text-2xl leading-tight">{atriumActive.title}</h2>
                      <p className="mt-1 truncate text-xs text-muted">Saved in Atrium</p>
                    </div>
                    <NotebookPen className="size-5 text-muted" aria-hidden="true" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge tone="due">Updated {formatWhen(atriumActive.updatedAt)}</Badge>
                  </div>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  <MarkdownContent content={atriumActive.body || "_This note is empty._"} />
                </div>
              </div>
            ) : feed.active ? (
              <div className="flex h-full min-h-0 flex-col">
                <header className="border-b px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted">Note</p>
                      <h2 className="mt-1 text-2xl leading-tight">{feed.active.title}</h2>
                      <p className="mt-1 truncate text-xs text-muted">{feed.active.path}</p>
                    </div>
                    <ProviderIcon provider="obsidian" size="md" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {feed.active.updatedAt ? (
                      <Badge tone="due">Updated {formatWhen(feed.active.updatedAt)}</Badge>
                    ) : null}
                    {feed.active.tags.map((tag) => (
                      <Badge key={tag} tone="project">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  <MarkdownContent content={feed.active.content || "_This note is empty._"} />
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[20rem] flex-col items-center justify-center px-4 py-10 text-center">
                <FileText className="size-8 text-muted" aria-hidden="true" />
                <p className="mt-3 text-sm text-muted">Select a note to read its contents.</p>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
