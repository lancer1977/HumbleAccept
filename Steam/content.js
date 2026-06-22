const log = function (msg) {
  console.log(msg);
};

const KEY_REGEX = /\b[A-Z0-9]{5}(?:-[A-Z0-9]{5}){2,4}\b/;
const KEY_PARAM_NAMES = ["key", "code", "steamKey", "steam_key", "product_key"];

const DISMISS_TEXTS = ["dismiss", "close", "cancel", "no thanks", "skip"];
const CONTINUE_TEXTS = ["continue", "proceed", "ok", "got it", "next", "register"];
const DUPLICATE_TEXTS = [
  "you already own this",
  "you already own the product",
  "already own this",
  "already own the product",
  "already owned",
  "already consumed",
  "already consumed the key",
  "already own it",
  "already been activated",
  "already activated",
  "you have already consumed this key"
];

const RATE_LIMIT_TEXTS = [
  "too many recent activation attempts from this account or internet address",
  "too many recent activation attempts",
  "please wait and try your product code again later"
];

let automationObserver = null;
let automationTimer = null;
let resultPollTimer = null;
let successCloseTimer = null;
let automationRunning = false;
let submitted = false;
let currentKey = null;
let duplicateReported = false;
let duplicateCopied = false;
let rateLimitReported = false;
let bridgeLoaded = false;

function normalizeKey(raw) {
  if (!raw || typeof raw !== "string") {
    return null;
  }

  const compact = raw.toUpperCase().replace(/\s/g, "");
  const matched = compact.match(KEY_REGEX);
  return matched ? matched[0] : null;
}

function getRegisterForm() {
  return (
    document.querySelector('form[action*="registerkey"]') ||
    document.querySelector("#registerkey_form")
  );
}

function getKeyInput() {
  const form = getRegisterForm();
  return (
    form?.querySelector("#product_key") ||
    form?.querySelector('input[name="product_key"]') ||
    form?.querySelector('input[name*="key" i]') ||
    document.querySelector("#product_key") ||
    document.querySelector('input[name="product_key"]')
  );
}

function getKeyInputValue() {
  return normalizeKey(getKeyInput()?.value || "");
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

  return normalizeKey(window.location.hash.replace(/^#/, ""));
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

  if (normalizeKey(input.value) === key) {
    return true;
  }

  input.value = key;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function getAcceptCheckbox() {
  const form = getRegisterForm();
  return (
    form?.querySelector("#accept_ssa") ||
    form?.querySelector('input[type="checkbox"]') ||
    document.querySelector("#accept_ssa") ||
    document.querySelector('input[type="checkbox"]')
  );
}

function checkBox() {
  const ssaInput = getAcceptCheckbox();
  if (ssaInput) {
    ssaInput.checked = true;
    ssaInput.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function isVisible(node) {
  return !!(node && node.getClientRects && node.getClientRects().length);
}

function buttonLabel(node) {
  return (
    (node.innerText || node.value || node.getAttribute("aria-label") || node.title || "")
      .trim()
      .toLowerCase()
  );
}

function containsAny(text, needles) {
  return needles.some((needle) => text === needle || text.includes(needle));
}

function isJavascriptHref(node) {
  if (!node || node.tagName !== "A") {
    return false;
  }

  const href = (node.getAttribute("href") || "").trim().toLowerCase();
  return href.startsWith("javascript:");
}

function safeClick(node) {
  if (!node) {
    return false;
  }

  if (isJavascriptHref(node)) {
    return false;
  }

  if (typeof node.click === "function") {
    node.click();
    return true;
  }

  return false;
}

function clickMatchingControl(texts) {
  const form = getRegisterForm();
  if (!form) {
    return false;
  }

  const candidates = [
    ...Array.from(
      form.querySelectorAll(
        'button, input[type="button"], input[type="submit"], [role="button"]'
      )
    ),
    ...Array.from(form.querySelectorAll('a'))
  ];

  for (const target of candidates) {
    if (!isVisible(target)) {
      continue;
    }

    const label = buttonLabel(target);
    if (!containsAny(label, texts)) {
      continue;
    }

    if (safeClick(target)) {
      return true;
    }
  }

  return false;
}

function clickPrimaryAction() {
  const form = getRegisterForm();
  if (!form) {
    return false;
  }

  const knownSelectors = [
    "#register_btn",
    'input[type="submit"]',
    'button[type="submit"]'
  ];

  for (const selector of knownSelectors) {
    const button = form.querySelector(selector);
    if (isVisible(button) && safeClick(button)) {
      return true;
    }
  }

  return clickMatchingControl(["register", "submit"]);
}

function clickContinueAction() {
  const form = getRegisterForm();
  const knownSelectors = [
    "#continue_btn",
    'button[name="continue"]',
    'input[name="continue"]',
    'button.continue',
    'input.continue'
  ];

  for (const selector of knownSelectors) {
    const button = form.querySelector(selector);
    if (isVisible(button) && safeClick(button)) {
      return true;
    }
  }

  return clickMatchingControl(["continue", "proceed", "next", "ok", "got it"]);
}

function ensureBridge() {
  if (bridgeLoaded) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("steam-bridge.js");
    script.async = false;
    script.onload = () => {
      bridgeLoaded = true;
      if (typeof script.remove === "function") {
        script.remove();
      }
      resolve(true);
    };
    script.onerror = () => {
      if (typeof script.remove === "function") {
        script.remove();
      }
      resolve(false);
    };

    (document.head || document.documentElement).appendChild(script);
  });
}

function invokeRegisterProductKey() {
  if (!bridgeLoaded) {
    return false;
  }

  window.postMessage(
    {
      type: "HUMBLE_ACCEPT_STEAM_REGISTER"
    },
    window.location.origin
  );

  return true;
}

function dismissDialogs(enableDismiss) {
  if (!enableDismiss) {
    return false;
  }

  return clickMatchingControl(DISMISS_TEXTS);
}

function continueDialogs(enableContinue) {
  if (!enableContinue) {
    return false;
  }

  return clickMatchingControl(CONTINUE_TEXTS);
}

function pageText() {
  return (document.body?.innerText || "").toLowerCase();
}

function duplicateDetected() {
  const errorText = (document.querySelector("#error_display")?.innerText || "").toLowerCase();
  const bodyText = pageText();

  return DUPLICATE_TEXTS.some((phrase) => errorText.includes(phrase) || bodyText.includes(phrase));
}

function copyTextToClipboard(text) {
  if (!text) {
    return Promise.resolve(false);
  }

  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(text)
      .then(() => true)
      .catch(() => false);
  }

  return new Promise((resolve) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);

    if (typeof textarea.select === "function") {
      textarea.select();
    }

    let copied = false;
    try {
      copied = typeof document.execCommand === "function" && document.execCommand("copy");
    } catch (error) {
      copied = false;
    }

    if (typeof textarea.remove === "function") {
      textarea.remove();
    }

    resolve(!!copied);
  });
}

function rateLimitDetected() {
  const errorText = (document.querySelector("#error_display")?.innerText || "").toLowerCase();
  const bodyText = pageText();

  return RATE_LIMIT_TEXTS.some((phrase) => errorText.includes(phrase) || bodyText.includes(phrase));
}

function successDetected() {
  const receipt = document.querySelector("#receipt_form");
  if (receipt) {
    const style = window.getComputedStyle(receipt);
    if (style.display !== "none" && style.visibility !== "hidden") {
      return true;
    }
  }

  return false;
}

function maybeCloseTab() {
  if (successCloseTimer) {
    return;
  }

  successCloseTimer = setTimeout(() => {
    if (!successDetected()) {
      successCloseTimer = null;
      return;
    }

    chrome.runtime.sendMessage({ closeRequest: "close" }, function (response) {
      log("closerequest:" + JSON.stringify(response));
    });
  }, 1000);
}

async function resolveSteamKey(preferredKey) {
  const fromInput = getKeyInputValue();
  if (fromInput) {
    return fromInput;
  }

  const explicit = normalizeKey(preferredKey);
  if (explicit) {
    return explicit;
  }

  const fromUrl = extractKeyFromUrl();
  if (fromUrl) {
    return fromUrl;
  }

  return extractKeyFromClipboard();
}

function clearResultPoll() {
  if (resultPollTimer) {
    clearInterval(resultPollTimer);
    resultPollTimer = null;
  }
}

function reportDuplicate() {
  if (duplicateReported) {
    return;
  }

  duplicateReported = true;

  chrome.runtime.sendMessage(
    {
      type: "duplicateKey",
      key: currentKey,
      pageUrl: window.location.href,
      message: "already own this"
    },
    function (response) {
      log("duplicate:" + JSON.stringify(response));
    }
  );
}

async function preserveDuplicateKey() {
  if (duplicateCopied) {
    return;
  }

  duplicateCopied = true;
  const copied = await copyTextToClipboard(currentKey);
  log("duplicate-copy:" + JSON.stringify({ copied }));
}

function reportRateLimit() {
  if (rateLimitReported) {
    return;
  }

  rateLimitReported = true;

  chrome.runtime.sendMessage(
    {
      type: "rateLimitedKey",
      key: currentKey,
      pageUrl: window.location.href,
      message: "too many recent activation attempts"
    },
    function (response) {
      log("rateLimited:" + JSON.stringify(response));
    }
  );
}

function processResult() {
  if (successDetected()) {
    clearResultPoll();
    maybeCloseTab();
    return true;
  }

  if (duplicateDetected()) {
    clearResultPoll();
    reportDuplicate();
    preserveDuplicateKey();
    return true;
  }

  if (rateLimitDetected()) {
    clearResultPoll();
    reportRateLimit();
    return true;
  }

  return false;
}

function startResultPoll() {
  if (resultPollTimer) {
    return;
  }

  resultPollTimer = setInterval(() => {
    processResult();
  }, 500);
}

async function performAutomation(preferredKey) {
  if (automationRunning) {
    return;
  }

  automationRunning = true;

  try {
    const settings = await new Promise((resolve) => {
      chrome.storage.sync.get(["enableAuto", "enableContinue", "enableDismiss"], resolve);
    });

    if (settings.enableAuto === false) {
      return;
    }

    currentKey = currentKey || getKeyInputValue() || (await resolveSteamKey(preferredKey));

    if (processResult()) {
      return;
    }

    if (!currentKey) {
      dismissDialogs(settings.enableDismiss !== false);
      continueDialogs(settings.enableContinue !== false);
      return;
    }

    const keyWasFilled = fillKeyInput(currentKey);
    checkBox();

    dismissDialogs(settings.enableDismiss !== false);
    await ensureBridge();
    const continueClicked = settings.enableContinue !== false ? invokeRegisterProductKey() : false;
    const registerClicked = !continueClicked && keyWasFilled ? clickPrimaryAction() : false;
    submitted = submitted || continueClicked || registerClicked;

    if (submitted || continueClicked || registerClicked || keyWasFilled) {
      startResultPoll();
    }

    processResult();
  } finally {
    automationRunning = false;
  }
}

function scheduleAutomation(preferredKey) {
  if (automationTimer) {
    clearTimeout(automationTimer);
  }

  automationTimer = setTimeout(() => {
    performAutomation(preferredKey);
  }, 250);
}

function startObserver() {
  if (automationObserver || !document.body) {
    return;
  }

  automationObserver = new MutationObserver(() => {
    scheduleAutomation();
  });

  automationObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function removeListeners() {
  if (automationObserver) {
    automationObserver.disconnect();
    automationObserver = null;
  }

  if (automationTimer) {
    clearTimeout(automationTimer);
    automationTimer = null;
  }

  clearResultPoll();

  if (successCloseTimer) {
    clearTimeout(successCloseTimer);
    successCloseTimer = null;
  }

  automationRunning = false;
  submitted = false;
  currentKey = null;
  duplicateReported = false;
  duplicateCopied = false;
  rateLimitReported = false;
  log("removeListener");
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  log("Command:" + request.command);

  if (request.command === "init") {
    currentKey = normalizeKey(request.key) || currentKey;
    scheduleAutomation(request.key);
  } else {
    removeListeners();
  }

  sendResponse({ result: "success" });
});

function bootstrapAutomation() {
  log("load");

  chrome.storage.sync.get(["enableAuto", "enableContinue", "enableDismiss"], function (data) {
    const autoEnabled = data.enableAuto !== false;

    if (autoEnabled) {
      startObserver();
      scheduleAutomation();
    } else {
      removeListeners();
    }
  });
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(bootstrapAutomation, 0);
} else {
  window.addEventListener("load", bootstrapAutomation);
}

window.__humbleAcceptSteam = {
  performAutomation,
  checkBox,
  clickContinueAction,
  clickPrimaryAction,
  continueDialogs,
  dismissDialogs,
  ensureBridge,
  invokeRegisterProductKey,
  processResult,
  rateLimitDetected,
  reportRateLimit,
  resolveSteamKey
};
