#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

node <<'NODE'
const fs = require("node:fs");

for (const manifest of ["Humble/manifest.json", "Steam/manifest.json"]) {
  JSON.parse(fs.readFileSync(manifest, "utf8"));
}

for (const requiredPath of [
  "Humble/background.js",
  "Humble/content.js",
  "Humble/options.html",
  "Humble/options.js",
  "Steam/background.js",
  "Steam/content.js",
  "Steam/options.html",
  "Steam/options.js"
]) {
  if (!fs.existsSync(requiredPath)) {
    throw new Error(`Missing required extension file: ${requiredPath}`);
  }
}
NODE

echo "Validation passed."
