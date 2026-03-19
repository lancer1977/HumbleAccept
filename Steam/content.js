const log = function (msg) {
  console.log(msg);
};

const KEY_REGEX = /\b[A-Z0-9]{5}(?:-[A-Z0-9]{5}){2,4}\b/;
const KEY_PARAM_NAMES = ["key", "code", "steamKey", "steam_key", "product_key"];

function normalizeKey(raw) {
  if (!raw || typeof raw !== "string") {
    return null;
  }

  const compact = raw.toUpperCase().replace(/\s/g, "");
  const matched = compact.match(KEY_REGEX);
  return matched ? matched[0] : null;
}

function getKeyInput() {
  return (
    document.querySelector("#product_key") ||
    document.querySelector('input[name="product_key"]')
  );
}

function extractKeyFromUrl() {
  const params = new URLSearchParams(window.location.search);

  for (const name of KEY_PARAM_NAMES) {
    const value = params.get(name);
    const parsed = normalizeKey(value);
    if (parsed) {
      return parsed;
    }
  }

  const hashCandidate = normalizeKey(window.location.hash.replace(/^#/, ""));
  return hashCandidate || null;
}

async function extractKeyFromClipboard() {
  if (!navigator.clipboard || !navigator.clipboard.readText) {
    return null;
  }

  try {
    const clipboardText = await navigator.clipboard.readText();
    return normalizeKey(clipboardText);
  } catch (error) {
    log("Clipboard read unavailable: " + error);
    return null;
  }
}

function fillKeyInput(key) {
  const input = getKeyInput();
  if (!input || !key) {
    return false;
  }

  input.value = key;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function checkBox() {
  const ssaInput = document.querySelector("#accept_ssa");
  if (ssaInput) {
    ssaInput.checked = true;
    ssaInput.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function hitButton() {
  const registerButton = document.querySelector("#register_btn");
  if (registerButton) {
    registerButton.click();
  }
}

function completed() {
  const receipt = document.querySelector("#receipt_form");
  if (!receipt) {
    return false;
  }

  const style = window.getComputedStyle(receipt);
  return style.display !== "none" && style.visibility !== "hidden";
}

function maybeCloseTab() {
  setTimeout(() => {
    if (!completed()) {
      return;
    }

    chrome.runtime.sendMessage({ closeRequest: "close" }, function (response) {
      log("closerequest:" + JSON.stringify(response));
    });
  }, 1000);
}

async function resolveSteamKey(preferredKey) {
  const explicit = normalizeKey(preferredKey);
  if (explicit) {
    return explicit;
  }

  const fromUrl = extractKeyFromUrl();
  if (fromUrl) {
    return fromUrl;
  }

  const fromClipboard = await extractKeyFromClipboard();
  return fromClipboard;
}

async function addListeners(preferredKey) {
  const steamKey = await resolveSteamKey(preferredKey);
  const keyWasFilled = fillKeyInput(steamKey);

  if (!keyWasFilled) {
    log("No Steam key found to auto-populate.");
    return;
  }

  checkBox();
  hitButton();
  maybeCloseTab();
}

function removeListeners() {
  log("removeListener");
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  log("Command:" + request.command);

  if (request.command === "init") {
    addListeners(request.key);
  } else {
    removeListeners();
  }

  sendResponse({ result: "success" });
});

window.addEventListener("load", function () {
  log("load");

  chrome.storage.sync.get("enableAuto", function (data) {
    const autoEnabled = data.enableAuto !== false;
    if (autoEnabled) {
      addListeners();
    } else {
      removeListeners();
    }
  });
});

