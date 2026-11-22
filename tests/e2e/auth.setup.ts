import { expect, test as setup } from "@playwright/test";
import { AUTH_STATE, e2eCredentials } from "./helpers";

// A real login through the UI; later tests reuse the saved session.
setup("sign in as the E2E user", async ({ page }) => {
  const { email, password } = e2eCredentials();
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה", { exact: true }).fill(password);
  await page.getByRole("button", { name: "כניסה" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "לוח בקרה" })).toBeVisible();
  await page.context().storageState({ path: AUTH_STATE });
});
