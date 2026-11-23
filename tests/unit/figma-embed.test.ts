import { describe, expect, it } from "vitest";
import {
  figmaCommentNodeId,
  figmaCommentOffset,
  figmaEmbedNodeParam,
  figmaPinOverlayPoint,
  withFigmaEmbedNode,
} from "@/lib/figma-embed";

describe("figma embed focus", () => {
  it("reads the layer id from a Figma comment pin", () => {
    expect(figmaCommentNodeId({ node_id: "12:34", node_offset: { x: 8, y: 20 } })).toBe("12:34");
    expect(figmaCommentNodeId({ x: 0, y: 0 })).toBeNull();
    expect(figmaCommentNodeId(null)).toBeNull();
  });

  it("points the embed at the comment layer", () => {
    const base = "https://embed.figma.com/design/abc?embed-host=atrium";
    expect(withFigmaEmbedNode(base, "12:34")).toBe(
      "https://embed.figma.com/design/abc?embed-host=atrium&node-id=12-34",
    );
    expect(figmaEmbedNodeParam("1:2")).toBe("1-2");
    expect(withFigmaEmbedNode(`${base}&node-id=9-9`, null)).toBe(base);
  });

  it("places a pin at the center of the fitted frame", () => {
    expect(figmaCommentOffset({ node_id: "1:2", node_offset: { x: 10, y: 20 } })).toEqual({ x: 10, y: 20 });
    expect(
      figmaCommentOffset({ node_id: "1:2", node_offset: { x: 0, y: 0 }, region_width: 40, region_height: 20 }),
    ).toEqual({ x: 20, y: 10 });
    const point = figmaPinOverlayPoint(
      { x: 195, y: 422, nodeWidth: 390, nodeHeight: 844 },
      { width: 800, height: 600 },
    );
    expect(point).not.toBeNull();
    expect(point!.x).toBeGreaterThan(350);
    expect(point!.x).toBeLessThan(450);
    expect(point!.y).toBeGreaterThan(250);
    expect(point!.y).toBeLessThan(350);
  });
});
