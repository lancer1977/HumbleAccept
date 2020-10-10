

var log = function(response){console.log(response.result)};
var enableAuto = document.getElementById('enableAuto');
var enableContinue = document.getElementById('enableContinue');
var enableDismiss = document.getElementById('enableDismiss');

//on init update the UI checkbox based on storage
chrome.storage.sync.get('enableAuto', function(data) {
  enableAuto.checked=data.enableAuto;
});

chrome.storage.sync.get('enableContinue', function(data) {
  enableContinue.checked=data.enableContinue;
});

chrome.storage.sync.get('enableDismiss', function(data) {
  enableDismiss.checked=data.enableDismiss;
});

enableAuto.onchange = function(element) {
  let value = this.checked;

  //update the extension storage value
  chrome.storage.sync.set({'enabled': value}, function() {
    console.log('The value is'+ value);
  });

  log("EnableAuto:" + value);
  //Pass init or remove message to content script 
  if(value){
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {command: "init", enabled: value},log);
    });
  }else{
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {command: "remove", enabled: value},log);
    });
  }

};
