"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { FigmaProjectComments } from "@/components/figma-project-comments";
import { FigmaProjectEmbed } from "@/components/figma-project-embed";
import { ProviderIcon } from "@/components/provider-icon";
import { Button } from "@/components/ui/button";
import { withFigmaEmbedNode } from "@/lib/figma-embed";
import { cn } from "@/lib/utils";
import type { FigmaCommentThread, FigmaCommentView } from "@/server/projects/figma-comments";

function findComment(threads: FigmaCommentThread[], commentId: string | null): FigmaCommentView | null {
  if (!commentId) return null;
  for (const thread of threads) {
    if (thread.root.id === commentId) return thread.root;
    const reply = thread.replies.find((item) => item.id === commentId);
    if (reply) return reply;
  }
  return null;
}

export function FigmaProjectPanel({
  fileName,
  editUrl,
  embedUrl,
  workspaceId,
  projectId,
  threads,
  canComment,
  canWrite,
  unavailableReason,
  currentUserName,
}: {
  fileName: string | null;
  editUrl: string;
  embedUrl: string;
  workspaceId: string;
  projectId: string;
  threads: FigmaCommentThread[];
  canComment: boolean;
  canWrite: boolean;
  unavailableReason: string | null;
  currentUserName?: string;
}) {
  const [open, setOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = findComment(threads, selectedId);
  const focusedEmbedUrl = useMemo(
    () => withFigmaEmbedNode(embedUrl, selected?.nodeId ?? null),
    [embedUrl, selected?.nodeId],
  );

  function selectComment(commentId: string) {
    setSelectedId(commentId);
    document.getElementById("project-figma-embed")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <section className="rounded-xl border bg-card" data-tour="project-figma">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          aria-expanded={open}
          aria-controls="project-figma-panel"
          onClick={() => setOpen((current) => !current)}
          className="h-auto min-w-0 flex-1 justify-start px-2 py-1.5"
        >
          <ProviderIcon provider="figma" className="size-5 shrink-0" />
          <span className="font-medium">Figma</span>
          <ChevronDown
            className={cn("ml-auto size-4 shrink-0 text-muted transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={editUrl} target="_blank" rel="noopener noreferrer">
            Edit in Figma
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </Button>
      </div>
      {open ? (
        <div id="project-figma-panel" className="space-y-4 border-t p-4">
          <FigmaProjectEmbed
            fileName={fileName}
            embedUrl={focusedEmbedUrl}
            focusKey={selected?.nodeId ?? "file"}
            pin={selected?.pin ?? null}
            pulseKey={selectedId ?? ""}
          />
          <FigmaProjectComments
            workspaceId={workspaceId}
            projectId={projectId}
            threads={threads}
            canComment={canComment}
            canWrite={canWrite}
            unavailableReason={unavailableReason}
            currentUserName={currentUserName}
            selectedId={selectedId}
            onSelect={selectComment}
          />
        </div>
      ) : null}
    </section>
  );
}
