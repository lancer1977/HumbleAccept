 

var addListeners=function(){
 
    var ssaInput = $("#accept_ssa");//.checked=true;
    ssaInput.prop('checked', true);
    hitButton();
} 

var hitButton = function(){ 
    $('#register_btn')[0].click(); 
}

var removeListeners=function(){  
}

//message listener for background
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse)    {
    if(request.command === 'init'){
        addListeners();
    }else{
        removeListeners();
    }
    sendResponse({result: "success"});
});

//on init perform based on chrome stroage value
window.onload=function(){  
 
    chrome.storage.sync.get('hide', function(data) {
        if(data.hide){
            addListeners();
        }else{
            removeListeners();
        } 
    });
}

