import { expect, test, type Page } from "@playwright/test";
import { formatMonthYear } from "../../src/domain/dates";
import { ddmmyyyy, jerusalemToday, plusDays, resetE2EData, seedPlanningItem, seedProject, seedTasks } from "./db";
import { expectNoAxeViolations, expectNoHorizontalScroll, trackConsoleErrors } from "./helpers";

// Phase 11 Gantt / Timeline (read-only). Serial: the tests share (and reset) the E2E user's data.
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 1000 } });

const today = jerusalemToday();
const year = today.slice(0, 4);
const quarter = Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1;

let consoleErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  consoleErrors = trackConsoleErrors(page);
  await resetE2EData();
});
test.afterEach(() => {
  expect(consoleErrors, "console errors").toEqual([]);
});

// Visible only: Next.js may keep the previous page in the DOM, hidden.
const chart = (page: Page) => page.getByRole("region", { name: /^ציר זמן/ }).filter({ visible: true });
const title = (page: Page) => page.getByRole("heading", { level: 2 }).filter({ visible: true }).first();
const groupHeadings = (page: Page) => chart(page).getByRole("heading", { level: 3 });
const itemLink = (page: Page, name: string) => chart(page).getByRole("link", { name: new RegExp(name) });

/**
 * Three projects' worth of entries around today, all inside today's week, month, quarter and
 * year: a span (today → today), a deadline-only task (today), a milestone (today).
 */
async function seedMixed() {
  const site = await seedProject("אתר החברה");
  const api = await seedProject("Review API");
  await seedTasks([
    { title: "עיצוב דף הבית", start_date: today, deadline: today, project_id: site.id },
    { title: "Deploy ל-production", deadline: today, project_id: api.id },
    { title: "לקנות ציוד", deadline: today },
    { title: "דוח שהושלם", start_date: today, deadline: today, status: "done" },
  ]);
  await seedPlanningItem({ title: "השקת Q4 Roadmap", date: today, project_id: site.id });
  return { site, api };
}

test("empty Gantt", async ({ page }) => {
  await page.goto("/timeline");
  await expect(page.getByRole("heading", { level: 1, name: "גאנט" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "אין משימות או אבני דרך בטווח זה." })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("Month: project groups (no project last), span, deadline marker, milestone, Today line, mixed names", async ({ page }) => {
  const { site } = await seedMixed();
  await page.goto("/timeline");
  await expect(title(page)).toHaveText(formatMonthYear(today.slice(0, 7)));
  await expect(groupHeadings(page)).toHaveText(["אתר החברה", "Review API", "ללא פרויקט"]);

  // The site group: the milestone first (same day), then the span; each row names kind and dates.
  const siteGroup = chart(page).getByRole("region", { name: site.name });
  await expect(siteGroup.getByRole("listitem")).toHaveCount(2);
  await expect(siteGroup.getByRole("link")).toHaveText([/השקת Q4 Roadmap/, /עיצוב דף הבית/]);
  // The title is a block, so the computed name may hold a space before the first comma.
  const named = (name: string, rest: string) => new RegExp(`^${name}\\s?, ${rest}$`);
  const date = ddmmyyyy(today);
  await expect(itemLink(page, "עיצוב דף הבית")).toHaveAccessibleName(named("עיצוב דף הבית", `משימה מ־${date} עד ${date}`));
  await expect(itemLink(page, "Deploy ל-production")).toHaveAccessibleName(
    named("Deploy ל-production", `משימה עם מועד בלבד, מועד ${date}`),
  );
  await expect(itemLink(page, "השקת Q4 Roadmap")).toHaveAccessibleName(named("השקת Q4 Roadmap", `פריט תכנון, ${date}`));
  // Done tasks are shown by default, marked in text.
  await expect(itemLink(page, "דוח שהושלם")).toHaveAccessibleName(/, הושלמה$/);

  // Bars and markers: pointer shortcuts outside the tab order and the accessibility tree.
  const bar = chart(page).locator('a[aria-hidden="true"][tabindex="-1"]');
  await expect(bar).toHaveCount(5);
  await expect(chart(page).locator("[data-today]")).toBeVisible();
  await expect(chart(page).getByText("היום", { exact: true })).toBeVisible();

  // The label column sits at the right of the chart; time runs left → right.
  const labels = await chart(page).locator("[data-label-column]").boundingBox();
  const todayLine = await chart(page).locator("[data-today]").boundingBox();
  expect(labels!.x).toBeGreaterThan(todayLine!.x);

  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await itemLink(page, "עיצוב דף הבית").click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
});

test("zoom levels, URL state, Back/Forward, reload and range navigation", async ({ page }) => {
  await seedMixed();
  await page.goto("/timeline");
  const zoom = page.getByRole("navigation", { name: "רמת תצוגה" });
  await expect(zoom.getByRole("link", { name: "חודש" })).toHaveAttribute("aria-current", "true");

  await zoom.getByRole("link", { name: "שבוע" }).click();
  await expect(page).toHaveURL(/zoom=week/);
  await expect(title(page)).toHaveText(/^\d\d\.\d\d\.\d{4} – \d\d\.\d\d\.\d{4}$/);
  await expect(itemLink(page, "Deploy ל-production")).toBeVisible();

  await zoom.getByRole("link", { name: "רבעון" }).click();
  await expect(page).toHaveURL(/zoom=quarter/);
  await expect(title(page)).toHaveText(`רבעון ${quarter} · ${year}`);

  await zoom.getByRole("link", { name: "שנה" }).click();
  await expect(page).toHaveURL(/zoom=year/);
  await expect(title(page)).toHaveText(year);
  await expect(itemLink(page, "השקת Q4 Roadmap")).toBeVisible();

  await page.goBack();
  await expect(title(page)).toHaveText(`רבעון ${quarter} · ${year}`);
  await page.goForward();
  await expect(title(page)).toHaveText(year);
  await page.reload();
  await expect(title(page)).toHaveText(year);
  await expect(zoom.getByRole("link", { name: "שנה" })).toHaveAttribute("aria-current", "true");

  const range = page.getByRole("group", { name: "ניווט בטווח" });
  await range.getByRole("link", { name: "מאוחר יותר" }).click();
  await expect(title(page)).toHaveText(String(Number(year) + 1));
  await expect(page.getByRole("heading", { level: 2, name: "אין משימות או אבני דרך בטווח זה." })).toBeVisible();
  await range.getByRole("link", { name: "מוקדם יותר" }).click();
  await expect(title(page)).toHaveText(year);
  await range.getByRole("link", { name: "מוקדם יותר" }).click();
  await expect(title(page)).toHaveText(String(Number(year) - 1));
  await page.getByRole("link", { name: "היום", exact: true }).click();
  await expect(title(page)).toHaveText(year);
  await expect(page).not.toHaveURL(/date=/);

  // "Earlier" is drawn left of "later" (the timeline's direction), inside the RTL toolbar.
  const earlier = await range.getByRole("link", { name: "מוקדם יותר" }).boundingBox();
  const later = await range.getByRole("link", { name: "מאוחר יותר" }).boundingBox();
  expect(earlier!.x).toBeLessThan(later!.x);
});

test("density: Quarter and Year hide deadline-only tasks by default; the toggle and hidden count", async ({ page }) => {
  await seedMixed();
  const toggle = page.getByRole("checkbox", { name: "הצג גם משימות עם מועד בלבד" });

  // Week and Month: deadline markers shown, no toggle.
  await page.goto("/timeline?zoom=week");
  await expect(itemLink(page, "Deploy ל-production")).toBeVisible();
  await expect(toggle).toHaveCount(0);

  for (const zoom of ["quarter", "year"]) {
    await page.goto(`/timeline?zoom=${zoom}`);
    await expect(itemLink(page, "עיצוב דף הבית")).toBeVisible();
    await expect(itemLink(page, "השקת Q4 Roadmap")).toBeVisible();
    await expect(itemLink(page, "Deploy ל-production")).toHaveCount(0);
    await expect(itemLink(page, "לקנות ציוד")).toHaveCount(0);
    await expect(page.getByText("2 משימות עם מועד בלבד מוסתרות")).toBeVisible();
    await expect(toggle).not.toBeChecked();
  }

  await toggle.check();
  await expect(page).toHaveURL(/deadlines=1/);
  await expect(itemLink(page, "Deploy ל-production")).toBeVisible();
  await expect(itemLink(page, "לקנות ציוד")).toBeVisible();
  await expect(page.getByText(/מועד בלבד מוסתר/)).toHaveCount(0);
  await expect(toggle).toBeChecked();
  await page.goBack();
  await expect(itemLink(page, "Deploy ל-production")).toHaveCount(0);
  await expect(toggle).not.toBeChecked();
});

test("Done toggle hides completed tasks", async ({ page }) => {
  await seedMixed();
  await page.goto("/timeline");
  const toggle = page.getByRole("checkbox", { name: "הצג משימות שהושלמו" });
  await expect(toggle).toBeChecked();
  await expect(itemLink(page, "דוח שהושלם")).toBeVisible();
  await toggle.uncheck();
  await expect(page).toHaveURL(/done=0/);
  await expect(itemLink(page, "דוח שהושלם")).toHaveCount(0);
  await expect(itemLink(page, "עיצוב דף הבית")).toBeVisible();
});

test("keyboard: zoom, rows and the scroll area; Year scrolls inside its own area", async ({ page }) => {
  await seedMixed();
  // Long spans and many tasks in one project, around today.
  const busy = await seedProject("פרויקט עמוס");
  await seedTasks(
    Array.from({ length: 8 }, (_, index) => ({
      title: `שלב ${index + 1}`,
      start_date: plusDays(today, -40 + index * 5),
      deadline: plusDays(today, 20 + index * 10),
      project_id: busy.id,
    })),
  );
  await page.goto("/timeline?zoom=year");
  const region = chart(page);
  await expect(region).toBeVisible();

  // The axis runs left → right for Hebrew labels too (January left of December).
  const monthX = (name: string) =>
    region.getByText(name, { exact: true }).evaluate((element) => element.getBoundingClientRect().x);
  expect(await monthX("ינואר")).toBeLessThan(await monthX("דצמבר"));

  // Year needs more room than the page gives it: the chart scrolls, the page does not.
  const { scrollWidth, clientWidth } = await region.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(scrollWidth).toBeGreaterThan(clientWidth);
  await expectNoHorizontalScroll(page);

  // The scroll area takes focus and scrolls with the arrow keys.
  await region.focus();
  await expect(region).toBeFocused();
  const before = await region.evaluate((element) => element.scrollLeft);
  await page.keyboard.press(before > 0 ? "ArrowLeft" : "ArrowRight");
  await expect.poll(() => region.evaluate((element) => element.scrollLeft)).not.toBe(before);

  // Tab moves through the rows' links (one stop each), never into the bars.
  await page.keyboard.press("Tab");
  const firstLink = region.getByRole("link").first();
  await expect(firstLink).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(region.getByRole("link").nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/(tasks\/|planning#)/);
});

test("list alternative on desktop: the same filter as the chart, and back", async ({ page }) => {
  await seedMixed();
  await page.goto("/timeline?zoom=quarter");
  await page.getByRole("link", { name: "הצג כרשימה" }).click();
  await expect(page).toHaveURL(/view=list/);
  await expect(chart(page)).toHaveCount(0);
  const list = page.locator("main");
  // Same filter as the chart: the deadline-only tasks stay hidden here too.
  await expect(list.getByRole("heading", { level: 3 })).toHaveText(["אתר החברה", "ללא פרויקט"]);
  await expect(list.getByRole("link", { name: "עיצוב דף הבית" })).toBeVisible();
  // The open span and the Done one ("· הושלמה").
  await expect(list.getByText(`טווח משימה · ${ddmmyyyy(today)} – ${ddmmyyyy(today)}`)).toHaveCount(2);
  await expect(list.getByText(`פריט תכנון · ${ddmmyyyy(today)}`)).toBeVisible();
  await expect(list.getByRole("link", { name: "Deploy ל-production" })).toHaveCount(0);
  await expectNoAxeViolations(page);
  await page.getByRole("link", { name: "הצג כגאנט" }).click();
  await expect(chart(page)).toBeVisible();
});

for (const width of [375, 320]) {
  test(`${width}: the list is the only view; no page scroll; axe`, async ({ page }) => {
    await seedMixed();
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/timeline");
    await expect(page.getByRole("heading", { level: 3 }).filter({ visible: true })).toHaveText([
      "אתר החברה",
      "Review API",
      "ללא פרויקט",
    ]);
    await expect(chart(page)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "הצג כרשימה" })).toBeHidden();
    await expect(page.getByText(`מועד משימה · ${ddmmyyyy(today)}`).filter({ visible: true })).toHaveCount(2);
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
  });
}

for (const width of [1440, 1280, 1024, 768]) {
  test(`${width}: every zoom fits the page (the chart scrolls inside its own area)`, async ({ page }) => {
    await seedMixed();
    await page.setViewportSize({ width, height: 900 });
    for (const zoom of ["week", "month", "quarter", "year"]) {
      await page.goto(`/timeline?zoom=${zoom}&deadlines=1`);
      await expect(itemLink(page, "Deploy ל-production")).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
    if (width === 1024) await expectNoAxeViolations(page);
  });
}
