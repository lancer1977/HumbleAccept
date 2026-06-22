document.addEventListener("DOMContentLoaded", () => {
  const enableAuto = document.getElementById("enableAuto");
  const apiEndpoint = document.getElementById("apiEndpoint");
  const apiKey = document.getElementById("apiKey");
  const closeTab = document.getElementById("closeTab");
  const status = document.getElementById("status");
  const queueSummary = document.getElementById("queueSummary");
  const queueList = document.getElementById("queueList");
  const refreshQueue = document.getElementById("refreshQueue");
  const clearDelivered = document.getElementById("clearDelivered");

  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, resolve);
    });
  }

  function showStatus(message) {
    status.textContent = message;
    setTimeout(() => {
      status.textContent = "";
    }, 2000);
  }

  function formatQueueEntry(entry) {
    const itemCount = entry.batch && Array.isArray(entry.batch.items) ? entry.batch.items.length : 0;
    const lastError = entry.lastError ? `; ${entry.lastError}` : "";
    return `${entry.status}: ${itemCount} keys; attempts ${entry.attempts}${lastError}`;
  }

  function renderQueue(queue, summary) {
    const stats = summary || HumbleImportQueue.summarizeQueue(queue);
    queueSummary.textContent = `${stats.pending} pending, ${stats.failed} failed, ${stats.delivered} delivered`;
    queueList.textContent = "";

    if (queue.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No queued Humble imports.";
      queueList.appendChild(empty);
      return;
    }

    queue.forEach((entry) => {
      const row = document.createElement("div");
      row.className = `queue-entry queue-${entry.status}`;

      const details = document.createElement("span");
      details.textContent = formatQueueEntry(entry);
      row.appendChild(details);

      if (entry.status !== "delivered") {
        const retryButton = document.createElement("button");
        retryButton.type = "button";
        retryButton.textContent = "Retry";
        retryButton.addEventListener("click", async () => {
          retryButton.disabled = true;
          const response = await sendMessage({
            type: "retryHumbleQueueEntry",
            id: entry.id
          });
          await loadQueue();
          showStatus(response && response.ok ? "Retry delivered." : "Retry queued or failed.");
        });
        row.appendChild(retryButton);
      }

      queueList.appendChild(row);
    });
  }

  async function loadQueue() {
    const response = await sendMessage({ type: "humbleQueueStatus" });
    renderQueue((response && response.queue) || [], response && response.summary);
  }

  chrome.storage.sync.get(
    ["enableAuto", "apiEndpoint", "apiKey", "closeTab"],
    (items) => {
      enableAuto.checked = items.enableAuto !== false;
      apiEndpoint.value = items.apiEndpoint || "";
      apiKey.value = items.apiKey || "";
      closeTab.checked = items.closeTab === true;
    }
  );

  document.getElementById("settingsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    chrome.storage.sync.set(
      {
        enableAuto: enableAuto.checked,
        apiEndpoint: apiEndpoint.value.trim(),
        apiKey: apiKey.value.trim(),
        closeTab: closeTab.checked
      },
      () => {
        showStatus("Settings saved.");
      }
    );
  });

  refreshQueue.addEventListener("click", loadQueue);
  clearDelivered.addEventListener("click", async () => {
    await sendMessage({ type: "clearDeliveredHumbleQueue" });
    await loadQueue();
    showStatus("Delivered imports cleared.");
  });

  loadQueue();
});
