---
title: ChannelCheevos Import Contract
status: ready
owner: @DreadBreadcrumb
priority: high
tags: [humble, channel-cheevos, import, contract]
---

# ChannelCheevos Import Contract

This contract defines the batch that HumbleAccept should send after extracting revealed Humble keys. It is adapter-facing: the browser extension normalizes the payload, and the downstream service can consume it without guessing at field names, duplicate rules, or retry behavior.

## Sources

The importer reads revealed Steam keys from Humble pages matched by the extension manifest:

- `https://www.humblebundle.com/downloads*`
- `https://www.humblebundle.com/home/keys*`

Each source row comes from an enabled Humble key field. The current extractor reads:

- `key`: text from `.keyfield-value`
- `title`: text from the nearest `.key-redeemer .heading-text h4`

Bundle name, order id, and claimed timestamp are optional until the Humble page parser captures them explicitly.

## Normalized Batch Schema

```json
{
  "source": "humble",
  "schemaVersion": 1,
  "exportedAt": "2026-06-29T00:00:00.000Z",
  "items": [
    {
      "title": "Game Title",
      "key": "AAAAA-BBBBB-CCCCC",
      "platform": "steam",
      "bundle": null,
      "sourceUrl": "https://www.humblebundle.com/home/keys",
      "observedAt": "2026-06-29T00:00:00.000Z",
      "idempotencyKey": "humble:steam:AAAAA-BBBBB-CCCCC"
    }
  ]
}
```

## Field Rules

| Field | Rule |
| --- | --- |
| `source` | Always `humble` for this extension path. |
| `schemaVersion` | Integer schema version. Start at `1`; increment only for breaking changes. |
| `exportedAt` | ISO 8601 UTC timestamp for the batch creation time. |
| `items[].title` | Trim whitespace and collapse repeated internal whitespace. Required. |
| `items[].key` | Trim whitespace and uppercase. Preserve dashes. Required. |
| `items[].platform` | `steam` for keys extracted by the current Humble page parser. |
| `items[].bundle` | Trimmed bundle/order label when known; otherwise `null`. |
| `items[].sourceUrl` | Current page URL without fragments. Query parameters may be removed unless needed to identify the order page. |
| `items[].observedAt` | ISO 8601 UTC timestamp when the extension observed the key row. |
| `items[].idempotencyKey` | `humble:{platform}:{key}` after key normalization. |

## Duplicate Handling

- De-duplicate within a batch by `idempotencyKey`.
- If duplicate rows have the same key and different titles, keep the first observed row and add the alternate title to adapter logs, not to the normalized payload.
- Replays are safe: channel-cheevos must treat `idempotencyKey` as an upsert/import-once key.

## Malformed Entry Handling

- Drop rows missing `key` or `title`.
- Drop rows whose normalized key is shorter than 11 characters or contains whitespace after trimming.
- Keep a local rejection count for operator feedback; do not send malformed entries downstream.
- If every row is rejected, do not call the adapter. Show an extension-visible error that no importable keys were found.

## ChannelCheevos Adapter Endpoint

The concrete target contract is:

```http
POST /api/imports/humble/keys
Authorization: Bearer <operator-configured token>
Content-Type: application/json
Idempotency-Key: <batch idempotency key>
```

The request body is the normalized batch schema above. The batch idempotency key should be a stable hash of the sorted item `idempotencyKey` values plus `schemaVersion`.

## Response Semantics

Successful import:

```json
{
  "status": "accepted",
  "importId": "humble-20260629-000001",
  "accepted": 3,
  "duplicates": 1,
  "rejected": []
}
```

Partial rejection:

```json
{
  "status": "accepted",
  "importId": "humble-20260629-000002",
  "accepted": 2,
  "duplicates": 0,
  "rejected": [
    {
      "idempotencyKey": "humble:steam:AAAAA-BBBBB-CCCCC",
      "reason": "already_redeemed"
    }
  ]
}
```

The adapter should return `202 Accepted` for queued imports and `200 OK` for synchronous imports. Validation failures return `400 Bad Request` with a `rejected` array. Auth failures return `401` or `403` and must not be retried without operator action.

## Retry Rules

- Retry `408`, `409`, `425`, `429`, and `5xx` responses with exponential backoff.
- Respect `Retry-After` when present.
- Do not retry `400`, `401`, `403`, or other permanent validation/auth failures.
- Use the same batch idempotency key on every retry.
- Retryable failures are stored in the extension-local durable import queue.
- Operators can retry pending or failed batches from the Humble extension options page without copying keys between tools.
- Delivered batches remain visible until cleared from the options page so operators can confirm the final queue state.

## Extension Wiring Notes

HumbleAccept should map its current `apiEndpoint` option to the full adapter URL and its `apiKey` option to the bearer token. The publisher should send only normalized batches, never raw DOM rows.
