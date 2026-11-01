"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Link2, Search, X } from "lucide-react";
import {
  addTaskLinkAction,
  removeTaskLinkAction,
  searchTasksForLinkAction,
  type ActionState,
} from "@/app/actions";
import { ProviderIcon } from "@/components/provider-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { MenuSelect } from "@/components/ui/menu-select";
import { Radio } from "@/components/ui/radio";
import { cn } from "@/lib/utils";
import type { TaskLinkRelation, TaskLinkView } from "@/server/tasks/links";

const RELATION_SECTIONS: Array<{ relation: TaskLinkRelation; label: string }> = [
  { relation: "blocks", label: "Blocks" },
  { relation: "blocked_by", label: "Blocked by" },
  { relation: "relates_to", label: "Relates to" },
  { relation: "duplicates", label: "Duplicates" },
  { relation: "duplicated_by", label: "Duplicated by" },
];

const LINK_TYPE_OPTIONS = [
  { value: "blocks", label: "Blocks" },
  { value: "relates_to", label: "Relates to" },
  { value: "duplicate", label: "Duplicates" },
];

type SearchHit = {
  id: string;
  title: string;
  status: string;
  priority: string;
  provider: string | null;
  projectName: string;
};

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export function TaskLinks({
  workspaceId,
  taskId,
  links,
  canWrite,
}: {
  workspaceId: string;
  taskId: string;
  links: TaskLinkView[];
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(addTaskLinkAction, {});
  const [linkType, setLinkType] = useState("blocks");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      startSearch(async () => {
        const result = await searchTasksForLinkAction(workspaceId, taskId, query);
        if (cancelled) return;
        if ("error" in result) {
          setSearchError(result.error);
          setHits([]);
          return;
        }
        setSearchError(null);
        setHits(result.tasks);
        setSelectedId((current) =>
          result.tasks.some((task) => task.id === current) ? current : (result.tasks[0]?.id ?? ""),
        );
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [workspaceId, taskId, query]);

  const grouped = useMemo(() => {
    const map = new Map<TaskLinkRelation, TaskLinkView[]>();
    for (const section of RELATION_SECTIONS) map.set(section.relation, []);
    for (const link of links) {
      const bucket = map.get(link.relation) ?? [];
      bucket.push(link);
      map.set(link.relation, bucket);
    }
    return map;
  }, [links]);

  const selected = hits.find((hit) => hit.id === selectedId) ?? hits[0] ?? null;
  const hasAnyLinks = links.length > 0;

  return (
    <section className="flex min-h-0 flex-col gap-4 border-b border-border/70 pb-5">
      <div className="flex items-center gap-2">
        <Link2 className="size-4 text-muted" aria-hidden="true" />
        <h2 className="text-base font-semibold tracking-tight">Relationships</h2>
      </div>

      {!hasAnyLinks ? (
        <p className="px-1 text-sm text-muted">No linked tasks yet.</p>
      ) : (
        <div className="space-y-4">
          {RELATION_SECTIONS.map((section) => {
            const items = grouped.get(section.relation) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={section.relation} className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted">{section.label}</h3>
                <ul className="space-y-2">
                  {items.map((link) => (
                    <li
                      key={`${link.id}-${link.relation}`}
                      className="flex items-start gap-2 rounded-lg border bg-card px-3 py-2.5"
                    >
                      <ProviderIcon provider={link.provider} className="mt-0.5 size-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/tasks/${link.taskId}`}
                          className="block truncate text-sm font-medium underline-offset-2 hover:underline"
                        >
                          {link.title}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge tone={link.status}>{statusLabel(link.status)}</Badge>
                          <span className="text-xs text-muted">{link.projectName}</span>
                        </div>
                      </div>
                      {canWrite ? (
                        <form action={removeTaskLinkAction}>
                          <input type="hidden" name="workspaceId" value={workspaceId} />
                          <input type="hidden" name="taskId" value={taskId} />
                          <input type="hidden" name="relatedTaskId" value={link.taskId} />
                          <input type="hidden" name="linkId" value={link.id} />
                          <input type="hidden" name="returnTo" value={`/tasks/${taskId}`} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon"
                            className="size-7 shrink-0 text-muted hover:text-destructive"
                            aria-label={`Remove ${section.label.toLowerCase()} link`}
                          >
                            <X className="size-3.5" aria-hidden="true" />
                          </Button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {canWrite ? (
        <form action={formAction} className="space-y-3 rounded-lg border bg-card p-3">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="returnTo" value={`/tasks/${taskId}`} />
          <input type="hidden" name="toTaskId" value={selected?.id ?? ""} />

          <div>
            <Label htmlFor="task-link-type">Link type</Label>
            <MenuSelect
              id="task-link-type"
              name="linkType"
              value={linkType}
              onValueChange={setLinkType}
              className="mt-1"
              aria-label="Link type"
              options={LINK_TYPE_OPTIONS}
            />
          </div>

          <div>
            <Label htmlFor="task-link-search">Related task</Label>
            <div className="relative mt-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                id="task-link-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tasks"
                className="pl-9"
              />
            </div>
            {searching ? <p className="mt-2 text-xs text-muted">Searching…</p> : null}
            {searchError ? <p className="mt-2 text-sm text-destructive">{searchError}</p> : null}
            {!searching && !searchError && hits.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No matching tasks.</p>
            ) : null}
            {hits.length > 0 ? (
              <ul className="mt-2 max-h-40 divide-y overflow-auto rounded-lg border">
                {hits.map((hit) => {
                  const checked = selected?.id === hit.id;
                  return (
                    <li key={hit.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm",
                          checked ? "bg-muted/40" : "hover:bg-muted/20",
                        )}
                      >
                        <Radio
                          name="toTaskIdChoice"
                          value={hit.id}
                          checked={checked}
                          onChange={() => setSelectedId(hit.id)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <ProviderIcon provider={hit.provider} className="size-3.5 shrink-0" />
                            <span className="truncate font-medium">{hit.title}</span>
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted">
                            {statusLabel(hit.status)} · {hit.projectName}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <Button type="submit" disabled={pending || !selected} className="w-full">
            {pending ? "Linking…" : "Add link"}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
