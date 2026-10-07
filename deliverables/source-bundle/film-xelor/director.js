/* A deterministic film timeline over the real demo. No product rules are replaced.
 * Story scenes (problem, network, products, pricing, close) are painted by
 * story.js. Product shots drive the real app with a recorded-feeling pointer:
 * Fitts-timed curved moves, small overshoot and settle, hover and reading
 * drift between actions, a press on click, and finger taps on phone screens.
 */
(() => {
'use strict';
const $=id=>document.getElementById(id), D=window.XelorDemoDirector, TL=window.XELOR_TIMELINE, total=TL.duration;
const {chapters,shots}=TL;
const M=window.XelorMotion.install(document);
const overview=window.XelorOverview.install(document);
const story=window.XelorStory.install(document,TL);
const detail=target=>window.XelorPhoneDetail.update(w(),$('phone-detail'),target);
const captions=JSON.parse($('caption-data').textContent), audio=$('narration'), music=$('music');
const state={ready:false,playing:false,time:0,chapter:-1,shot:-1,action:0,armed:-1,epoch:0,busy:false,queued:null,errors:[],cursor:{x:1180,y:640},motion:null,caption:-1,started:false,export:false,musicOn:true,lastMusicSync:0,result:null,phone:false,taps:[],plan:[],clickAt:-9};
const w=()=>$('demo').contentWindow;
const format=t=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
function scale(){const r=$('screen').getBoundingClientRect();const s=Math.min(r.width/1600,r.height/900);$('stage').style.transform=document.fullscreenElement?`translate(-50%,-50%) scale(${s})`:`scale(${s})`;}
new ResizeObserver(scale).observe($('screen'));document.addEventListener('fullscreenchange',scale);
function flow(index){$('flow').innerHTML=index==null?'<span class="flow-order" style="margin-left:0">A connected view across the factory and its supplier network.</span>':['Order','Buy','Receive','Make','Ship'].map((x,i)=>`${i?'<span class="flow-arrow">→</span>':''}<span class="flow-step ${i<index?'done':i===index?'current':''}" data-number="${i+1}">${x}</span>`).join('')+'<span class="flow-order">ORDER · 80 pumps · 60 castings needed</span>';}
const productChapters=chapters.filter(c=>!c.story);
function setChapter(i){state.chapter=i;const c=chapters[i];const pi=productChapters.indexOf(c);
 $('scene-count').textContent=pi<0?'':`${String(pi+1).padStart(2,'0')} / ${productChapters.length}`;$('eyebrow').textContent=c.label||'';$('headline').textContent=c.title||'';
 $('intro-one').style.display='none';$('intro-two').style.display='none';$('closing').style.display='none';
 const demo=!c.story&&!c.diagram;$('stage').classList.toggle('product-capture',demo);$('demo-shell').style.visibility=demo?'visible':'hidden';$('aside').style.visibility=demo?'visible':'hidden';$('flow').style.visibility=demo?'visible':'hidden';
 if(!demo){state.motion=null;state.pendingFocus=null;state.result=null;M.focus(null);$('cursor').style.display='none';$('focus').style.display='none';}
 M.scene({chapter:i,shot:-1,start:c.t,end:c.end,chapterStart:c.t,core:!!c.core,flow:null,title:c.title},state.time);
}
function showSide(s){const c=chapters[state.chapter];$('role').textContent=s.role||c.role||'';$('callout-title').textContent=s.call||c.call||'';$('callout-body').textContent=s.body||c.body||'';$('features').innerHTML=(s.features||c.features||[]).map(f=>`<div class="feature">${f}</div>`).join('');$('shot-note').textContent=s.note||c.note||'';flow(s.core?s.flow:null);if(!s.core&&(s.note||c.note))$('flow').innerHTML='<span class="flow-order" style="margin-left:0">'+(s.note||c.note)+'</span>';}
function pos(rect){const box=$('demo-shell');rect={...rect,y:rect.y+46,cy:rect.cy+46};return {x:box.offsetLeft+rect.x,y:box.offsetTop+rect.y,width:rect.width,height:rect.height,cx:box.offsetLeft+rect.cx,cy:box.offsetTop+rect.cy};}
function focus(rect,start=state.time,duration=2.2,label=''){if(!rect){state.pendingFocus=null;M.focus(null);return;}const b=pos(rect);const top=Math.max(238,b.y),bottom=Math.min(752,b.y+b.height);if(bottom<=top){state.pendingFocus=null;M.focus(null);return;}const r={x:b.x,y:top,width:b.width,height:bottom-top};const cue={rect:r,options:{start,duration,label,kind:r.width>450||r.height>150?'underline':'circle'}};if(start>state.time){state.pendingFocus=cue;}else{state.pendingFocus=null;M.focus(cue.rect,cue.options);}}
async function markTarget(target,start,duration,label){if(!target)return;const r=await D.bounds(w(),target,{scroll:true});if(r)focus(r,start,duration,label);}

/* ---------- pointer ---------- */
function cursor(x,y){state.cursor={x,y};const c=$('cursor');c.style.display=state.phone?'none':'block';c.style.left=(x-2)+'px';c.style.top=(y-2)+'px';}
const minJerk=x=>x*x*x*(10-15*x+6*x*x);
function fittsDuration(from,to,width=36){const d=Math.hypot(to.x-from.x,to.y-from.y);return clamp(.26+.105*Math.log2(1+d/Math.max(18,width)),.3,1.05);}
function makeMotion(from,to,begin,end,seed,action){const dx=to.x-from.x,dy=to.y-from.y,d=Math.hypot(dx,dy)||1;
 // Wrist arcs bend the path to one side; the amount scales with distance.
 const bend=(seed%2?1:-1)*Math.min(70,d*.12),nx=-dy/d,ny=dx/d;
 const over=Math.min(9,d*.035);
 return {begin,end,from:{...from},to:{...to},action,c1:{x:from.x+dx*.3+nx*bend,y:from.y+dy*.3+ny*bend},c2:{x:from.x+dx*.78+nx*bend*.35,y:from.y+dy*.78+ny*bend*.35},ox:dx/d*over,oy:dy/d*over};}
function pointerAt(t){const m=state.motion;if(!m||state.phone)return;const raw=clamp((t-m.begin)/Math.max(.01,m.end-m.begin));
 // Main ballistic move lands slightly past the target, then a short correction settles.
 let p,o;if(raw<.84){p=minJerk(raw/.84);o=p;}else{p=1;o=1-minJerk((raw-.84)/.16);}
 const v=1-p;const x=v*v*v*m.from.x+3*v*v*p*m.c1.x+3*v*p*p*m.c2.x+p*p*p*m.to.x+m.ox*o*(raw<.84?minJerk(raw/.84):1);
 const y=v*v*v*m.from.y+3*v*v*p*m.c1.y+3*v*p*p*m.c2.y+p*p*p*m.to.y+m.oy*o*(raw<.84?minJerk(raw/.84):1);
 cursor(x,y);
}
function paintPointer(t){const c=$('cursor');const d=t-state.clickAt;const press=d>=-.03&&d<.14;c.style.transform=press?'scale(.84)':'none';
 const r=$('ripple');if(!state.phone&&d>=0&&d<.38){const p=d/.38;Object.assign(r.style,{opacity:String((1-p)*.4),left:(state.cursor.x-11)+'px',top:(state.cursor.y-11)+'px',transform:`scale(${.55+p*1.1})`});}else r.style.opacity='0';}
function paintTouch(t){const one=(el,x,y,at)=>{const d=t-at;if(x==null||d<-.2||d>.42){el.style.display='none';return;}el.style.display='block';el.style.left=x+'px';el.style.top=y+'px';
  const dot=el.firstElementChild,ring=el.lastElementChild;
  if(d<0){const p=1-(-d/.2);dot.style.opacity=String(.85*p);dot.style.transform=`scale(${1.25-.25*p})`;ring.style.opacity='0';}
  else if(d<.11){dot.style.opacity='.95';dot.style.transform='scale(.82)';ring.style.opacity='0';}
  else{const p=(d-.11)/.31;dot.style.opacity=String(.9*(1-p));dot.style.transform=`scale(${.82+.1*p})`;ring.style.opacity=String(.75*(1-p));ring.style.transform=`scale(${1+1.1*p})`;}};
 const tap=state.phone?[...state.taps].reverse().find(k=>t>=k.at-.2&&t<=k.at+.42):null;
 one($('touch'),tap?.x,tap?.y,tap?.at??0);one($('touch2'),tap?.inset?.x,tap?.inset?.y,tap?.at??0);}
function insetPoint(){const host=$('phone-detail').firstElementChild;const el=host?.shadowRoot?.querySelector('[xfilm-tap]');if(!el)return null;
 const r=el.getBoundingClientRect(),base=$('stage').getBoundingClientRect(),s=base.width/1600||1;if(!r.width)return null;
 const x=(r.left-base.left+r.width/2)/s,y=(r.top-base.top+r.height/2)/s;return y>120&&y<780?{x,y}:null;}

async function arm(s,act,t,epoch){const r=await D.bounds(w(),act.target,{scroll:true});if(epoch!==state.epoch)return;state.armed=state.action;if(!r)return;if(r.disabled&&act.type==='click')return;const b=pos(r);
 const typing=act.type==='type'||act.type==='input';
 focus(r,s.t+act.at-.8,1.65,s.holdLabel);
 if(state.phone){detail(act.target);const at=s.t+act.at-(typing?.52:0);state.taps.push({at,x:b.cx,y:b.cy,inset:insetPoint()});return;}
 const to={x:b.cx+(typing?-b.width*.32:0)+((s.index*7+state.action*3)%5-2),y:b.cy+((s.index+state.action)%3-1)};
 const dur=fittsDuration(state.cursor,to,Math.min(r.width,r.height));const early=typing?.6:.16;
 const end=s.t+act.at-early,begin=Math.max(t,end-dur);
 state.motion=makeMotion(state.cursor,to,begin,Math.max(begin+.22,end),s.index*19+state.action*11,state.action);detail(act.target);pointerAt(t);
}
function buildPlan(s){const plan=[];if(s.phone)return plan;const first=s.actions[0]?.at??(s.end-s.t);
 if(first>2.2)plan.push({at:s.t+.45,kind:'target',target:s.highlight||'#vp .scr',fx:s.highlight?.34:.44,fy:s.highlight?.55:.36});
 s.actions.forEach((a,i)=>{const next=s.actions[i+1]?.at??(s.end-s.t);if(next-a.at>2.5)plan.push({at:s.t+a.at+.9,kind:'drift',seed:i});});
 if(!s.actions.length&&s.end-s.t>4.5)plan.push({at:s.t+2.9,kind:'drift',seed:3});
 return plan;}
async function idle(s,t,epoch){if(state.phone)return;const m=state.motion;if(m&&t<m.end+.15)return;
 const next=s.actions[state.action];const limit=next?s.t+next.at-1.9:s.end-.6;
 const item=state.plan.find(p=>!p.done&&t>=p.at);if(!item)return;item.done=true;if(t>limit)return;
 let to;if(item.kind==='target'){const r=await D.bounds(w(),item.target,{scroll:false});if(epoch!==state.epoch||!r)return;const b=pos(r);to={x:b.x+b.width*item.fx,y:Math.min(740,b.y+Math.min(b.height,320)*item.fy)};}
 else{const k=(s.index*5+item.seed*3)%7;to={x:state.cursor.x+(k%2?1:-1)*(28+k*9),y:state.cursor.y+22+k*6};}
 to.x=clamp(to.x,80,1520);to.y=clamp(to.y,250,745);
 const dur=fittsDuration(state.cursor,to,80)*1.25;state.motion=makeMotion(state.cursor,to,t,t+dur,s.index*13+(item.seed||0),-1);pointerAt(t);
}
async function doAction(act,s){if(act.type==='click')await D.click(w(),act.target,{scroll:false});else D.input(w(),act.target,act.value);D.present(w());$('browser-url').textContent=D.localUrl(w());detail(act.target);if(act.after&&s){const at=s.t+act.at;state.result={text:act.after.label,start:at};await markTarget(act.after.target,at+.15,Math.max(.8,s.end-at-.2),act.after.label);}}
async function loadShot(i,t,seeking){const s=shots[i],prev=shots[state.shot];state.shot=i;state.action=0;state.armed=-1;state.motion=null;state.result=null;state.pendingFocus=null;state.taps=[];M.focus(null);
 const contiguous=!seeking&&prev?.core&&s.core&&i===prev.index+1&&Math.abs(prev.end-s.t)<.01;
 if(contiguous)await D.navigate(w(),s.screen);
 else await D.prepareDemo(w(),{step:s.step,screen:s.screen,surface:'device',desktopHeight:518,padding:0,maxScale:1});
 D.present(w());$('browser-url').textContent=D.localUrl(w());showSide(s);const c=chapters[state.chapter];M.scene({chapter:state.chapter,shot:i,start:s.t,end:s.end,chapterStart:c.t,core:!!s.core,flow:s.flow,title:c.title},t);
 state.phone=!!w().document.querySelector('#frame.phone');state.plan=buildPlan(s);
 if(seeking){state.plan.forEach(p=>{if(p.at<t)p.done=true;});state.cursor={x:760+(i%3)*60,y:520};}
 else if(!prev||!shots[i-1]||Math.abs(prev.end-s.t)>.01)state.cursor={x:1240,y:690};
 if(state.phone){$('cursor').style.display='none';}else cursor(state.cursor.x,state.cursor.y);
 if(s.highlight)await markTarget(s.highlight,s.t+.8,Math.min(3.2,s.end-s.t-1),s.holdLabel);
 if(seeking){while(state.action<s.actions.length&&s.t+s.actions[state.action].at<=t){await doAction(s.actions[state.action],s);state.action++;state.armed=-1;}}
 detail(s.actions[state.action]?.target||s.highlight);return s;
}
async function renderTime(t,force=false){if(state.busy){state.queued={t,force:force||state.queued?.force};return}state.busy=true;
 try{t=Math.max(0,Math.min(total,t));const ci=chapters.findIndex(c=>t>=c.t&&t<c.end);const index=ci<0?chapters.length-1:ci;if(index!==state.chapter)setChapter(index);
 const si=shots.findIndex(s=>t>=s.t&&t<s.end);
 if(si>=0){const s=si!==state.shot||force?await loadShot(si,t,force):shots[si];
  if(!force){while(state.action<s.actions.length&&s.t+s.actions[state.action].at<=t){const act=s.actions[state.action];
    if(state.armed!==state.action){await arm(s,act,t,state.epoch);const m=state.motion;if(m&&m.action===state.action){m.begin=m.end=t-.01;}}
    await doAction(act,s);state.clickAt=s.t+act.at;state.action++;
  }}
  const act=s.actions[state.action];
  if(act&&t>=s.t+act.at-1.75&&state.armed!==state.action)await arm(s,act,t,state.epoch);
  else await idle(s,t,state.epoch);
  if(act?.type==='type'&&state.armed===state.action&&t>=s.t+act.at-.43){const offsets=[0,.085,.225,.335];const elapsed=t-(s.t+act.at-.43);const length=Math.min(act.value.length,offsets.filter(n=>elapsed>=n).length);const text=act.value.slice(0,length);if(w().document.querySelector(D.actions[act.target]||act.target)?.value!==text){D.input(w(),act.target,text);detail(act.target);}}
  $('time-jump').style.display=s.timeJump&&t-s.t<2?'block':'none';$('time-jump').textContent=s.timeJump||'';
 }else{if(state.shot!==-1){state.shot=-1;state.phone=false;state.taps=[];}$('time-jump').style.display='none';$('cursor').style.display='none';}
 }catch(err){state.errors.push(String(err));console.error(err);}finally{state.busy=false;if(state.queued){const next=state.queued;state.queued=null;await renderTime(next.t,next.force);}}
}
const diagram=chapters.find(c=>c.diagram);
let lastPaintTime=-1;
function paint(t){lastPaintTime=t;$('seek').value=t;$('time').textContent=`${format(t)} / ${format(total)}`;$('progressline').style.width=(t/total*1600)+'px';const i=captions.findIndex(c=>t>=c.start&&t<=c.end+.25);if(i!==state.caption){state.caption=i;$('subtitle').textContent=i<0?'':captions[i].text;}
 const shot=shots[state.shot];if(shot){const u=Math.max(0,Math.min(1,(t-shot.t)/.42)),ease=1-Math.pow(1-u,3);$('demo-shell').style.opacity=ease;$('demo-shell').style.transform=`translate3d(${8*(1-ease)}px,0,0)`;}
 pointerAt(t);paintPointer(t);paintTouch(t);if(state.pendingFocus&&t>=state.pendingFocus.options.start){M.focus(state.pendingFocus.rect,state.pendingFocus.options);state.pendingFocus=null;}M.paint(t);
 overview.paint(diagram&&t>=diagram.t&&t<diagram.end?20+(t-diagram.t)*15/(diagram.end-diagram.t):-1);
 story.paint(t);
 const result=state.result&&t>=state.result.start?state.result:null;$('result-badge').hidden=!result;if(result){$('result-badge').textContent='✓ '+result.text;$('result-badge').style.opacity=Math.min(1,(t-result.start)/.25);}
}
function tick(){if(state.playing){state.time=Math.min(total,audio.currentTime);if(state.time-state.lastMusicSync>2){if(Math.abs(music.currentTime-audio.currentTime)>.14)music.currentTime=audio.currentTime;state.lastMusicSync=state.time;}if(state.time>=total-.035){state.time=total;pause();}renderTime(state.time);}if(state.time!==lastPaintTime)paint(state.time);requestAnimationFrame(tick);}
async function play(){if(!state.ready)return;if(state.time>=total-.1)await seek(0);$('start-overlay').style.display='none';state.started=true;state.playing=true;$('toggle').textContent='Pause';$('toggle').setAttribute('aria-label','Pause film');try{music.currentTime=audio.currentTime;await Promise.all([audio.play(),music.play()]);}catch(e){pause();state.errors.push('Audio playback: '+e.message);}}
function pause(){state.playing=false;audio.pause();music.pause();$('toggle').textContent='Play';$('toggle').setAttribute('aria-label','Play film');}
async function settle(){while(state.busy)await new Promise(r=>setTimeout(r,10));}
async function seek(t){if(!state.ready)return;const resume=state.playing;pause();await settle();state.epoch++;state.motion=null;state.clickAt=-9;state.time=Math.max(0,Math.min(total,Number(t)));audio.currentTime=state.time;music.currentTime=state.time;state.lastMusicSync=state.time;state.shot=-1;await renderTime(state.time,true);paint(state.time);if(resume)await play();}
async function toggle(){if(state.playing)pause();else await play();}
function fromBase64(s,type){const b=atob(s.trim()),bytes=new Uint8Array(b.length);for(let i=0;i<b.length;i++)bytes[i]=b.charCodeAt(i);return new Blob([bytes],{type});}
$('toggle').onclick=toggle;$('start').onclick=play;$('restart').onclick=async()=>{await seek(0);await play();};
let seekResume=false;$('seek').addEventListener('pointerdown',()=>{seekResume=state.playing;pause()});$('seek').addEventListener('input',()=>{state.time=Number($('seek').value);paint(state.time)});$('seek').addEventListener('change',async()=>{await seek(Number($('seek').value));if(seekResume)await play();seekResume=false;});
$('cc').onclick=()=>{const off=$('stage').classList.toggle('subtitles-off');$('cc').setAttribute('aria-pressed',String(!off));};$('mute').onclick=()=>{audio.muted=!audio.muted;music.muted=audio.muted||!state.musicOn;$('mute').textContent=audio.muted?'Muted':'Sound';$('mute').setAttribute('aria-label',audio.muted?'Unmute audio':'Mute audio');};$('volume').oninput=()=>{audio.volume=Number($('volume').value);music.volume=audio.volume;};
$('music-toggle').onclick=()=>{state.musicOn=!state.musicOn;music.muted=!state.musicOn||audio.muted;$('music-toggle').setAttribute('aria-pressed',String(state.musicOn));$('music-toggle').textContent=state.musicOn?'Music':'Music off';};
$('fullscreen').onclick=async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await $('screen').requestFullscreen();};
const NAV=[['chain','The problem'],['reveal','XELOR'],['network','The network'],['mkt','XELOR Market'],['gram','Xelogram'],['erp','The engine'],['j1','One complete order'],['close','Close']];
const navAt=key=>{if(TL.story[key])return TL.story[key].t;const map={mkt:'k.home',gram:'s.gram',j1:'p.sales'};const s=shots.find(x=>x.screen===map[key]);return s?s.t:0;};
$('chapter-toggle').onclick=()=>$('chapters').classList.toggle('open');$('chapters').innerHTML=NAV.map(([k,l])=>`<button data-t="${navAt(k)}">${format(navAt(k))} · ${l}</button>`).join('');$('chapters').onclick=async e=>{const b=e.target.closest('button');if(!b)return;$('start-overlay').style.display='none';await seek(+b.dataset.t);await play();};
function playerKeys(e,fromDemo=false){if(!fromDemo&&/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(!['Space','ArrowRight','ArrowLeft'].includes(e.code))return;e.preventDefault();if(fromDemo)e.stopImmediatePropagation();if(e.code==='Space')toggle();if(e.code==='ArrowRight')seek(state.time+5);if(e.code==='ArrowLeft')seek(state.time-5);}
document.addEventListener('keydown',playerKeys);
audio.addEventListener('ended',()=>{state.time=total;pause();renderTime(total);paint(total)});
window.XELOR_FILM={play,pause,seek,ready:()=>state.ready,get time(){return state.time},get duration(){return total},get playing(){return state.playing},get errors(){return [...state.errors]},get snapshot(){return state.ready?D.snapshot(w(),false):null},chapters,shots,async checkpoint(t){await seek(t);return {time:state.time,chapter:state.chapter,shot:state.shot,action:state.action,product:D.snapshot(w(),false),errors:[...state.errors]}},async renderFrame(t){if(!state.ready)throw new Error('Film is not ready');pause();await settle();if(t<state.time){await seek(t);}else{state.time=Math.min(total,Math.max(0,t));await renderTime(state.time);paint(state.time);}return {time:state.time,errors:[...state.errors]};},exportMode(){document.body.classList.add('export');$('start-overlay').style.display='none';state.export=true;scale();}};
async function init(){audio.src=URL.createObjectURL(fromBase64($('audio-data').textContent,'audio/mpeg'));music.src=URL.createObjectURL(fromBase64($('music-data').textContent,'audio/mpeg'));const product=await fromBase64($('product-data').textContent,'text/html;charset=utf-8').text();
 await new Promise(resolve=>{$('demo').onload=resolve;$('demo').srcdoc=product;});await w().document.fonts.ready;await document.fonts.ready;await D.prepareDemo(w(),{step:0,screen:'p.sales',surface:'device',desktopHeight:518,padding:0,maxScale:1});
 const cinema=w().document.createElement('style');cinema.textContent='html[data-xelor-film] #frame.phone{left:71%!important}';w().document.head.appendChild(cinema);
 w().document.addEventListener('keydown',e=>playerKeys(e,true),true);
 await new Promise((resolve,reject)=>{if(audio.readyState>=1)return resolve();audio.addEventListener('loadedmetadata',resolve,{once:true});audio.addEventListener('error',()=>reject(new Error('Narration failed to load')),{once:true});});
 await new Promise((resolve,reject)=>{if(music.readyState>=1)return resolve();music.addEventListener('loadedmetadata',resolve,{once:true});music.addEventListener('error',()=>reject(new Error('Music failed to load')),{once:true});});
 state.ready=true;setChapter(0);paint(0);$('start').disabled=false;$('start').textContent='▶  Watch the film';if(new URLSearchParams(location.search).has('export'))window.XELOR_FILM.exportMode();requestAnimationFrame(tick);
}
init().catch(err=>{state.errors.push(String(err));$('start').textContent='Unable to load — please reopen the file';console.error(err)});
})();
