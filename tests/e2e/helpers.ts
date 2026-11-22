import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const AUTH_STATE = "tests/e2e/.auth/user.json";

export function e2eCredentials() {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error("Set E2E_EMAIL and E2E_PASSWORD in .env.local (dedicated test user).");
  }
  return { email, password };
}

/** Every authenticated view, in nav order, with its <h1>. */
export const VIEWS = [
  { path: "/", name: "לוח בקרה" },
  { path: "/tasks", name: "משימות" },
  { path: "/projects", name: "פרויקטים" },
  { path: "/calendar", name: "לוח שנה" },
  { path: "/timeline", name: "גאנט" },
  { path: "/planning", name: "תכנון שנתי" },
  { path: "/templates", name: "תבניות" },
  { path: "/settings", name: "הגדרות" },
] as const;

export const ALL_PATHS = [...VIEWS.map((view) => view.path), "/search"] as const;

/** Automated WCAG 2.x A/AA subset. Manual checks (NVDA, zoom, RTL keys) stay separate. */
export async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const summary = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
  );
  expect(summary).toEqual([]);
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Collects console errors and uncaught page errors; assert the list is empty at the end. */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}
