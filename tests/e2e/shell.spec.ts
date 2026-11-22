import { expect, test } from "@playwright/test";
import { ALL_PATHS, VIEWS, expectNoAxeViolations, expectNoHorizontalScroll } from "./helpers";

test.describe("desktop sidebar (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("skip link is first and moves focus to the main content", async ({ page }) => {
    await page.goto("/tasks");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "דלג לתוכן הראשי" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });

  test("every nav item works by keyboard, with aria-current and focus on <h1>", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "ניווט ראשי" });

    for (const view of [...VIEWS.slice(1), VIEWS[0]]) {
      const link = nav.getByRole("link", { name: view.name, exact: true });
      await link.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp(`${view.path === "/" ? "/" : view.path}$`));

      const heading = page.getByRole("heading", { level: 1, name: view.name });
      await expect(heading).toBeFocused();
      await expect(link).toHaveAttribute("aria-current", "page");
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    }
  });

  test("Tab order through the nav follows the visual order", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab"); // skip link
    const names: string[] = [];
    for (let i = 0; i < VIEWS.length - 1; i++) {
      await page.keyboard.press("Tab");
      names.push(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ""));
    }
    expect(names).toEqual(VIEWS.slice(0, -1).map((view) => view.name));
  });

  // Regression (Phase 12): the nav was a Suspense fallback replaced when the page streamed in,
  // so a keyboard user (or typing into search) who reached it early lost focus to <body>. The
  // document must hold one nav, in the static shell, never a second streamed copy.
  test("the nav is rendered once and never swapped while the page streams", async ({ page }) => {
    for (const path of ["/", "/tasks", "/tasks/00000000-0000-4000-8000-000000000000"]) {
      const html = await (await page.request.get(path)).text();
      expect(html.split('aria-label="ניווט ראשי"').length - 1, path).toBe(1);
      expect(html.split('id="search-sidebar"').length - 1, path).toBe(1);
    }
  });

  test("the sidebar is at inline-start (right in RTL)", async ({ page }) => {
    await page.goto("/");
    const aside = await page.getByRole("complementary", { name: "סרגל צד" }).boundingBox();
    const main = await page.locator("#main").boundingBox();
    expect(aside!.x).toBeGreaterThan(main!.x);
  });

  test("global search submits to the search page", async ({ page }) => {
    await page.goto("/");
    const search = page.getByRole("searchbox", { name: "חיפוש משימות ופרויקטים" });
    await search.fill("Review PR");
    await search.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=Review\+PR$/);
    await expect(page.getByRole("heading", { level: 1, name: "חיפוש" })).toBeVisible();
    await expect(page.locator("bdi", { hasText: "Review PR" })).toBeVisible();
  });

  for (const path of ALL_PATHS) {
    test(`axe: ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("#main h1")).toBeVisible();
      await expectNoAxeViolations(page);
    });
  }
});

test.describe("icon rail (1024)", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test("icons keep accessible names and aria-current", async ({ page }) => {
    await page.goto("/calendar");
    const nav = page.getByRole("navigation", { name: "ניווט ראשי" });
    for (const view of VIEWS) {
      await expect(nav.getByRole("link", { name: view.name, exact: true })).toBeVisible();
    }
    await expect(nav.getByRole("link", { name: "לוח שנה" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "חיפוש" })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test.describe("mobile drawer (375)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("menu opens the drawer, navigates, and closes", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("complementary", { name: "סרגל צד" })).toBeHidden();

    const menu = page.getByRole("button", { name: "פתיחת תפריט הניווט" });
    await menu.click();
    const drawer = page.getByRole("dialog", { name: "ניווט" });
    await expect(drawer).toBeVisible();
    // Focus starts on the current page's link, not the search field.
    await expect(drawer.getByRole("link", { name: "לוח בקרה" })).toBeFocused();
    await expectNoAxeViolations(page);

    await drawer.getByRole("link", { name: "פרויקטים" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: "פרויקטים" })).toBeVisible();
  });

  test("Escape closes the drawer and returns focus to the menu button", async ({ page }) => {
    await page.goto("/");
    const menu = page.getByRole("button", { name: "פתיחת תפריט הניווט" });
    await menu.click();
    await expect(page.getByRole("dialog", { name: "ניווט" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "ניווט" })).toBeHidden();
    await expect(menu).toBeFocused();
  });

  for (const path of ALL_PATHS) {
    test(`axe: ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("#main h1")).toBeVisible();
      await expectNoAxeViolations(page);
    });
  }
});

test.describe("320px reflow", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  for (const path of [...ALL_PATHS, "/search?q=Quarterly%20report%20%E2%80%94%20%D7%93%D7%95%D7%97%20%D7%A8%D7%91%D7%A2%D7%95%D7%A0%D7%99%20longwordwithoutanybreaksatall"]) {
    test(`no horizontal scroll: ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("#main h1")).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  }
});

test("an unknown URL gets the Hebrew not-found page with a way back", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "הדף לא נמצא" })).toBeVisible();
  await page.getByRole("link", { name: "חזרה ללוח הבקרה" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "לוח בקרה" })).toBeVisible();
  await expectNoAxeViolations(page);
});
