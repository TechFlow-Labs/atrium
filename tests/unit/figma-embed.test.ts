import { describe, expect, it } from "vitest";
import { figmaCommentNodeId, figmaEmbedNodeParam, withFigmaEmbedNode } from "@/lib/figma-embed";

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
});
