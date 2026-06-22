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
    this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
    return child;
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

const timers = [];
let nextTimerId = 1;
const intervals = [];
let loadListener = null;
let messageListener = null;
const bridgeMessages = [];

const keyInput = new MockElement({
  id: "product_key",
  tagName: "input",
  type: "text",
  name: "product_key",
  value: "AAAAA-BBBBB-CCCCC"
});

const acceptCheckbox = new MockElement({
  id: "accept_ssa",
  tagName: "input",
  type: "checkbox"
});

const registerButton = new MockElement({
  id: "register_btn",
  tagName: "button",
  type: "submit",
  text: "Submit"
});

const continueButton = new MockElement({
  id: "continue_btn",
  tagName: "button",
  type: "button",
  text: "Continue"
});

const javascriptAnchor = new MockElement({
  id: "javascript_anchor",
  tagName: "a",
  text: "Continue"
});
javascriptAnchor.getAttribute = (name) => (name === "href" ? "javascript:void(0)" : "");

const registerForm = {
  querySelector(selector) {
    switch (selector) {
      case "#product_key":
      case 'input[name="product_key"]':
      case 'input[name*="key" i]':
        return keyInput;
      case "#accept_ssa":
      case 'input[type="checkbox"]':
        return acceptCheckbox;
      case "#register_btn":
        return registerButton;
      case 'input[type="submit"]':
      case "button[type=\"submit\"]":
        return registerButton;
      default:
        return null;
    }
  },
  querySelectorAll(selector) {
    return documentStub.querySelectorAll(selector);
  }
};

const documentStub = {
  readyState: "loading",
  body: {
    innerText: "Steam register page"
  },
  querySelector(selector) {
    switch (selector) {
      case "form[action*=\"registerkey\"]":
      case "#registerkey_form":
      case "form":
        return registerForm;
      case "#product_key":
      case 'input[name="product_key"]':
      case 'input[name*="key" i]':
        return keyInput;
      case "#accept_ssa":
      case 'input[type="checkbox"]':
        return acceptCheckbox;
      case "#register_btn":
        return registerButton;
      case "#receipt_form":
        return null;
      case "#error_display":
        return null;
      default:
        return null;
    }
  },
  querySelectorAll(selector) {
    if (selector === 'button, input[type="button"], input[type="submit"], [role="button"]') {
      return [javascriptAnchor, registerButton, continueButton];
    }
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

const windowStub = {
  location: {
    search: "?key=AAAAA-BBBBB-CCCCC",
    hash: "",
    href: "https://store.steampowered.com/account/registerkey?key=AAAAA-BBBBB-CCCCC"
  },
  addEventListener(type, cb) {
    if (type === "load") {
      loadListener = cb;
    }
  },
  postMessage(message) {
    bridgeMessages.push(message);
  },
  getComputedStyle() {
    return { display: "block", visibility: "visible" };
  }
};

const chromeStub = {
  storage: {
    sync: {
      get(keys, cb) {
        const value = {
          enableAuto: true,
          enableContinue: true,
          enableDismiss: true
        };

        cb(value);
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
      if (message && message.closeRequest === "close") {
        cb && cb({ farewell: "goodbye" });
        return;
      }

      cb && cb({ ok: true });
    }
  }
};

const sandbox = {
  console,
  document: documentStub,
  window: windowStub,
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
    timers.push(fn);
    return nextTimerId++;
  },
  clearTimeout() {},
  setInterval(fn) {
    intervals.push(fn);
    return intervals.length;
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

assert.ok(typeof loadListener === "function", "load listener should be registered");
assert.ok(typeof messageListener === "function", "runtime message listener should be registered");

assert.ok(
  sandbox.window.__humbleAcceptSteam,
  "Steam debug hook should be exposed for smoke testing"
);

await sandbox.window.__humbleAcceptSteam.performAutomation();

assert.equal(acceptCheckbox.checked, true, "agreement checkbox should be ticked");
assert.ok(
  acceptCheckbox.eventCounts.get("change") >= 1,
  "agreement checkbox should dispatch a change event"
);
assert.equal(continueButton.clickCount, 0, "continue anchor/button click should be avoided");
assert.equal(registerButton.clickCount, 0, "register button should not be needed when the bridge is used");
assert.equal(javascriptAnchor.clickCount, 0, "javascript href anchors should be skipped");
assert.ok(
  bridgeMessages.some((message) => message?.type === "HUMBLE_ACCEPT_STEAM_REGISTER"),
  "bridge should receive a register-product-key message"
);

console.log("Steam content smoke test passed");
