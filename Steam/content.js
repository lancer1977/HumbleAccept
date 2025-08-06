var log = function(msg){ console.log(msg); }  

var addListeners=function(tab){
 console.log(tab);
    checkBox();
    hitButton();
    setTimeout(() => {  
        console.log("Waiting...!");
        if(completed() === false) return; 
        chrome.runtime.sendMessage({closeRequest: "close"}, function(response) {
            console.log('closerequest:' + response);
          });
  
 }, 1000);
 
} 
var completed = function(){
    var error = $("#error_display").html(); 
    var done = $("#receipt_form").html();
    var doneStyle = $("#receipt_form").css("display");
    log(doneStyle);
    var doneHidden = doneStyle ==  "none" ;
    log("done val:" + done);
    log("error val:" + error);
    log("done hidden:" + doneHidden);
    return doneHidden == false; 
  
    
}
var checkBox = function(){
    var ssaInput = $("#accept_ssa");//.checked=true;
    ssaInput.prop('checked', true);
}
var hitButton = function(){ 
    $('#register_btn')[0].click(); 
}


 
var removeListeners = function(){
    log("removeListener");
} 



//message listener for background
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse)    
{
    log("Command:" + request.command);
    if(request.command === 'init'){
        console.log("init");
        chrome.runtime.tabs.getCurrent((tab)=>addListeners(tab));
    }else{
        removeListeners();
    }
    sendResponse({result: "success"});
});

//on init perform based on chrome stroage value

window.onload=function(){  
    log("load");
    chrome.storage.sync.get('enableAuto', function(data) {
        log(data);
        log(data.enableAuto);
        if('enableAuto' + data.enableAuto)
        {
            addListeners();
        }
        else
        {
            removeListeners();
        } 
    });
}

