import { Suspense } from "react";
import { ScreenLoader } from "@/components/screen-loader";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ProviderIcon } from "@/components/provider-icon";
import { Badge } from "@/components/ui/badge";
import { getSessionUser } from "@/server/auth/session";
import { workspaceContext } from "@/server/auth/workspace";
import { searchWorkspace } from "@/server/home/service";

export const instant = false;

export default function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return (
    <Suspense fallback={<ScreenLoader />}>
      <SearchContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SearchContent({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const query = (await searchParams).q ?? "";
  const { current } = await workspaceContext(user.id);
  const results = query.trim().length >= 2 ? await searchWorkspace(user.id, current.id, query) : { projects: [], tasks: [] };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl">Search</h1>
        <p className="mt-1 text-sm text-muted">Results stay inside {current.name}. Other workspaces are not included.</p>
      </div>
      <form data-tour="search-input" action="/search" className="flex gap-2">
        <label className="sr-only" htmlFor="q">Search query</label>
        <input id="q" name="q" defaultValue={query} className="h-10 w-full rounded-md border bg-card px-3 text-sm" />
        <button className="rounded-md border bg-card px-3 text-sm" type="submit">Search</button>
      </form>
      {query.trim().length < 2 ? <p className="text-sm text-muted">Type at least two characters.</p> : null}
      {query.trim().length >= 2 && results.projects.length === 0 && results.tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card p-6 text-sm text-muted">Nothing in this workspace matches “{query.trim()}”.</p>
      ) : null}
      {results.projects.length > 0 ? (
        <section data-tour="search-results">
          <h2 className="text-xl">Projects</h2>
          <ul className="mt-2 divide-y rounded-lg border bg-card">
            {results.projects.map((project) => (
              <li key={String(project.id)} className="flex items-center justify-between px-3 py-3 text-sm">
                <Link href={`/projects/${String(project.id)}`} className="font-medium underline">{String(project.name)}</Link>
                <Badge tone={project.ownership_mode === "native" ? "native" : "external"}>{String(project.ownership_mode)}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {results.tasks.length > 0 ? (
        <section>
          <h2 className="text-xl">Issues</h2>
          <ul className="mt-2 divide-y rounded-lg border bg-card">
            {results.tasks.map((task) => (
              <li key={String(task.id)} className="flex items-center justify-between px-3 py-3 text-sm">
                <Link href={`/tasks/${String(task.id)}`} className="font-medium underline">{String(task.title)}</Link>
                <ProviderIcon provider={task.provider as string | null} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
