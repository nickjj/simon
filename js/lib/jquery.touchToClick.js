(function(e){if(!("ontouchstart"in window)){return}var t={isLocked:false,delayedUnlock:null,onClick:function(e){if(this.isLocked){e.stopPropagation();e.preventDefault()}},lock:function(){this.isLocked=true;var e=this;this.delayedUnlock=setTimeout(function(){e.unlock()},2e3)},unlock:function(){this.isLocked=false;if(this.delayedUnlock){window.clearTimeout(this.delayedUnlock)}}};document.addEventListener("click",function(e){t.onClick(e)},true);e.event.special.click={delegateType:"click",bindType:"click",setup:function(n,r,i){var s=this;var o={handleEvent:function(e){switch(e.type){case"touchstart":this.onTouchStart(e);break;case"touchmove":this.onTouchMove(e);break;case"touchend":this.onTouchEnd(e);break}},onTouchStart:function(e){e.stopPropagation();this.moved=false;s.addEventListener("touchmove",this,false);s.addEventListener("touchend",this,false)},onTouchMove:function(e){this.moved=true},onTouchEnd:function(e){s.removeEventListener("touchmove",this,false);s.removeEventListener("touchend",this,false);if(!this.moved){t.unlock();var n=document.createEvent("MouseEvents");n.initEvent("click",true,true);e.target.dispatchEvent(n);t.lock();e.stopPropagation()}}};s.addEventListener("touchstart",o,false);e(s).data("touchToClick-handler",o);return false},teardown:function(t){var n=this;var r=e(n).data("touchToClick-handler");n.removeEventListener("touchstart",r,false);return false}}})(jQuery)