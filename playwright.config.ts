import { defineConfig, devices } from "@playwright/test";

// E2E_EMAIL / E2E_PASSWORD (a dedicated test user in the dev project) live in .env.local.
try {
  process.loadEnvFile(".env.local");
} catch {
  // CI or a fresh checkout: the auth setup reports the missing variables.
}

const PORT = 3210;
const AUTH_STATE = "tests/e2e/.auth/user.json"; // also in tests/e2e/helpers.ts
const TASKS_SPEC = /tasks\.spec\.ts$/;
const PROJECTS_SPEC = /projects\.spec\.ts$/;
const DASHBOARD_SPEC = /dashboard\.spec\.ts$/;
const TEMPLATES_SPEC = /templates\.spec\.ts$/;
const CALENDAR_SPEC = /calendar\.spec\.ts$/;
const PLANNING_SPEC = /planning\.spec\.ts$/;
const TIMELINE_SPEC = /timeline\.spec\.ts$/;
const UAT_SPEC = /uat\.spec\.ts$/;
const DATA_SPECS = [TASKS_SPEC, PROJECTS_SPEC, DASHBOARD_SPEC, TEMPLATES_SPEC, CALENDAR_SPEC, PLANNING_SPEC, TIMELINE_SPEC, UAT_SPEC];
// A local Hebcal stand-in (tests/e2e/hebcal-stub.mjs): holidays never come from the live API in tests.
const HEBCAL_STUB_PORT = 3299;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Keeps Supabase Auth requests modest.
  workers: 2,
  reporter: [["list"]],
  // Server actions round-trip to the cloud dev database; allow for its latency on assertions.
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE },
      dependencies: ["setup"],
      testIgnore: DATA_SPECS,
    },
    // Specs that reset and seed the E2E user's data run one after another, never concurrently.
    {
      name: "data-tasks",
      testMatch: TASKS_SPEC,
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE },
      dependencies: ["setup"],
    },
    {
      name: "data-projects",
      testMatch: PROJECTS_SPEC,
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE },
      dependencies: ["data-tasks"],
    },
    {
      name: "data-dashboard",
      testMatch: DASHBOARD_SPEC,
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE },
      dependencies: ["data-projects"],
    },
    {
      name: "data-templates",
      testMatch: TEMPLATES_SPEC,
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE },
      dependencies: ["data-dashboard"],
    },
    {
      name: "data-calendar",
      testMatch: CALENDAR_SPEC,
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE },
      dependencies: ["data-templates"],
    },
    {
      name: "data-planning",
      testMatch: PLANNING_SPEC,
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE },
      dependencies: ["data-calendar"],
    },
    {
      name: "data-timeline",
      testMatch: TIMELINE_SPEC,
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE },
      dependencies: ["data-planning"],
    },
    {
      name: "data-uat",
      testMatch: UAT_SPEC,
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE },
      dependencies: ["data-timeline"],
    },
  ],
  webServer: [
    {
      command: "node tests/e2e/hebcal-stub.mjs",
      url: `http://127.0.0.1:${HEBCAL_STUB_PORT}/health`,
      env: { HEBCAL_STUB_PORT: String(HEBCAL_STUB_PORT) },
      reuseExistingServer: !process.env.CI,
    },
    {
      // Production build, like the deployed app, with holidays from the stand-in.
      command: `npm run build && npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/login`,
      env: { HEBCAL_API_URL: `http://127.0.0.1:${HEBCAL_STUB_PORT}/hebcal` },
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
});
