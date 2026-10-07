/* A deterministic film timeline over the real demo. No product rules are replaced. */
(() => {
'use strict';
const $=id=>document.getElementById(id), D=window.XelorDemoDirector, total=window.XELOR_TIMELINE.duration;
const {chapters,shots}=window.XELOR_TIMELINE;
const M=window.XelorMotion.install(document);
const overview=window.XelorOverview.install(document);
const detail=target=>window.XelorPhoneDetail.update(w(),$('phone-detail'),target);
const captions=JSON.parse($('caption-data').textContent), audio=$('narration'), music=$('music');
const state={ready:false,playing:false,time:0,chapter:-1,shot:-1,action:0,epoch:0,busy:false,queued:null,errors:[],cursor:{x:410,y:540},motion:null,caption:-1,started:false,export:false,musicOn:true,lastMusicSync:0,result:null};
const w=()=>$('demo').contentWindow;
const format=t=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
function scale(){const r=$('screen').getBoundingClientRect();const s=Math.min(r.width/1600,r.height/900);$('stage').style.transform=document.fullscreenElement?`translate(-50%,-50%) scale(${s})`:`scale(${s})`;}
new ResizeObserver(scale).observe($('screen'));document.addEventListener('fullscreenchange',scale);
function flow(index){$('flow').innerHTML=index==null?'<span class="flow-order" style="margin-left:0">A connected view across the factory and its supplier network.</span>':['Order','Buy','Receive','Make','Ship'].map((x,i)=>`${i?'<span class="flow-arrow">→</span>':''}<span class="flow-step ${i<index?'done':i===index?'current':''}" data-number="${i+1}">${x}</span>`).join('')+'<span class="flow-order">ORDER · 80 pumps · 60 castings needed</span>';}
function setChapter(i){state.chapter=i;const c=chapters[i];$('scene-count').textContent=`${String(i+1).padStart(2,'0')} / ${chapters.length}`;$('eyebrow').textContent=c.label;$('headline').textContent=c.title;
 $('intro-one').style.display=i===0?'block':'none';$('intro-two').style.display=i===1?'block':'none';$('closing').style.display=i===chapters.length-1?'flex':'none';
 const demo=!c.diagram&&i>1&&i<chapters.length-1;$('stage').classList.toggle('product-capture',demo);$('demo-shell').style.visibility=demo?'visible':'hidden';$('aside').style.visibility=demo?'visible':'hidden';$('flow').style.visibility=demo?'visible':'hidden';
 if(!demo){state.motion=null;state.pendingFocus=null;state.result=null;M.focus(null);$('cursor').style.display='none';$('focus').style.display='none';}
 M.scene({chapter:i,shot:-1,start:c.t,end:c.end,chapterStart:c.t,core:!!c.core,flow:null,title:c.title},state.time);
}
function showSide(s){const c=chapters[state.chapter];$('role').textContent=s.role||c.role||'';$('callout-title').textContent=s.call||c.call||'';$('callout-body').textContent=s.body||c.body||'';$('features').innerHTML=(s.features||c.features||[]).map(f=>`<div class="feature">${f}</div>`).join('');$('shot-note').textContent=s.note||c.note||'';flow(s.core?s.flow:null);if(!s.core&&(s.note||c.note))$('flow').innerHTML='<span class="flow-order" style="margin-left:0">'+(s.note||c.note)+'</span>';}
function pos(rect){const box=$('demo-shell');rect={...rect,y:rect.y+46,cy:rect.cy+46};return {x:box.offsetLeft+rect.x,y:box.offsetTop+rect.y,width:rect.width,height:rect.height,cx:box.offsetLeft+rect.cx,cy:box.offsetTop+rect.cy};}
function focus(rect,start=state.time,duration=2.2,label=''){if(!rect){state.pendingFocus=null;M.focus(null);return;}const b=pos(rect);const top=Math.max(238,b.y),bottom=Math.min(752,b.y+b.height);if(bottom<=top){state.pendingFocus=null;M.focus(null);return;}const r={x:b.x,y:top,width:b.width,height:bottom-top};const cue={rect:r,options:{start,duration,label,kind:r.width>450||r.height>150?'underline':'circle'}};if(start>state.time){state.pendingFocus=cue;}else{state.pendingFocus=null;M.focus(cue.rect,cue.options);}}
async function markTarget(target,start,duration,label){if(!target)return;const r=await D.bounds(w(),target,{scroll:true});if(r)focus(r,start,duration,label);}
function cursor(x,y,press=false){state.cursor={x,y};$('cursor').style.display='block';$('cursor').style.left=x+'px';$('cursor').style.top=y+'px';$('cursor').style.transform='none';}
function ripple(t){const d=t-state.clickAt;if(d>=0&&d<.26){const p=d/.26;Object.assign($('ripple').style,{opacity:String((1-p)*.45),left:(state.cursor.x-8)+'px',top:(state.cursor.y-8)+'px',transform:`scale(${.5+p*.7})`});}else $('ripple').style.opacity='0';}
function pointerAt(t){const m=state.motion;if(!m)return;const raw=Math.max(0,Math.min(1,(t-m.begin)/(m.end-m.begin)));const p=raw<.76?(.89*Math.sin((raw/.76)*Math.PI/2)): .89+.11*((raw-.76)/.24);const v=1-p;
 const x=v*v*v*m.from.x+3*v*v*p*m.c1.x+3*v*p*p*m.c2.x+p*p*p*m.to.x;
 const y=v*v*v*m.from.y+3*v*v*p*m.c1.y+3*v*p*p*m.c2.y+p*p*p*m.to.y;
 cursor(x,y,raw>.94&&raw<1);
}
async function targetMotion(s,act,t,epoch){let r=await D.bounds(w(),act.target,{scroll:true});if(epoch!==state.epoch||!r)return;if(r.disabled&&act.type==='click')return;const b=pos(r);const from={...state.cursor},to={x:b.cx-1.8,y:b.cy-1.7};const seed=(s.index*19+state.action*11)%7;const duration=Math.min(.92,Math.max(.24,Math.hypot(to.x-from.x,to.y-from.y)/(970+seed*55)));
 const early=act.type==='type'?.59:.22;
 focus(r,s.t+act.at-.8,1.65,s.holdLabel);
 state.motion={begin:Math.max(s.t, s.t+act.at-duration-early-.04),end:s.t+act.at-early,from,to,c1:{x:from.x+(to.x-from.x)*.36,y:from.y+(to.y-from.y)*.22+11-seed*3},c2:{x:to.x+(seed-3)*1.3,y:to.y+(seed%2?5:-4)},action:state.action};detail(act.target);pointerAt(t);
}
async function doAction(act,s){if(act.type==='click')await D.click(w(),act.target,{scroll:false});else D.input(w(),act.target,act.value);D.present(w());$('browser-url').textContent=D.localUrl(w());detail(act.target);if(act.after&&s){const at=s.t+act.at;state.result={text:act.after.label,start:at};await markTarget(act.after.target,at+.15,Math.max(.8,s.end-at-.2),act.after.label);}}
async function loadShot(i,t,seeking){const s=shots[i],prev=shots[state.shot];state.shot=i;state.action=0;state.motion=null;state.result=null;state.pendingFocus=null;M.focus(null);$('cursor').style.display='none';
 // Contiguous playback carries the real order state across roles. Seeking
 // rebuilds the same checkpoint using the product's own guided-demo state.
 if(!seeking&&prev?.core&&s.core&&i===prev.index+1)await D.navigate(w(),s.screen);
 else await D.prepareDemo(w(),{step:s.step,screen:s.screen,surface:'device',desktopHeight:518,padding:0,maxScale:1});
 D.present(w());$('browser-url').textContent=D.localUrl(w());showSide(s);const c=chapters[state.chapter];M.scene({chapter:state.chapter,shot:i,start:s.t,end:s.end,chapterStart:c.t,core:!!s.core,flow:s.flow,title:c.title},t);
 if(s.core){if(!prev?.core||seeking)state.cursor={x:430,y:580};cursor(state.cursor.x,state.cursor.y);}if(s.highlight)await markTarget(s.highlight,s.t+.8,Math.min(3.2,s.end-s.t-1),s.holdLabel);
 if(seeking){while(state.action<s.actions.length&&s.t+s.actions[state.action].at<=t){await doAction(s.actions[state.action],s);state.action++;} }
 detail(s.actions[state.action]?.target||s.highlight);return s;
}
async function renderTime(t,force=false){if(state.busy){state.queued={t,force:force||state.queued?.force};return}state.busy=true;
 try{t=Math.max(0,Math.min(total,t));const ci=chapters.findIndex(c=>t>=c.t&&t<c.end);const index=ci<0?chapters.length-1:ci;if(index!==state.chapter)setChapter(index);
 const si=t<shots[0].t||t>=window.XELOR_TIMELINE.closingStart?-1:shots.findIndex(s=>t>=s.t&&t<s.end);
 if(si>=0){const s=si!==state.shot||force?await loadShot(si,t,force):shots[si];
  if(!force){while(state.action<s.actions.length&&s.t+s.actions[state.action].at<=t){const act=s.actions[state.action];if(!state.motion||state.motion.action!==state.action){const r=await D.bounds(w(),act.target,{scroll:true});if(r){const p=pos(r);cursor(p.cx-1.8,p.cy-1.7);focus(r);}}
    await doAction(act,s);state.clickAt=s.t+act.at;state.action++;state.motion=null;
  }}
  const act=s.actions[state.action];if(act&&t>=s.t+act.at-1.6&&(!state.motion||state.motion.action!==state.action))await targetMotion(s,act,t,state.epoch);
  if(act?.type==='type'&&state.motion&&t>=s.t+act.at-.43){const offsets=[0,.085,.225,.335];const elapsed=t-(s.t+act.at-.43);const length=Math.min(act.value.length,offsets.filter(n=>elapsed>=n).length);const text=act.value.slice(0,length);if(w().document.querySelector(D.actions[act.target]||act.target)?.value!==text){D.input(w(),act.target,text);detail(act.target);}}
  $('time-jump').style.display=s.timeJump&&t-s.t<2?'block':'none';$('time-jump').textContent=s.timeJump||'';
 }else{state.shot=-1;$('time-jump').style.display='none';}
 }catch(err){state.errors.push(String(err));console.error(err);}finally{state.busy=false;if(state.queued){const next=state.queued;state.queued=null;await renderTime(next.t,next.force);}}
}
let lastPaintTime=-1;
function paint(t){lastPaintTime=t;$('seek').value=t;$('time').textContent=`${format(t)} / ${format(total)}`;$('progressline').style.width=(t/total*1600)+'px';const i=captions.findIndex(c=>t>=c.start&&t<=c.end);if(i!==state.caption){state.caption=i;$('subtitle').textContent=i<0?'':captions[i].text;}
 document.querySelectorAll('.fragment').forEach((e,i)=>{const p=Math.max(0,Math.min(1,(t-i*2.8-.2)/.55)),q=1-Math.pow(1-p,3);e.style.transition='none';e.style.opacity=q;e.style.transform=`translateY(${20*(1-q)}px) rotate(var(--tilt))`;});
 document.querySelectorAll('.risk').forEach((e,i)=>{const p=Math.max(0,Math.min(1,(t-10.3-i*2.5)/.45)),q=1-Math.pow(1-p,3);e.style.transition='none';e.style.opacity=q;e.style.transform=`translateY(${24*(1-q)}px)`;});
 const shot=shots[state.shot];if(shot){const u=Math.max(0,Math.min(1,(t-shot.t)/.42)),ease=1-Math.pow(1-u,3);$('demo-shell').style.opacity=ease;$('demo-shell').style.transform=`translate3d(${8*(1-ease)}px,0,0)`;}
 pointerAt(t);ripple(t);if(state.pendingFocus&&t>=state.pendingFocus.options.start){M.focus(state.pendingFocus.rect,state.pendingFocus.options);state.pendingFocus=null;}M.paint(t);overview.paint(t);
 const result=state.result&&t>=state.result.start?state.result:null;$('result-badge').hidden=!result;if(result){$('result-badge').textContent='✓ '+result.text;$('result-badge').style.opacity=Math.min(1,(t-result.start)/.25);}
}
function tick(){if(state.playing){state.time=Math.min(total,audio.currentTime);if(state.time-state.lastMusicSync>2){if(Math.abs(music.currentTime-audio.currentTime)>.14)music.currentTime=audio.currentTime;state.lastMusicSync=state.time;}if(state.time>=total-.035){state.time=total;pause();}renderTime(state.time);}if(state.time!==lastPaintTime)paint(state.time);requestAnimationFrame(tick);}
async function play(){if(!state.ready)return;if(state.time>=total-.1)await seek(0);$('start-overlay').style.display='none';state.started=true;state.playing=true;$('toggle').textContent='Pause';$('toggle').setAttribute('aria-label','Pause film');try{music.currentTime=audio.currentTime;await Promise.all([audio.play(),music.play()]);}catch(e){pause();state.errors.push('Audio playback: '+e.message);}}
function pause(){state.playing=false;audio.pause();music.pause();$('toggle').textContent='Play';$('toggle').setAttribute('aria-label','Play film');}
async function settle(){while(state.busy)await new Promise(r=>setTimeout(r,10));}
async function seek(t){if(!state.ready)return;const resume=state.playing;pause();await settle();state.epoch++;state.motion=null;state.clickAt=-1;state.time=Math.max(0,Math.min(total,Number(t)));audio.currentTime=state.time;music.currentTime=state.time;state.lastMusicSync=state.time;state.shot=-1;await renderTime(state.time,true);paint(state.time);if(resume)await play();}
async function toggle(){if(state.playing)pause();else await play();}
function fromBase64(s,type){const b=atob(s.trim()),bytes=new Uint8Array(b.length);for(let i=0;i<b.length;i++)bytes[i]=b.charCodeAt(i);return new Blob([bytes],{type});}
$('toggle').onclick=toggle;$('start').onclick=play;$('restart').onclick=async()=>{await seek(0);await play();};
let seekResume=false;$('seek').addEventListener('pointerdown',()=>{seekResume=state.playing;pause()});$('seek').addEventListener('input',()=>{state.time=Number($('seek').value);paint(state.time)});$('seek').addEventListener('change',async()=>{await seek(Number($('seek').value));if(seekResume)await play();seekResume=false;});
$('cc').onclick=()=>{const off=$('stage').classList.toggle('subtitles-off');$('cc').setAttribute('aria-pressed',String(!off));};$('mute').onclick=()=>{audio.muted=!audio.muted;music.muted=audio.muted||!state.musicOn;$('mute').textContent=audio.muted?'Muted':'Sound';$('mute').setAttribute('aria-label',audio.muted?'Unmute audio':'Mute audio');};$('volume').oninput=()=>{audio.volume=Number($('volume').value);music.volume=audio.volume;};
$('music-toggle').onclick=()=>{state.musicOn=!state.musicOn;music.muted=!state.musicOn||audio.muted;$('music-toggle').setAttribute('aria-pressed',String(state.musicOn));$('music-toggle').textContent=state.musicOn?'Music':'Music off';};
$('fullscreen').onclick=async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await $('screen').requestFullscreen();};
$('chapter-toggle').onclick=()=>$('chapters').classList.toggle('open');$('chapters').innerHTML=chapters.map((c,i)=>`<button data-chapter="${i}">${format(c.t)} · ${i===0?'The problem':i===1?'The impact':c.label.replace(/^\d+ \/ /,'')}</button>`).join('');$('chapters').onclick=async e=>{const b=e.target.closest('button');if(!b)return;$('start-overlay').style.display='none';await seek(chapters[+b.dataset.chapter].t);await play();};
function playerKeys(e,fromDemo=false){if(!fromDemo&&/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(!['Space','ArrowRight','ArrowLeft'].includes(e.code))return;e.preventDefault();if(fromDemo)e.stopImmediatePropagation();if(e.code==='Space')toggle();if(e.code==='ArrowRight')seek(state.time+5);if(e.code==='ArrowLeft')seek(state.time-5);}
document.addEventListener('keydown',playerKeys);
audio.addEventListener('ended',()=>{state.time=total;pause();renderTime(total);paint(total)});
window.XELOR_FILM={play,pause,seek,ready:()=>state.ready,get time(){return state.time},get duration(){return total},get playing(){return state.playing},get errors(){return [...state.errors]},get snapshot(){return state.ready?D.snapshot(w(),false):null},chapters,shots,coverage:JSON.parse($('coverage-data').textContent),async checkpoint(t){await seek(t);return {time:state.time,chapter:state.chapter,shot:state.shot,action:state.action,product:D.snapshot(w(),false),errors:[...state.errors]}},async renderFrame(t){if(!state.ready)throw new Error('Film is not ready');pause();await settle();if(t<state.time){await seek(t);}else{state.time=Math.min(total,Math.max(0,t));await renderTime(state.time);paint(state.time);}return {time:state.time,errors:[...state.errors]};},exportMode(){document.body.classList.add('export');$('start-overlay').style.display='none';state.export=true;scale();}};
async function init(){audio.src=URL.createObjectURL(fromBase64($('audio-data').textContent,'audio/mpeg'));music.src=URL.createObjectURL(fromBase64($('music-data').textContent,'audio/mpeg'));const product=await fromBase64($('product-data').textContent,'text/html;charset=utf-8').text();
 await new Promise(resolve=>{$('demo').onload=resolve;$('demo').srcdoc=product;});await w().document.fonts.ready;await D.prepareDemo(w(),{step:0,screen:'p.sales',surface:'device',desktopHeight:518,padding:0,maxScale:1});
 const cinema=w().document.createElement('style');cinema.textContent='html[data-xelor-film] #frame.phone{left:71%!important}';w().document.head.appendChild(cinema);
 w().document.addEventListener('keydown',e=>playerKeys(e,true),true);
 await new Promise((resolve,reject)=>{if(audio.readyState>=1)return resolve();audio.addEventListener('loadedmetadata',resolve,{once:true});audio.addEventListener('error',()=>reject(new Error('Narration failed to load')),{once:true});});
 await new Promise((resolve,reject)=>{if(music.readyState>=1)return resolve();music.addEventListener('loadedmetadata',resolve,{once:true});music.addEventListener('error',()=>reject(new Error('Music failed to load')),{once:true});});
 state.ready=true;setChapter(0);paint(0);$('start').disabled=false;$('start').textContent='▶  Watch the film';if(new URLSearchParams(location.search).has('export'))window.XELOR_FILM.exportMode();requestAnimationFrame(tick);
}
init().catch(err=>{state.errors.push(String(err));$('start').textContent='Unable to load — please reopen the file';console.error(err)});
})();
