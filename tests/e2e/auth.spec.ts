import { expect, test } from "@playwright/test";
import { e2eCredentials, expectNoAxeViolations } from "./helpers";

// No saved session: these tests start signed out.
test.use({ storageState: { cookies: [], origins: [] } });

test("unauthenticated visitors are redirected to login, keeping the destination", async ({ page }) => {
  await page.goto("/tasks");
  await expect(page).toHaveURL(/\/login\?next=%2Ftasks$/);
  await expect(page.getByRole("heading", { level: 1, name: "כניסה ללוח הבקרה" })).toBeVisible();
});

test("wrong credentials show a focused error summary", async ({ page }) => {
  const { email } = e2eCredentials();
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה", { exact: true }).fill("not-the-password");
  await page.getByRole("button", { name: "כניסה" }).click();
  // Filtered by text: Next.js's route announcer is also role="alert".
  const alert = page.getByRole("alert").filter({ hasText: "האימייל או הסיסמה שגויים." });
  await expect(alert).toBeVisible();
  await expect(alert).toBeFocused();
  await expect(page.getByLabel("אימייל")).toHaveValue(email);
  await expectNoAxeViolations(page);
});

test("empty fields get linked field errors", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "כניסה" }).click();
  await expect(page.getByLabel("אימייל")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("אימייל")).toHaveAccessibleDescription("יש להזין כתובת אימייל תקינה.");
  await expect(page.getByLabel("סיסמה", { exact: true })).toHaveAccessibleDescription("יש להזין סיסמה.");
});

test("the password can be shown and hidden again (a toggle button)", async ({ page }) => {
  await page.goto("/login");
  const password = page.getByLabel("סיסמה", { exact: true });
  const toggle = page.getByRole("button", { name: "הצגת הסיסמה" });
  await password.fill("secret-123");
  await expect(password).toHaveAttribute("type", "password");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(password).toHaveAttribute("type", "password");
  await expect(password).toHaveValue("secret-123");
});

test("login returns to the requested page, and sign-out ends the session", async ({ page }) => {
  const { email, password } = e2eCredentials();
  await page.goto("/projects");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה", { exact: true }).fill(password);
  await page.getByRole("button", { name: "כניסה" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("heading", { level: 1, name: "פרויקטים" })).toBeVisible();

  // A signed-in user visiting /login goes home.
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole("button", { name: "יציאה" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("login page has no automated a11y violations", async ({ page }) => {
  await page.goto("/login");
  await expectNoAxeViolations(page);
});
