import { expect, test, type Page } from "@playwright/test";
import {
  ddmmyyyy,
  findTaskByTitle,
  getTaskByTitle,
  jerusalemToday,
  plusDays,
  resetE2EData,
  seedCategory,
  seedProject,
  seedTasks,
} from "./db";
import { expectNoAxeViolations, expectNoHorizontalScroll } from "./helpers";

// Phase 5 workflows. Serial: the tests share (and reset) the E2E user's data.
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });

const today = jerusalemToday();

async function openQuickCreate(page: Page) {
  await page.getByRole("button", { name: "משימה חדשה" }).click();
  const dialog = page.getByRole("dialog", { name: "משימה חדשה" });
  await expect(dialog).toBeVisible();
  return dialog;
}

function row(page: Page, title: string) {
  return page.locator("table tbody tr", { has: page.locator("bdi", { hasText: title }) });
}

const urgency = (page: Page) => page.getByRole("group", { name: "דחיפות" });
const deadlineGroup = (page: Page) => page.getByRole("group", { name: /מועד/ });

test.beforeAll(async () => {
  await resetE2EData();
});

test("empty state when the user has no tasks", async ({ page }) => {
  await page.goto("/tasks");
  await expect(page.getByRole("heading", { level: 2, name: "עדיין אין משימות." })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("quick create: title + Enter creates a task with the default deadline", async ({ page }) => {
  await page.goto("/tasks");
  const dialog = await openQuickCreate(page);
  const title = dialog.getByRole("textbox", { name: /כותרת/ });
  await expect(title).toBeFocused();
  // Only title, deadline and category are visible; the rest is behind "פרטים נוספים".
  await expect(dialog.getByRole("combobox", { name: "פרויקט" })).toBeHidden();
  await expect(dialog.getByRole("button", { name: "פרטים נוספים" })).toHaveAttribute("aria-expanded", "false");
  await expect(dialog.getByText("ברירת המחדל")).toBeVisible();

  await title.fill("Review PR for API — סקירה");
  await title.press("Enter");

  await expect(dialog).toBeHidden();
  await expect(page.getByText("נוצרה.")).toBeVisible();
  const created = row(page, "Review PR for API — סקירה");
  await expect(created).toContainText(`בעוד 7 ימים · ${ddmmyyyy(plusDays(today, 7))}`);
  await expect(created).toContainText("לביצוע");

  const task = await getTaskByTitle("Review PR for API — סקירה");
  expect(task).toMatchObject({ deadline: plusDays(today, 7), urgent_override: null, status: "todo", category_id: null });
  // Mixed Hebrew/English title is isolated in <bdi>, text unchanged.
  await expect(created.locator("bdi").first()).toHaveText("Review PR for API — סקירה");
});

test("quick create: validation errors are summarized, linked and focused", async ({ page }) => {
  await page.goto("/tasks");
  const dialog = await openQuickCreate(page);
  await dialog.getByRole("button", { name: "יצירת משימה" }).click();

  const summary = dialog.getByRole("alert");
  await expect(summary).toBeFocused();
  await expect(summary).toContainText("יש להזין כותרת.");
  const title = dialog.getByRole("textbox", { name: /כותרת/ });
  await expect(title).toHaveAttribute("aria-invalid", "true");
  await summary.getByRole("link", { name: "יש להזין כותרת." }).click();
  await expect(title).toBeFocused();

  // Start date after the deadline (deadline = today, start = tomorrow).
  await title.fill("בדיקת תאריכים");
  await dialog.getByText("היום", { exact: true }).click();
  await dialog.getByRole("button", { name: "פרטים נוספים" }).click();
  await dialog.getByRole("button", { name: /תאריך התחלה/ }).click();
  const calendar = page.getByRole("grid");
  await expect(calendar).toBeVisible();
  await page.keyboard.press("ArrowLeft"); // RTL: ← = next day
  await page.keyboard.press("Enter");
  await dialog.getByRole("button", { name: "יצירת משימה" }).click();
  await expect(dialog.getByRole("alert")).toContainText("תאריך ההתחלה לא יכול להיות אחרי המועד.");
  await expectNoAxeViolations(page);
});

test("quick create by keyboard only, with details and RTL date picker keys", async ({ page }) => {
  await page.goto("/tasks");
  await page.getByRole("button", { name: "משימה חדשה" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "משימה חדשה" });
  await page.keyboard.type("Quarterly report Q4 — דוח רבעוני");

  // Deadline chips are a radio group: in RTL, → moves to the previous chip ("מחר").
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("radio", { name: "בעוד שבוע" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("radio", { name: "מחר" })).toBeChecked();
  await expect(dialog.getByText(ddmmyyyy(plusDays(today, 1)), { exact: false }).first()).toBeVisible();

  // "תאריך אחר…": calendar keys follow RTL (← next day, PageDown next month).
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: /תאריך אחר/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("grid")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(dialog.getByText(ddmmyyyy(plusDays(today, 2))).first()).toBeVisible();

  // Open details and mark Important, still by keyboard.
  const details = dialog.getByRole("button", { name: "פרטים נוספים" });
  await details.focus();
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("aria-expanded", "true");
  await dialog.getByRole("checkbox", { name: "חשובה" }).focus();
  await page.keyboard.press("Space");
  await dialog.getByRole("textbox", { name: /כותרת/ }).focus();
  await page.keyboard.press("Enter");

  await expect(dialog).toBeHidden();
  const task = await getTaskByTitle("Quarterly report Q4 — דוח רבעוני");
  expect(task).toMatchObject({ deadline: plusDays(today, 2), is_important: true });
});

test("inline category creation from Quick Create selects the new category", async ({ page }) => {
  await page.goto("/tasks");
  const dialog = await openQuickCreate(page);
  await dialog.getByRole("textbox", { name: /כותרת/ }).fill("משימה עם קטגוריה");
  await dialog.getByRole("button", { name: "קטגוריה חדשה" }).click();
  const nameInput = dialog.getByRole("textbox", { name: "שם הקטגוריה החדשה" });
  await expect(nameInput).toBeFocused();
  await nameInput.fill("עבודה");
  await nameInput.press("Enter"); // creates the category, not the task
  await expect(dialog.getByRole("radio", { name: "עבודה" })).toBeChecked();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "יצירת משימה" }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, "משימה עם קטגוריה")).toContainText("עבודה");
});

test("edit: change fields, status and urgency; a deadline change clears the override", async ({ page }) => {
  await page.goto("/tasks");
  await row(page, "Review PR for API — סקירה").getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1, name: "עריכת משימה" })).toBeVisible();

  // Manual urgency on a task due in 7 days.
  await expect(page.getByRole("radio", { name: "אוטומטי (כרגע: לא דחופה)" })).toBeChecked();
  await urgency(page).getByText("דחופה", { exact: true }).click();
  await page.getByRole("combobox", { name: "סטטוס" }).selectOption("in_progress");
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByText("השינויים נשמרו.")).toBeVisible();
  expect(await getTaskByTitle("Review PR for API — סקירה")).toMatchObject({
    urgent_override: true,
    status: "in_progress",
  });

  // Changing the deadline warns, and saving clears the override.
  await deadlineGroup(page).getByText("מחר", { exact: true }).click();
  await expect(page.getByText("שינוי המועד יחזיר את הדחיפות לחישוב אוטומטי.")).toBeVisible();
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByRole("radio", { name: "אוטומטי (כרגע: דחופה)" })).toBeChecked();
  expect(await getTaskByTitle("Review PR for API — סקירה")).toMatchObject({
    urgent_override: null,
    deadline: plusDays(today, 1),
  });

  // Set "not urgent", then clear back to automatic.
  await urgency(page).getByText("לא דחופה", { exact: true }).click();
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect.poll(async () => (await getTaskByTitle("Review PR for API — סקירה")).urgent_override).toBe(false);
  await urgency(page).getByText(/^אוטומטי/).click();
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect.poll(async () => (await getTaskByTitle("Review PR for API — סקירה")).urgent_override).toBeNull();

  // Title edit persists across reload.
  const title = page.getByRole("textbox", { name: /כותרת/ });
  await title.fill("Review PR for API — סקירה מעודכנת");
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect.poll(async () => (await findTaskByTitle("Review PR for API — סקירה מעודכנת"))?.title).toBe(
    "Review PR for API — סקירה מעודכנת",
  );
  await page.reload();
  await expect(page.getByRole("textbox", { name: /כותרת/ })).toHaveValue("Review PR for API — סקירה מעודכנת");
  await expectNoAxeViolations(page);
});

test("overdue display: no Urgent badge; a manual override is subtle metadata", async ({ page }) => {
  await seedTasks([
    { title: "באיחור עם דחיפות ידנית", deadline: plusDays(today, -3), urgent_override: true },
    { title: "באיחור ולא דחופה", deadline: plusDays(today, -1), urgent_override: false },
    { title: "דחופה ידנית רחוקה", deadline: plusDays(today, 30), urgent_override: true },
  ]);
  await page.goto("/tasks");

  const overdueManual = row(page, "באיחור עם דחיפות ידנית");
  await expect(overdueManual).toContainText(`באיחור של 3 ימים · ${ddmmyyyy(plusDays(today, -3))}`);
  await expect(overdueManual.getByText("דחופה", { exact: true })).toHaveCount(0);
  await expect(overdueManual).toContainText("ידני");
  await expect(overdueManual).toContainText("דחיפות: ידנית (דחופה)");

  // urgent_override = false never hides Overdue.
  await expect(row(page, "באיחור ולא דחופה")).toContainText("באיחור של יום");

  // A non-overdue manual urgency shows "דחופה · ידני".
  const manual = row(page, "דחופה ידנית רחוקה");
  await expect(manual).toContainText("דחופה");
  await expect(manual).toContainText("ידני");

  // The edit form keeps the override as subtle metadata.
  await overdueManual.getByRole("link").click();
  await expect(page.getByText("דחיפות: ידנית. המשימה באיחור, ולכן מוצג רק מצב האיחור.")).toBeVisible();
});

test("complete with undo, and reopen", async ({ page }) => {
  await page.goto("/tasks");
  const title = "Review PR for API — סקירה מעודכנת";
  await page.getByRole("button", { name: `סמן כהושלמה: ${title}` }).click();
  await expect(page.getByText("הושלמה.")).toBeVisible();
  await expect(row(page, title)).toHaveCount(0);
  expect((await getTaskByTitle(title)).status).toBe("done");

  await page.getByRole("button", { name: "ביטול" }).click();
  await expect(row(page, title)).toBeVisible();
  // Undo restores the previous status (בתהליך), not just "todo".
  await expect(row(page, title)).toContainText("בתהליך");
  expect(await getTaskByTitle(title)).toMatchObject({ status: "in_progress", completed_at: null });

  // Complete again, then reopen from the completed view.
  await page.getByRole("button", { name: `סמן כהושלמה: ${title}` }).click();
  await expect(row(page, title)).toHaveCount(0);
  await page.getByRole("checkbox", { name: "הצג משימות שהושלמו" }).check();
  await expect(page).toHaveURL(/done=1/);
  await expect(row(page, title)).toContainText("הושלמה");
  await page.getByRole("button", { name: `בטל השלמה: ${title}` }).click();
  await expect(page.getByText("הוחזרה לביצוע.")).toBeVisible();
  await expect(row(page, title)).toContainText("לביצוע");
});

test("delete with confirmation (cancel keeps the task)", async ({ page }) => {
  await seedTasks([{ title: "משימה למחיקה", deadline: plusDays(today, 5) }]);
  await page.goto("/tasks");
  await row(page, "משימה למחיקה").getByRole("link").click();

  await page.getByRole("button", { name: "מחיקה", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "למחוק את המשימה?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "ביטול" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole("button", { name: "מחיקה" })).toBeFocused();

  await page.getByRole("button", { name: "מחיקה" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "מחיקת המשימה" }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByText("נמחקה.")).toBeVisible();
  await expect(row(page, "משימה למחיקה")).toHaveCount(0);
});

test.describe("filters and sorting", () => {
  test.beforeAll(async () => {
    await resetE2EData();
    const home = await seedCategory("בית");
    const work = await seedCategory("עבודה");
    const site = await seedProject("Website אתר");
    await seedTasks([
      { title: "A overdue important home", deadline: plusDays(today, -2), is_important: true, category_id: home.id },
      { title: "B overdue work", deadline: plusDays(today, -1), category_id: work.id },
      { title: "C today important work", deadline: today, is_important: true, category_id: work.id, project_id: site.id },
      { title: "D waiting next week", deadline: plusDays(today, 6), status: "waiting", category_id: home.id },
      { title: "E far important", deadline: plusDays(today, 40), is_important: true },
      { title: "F done", deadline: plusDays(today, -5), status: "done", category_id: home.id },
    ]);
  });

  const visibleTitles = async (page: Page) =>
    (await page.locator("table tbody tr td:nth-child(1) bdi").allTextContents()).map((t) => t.trim());

  test("each filter, in the URL, survives reload and back/forward", async ({ page }) => {
    await page.goto("/tasks");
    expect(await visibleTitles(page)).toEqual([
      "A overdue important home",
      "B overdue work",
      "C today important work",
      "D waiting next week",
      "E far important",
    ]);

    await page.getByText("חשובות").click();
    await expect(page).toHaveURL(/important=1/);
    await expect.poll(() => visibleTitles(page)).toEqual(["A overdue important home", "C today important work", "E far important"]);

    await page.getByText("באיחור", { exact: true }).click();
    await expect(page).toHaveURL(/important=1&overdue=1/);
    await expect.poll(() => visibleTitles(page)).toEqual(["A overdue important home"]);

    await page.reload();
    await expect(page.getByRole("checkbox", { name: "חשובות" })).toBeChecked();
    await expect.poll(() => visibleTitles(page)).toEqual(["A overdue important home"]);

    await page.goBack();
    await expect(page).not.toHaveURL(/overdue=1/);
    await expect.poll(() => visibleTitles(page)).toEqual(["A overdue important home", "C today important work", "E far important"]);
    await page.goForward();
    await expect.poll(() => visibleTitles(page)).toEqual(["A overdue important home"]);
  });

  test("combinations: category + status + due range; project; text; urgent", async ({ page }) => {
    await page.goto("/tasks");
    await page.getByRole("combobox", { name: "קטגוריה" }).selectOption({ label: "בית" });
    await expect.poll(() => visibleTitles(page)).toEqual(["A overdue important home", "D waiting next week"]);

    await page.getByRole("button", { name: /סטטוס/ }).click();
    await page.getByRole("checkbox", { name: "ממתינה" }).check();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/status=waiting/);
    await expect.poll(() => visibleTitles(page)).toEqual(["D waiting next week"]);

    await page.getByRole("combobox", { name: "מועד" }).selectOption("today");
    await expect.poll(() => visibleTitles(page)).toEqual([]);
    await expect(page.getByRole("heading", { name: "לא נמצאו משימות." })).toBeVisible();
    await page.getByRole("link", { name: "ניקוי הסינון" }).click();
    await expect(page).toHaveURL(/\/tasks$/);

    await page.goto("/tasks?due=today");
    expect(await visibleTitles(page)).toEqual(["C today important work"]);
    await page.goto(`/tasks?project=${encodeURIComponent((await page.locator("#filter-project option", { hasText: "Website" }).getAttribute("value")) ?? "")}`);
    expect(await visibleTitles(page)).toEqual(["C today important work"]);

    await page.goto("/tasks?urgent=1");
    expect(await visibleTitles(page)).toEqual(["A overdue important home", "B overdue work", "C today important work"]);

    await page.goto("/tasks");
    await page.getByRole("searchbox", { name: "חיפוש במשימות" }).fill("work");
    await expect(page).toHaveURL(/q=work/);
    await expect.poll(() => visibleTitles(page)).toEqual(["B overdue work", "C today important work"]);
    await expectNoAxeViolations(page);
  });

  test("show completed, status Done, and sorting with aria-sort", async ({ page }) => {
    await page.goto("/tasks?done=1");
    expect(await visibleTitles(page)).toContain("F done");

    await page.goto("/tasks");
    await page.getByRole("link", { name: /^כותרת/ }).click();
    await expect(page).toHaveURL(/sort=title/);
    await expect(page.getByRole("columnheader", { name: /כותרת/ })).toHaveAttribute("aria-sort", "ascending");
    await page.getByRole("link", { name: /^כותרת/ }).click();
    await expect(page).toHaveURL(/sort=title&dir=desc/);
    await expect(page.getByRole("columnheader", { name: /כותרת/ })).toHaveAttribute("aria-sort", "descending");
    await expect.poll(async () => (await visibleTitles(page))[0]).toBe("E far important");

    await page.getByRole("combobox", { name: "מיון" }).selectOption("created");
    await expect(page).toHaveURL(/sort=created/);
  });
});

test("global search covers tasks and projects, marks Done tasks", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "חיפוש משימות ופרויקטים" });
  await search.fill("website");
  await expect(search).toHaveValue("website");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=website$/);
  await expect(page.getByRole("heading", { level: 2, name: /פרויקטים/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Website אתר" })).toBeVisible();

  await page.goto("/search?q=DONE");
  await expect(page.getByRole("heading", { level: 2, name: /משימות/ })).toBeVisible();
  const done = page.getByRole("listitem").filter({ hasText: "F done" });
  await expect(done).toContainText("הושלמה");

  // Wildcards are matched literally.
  await page.goto("/search?q=%25");
  await expect(page.getByRole("status")).toContainText("לא נמצאו תוצאות");
  await expectNoAxeViolations(page);
});

test("categories: create, rename, duplicate error, delete keeps tasks", async ({ page }) => {
  await page.goto("/settings");
  const input = page.getByRole("textbox", { name: "קטגוריה חדשה" });
  await input.fill("Personal אישי");
  await page.getByRole("button", { name: "הוספה" }).click();
  const list = page.getByRole("list", { name: "קטגוריות" });
  await expect(list.getByText("Personal אישי")).toBeVisible();

  await input.fill("בית");
  await page.getByRole("button", { name: "הוספה" }).click();
  await expect(page.getByText("כבר קיימת קטגוריה בשם הזה.")).toBeVisible();
  await expect(input).toHaveAttribute("aria-invalid", "true");

  await page.getByRole("button", { name: "שינוי שם: Personal אישי" }).click();
  const rename = page.getByRole("textbox", { name: /שם חדש לקטגוריה/ });
  await rename.fill("פרטי");
  await rename.press("Enter");
  await expect(list.getByText("פרטי", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "מחיקה: בית" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "מחיקת הקטגוריה" }).click();
  // While the dialog is open the page behind it is aria-hidden, so wait for it to close and the
  // delete to finish before asserting on the list and the data.
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("נמחקה.")).toBeVisible();
  await expect(list.getByText("בית", { exact: true })).toHaveCount(0);
  // Its tasks still exist, now without a category.
  await expect.poll(async () => (await getTaskByTitle("A overdue important home")).category_id).toBeNull();
  await expectNoAxeViolations(page);
});

test("default deadline horizon affects only new tasks", async ({ page }) => {
  const before = await getTaskByTitle("D waiting next week");
  await page.goto("/settings");
  const horizon = page.getByRole("textbox", { name: /מועד ברירת מחדל/ });

  await horizon.fill("400");
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByText("יש להזין מספר בין 0 ל־365.")).toBeVisible();

  await horizon.fill("3");
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByText("ברירת המחדל של המועד נשמרה.")).toBeVisible();

  await page.goto("/tasks");
  const dialog = await openQuickCreate(page);
  await expect(dialog.getByText(`${ddmmyyyy(plusDays(today, 3))} · ברירת המחדל`)).toBeVisible();
  await page.keyboard.press("Escape");
  expect((await getTaskByTitle("D waiting next week")).deadline).toBe(before.deadline);

  await page.goto("/settings");
  await page.getByRole("textbox", { name: /מועד ברירת מחדל/ }).fill("7");
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByText("ברירת המחדל של המועד נשמרה.")).toBeVisible();
});

test("unknown task id shows the not-found state", async ({ page }) => {
  await page.goto("/tasks/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "המשימה לא קיימת." })).toBeVisible();
});

test.describe("small screens", () => {
  test.beforeAll(async () => {
    if (!(await findTaskByTitle("Small screen — מסך קטן"))) {
      await seedTasks([{ title: "Small screen — מסך קטן", deadline: plusDays(today, -1), is_important: true }]);
    }
  });

  test("375: list layout and Quick Create as a bottom sheet", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/tasks");
    await expect(page.locator("table")).toBeHidden();
    await expect(page.getByRole("list", { name: "רשימת המשימות" })).toBeVisible();
    const dialog = await openQuickCreate(page);
    // Bottom sheet: anchored to the bottom edge once the open animation settles.
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox();
        return box ? Math.round(box.y + box.height) : 0;
      })
      .toBeGreaterThanOrEqual(811);
    await dialog.getByRole("button", { name: "פרטים נוספים" }).click();
    await expectNoAxeViolations(page);
  });

  for (const path of ["/tasks", "/tasks?due=custom&from=2026-01-01", "/settings", "/search?q=work"]) {
    test(`320: no horizontal scroll on ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(path);
      await expect(page.locator("#main h1")).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  }

  test("320: no horizontal scroll on the edit page", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const task = await getTaskByTitle("Small screen — מסך קטן");
    await page.goto(`/tasks/${task.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "עריכת משימה" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
  });
});

// UX remediation (2026-11-03): mobile filter bar, the manual-urgency mark and the completion hit area.
test.describe("remediation", () => {
  const MF = { important: "מסנן חשובה באיחור", importantOnly: "מסנן חשובה בלבד", plain: "מסנן רגילה", urgent: "מסנן דחופה ידנית" };

  test.beforeAll(async () => {
    await resetE2EData();
    await seedTasks([
      { title: MF.important, deadline: plusDays(today, -2), is_important: true },
      { title: MF.importantOnly, deadline: plusDays(today, 9), is_important: true },
      { title: MF.plain, deadline: plusDays(today, 12) },
      { title: MF.urgent, deadline: plusDays(today, 20), urgent_override: true },
    ]);
  });

  const filterButton = (page: Page) => page.getByRole("button", { name: /^סינון/ });
  const listTitles = (page: Page) =>
    page.getByRole("list", { name: "רשימת המשימות" }).filter({ visible: true }).locator("a[href^='/tasks/'] bdi").allTextContents();

  test("375: filters collapse behind \"סינון (N)\"; URL state, AND, reload, back/forward and clear", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/tasks");
    await expect(filterButton(page)).toHaveText("סינון");
    await expect(filterButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("checkbox", { name: "חשובות", exact: true })).toBeHidden();
    // The first task is in the first viewport.
    const firstTask = page.getByRole("list", { name: "רשימת המשימות" }).filter({ visible: true }).getByRole("listitem").first();
    expect((await firstTask.boundingBox())!.y).toBeLessThan(800);
    // Sorting stays available while the filters are collapsed.
    await expect(page.getByRole("combobox", { name: "מיון" })).toBeVisible();

    // Keyboard: the trigger opens the panel and keeps focus.
    await filterButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(filterButton(page)).toHaveAttribute("aria-expanded", "true");
    await expect(filterButton(page)).toBeFocused();
    await page.getByRole("checkbox", { name: "חשובות", exact: true }).check();
    await expect(page).toHaveURL(/important=1/);
    await expect(filterButton(page)).toHaveText("סינון (1)");
    await page.getByRole("checkbox", { name: "באיחור", exact: true }).check();
    await expect(page).toHaveURL(/important=1&overdue=1/);
    await expect(filterButton(page)).toHaveText("סינון (2)");
    // AND: important and overdue.
    await expect.poll(() => listTitles(page)).toEqual([MF.important]);

    await filterButton(page).click();
    await expect(page.getByRole("checkbox", { name: "חשובות", exact: true })).toBeHidden();
    await expect(page.getByText("חשובות · באיחור")).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.reload();
    await expect(filterButton(page)).toHaveText("סינון (2)");
    await page.goBack();
    await expect(page).toHaveURL(/important=1$/);
    await expect(filterButton(page)).toHaveText("סינון (1)");
    await page.goForward();
    await expect(filterButton(page)).toHaveText("סינון (2)");

    await page.getByRole("button", { name: "ניקוי הסינון" }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/tasks$/);
    await expect(filterButton(page)).toHaveText("סינון");
    await expect.poll(async () => (await listTitles(page)).length).toBeGreaterThanOrEqual(4);

    await page.goto("/tasks?completed=week");
    await expect(filterButton(page)).toHaveText("סינון (1)");
    await expect(page.getByText("סינון פעיל: הושלמו השבוע")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("320: several active filters, no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/tasks?status=todo&important=1&overdue=1&due=week&q=%D7%9E%D7%A1%D7%A0%D7%9F");
    await expect(filterButton(page)).toHaveText("סינון (5)");
    await expectNoHorizontalScroll(page);
    await filterButton(page).click();
    await expectNoHorizontalScroll(page);
  });

  test("the manual urgency mark stays on one line in the table", async ({ page }) => {
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/tasks");
      const row = page.locator("table tbody tr", { has: page.locator("bdi", { hasText: MF.urgent }) }).filter({ visible: true });
      // The quick action and its "· ידני" are one unit (UAT-05); it stays on one line.
      const mark = row.locator("[data-urgency]");
      await expect(mark).toContainText("· ידני");
      // One line: no taller than the 32px table action button.
      expect((await mark.boundingBox())!.height).toBeLessThanOrEqual(32);
    }
  });

  test("the completion control: a round button, not a checkbox; ~44px hit area; pointer and keyboard toggle exactly once", async ({ page }) => {
    await page.goto("/tasks");
    // UAT-01: it must not read as row selection: no checkbox role anywhere for completion.
    await expect(page.getByRole("checkbox", { name: new RegExp(MF.plain) })).toHaveCount(0);
    const control = page.getByRole("button", { name: `סמן כהושלמה: ${MF.plain}` }).filter({ visible: true });
    const target = (await control.boundingBox())!;
    expect(target.width).toBeGreaterThanOrEqual(43); // the hit area
    const circle = control.locator("span").first();
    expect(await circle.evaluate((el) => getComputedStyle(el).borderRadius)).not.toBe("0px");
    // A click near the edge of the hit area, off the 20px circle, toggles it once.
    await page.mouse.click(target.x + target.width / 2 + 18, target.y + target.height / 2);
    await expect(page.getByText("הושלמה.")).toBeVisible();
    await expect.poll(async () => (await getTaskByTitle(MF.plain)).status).toBe("done");
    await page.getByRole("button", { name: "ביטול" }).click();
    await expect.poll(async () => (await getTaskByTitle(MF.plain)).status).toBe("todo");
    // Keyboard: Enter on the focused button; the done state is a filled success circle with its check.
    const again = page.getByRole("button", { name: `סמן כהושלמה: ${MF.plain}` }).filter({ visible: true });
    await again.focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await getTaskByTitle(MF.plain)).status).toBe("done");
  });
});

// SKILLS_AUDIT C7: "לביצוע" stays explicit but is quiet text; the other statuses keep their pill.
test("status: To Do is muted text, not a pill; other statuses keep the pill; filters still work", async ({ page }) => {
  await resetE2EData();
  await seedTasks([
    { title: "Review של PR לביצוע", deadline: plusDays(today, 2) },
    { title: "Deploy בתהליך", deadline: plusDays(today, 3), status: "in_progress" },
    { title: "חידוש ממתינה", deadline: plusDays(today, 4), status: "waiting" },
  ]);
  // The table at ≥1024px, the list below it: whichever row is visible.
  const status = (title: string) =>
    page
      .locator("tr, li")
      .filter({ visible: true, has: page.locator("bdi", { hasText: title }) })
      .locator("[data-status]");
  const borderWidth = (title: string) => status(title).evaluate((el) => getComputedStyle(el).borderTopWidth);

  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tasks");
    await expect(status("Review של PR לביצוע")).toHaveText("לביצוע");
    await expect(status("Deploy בתהליך")).toHaveText("בתהליך");
    await expect(status("חידוש ממתינה")).toHaveText("ממתינה");
    expect(await borderWidth("Review של PR לביצוע")).toBe("0px");
    expect(await borderWidth("Deploy בתהליך")).not.toBe("0px");
    expect(await borderWidth("חידוש ממתינה")).not.toBe("0px");
    await expectNoHorizontalScroll(page);
  }
  await expectNoAxeViolations(page);

  // The status filter is unchanged (URL state).
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tasks?status=todo");
  await expect(status("Review של PR לביצוע")).toBeVisible();
  await expect(page.locator("bdi", { hasText: "Deploy בתהליך" })).toHaveCount(0);
});
