"use client";

import { useMemo, useState } from "react";
import { FigmaProjectComments } from "@/components/figma-project-comments";
import { FigmaProjectEmbed } from "@/components/figma-project-embed";
import { withFigmaEmbedNode } from "@/lib/figma-embed";
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
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <FigmaProjectEmbed
        fileName={fileName}
        editUrl={editUrl}
        embedUrl={focusedEmbedUrl}
        focusKey={selected?.nodeId ?? "file"}
      />
      <div className="rounded-xl border bg-card p-4">
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
    </section>
  );
}
