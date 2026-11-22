import { expect, test, type Page } from "@playwright/test";
import {
  archiveProject,
  e2eDb,
  findTemplateByName,
  jerusalemToday,
  plusDays,
  resetE2EData,
  seedCategory,
  seedProject,
  seedTemplate,
  setDefaultHorizon,
  tasksByTitle,
} from "./db";
import { expectNoAxeViolations, expectNoHorizontalScroll, trackConsoleErrors } from "./helpers";

// Phase 8 Templates. Serial: the tests share (and reset) the E2E user's data.
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 1000 } });

const today = jerusalemToday();
const NAME = "דוח שבועי Weekly";
const TITLE = "הכנת Weekly report לצוות";

let consoleErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  consoleErrors = trackConsoleErrors(page);
  await resetE2EData();
});
test.afterEach(() => {
  expect(consoleErrors, "console errors").toEqual([]);
});

// Visible only: Next.js may keep the previous page in the DOM, hidden.
const templateRow = (page: Page, name: string) =>
  page.getByRole("list", { name: "רשימת התבניות" }).getByRole("listitem").filter({ hasText: name }).filter({ visible: true });

async function openInstantiate(page: Page, name: string) {
  await templateRow(page, name).getByRole("button", { name: `יצירת משימה מהתבנית: ${name}` }).click();
  const dialog = page.getByRole("dialog", { name: "משימה חדשה מתבנית" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("empty Templates view", async ({ page }) => {
  await page.goto("/templates");
  await expect(page.getByRole("heading", { level: 1, name: "תבניות" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "עדיין אין תבניות." })).toBeVisible();
  await expect(page.getByRole("button", { name: "תבנית חדשה" })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("create a template by keyboard, with validation and a unique name", async ({ page }) => {
  await seedCategory("עבודה");
  await seedProject("פרויקט My Dashboard");
  await seedTemplate({ name: "קיימת", title: "x" });
  await page.goto("/templates");

  await page.getByRole("button", { name: "תבנית חדשה" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "תבנית חדשה" });
  const name = dialog.getByRole("textbox", { name: /שם התבנית/ });
  await expect(name).toBeFocused();

  // Empty submit: both required fields are flagged, with a focused summary.
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("alert")).toContainText("לא ניתן לשמור");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByRole("textbox", { name: /כותרת המשימה/ })).toHaveAccessibleDescription("יש להזין כותרת למשימה.");

  await name.fill("קיימת");
  await dialog.getByRole("textbox", { name: /כותרת המשימה/ }).fill(TITLE);
  await dialog.getByRole("button", { name: "יצירת תבנית" }).click();
  await expect(name).toHaveAccessibleDescription("כבר קיימת תבנית בשם הזה.");

  await name.fill(NAME);
  await dialog.getByText("עבודה", { exact: true }).click();
  await dialog.getByRole("combobox", { name: "פרויקט" }).selectOption({ label: "פרויקט My Dashboard" });
  await dialog.getByRole("textbox", { name: "תיאור" }).fill("לצרף את הנתונים מ-BI");
  await dialog.getByRole("checkbox", { name: "חשובה" }).check();
  await name.press("Enter");

  await expect(dialog).toBeHidden();
  await expect(page.getByText("נוצרה.")).toBeVisible();
  const row = templateRow(page, NAME);
  await expect(row).toContainText(`משימה: ${TITLE}`);
  await expect(row).toContainText("פרויקט My Dashboard");
  await expect(row).toContainText("עבודה");
  await expect(row).toContainText("חשובה");
  expect(await findTemplateByName(NAME)).toMatchObject({ title: TITLE, notes: "לצרף את הנתונים מ-BI", is_important: true });
  await expectNoAxeViolations(page);
});

test("instantiate: a pre-filled, editable form; each use creates exactly one independent task", async ({ page }) => {
  const project = await seedProject("פרויקט My Dashboard");
  const category = await seedCategory("עבודה");
  await seedTemplate({
    name: NAME,
    title: TITLE,
    notes: "פרטים מהתבנית",
    is_important: true,
    project_id: project.id,
    category_id: category.id,
  });
  await page.goto("/templates");

  const dialog = await openInstantiate(page, NAME);
  // The deadline (today + the default horizon of 7) has focus; every field is pre-filled.
  await expect(dialog.getByRole("radio", { name: "בעוד שבוע" })).toBeFocused();
  await expect(dialog.getByRole("radio", { name: "בעוד שבוע" })).toBeChecked();
  await expect(dialog.getByRole("textbox", { name: /כותרת/ })).toHaveValue(TITLE);
  await expect(dialog.getByRole("textbox", { name: "תיאור" })).toHaveValue("פרטים מהתבנית");
  await expect(dialog.getByRole("checkbox", { name: "חשובה" })).toBeChecked();
  await expect(dialog.getByRole("combobox", { name: "פרויקט" })).toHaveValue(project.id);
  await expect(dialog.getByRole("combobox", { name: "סטטוס" })).toHaveValue("todo");
  await expect(dialog.getByRole("radio", { name: "עבודה" })).toBeChecked();
  await expect(dialog).toContainText("המשימה תהיה עצמאית");

  // Fields stay editable before creation.
  await dialog.getByText("מחר", { exact: true }).click();
  await dialog.getByRole("button", { name: "יצירת משימה" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("נוצרה.")).toBeVisible();

  // A second use creates a second, separate task with the default deadline.
  await openInstantiate(page, NAME);
  await page.getByRole("dialog").getByRole("button", { name: "יצירת משימה" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await expect.poll(async () => (await tasksByTitle(TITLE)).length).toBe(2);
  const [first, second] = await tasksByTitle(TITLE);
  const shared = {
    notes: "פרטים מהתבנית",
    is_important: true,
    project_id: project.id,
    category_id: category.id,
    status: "todo",
    urgent_override: null,
    start_date: null,
    completed_at: null,
  };
  expect(first).toMatchObject({ ...shared, deadline: plusDays(today, 1) });
  expect(second).toMatchObject({ ...shared, deadline: plusDays(today, 7) });
});

test("editing and deleting the template leave earlier tasks unchanged", async ({ page }) => {
  await seedTemplate({ name: NAME, title: TITLE, notes: "גרסה 1" });
  await page.goto("/templates");
  await openInstantiate(page, NAME);
  await page.getByRole("dialog").getByRole("button", { name: "יצירת משימה" }).click();
  await expect.poll(async () => (await tasksByTitle(TITLE)).length).toBe(1);
  const [before] = await tasksByTitle(TITLE);

  await templateRow(page, NAME).getByRole("button", { name: `עריכה של התבנית ${NAME}` }).click();
  const edit = page.getByRole("dialog", { name: "עריכת תבנית" });
  await expect(edit).toContainText("משימות שכבר נוצרו מהתבנית לא ישתנו.");
  await edit.getByRole("textbox", { name: /כותרת המשימה/ }).fill("כותרת אחרי עריכה");
  await edit.getByRole("textbox", { name: "תיאור" }).fill("גרסה 2");
  await edit.getByRole("checkbox", { name: "חשובה" }).check();
  await edit.getByRole("button", { name: "שמירה" }).click();
  await expect(edit).toBeHidden();
  await expect(templateRow(page, NAME)).toContainText("משימה: כותרת אחרי עריכה");
  expect((await tasksByTitle(TITLE))[0]).toEqual(before);

  // Delete: cancel first, then confirm. Focus moves to the list area.
  await templateRow(page, NAME).getByRole("button", { name: `מחיקה של התבנית ${NAME}` }).click();
  const confirm = page.getByRole("dialog", { name: "למחוק את התבנית?" });
  await expect(confirm).toContainText("משימות שכבר נוצרו ממנה לא ישתנו.");
  await confirm.getByRole("button", { name: "ביטול" }).click();
  await expect(templateRow(page, NAME)).toBeVisible();
  await templateRow(page, NAME).getByRole("button", { name: `מחיקה של התבנית ${NAME}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "מחיקת התבנית" }).click();
  await expect(page.getByText("נמחקה.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "עדיין אין תבניות." })).toBeVisible();
  await expect(page.locator("#templates-list")).toBeFocused();
  expect(await findTemplateByName(NAME)).toBeNull();
  expect((await tasksByTitle(TITLE))[0]).toEqual(before);
});

test("an archived project is left empty, with a note; the template keeps it", async ({ page }) => {
  const project = await seedProject("Q4 תכנון קורס");
  await seedTemplate({ name: NAME, title: TITLE, project_id: project.id });
  await archiveProject(project.id);
  await page.goto("/templates");
  await expect(templateRow(page, NAME)).toContainText("Q4 תכנון קורס (בארכיון)");

  const dialog = await openInstantiate(page, NAME);
  await expect(dialog).toContainText("הפרויקט של התבנית בארכיון, ולכן המשימה תיווצר בלי פרויקט.");
  await expect(dialog.getByRole("combobox", { name: "פרויקט" })).toHaveValue("");
  await dialog.getByRole("button", { name: "יצירת משימה" }).click();
  await expect.poll(async () => (await tasksByTitle(TITLE)).length).toBe(1);
  expect((await tasksByTitle(TITLE))[0]).toMatchObject({ project_id: null });

  // Editing the template still shows its archived project, marked.
  await templateRow(page, NAME).getByRole("button", { name: `עריכה של התבנית ${NAME}` }).click();
  const edit = page.getByRole("dialog", { name: "עריכת תבנית" });
  await expect(edit.getByRole("combobox", { name: "פרויקט" })).toHaveValue(project.id);
  await expect(edit.getByRole("option", { name: "Q4 תכנון קורס (בארכיון)" })).toBeAttached();
});

test("busy dialogs: a double submit creates one template; a failed delete keeps focus on its button", async ({ page }) => {
  await page.goto("/templates");
  await page.getByRole("button", { name: "תבנית חדשה" }).click();
  const dialog = page.getByRole("dialog", { name: "תבנית חדשה" });
  await dialog.getByRole("textbox", { name: /שם התבנית/ }).fill(NAME);
  await dialog.getByRole("textbox", { name: /כותרת המשימה/ }).fill(TITLE);
  await dialog.getByRole("button", { name: "יצירת תבנית" }).dblclick();
  await expect(dialog).toBeHidden();
  await expect(templateRow(page, NAME)).toBeVisible();
  const db = await e2eDb();
  const { count } = await db.from("task_templates").select("id", { count: "exact", head: true }).eq("name", NAME);
  expect(count).toBe(1);

  // The template disappears behind the open confirmation: the delete fails, focus stays put.
  await templateRow(page, NAME).getByRole("button", { name: `מחיקה של התבנית ${NAME}` }).click();
  const confirm = page.getByRole("dialog", { name: "למחוק את התבנית?" });
  await db.from("task_templates").delete().eq("name", NAME);
  const button = confirm.getByRole("button", { name: "מחיקת התבנית" });
  await button.click();
  await expect(confirm.getByRole("alert")).toHaveText("התבנית לא נמצאה. ייתכן שנמחקה.");
  await expect(button).toBeFocused();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
});

test("the deadline follows the user's default horizon", async ({ page }) => {
  await setDefaultHorizon(3);
  await seedTemplate({ name: NAME, title: TITLE });
  await page.goto("/templates");
  const dialog = await openInstantiate(page, NAME);
  await expect(dialog).toContainText(`${plusDays(today, 3).split("-").reverse().join(".")} · ברירת המחדל`);
  await dialog.getByRole("button", { name: "יצירת משימה" }).click();
  await expect.poll(async () => (await tasksByTitle(TITLE))[0]?.deadline).toBe(plusDays(today, 3));
});

test("global search finds a template and opens its row", async ({ page }) => {
  const template = await seedTemplate({ name: NAME, title: TITLE });
  await page.goto("/search?q=Weekly");
  await page.getByRole("link", { name: NAME }).click();
  await expect(page).toHaveURL(new RegExp(`/templates#template-${template.id}$`));
  await expect(templateRow(page, NAME)).toBeInViewport();
});

test("375 and 320: no horizontal scroll, axe on mobile", async ({ page }) => {
  const project = await seedProject("Quarterly Planning פרויקט ארוך מאוד לבדיקת שבירת שורות");
  await seedTemplate({
    name: "Template with a deliberately long English name ותוספת בעברית",
    title: "Prepare quarterly OKR review with a long title עם המשך בעברית",
    project_id: project.id,
    is_important: true,
  });
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/templates");
    await expect(page.getByRole("list", { name: "רשימת התבניות" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
  await page.setViewportSize({ width: 375, height: 800 });
  await expectNoAxeViolations(page);
});
