import { expect, test, type Locator, type Page } from "@playwright/test";
import { formatMonthName } from "../../src/domain/dates";
import {
  ddmmyyyy,
  e2eDb,
  findPlanningItem,
  findTaskByTitle,
  jerusalemToday,
  plusDays,
  resetE2EData,
  seedCategory,
  seedPlanningItem,
  seedProject,
  seedTasks,
  tasksByTitle,
} from "./db";
import { expectNoAxeViolations, expectNoHorizontalScroll, trackConsoleErrors } from "./helpers";

// Phase 10 Planning items / milestones. Serial: the tests share (and reset) the E2E user's data.
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

// Visible only: Next.js may keep the previous page in the DOM, hidden.
const row = (page: Page, title: string) =>
  page.locator("#planning-list li").filter({ has: page.locator("bdi", { hasText: title }) }).filter({ visible: true });

/** Opens the date picker labelled `label` in `scope` and picks today + `days` with the RTL keys (← = next day). */
async function pickDate(page: Page, scope: Locator, label: RegExp, days: number) {
  await scope.getByRole("button", { name: label }).click();
  await expect(page.getByRole("grid")).toBeVisible();
  for (let i = 0; i < days; i++) await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("grid")).toBeHidden();
}

test("empty Planning view", async ({ page }) => {
  await page.goto("/planning");
  await expect(page.getByRole("heading", { level: 1, name: "תכנון שנתי" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "עדיין אין פריטי תכנון." })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("create an item without a preparation task; the list groups by year and month", async ({ page }) => {
  await seedPlanningItem({ title: "פריט מוקדם", date: plusDays(today, 1) });
  await page.goto("/planning");
  await page.getByRole("button", { name: "פריט תכנון חדש" }).click();
  const dialog = page.getByRole("dialog", { name: "פריט תכנון חדש" });
  await expect(dialog.getByRole("textbox", { name: /כותרת/ })).toBeFocused();
  await page.keyboard.type("השקת Project Q4");
  await expect(dialog.getByRole("checkbox", { name: "צור משימת הכנה" })).not.toBeChecked();
  await expect(dialog.getByRole("textbox", { name: /זמן הכנה/ })).toHaveValue("7");
  await pickDate(page, dialog, /תאריך/, 20);
  await dialog.getByRole("button", { name: "הוספת פריט" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("נוסף.")).toBeVisible();

  const date = plusDays(today, 20);
  await expect(page.getByRole("heading", { level: 2, name: date.slice(0, 4) })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: formatMonthName(date.slice(0, 7)) })).toBeVisible();
  await expect(row(page, "השקת Project Q4").getByRole("button", { name: /צור משימת הכנה/ })).toBeVisible();
  // Ordered by date: the earlier item comes first.
  const titles = await page.locator("#planning-list li bdi").filter({ visible: true }).allTextContents();
  expect(titles.indexOf("פריט מוקדם")).toBeLessThan(titles.indexOf("השקת Project Q4"));
  expect(await findPlanningItem("השקת Project Q4")).toMatchObject({ date, prep_lead_days: 7, preparation_task_id: null });
  expect(await tasksByTitle("הכנה: השקת Project Q4")).toEqual([]);
});

test("create with a preparation task: editable title, derived deadline, copied project and category", async ({ page }) => {
  const project = await seedProject("Project Q4");
  const category = await seedCategory("עבודה");
  await page.goto("/planning");
  await page.getByRole("button", { name: "פריט תכנון חדש" }).click();
  const dialog = page.getByRole("dialog", { name: "פריט תכנון חדש" });
  await dialog.getByRole("textbox", { name: /כותרת/ }).fill("כנס BI Dashboard");
  await pickDate(page, dialog, /תאריך/, 20);
  await dialog.getByRole("textbox", { name: /זמן הכנה/ }).fill("10");
  await dialog.getByText("עבודה", { exact: true }).click();
  await dialog.getByRole("combobox", { name: "פרויקט" }).selectOption({ label: "Project Q4" });
  await dialog.getByRole("checkbox", { name: "צור משימת הכנה" }).check();
  const prepTitle = dialog.getByRole("textbox", { name: "כותרת משימת ההכנה" });
  await expect(prepTitle).toHaveValue("הכנה: כנס BI Dashboard");
  await expect(dialog.getByRole("status")).toContainText(ddmmyyyy(plusDays(today, 10)));
  await expect(dialog).toContainText("משימת ההכנה היא משימה עצמאית ולא תתעדכן אם התאריך ישתנה.");
  await prepTitle.fill("הכנה לכנס BI");
  await dialog.getByRole("button", { name: "הוספת פריט" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("עם משימת הכנה למועד")).toBeVisible();

  const [task] = await tasksByTitle("הכנה לכנס BI");
  expect(task).toMatchObject({
    deadline: plusDays(today, 10),
    project_id: project.id,
    category_id: category.id,
    is_important: false,
    status: "todo",
    start_date: null,
    urgent_override: null,
  });
  expect(await findPlanningItem("כנס BI Dashboard")).toMatchObject({ preparation_task_id: task!.id, prep_lead_days: 10 });
  const link = row(page, "כנס BI Dashboard").getByRole("link", { name: /משימת הכנה/ });
  await expect(link).toContainText(ddmmyyyy(plusDays(today, 10)));
  await link.click();
  await expect(page.getByRole("textbox", { name: /כותרת/ })).toHaveValue("הכנה לכנס BI");
});

test("a past derived deadline is set to today, with a notice; a double submit creates one task", async ({ page }) => {
  await seedPlanningItem({ title: "הגשה קרובה", date: plusDays(today, 3), prep_lead_days: 7 });
  await page.goto("/planning");
  await row(page, "הגשה קרובה").getByRole("button", { name: /צור משימת הכנה/ }).click();
  const dialog = page.getByRole("dialog", { name: "יצירת משימת הכנה" });
  await expect(dialog.getByRole("status")).toContainText(ddmmyyyy(today));
  await expect(dialog).toContainText("המועד המחושב כבר עבר, ולכן מועד משימת ההכנה יהיה היום.");
  await dialog.getByRole("button", { name: "יצירת משימת הכנה" }).dblclick();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("היום, כי המועד המחושב כבר עבר")).toBeVisible();
  await expect.poll(async () => (await tasksByTitle("הכנה: הגשה קרובה")).length).toBe(1);
  expect((await tasksByTitle("הכנה: הגשה קרובה"))[0]).toMatchObject({ deadline: today });
});

test("editing or deleting the item never changes its task; deleting the task allows a new one", async ({ page }) => {
  const [task] = await seedTasks([{ title: "הכנה: כנס שנתי", deadline: plusDays(today, 13) }]);
  await seedPlanningItem({ title: "כנס שנתי", date: plusDays(today, 20), preparation_task_id: task!.id });
  await page.goto("/planning");

  // Edit: date-related fields change, the task doesn't.
  await row(page, "כנס שנתי").getByRole("button", { name: "עריכה של פריט התכנון כנס שנתי" }).click();
  const edit = page.getByRole("dialog", { name: "עריכת פריט תכנון" });
  await expect(edit).toContainText("שינוי התאריך או זמן ההכנה לא משנה משימת הכנה שכבר נוצרה.");
  await edit.getByRole("textbox", { name: /זמן הכנה/ }).fill("30");
  await edit.getByRole("textbox", { name: /כותרת/ }).fill("כנס שנתי נדחה");
  await edit.getByRole("button", { name: "שמירה" }).click();
  await expect(edit).toBeHidden();
  await expect(row(page, "כנס שנתי נדחה")).toBeVisible();
  expect(await findTaskByTitle("הכנה: כנס שנתי")).toMatchObject({ deadline: plusDays(today, 13) });

  // The task is deleted: the item can generate a new one.
  await (await e2eDb()).from("tasks").delete().eq("id", task!.id);
  await page.reload();
  await row(page, "כנס שנתי נדחה").getByRole("button", { name: /צור משימת הכנה/ }).click();
  await page.getByRole("dialog", { name: "יצירת משימת הכנה" }).getByRole("button", { name: "יצירת משימת הכנה" }).click();
  await expect(row(page, "כנס שנתי נדחה").getByRole("link", { name: /משימת הכנה/ })).toBeVisible();
  // Lead time 30 days before a date 20 days away: past, so today.
  await expect.poll(async () => (await tasksByTitle("הכנה: כנס שנתי נדחה"))[0]?.deadline).toBe(today);

  // Delete the item: its task stays; focus lands on the list.
  await row(page, "כנס שנתי נדחה").getByRole("button", { name: "מחיקה של פריט התכנון כנס שנתי נדחה" }).click();
  const confirm = page.getByRole("dialog", { name: "למחוק את פריט התכנון?" });
  await expect(confirm).toContainText("משימת ההכנה שלו לא תימחק ולא תשתנה.");
  await confirm.getByRole("button", { name: "מחיקת פריט התכנון" }).click();
  await expect(page.getByText("נמחק.")).toBeVisible();
  await expect(page.locator("#planning-list")).toBeFocused();
  expect(await findPlanningItem("כנס שנתי נדחה")).toBeNull();
  expect(await tasksByTitle("הכנה: כנס שנתי נדחה")).toHaveLength(1);
});

test("validation: title, date and lead time", async ({ page }) => {
  await page.goto("/planning");
  await page.getByRole("button", { name: "פריט תכנון חדש" }).click();
  const dialog = page.getByRole("dialog", { name: "פריט תכנון חדש" });
  await dialog.getByRole("textbox", { name: /זמן הכנה/ }).fill("400");
  await dialog.getByRole("button", { name: "הוספת פריט" }).click();
  await expect(dialog.getByRole("alert")).toContainText("לא ניתן לשמור");
  await expect(dialog.getByRole("textbox", { name: /כותרת/ })).toHaveAccessibleDescription("יש להזין כותרת.");
  await expect(dialog.getByRole("textbox", { name: /זמן הכנה/ })).toHaveAccessibleDescription(/יש להזין מספר ימים בין 0 ל־365\./);
  await expect(dialog.getByText("יש לבחור תאריך.").first()).toBeVisible();
});

test("markers in the Calendar and on the project page; search opens the item", async ({ page }) => {
  const project = await seedProject("Project Q4 milestone");
  const item = await seedPlanningItem({ title: "אבן דרך Project Q4", date: "2026-11-20", project_id: project.id });

  await page.goto("/calendar?month=2026-11&day=2026-11-20");
  const panel = page.locator("section:has(#calendar-day-heading)").filter({ visible: true });
  await expect(panel).toContainText("פריט תכנון");
  await expect(page.getByRole("button", { name: /^יום ו׳, 20 בנובמבר 2026/ })).toHaveAccessibleName(/פריט אחד$/);
  await panel.getByRole("link", { name: "אבן דרך Project Q4" }).click();
  await expect(page).toHaveURL(new RegExp(`/planning#planning-${item.id}$`));
  await expect(row(page, "אבן דרך Project Q4")).toBeInViewport();

  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("link", { name: "אבן דרך Project Q4" })).toBeVisible();

  await page.goto("/search?q=" + encodeURIComponent("אבן דרך"));
  await page.getByRole("link", { name: "אבן דרך Project Q4" }).click();
  await expect(page).toHaveURL(new RegExp(`/planning#planning-${item.id}$`));
});

test("375 and 320: no horizontal scroll, axe on mobile", async ({ page }) => {
  const [task] = await seedTasks([{ title: "הכנה: Quarterly Planning כנס עם שם ארוך", deadline: plusDays(today, 5) }]);
  await seedPlanningItem({
    title: "Quarterly Planning כנס עם שם ארוך מאוד לבדיקת שבירת שורות",
    date: plusDays(today, 12),
    preparation_task_id: task!.id,
  });
  await seedPlanningItem({ title: "בלי משימת הכנה", date: plusDays(today, 40) });
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/planning");
    await expect(row(page, "בלי משימת הכנה")).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
  await page.setViewportSize({ width: 375, height: 800 });
  await expectNoAxeViolations(page);
});
