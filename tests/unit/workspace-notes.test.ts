import { describe, expect, it } from "vitest";
import { draftNoteTitle } from "@/server/notes/workspace-notes";

describe("draft note titles", () => {
  it("uses an explicit title", () => {
    expect(draftNoteTitle("  Standup notes  ", "ignored")).toBe("Standup notes");
  });

  it("falls back to the first line of the body", () => {
    expect(draftNoteTitle("", "\n## Ship the bridge\nDetails")).toBe("Ship the bridge");
  });

  it("uses Untitled note when both are blank lines", () => {
    expect(draftNoteTitle("   ", "\n\n")).toBe("Untitled note");
  });
});
