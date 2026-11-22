// A local stand-in for the Hebcal REST API, so E2E never depends on the live service.
// The app reaches it through HEBCAL_API_URL (playwright.config.ts). Serves the recorded 2026
// fixture (allow-listed items plus examples of excluded categories, which the app must drop),
// one synthetic holiday on 10 March of 2032 and of every year from 2040 (a test can take a year no
// earlier run has fetched or cached), an empty list for other years, and a 503 for 2031.
// Test controls: /control/hold?year=Y keeps that year's requests unanswered until
// /control/release?year=Y; /control/state?year=Y reports how many were requested and answered.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const PORT = Number(process.env.HEBCAL_STUB_PORT ?? 3299);
const fixture = JSON.parse(readFileSync(new URL("../../src/domain/__fixtures__/hebcal-2026.json", import.meta.url), "utf8"));
const FAILING_YEAR = "2031";
const synthetic = (year) =>
  year === "2032" || Number(year) >= 2040
    ? [{ date: `${year}-03-10`, title: "חג לבדיקה", category: "holiday", subcat: "major", title_orig: "Test Holiday" }]
    : [];

const held = new Set();
const waiting = new Map(); // year → [answer functions]
const counts = new Map(); // year → { requested, answered }

function count(year) {
  if (!counts.has(year)) counts.set(year, { requested: 0, answered: 0 });
  return counts.get(year);
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${PORT}`);
  const params = url.searchParams;
  if (url.pathname === "/health") {
    response.writeHead(200).end("ok");
    return;
  }
  if (url.pathname.startsWith("/control/")) {
    const year = params.get("year") ?? "";
    if (url.pathname === "/control/hold") held.add(year);
    if (url.pathname === "/control/release") {
      held.delete(year);
      for (const answer of waiting.get(year) ?? []) answer();
      waiting.delete(year);
    }
    json(response, 200, count(year));
    return;
  }
  // The app must ask for the Israel schedule in Hebrew without nikud; anything else is a bug.
  if (url.pathname !== "/hebcal" || params.get("cfg") !== "json" || params.get("i") !== "on" || params.get("lg") !== "he-x-NoNikud") {
    json(response, 400, { error: "unexpected request" });
    return;
  }
  const year = params.get("year") ?? "";
  count(year).requested++;
  const answer = () => {
    count(year).answered++;
    if (year === FAILING_YEAR) {
      response.writeHead(503).end("unavailable");
      return;
    }
    const items = year === "2026" ? [...fixture.israel.items, ...fixture.excluded] : synthetic(year);
    json(response, 200, { title: `Stub ${year}`, items });
  };
  if (held.has(year)) waiting.set(year, [...(waiting.get(year) ?? []), answer]);
  else answer();
}).listen(PORT, "127.0.0.1");
