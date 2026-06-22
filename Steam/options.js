document.addEventListener("DOMContentLoaded", () => {
  const enableAuto = document.getElementById("enableAuto");
  const enableContinue = document.getElementById("enableContinue");
  const enableDismiss = document.getElementById("enableDismiss");
  const notifyOnDuplicate = document.getElementById("notifyOnDuplicate");
  const notifyEndpoint = document.getElementById("notifyEndpoint");
  const notifyApiKey = document.getElementById("notifyApiKey");
  const status = document.getElementById("status");
  const queueStatus = document.getElementById("queueStatus");
  const queueList = document.getElementById("queueList");
  const refreshQueue = document.getElementById("refreshQueue");
  const retryAllQueue = document.getElementById("retryAllQueue");
  const clearQueue = document.getElementById("clearQueue");

  function showStatus(message, tone = "default") {
    status.textContent = message;
    status.style.color = tone === "error" ? "#8c1c13" : tone === "success" ? "#135e28" : "#222";
  }

  function saveSync(keys) {
    chrome.storage.sync.set(keys);
  }

  function renderQueue(queue) {
    queueList.innerHTML = "";

    if (!queue || queue.length === 0) {
      queueStatus.textContent = "Queue is empty.";
      return;
    }

    queueStatus.textContent = `${queue.length} queued duplicate key(s).`;

    queue.forEach((entry, index) => {
      const payload = entry && entry.payload ? entry.payload : entry;
      const item = document.createElement("div");
      item.className = "queue-item";

      const title = document.createElement("div");
      title.innerHTML = `<strong>${payload.key || "(unknown key)"}</strong>`;

      const meta = document.createElement("div");
      meta.className = "muted";
      meta.textContent = `${payload.detectedAt || "unknown time"} | ${payload.pageUrl || ""}`;

      const message = document.createElement("pre");
      message.textContent = JSON.stringify(payload, null, 2);

      const retryButton = document.createElement("button");
      retryButton.type = "button";
      retryButton.textContent = "Retry";
      retryButton.onclick = () => {
        chrome.runtime.sendMessage({ type: "retryDuplicateQueue", entry }, (response) => {
          if (!response || response.ok === false) {
            showStatus(response?.error || "Retry failed.", "error");
            return;
          }

          showStatus("Queued key retried.", "success");
          loadQueue();
        });
      };

      item.appendChild(title);
      item.appendChild(meta);
      item.appendChild(message);
      item.appendChild(retryButton);
      queueList.appendChild(item);
    });
  }

  function loadQueue() {
    chrome.runtime.sendMessage({ type: "getDuplicateQueue" }, (response) => {
      if (!response || response.ok === false) {
        queueStatus.textContent = response?.error || "Unable to load queue.";
        renderQueue([]);
        return;
      }

      renderQueue(response.queue || []);
    });
  }

  chrome.storage.sync.get(
    [
      "enableAuto",
      "enableContinue",
      "enableDismiss",
      "notifyOnDuplicate",
      "notifyEndpoint",
      "notifyApiKey"
    ],
    (data) => {
      enableAuto.checked = data.enableAuto !== false;
      enableContinue.checked = data.enableContinue !== false;
      enableDismiss.checked = data.enableDismiss !== false;
      notifyOnDuplicate.checked = data.notifyOnDuplicate !== false;
      notifyEndpoint.value = data.notifyEndpoint || "";
      notifyApiKey.value = data.notifyApiKey || "";
    }
  );

  enableAuto.onchange = function () {
    saveSync({ enableAuto: this.checked });
  };

  enableContinue.onchange = function () {
    saveSync({ enableContinue: this.checked });
  };

  enableDismiss.onchange = function () {
    saveSync({ enableDismiss: this.checked });
  };

  notifyOnDuplicate.onchange = function () {
    saveSync({ notifyOnDuplicate: this.checked });
  };

  notifyEndpoint.onchange = function () {
    saveSync({ notifyEndpoint: this.value.trim() });
  };

  notifyApiKey.onchange = function () {
    saveSync({ notifyApiKey: this.value.trim() });
  };

  refreshQueue.onclick = loadQueue;

  retryAllQueue.onclick = () => {
    chrome.runtime.sendMessage({ type: "getDuplicateQueue" }, (response) => {
      if (!response || response.ok === false) {
        showStatus(response?.error || "Unable to load queue.", "error");
        return;
      }

      const queue = response.queue || [];
      if (queue.length === 0) {
        showStatus("Queue is empty.", "default");
        return;
      }

      let index = 0;
      const next = () => {
        if (index >= queue.length) {
          showStatus("Finished retrying queued keys.", "success");
          loadQueue();
          return;
        }

        chrome.runtime.sendMessage({ type: "retryDuplicateQueue", entry: queue[index++] }, (result) => {
          if (!result || result.ok === false) {
            showStatus(result?.error || "Retry failed.", "error");
          }
          next();
        });
      };

      next();
    });
  };

  clearQueue.onclick = () => {
    chrome.runtime.sendMessage({ type: "clearDuplicateQueue" }, (response) => {
      if (!response || response.ok === false) {
        showStatus(response?.error || "Unable to clear queue.", "error");
        return;
      }

      showStatus("Queue cleared.", "success");
      loadQueue();
    });
  };

  loadQueue();
});
