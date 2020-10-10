var log = function(msg){ console.log(msg); }  

var addListeners=function(tab){
 console.log(tab);
    checkBox();
    hitButton();
    setTimeout(() => {  
        console.log("Waiting...!");
        if(completed() === false) return;
        chrome.tabs.getCurrent(function (tab){ closeTab(tab)}); 
 }, 1000);
 
} 
var completed = function(){
    var error = $("#error_display").html(); 
    var done = $("#receipt_form").html();
    log("done val:" + done);
    log("error val:" + error);
    return (error === '...') ;
    //done.val() === "..." //not done
  
    
}
var checkBox = function(){
    var ssaInput = $("#accept_ssa");//.checked=true;
    ssaInput.prop('checked', true);
}
var hitButton = function(){ 
    $('#register_btn')[0].click(); 
}

var closeTab = function(tab)
{
    console.log("close tab start");
    chrome.runtime.tabs.remove(tab.id);
    console.log("done in close tab");
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
        if(data.enableAuto)
        {
            addListeners();
        }
        else
        {
            removeListeners();
        } 
    });
}

