import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentPath = path.join(repoRoot, "Steam", "content.js");
const source = fs.readFileSync(contentPath, "utf8");

class MockElement {
  constructor({ id = "", tagName = "div", type = "", name = "", value = "", text = "" } = {}) {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.type = type;
    this.name = name;
    this.value = value;
    this.textContent = text;
    this.innerText = text;
    this.title = "";
    this.checked = false;
    this.visible = true;
    this.clickCount = 0;
    this.eventCounts = new Map();
  }

  dispatchEvent(event) {
    const current = this.eventCounts.get(event.type) || 0;
    this.eventCounts.set(event.type, current + 1);
    return true;
  }

  click() {
    this.clickCount += 1;
  }

  getClientRects() {
    return this.visible ? [{}] : [];
  }
}

let messageListener = null;
const sentMessages = [];

const keyInput = new MockElement({
  id: "product_key",
  tagName: "input",
  type: "text",
  name: "product_key",
  value: "AAAAA-BBBBB-CCCCC"
});

const errorDisplay = new MockElement({
  id: "error_display",
  tagName: "span",
  text: "There have been too many recent activation attempts from this account or Internet address. Please wait and try your product code again later."
});

const registerForm = {
  querySelector(selector) {
    switch (selector) {
      case "#product_key":
      case 'input[name="product_key"]':
      case 'input[name*="key" i]':
        return keyInput;
      case "#accept_ssa":
      case 'input[type="checkbox"]':
        return new MockElement({ id: "accept_ssa", tagName: "input", type: "checkbox" });
      default:
        return null;
    }
  },
  querySelectorAll() {
    return [];
  }
};

const documentStub = {
  readyState: "loading",
  body: {
    innerText: errorDisplay.innerText
  },
  querySelector(selector) {
    switch (selector) {
      case "form[action*=\"registerkey\"]":
      case "#registerkey_form":
        return registerForm;
      case "#product_key":
      case 'input[name="product_key"]':
      case 'input[name*="key" i]':
        return keyInput;
      case "#error_display":
        return errorDisplay;
      case "#receipt_form":
        return null;
      case "#accept_ssa":
      case 'input[type="checkbox"]':
        return registerForm.querySelector(selector);
      default:
        return null;
    }
  },
  querySelectorAll() {
    return [];
  },
  createElement(tagName) {
    return new MockElement({ tagName });
  },
  addEventListener() {}
};

documentStub.head = {
  appendChild(node) {
    if (typeof node.onload === "function") {
      node.onload();
    }
    return node;
  }
};

documentStub.documentElement = documentStub.head;

const chromeStub = {
  storage: {
    sync: {
      get(keys, cb) {
        cb({
          enableAuto: true,
          enableContinue: true,
          enableDismiss: true
        });
      }
    }
  },
  runtime: {
    lastError: null,
    onMessage: {
      addListener(cb) {
        messageListener = cb;
      }
    },
    getURL(pathname) {
      return `chrome-extension://test/${pathname}`;
    },
    sendMessage(message, cb) {
      sentMessages.push(message);
      cb && cb({ ok: true });
    }
  }
};

const sandbox = {
  console,
  document: documentStub,
  window: {
    location: {
      search: "?key=AAAAA-BBBBB-CCCCC",
      hash: "",
      href: "https://store.steampowered.com/account/registerkey?key=AAAAA-BBBBB-CCCCC",
      origin: "https://store.steampowered.com"
    },
    addEventListener() {},
    postMessage() {},
    getComputedStyle() {
      return { display: "none", visibility: "hidden" };
    }
  },
  chrome: chromeStub,
  navigator: {
    clipboard: {
      readText: async () => "AAAAA-BBBBB-CCCCC"
    }
  },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  Event: class {
    constructor(type, options = {}) {
      this.type = type;
      this.bubbles = !!options.bubbles;
    }
  },
  setTimeout(fn) {
    fn();
    return 1;
  },
  clearTimeout() {},
  setInterval(fn) {
    fn();
    return 1;
  },
  clearInterval() {},
  URLSearchParams,
  Array,
  Map,
  JSON,
  Promise,
  Date,
  String,
  Number,
  Boolean,
  Object,
  RegExp,
  Math,
  isNaN
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "Steam/content.js" });

assert.ok(typeof messageListener === "function", "runtime message listener should be registered");
assert.ok(sandbox.window.__humbleAcceptSteam, "debug hook should be exposed");

await sandbox.window.__humbleAcceptSteam.performAutomation();

assert.ok(
  sentMessages.some((message) => message && message.type === "rateLimitedKey"),
  "rate limit message should be reported"
);
assert.equal(
  sentMessages.some((message) => message && message.type === "duplicateKey"),
  false,
  "rate limit should not be misclassified as duplicate"
);

console.log("Steam rate-limit smoke test passed");
