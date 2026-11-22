import { describe, expect, it } from "vitest";
import { authRedirect, isPublicPath, safeNextPath } from "./auth-routes";

describe("authRedirect", () => {
  it("sends unauthenticated visitors to login, keeping the destination", () => {
    expect(authRedirect("/", "", false)).toBe("/login");
    expect(authRedirect("/tasks", "?status=todo", false)).toBe(
      "/login?next=%2Ftasks%3Fstatus%3Dtodo",
    );
  });

  it("lets unauthenticated visitors reach the login page", () => {
    expect(authRedirect("/login", "", false)).toBeNull();
  });

  it("sends authenticated users away from login", () => {
    expect(authRedirect("/login", "", true)).toBe("/");
    expect(authRedirect("/tasks", "", true)).toBeNull();
  });

  it("doesn't treat look-alike paths as public", () => {
    expect(isPublicPath("/login-admin")).toBe(false);
    expect(authRedirect("/login-admin", "", false)).toBe("/login?next=%2Flogin-admin");
  });
});

describe("safeNextPath", () => {
  it.each([
    [null, "/"],
    ["", "/"],
    ["/tasks?x=1", "/tasks?x=1"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["tasks", "/"],
    ["/login?next=/x", "/"],
  ])("%s → %s", (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });
});
