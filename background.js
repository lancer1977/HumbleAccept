/* 
chrome.runtime.onInstalled.addListener(function() {
    chrome.storage.sync.set({enable: true}, function() {
      console.log("Enable functionality is on");
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        console.log("Sending MEsage");
        chrome.tabs.sendMessage(tabs[0].id, {command: "init", enabledAuto: true});
      });
    });
  });

  chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
    console.log("Enable functionality is off");
    chrome.declarativeContent.onPageChanged.addRules([{
      conditions: [new chrome.declarativeContent.PageStateMatcher({pageUrl: {hostEquals: 'https://store.steampowered.com/account/registerkey'},})],
      actions: [new chrome.declarativeContent.ShowPageAction()]
    }]);
  });
  */
  chrome.runtime.onInstalled.addListener(function() {
    chrome.storage.sync.set({enable: true}, function() {
      console.log('The color is green.');
      console.log("Enable functionality is on");
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        console.log("Sending MEsage");
        chrome.tabs.sendMessage(tabs[0].id, {command: "init", enabledAuto: true});
      });
    });
    chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
      chrome.declarativeContent.onPageChanged.addRules([{
        conditions: [new chrome.declarativeContent.PageStateMatcher({
          pageUrl: {hostEquals: 'store.steampowered.com/account/registerkey'},
        })
        ],
            actions: [new chrome.declarativeContent.ShowPageAction()]
      }]);
    });
  });