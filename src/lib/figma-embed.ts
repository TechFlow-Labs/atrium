/** Figma comment pins store the layer id as `12:34`. Embed URLs use `12-34`. */
export function figmaEmbedNodeParam(nodeId: string): string {
  return nodeId.trim().replace(/:/g, "-");
}

/** Design-pixel position of a pin inside the layer the embed is showing. */
export type FigmaCommentPin = {
  x: number;
  y: number;
  nodeWidth: number;
  nodeHeight: number;
};

/** Header and footer the embed draws around the fitted frame. */
const EMBED_CHROME = { top: 44, bottom: 36, pad: 8 };

export function figmaCommentOffset(meta: unknown): { x: number; y: number } | null {
  if (!meta || typeof meta !== "object") return null;
  const record = meta as Record<string, unknown>;
  const raw = record.node_offset;
  if (!raw || typeof raw !== "object") return null;
  const point = raw as { x?: unknown; y?: unknown };
  if (typeof point.x !== "number" || typeof point.y !== "number") return null;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const regionW = typeof record.region_width === "number" ? record.region_width : 0;
  const regionH = typeof record.region_height === "number" ? record.region_height : 0;
  return { x: point.x + regionW / 2, y: point.y + regionH / 2 };
}

/** Map a pin onto the iframe, matching how Figma fits the focused layer between its chrome. */
export function figmaPinOverlayPoint(
  pin: FigmaCommentPin,
  viewport: { width: number; height: number },
): { x: number; y: number } | null {
  if (pin.nodeWidth <= 0 || pin.nodeHeight <= 0 || viewport.width <= 0 || viewport.height <= 0) return null;
  const availW = viewport.width - EMBED_CHROME.pad * 2;
  const availH = viewport.height - EMBED_CHROME.top - EMBED_CHROME.bottom - EMBED_CHROME.pad * 2;
  if (availW <= 0 || availH <= 0) return null;
  const scale = Math.min(availW / pin.nodeWidth, availH / pin.nodeHeight);
  const left = EMBED_CHROME.pad + (availW - pin.nodeWidth * scale) / 2;
  const top = EMBED_CHROME.top + EMBED_CHROME.pad + (availH - pin.nodeHeight * scale) / 2;
  const x = left + pin.x * scale;
  const y = top + pin.y * scale;
  if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) return null;
  return { x, y };
}

/** Center of the area where Figma draws the fitted frame, under the embed chrome. */
export function figmaEmbedCanvasCenter(viewport: { width: number; height: number }): { x: number; y: number } {
  const height = Math.max(0, viewport.height - EMBED_CHROME.top - EMBED_CHROME.bottom);
  return {
    x: viewport.width / 2,
    y: EMBED_CHROME.top + height / 2,
  };
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
