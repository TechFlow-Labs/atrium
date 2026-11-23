import { figmaCommentNodeId, figmaEmbedNodeParam } from "@/lib/figma-embed";
import { providerFetch } from "./http";
import { ProviderError, type StoredCredential } from "./types";

/** Scopes requested by Continue with Figma. Space-separated on the authorize URL. */
export const FIGMA_OAUTH_SCOPES = [
  "current_user:read",
  "file_comments:read",
  "file_comments:write",
  "file_metadata:read",
] as const;

export type FigmaEmbedKind = "design" | "board" | "proto" | "file";

export type ParsedFigmaFile = {
  fileKey: string;
  embedKind: FigmaEmbedKind;
  editUrl: string;
  embedUrl: string;
};

export type FigmaComment = {
  id: string;
  message: string;
  parentId: string | null;
  authorLabel: string;
  authorId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  url: string | null;
  /** Layer the pin is attached to, in Figma's `12:34` form. Null for a loose canvas pin. */
  nodeId: string | null;
};

type FigmaApiError = {
  status?: number;
  err?: string;
  message?: string;
};

async function figmaGet<T>(accessToken: string, path: string): Promise<T> {
  const response = await providerFetch(`https://api.figma.com${path}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
  let data: T & FigmaApiError;
  try {
    data = (await response.json()) as T & FigmaApiError;
  } catch {
    throw new ProviderError("Figma returned an invalid response", "unavailable", true, response.status);
  }
  if (!response.ok) {
    throw figmaHttpError(response.status, data);
  }
  return data;
}

async function figmaPost<T>(accessToken: string, path: string, body: unknown): Promise<T> {
  const response = await providerFetch(`https://api.figma.com${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  let data: T & FigmaApiError;
  try {
    data = (await response.json()) as T & FigmaApiError;
  } catch {
    throw new ProviderError("Figma returned an invalid response", "unavailable", true, response.status);
  }
  if (!response.ok) {
    throw figmaHttpError(response.status, data);
  }
  return data;
}

function figmaHttpError(status: number, data: FigmaApiError): ProviderError {
  const message = data.err || data.message || `Figma error (${status})`;
  if (status === 401 || status === 403) {
    return new ProviderError(message, "unauthorized", false, status);
  }
  if (status === 429) {
    return new ProviderError("Figma rate limited this request", "rate_limited", true, status);
  }
  return new ProviderError(message, "unavailable", true, status);
}

export function parseFigmaFileInput(raw: string): ParsedFigmaFile {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Paste a Figma file URL or file key");

  let url: URL | null = null;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    url = null;
  }

  if (!url) {
    if (!/^[a-zA-Z0-9_-]{6,255}$/.test(trimmed)) {
      throw new Error("Paste a Figma file URL (figma.com/design/…) or a file key");
    }
    return {
      fileKey: trimmed,
      embedKind: "design",
      editUrl: figmaEditUrl(trimmed, "design"),
      embedUrl: figmaEmbedUrl(trimmed, "design"),
    };
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host !== "figma.com" && host !== "embed.figma.com") {
    throw new Error("Use a figma.com file URL");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  // /design/:key/… | /file/:key/… | /board/:key/… | /proto/:key/… | embed host same shape
  const kindIndex = parts.findIndex((part) => part === "design" || part === "file" || part === "board" || part === "proto");
  if (kindIndex < 0 || !parts[kindIndex + 1]) {
    throw new Error("Could not find a Figma file key in that URL");
  }
  const pathKind = parts[kindIndex] as "design" | "file" | "board" | "proto";
  const fileKey = parts[kindIndex + 1];
  if (!/^[a-zA-Z0-9_-]{6,255}$/.test(fileKey)) {
    throw new Error("That Figma URL does not include a valid file key");
  }
  const embedKind: FigmaEmbedKind = pathKind === "file" ? "file" : pathKind;
  const editUrl =
    host === "embed.figma.com"
      ? figmaEditUrl(fileKey, embedKind)
      : `${url.origin}${url.pathname}${url.search}`;
  return {
    fileKey,
    embedKind,
    editUrl,
    embedUrl: figmaEmbedUrl(fileKey, embedKind),
  };
}

export function figmaEditUrl(fileKey: string, kind: FigmaEmbedKind): string {
  const pathKind = kind === "file" ? "file" : kind;
  return `https://www.figma.com/${pathKind}/${encodeURIComponent(fileKey)}`;
}

export function figmaEmbedUrl(fileKey: string, kind: FigmaEmbedKind, nodeId?: string | null): string {
  const pathKind = kind === "file" ? "design" : kind;
  const url = new URL(`https://embed.figma.com/${pathKind}/${encodeURIComponent(fileKey)}`);
  // Figma leaves the embed on the logo until this host id is present.
  url.searchParams.set("embed-host", "atrium");
  if (nodeId?.trim()) url.searchParams.set("node-id", figmaEmbedNodeParam(nodeId));
  return url.toString();
}

function figmaCommentLink(fileKey: string, nodeId: string | null, commentId: string): string {
  const edit = new URL(figmaEditUrl(fileKey, "design"));
  if (nodeId) edit.searchParams.set("node-id", figmaEmbedNodeParam(nodeId));
  edit.hash = commentId;
  return edit.toString();
}

function toFigmaComment(comment: FigmaCommentNode & { id: string }, fileKey: string, fallbackMessage = ""): FigmaComment {
  const nodeId = figmaCommentNodeId(comment.client_meta);
  return {
    id: comment.id,
    message: (comment.message ?? fallbackMessage).trim(),
    parentId: comment.parent_id?.trim() || null,
    authorLabel: comment.user?.handle?.trim() || comment.user?.name?.trim() || "Figma",
    authorId: comment.user?.id != null ? String(comment.user.id) : null,
    createdAt: comment.created_at ?? new Date().toISOString(),
    resolvedAt: comment.resolved_at ?? null,
    url: figmaCommentLink(fileKey, nodeId, comment.id),
    nodeId,
  };
}

type FigmaTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user_id_string?: string;
  error?: string;
  message?: string;
};

export async function exchangeFigmaCode(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<StoredCredential> {
  const body = new URLSearchParams({
    redirect_uri: input.redirectUri,
    code: input.code,
    grant_type: "authorization_code",
  });
  const response = await fetch("https://api.figma.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64")}`,
    },
    body,
  });
  const json = (await response.json()) as FigmaTokenResponse;
  if (!response.ok || !json.access_token) {
    throw new Error(json.message ?? json.error ?? "Figma did not return an access token");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : undefined,
  };
}

export async function refreshFigmaAccessToken(
  credential: StoredCredential,
  app: { clientId: string; clientSecret: string },
): Promise<StoredCredential> {
  const refreshToken = credential.refreshToken;
  if (!refreshToken) {
    throw new ProviderError("Figma access token expired. Connect Figma again.", "unauthorized", false);
  }
  const body = new URLSearchParams({
    refresh_token: refreshToken,
  });
  const response = await fetch("https://api.figma.com/v1/oauth/refresh", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString("base64")}`,
    },
    body,
  });
  const json = (await response.json()) as FigmaTokenResponse;
  if (!response.ok || !json.access_token) {
    throw new ProviderError(
      json.message ?? json.error ?? "Figma could not refresh the access token. Connect Figma again.",
      "unauthorized",
      false,
    );
  }
  return {
    ...credential,
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : credential.expiresAt,
  };
}

export async function validateFigmaConnection(accessToken: string): Promise<{
  externalAccountId: string;
  accountLabel: string;
}> {
  const data = await figmaGet<{
    id?: string | number;
    handle?: string;
    email?: string;
  }>(accessToken, "/v1/me");
  const id = data.id != null ? String(data.id) : data.email?.trim() || "figma";
  const label = data.handle?.trim() || data.email?.trim() || "Figma";
  return { externalAccountId: id, accountLabel: label };
}

export async function getFigmaFileMeta(
  accessToken: string,
  fileKey: string,
): Promise<{ name: string }> {
  const data = await figmaGet<{ name?: string }>(
    accessToken,
    `/v1/files/${encodeURIComponent(fileKey)}?depth=1`,
  );
  return { name: data.name?.trim() || fileKey };
}

type FigmaCommentNode = {
  id?: string;
  message?: string;
  parent_id?: string | null;
  created_at?: string;
  resolved_at?: string | null;
  user?: { id?: string | number; handle?: string; name?: string };
  client_meta?: unknown;
  order_id?: string;
};

export async function listFigmaComments(accessToken: string, fileKey: string): Promise<FigmaComment[]> {
  const data = await figmaGet<{ comments?: FigmaCommentNode[] }>(
    accessToken,
    `/v1/files/${encodeURIComponent(fileKey)}/comments`,
  );
  return (data.comments ?? [])
    .filter((comment): comment is FigmaCommentNode & { id: string } => Boolean(comment.id))
    .map((comment) => toFigmaComment(comment, fileKey))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export async function postFigmaComment(
  accessToken: string,
  input: { fileKey: string; message: string; parentCommentId?: string | null },
): Promise<FigmaComment> {
  const message = input.message.trim();
  if (!message) throw new Error("Enter a comment");
  const body: Record<string, unknown> = { message };
  if (input.parentCommentId?.trim()) {
    body.comment_id = input.parentCommentId.trim();
  } else {
    // Root comments need a canvas position; pin at origin when Atrium has no pin picker.
    body.client_meta = { x: 0, y: 0 };
  }
  const data = await figmaPost<FigmaCommentNode>(
    accessToken,
    `/v1/files/${encodeURIComponent(input.fileKey)}/comments`,
    body,
  );
  if (!data.id) throw new Error("Figma did not return the new comment");
  const comment = toFigmaComment({ ...data, id: data.id }, input.fileKey, message);
  return {
    ...comment,
    parentId: comment.parentId || input.parentCommentId?.trim() || null,
  };
}
