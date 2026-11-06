import { cp, mkdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";

// Build: type-check + compile src/**/*.ts with tsc into dist/src/**
// (the same shape index.html references), then copy the static
// assets (index.html, styles.css, the self-hosted Nunito woff2
// files, and icons) alongside. The shipped dist is dependency-free
// vanilla JS — typescript is a dev-only tool. The headless match
// runner (TASK 048, audit #25) is compiled for the test suite but
// never shipped: nothing in the page's module graph imports it.
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
execFileSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"],
  { stdio: "inherit" },
);
await rm("dist/src/engine/runner.js", { force: true });
await cp("index.html", "dist/index.html");
await cp("src/styles.css", "dist/src/styles.css");
for (const font of ["nunito-var.woff2", "nunito-900-italic.woff2"]) {
  await cp(`src/${font}`, `dist/src/${font}`);
}
for (const icon of ["favicon.svg", "favicon-32.png", "apple-touch-icon.png"]) {
  await cp(icon, `dist/${icon}`);
}
console.log("Built static site to dist/");
