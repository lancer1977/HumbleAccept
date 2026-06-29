(function (root) {
  const QUEUE_KEY = 'humbleImportQueue';
  const RETRYABLE_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizeText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function normalizeKey(value) {
    return String(value || '').trim().toUpperCase();
  }

  function cleanSourceUrl(value) {
    try {
      const url = new URL(value || '');
      url.hash = '';
      return url.toString();
    } catch {
      return null;
    }
  }

  function normalizeRows(rows, sourceUrl, observedAt) {
    const seen = new Set();
    const items = [];
    const rejected = [];
    const normalizedSourceUrl = cleanSourceUrl(sourceUrl);

    for (const row of rows || []) {
      const title = normalizeText(row.title);
      const key = normalizeKey(row.key);

      if (!title || !key || key.length < 11 || /\s/.test(key)) {
        rejected.push({ title, key, reason: 'malformed' });
        continue;
      }

      const idempotencyKey = `humble:steam:${key}`;
      if (seen.has(idempotencyKey)) {
        continue;
      }

      seen.add(idempotencyKey);
      items.push({
        title,
        key,
        platform: 'steam',
        bundle: null,
        sourceUrl: normalizedSourceUrl,
        observedAt,
        idempotencyKey
      });
    }

    return { items, rejected };
  }

  function hashString(input) {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function createBatch(rows, sourceUrl, exportedAt) {
    const timestamp = exportedAt || nowIso();
    const normalized = normalizeRows(rows, sourceUrl, timestamp);

    if (normalized.items.length === 0) {
      return {
        ok: false,
        error: 'No importable Humble keys were found.',
        rejected: normalized.rejected
      };
    }

    const idSource = normalized.items
      .map((item) => item.idempotencyKey)
      .sort()
      .join('|');

    return {
      ok: true,
      batch: {
        source: 'humble',
        schemaVersion: 1,
        exportedAt: timestamp,
        items: normalized.items
      },
      batchId: `humble-${hashString(`1|${idSource}`)}`,
      rejected: normalized.rejected
    };
  }

  function getStorage(storage) {
    return storage || chrome.storage.local;
  }

  function readQueue(storage) {
    return new Promise((resolve) => {
      getStorage(storage).get([QUEUE_KEY], (items) => {
        resolve(Array.isArray(items[QUEUE_KEY]) ? items[QUEUE_KEY] : []);
      });
    });
  }

  function writeQueue(queue, storage) {
    return new Promise((resolve) => {
      getStorage(storage).set({ [QUEUE_KEY]: queue }, resolve);
    });
  }

  function createQueueEntry(batch, batchId, status, error) {
    const timestamp = nowIso();
    return {
      id: batchId,
      status,
      attempts: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastError: error || null,
      deliveredAt: null,
      response: null,
      batch
    };
  }

  function summarizeQueue(queue) {
    const summary = { pending: 0, failed: 0, delivered: 0, total: queue.length };
    for (const item of queue) {
      if (item.status === 'delivered') {
        summary.delivered += 1;
      } else if (item.status === 'failed') {
        summary.failed += 1;
      } else {
        summary.pending += 1;
      }
    }

    return summary;
  }

  function upsertQueueEntry(queue, entry) {
    const index = queue.findIndex((item) => item.id === entry.id);
    if (index === -1) {
      return [entry, ...queue];
    }

    const existing = queue[index];
    const next = queue.slice();
    next[index] = {
      ...existing,
      ...entry,
      createdAt: existing.createdAt || entry.createdAt,
      attempts: existing.attempts || entry.attempts || 0
    };
    return next;
  }

  function classifyError(error) {
    if (error && typeof error.status === 'number') {
      if (RETRYABLE_STATUSES.has(error.status)) {
        return { status: 'pending', message: error.message || `HTTP ${error.status}` };
      }

      return { status: 'failed', message: error.message || `HTTP ${error.status}` };
    }

    return { status: 'pending', message: error && error.message ? error.message : 'Network error' };
  }

  async function sendBatch(batch, batchId, settings, fetchImpl) {
    const endpoint = normalizeText(settings && settings.apiEndpoint);
    const apiKey = normalizeText(settings && settings.apiKey);

    if (!endpoint) {
      throw { status: 0, message: 'API endpoint is not configured.' };
    }

    const headers = {
      'Content-Type': 'application/json',
      'Idempotency-Key': batchId
    };

    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await (fetchImpl || fetch)(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(batch)
    });

    if (!response.ok) {
      throw {
        status: response.status,
        message: `Import failed with HTTP ${response.status}.`
      };
    }

    const text = await response.text();
    return text ? JSON.parse(text) : { status: 'accepted' };
  }

  async function storeBatchResult(batch, batchId, result, storage) {
    const queue = await readQueue(storage);
    const existing = queue.find((item) => item.id === batchId);
    const attempts = (existing && existing.attempts ? existing.attempts : 0) + 1;
    const entry = {
      ...(existing || createQueueEntry(batch, batchId, 'pending')),
      batch,
      status: 'delivered',
      attempts,
      updatedAt: nowIso(),
      deliveredAt: nowIso(),
      lastError: null,
      response: result
    };
    const next = upsertQueueEntry(queue, entry);
    await writeQueue(next, storage);
    return entry;
  }

  async function storeBatchFailure(batch, batchId, error, storage) {
    const queue = await readQueue(storage);
    const existing = queue.find((item) => item.id === batchId);
    const classified = classifyError(error);
    const attempts = (existing && existing.attempts ? existing.attempts : 0) + 1;
    const entry = {
      ...(existing || createQueueEntry(batch, batchId, classified.status, classified.message)),
      batch,
      status: classified.status,
      attempts,
      updatedAt: nowIso(),
      deliveredAt: null,
      lastError: classified.message,
      response: null
    };
    const next = upsertQueueEntry(queue, entry);
    await writeQueue(next, storage);
    return entry;
  }

  async function publishRows(rows, options) {
    const opts = options || {};
    const created = createBatch(rows, opts.sourceUrl, opts.exportedAt);
    if (!created.ok) {
      return created;
    }

    try {
      const result = await sendBatch(created.batch, created.batchId, opts.settings, opts.fetchImpl);
      const entry = await storeBatchResult(created.batch, created.batchId, result, opts.storage);
      return { ok: true, entry, rejected: created.rejected };
    } catch (error) {
      const entry = await storeBatchFailure(created.batch, created.batchId, error, opts.storage);
      return { ok: false, entry, rejected: created.rejected, error: entry.lastError };
    }
  }

  async function retryEntry(id, options) {
    const opts = options || {};
    const queue = await readQueue(opts.storage);
    const entry = queue.find((item) => item.id === id);

    if (!entry) {
      return { ok: false, error: 'Queued batch was not found.' };
    }

    try {
      const result = await sendBatch(entry.batch, entry.id, opts.settings, opts.fetchImpl);
      const delivered = await storeBatchResult(entry.batch, entry.id, result, opts.storage);
      return { ok: true, entry: delivered };
    } catch (error) {
      const failed = await storeBatchFailure(entry.batch, entry.id, error, opts.storage);
      return { ok: false, entry: failed, error: failed.lastError };
    }
  }

  async function clearDelivered(storage) {
    const queue = await readQueue(storage);
    const next = queue.filter((entry) => entry.status !== 'delivered');
    await writeQueue(next, storage);
    return next;
  }

  root.HumbleImportQueue = {
    QUEUE_KEY,
    createBatch,
    readQueue,
    writeQueue,
    publishRows,
    retryEntry,
    clearDelivered,
    summarizeQueue
  };

  if (typeof module !== 'undefined') {
    module.exports = root.HumbleImportQueue;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
