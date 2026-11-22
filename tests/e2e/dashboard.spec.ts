import { expect, test, type Page } from "@playwright/test";
import {
  jerusalemToday,
  plusDays,
  resetE2EData,
  seedProject,
  seedTasks,
  seedTodayEntries,
  todayEntries,
  type SeedTask,
} from "./db";
import { expectNoAxeViolations, expectNoHorizontalScroll, trackConsoleErrors } from "./helpers";

// Phase 7 Dashboard / Today. Serial: the tests share (and reset) the E2E user's data, and
// each test seeds the scenario it needs.
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 1000 } });

const today = jerusalemToday();

let consoleErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  consoleErrors = trackConsoleErrors(page);
  await resetE2EData();
});
test.afterEach(() => {
  expect(consoleErrors, "console errors").toEqual([]);
});

// Visible elements only: Next.js may keep the previous page in the DOM, hidden.
const todayRegion = (page: Page) => page.getByRole("region", { name: "המשימות למיקוד היום" }).filter({ visible: true });
const todayRows = (page: Page) => todayRegion(page).getByRole("listitem");
const todayRow = (page: Page, title: string) => todayRows(page).filter({ has: page.getByRole("link", { name: title, exact: true }) });
const section = (page: Page, name: string) => page.getByRole("region", { name, exact: true }).filter({ visible: true });
const kpis = (page: Page) => page.getByRole("list", { name: "סיכום משימות" }).filter({ visible: true });

async function todayTitles(page: Page): Promise<string[]> {
  return todayRows(page).locator("a[href^='/tasks/'] bdi").allTextContents();
}
async function sectionTitles(page: Page, name: string): Promise<string[]> {
  return section(page, name).getByRole("listitem").locator("a bdi").allTextContents();
}

// The main scenario: every §6.4 reason, a dedup overlap in each section, and non-candidates.
const A = "הכנת BI Dashboard";
const B = "Review API integration";
const C = "Q4 תכנון קורס";
const D = "תשלום חשבון חשמל";
const E = "חידוש ביטוח רכב";
const F = "תוכנית שנתית לצוות";
const G = "קביעת תור לרופא";
const H = "ספירת מלאי שנתית";
const I = "המתנה לאישור תקציב";
const J = "סדנה עתידית";
const K = "דוח שהושלם";

async function seedScenario() {
  const project = await seedProject("פרויקט My Dashboard");
  const tasks: SeedTask[] = [
    { title: A, deadline: plusDays(today, -3), project_id: project.id },
    { title: B, deadline: plusDays(today, -1), urgent_override: false },
    { title: C, deadline: today },
    { title: D, deadline: plusDays(today, 1) },
    { title: E, deadline: plusDays(today, 10), urgent_override: true },
    { title: F, deadline: plusDays(today, 5), is_important: true },
    { title: G, deadline: plusDays(today, 6) },
    { title: H, deadline: plusDays(today, 40) },
    { title: I, deadline: plusDays(today, -2), status: "waiting" },
    { title: J, deadline: plusDays(today, 4), start_date: plusDays(today, 3), is_important: true },
    { title: K, deadline: plusDays(today, -1), status: "done" },
  ];
  const rows = await seedTasks(tasks);
  const ids = Object.fromEntries(rows.map((row) => [row.title, row.id])) as Record<string, string>;
  return { ids, project };
}

test("empty Dashboard: calm empty Today, one line per section, zero KPIs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "לוח בקרה" })).toBeVisible();
  await expect(todayRegion(page)).toContainText("אין משימות למיקוד היום.");
  await expect(todayRegion(page).getByRole("button", { name: "הוספת משימה להיום" })).toHaveCount(0);
  await expect(section(page, "דחופות")).toContainText("אין משימות דחופות.");
  await expect(section(page, "חשובות")).toContainText("אין משימות חשובות.");
  await expect(section(page, "מועדים קרובים")).toContainText("אין מועדים ב-7 הימים הקרובים.");
  await expect(kpis(page).getByRole("link")).toHaveText(["0פתוחות", "0באיחור", "0הושלמו השבוע"]);
  await expectNoAxeViolations(page);
});

test("recommendations: deterministic order, reasons, dedup across sections, factual KPIs", async ({ page }) => {
  await seedScenario();
  await page.goto("/");

  // Overdue first (an urgent_override = false task stays an overdue priority), then urgent by deadline.
  await expect.poll(() => todayTitles(page)).toEqual([A, B, C, D, E]);
  const reasons: [string, string][] = [
    [A, "באיחור של 3 ימים"],
    [B, "באיחור של יום"],
    [C, "המועד היום"],
    [D, "המועד מחר"],
    [E, "סומנה כדחופה"],
  ];
  for (const [title, reason] of reasons) await expect(todayRow(page, title)).toContainText(reason);
  // Overdue supersedes the Urgent badge; a non-overdue urgent task shows it (with "ידני" when manual).
  await expect(todayRow(page, A)).not.toContainText("דחופה");
  await expect(todayRow(page, D).getByText("דחופה", { exact: true })).toBeVisible();
  await expect(todayRow(page, E)).toContainText("ידני");
  // Every recommendation offers "לא היום"; the reason is text for screen readers too.
  await expect(todayRow(page, A).getByRole("button", { name: `לא היום: ${A}` })).toBeVisible();
  await expect(todayRow(page, A).getByText("הומלצה:")).toBeAttached();

  // Dedup: Today → Urgent → Important → Upcoming. Waiting / future-start tasks aren't recommended.
  await expect.poll(() => sectionTitles(page, "דחופות")).toEqual([I]);
  await expect.poll(() => sectionTitles(page, "חשובות")).toEqual([J, F]);
  await expect.poll(() => sectionTitles(page, "מועדים קרובים")).toEqual([G]);
  await expect(page.getByRole("link", { name: H })).toHaveCount(0);

  // KPIs count every qualifying task, regardless of where it is shown.
  await expect(kpis(page).getByRole("link")).toHaveText(["10פתוחות", "3באיחור", "1הושלמו השבוע"]);
  await expectNoAxeViolations(page);
});

test("KPI and section links open the matching, non-deduplicated Tasks filters", async ({ page }) => {
  await seedScenario();
  await page.goto("/");

  await kpis(page).getByRole("link", { name: /באיחור/ }).click();
  await expect(page).toHaveURL(/\/tasks\?overdue=1$/);
  await expect(page.getByText("3 משימות")).toBeVisible();

  await page.goto("/");
  await kpis(page).getByRole("link", { name: /הושלמו השבוע/ }).click();
  await expect(page).toHaveURL(/\/tasks\?completed=week$/);
  await expect(page.getByRole("checkbox", { name: "הושלמו השבוע" })).toBeChecked();
  await expect(page.locator("table tbody tr").filter({ visible: true })).toHaveCount(1);
  await expect(page.locator("table tbody tr").filter({ visible: true })).toContainText(K);

  await page.goto("/");
  await section(page, "דחופות").getByRole("link", { name: "הצגת הכול המשימות הדחופות" }).click();
  // All 5 effectively urgent tasks, including those shown in Today.
  await expect(page).toHaveURL(/\/tasks\?urgent=1$/);
  await expect(page.getByText("5 משימות")).toBeVisible();

  await page.goto("/");
  await section(page, "מועדים קרובים").getByRole("link", { name: /הצגת הכול/ }).click();
  await expect(page).toHaveURL(new RegExp(`due=custom&from=${plusDays(today, 1)}&to=${plusDays(today, 7)}$`));
});

test("dismiss for today: the slot refills, undo restores, and the dismissal holds for the day", async ({ page }) => {
  const { ids } = await seedScenario();
  await page.goto("/");
  await expect.poll(() => todayTitles(page)).toEqual([A, B, C, D, E]);

  await todayRow(page, C).getByRole("button", { name: `לא היום: ${C}` }).click();
  await expect(page.getByText("לא תוצע היום.")).toBeVisible();
  // The next candidate (urgent wins over important) fills the slot; focus stays in Today.
  // J is important but starts later, so it isn't recommended.
  await expect.poll(() => todayTitles(page)).toEqual([A, B, D, E, F]);
  await expect(page.getByRole("heading", { name: "המשימות למיקוד היום" })).toBeFocused();
  // The dismissed task is still on the Dashboard: it moves to its next section.
  await expect.poll(() => sectionTitles(page, "דחופות")).toEqual([I, C]);

  await page.getByRole("button", { name: "ביטול" }).click();
  await expect.poll(() => todayTitles(page)).toEqual([A, B, C, D, E]);
  expect(await todayEntries(today)).toEqual([]);

  await todayRow(page, A).getByRole("button", { name: `לא היום: ${A}` }).click();
  await expect.poll(() => todayTitles(page)).toEqual([B, C, D, E, F]);
  await page.reload();
  await expect.poll(() => todayTitles(page)).toEqual([B, C, D, E, F]);
  expect(await todayEntries(today)).toEqual([{ task_id: ids[A], kind: "dismiss", pick_slot: null }]);
});

test("keyboard only: pick a dismissed task, then remove it from Today", async ({ page }) => {
  const { ids } = await seedScenario();
  await seedTodayEntries([{ taskId: ids[G]!, forDate: today, kind: "dismiss" }]);
  await page.goto("/");

  await todayRegion(page).getByRole("button", { name: "הוספת משימה להיום" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "הוספת משימה להיום" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("searchbox", { name: "חיפוש משימה" })).toBeFocused();
  await page.keyboard.type("קביעת");
  await expect(dialog.getByRole("listitem")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: `הוספה להיום: ${G}` })).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(dialog).toBeHidden();
  await expect(page.getByText("נוספה להיום.")).toBeVisible();
  await expect(todayRegion(page).getByRole("button", { name: "הוספת משימה להיום" })).toBeFocused();
  // Manual intent wins over the dismissal; picks lead Today.
  await expect.poll(() => todayTitles(page)).toEqual([G, A, B, C, D]);
  await expect(todayRow(page, G)).toContainText("נבחרה ידנית");
  expect(await todayEntries(today)).toEqual([{ task_id: ids[G], kind: "pick", pick_slot: 1 }]);

  const remove = todayRow(page, G).getByRole("button", { name: `הסר מהיום: ${G}` });
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("הוסרה מהיום.")).toBeVisible();
  await expect.poll(() => todayTitles(page)).toEqual([A, B, C, D, E]);
  await expect(page.getByRole("heading", { name: "המשימות למיקוד היום" })).toBeFocused();
  expect(await todayEntries(today)).toEqual([]);
});

test("five manual picks fill Today; a sixth is refused with the limit message", async ({ page }) => {
  const { ids } = await seedScenario();
  // Picks may be any open task, including Waiting, future-start and irrelevant ones.
  const picked = [H, I, J, G, F];
  await seedTodayEntries(picked.map((title) => ({ taskId: ids[title]!, forDate: today, kind: "pick" as const })));
  await page.goto("/");

  await expect.poll(() => todayTitles(page)).toEqual(picked);
  await expect(todayRegion(page).getByText("נבחרה ידנית")).toHaveCount(5);
  await expect(todayRegion(page).getByRole("button", { name: /^לא היום/ })).toHaveCount(0);
  await expect(todayRow(page, J)).toContainText(`מתחילה ב-`);
  // Overdue A no longer fits in Today, so it is listed under Urgent: nothing is hidden.
  await expect.poll(() => sectionTitles(page, "דחופות")).toEqual([A, C, D, E]);

  await todayRegion(page).getByRole("button", { name: "הוספת משימה להיום" }).click();
  const dialog = page.getByRole("dialog", { name: "הוספת משימה להיום" });
  await expect(dialog.getByRole("status")).toContainText("ניתן לבחור עד 5 משימות להיום.");
  await expect(dialog.getByRole("button", { name: /^הוספה להיום/ })).toHaveCount(0);
});

test("complete from Today: undo, refill, and the freed pick slot", async ({ page }) => {
  const { ids } = await seedScenario();
  await seedTodayEntries([H, I, J, G, F].map((title) => ({ taskId: ids[title]!, forDate: today, kind: "pick" as const })));
  await page.goto("/");

  await todayRegion(page).getByRole("button", { name: `סמן כהושלמה: ${H}` }).click();
  await expect(page.getByText("הושלמה.")).toBeVisible();
  // The completed pick leaves; the top recommendation takes its place.
  await expect.poll(() => todayTitles(page)).toEqual([I, J, G, F, A]);
  await expect(kpis(page).getByRole("link", { name: /הושלמו השבוע/ })).toHaveText("2הושלמו השבוע");

  await page.getByRole("button", { name: "ביטול" }).click();
  await expect.poll(() => todayTitles(page)).toEqual([H, I, J, G, F]);
  await expect(kpis(page).getByRole("link", { name: /הושלמו השבוע/ })).toHaveText("1הושלמו השבוע");

  // A completed pick frees its slot for a new pick (5 picks stay the DB maximum).
  await todayRegion(page).getByRole("button", { name: `סמן כהושלמה: ${H}` }).click();
  await expect.poll(() => todayTitles(page)).toEqual([I, J, G, F, A]);
  await todayRegion(page).getByRole("button", { name: "הוספת משימה להיום" }).click();
  await page.getByRole("dialog").getByRole("button", { name: `הוספה להיום: ${B}` }).click();
  await expect.poll(() => todayTitles(page)).toEqual([I, J, G, F, B]);
});

test("day reset: yesterday's picks and dismissals no longer apply", async ({ page }) => {
  const { ids } = await seedScenario();
  const yesterday = plusDays(today, -1);
  await seedTodayEntries([
    { taskId: ids[H]!, forDate: yesterday, kind: "pick" },
    { taskId: ids[A]!, forDate: yesterday, kind: "dismiss" },
  ]);
  await page.goto("/");
  await expect.poll(() => todayTitles(page)).toEqual([A, B, C, D, E]);
  await expect(todayRegion(page).getByText("נבחרה ידנית")).toHaveCount(0);
});

test("Quick Create from the Dashboard feeds Today; project links open the project", async ({ page }) => {
  await seedProject("Q4 תכנון קורס");
  await page.goto("/");
  await page.getByRole("button", { name: "משימה חדשה" }).click();
  const dialog = page.getByRole("dialog", { name: "משימה חדשה" });
  await dialog.getByRole("textbox", { name: /כותרת/ }).fill("הכנת מצגת Sprint review");
  // The chip radios are visually hidden; the chip label takes the click.
  await dialog.getByText("היום", { exact: true }).click();
  await expect(dialog.getByRole("radio", { name: "היום" })).toBeChecked();
  await dialog.getByRole("button", { name: "יצירת משימה" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => todayTitles(page)).toEqual(["הכנת מצגת Sprint review"]);
  await expect(todayRow(page, "הכנת מצגת Sprint review")).toContainText("המועד היום");

  await resetE2EData();
  await seedScenario();
  await page.goto("/");
  await todayRow(page, A).getByRole("link", { name: "פרויקט: פרויקט My Dashboard" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "פרויקט My Dashboard" })).toBeVisible();
});

test.describe("layouts", () => {
  test("1440: Today at inline-start beside the sections", async ({ page }) => {
    await seedScenario();
    await page.goto("/");
    const todayBox = await todayRegion(page).boundingBox();
    const urgentBox = await section(page, "דחופות").boundingBox();
    // RTL: inline-start is on the right.
    expect(todayBox!.x).toBeGreaterThan(urgentBox!.x + urgentBox!.width - 1);
    expect(Math.abs(todayBox!.y - urgentBox!.y)).toBeLessThan(40);
    await expectNoHorizontalScroll(page);
  });

  test("768: one column, Today first", async ({ page }) => {
    await seedScenario();
    await page.setViewportSize({ width: 768, height: 1000 });
    await page.goto("/");
    const todayBox = await todayRegion(page).boundingBox();
    const urgentBox = await section(page, "דחופות").boundingBox();
    expect(urgentBox!.y).toBeGreaterThan(todayBox!.y + todayBox!.height - 1);
    await expectNoHorizontalScroll(page);
  });

  test("375: drawer navigation, Today first, axe", async ({ page }) => {
    await seedScenario();
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    await expect.poll(() => todayTitles(page)).toEqual([A, B, C, D, E]);
    await expect(page.getByRole("button", { name: "פתיחת תפריט הניווט" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
  });

  test("320: no horizontal scroll with long mixed-direction names", async ({ page }) => {
    const project = await seedProject("Quarterly Planning פרויקט ארוך מאוד לבדיקת שבירת שורות");
    await seedTasks([
      {
        title: "Prepare quarterly OKR review with a deliberately long English title עם המשך בעברית",
        deadline: plusDays(today, -4),
        project_id: project.id,
        is_important: true,
      },
    ]);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");
    await expect(todayRows(page)).toHaveCount(1);
    await expectNoHorizontalScroll(page);
  });
});
