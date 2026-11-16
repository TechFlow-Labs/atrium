import { describe, expect, it } from "vitest";
import { parseSidebarGroups, parseSidebarOrder } from "@/components/app-sidebar";

describe("sidebar cookies", () => {
  it("parses custom order and migrates calendar to schedule and tasks to issues", () => {
    expect(parseSidebarOrder("/home,/calendar,/notes")).toContain("/schedule");
    expect(parseSidebarOrder("/home,/calendar,/notes")).not.toContain("/calendar");
    expect(parseSidebarOrder("/home,/tasks,/projects")).toContain("/issues");
    expect(parseSidebarOrder("/home,/tasks,/projects")).not.toContain("/tasks");
  });

  it("inserts products into older sidebar cookies before projects", () => {
    const order = parseSidebarOrder("/home,/projects,/issues,/schedule,/chats,/notes");
    expect(order.indexOf("/products")).toBeGreaterThan(order.indexOf("/home"));
    expect(order.indexOf("/products")).toBeLessThan(order.indexOf("/projects"));
  });

  it("parses group open state with defaults", () => {
    expect(parseSidebarGroups(undefined)).toEqual({
      work: true,
      inbox: true,
      connect: false,
      manage: false,
    });
    expect(parseSidebarGroups("connect:1,manage:open,work:0")).toEqual({
      work: false,
      inbox: true,
      connect: true,
      manage: true,
    });
  });
});
