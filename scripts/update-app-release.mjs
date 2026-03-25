#!/usr/bin/env node
/**
 * Aggiorna data/app-meta.json e data/changelog.json in base all'ultimo commit.
 * Il post-commit esclude il commit meta ("chore: update app release metadata").
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const metaPath = join(root, "data", "app-meta.json");
const changelogPath = join(root, "data", "changelog.json");

const META_COMMIT_MSG = "chore: update app release metadata";

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", cwd: root }).trim();
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeIfChanged(path, content) {
  const prev = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (prev === content) return false;
  writeFileSync(path, content, "utf8");
  return true;
}

const msg = sh("git log -1 --format=%s");
if (msg === META_COMMIT_MSG) {
  process.exit(0);
}

const hash = sh("git rev-parse HEAD");
const at = sh("git log -1 --format=%cI");
const pkg = readJson(join(root, "package.json"), { version: "0.0.0" });
const version = typeof pkg.version === "string" ? pkg.version : "0.0.0";

const newMeta = { version, lastUpdated: at, commitHash: hash };
const metaStr = JSON.stringify(newMeta, null, 2) + "\n";

const prevChangelog = readJson(changelogPath, { entries: [] });
const entries = Array.isArray(prevChangelog.entries) ? prevChangelog.entries : [];
const withoutDup = entries.filter((e) => e && e.hash !== hash);
const nextEntries = [{ hash, at, description: msg }, ...withoutDup].slice(0, 500);
const changelogStr = JSON.stringify({ entries: nextEntries }, null, 2) + "\n";

const m = writeIfChanged(metaPath, metaStr);
const c = writeIfChanged(changelogPath, changelogStr);
if (!m && !c) {
  process.exit(0);
}
process.exit(0);
