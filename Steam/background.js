const DEFAULT_SETTINGS = {
  enableAuto: true,
  enableContinue: true,
  enableDismiss: true,
  notifyOnDuplicate: true,
  notifyEndpoint: "",
  notifyApiKey: ""
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set(DEFAULT_SETTINGS);
});

function getSyncSettings(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, resolve);
  });
}

function getQueue() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ duplicateQueue: [] }, (items) => {
      resolve(items.duplicateQueue || []);
    });
  });
}

function setQueue(queue) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ duplicateQueue: queue }, resolve);
  });
}

function getQueueSnapshot() {
  return getQueue();
}

function clearQueue() {
  return setQueue([]);
}

async function queueDuplicate(payload) {
  const queue = await getQueue();
  queue.push(payload);
  await setQueue(queue);
  return { queued: true, queueLength: queue.length };
}

async function notifyDuplicate(payload) {
  const settings = await getSyncSettings([
    "notifyOnDuplicate",
    "notifyEndpoint",
    "notifyApiKey"
  ]);

  if (settings.notifyOnDuplicate === false) {
    return queueDuplicate(payload);
  }

  const endpoint = (settings.notifyEndpoint || "").trim();

  if (!endpoint) {
    return queueDuplicate(payload);
  }

  const headers = {
    "Content-Type": "application/json"
  };

  if (settings.notifyApiKey) {
    headers.Authorization = `Bearer ${settings.notifyApiKey}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    return queueDuplicate(payload);
  }

  return { queued: false, sent: true };
}

async function retryQueuedDuplicate(entry) {
  const payload = entry && entry.payload ? entry.payload : entry;
  if (!payload) {
    return { ok: false, error: "Missing queued payload" };
  }

  const result = await notifyDuplicate(payload);
  if (result.sent) {
    const queue = await getQueue();
    const signature = JSON.stringify(payload);
    const filtered = queue.filter((item) => JSON.stringify(item.payload || item) !== signature);
    await setQueue(filtered);
  }

  return result;
}

async function queueEvent(payload) {
  const queue = await getQueue();
  queue.push(payload);
  await setQueue(queue);
  return { queued: true, queueLength: queue.length };
}

async function notifyEvent(payload) {
  const settings = await getSyncSettings([
    "notifyOnDuplicate",
    "notifyEndpoint",
    "notifyApiKey"
  ]);

  if (settings.notifyOnDuplicate === false) {
    return queueEvent(payload);
  }

  const endpoint = (settings.notifyEndpoint || "").trim();

  if (!endpoint) {
    return queueEvent(payload);
  }

  const headers = {
    "Content-Type": "application/json"
  };

  if (settings.notifyApiKey) {
    headers.Authorization = `Bearer ${settings.notifyApiKey}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    return queueEvent(payload);
  }

  return { queued: false, sent: true };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.closeRequest === "close") {
    const tabId = sender && sender.tab ? sender.tab.id : null;

    if (typeof tabId === "number") {
      chrome.tabs.remove(tabId, () => {
        sendResponse({ farewell: "goodbye" });
      });
      return true;
    }
  }

  if (request && request.type === "duplicateKey") {
    const payload = {
      source: "SteamAccept",
      kind: "duplicate",
      key: request.key || "",
      pageUrl: request.pageUrl || "",
      message: request.message || "already owned",
      detectedAt: new Date().toISOString()
    };

    notifyDuplicate(payload)
      .then((result) => {
        sendResponse({ ok: true, ...result });
      })
      .catch((error) => {
        queueDuplicate(payload).then((result) => {
          sendResponse({ ok: false, error: error.message, ...result });
        });
      });

    return true;
  }

  if (request && request.type === "rateLimitedKey") {
    const payload = {
      source: "SteamAccept",
      kind: "rate_limited",
      key: request.key || "",
      pageUrl: request.pageUrl || "",
      message: request.message || "too many recent activation attempts",
      detectedAt: new Date().toISOString()
    };

    notifyEvent(payload)
      .then((result) => {
        sendResponse({ ok: true, ...result });
      })
      .catch((error) => {
        queueEvent(payload).then((result) => {
          sendResponse({ ok: false, error: error.message, ...result });
        });
      });

    return true;
  }

  if (request && request.type === "getDuplicateQueue") {
    getQueueSnapshot()
      .then((queue) => {
        sendResponse({ ok: true, queue });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message, queue: [] });
      });

    return true;
  }

  if (request && request.type === "retryDuplicateQueue") {
    retryQueuedDuplicate(request.entry)
      .then((result) => {
        sendResponse({ ok: true, result });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message });
      });

    return true;
  }

  if (request && request.type === "clearDuplicateQueue") {
    clearQueue()
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message });
      });

    return true;
  }

  sendResponse({ error: "not the droids you were looking for" });
  return false;
});
