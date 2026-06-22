(function () {
  if (window.__humbleAcceptSteamBridgeInstalled) {
    return;
  }

  window.__humbleAcceptSteamBridgeInstalled = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.type !== "HUMBLE_ACCEPT_STEAM_REGISTER") {
      return;
    }

    if (typeof window.RegisterProductKey === "function") {
      window.RegisterProductKey();
    }
  });
})();
