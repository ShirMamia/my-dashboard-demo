import { expect, test, type Page } from "@playwright/test";
import { formatDateLong, formatMonthYear } from "../../src/domain/dates";
import { e2eDb, jerusalemToday, resetE2EData, seedEvents, seedTasks } from "./db";
import { expectNoAxeViolations, expectNoHorizontalScroll, trackConsoleErrors } from "./helpers";

// Phase 9 Calendar. Holidays come from the local Hebcal stand-in (tests/e2e/hebcal-stub.mjs):
// the recorded 2026 Israel fixture, nothing for other years, and a failure for 2031.
// Serial: the tests share (and reset) the E2E user's data.
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

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Visible only: Next.js may keep the previous page in the DOM, hidden.
const dayButton = (page: Page, date: string) =>
  page.getByRole("button", { name: new RegExp(`^${escape(formatDateLong(date))}`) }).filter({ visible: true });
const panel = (page: Page) => page.locator("section:has(#calendar-day-heading)").filter({ visible: true });
const monthHeading = (page: Page) => page.getByRole("heading", { level: 2 }).filter({ visible: true }).first();

async function openDay(page: Page, date: string) {
  await page.goto(`/calendar?month=${date.slice(0, 7)}&day=${date}`);
  await expect(panel(page).getByRole("heading", { name: new RegExp(`^${escape(formatDateLong(date))}`) })).toBeVisible();
}

test("opens on the current month with today marked; previous/next/today and Back work", async ({ page }) => {
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { level: 1, name: "לוח שנה" })).toBeVisible();
  const month = today.slice(0, 7);
  await expect(monthHeading(page)).toHaveText(formatMonthYear(month));
  const todayButton = dayButton(page, today);
  await expect(todayButton).toHaveAttribute("aria-current", "date");
  await expect(todayButton).toHaveAccessibleName(new RegExp(`${escape(formatDateLong(today))}, היום`));
  // Sunday first, at inline-start (right in RTL).
  const weekdays = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  const headers = page.getByRole("columnheader").filter({ visible: true });
  for (const [index, name] of weekdays.entries()) await expect(headers.nth(index)).toHaveAccessibleName(name);
  const sunday = await headers.nth(0).boundingBox();
  const saturday = await headers.nth(6).boundingBox();
  expect(sunday!.x).toBeGreaterThan(saturday!.x);

  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const previous = `${monthNumber === 1 ? year - 1 : year}-${String(monthNumber === 1 ? 12 : monthNumber - 1).padStart(2, "0")}`;
  const next = `${monthNumber === 12 ? year + 1 : year}-${String(monthNumber === 12 ? 1 : monthNumber + 1).padStart(2, "0")}`;
  await page.getByRole("link", { name: `החודש הקודם: ${formatMonthYear(previous)}` }).click();
  await expect(monthHeading(page)).toHaveText(formatMonthYear(previous));
  await page.getByRole("link", { name: `החודש הבא: ${formatMonthYear(month)}` }).click();
  await page.getByRole("link", { name: `החודש הבא: ${formatMonthYear(next)}` }).click();
  await expect(monthHeading(page)).toHaveText(formatMonthYear(next));
  await page.goBack();
  await expect(monthHeading(page)).toHaveText(formatMonthYear(month));
  await page.goForward();
  await expect(monthHeading(page)).toHaveText(formatMonthYear(next));
  await page.getByRole("link", { name: "היום", exact: true }).click();
  await expect(monthHeading(page)).toHaveText(formatMonthYear(month));
  await expect(page.getByRole("link", { name: "נתוני חגים: Hebcal.com" })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("deadlines are date-only; scheduled work shows at its Jerusalem time, separately", async ({ page }) => {
  await seedTasks([
    // Scheduled 9 Nov 09:30 Jerusalem (winter, UTC+2); due 10 Nov.
    { title: "BI Dashboard deadline", deadline: "2026-11-10" },
    { title: "Summer work סיכום", deadline: "2026-07-20" },
  ]);
  const db = await e2eDb();
  await db.from("tasks").update({ scheduled_at: "2026-11-09T07:30:00.000Z" }).eq("title", "BI Dashboard deadline");
  await db.from("tasks").update({ scheduled_at: "2026-07-14T05:30:00.000Z" }).eq("title", "Summer work סיכום");

  await openDay(page, "2026-11-09");
  await expect(panel(page)).toContainText("עבודה מתוכננת · 09:30");
  await expect(panel(page).getByRole("link", { name: "BI Dashboard deadline" })).toBeVisible();
  await expect(panel(page)).not.toContainText("מועד משימה");

  await dayButton(page, "2026-11-10").click();
  await expect(panel(page)).toContainText("מועד משימה");
  await expect(panel(page)).not.toContainText("עבודה מתוכננת");
  await expect(dayButton(page, "2026-11-10")).toHaveAccessibleName(/פריט אחד$/);

  // Summer time (UTC+3).
  await openDay(page, "2026-07-14");
  await expect(panel(page)).toContainText("עבודה מתוכננת · 08:30");

  // The task link opens the canonical task page.
  await openDay(page, "2026-11-10");
  await panel(page).getByRole("link", { name: "BI Dashboard deadline" }).click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "עריכת משימה" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /כותרת/ })).toHaveValue("BI Dashboard deadline");
});

test("keyboard only: move through the grid, create, edit and delete an event", async ({ page }) => {
  await page.goto("/calendar?month=2026-11&day=2026-11-11");
  const start = dayButton(page, "2026-11-11");
  await start.focus();
  // RTL: ← is the next day, → the previous; ↓ a week later; Home/End the week's ends.
  await page.keyboard.press("ArrowLeft");
  await expect(dayButton(page, "2026-11-12")).toBeFocused();
  await expect(dayButton(page, "2026-11-12")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(dayButton(page, "2026-11-18")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(dayButton(page, "2026-11-15")).toBeFocused();
  await page.keyboard.press("End");
  await expect(dayButton(page, "2026-11-21")).toBeFocused();
  await expect(page).toHaveURL(/day=2026-11-21/);
  await expect(panel(page).getByRole("heading")).toHaveText(formatDateLong("2026-11-21"));

  // Create (the panel's "אירוע ביום זה"): all-day by default, on the selected day.
  await panel(page).getByRole("button", { name: "אירוע ביום זה" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "אירוע חדש" });
  await expect(dialog.getByRole("textbox", { name: /כותרת/ })).toBeFocused();
  await page.keyboard.type("פגישת Review API");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.getByText("נוסף.")).toBeVisible();
  await expect(panel(page)).toContainText("פגישת Review API");
  await expect(panel(page)).toContainText("יום שלם");
  await expect(dayButton(page, "2026-11-21")).toHaveAccessibleName(/פריט אחד$/);

  // Edit: make it timed, 10:00–11:30 Jerusalem.
  await panel(page).getByRole("button", { name: "עריכה של האירוע פגישת Review API" }).click();
  const edit = page.getByRole("dialog", { name: "עריכת אירוע" });
  await edit.getByRole("checkbox", { name: "יום שלם" }).uncheck();
  await edit.getByRole("textbox", { name: /שעת התחלה/ }).fill("10:00");
  await edit.getByRole("textbox", { name: /שעת סיום/ }).fill("09:00");
  await edit.getByRole("button", { name: "שמירה" }).click();
  await expect(edit.getByRole("textbox", { name: /שעת סיום/ })).toHaveAccessibleDescription("שעת הסיום לא יכולה להיות לפני שעת ההתחלה.");
  await edit.getByRole("textbox", { name: /שעת סיום/ }).fill("11:30");
  await edit.getByRole("button", { name: "שמירה" }).click();
  await expect(edit).toBeHidden();
  await expect(panel(page)).toContainText("10:00–11:30");
  const db = await e2eDb();
  const { data } = await db.from("calendar_events").select("is_all_day, starts_at, ends_at").single();
  expect(data).toMatchObject({ is_all_day: false });
  expect(new Date(data!.starts_at!).toISOString()).toBe("2026-11-21T08:00:00.000Z");
  expect(new Date(data!.ends_at!).toISOString()).toBe("2026-11-21T09:30:00.000Z");

  // Delete with confirmation; focus lands on the day heading.
  await panel(page).getByRole("button", { name: "מחיקה של האירוע פגישת Review API" }).click();
  await page.getByRole("dialog", { name: "למחוק את האירוע?" }).getByRole("button", { name: "מחיקת האירוע" }).click();
  await expect(page.getByText("נמחק.")).toBeVisible();
  await expect(panel(page)).toContainText("אין פריטים ביום זה.");
  await expect(page.locator("#calendar-day-heading")).toBeFocused();
});

test("cell titles wrap to two lines and keep their beginning, in every direction mix", async ({ page }) => {
  const titles = [
    "Q4 תכנון קורס וסילבוס ומטלות",
    "Review API integration בעברית",
    "פרויקט My Dashboard פיתוח",
    "BI Dashboard משימה ארוכה מאוד",
    "בדיקת משימה בעברית בלבד עם כותרת ארוכה מאוד",
    "A fully English task title that is long enough to wrap",
  ];
  await seedTasks(titles.map((title, index) => ({ title, deadline: index < 3 ? "2026-11-24" : "2026-11-25" })));
  for (const width of [1440, 1280, 1024, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/calendar?month=2026-11&day=2026-11-01");
    for (const date of ["2026-11-24", "2026-11-25"]) {
      const chips = page.locator(`button[data-date="${date}"] bdi`);
      await expect(chips).toHaveCount(3);
      const results = await chips.evaluateAll((elements) =>
        elements.map((el) => {
          const box = el.getBoundingClientRect();
          const lines = Math.round(box.height / parseFloat(getComputedStyle(el).lineHeight));
          const text = el.firstChild!;
          const range = document.createRange();
          range.setStart(text, 0);
          range.setEnd(text, Math.min(4, text.textContent!.length));
          // The first four logical characters render inside the visible box (not clipped away).
          const beginningVisible = [...range.getClientRects()].every(
            (r) => r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1,
          );
          return { title: el.textContent, lines, beginningVisible };
        }),
      );
      for (const result of results) {
        expect(result.lines, `${width}px ${result.title}`).toBeLessThanOrEqual(2);
        expect(result.beginningVisible, `${width}px ${result.title}`).toBe(true);
      }
    }
    await expectNoHorizontalScroll(page);
  }
});

test("a failed event delete keeps focus on the confirm button", async ({ page }) => {
  await seedEvents([{ title: "אירוע שנמחק ברקע", is_all_day: true, start_date: "2026-11-20", end_date: "2026-11-20" }]);
  await openDay(page, "2026-11-20");
  await panel(page).getByRole("button", { name: "מחיקה של האירוע אירוע שנמחק ברקע" }).click();
  const confirm = page.getByRole("dialog", { name: "למחוק את האירוע?" });
  // The event disappears behind the open confirmation.
  await (await e2eDb()).from("calendar_events").delete().eq("title", "אירוע שנמחק ברקע");
  const button = confirm.getByRole("button", { name: "מחיקת האירוע" });
  await button.click();
  await expect(confirm.getByRole("alert")).toHaveText("האירוע לא נמצא. ייתכן שנמחק.");
  await expect(button).toBeFocused();
});

test("PageDown/PageUp and arrows past the grid change month, keeping focus on the day", async ({ page }) => {
  await page.goto("/calendar?month=2026-12&day=2026-12-31");
  await dayButton(page, "2026-12-31").focus();
  await page.keyboard.press("PageDown");
  await expect(monthHeading(page)).toHaveText(formatMonthYear("2027-01"));
  await expect(dayButton(page, "2027-01-31")).toBeFocused();
  await page.keyboard.press("PageUp");
  await expect(monthHeading(page)).toHaveText(formatMonthYear("2026-12"));
  await expect(dayButton(page, "2026-12-31")).toBeFocused();
  // 2 Jan 2027 is the last visible day of December's grid; one more step opens January.
  await page.goto("/calendar?month=2026-12&day=2027-01-02");
  await dayButton(page, "2027-01-02").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(monthHeading(page)).toHaveText(formatMonthYear("2027-01"));
  await expect(dayButton(page, "2027-01-03")).toBeFocused();
});

test("multi-day, yearly and 29 February events; events survive month navigation", async ({ page }) => {
  await seedEvents([
    { title: "חופשה New York", is_all_day: true, start_date: "2026-11-28", end_date: "2026-12-03" },
    { title: "יום הולדת", is_all_day: true, start_date: "2020-11-12", end_date: "2020-11-12", recurrence: "yearly" },
    { title: "יום הולדת מעובר", is_all_day: true, start_date: "2024-02-29", end_date: "2024-02-29", recurrence: "yearly" },
  ]);
  await openDay(page, "2026-11-30");
  await expect(panel(page)).toContainText("חופשה New York");
  await expect(panel(page)).toContainText("28.11.2026–03.12.2026 · יום 3 מתוך 6");

  await page.getByRole("link", { name: `החודש הבא: ${formatMonthYear("2026-12")}` }).click();
  await expect(monthHeading(page)).toHaveText(formatMonthYear("2026-12"));
  await dayButton(page, "2026-12-03").click();
  await expect(panel(page)).toContainText("יום 6 מתוך 6");

  await openDay(page, "2026-11-12");
  await expect(panel(page)).toContainText("יום הולדת");
  await expect(panel(page)).toContainText("חוזר מדי שנה");
  await openDay(page, "2027-11-12");
  await expect(panel(page)).toContainText("יום הולדת");
  await openDay(page, "2019-11-12");
  await expect(panel(page)).not.toContainText("יום הולדת");
  // 29 February shows on 28 February in a non-leap year (MASTER_SPEC §10.2).
  await openDay(page, "2027-02-28");
  await expect(panel(page)).toContainText("יום הולדת מעובר");
});

test("holidays follow the Israel schedule; excluded Hebcal categories never appear", async ({ page }) => {
  await openDay(page, "2026-04-01");
  await expect(panel(page)).toContainText("ערב חג");
  await expect(panel(page)).toContainText("ערב פסח");
  await expect(dayButton(page, "2026-04-22")).toHaveAccessibleName(/יום העצמאות/);
  await expect(dayButton(page, "2026-04-08")).toHaveAccessibleName(/פסח ז׳/);
  // Israel: no eighth day of Pesach.
  await expect(dayButton(page, "2026-04-09")).toHaveAccessibleName(/אין פריטים$/);
  await expect(dayButton(page, "2026-04-09")).not.toHaveAccessibleName(/פסח/);
  // The stand-in also sends candle-lighting, Omer, parashot, Rosh Chodesh and zmanim: none show.
  const grid = page.getByRole("table", { name: "ימי החודש" }).filter({ visible: true });
  for (const text of ["הדלקת נרות", "בעומר", "פרשת", "ראש חודש", "הבדלה", "תענית בכורות", "מברכים"]) {
    await expect(grid).not.toContainText(text);
  }
  await expect(page.getByRole("link", { name: "CC BY 4.0" })).toBeVisible();
});

test("a holiday-source failure leaves every local item on the calendar", async ({ page }) => {
  await seedEvents([{ title: "Conference כנס", is_all_day: true, start_date: "2031-05-10", end_date: "2031-05-10" }]);
  await seedTasks([{ title: "דוח 2031", deadline: "2031-05-12" }]);
  await openDay(page, "2031-05-10");
  await expect(page.getByRole("status").filter({ hasText: "לא ניתן לטעון כרגע את נתוני החגים" })).toBeVisible();
  await expect(panel(page)).toContainText("Conference כנס");
  await expect(dayButton(page, "2031-05-12")).toHaveAccessibleName(/פריט אחד$/);
});

test("a dense day shows a few items and \"+N נוספים\"; the day panel lists them all", async ({ page }) => {
  await seedTasks(Array.from({ length: 6 }, (_, index) => ({ title: `משימה ${index + 1} Sprint`, deadline: "2026-11-24" })));
  await page.goto("/calendar?month=2026-11&day=2026-11-01");
  const cell = dayButton(page, "2026-11-24");
  await expect(cell).toContainText("+3 נוספים");
  await expect(cell).toHaveAccessibleName(/6 פריטים$/);
  await cell.click();
  await expect(panel(page).getByRole("listitem")).toHaveCount(6);
  await expect(page).toHaveURL(/day=2026-11-24/);
});

test("global search opens an event's day in the calendar", async ({ page }) => {
  await seedEvents([{ title: "חופשה New York", is_all_day: true, start_date: "2026-08-10", end_date: "2026-08-12" }]);
  await page.goto("/search?q=New York");
  await page.getByRole("link", { name: "חופשה New York" }).click();
  await expect(page).toHaveURL(/\/calendar\?month=2026-08&day=2026-08-10$/);
  await expect(panel(page)).toContainText("חופשה New York");
});

// The Hebcal stand-in's controls (tests/e2e/hebcal-stub.mjs).
const HEBCAL_STUB = "http://127.0.0.1:3299/control";
async function hebcalControl(action: "hold" | "release" | "state", year: number): Promise<{ requested: number; answered: number }> {
  const response = await fetch(`${HEBCAL_STUB}/${action}?year=${year}`);
  return (await response.json()) as { requested: number; answered: number };
}

test("local items render while the holiday source hasn't answered; holidays fill in after", async ({ page }) => {
  // A year this run alone asks for: a reused app server may hold earlier years' holidays in its
  // cache, and a reused stub keeps its counters, so the test compares counts before and after.
  const year = 2040 + (Date.now() % 50);
  await seedEvents([{ title: "אירוע מקומי Local", is_all_day: true, start_date: `${year}-03-10`, end_date: `${year}-03-10` }]);
  await seedTasks([{ title: "דוח מקומי", deadline: `${year}-03-11` }]);
  const before = await hebcalControl("hold", year);
  try {
    // "commit": don't wait for the whole streamed document, which ends only after holidays resolve.
    await page.goto(`/calendar?month=${year}-03&day=${year}-03-10`, { waitUntil: "commit" });
    await expect(panel(page)).toContainText("אירוע מקומי Local");
    await expect(dayButton(page, `${year}-03-11`)).toHaveAccessibleName(/פריט אחד$/);
    // Rendered while Hebcal holds the request: it was asked, hasn't answered, and nothing failed.
    expect(await hebcalControl("state", year)).toEqual({ requested: before.requested + 1, answered: before.answered });
    await expect(panel(page)).not.toContainText("חג לבדיקה");
    await expect(page.getByText("לא ניתן לטעון כרגע את נתוני החגים")).toHaveCount(0);
  } finally {
    await hebcalControl("release", year);
  }
  await expect(panel(page)).toContainText("חג לבדיקה");
  await expect(dayButton(page, `${year}-03-10`)).toHaveAccessibleName(/חג לבדיקה, פריט אחד$/);
});

test.describe("multi-day spans", () => {
  const spans = (page: Page, title: string) => page.locator("[data-span]").filter({ hasText: title }).filter({ visible: true });

  test("an event crossing a Sunday week boundary is one continuous segment per week, in RTL", async ({ page }) => {
    // Thu 5 Nov – Tue 10 Nov 2026.
    await seedEvents([{ title: "חופשה New York", is_all_day: true, start_date: "2026-11-05", end_date: "2026-11-10" }]);
    await page.goto("/calendar?month=2026-11&day=2026-11-05");
    await expect(spans(page, "חופשה New York")).toHaveCount(2);
    const [first, second] = [spans(page, "חופשה New York").nth(0), spans(page, "חופשה New York").nth(1)];
    await expect(first).toHaveAttribute("data-continues-after", "true");
    await expect(second).toHaveAttribute("data-continues-before", "true");

    // RTL: the first segment runs from Thursday (right) to Saturday (left), inside those cells.
    const bar = (await first.boundingBox())!;
    const thursday = (await dayButton(page, "2026-11-05").boundingBox())!;
    const saturday = (await dayButton(page, "2026-11-07").boundingBox())!;
    expect(bar.x + bar.width).toBeLessThanOrEqual(thursday.x + thursday.width + 1);
    expect(bar.x + bar.width).toBeGreaterThan(thursday.x + thursday.width - 12);
    expect(bar.x).toBeLessThan(saturday.x + 2);
    // The second segment starts at Sunday's inline-start edge (its right) and ends inside Tuesday.
    const bar2 = (await second.boundingBox())!;
    const sunday = (await dayButton(page, "2026-11-08").boundingBox())!;
    const tuesday = (await dayButton(page, "2026-11-10").boundingBox())!;
    expect(Math.abs(bar2.x + bar2.width - (sunday.x + sunday.width))).toBeLessThanOrEqual(2);
    expect(bar2.x).toBeGreaterThan(tuesday.x - 2);
    expect(bar2.x).toBeLessThan(tuesday.x + 12);

    // A 2-day event and a full week are each a single segment.
    await seedEvents([
      { title: "כנס יומיים", is_all_day: true, start_date: "2026-11-17", end_date: "2026-11-18" },
      { title: "שבוע שלם", is_all_day: true, start_date: "2026-11-22", end_date: "2026-11-28" },
    ]);
    await page.reload();
    await expect(spans(page, "כנס יומיים")).toHaveCount(1);
    await expect(spans(page, "שבוע שלם")).toHaveCount(1);
    const week = (await spans(page, "שבוע שלם").boundingBox())!;
    const weekStart = (await dayButton(page, "2026-11-22").boundingBox())!;
    const weekEnd = (await dayButton(page, "2026-11-28").boundingBox())!;
    expect(week.width).toBeGreaterThan(weekStart.x + weekStart.width - weekEnd.x - 12);
    await expectNoHorizontalScroll(page);
  });

  test("events crossing the month and the visible grid continue at the edges", async ({ page }) => {
    await seedEvents([
      { title: "מתחיל באוקטובר", is_all_day: true, start_date: "2026-10-28", end_date: "2026-11-02" },
      { title: "נמשך לדצמבר", is_all_day: true, start_date: "2026-11-28", end_date: "2026-12-09" },
    ]);
    await page.goto("/calendar?month=2026-11&day=2026-11-02");
    // Starts before the grid (1 Nov): only a continuation edge.
    await expect(spans(page, "מתחיל באוקטובר")).toHaveCount(1);
    await expect(spans(page, "מתחיל באוקטובר")).toHaveAttribute("data-continues-before", "true");
    // Crosses into December inside the grid, then past its end (5 Dec).
    await expect(spans(page, "נמשך לדצמבר")).toHaveCount(2);
    await expect(spans(page, "נמשך לדצמבר").nth(1)).toHaveAttribute("data-continues-after", "true");
    await dayButton(page, "2026-12-05").click();
    await expect(panel(page)).toContainText("יום 8 מתוך 12");
  });

  test("overlapping spans and single-day items: overflow counts each item once", async ({ page }) => {
    await seedEvents([
      { title: "טיול", is_all_day: true, start_date: "2026-11-09", end_date: "2026-11-11" },
      { title: "פגישת Review API", is_all_day: true, start_date: "2026-11-10", end_date: "2026-11-10" },
    ]);
    await seedTasks(Array.from({ length: 3 }, (_, index) => ({ title: `משימה ${index + 1}`, deadline: "2026-11-10" })));
    await page.goto("/calendar?month=2026-11&day=2026-11-01");
    const cell = dayButton(page, "2026-11-10");
    // 1 span lane + 2 chips of 3 rows; 5 items on the day, so 2 more.
    await expect(cell).toContainText("+2 נוספים");
    await expect(cell).toHaveAccessibleName(/5 פריטים$/);
    await expect(dayButton(page, "2026-11-11")).toHaveAccessibleName(/פריט אחד$/);
    await expect(dayButton(page, "2026-11-11")).not.toContainText("נוספים");

    // The bar is decorative: a click on it selects the day beneath, and the keyboard still reaches every day.
    const bar = (await spans(page, "טיול").boundingBox())!;
    await page.mouse.click(bar.x + 8, bar.y + bar.height / 2); // its inline-end edge: Wednesday 11 Nov
    await expect(page).toHaveURL(/day=2026-11-11/);
    await expect(panel(page)).toContainText("טיול");
    await dayButton(page, "2026-11-11").focus();
    await page.keyboard.press("ArrowRight");
    await expect(dayButton(page, "2026-11-10")).toBeFocused();
    await expect(panel(page).getByRole("listitem")).toHaveCount(5);
  });

  test("375 and 320: no bars, counts and the day panel instead, no horizontal scroll", async ({ page }) => {
    await seedEvents([{ title: "חופשה New York", is_all_day: true, start_date: "2026-11-05", end_date: "2026-11-10" }]);
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/calendar?month=2026-11&day=2026-11-08");
      await expect(page.locator("[data-span]").filter({ visible: true })).toHaveCount(0);
      await expect(dayButton(page, "2026-11-08")).toHaveAccessibleName(/פריט אחד$/);
      await expect(panel(page)).toContainText("יום 4 מתוך 6");
      await expectNoHorizontalScroll(page);
    }
  });
});

test.describe("layouts", () => {
  test.beforeEach(async () => {
    await seedEvents([{ title: "חופשה New York", is_all_day: true, start_date: "2026-11-28", end_date: "2026-12-03" }]);
    await seedTasks([{ title: "Prepare quarterly OKR review with a deliberately long English title", deadline: "2026-11-24" }]);
  });

  test("1440: the day panel sits beside the grid", async ({ page }) => {
    await openDay(page, "2026-11-24");
    const grid = await page.getByRole("table", { name: "ימי החודש" }).filter({ visible: true }).boundingBox();
    const dayPanel = await panel(page).boundingBox();
    // RTL: the panel is at inline-end (left of the grid).
    expect(dayPanel!.x + dayPanel!.width).toBeLessThanOrEqual(grid!.x + 1);
    await expectNoHorizontalScroll(page);
  });

  test("768: the panel follows the grid", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1000 });
    await openDay(page, "2026-11-24");
    const grid = await page.getByRole("table", { name: "ימי החודש" }).filter({ visible: true }).boundingBox();
    const dayPanel = await panel(page).boundingBox();
    expect(dayPanel!.y).toBeGreaterThan(grid!.y + grid!.height - 1);
    await expectNoHorizontalScroll(page);
  });

  test("375: compact grid, the day panel lists the items, axe", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openDay(page, "2026-11-24");
    await expect(page.getByRole("columnheader", { name: "ראשון" })).toBeVisible();
    await expect(panel(page)).toContainText("Prepare quarterly OKR review");
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
  });

  test("320: no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openDay(page, "2026-11-30");
    await expect(panel(page)).toContainText("חופשה New York");
    await expectNoHorizontalScroll(page);
  });
});
