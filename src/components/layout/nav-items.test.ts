import { describe, expect, it } from "vitest";
import { isCurrentPath, MAIN_NAV } from "./nav-items";

describe("isCurrentPath", () => {
  it("matches the Dashboard only at the root", () => {
    expect(isCurrentPath("/", "/")).toBe(true);
    expect(isCurrentPath("/", "/tasks")).toBe(false);
  });

  it("matches a view and its sub-paths, not look-alikes", () => {
    expect(isCurrentPath("/tasks", "/tasks")).toBe(true);
    expect(isCurrentPath("/tasks", "/tasks/123")).toBe(true);
    expect(isCurrentPath("/tasks", "/tasks-archive")).toBe(false);
  });

  it("has unique hrefs", () => {
    const hrefs = MAIN_NAV.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
