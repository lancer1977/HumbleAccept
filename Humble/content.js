const KEY_STATUS_ID = "humble-key-status";

let publicationObserver = null;
let publicationTimer = null;
let publicationRunning = false;
let lastPublishedSignature = null;

function extractKeys() {
  const keys = [];

  document.querySelectorAll(".keyfield.enabled").forEach((keyBlock) => {
    const key = keyBlock.querySelector(".keyfield-value")?.textContent.trim();
    const title = keyBlock
      .closest(".key-redeemer")
      ?.querySelector(".heading-text h4")?.textContent.trim();

    if (key && title) {
      keys.push({ title, key });
    }
  });

  return keys;
}

function keySignature(keys) {
  return keys
    .map(({ title, key }) => `${title}:${key}`)
    .sort()
    .join("|");
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      ["enableAuto", "apiEndpoint", "apiKey", "closeTab"],
      resolve
    );
  });
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(response);
    });
  });
}

function renderStatus(message, tone) {
  let node = document.getElementById(KEY_STATUS_ID);

  if (!node) {
    node = document.createElement("div");
    node.id = KEY_STATUS_ID;
    node.style = `
      position: fixed;
      top: 14px;
      right: 14px;
      z-index: 999999;
      max-width: 360px;
      padding: 10px 12px;
      border-radius: 8px;
      color: #f3f3f3;
      font: 13px/1.4 sans-serif;
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.25);
    `;
    document.body.appendChild(node);
  }

  const palette = {
    success: "#135e28",
    error: "#8c1c13",
    warn: "#7a4b11",
    info: "#243b53"
  };

  node.style.background = palette[tone] || palette.info;
  node.textContent = message;
}

function createKeyTable(keys) {
  const container = document.createElement("div");
  container.id = "steam-key-popup";
  container.style = `
    position: fixed;
    top: 50px;
    right: 20px;
    max-height: 400px;
    overflow-y: auto;
    width: 400px;
    background: white;
    border: 1px solid #ccc;
    padding: 10px;
    z-index: 9999;
    font-family: sans-serif;
    box-shadow: 0 0 10px rgba(0,0,0,0.3);
  `;

  const closeButton = document.createElement("button");
  closeButton.textContent = "✖ Close";
  closeButton.style = "float: right; margin-bottom: 10px;";
  closeButton.onclick = () => container.remove();

  const publishButton = document.createElement("button");
  publishButton.textContent = "Send to ChannelCheevos";
  publishButton.style =
    "float: right; margin-right: 8px; margin-bottom: 10px; padding: 4px 8px;";

  const publishStatus = document.createElement("div");
  publishStatus.style = "clear: both; margin-bottom: 8px; color: #333;";

  publishButton.onclick = () => {
    publishButton.disabled = true;
    publishStatus.textContent = "Sending import batch...";

    chrome.runtime.sendMessage(
      {
        type: "publishHumbleKeys",
        rows: keys,
        sourceUrl: window.location.href
      },
      (response) => {
        publishButton.disabled = false;

        if (!response || !response.ok) {
          const queued = response && response.entry && response.entry.status === "pending";
          publishStatus.textContent = queued
            ? `Import queued for retry: ${response.error}`
            : `Import failed: ${(response && response.error) || "unknown error"}`;
          return;
        }

        publishStatus.textContent = `Delivered ${response.entry.batch.items.length} keys.`;
      }
    );
  };

  const table = document.createElement("table");
  table.style = "width: 100%; border-collapse: collapse;";

  const headerRow = document.createElement("tr");
  headerRow.innerHTML = `
    <th style="text-align:left; border-bottom:1px solid #ccc;">Key</th>
    <th style="text-align:left; border-bottom:1px solid #ccc;">Game</th>
    <th style="text-align:left; border-bottom:1px solid #ccc;">Action</th>
  `;
  table.appendChild(headerRow);

  keys.forEach(({ title, key }) => {
    const row = document.createElement("tr");
    const keyCell = document.createElement("td");
    keyCell.style = "padding: 4px 8px; font-family: monospace;";
    keyCell.textContent = key;

    const titleCell = document.createElement("td");
    titleCell.style = "padding: 4px 8px; vertical-align: top;";
    titleCell.textContent = title;

    const actionCell = document.createElement("td");
    actionCell.style = "padding: 4px 8px; vertical-align: top;";

    const redeemButton = document.createElement("button");
    redeemButton.textContent = "Redeem";
    redeemButton.style =
      "padding: 4px 8px; background:#1b2838; color:#c7d5e0; border:1px solid #66c0f4; border-radius:3px; cursor:pointer;";
    redeemButton.onclick = () => {
      const redeemUrl = `https://store.steampowered.com/account/registerkey?key=${encodeURIComponent(
        key
      )}`;
      window.open(redeemUrl, "_blank");
    };

    actionCell.appendChild(redeemButton);
    row.appendChild(keyCell);
    row.appendChild(titleCell);
    row.appendChild(actionCell);
    table.appendChild(row);
  });

  container.appendChild(closeButton);
  container.appendChild(publishButton);
  container.appendChild(publishStatus);
  container.appendChild(table);
  document.body.appendChild(container);
}

function createFloatingButton() {
  if (document.getElementById("steam-key-launcher")) {
    return;
  }

  const button = document.createElement("button");
  button.id = "steam-key-launcher";
  button.textContent = "📋 Get All Keys";
  button.style = `
    position: fixed;
    top: 10px;
    right: 20px;
    z-index: 9999;
    padding: 8px 12px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
  `;

  button.onclick = () => {
    const keys = extractKeys();
    if (keys.length === 0) {
      alert("No revealed Humble keys found.");
      return;
    }

    syncKeys({ manual: true })
      .catch((error) => {
        renderStatus(`Publish failed: ${error.message}`, "error");
      })
      .finally(() => {
        createKeyTable(keys);
      });
  };

  document.body.appendChild(button);
}

function scheduleSync(manual = false) {
  if (publicationTimer) {
    clearTimeout(publicationTimer);
  }

  publicationTimer = setTimeout(() => {
    syncKeys({ manual }).catch((error) => {
      renderStatus(`Publish failed: ${error.message}`, "error");
    });
  }, 250);
}

async function syncKeys({ manual = false } = {}) {
  if (publicationRunning) {
    return false;
  }

  publicationRunning = true;

  try {
    const settings = await getSettings();

    if (settings.enableAuto === false && !manual) {
      return false;
    }

    const keys = extractKeys();
    if (keys.length === 0) {
      if (manual) {
        renderStatus("No revealed Humble keys found.", "warn");
      }

      return false;
    }

    const signature = keySignature(keys);
    if (!manual && signature === lastPublishedSignature) {
      return false;
    }

    const response = await sendMessage({
      type: "publishHumbleKeys",
      rows: keys,
      sourceUrl: window.location.href
    });

    if (!response || response.ok === false) {
      throw new Error((response && response.error) || "Unknown publish failure");
    }

    lastPublishedSignature = signature;
    const delivered = response.entry && response.entry.status === "delivered";
    renderStatus(
      delivered
        ? `Delivered ${keys.length} key(s) to channel-cheevos.`
        : `Queued ${keys.length} key(s) for retry.`,
      delivered ? "success" : "warn"
    );

    if (settings.closeTab === true) {
      await sendMessage({ closeRequest: "close" });
    }

    return true;
  } finally {
    publicationRunning = false;
  }
}

function startObserver() {
  if (publicationObserver || !document.body) {
    return;
  }

  publicationObserver = new MutationObserver(() => {
    scheduleSync(false);
  });

  publicationObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function stopObserver() {
  if (publicationObserver) {
    publicationObserver.disconnect();
    publicationObserver = null;
  }

  if (publicationTimer) {
    clearTimeout(publicationTimer);
    publicationTimer = null;
  }

  publicationRunning = false;
}

function bootstrap() {
  createFloatingButton();
  startObserver();
  scheduleSync(false);
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(bootstrap, 0);
} else {
  window.addEventListener("load", bootstrap);
}
