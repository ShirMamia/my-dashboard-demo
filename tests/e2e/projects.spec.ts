import { expect, test, type Page } from "@playwright/test";
import { e2eDb, getTaskByTitle, jerusalemToday, plusDays, resetE2EData, seedProject, seedTasks } from "./db";
import { expectNoAxeViolations, expectNoHorizontalScroll, trackConsoleErrors } from "./helpers";

// Phase 6 Projects. Serial: the tests share (and reset) the E2E user's data.
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });

const today = jerusalemToday();
const BI = "פרויקט BI Dashboard";
const RENAMED = "My Dashboard פיתוח";

let consoleErrors: string[] = [];
test.beforeEach(({ page }) => {
  consoleErrors = trackConsoleErrors(page);
});
test.afterEach(() => {
  expect(consoleErrors, "console errors").toEqual([]);
});

test.beforeAll(async () => {
  await resetE2EData();
});

const progressSection = (page: Page) => page.getByRole("region", { name: "התקדמות" });
const projectTasks = (page: Page) => page.getByRole("region", { name: "משימות" });
const taskRow = (page: Page, title: string) =>
  // Visible rows only: Next.js may keep the previous page in the DOM, hidden.
  page.locator("table tbody tr", { has: page.locator("bdi", { hasText: title }) }).filter({ visible: true });

/** Opens a project from the list; archived or completed projects are in their own tab (UAT-03). */
async function openProject(page: Page, name: string, view?: "completed" | "archived") {
  await page.goto(view ? `/projects?view=${view}` : "/projects");
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test("empty state with no projects", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { level: 2, name: "עדיין אין פרויקטים." })).toBeVisible();
  await expect(page.getByRole("button", { name: "פרויקט חדש" })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("create a project by keyboard, landing on its empty page", async ({ page }) => {
  await page.goto("/projects");
  await page.getByRole("button", { name: "פרויקט חדש" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "פרויקט חדש" });
  await expect(dialog.getByRole("textbox", { name: /שם הפרויקט/ })).toBeFocused();
  await page.keyboard.type(BI);
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: BI })).toBeVisible();
  await expect(page.getByText("נוצר.")).toBeVisible();
  await expect(progressSection(page)).toContainText("אין משימות עדיין");
  await expect(projectTasks(page).getByRole("heading", { name: "אין משימות עדיין." })).toBeVisible();
  // The sidebar marks Projects as current on a project page.
  await expect(page.getByRole("navigation", { name: "ניווט ראשי" }).getByRole("link", { name: "פרויקטים" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expectNoAxeViolations(page);
});

test("create validation: required and unique names (server-side)", async ({ page }) => {
  await page.goto("/projects");
  await page.getByRole("button", { name: "פרויקט חדש" }).click();
  const dialog = page.getByRole("dialog", { name: "פרויקט חדש" });
  const name = dialog.getByRole("textbox", { name: /שם הפרויקט/ });

  await name.fill("   ");
  await dialog.getByRole("button", { name: "יצירת פרויקט" }).click();
  await expect(dialog.getByText("יש להזין שם לפרויקט.")).toBeVisible();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription("יש להזין שם לפרויקט.");

  await name.fill(`  ${BI}  `); // trimmed before the uniqueness check
  await dialog.getByRole("button", { name: "יצירת פרויקט" }).click();
  await expect(dialog.getByText("כבר קיים פרויקט בשם הזה.")).toBeVisible();
  await expect(name).toBeFocused();
  await expectNoAxeViolations(page);
});

test("create a task for the project; progress counts it", async ({ page }) => {
  await openProject(page, BI);
  await page.getByRole("button", { name: "משימה חדשה" }).click();
  const dialog = page.getByRole("dialog", { name: "משימה חדשה" });
  await expect(dialog).toContainText(`המשימה תשויך לפרויקט ${BI}.`);
  await dialog.getByRole("textbox", { name: /כותרת/ }).fill("Review API integration");
  await dialog.getByRole("textbox", { name: /כותרת/ }).press("Enter");
  await expect(dialog).toBeHidden();

  await expect(taskRow(page, "Review API integration")).toBeVisible();
  await expect(progressSection(page)).toContainText("0 מתוך 1 הושלמו");
  await expect(progressSection(page)).toContainText("פתוחה אחת");
  const project = await e2eDb().then((db) => db.from("projects").select("id").eq("name", BI).single());
  expect((await getTaskByTitle("Review API integration")).project_id).toBe(project.data?.id);
});

test("assign an existing task, complete and reopen it: progress follows", async ({ page }) => {
  await seedTasks([{ title: "מערכת ניהול Q4 — דוח", deadline: plusDays(today, -2) }]);
  await page.goto("/tasks");
  await taskRow(page, "מערכת ניהול Q4 — דוח").getByRole("link").first().click();
  await expect(page.getByRole("heading", { level: 1, name: "עריכת משימה" })).toBeVisible();
  await page.getByRole("combobox", { name: "פרויקט" }).selectOption({ label: BI });
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByText("השינויים נשמרו.")).toBeVisible();
  await expect(page.getByRole("link", { name: BI })).toBeVisible();

  await page.getByRole("link", { name: BI }).click();
  await expect(page.getByRole("heading", { level: 1, name: BI })).toBeVisible();
  await expect(taskRow(page, "מערכת ניהול Q4 — דוח")).toBeVisible();
  await expect(progressSection(page)).toContainText("0 מתוך 2 הושלמו");
  await expect(progressSection(page)).toContainText("אחת באיחור");

  await page.getByRole("button", { name: "סמן כהושלמה: Review API integration" }).click();
  await expect(progressSection(page)).toContainText("1 מתוך 2 הושלמו");
  await expect(progressSection(page)).toContainText("פתוחה אחת");

  await page.getByRole("checkbox", { name: "הצג משימות שהושלמו" }).check();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\?done=1$/);
  await page.getByRole("button", { name: "בטל השלמה: Review API integration" }).click();
  await expect(progressSection(page)).toContainText("0 מתוך 2 הושלמו");
});

test("remove a task from the project", async ({ page }) => {
  await openProject(page, BI);
  await taskRow(page, "מערכת ניהול Q4 — דוח").getByRole("link").first().click();
  await expect(page.getByRole("heading", { level: 1, name: "עריכת משימה" })).toBeVisible();
  await page.getByRole("combobox", { name: "פרויקט" }).selectOption({ label: "ללא פרויקט" });
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect.poll(async () => (await getTaskByTitle("מערכת ניהול Q4 — דוח")).project_id).toBeNull();

  await openProject(page, BI);
  await expect(taskRow(page, "מערכת ניהול Q4 — דוח")).toHaveCount(0);
  await expect(progressSection(page)).toContainText("0 מתוך 1 הושלמו");
  // The task itself is untouched apart from the project.
  expect(await getTaskByTitle("מערכת ניהול Q4 — דוח")).toMatchObject({ status: "todo", deadline: plusDays(today, -2) });
});

test("rename by keyboard keeps the project's tasks", async ({ page }) => {
  await openProject(page, BI);
  await page.getByRole("button", { name: "שינוי שם" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "שינוי שם הפרויקט" });
  const name = dialog.getByRole("textbox", { name: /שם הפרויקט/ });
  await expect(name).toHaveValue(BI);
  await name.fill(RENAMED);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: RENAMED })).toBeVisible();
  await expect(page.getByRole("button", { name: "שינוי שם" })).toBeFocused();
  await expect(taskRow(page, "Review API integration")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 }).locator("bdi")).toHaveText(RENAMED);
});

test("archive by keyboard (with undo), restore; archived projects leave pickers but keep tasks", async ({ page }) => {
  await openProject(page, RENAMED);
  const archive = page.getByRole("button", { name: "העברה לארכיון" });
  await archive.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("הועבר לארכיון. המשימות שלו נשארו.")).toBeVisible();
  await expect(page.getByText("הפרויקט בארכיון: הוא לא מוצע בבחירת פרויקט")).toBeVisible();
  await expect(page.getByRole("button", { name: "החזרה מהארכיון" })).toBeFocused();
  await expect(page.getByRole("button", { name: "משימה חדשה" })).toHaveCount(0);
  await expect(taskRow(page, "Review API integration")).toBeVisible();

  // Undo from the toast restores it.
  await page.getByRole("button", { name: "ביטול" }).click();
  await expect(page.getByRole("button", { name: "העברה לארכיון" })).toBeVisible();

  await page.getByRole("button", { name: "העברה לארכיון" }).click();
  await expect(page.getByRole("button", { name: "החזרה מהארכיון" })).toBeVisible();

  // UAT-03: the list has "פעילים / הושלמו / ארכיון" tabs; archived projects are in "ארכיון".
  await page.goto("/projects");
  await expect(page.getByText("אין פרויקטים פעילים.")).toBeVisible();
  await page.getByRole("navigation", { name: "מצב הפרויקטים" }).getByRole("link", { name: /ארכיון/ }).click();
  const archived = page.getByRole("list", { name: "פרויקטים בארכיון" });
  await expect(archived.getByRole("link", { name: RENAMED })).toBeVisible();

  // Not offered in pickers; its tasks stay in the Tasks list with their project.
  await page.goto("/tasks");
  await page.getByRole("button", { name: "משימה חדשה" }).click();
  const dialog = page.getByRole("dialog", { name: "משימה חדשה" });
  await dialog.getByRole("button", { name: "פרטים נוספים" }).click();
  await expect(dialog.getByRole("combobox", { name: "פרויקט" }).locator("option", { hasText: RENAMED })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(taskRow(page, "Review API integration")).toContainText(RENAMED);
  expect((await getTaskByTitle("Review API integration")).status).toBe("todo");

  await openProject(page, RENAMED, "archived");
  await page.getByRole("button", { name: "החזרה מהארכיון" }).click();
  await expect(page.getByRole("button", { name: "העברה לארכיון" })).toBeVisible();
  await expect(page.getByRole("button", { name: "משימה חדשה" })).toBeVisible();
});

test("list shows mixed-direction names, progress and counts", async ({ page }) => {
  await seedProject("Review API integration");
  const q4 = await seedProject("מערכת ניהול Q4");
  await seedTasks([
    { title: "Q4 task done", deadline: plusDays(today, 3), status: "done", project_id: q4.id },
    { title: "Q4 task late", deadline: plusDays(today, -1), project_id: q4.id },
  ]);
  await page.goto("/projects");
  const list = page.getByRole("list", { name: "פרויקטים פעילים" });
  for (const name of [RENAMED, "Review API integration", "מערכת ניהול Q4"]) {
    await expect(list.locator("bdi", { hasText: name })).toHaveText(name);
  }
  const q4Row = list.getByRole("listitem").filter({ hasText: "מערכת ניהול Q4" });
  await expect(q4Row).toContainText("1 מתוך 2 הושלמו");
  await expect(q4Row).toContainText("פתוחה אחת");
  await expect(q4Row).toContainText("אחת באיחור");
  await expect(list.getByRole("listitem").filter({ hasText: "Review API integration" })).toContainText("אין משימות עדיין");
  await expectNoAxeViolations(page);
});

test("global search result opens the project page; back returns", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "חיפוש משימות ופרויקטים" });
  await search.fill("ניהול");
  await search.press("Enter");
  const projects = page.getByRole("region", { name: /פרויקטים/ });
  await projects.getByRole("link", { name: "מערכת ניהול Q4" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "מערכת ניהול Q4" })).toBeFocused();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/search\?q=/);
});

test("delete a project: its tasks stay, without the project", async ({ page }) => {
  const doomed = await seedProject("למחיקה");
  await seedTasks([{ title: "survivor task", deadline: plusDays(today, 4), project_id: doomed.id, is_important: true }]);
  await openProject(page, "למחיקה");

  await page.getByRole("button", { name: "מחיקה" }).click();
  const confirm = page.getByRole("dialog", { name: "למחוק את הפרויקט?" });
  await expect(confirm).toContainText("המשימה שלו לא תימחק, היא רק תישאר בלי פרויקט.");
  await confirm.getByRole("button", { name: "ביטול" }).click();
  await expect(page.getByRole("button", { name: "מחיקה" })).toBeFocused();

  await page.getByRole("button", { name: "מחיקה" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "מחיקת הפרויקט" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByText("נמחק.")).toBeVisible();
  await expect(page.getByRole("link", { name: "למחיקה" })).toHaveCount(0);
  expect(await getTaskByTitle("survivor task")).toMatchObject({ project_id: null, is_important: true, status: "todo" });

  // The deleted project's URL is now "not found".
  await page.goto(`/projects/${doomed.id}`);
  await expect(page.getByRole("heading", { name: "הפרויקט לא קיים." })).toBeVisible();
});

test("the project page leaves out the Project column the Tasks page shows", async ({ page }) => {
  const scoped = await seedProject("פרויקט בלי עמודה");
  await seedTasks([{ title: "משימה בהיקף הפרויקט", deadline: plusDays(today, 3), project_id: scoped.id }]);
  await openProject(page, "פרויקט בלי עמודה");
  const table = page.locator("table").filter({ visible: true });
  await expect(table.getByRole("link", { name: "משימה בהיקף הפרויקט" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "פרויקט" })).toHaveCount(0);
  await expect(table.getByRole("link", { name: "פרויקט בלי עמודה" })).toHaveCount(0);
  await page.goto("/tasks");
  await expect(page.locator("table").filter({ visible: true }).getByRole("columnheader", { name: "פרויקט" })).toBeVisible();
});

test("not found: unknown and malformed ids", async ({ page }) => {
  await page.goto("/projects/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "הפרויקט לא קיים." })).toBeVisible();
  await page.goto("/projects/not-a-project");
  await expect(page.getByRole("heading", { name: "הפרויקט לא קיים." })).toBeVisible();
});

test.describe("small screens", () => {
  test("375: drawer navigation, list and detail", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.getByRole("button", { name: "פתיחת תפריט הניווט" }).click();
    await page.getByRole("dialog", { name: "ניווט" }).getByRole("link", { name: "פרויקטים" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "פרויקטים" })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole("link", { name: RENAMED }).click();
    await expect(page.getByRole("heading", { level: 1, name: RENAMED })).toBeVisible();
    await expect(page.getByRole("list", { name: "רשימת המשימות" })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("320: no horizontal scroll on the list and a long-named project page", async ({ page }) => {
    const long = await seedProject(`Quarterly roadmap planning ${"א".repeat(40)} Extended`);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/projects");
    await expect(page.locator("#main h1")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.goto(`/projects/${long.id}`);
    await expect(page.locator("#main h1")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("1280, 1024 and 768: Tasks, list and detail render without horizontal scroll", async ({ page }) => {
    for (const width of [1280, 1024, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/tasks?done=1");
      await expect(page.locator("#main h1")).toBeVisible();
      await expectNoHorizontalScroll(page);
      await page.goto("/projects");
      await expectNoHorizontalScroll(page);
      await page.getByRole("link", { name: RENAMED }).click();
      await expect(page.getByRole("heading", { level: 1, name: RENAMED })).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
  });
});
