import { cp, mkdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";

// Build: type-check + compile src/**/*.ts with tsc into dist/src/**
// (the same shape index.html references), then copy the static
// assets (index.html, styles.css) alongside. The shipped dist is
// dependency-free vanilla JS — typescript is a dev-only tool.
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
execFileSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"],
  { stdio: "inherit" },
);
await cp("index.html", "dist/index.html");
await cp("src/styles.css", "dist/src/styles.css");
console.log("Built static site to dist/");
