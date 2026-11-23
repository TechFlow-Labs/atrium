/** Figma comment pins store the layer id as `12:34`. Embed URLs use `12-34`. */
export function figmaEmbedNodeParam(nodeId: string): string {
  return nodeId.trim().replace(/:/g, "-");
}

export function figmaCommentNodeId(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const nodeId = (meta as { node_id?: unknown }).node_id;
  if (typeof nodeId !== "string") return null;
  const trimmed = nodeId.trim();
  return trimmed || null;
}

export function withFigmaEmbedNode(embedUrl: string, nodeId: string | null): string {
  const url = new URL(embedUrl);
  if (nodeId?.trim()) url.searchParams.set("node-id", figmaEmbedNodeParam(nodeId));
  else url.searchParams.delete("node-id");
  return url.toString();
}
