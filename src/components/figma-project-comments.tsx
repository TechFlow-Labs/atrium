"use client";

import { useActionState, useState } from "react";
import { ArrowUp, ExternalLink } from "lucide-react";
import { addFigmaCommentAction, type ActionState } from "@/app/actions";
import { ProviderIcon } from "@/components/provider-icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { cn, formatRelativeWhen, initialsFromName } from "@/lib/utils";
import type { FigmaCommentThread } from "@/server/projects/figma-comments";

const AVATAR_TONES = [
  "bg-sky-600 text-white",
  "bg-emerald-600 text-white",
  "bg-violet-600 text-white",
  "bg-amber-600 text-white",
  "bg-rose-600 text-white",
  "bg-teal-600 text-white",
  "bg-indigo-600 text-white",
] as const;

function avatarTone(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length] ?? AVATAR_TONES[0];
}

function CommentAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = initialsFromName(name) || "?";
  return (
    <span
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tracking-wide",
        size === "sm" ? "size-6" : "size-8 text-xs",
        avatarTone(name),
      )}
    >
      {initials}
    </span>
  );
}

export function FigmaProjectComments({
  workspaceId,
  projectId,
  threads,
  canComment,
  canWrite,
  unavailableReason,
  currentUserName,
  selectedId = null,
  onSelect,
}: {
  workspaceId: string;
  projectId: string;
  threads: FigmaCommentThread[];
  canComment: boolean;
  canWrite: boolean;
  unavailableReason: string | null;
  currentUserName?: string;
  selectedId?: string | null;
  onSelect?: (commentId: string) => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(addFigmaCommentAction, {});
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const showComposer = canWrite && canComment && !unavailableReason;
  const composerName = currentUserName?.trim() || "You";

  return (
    <section className="flex min-h-0 flex-col gap-4" data-tour="project-figma-comments">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">Design comments</h2>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <ProviderIcon provider="figma" className="size-3.5" />
          <span>Figma</span>
        </div>
      </div>

      {unavailableReason ? (
        <p className="rounded-lg border bg-card px-4 py-3 text-sm text-muted">{unavailableReason}</p>
      ) : null}

      {!unavailableReason && threads.length === 0 ? (
        <p className="px-1 text-sm text-muted">No comments on this Figma file yet.</p>
      ) : null}

      {!unavailableReason && threads.length > 0 ? (
        <ul className="space-y-3">
          {threads.map((thread) => (
            <li
              key={thread.root.id}
              className={cn(
                "rounded-lg border bg-card p-3",
                selectedId === thread.root.id && "border-foreground/30 bg-accent/50 ring-2 ring-ring",
              )}
            >
              <CommentBlock
                authorLabel={thread.root.authorLabel}
                createdAt={thread.root.createdAt}
                body={thread.root.body}
                url={thread.root.url}
                resolvedAt={thread.root.resolvedAt}
                selected={selectedId === thread.root.id}
                onSelect={onSelect ? () => onSelect(thread.root.id) : undefined}
              />
              {thread.replies.length > 0 ? (
                <ul className="mt-3 space-y-3 border-l border-border/70 pl-3">
                  {thread.replies.map((reply) => (
                    <li
                      key={reply.id}
                      className={cn(
                        "rounded-md",
                        selectedId === reply.id && "bg-accent/50 ring-2 ring-ring",
                      )}
                    >
                      <CommentBlock
                        authorLabel={reply.authorLabel}
                        createdAt={reply.createdAt}
                        body={reply.body}
                        url={reply.url}
                        resolvedAt={reply.resolvedAt}
                        compact
                        selected={selectedId === reply.id}
                        onSelect={onSelect ? () => onSelect(reply.id) : undefined}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
              {showComposer ? (
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setReplyTo((current) => (current === thread.root.id ? null : thread.root.id))}
                  >
                    {replyTo === thread.root.id ? "Cancel reply" : "Reply"}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {showComposer ? (
        <form action={formAction} className="mt-auto space-y-2">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="returnTo" value={`/projects/${projectId}`} />
          {replyTo ? <input type="hidden" name="parentCommentId" value={replyTo} /> : null}
          <div className="rounded-lg border bg-card focus-within:ring-2 focus-within:ring-ring">
            <div className="flex items-start gap-3 px-3 pt-3">
              <CommentAvatar name={composerName} size="sm" />
              <Textarea
                id="figma-comment-body"
                name="body"
                rows={3}
                required
                maxLength={10000}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={replyTo ? "Reply in Figma…" : "Leave a Figma comment…"}
                aria-label={replyTo ? "Reply to Figma comment" : "Leave a Figma comment"}
                className="min-h-16 resize-none border-0 bg-transparent px-0 py-0.5 shadow-none focus-visible:ring-0"
              />
            </div>
            <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
              <p className="px-1 text-xs text-muted">
                {replyTo ? "Replying to a thread" : "Posts a pin at the canvas origin"}
              </p>
              <Button
                type="submit"
                size="icon"
                disabled={pending || draft.trim().length === 0}
                aria-label={pending ? "Posting comment" : "Post comment to Figma"}
                title="Post to Figma"
              >
                <ArrowUp className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        </form>
      ) : null}

      {canWrite && !canComment && !unavailableReason ? (
        <p className="text-sm text-muted">Comments cannot be added for this Figma file yet.</p>
      ) : null}

      {!canWrite ? (
        <p className="text-sm text-muted">Your role can view design comments. Members and above can post.</p>
      ) : null}
    </section>
  );
}

function CommentBlock({
  authorLabel,
  createdAt,
  body,
  url,
  resolvedAt,
  compact = false,
  selected = false,
  onSelect,
}: {
  authorLabel: string;
  createdAt: string;
  body: string;
  url: string | null;
  resolvedAt: string | null;
  compact?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <div className="flex gap-3">
      <CommentAvatar name={authorLabel} size={compact ? "sm" : "md"} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-sm font-medium">{authorLabel}</p>
          <time
            dateTime={createdAt}
            title={new Date(createdAt).toLocaleString()}
            className="text-xs text-muted"
            suppressHydrationWarning
          >
            {formatRelativeWhen(createdAt)}
          </time>
          {resolvedAt ? <span className="text-xs text-muted">Resolved</span> : null}
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted underline-offset-2 hover:underline"
            >
              Open
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          ) : null}
        </div>
        {onSelect ? (
          <Button
            type="button"
            variant="ghost"
            aria-pressed={selected}
            onClick={onSelect}
            className="mt-1 h-auto w-full justify-start whitespace-normal rounded-md px-1.5 py-1 text-left font-normal"
          >
            <span className="whitespace-pre-wrap text-sm leading-relaxed">{body}</span>
          </Button>
        ) : (
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{body}</p>
        )}
      </div>
    </div>
  );
}
