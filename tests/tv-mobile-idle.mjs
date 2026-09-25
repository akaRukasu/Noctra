import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const shell=fs.readFileSync(new URL('../public/noctra-shell.js',import.meta.url),'utf8');
const code=shell.slice(shell.indexOf('  function scheduleTvDesktopControlsHide('),shell.indexOf('  function syncTvFullscreenUi('));
let timer=null,hidden=false;
const video={paused:false,hidden:false,ended:false};
const screen={isConnected:true,setAttribute(){hidden=true;},hasAttribute(){return hidden;},removeAttribute(){hidden=false;}};
const context={tvDesktopControlsHideTimer:0,tvState:{currentPlaybackType:'stream'},tvSafeExtras:{menuOpen:false},
 window:{clearTimeout(){timer=null;},setTimeout(fn){timer=fn;return 1;}},
 document:{activeElement:null,querySelector:s=>s==='#noctra-tv-video'?video:s==='.noctra-tv-screen'?screen:null}};
vm.createContext(context);vm.runInContext(code,context);
context.scheduleTvDesktopControlsHide(); assert.ok(timer); timer(); assert.equal(hidden,true,'Touch playback hides overlays without desktop controls');
context.showTvDesktopLiveControls(); assert.equal(hidden,false); assert.ok(timer,'Touch reveals and rearms idle delay');
context.tvSafeExtras.menuOpen=true; timer(); assert.equal(hidden,false,'Open settings stay visible');
context.tvSafeExtras.menuOpen=false;video.paused=true;context.scheduleTvDesktopControlsHide();assert.equal(timer,null,'Paused video keeps controls');
video.paused=false;context.tvState.currentPlaybackType='embed';context.scheduleTvDesktopControlsHide();assert.equal(timer,null,'Embedded player remains untouched');
console.log('TV mobile idle: auto-hide, touch reveal, settings, pause and embedded-player isolation passed');
