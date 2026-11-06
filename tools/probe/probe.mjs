// Minimal browser probe for 13 — the smoke/layout check verifiers
// run the same way every time (TASK 047, audit #20). NOT part of
// `npm test`: the unit/e2e suites run on a fake DOM, so layout and
// real-browser regressions can only be caught here.
//
// Usage:
//   npm run build                      # the probe serves dist/
//   node tools/probe/probe.mjs         # smoke run, exit 0 = PASS
//
// playwright-core must be resolvable: either install it once
// (`npm install --no-save playwright-core`) or point NODE_PATH at
// an existing install. The probe checks: the page boots with no
// page errors, Start deals the human 13 cards, and the page has
// no horizontal scroll at a desktop and a phone viewport.
//
// SECURITY — Option C (owner ruling, 2026-11-02; read before
// changing anything below):
//   * Patched Chrome for Testing 156.0.8078.80 headless shell
//     ONLY (path below) — it fixes CVE-2026-118306 / -118331 /
//     -118348 / -118344, present in the older 1248/1148 builds.
//     Never fall back to those builds. If the patched build is
//     missing (e.g. after a machine replacement), re-download
//     Chrome for Testing 156.0.8078.80 (linux64 headless shell)
//     from Google's chrome-for-testing-public bucket into the
//     same path.
//   * The Chromium sandbox CANNOT run in this environment
//     (Chrome refuses as root; unprivileged user namespaces are
//     disabled), and Playwright launches with --no-sandbox
//     implicitly. Sandbox-OFF probes are accepted ONLY with the
//     compensating controls this script enforces: patched build
//     only; locally built dist over 127.0.0.1 only; EVERY
//     non-localhost request route-blocked and logged via
//     localOnly() (the built page fetches Google Fonts — it must
//     be aborted, never allowed); a fresh browser profile per
//     run (chromium.launch default). Never claim a probe ran
//     sandbox-ON here; never pass chromiumSandbox:true (it
//     hard-fails in this environment).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const EXE =
  process.env.HOME +
  "/.cache/ms-playwright/chromium_headless_shell-cft156patched/chrome-headless-shell-linux64/chrome-headless-shell";
const DIST = fileURLToPath(new URL("../../dist/", import.meta.url));

let chromium;
try {
  ({ chromium } = await import("playwright-core"));
} catch {
  console.error("SETUP: playwright-core is not resolvable — install it or set NODE_PATH (see header).");
  process.exit(2);
}
if (!existsSync(EXE)) {
  console.error(`SETUP: patched Chrome for Testing 156.0.8078.80 not found at ${EXE} (see header).`);
  process.exit(2);
}
if (!existsSync(join(DIST, "index.html"))) {
  console.error("SETUP: dist/ is not built — run `npm run build` first.");
  process.exit(2);
}

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json",
  ".woff2": "font/woff2", ".ico": "image/x-icon",
};
const server = createServer(async (req, res) => {
  const path = normalize(join(DIST, req.url === "/" ? "index.html" : req.url.split("?")[0]));
  if (!path.startsWith(DIST)) { res.writeHead(403).end(); return; }
  try {
    res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

// Route-block everything that is not this machine (Option C).
async function localOnly(context, log) {
  await context.route("**/*", (route) => {
    const u = route.request().url();
    if (
      u.startsWith("http://127.0.0.1") || u.startsWith("http://localhost") ||
      u.startsWith("file:") || u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("about:")
    ) {
      route.continue();
    } else {
      log("BLOCKED external: " + u);
      route.abort();
    }
  });
}

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures.push(label);
};

const browser = await chromium.launch({ executablePath: EXE, args: ["--force-device-scale-factor=1"] });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await localOnly(context, console.log);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base, { waitUntil: "load" });
  check(await page.locator("#start-btn").isVisible(), "start screen shows the Start button");
  await page.click("#start-btn");
  await page.waitForFunction(() => document.querySelectorAll("#hand > *").length === 13);
  check(true, "Start deals the human 13 cards");
  const wide = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth, inner: window.innerWidth, body: document.body.scrollWidth,
  }));
  check(wide.doc <= wide.inner && wide.body <= wide.inner, `no horizontal scroll at 1280px (${JSON.stringify(wide)})`);
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth, inner: window.innerWidth, body: document.body.scrollWidth,
  }));
  check(phone.doc <= phone.inner && phone.body <= phone.inner, `no horizontal scroll at 390px (${JSON.stringify(phone)})`);
  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
} finally {
  await browser.close();
  server.close();
}
console.log(failures.length === 0 ? "PROBE PASS" : `PROBE FAIL (${failures.length})`);
process.exit(failures.length === 0 ? 0 : 1);
