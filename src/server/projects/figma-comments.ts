import { sql } from "drizzle-orm";
import { requireAction } from "../authz/membership";
import { withUser, type Tx } from "../db/client";
import { openCredential, sealCredential } from "../integrations/credentials";
import type { FigmaCommentPin } from "@/lib/figma-embed";
import {
  listFigmaComments,
  postFigmaComment,
  refreshFigmaAccessToken,
  type FigmaComment,
} from "../integrations/figma";
import { resolveOAuthApp } from "../integrations/oauth-apps";
import { credentialNeedsRefresh } from "../integrations/token-refresh";

export type FigmaCommentThread = {
  root: FigmaCommentView;
  replies: FigmaCommentView[];
};

export type FigmaCommentView = {
  id: string;
  body: string;
  authorLabel: string;
  createdAt: string;
  resolvedAt: string | null;
  url: string | null;
  nodeId: string | null;
  pin: FigmaCommentPin | null;
};

export type ProjectFigmaCommentsResult = {
  fileKey: string | null;
  fileName: string | null;
  fileUrl: string | null;
  embedUrl: string | null;
  threads: FigmaCommentThread[];
  canComment: boolean;
  unavailableReason: string | null;
};

function toView(comment: FigmaComment, nodeId = comment.nodeId, pin = comment.pin): FigmaCommentView {
  return {
    id: comment.id,
    body: comment.message,
    authorLabel: comment.authorLabel,
    createdAt: comment.createdAt,
    resolvedAt: comment.resolvedAt,
    url: comment.url,
    nodeId,
    pin,
  };
}

function threadComments(comments: FigmaComment[]): FigmaCommentThread[] {
  const roots = comments.filter((comment) => !comment.parentId);
  const byParent = new Map<string, FigmaComment[]>();
  for (const comment of comments) {
    if (!comment.parentId) continue;
    const list = byParent.get(comment.parentId) ?? [];
    list.push(comment);
    byParent.set(comment.parentId, list);
  }
  return roots.map((root) => ({
    root: toView(root),
    replies: (byParent.get(root.id) ?? []).map((reply) =>
      toView(reply, reply.nodeId ?? root.nodeId, reply.pin ?? root.pin),
    ),
  }));
}

async function loadFigmaAccessToken(
  tx: Tx,
  workspaceId: string,
): Promise<{ accessToken: string; integrationId: string } | null> {
  const rows = await tx.execute<{
    id: string;
    credential_ciphertext: string | null;
  }>(sql`
    select id, credential_ciphertext from integrations
    where workspace_id = ${workspaceId}::uuid
      and provider = 'figma'
      and status = 'connected'
      and credential_ciphertext is not null
    order by last_validated_at desc nulls last, display_name
    limit 1
  `);
  const row = rows[0];
  if (!row?.credential_ciphertext) return null;
  let credentials = openCredential(row.credential_ciphertext);
  if (!credentials?.accessToken) return null;
  if (credentialNeedsRefresh(credentials)) {
    const app = await resolveOAuthApp(tx, workspaceId, "figma");
    if (app) {
      credentials = await refreshFigmaAccessToken(credentials, app);
      await tx.execute(sql`
        update integrations
        set credential_ciphertext = ${sealCredential(credentials)},
            last_error = null,
            status = 'connected',
            last_validated_at = now()
        where id = ${row.id}::uuid
      `);
    }
  }
  return { accessToken: credentials.accessToken, integrationId: row.id };
}

export async function listProjectFigmaComments(
  userId: string,
  workspaceId: string,
  projectId: string,
): Promise<ProjectFigmaCommentsResult> {
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");
    const projects = await tx.execute<{
      figma_file_key: string | null;
      figma_file_name: string | null;
      figma_file_url: string | null;
      figma_embed_kind: string | null;
    }>(sql`
      select figma_file_key, figma_file_name, figma_file_url, figma_embed_kind
      from projects
      where id = ${projectId}::uuid and workspace_id = ${workspaceId}::uuid
      limit 1
    `);
    const project = projects[0];
    if (!project) {
      return {
        fileKey: null,
        fileName: null,
        fileUrl: null,
        embedUrl: null,
        threads: [],
        canComment: false,
        unavailableReason: "Project not found",
      };
    }
    const { figmaEmbedUrl } = await import("../integrations/figma");
    const fileKey = project.figma_file_key;
    const embedKind =
      project.figma_embed_kind === "board" ||
      project.figma_embed_kind === "proto" ||
      project.figma_embed_kind === "file" ||
      project.figma_embed_kind === "design"
        ? project.figma_embed_kind
        : "design";
    const embedUrl = fileKey ? figmaEmbedUrl(fileKey, embedKind) : null;
    if (!fileKey) {
      return {
        fileKey: null,
        fileName: null,
        fileUrl: null,
        embedUrl: null,
        threads: [],
        canComment: false,
        unavailableReason: "Link a Figma file in Manage to show design comments.",
      };
    }
    const auth = await loadFigmaAccessToken(tx, workspaceId);
    if (!auth) {
      return {
        fileKey,
        fileName: project.figma_file_name,
        fileUrl: project.figma_file_url,
        embedUrl,
        threads: [],
        canComment: false,
        unavailableReason: "Connect Figma under Integrations to load and post design comments.",
      };
    }
    try {
      const comments = await listFigmaComments(auth.accessToken, fileKey);
      return {
        fileKey,
        fileName: project.figma_file_name,
        fileUrl: project.figma_file_url,
        embedUrl,
        threads: threadComments(comments),
        canComment: true,
        unavailableReason: null,
      };
    } catch (error) {
      return {
        fileKey,
        fileName: project.figma_file_name,
        fileUrl: project.figma_file_url,
        embedUrl,
        threads: [],
        canComment: false,
        unavailableReason: error instanceof Error ? error.message : "Could not load Figma comments",
      };
    }
  });
}

export async function addProjectFigmaComment(
  userId: string,
  workspaceId: string,
  projectId: string,
  input: { body: string; parentCommentId?: string | null },
): Promise<void> {
  const body = input.body.trim();
  if (!body) throw new Error("Enter a comment");
  if (body.length > 10000) throw new Error("Comment is too long");
  await withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.write");
    const projects = await tx.execute<{ figma_file_key: string | null }>(sql`
      select figma_file_key from projects
      where id = ${projectId}::uuid and workspace_id = ${workspaceId}::uuid
      limit 1
    `);
    const fileKey = projects[0]?.figma_file_key;
    if (!fileKey) throw new Error("Link a Figma file before commenting");
    const auth = await loadFigmaAccessToken(tx, workspaceId);
    if (!auth) throw new Error("Connect Figma under Integrations before commenting");
    await postFigmaComment(auth.accessToken, {
      fileKey,
      message: body,
      parentCommentId: input.parentCommentId,
    });
  });
}
