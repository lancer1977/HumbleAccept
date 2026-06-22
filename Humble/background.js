importScripts("importQueue.js");

const DEFAULT_SETTINGS = {
  enableAuto: true,
  closeTab: false
};

console.log("[Humble Extractor] Background script loaded");

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["apiEndpoint", "apiKey"], resolve);
  });
}

function postKeys(keys) {
  return getSettings().then((settings) => {
    const endpoint = (settings.apiEndpoint || "").trim();

    if (!endpoint) {
      throw new Error("No API endpoint configured.");
    }

    const headers = {
      "Content-Type": "application/json"
    };

    if (settings.apiKey) {
      headers.Authorization = `Bearer ${settings.apiKey}`;
    }

    return fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        source: "HumbleAccept",
        provider: "HumbleBundle",
        collectedAt: new Date().toISOString(),
        keys
      })
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`Publish failed with HTTP ${response.status}`);
      }

      return response;
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set(DEFAULT_SETTINGS);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    if (message && message.closeRequest === "close") {
      const tabId = sender && sender.tab ? sender.tab.id : null;

      if (typeof tabId === "number") {
        chrome.tabs.remove(tabId, () => {
          sendResponse({ farewell: "goodbye" });
        });
        return true;
      }
    }

    sendResponse({ error: "not the droids you were looking for" });
    return false;
  }

  if (message.type === "humbleQueueStatus") {
    HumbleImportQueue.readQueue().then((queue) => {
      sendResponse({
        ok: true,
        queue,
        summary: HumbleImportQueue.summarizeQueue(queue)
      });
    });
    return true;
  }

  if (message.type === "publishHumbleKeys") {
    getSettings()
      .then((settings) =>
        HumbleImportQueue.publishRows(message.rows || [], {
          sourceUrl: message.sourceUrl,
          settings
        })
      )
      .then(sendResponse);
    return true;
  }

  if (message.type === "publishKeys") {
    postKeys(message.keys || [])
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message.type === "retryHumbleQueueEntry") {
    getSettings()
      .then((settings) => HumbleImportQueue.retryEntry(message.id, { settings }))
      .then(sendResponse);
    return true;
  }

  if (message.type === "clearDeliveredHumbleQueue") {
    HumbleImportQueue.clearDelivered().then((queue) => {
      sendResponse({
        ok: true,
        queue,
        summary: HumbleImportQueue.summarizeQueue(queue)
      });
    });
    return true;
  }

  sendResponse({ error: "not the droids you were looking for" });
  return false;
});
