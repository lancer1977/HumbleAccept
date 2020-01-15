 

var addListeners=function(tab){
 console.log(tab);
    checkBox();
    hitButton();
    closeTab(tab);
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
 
var removeListeners=function(){  
    console.writeline("removing listeners");
}

//message listener for background
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse)    {
    if(request.command === 'init'){
        chrome.runtime.tabs.getCurrent((tab)=>addListeners(tab));
    }else{
        removeListeners();
    }
    sendResponse({result: "success"});
});

//on init perform based on chrome stroage value
window.onload=function(){  
 
    chrome.storage.sync.get('enable', function(data) {
        if(data.enable){
            addListeners();
        }else{
            removeListeners();
        } 
    });
}

