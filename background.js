chrome.runtime.onInstalled.addListener(function() {
    chrome.storage.sync.set({enable: true}, function() {
      console.log("Enable functionality is on");
    });
  });

  chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
    chrome.declarativeContent.onPageChanged.addRules([{
      conditions: [new chrome.declarativeContent.PageStateMatcher({pageUrl: {hostEquals: 'https://store.steampowered.com/account/registerkey'},})],
      actions: [new chrome.declarativeContent.ShowPageAction()]
    }]);
  });

