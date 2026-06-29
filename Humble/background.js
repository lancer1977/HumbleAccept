// background.js
importScripts('importQueue.js');

console.log('[Humble Extractorr] Background script loaded');

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['apiEndpoint', 'apiKey'], resolve);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  if (message.type === 'humbleQueueStatus') {
    HumbleImportQueue.readQueue().then((queue) => {
      sendResponse({
        ok: true,
        queue,
        summary: HumbleImportQueue.summarizeQueue(queue)
      });
    });
    return true;
  }

  if (message.type === 'publishHumbleKeys') {
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

  if (message.type === 'retryHumbleQueueEntry') {
    getSettings()
      .then((settings) => HumbleImportQueue.retryEntry(message.id, { settings }))
      .then(sendResponse);
    return true;
  }

  if (message.type === 'clearDeliveredHumbleQueue') {
    HumbleImportQueue.clearDelivered().then((queue) => {
      sendResponse({
        ok: true,
        queue,
        summary: HumbleImportQueue.summarizeQueue(queue)
      });
    });
    return true;
  }

  return false;
});
