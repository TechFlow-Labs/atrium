import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_TOUR, GUIDES, guideIdForPath, resolveGuide } from "@/lib/screen-guides";

// Console routes that only redirect and never render, so they need no guide.
const REDIRECT_ONLY_ROUTES = new Set(["calendar"]);

// Every data-tour="..." attribute declared in the source tree.
function declaredTourTargets(): Set<string> {
  const root = path.resolve(__dirname, "../../src");
  const targets = new Set<string>();
  for (const file of readdirSync(root, { recursive: true }).map(String)) {
    if (!/\.(tsx?|jsx?)$/.test(file)) continue;
    const source = readFileSync(path.join(root, file), "utf8");
    for (const match of source.matchAll(/data-tour="([^"]+)"/g)) targets.add(match[1]);
  }
  return targets;
}

function consoleRoutes(): string[] {
  const root = path.resolve(__dirname, "../../src/app/(console)");
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith("page.tsx"))
    .map((file) => path.dirname(file).split(path.sep).filter((segment) => !segment.startsWith("(")))
    .map((segments) => `/${segments.map((segment) => segment.replace(/^\[.*\]$/, "sample")).join("/")}`)
    .map((route) => (route === "/" ? "/home" : route));
}

describe("screen guides", () => {
  it("gives every console screen a guide definition", () => {
    const missing = consoleRoutes().filter((route) => {
      const first = route.split("/").filter(Boolean)[0] ?? "";
      if (REDIRECT_ONLY_ROUTES.has(first)) return false;
      return guideIdForPath(route) === null;
    });
    expect(missing).toEqual([]);
  });

  it("has a one-off app tour with navigation hrefs", () => {
    expect(APP_TOUR.id).toBe("app");
    expect(APP_TOUR.version).toBeGreaterThan(0);
    expect(APP_TOUR.tour.length).toBeGreaterThan(5);
    expect(APP_TOUR.tour.every((step) => Boolean(step.href))).toBe(true);
    expect(resolveGuide(APP_TOUR.id, APP_TOUR.version)?.id).toBe("app");
    expect(resolveGuide(APP_TOUR.id, APP_TOUR.version + 1)).toBeNull();
  });

  it("has consistent guide entries", () => {
    for (const [key, guide] of Object.entries(GUIDES)) {
      expect(guide.id).toBe(key);
      expect(Number.isInteger(guide.version)).toBe(true);
      expect(guide.version).toBeGreaterThan(0);
      expect(guide.title.length).toBeGreaterThan(0);
      expect(guide.tour.length).toBeGreaterThan(0);
    }
  });

  it("points every tour step at a data-tour target in the source", () => {
    const declared = declaredTourTargets();
    const missing = [
      ...APP_TOUR.tour.filter((step) => !declared.has(step.target)).map((step) => `app: ${step.target}`),
      ...Object.values(GUIDES).flatMap((guide) =>
        guide.tour.filter((step) => !declared.has(step.target)).map((step) => `${guide.id}: ${step.target}`),
      ),
    ];
    expect(missing).toEqual([]);
  });

  it("maps list and detail paths to their guides", () => {
    expect(guideIdForPath("/home")).toBe("home");
    expect(guideIdForPath("/tasks")).toBe("tasks");
    expect(guideIdForPath("/tasks/abc")).toBe("task");
    expect(guideIdForPath("/projects/abc")).toBe("project");
    expect(guideIdForPath("/integrations/abc")).toBe("integration");
    expect(guideIdForPath("/schedule")).toBe("schedule");
  });

  it("returns null for paths outside the console", () => {
    expect(guideIdForPath("/login")).toBeNull();
    expect(guideIdForPath("/")).toBeNull();
    expect(guideIdForPath("/constructor")).toBeNull();
  });
});
