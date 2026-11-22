import { expect, test, type Page } from "@playwright/test";
import { e2eDb, getTaskByTitle, jerusalemToday, plusDays, resetE2EData, seedProject, seedTasks } from "./db";
import { expectNoAxeViolations, expectNoHorizontalScroll, trackConsoleErrors } from "./helpers";

// UAT remediation (2026-11-06): the completion control, success color, project completion and
// the quick Important / Urgent actions. Serial: the tests share (and reset) the E2E user's data.
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });

const today = jerusalemToday();

let consoleErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  consoleErrors = trackConsoleErrors(page);
  await resetE2EData();
});
test.afterEach(() => {
  expect(consoleErrors, "console errors").toEqual([]);
});

const visible = (page: Page, role: "button" | "link", name: string | RegExp) =>
  page.getByRole(role, { name }).filter({ visible: true });

async function projectRow(name: string) {
  const db = await e2eDb();
  const { data, error } = await db.from("projects").select("*").eq("name", name).single();
  if (error) throw new Error(`project ${name}: ${error.message}`);
  return data;
}

test.describe("task completion control (UAT-01, UAT-02)", () => {
  for (const width of [1440, 375, 320]) {
    test(`${width}: a round button, complete and undo, success shown without relying on color`, async ({ page }) => {
      await seedTasks([{ title: "Review של PR #42", deadline: plusDays(today, 3) }]);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/tasks?done=1");
      const complete = visible(page, "button", "סמן כהושלמה: Review של PR #42");
      const box = (await complete.boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(43);
      await complete.focus();
      await page.keyboard.press("Enter");
      await expect.poll(async () => (await getTaskByTitle("Review של PR #42")).status).toBe("done");
      // Done: the control's name flips, the circle is filled with a check, the row says "הושלמה".
      const undo = visible(page, "button", "בטל השלמה: Review של PR #42");
      await expect(undo).toBeVisible();
      const circle = undo.locator("span").first();
      expect(await circle.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(21, 128, 61)");
      await expect(undo.locator("svg")).toHaveCount(1);
      await expect(page.locator("[data-status=done]").filter({ visible: true })).toHaveText("הושלמה");
      await expect(page.getByText("הושלמה.").filter({ visible: true })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
      await undo.click();
      await expect.poll(async () => (await getTaskByTitle("Review של PR #42")).status).toBe("todo");
    });
  }
});

test.describe("quick Important / Urgent (UAT-05)", () => {
  test("Important: mark, persist across reload, and remove", async ({ page }) => {
    await seedTasks([{ title: "חידוש ביטוח Car", deadline: plusDays(today, 10) }]);
    await page.goto("/tasks");
    await visible(page, "button", "סמן כחשובה: חידוש ביטוח Car").click();
    await expect.poll(async () => (await getTaskByTitle("חידוש ביטוח Car")).is_important).toBe(true);
    await page.reload();
    await visible(page, "button", "בטל חשיבות: חידוש ביטוח Car").click();
    await expect.poll(async () => (await getTaskByTitle("חידוש ביטוח Car")).is_important).toBe(false);
    await expect(visible(page, "button", "סמן כחשובה: חידוש ביטוח Car")).toBeVisible();
  });

  test("Urgent: manual urgent and back to automatic; never 'not urgent' from the quick action", async ({ page }) => {
    await seedTasks([
      { title: "רחוקה Far", deadline: plusDays(today, 10) },
      { title: "היום Today", deadline: today },
      { title: "ידנית לא דחופה", deadline: plusDays(today, 1), urgent_override: false },
    ]);
    await page.goto("/tasks");

    // Automatic, not urgent → manual urgent → (reload) → automatic again (null, not false).
    await visible(page, "button", "סמן כדחופה: רחוקה Far").click();
    await expect.poll(async () => (await getTaskByTitle("רחוקה Far")).urgent_override).toBe(true);
    await page.reload();
    await visible(page, "button", "חזור לדחיפות אוטומטית: רחוקה Far").click();
    await expect.poll(async () => (await getTaskByTitle("רחוקה Far")).urgent_override).toBeNull();

    // Urgent by its deadline: shown, no quick action that could switch the rule off.
    await expect(visible(page, "button", "סמן כדחופה: היום Today")).toHaveCount(0);
    await expect(visible(page, "button", "חזור לדחיפות אוטומטית: היום Today")).toHaveCount(0);
    await expect(page.getByText("דחופה אוטומטית לפי המועד").first()).toBeAttached();
    expect((await getTaskByTitle("היום Today")).urgent_override).toBeNull();

    // A manual "not urgent" (set in the edit form) → manual urgent → back to automatic, not to false.
    await visible(page, "button", "סמן כדחופה: ידנית לא דחופה").click();
    await expect.poll(async () => (await getTaskByTitle("ידנית לא דחופה")).urgent_override).toBe(true);
    await visible(page, "button", "חזור לדחיפות אוטומטית: ידנית לא דחופה").click();
    await expect.poll(async () => (await getTaskByTitle("ידנית לא דחופה")).urgent_override).toBeNull();
  });

  for (const width of [1024, 375, 320]) {
    test(`${width}: quick actions are reachable, large enough, and the page doesn't scroll sideways`, async ({ page }) => {
      await seedTasks([{ title: "משימה עם כותרת ארוכה מאוד Mixed direction title", deadline: plusDays(today, 6) }]);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/tasks");
      for (const name of ["סמן כחשובה: משימה עם כותרת ארוכה מאוד Mixed direction title", "סמן כדחופה: משימה עם כותרת ארוכה מאוד Mixed direction title"]) {
        const box = (await visible(page, "button", name).boundingBox())!;
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(width < 1024 ? 43 : 31);
      }
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    });
  }
});

test.describe("project completion (UAT-03)", () => {
  test("complete with open tasks: warning with the count, tasks unchanged, completed tab, no new tasks, reopen", async ({ page }) => {
    const project = await seedProject("אתר החברה Website");
    await seedTasks([
      { title: "פתוחה 1", deadline: plusDays(today, 3), project_id: project.id },
      { title: "פתוחה 2", deadline: plusDays(today, 4), project_id: project.id, is_important: true },
      { title: "גמורה", deadline: plusDays(today, -1), project_id: project.id, status: "done" },
    ]);
    await page.goto(`/projects/${project.id}`);
    await expect(visible(page, "button", "משימה חדשה")).toBeVisible();
    await page.getByRole("button", { name: "סמן פרויקט כהושלם" }).click();
    const dialog = page.getByRole("dialog", { name: "לסמן את הפרויקט כהושלם?" });
    await expect(dialog).toContainText("לפרויקט נשארו 2 משימות פתוחות. לסמן את הפרויקט כהושלם בכל זאת?");
    await expect(dialog).toContainText("המשימות לא ישתנו: רק הפרויקט יסומן כהושלם.");
    await expectNoAxeViolations(page);
    await dialog.getByRole("button", { name: "סמן כהושלם" }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByRole("heading", { level: 1 })).toContainText("הושלם");
    await expect(page.getByRole("button", { name: "פתח מחדש" })).toBeFocused();
    await expect(visible(page, "button", "משימה חדשה")).toHaveCount(0);
    await expect.poll(async () => (await projectRow("אתר החברה Website")).completed_at).not.toBeNull();
    // Tasks are unchanged: no bulk completion.
    expect((await getTaskByTitle("פתוחה 1")).status).toBe("todo");
    expect((await getTaskByTitle("פתוחה 2")).status).toBe("todo");

    // Lists: "הושלמו" has it, "פעילים" doesn't; new-task pickers don't offer it; search marks it.
    await page.goto("/projects");
    await expect(page.getByRole("link", { name: "אתר החברה Website" })).toHaveCount(0);
    await page.getByRole("navigation", { name: "מצב הפרויקטים" }).getByRole("link", { name: /הושלמו/ }).click();
    await expect(page).toHaveURL(/view=completed/);
    await expect(page.getByRole("link", { name: "אתר החברה Website" })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.goto("/tasks");
    await visible(page, "button", "משימה חדשה").click();
    const create = page.getByRole("dialog", { name: "משימה חדשה" });
    await create.getByRole("button", { name: "פרטים נוספים" }).click();
    const projectSelect = create.getByRole("combobox", { name: "פרויקט" });
    await expect(projectSelect).toBeVisible();
    await expect(projectSelect.locator("option", { hasText: "אתר החברה Website" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.goto("/search?q=Website");
    await expect(page.getByRole("main")).toContainText("הושלם");

    // Reopen: active again, tasks still unchanged.
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "פתח מחדש" }).click();
    await expect(page.getByRole("button", { name: "סמן פרויקט כהושלם" })).toBeVisible();
    await expect.poll(async () => (await projectRow("אתר החברה Website")).completed_at).toBeNull();
    await expect(visible(page, "button", "משימה חדשה")).toBeVisible();
  });

  test("without open tasks it completes at once, with undo; 100% progress alone doesn't complete it", async ({ page }) => {
    const project = await seedProject("Done project");
    await seedTasks([{ title: "סגורה", deadline: plusDays(today, -2), project_id: project.id, status: "done" }]);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByText("1 מתוך 1 הושלמו")).toBeVisible();
    expect((await projectRow("Done project")).completed_at).toBeNull();
    await page.getByRole("button", { name: "סמן פרויקט כהושלם" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("סומן כהושלם.")).toBeVisible();
    await page.getByRole("button", { name: "ביטול" }).click();
    await expect.poll(async () => (await projectRow("Done project")).completed_at).toBeNull();
  });

  test("completed → archive keeps completion; restore returns it to 'הושלמו', not to active", async ({ page }) => {
    const project = await seedProject("ארכיון Archive");
    const db = await e2eDb();
    await db.from("projects").update({ completed_at: new Date().toISOString() }).eq("id", project.id);
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "העברה לארכיון" }).click();
    await expect.poll(async () => (await projectRow("ארכיון Archive")).archived_at).not.toBeNull();
    expect((await projectRow("ארכיון Archive")).completed_at).not.toBeNull();

    await page.goto("/projects?view=archived");
    const archivedList = page.getByRole("list", { name: "פרויקטים בארכיון" });
    await expect(archivedList.getByRole("link", { name: "ארכיון Archive" })).toBeVisible();
    await expect(archivedList).toContainText("הושלם");

    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "החזרה מהארכיון" }).click();
    await expect.poll(async () => (await projectRow("ארכיון Archive")).archived_at).toBeNull();
    expect((await projectRow("ארכיון Archive")).completed_at).not.toBeNull();
    await page.goto("/projects?view=completed");
    await expect(page.getByRole("link", { name: "ארכיון Archive" })).toBeVisible();
  });

  for (const width of [375, 320]) {
    test(`${width}: tabs, project actions and the confirmation fit; axe`, async ({ page }) => {
      const project = await seedProject("פרויקט מובייל Mobile");
      await seedTasks([{ title: "פתוחה", deadline: plusDays(today, 2), project_id: project.id }]);
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/projects");
      await expect(page.getByRole("navigation", { name: "מצב הפרויקטים" })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await page.goto(`/projects/${project.id}`);
      await page.getByRole("button", { name: "סמן פרויקט כהושלם" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("לפרויקט נשארה משימה פתוחה אחת.");
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
      await dialog.getByRole("button", { name: "ביטול" }).click();
      expect((await projectRow("פרויקט מובייל Mobile")).completed_at).toBeNull();
    });
  }
});

// UAT micro-remediation (2026-11-07): completion follows the title, so the row's RTL leading edge
// stays free for a future selection mode; success green on the "הושלמו השבוע" KPI and the toast.
const SUCCESS = "rgb(21, 128, 61)";

/** Completion sits after the title (to its left in RTL) and on its line, never at the leading edge. */
async function expectCompletionBesideTitle(page: Page, title: string) {
  const link = page.getByRole("link", { name: title, exact: true }).filter({ visible: true });
  const complete = visible(page, "button", `סמן כהושלמה: ${title}`);
  const [t, c] = [(await link.boundingBox())!, (await complete.boundingBox())!];
  expect(c.x + c.width, "completion is left of the title").toBeLessThanOrEqual(t.x + 1);
  expect(c.y, "completion is on the title's line").toBeLessThan(t.y + t.height);
  expect(c.y + c.height).toBeGreaterThan(t.y);
  // Keyboard order follows the visual order: title, then its completion.
  await link.focus();
  await page.keyboard.press("Tab");
  await expect(complete).toBeFocused();
  return complete;
}

test.describe("completion vs selection, success green (UAT 2026-11-07)", () => {
  for (const width of [1440, 1024, 375, 320]) {
    test(`${width}: Tasks: completion after the title, no row checkbox, quick actions secondary`, async ({ page }) => {
      await seedTasks([
        { title: "חידוש ביטוח רכב", deadline: plusDays(today, 9), is_important: true },
        { title: "דוח רבעוני Q3", deadline: plusDays(today, -1), status: "done" },
      ]);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/tasks?done=1");
      const list = page.locator("#tasks-list");
      await expect(list.getByRole("checkbox")).toHaveCount(0);
      const complete = await expectCompletionBesideTitle(page, "חידוש ביטוח רכב");
      const target = (await complete.boundingBox())!;
      expect(Math.min(target.width, target.height)).toBeGreaterThanOrEqual(43);

      // Important / Urgent stay compact and after completion: to its left (table) or under it (list).
      const important = visible(page, "button", "בטל חשיבות: חידוש ביטוח רכב");
      const [c, i] = [(await complete.boundingBox())!, (await important.boundingBox())!];
      if (width >= 1024) expect(i.x + i.width).toBeLessThanOrEqual(c.x + 1);
      else {
        expect(i.y).toBeGreaterThanOrEqual(c.y + c.height - 1);
        expect(Math.min(i.width, i.height)).toBeGreaterThanOrEqual(43);
      }

      // The done row keeps the success treatment.
      const done = visible(page, "button", "בטל השלמה: דוח רבעוני Q3");
      expect(await done.locator("span").first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(SUCCESS);
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);

      // Still works by keyboard, with undo.
      await complete.focus();
      await page.keyboard.press("Enter");
      await expect.poll(async () => (await getTaskByTitle("חידוש ביטוח רכב")).status).toBe("done");
      await page.getByRole("button", { name: "ביטול", exact: true }).filter({ visible: true }).click();
      await expect.poll(async () => (await getTaskByTitle("חידוש ביטוח רכב")).status).toBe("todo");
    });
  }

  for (const width of [1440, 375]) {
    test(`${width}: Dashboard: Today completion after the title; success toast and "הושלמו השבוע" KPI`, async ({ page }) => {
      const [task] = await seedTasks([{ title: "Review של PR #42", deadline: today }]);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const today_ = page.getByRole("region", { name: "המשימות למיקוד היום" });
      await expect(today_.getByRole("link", { name: "Review של PR #42" })).toBeVisible();
      const kpi = page.getByRole("list", { name: "סיכום משימות" }).getByRole("link", { name: /הושלמו השבוע/ });
      // Nothing completed yet: the KPI stays neutral.
      await expect(kpi.locator("[data-kpi-success]")).toHaveCount(0);
      await expect(page.getByRole("checkbox")).toHaveCount(0);

      await expectCompletionBesideTitle(page, "Review של PR #42");
      await page.keyboard.press("Enter");
      await expect.poll(async () => (await getTaskByTitle(task!.title)).status).toBe("done");

      // The success toast: the check icon plus a thin start accent; the text says it too.
      const toast = page.getByText("הושלמה.").locator("xpath=ancestor::div[1]");
      await expect(toast).toBeVisible();
      expect(await toast.evaluate((el) => getComputedStyle(el).borderInlineStartColor)).toBe(SUCCESS);
      expect(await toast.locator("svg").first().evaluate((el) => getComputedStyle(el).color)).toBe(SUCCESS);

      // The positive KPI: a check icon and a green number, the label neutral.
      await expect(kpi).toHaveText("1הושלמו השבוע");
      await expect(kpi.locator("[data-kpi-success]")).toBeVisible();
      expect(await kpi.locator("span.tabular-nums").evaluate((el) => getComputedStyle(el).color)).toBe(SUCCESS);
      expect(await kpi.locator("span.text-xs").evaluate((el) => getComputedStyle(el).color)).not.toBe(SUCCESS);
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    });
  }

  for (const width of [1440, 375]) {
    test(`${width}: project task list: completion after the title; a completed project keeps its success mark`, async ({ page }) => {
      const project = await seedProject("Q3 Release");
      await seedTasks([{ title: "Deploy ל-production", deadline: plusDays(today, 3), project_id: project.id }]);
      const db = await e2eDb();
      await db.from("projects").update({ completed_at: new Date().toISOString() }).eq("id", project.id);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/projects/${project.id}`);
      const mark = page.locator("h1").getByText("הושלם", { exact: true });
      await expect(mark).toBeVisible();
      expect(await mark.evaluate((el) => getComputedStyle(el).color)).toBe(SUCCESS);
      await expect(page.locator("#tasks-list").getByRole("checkbox")).toHaveCount(0);
      await expectCompletionBesideTitle(page, "Deploy ל-production");
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    });
  }
});
