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
  "Humble/importQueue.js",
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

const queue = require("./Humble/importQueue.js");

function createMemoryStorage() {
  const state = {};
  return {
    get(keys, callback) {
      const result = {};
      for (const key of keys) {
        result[key] = state[key];
      }
      callback(result);
    },
    set(values, callback) {
      Object.assign(state, values);
      callback();
    }
  };
}

async function runQueueTests() {
  const storage = createMemoryStorage();
  const rows = [
    { title: " Game One ", key: "aaaaa-bbbbb-ccccc" },
    { title: "Duplicate", key: "AAAAA-BBBBB-CCCCC" },
    { title: "Bad", key: "short" }
  ];
  const batchResult = queue.createBatch(rows, "https://www.humblebundle.com/home/keys#frag", "2026-06-29T00:00:00.000Z");

  if (!batchResult.ok) throw new Error("Expected valid batch.");
  if (batchResult.batch.items.length !== 1) throw new Error("Expected duplicate rows to collapse.");
  if (batchResult.rejected.length !== 1) throw new Error("Expected malformed row rejection.");
  if (batchResult.batch.items[0].key !== "AAAAA-BBBBB-CCCCC") throw new Error("Expected normalized key.");
  if (batchResult.batch.items[0].sourceUrl.includes("#")) throw new Error("Expected source URL without fragment.");

  const firstSend = await queue.publishRows(rows, {
    storage,
    sourceUrl: "https://www.humblebundle.com/home/keys",
    settings: { apiEndpoint: "https://example.test/import", apiKey: "token" },
    fetchImpl: async () => ({ ok: false, status: 503 })
  });

  if (firstSend.ok) throw new Error("Expected retryable publish failure.");
  if (firstSend.entry.status !== "pending") throw new Error("Expected retryable failure to stay pending.");

  const retry = await queue.retryEntry(firstSend.entry.id, {
    storage,
    settings: { apiEndpoint: "https://example.test/import", apiKey: "token" },
    fetchImpl: async () => ({
      ok: true,
      status: 202,
      text: async () => '{"status":"accepted","accepted":1}'
    })
  });

  if (!retry.ok) throw new Error("Expected retry to deliver queued entry.");
  if (retry.entry.status !== "delivered") throw new Error("Expected delivered retry status.");

  const stored = await queue.readQueue(storage);
  const summary = queue.summarizeQueue(stored);
  if (summary.delivered !== 1 || summary.pending !== 0) throw new Error("Expected delivered queue summary.");
}

runQueueTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE

echo "Validation passed."
