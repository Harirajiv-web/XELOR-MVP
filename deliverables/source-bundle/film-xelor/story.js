/* XELOR story scenes: problem, turn, network, products, pricing and close.
 * Deterministic: every style is a pure function of film time, so seeking
 * and frame-by-frame export give identical frames. No timers or CSS animation.
 */
(function(global){
'use strict';
const cl=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const P=(t,s,d)=>cl((t-s)/d);
const eo=x=>1-Math.pow(1-x,3);
const eo5=x=>1-Math.pow(1-x,5);
const eio=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
const eb=x=>{const c1=1.45,c3=c1+1;return x<=0?0:x>=1?1:1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2);};
const f=n=>Math.round(n*100)/100;
function rng(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
const ICON={
 raw:'<path d="M3 17l4-8 4 5 3-3 7 6zM3 20h18"/>',
 foundry:'<path d="M4 20V11l5 3V9l5 3V6h4l2 14z"/><path d="M15 3c1 1 1 2 0 3"/>',
 gear:'<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M4.2 6.5l2.3 1.6M17.5 15.9l2.3 1.6M4.2 17.5l2.3-1.6M17.5 8.1l2.3-1.6"/><circle cx="12" cy="12" r="7"/>',
 spray:'<path d="M8 9h7v11H8zM9 9V6h5v3M17 5h2M17 8h3M17 11h2"/>',
 build:'<path d="M3 21h18M6 21V10l6-5 6 5v11"/><path d="M10 21v-6h4v6"/>',
 factory:'<path d="M3 21V11l6-4v4l6-4v4h6v10z"/><path d="M7 16h2M12 16h2M17 16h1"/>',
 box:'<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>'
};
const svgI=k=>`<svg viewBox="0 0 24 24">${ICON[k]}</svg>`;

function install(doc,TL){
 const $=id=>doc.getElementById(id);
 const root=$('story'),stage=$('stage');if(!root)return{paint(){}};
 const S=TL.story;
 const DOM={chain:'sc-chain',guess:'sc-chain',scramble:'sc-scramble',inside:'sc-inside',cost:'sc-cost',reveal:'sc-reveal',network:'sc-network',three:'sc-three',price:'sc-price',close:'sc-close'};
 const win={};for(const [sid,id] of Object.entries(DOM)){if(!S[sid])continue;const w=win[id]||(win[id]={start:1e9,end:-1});w.start=Math.min(w.start,S[sid].t);w.end=Math.max(w.end,S[sid].end);}
 const C=sid=>S[sid]?S[sid].cues:[0,0,0,0,0,0];
 const E=sid=>S[sid]?S[sid].ends:[0,0,0,0,0,0];

 // split words
 doc.querySelectorAll('#story .words').forEach(el=>{
  const walk=node=>{[...node.childNodes].forEach(ch=>{
   if(ch.nodeType===3){const parts=ch.textContent.split(/(\s+)/);const frag=doc.createDocumentFragment();
    parts.forEach(p=>{if(!p)return;if(/^\s+$/.test(p))frag.appendChild(doc.createTextNode(p));else{const s=doc.createElement('span');s.className='w';s.textContent=p;frag.appendChild(s);}});
    node.replaceChild(frag,ch);}
   else if(ch.nodeType===1&&ch.tagName!=='BR')walk(ch);});};
  walk(el);});
 const W=el=>[...el.querySelectorAll('.w')];
 function op(el,o){el.style.opacity=String(f(o));}
 function words(el,t,start,stg=.075,dur=.6,dy=28){W(el).forEach((w,i)=>{const p=eo(P(t,start+i*stg,dur));w.style.opacity=f(p);w.style.transform=`translate3d(0,${f(dy*(1-p))}px,0)`;w.style.filter=p<1?`blur(${f(7*(1-p))}px)`:'none';});}
 function enter(el,t,at,dur=.6,o={}){const p=(o.back?eb:eo)(P(t,at,dur));const q=cl(P(t,at,dur)*1.6);op(el,o.keep?Math.min(q,o.keep):q);
  const dx=(o.dx||0)*(1-p),dy=(o.dy??24)*(1-p),s=o.s0!=null?o.s0+(1-o.s0)*p:1,r=(o.r||0)*(1-p);
  el.style.transform=`translate3d(${f(dx)}px,${f(dy)}px,0) scale(${f(s)}) rotate(${f(r)}deg)`;return p;}
 function draw(path,p){path.setAttribute('stroke-dasharray','1 1');path.setAttribute('stroke-dashoffset',String(f(1-p)));}

 /* ---------- chain ---------- */
 const CH=[{x:180,y:520,b:'Raw material',s:'Steel and scrap',i:'raw'},{x:432,y:466,b:'Foundry',s:'Castings',i:'foundry'},{x:684,y:520,b:'Machine shop',s:'Precision parts',i:'gear'},{x:936,y:466,b:'Coating unit',s:'Finish and protection',i:'spray'},{x:1188,y:520,b:'Assembler',s:'Sub-assemblies',i:'build'},{x:1420,y:466,b:'Manufacturer',s:'The product you buy',i:'box'}];
 const chNodes=$('ch-nodes'),chLinks=$('ch-links');
 CH.forEach((n,i)=>{const d=doc.createElement('div');d.className='cn';d.style.left=n.x+'px';d.style.top=n.y+'px';d.innerHTML=`<div class="rg">${svgI(n.i)}</div><b>${n.b}</b><small>${n.s}</small>`;chNodes.appendChild(d);n.el=d;n.rg=d.querySelector('.rg');});
 const chL=[];for(let i=0;i<CH.length-1;i++){const a=CH[i],b=CH[i+1],ay=a.y+52,by=b.y+52,mx=(a.x+b.x)/2;const dd=`M ${a.x+58} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${b.x-58} ${by}`;
  const base=doc.createElementNS('http://www.w3.org/2000/svg','path');base.setAttribute('d',dd);base.setAttribute('class','lkb');
  const p=doc.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',dd);p.setAttribute('class','lk');p.setAttribute('pathLength','1');
  chLinks.append(base,p);const len=p.getTotalLength();const mid=p.getPointAtLength(len/2);
  const q=doc.createElement('div');q.className='q';q.textContent='?';q.style.left=mid.x+'px';q.style.top=mid.y+'px';$('sc-chain').querySelector('.cam').appendChild(q);
  chL.push({p,len,q,base});}
 const RND=rng(7);const drift=CH.map(()=>({x:(RND()-.5)*60,y:(RND()-.5)*70,r:(RND()-.5)*16}));
 function paintChain(t){
  const [c0,c1]=C('chain'),[g0]=C('guess'),gEnd=S.guess?S.guess.end:0;
  const cam=$('sc-chain').querySelector('.cam');cam.style.transform=`scale(${f(1+.035*P(t,0,gEnd))})`;
  enter($('sc-chain').querySelector('.kick'),t,.25,.6,{dy:10});
  // headline 1, then out at g0
  const h1=$('ch-h1'),h2=$('ch-h2');
  words(h1,t,c0-.1,.09,.65);const out=eo(P(t,g0-.15,.45));h1.style.opacity=f(1-out);h1.style.transform=`translate3d(0,${f(-26*out)}px,0)`;
  h2.style.opacity=t>=g0?1:0;words(h2,t,g0+.1,.085,.6);
  const nt=[c0+1.4,c1-.05,c1+.8,c1+1.7,c1+2.55,c1+3.25];
  const lt=[c0+1.9,c1+.35,c1+1.2,c1+2.1,c1+2.9];
  const brk=g0+2.55,bp=eio(P(t,brk,.9));
  CH.forEach((n,i)=>{const p=eb(P(t,nt[i],.7));op(n.el,cl(P(t,nt[i],.4)));
   const d=drift[i];n.el.style.transform=`translate3d(${f(d.x*bp)}px,${f(26*(1-p)+d.y*bp)}px,0) scale(${f(.7+.3*p)}) rotate(${f(d.r*bp)}deg)`;
   const glow=Math.max(0,1-P(t,nt[i]+.2,1.2));n.rg.style.boxShadow=`0 0 0 ${f(8+22*glow)}px rgba(226,181,74,${f(.08+.25*glow)}),0 18px 50px #000a`;
   n.rg.style.filter=bp>0?`grayscale(${f(bp)}) brightness(${f(1-.35*bp)})`:'none';n.rg.style.borderColor=bp>.5?'#8a6a6a':'#e2b54a';});
  let head=null;
  chL.forEach((l,i)=>{const d=eio(P(t,lt[i],.75));l.base.style.opacity=f(eo(P(t,lt[i]-.2,.5))*(1-.6*bp));
   if(bp<=0){draw(l.p,d);if(d>0&&d<1)head=l.p.getPointAtLength(l.len*d);}
   else{const g=.06+.16*bp;l.p.setAttribute('stroke-dasharray',`${f(.5-g)} ${f(2*g)} 1`);l.p.setAttribute('stroke-dashoffset','0');}
   const flick=t>g0+1.3&&t<brk?(.55+.45*Math.abs(Math.sin(t*23+i*1.7))):1;
   l.p.style.opacity=f((bp>0?1-.55*bp:1)*flick);l.p.style.stroke=bp>.3?'#c46a6a':'#e2b54a';
   const qp=eb(P(t,brk+.15+i*.12,.5));op(l.q,cl(P(t,brk+.15+i*.12,.25)));l.q.style.transform=`scale(${f(.3+.7*qp)}) rotate(${f(qp*8*Math.sin(t*3+i))}deg)`;});
  const sp=$('ch-spark');const done=lt[4]+.75;
  if(!head&&t>done&&t<brk){const u=((t-done)*1.1)%5;const k=Math.floor(u);head=chL[k].p.getPointAtLength(chL[k].len*(u-k));}
  if(head&&bp<=0){op(sp,1);sp.style.left=f(head.x)+'px';sp.style.top=f(head.y)+'px';}else op(sp,0);
  enter($('ch-who'),t,g0+3.55,.7,{dy:16});
 }

 /* ---------- scramble ---------- */
 const msgs=[...$('sc-msgs').children];
 function paintScramble(t){
  const [c0,c1,c2]=C('scramble'),e2=E('scramble')[2];
  enter($('sc-scramble').querySelector('.kick'),t,S.scramble.t+.15,.5,{dy:8});
  enter($('sc-dir'),t,c0-.15,.7,{dy:40,s0:.94});
  const st=P(t,c0+1.0,.32);op($('sc-stamp'),cl(st*2.5));$('sc-stamp').style.transform=`scale(${f(1.7-.7*eo(st))}) rotate(-7deg)`;
  enter($('sc-phone'),t,c1-.35,.8,{dy:60,s0:.92});
  msgs.forEach((m,i)=>{const at=c1+.15+i*.47;const p=eb(P(t,at,.42));op(m,cl(P(t,at,.2)));m.style.transform=`translate3d(0,${f(14*(1-p))}px,0) scale(${f(.85+.15*p)})`;m.style.transformOrigin=m.classList.contains('me')?'100% 100%':'0 100%';});
  enter($('sc-calls'),t,c1+.95,.6,{dx:40,dy:0});$('sc-cnt').textContent='×'+Math.round(6*eo(P(t,c1+1.1,1.6)));
  enter($('sc-search'),t,c1+1.75,.6,{dx:40,dy:0});
  const q='casting supplier near peenya';const n=Math.round(q.length*P(t,c1+2.0,1.0));$('sc-q').textContent=q.slice(0,n);
  op($('sc-caret'),Math.floor(t*2.2)%2===0||(n>0&&n<q.length)?1:0);
  [...$('sc-res').children].forEach((r,i)=>enter(r,t,c1+3.05+i*.12,.4,{dy:8}));
  enter($('sc-ref'),t,c1+2.55,.6,{dx:40,dy:0});
  enter($('sc-map'),t,c2-.05,.7,{dy:40,s0:.95});draw($('sc-route'),eio(P(t,c2+.35,1.6)));
  const pe=eb(P(t,c2+1.9,.45));op($('sc-pin2'),cl(pe));op($('sc-hosur'),cl(pe));op($('sc-visit'),cl(P(t,c2+2.1,.4)));
  enter($('sc-day'),t,c1+.2,.5,{dy:-10});const dn=1+Math.floor(8*cl(P(t,c1+.4,e2-c1-.2)));$('sc-dayn').textContent=String(dn);op($('sc-dayt'),cl(P(t,c2+.8,.5)));
  $('sc-scramble').querySelector('.cam').style.transform=`scale(${f(1.02-.02*P(t,S.scramble.t,S.scramble.end-S.scramble.t))})`;
 }

 /* ---------- inside ---------- */
 const vals=[0,1,2,3].map(i=>$('in-w'+i).querySelector('.val'));vals.forEach(v=>{v.dataset.orig=v.textContent;});
 function paintInside(t){
  const [c0,c1,c2]=C('inside');
  enter($('sc-inside').querySelector('.kick'),t,S.inside.t+.1,.5,{dy:8});
  const h1=$('in-h1'),h2=$('in-h2');enter(h1,t,S.inside.t+.2,.6,{dy:18});if(t>=c2-.1){const o=eo(P(t,c2-.1,.35));op(h1,1-o);h1.style.transform=`translate3d(0,${f(-20*o)}px,0)`;}
  enter(h2,t,c2+.05,.55,{dy:18});if(t<c2+.05)op(h2,0);
  const wt=[c0+.55,c1+.0,c1+1.15,c1+2.3];
  wt.forEach((at,i)=>enter($('in-w'+i),t,at,.65,{back:true,dy:40,s0:.9}));
  [0,1,2,3].forEach(i=>{const at=c1+3.05+i*.12;const p=eb(P(t,at,.45));op($('in-x'+i),cl(P(t,at,.2)));$('in-x'+i).style.transform=`scale(${f(.4+.6*p)})`;op($('in-c'+i),cl(P(t,at,.3)));});
  let typedN=0;
  vals.forEach((v,i)=>{const ts=c2+.15+i*.45;const target=v.dataset.v;
   if(t<ts){v.textContent=v.dataset.orig;v.classList.remove('bad');}
   else{typedN++;const k=Math.round(target.length*P(t,ts+.08,.24));v.innerHTML=target.slice(0,k)+(t<ts+.42?'<i class="typer"></i>':'');v.classList.toggle('bad',!!v.dataset.bad&&t>ts+.42);}
   const pulse=t>=ts?Math.max(0,1-P(t,ts,.6)):0;$('in-w'+i).style.boxShadow=`0 30px 70px -20px #000d,0 0 0 ${f(6*pulse)}px rgba(226,181,74,${f(.8*pulse)})`;});
  const tb=$('in-typed');const tp=eb(P(t,c2+.12,.45));op(tb,cl(P(t,c2+.12,.2)));tb.style.transform=`scale(${f(.5+.5*tp+.06*Math.max(0,1-P(t,c2+.15+(typedN-1)*.45,.25)))})`;$('in-tn').textContent='×'+Math.max(1,typedN);
  $('sc-inside').querySelector('.cam').style.transform=`scale(${f(1+.025*P(t,S.inside.t,S.inside.end-S.inside.t))})`;
 }

 /* ---------- cost ---------- */
 function paintCost(t){
  const [c0,c1,c2]=C('cost');const ts=[c0+.0,c0+1.3,c0+2.55];
  let sx=0,sy=0;ts.forEach((s,i)=>{if(t>s){const a=t-s;const amp=9*Math.exp(-a*9);sx+=amp*Math.sin(a*70+i);sy+=amp*.6*Math.cos(a*55+i);}});
  const cam=$('sc-cost').querySelector('.cam');cam.style.transform=`translate3d(${f(sx)}px,${f(sy)}px,0) scale(${f(1+.03*P(t,c1,3))})`;
  const sc=eio(P(t,c1+.05,.95));const dir=[[-260,-90,-14],[0,220,7],[260,-110,12]];
  ts.forEach((s,i)=>{const el=$('co-p'+i);const p=P(t,s,.34);const k=1.22-.22*eo5(p);
   el.style.opacity=f(cl(p*3)*(1-sc));el.style.transform=`translate3d(${f(dir[i][0]*sc)}px,${f(dir[i][1]*sc)}px,0) scale(${f(k)}) rotate(${f(dir[i][2]*sc)}deg)`;el.style.filter=sc>0?`blur(${f(9*sc)}px)`:'none';});
  const ghost=P(t,ts[2]+.7,1.1);$('co-p2').querySelectorAll('.pi,b,span').forEach(n=>n.style.opacity=f(1-.6*ghost));
  const t1=$('co-t1');enter(t1,t,c1+.1,.6,{dy:26});if(t>=c2-.1){const o=eio(P(t,c2-.1,.6));t1.style.opacity=f(1-.55*o);t1.style.transform=`translate3d(0,${f(-50*o)}px,0) scale(${f(1-.12*o)})`;}
  const t2=$('co-t2');op(t2,t>=c2-.05?1:0);words(t2,t,c2,.11,.7,34);
  const em=$('co-em'),ul=$('co-ul');const up=eio(P(t,c2+1.45,.7));
  ul.style.left=(t2.offsetLeft+em.offsetLeft)+'px';ul.style.top=(t2.offsetTop+em.offsetTop+em.offsetHeight-2)+'px';ul.style.width=em.offsetWidth+'px';ul.style.transform=`scaleX(${f(up)})`;op(ul,up>0?1:0);
 }

 /* ---------- particles (reveal + close) ---------- */
 function makePts(host,n,seed){const r=rng(seed),a=[];for(let i=0;i<n;i++){const d=doc.createElement('div');d.className='pt';const s=2+r()*4;d.style.width=d.style.height=f(s)+'px';host.appendChild(d);a.push({el:d,x:r()*1600,y:r()*900,s,ph:r()*6.28,sp:.3+r()*.9,del:r()*.35});}return a;}
 const rvPts=makePts($('rv-pts'),90,11),clPts=makePts($('cl-pts'),46,23);
 function lockup(pref,t,at,lockTop){
  const lock=$(pref+'-lock');lock.style.width='1600px';lock.style.justifyContent='center';
  const tile=$(pref+'-tile'),s1=$(pref+'-s1'),s2=$(pref+'-s2'),mk=$(pref+'-mk');
  const tp=eb(P(t,at,.6));tile.style.transformOrigin='32px 32px';tile.style.transform=`scale(${f(.35+.65*tp)})`;op(tile,cl(P(t,at,.25)));
  draw(s1,eio(P(t,at+.28,.45)));const c=eio(P(t,at+.58,.5));draw(s2,c);
  const flash=Math.max(0,Math.sin(Math.PI*cl((t-(at+.85))/.9)));mk.style.filter=`drop-shadow(0 0 ${f(4+26*flash)}px rgba(226,181,74,${f(.25+.55*flash)}))`;
  [...$(pref+'-wm').children].forEach((s,i)=>{const p=eo(P(t,at+.7+i*.065,.55));op(s,cl(P(t,at+.7+i*.065,.3)));s.style.transform=`translate3d(${f(46*(1-p))}px,0,0)`;});
  return{lock,mk};
 }
 function paintReveal(t){
  const t0=S.reveal.t,[c0,c1]=C('reveal');const at=t0+1.15;
  const {lock,mk}=lockup('rv',t,at);
  lock.style.transform=`scale(${f(1.05-.05*eo(P(t,at,3.5)))})`;
  const markX=(1600-(190+34+$('rv-wm').offsetWidth))/2+95,markY=lock.offsetTop+95;
  rvPts.forEach(p=>{const u=eio(P(t,t0+.1+p.del,1.1));const ang=(1-u)*1.4;const dx=p.x-markX,dy=p.y-markY;
   const x=markX+(dx*Math.cos(ang)-dy*Math.sin(ang))*(1-u),y=markY+(dx*Math.sin(ang)+dy*Math.cos(ang))*(1-u);
   p.el.style.transform=`translate3d(${f(x)}px,${f(y)}px,0)`;op(p.el,cl(P(t,t0,.3))*(1-cl((u-.85)/.15))*(.5+.5*Math.sin(t*4+p.ph)));});
  op($('rv-glow'),eo(P(t,at,1.6))*.9);$('rv-glow').style.transform=`scale(${f(.7+.3*eo(P(t,at,2.2)))})`;
  op($('rv-tag'),t>=c1-.1?1:0);words($('rv-tag'),t,c1,.085,.65,24);
  const sw=$('rv-sweep');const sp=P(t,at+1.2,1.0);sw.style.left=f(380+840*eio(sp))+'px';op(sw,Math.sin(Math.PI*sp));
 }
 function paintClose(t){
  const t0=S.close.t,[c0,c1]=C('close');
  const k=$('cl-k');const kp=eo(P(t,c0-.1,.7));const mv=eio(P(t,c1-.2,.8));
  op(k,kp);k.style.top=f(400-250*mv)+'px';k.style.transform=`translate3d(0,${f(20*(1-kp))}px,0) scale(${f(1-.32*mv)})`;
  const {lock}=lockup('cl',t,c1-.25);lock.style.top='252px';
  op($('cl-tag'),t>=c1+.9?1:0);words($('cl-tag'),t,c1+1.0,.08,.6,22);
  [0,1,2].forEach(i=>enter($('cl-c'+i),t,c1+2.2+i*.16,.55,{back:true,dy:22,s0:.85}));
  enter($('cl-foot'),t,c1+2.9,.6,{dy:10});
  op($('cl-glow'),.4+.5*eo(P(t,c1-.2,1.6)));
  clPts.forEach(p=>{const y=((p.y-(t-t0)*24*p.sp)%900+900)%900,x=p.x+18*Math.sin(t*p.sp+p.ph);p.el.style.transform=`translate3d(${f(x)}px,${f(y)}px,0)`;op(p.el,(.25+.35*Math.sin(t*2+p.ph))*eo(P(t,t0,1)));});
 }

 /* ---------- network ---------- */
 const NS='http://www.w3.org/2000/svg';
 const N={k:{x:520,y:470,b:'Kaveri Pumps',s:'Pump maker · Peenya',i:'factory',c:'k'},g:{x:210,y:300,b:'Sri Ganesh Castings',s:'Foundry · Hosur',i:'foundry'},a:{x:200,y:610,b:'Anand Engineering',s:'Machine shop · Ambattur',i:'gear'},v:{x:830,y:280,b:'Veerabhadra Castings',s:'Foundry · Belagavi',i:'foundry'},m:{x:800,y:590,b:'Meenakshi Foundry',s:'Foundry · Peenya',i:'foundry'},b1:{x:990,y:470,b:'Pump buyer',s:'',i:'factory',sm:1},b2:{x:1000,y:690,b:'OEM',s:'',i:'build',sm:1},b3:{x:640,y:730,b:'Assembler',s:'',i:'build',sm:1}};
 const nwNodes=$('nw-nodes');
 for(const [id,n] of Object.entries(N)){const d=doc.createElement('div');d.className='nd'+(n.c?' '+n.c:'');d.style.left=n.x+'px';d.style.top=(n.y-(n.c?61:44))+'px';
  d.innerHTML=`<div class="o"${n.sm?' style="width:62px;height:62px"':''}>${svgI(n.i)}${id==='g'?'<svg class="ring" viewBox="0 0 106 106"><circle cx="53" cy="53" r="49" stroke="#eadfd5"/><circle id="nw-ring" cx="53" cy="53" r="49" stroke="#1b6a48" pathLength="1" transform="rotate(-90 53 53)"/></svg>':''}<span class="bd" id="nw-bd-${id}" style="opacity:0"></span></div><b${n.sm?' style="font-size:17px"':''}>${n.b}</b>${n.s?`<small>${n.s}</small>`:''}`;
  nwNodes.appendChild(d);n.el=d;}
 const linkDefs=[['g','k'],['a','k'],['v','k'],['k','m'],['m','b1'],['m','b2'],['m','b3']];
 const L={};linkDefs.forEach(([a,b])=>{const A=N[a],B=N[b];const mx=(A.x+B.x)/2+(A.y-B.y)*.12,my=(A.y+B.y)/2+(B.x-A.x)*.12;
  const p=doc.createElementNS(NS,'path');p.setAttribute('d',`M ${A.x} ${A.y} Q ${f(mx)} ${f(my)} ${B.x} ${B.y}`);p.setAttribute('class','nl');p.setAttribute('pathLength','1');$('nw-links').appendChild(p);L[a+b]={p,len:p.getTotalLength()};});
 const dots=['g','a','v'].map(()=>{const d=doc.createElement('div');d.className='dot';$('nw-dots').appendChild(d);return d;});
 const R2=rng(91),tiny=[];const fixed=Object.values(N);
 for(let tries=0;tiny.length<54&&tries<4000;tries++){const x=80+R2()*960,y=190+R2()*590;if(fixed.some(n=>Math.hypot(n.x-x,n.y-y)<(n.c?120:95)))continue;if(tiny.some(n=>Math.hypot(n.x-x,n.y-y)<58))continue;tiny.push({x,y});}
 tiny.forEach(n=>{n.d=Math.hypot(n.x-N.k.x,n.y-N.k.y);});tiny.sort((a,b)=>a.d-b.d);
 const maxD=Math.max(...tiny.map(n=>n.d));
 tiny.forEach((n,i)=>{const prev=fixed.concat(tiny.slice(0,i));const near=prev.map(p=>({p,d:Math.hypot(p.x-n.x,p.y-n.y)})).sort((a,b)=>a.d-b.d).slice(0,i%3===0?2:1);
  n.links=near.map(({p})=>{const l=doc.createElementNS(NS,'path');l.setAttribute('d',`M ${f(p.x)} ${f(p.y)} L ${f(n.x)} ${f(n.y)}`);l.setAttribute('class','nl sm');l.setAttribute('pathLength','1');$('nw-grow').appendChild(l);return l;});
  const e=doc.createElement('div');e.className='tiny'+(i%4===0?' g':'');e.style.left=f(n.x)+'px';e.style.top=f(n.y)+'px';$('nw-tiny').appendChild(e);n.el=e;});
 function badge(id,text,t,at,cls){const b=$('nw-bd-'+id);if(!b)return;b.textContent=text;b.className='bd'+(cls?' '+cls:'');const p=eb(P(t,at,.45));op(b,cl(P(t,at,.2)));b.style.transform=`scale(${f(.5+.5*p)})`;}
 function paintNetwork(t){
  const s=S.network,c=s.cues;const nxt=i=>i<4?c[i+1]:s.end+1;
  for(let i=0;i<5;i++){const h=$('nw-h'+i),pn=$('nw-p'+i);
   const a=eo(P(t,c[i]-.15,.5)),o=i<4?eo(P(t,nxt(i)-.3,.3)):0;
   [h,pn].forEach((el,j)=>{op(el,a*(1-o));el.style.transform=`translate3d(${f(j?40*(1-a):0)}px,${f((j?0:22)*(1-a)-14*o)}px,0)`;});}
  enter($('sc-network').querySelector('.kick'),t,s.t+.1,.5,{dy:8});
  const appear={k:s.t+.15,g:s.t+.45,a:c[2]+.05,v:c[2]+.3,m:c[3]+.95,b1:c[3]+2.55,b2:c[3]+2.8,b3:c[3]+3.05};
  for(const [id,n] of Object.entries(N)){const p=eb(P(t,appear[id],.6));op(n.el,cl(P(t,appear[id],.3)));n.el.style.transform=`translate3d(0,${f(18*(1-p))}px,0) scale(${f(.6+.4*p)})`;}
  // delivery G -> K
  const gk=L.gk;draw(gk.p,eio(P(t,s.t+.6,.8)));
  const tr=$('nw-truck');const tp=eio(P(t,c[0]+.15,1.7));if(tp>0&&tp<1){const pt=gk.p.getPointAtLength(gk.len*tp);op(tr,1);tr.style.left=f(pt.x)+'px';tr.style.top=f(pt.y)+'px';}else op(tr,0);
  badge('k','✓ On time',t,c[0]+1.9);
  $('nw-scan').style.top=f(4+60*Math.abs(Math.sin((t-c[0])*2.2)))+'px';
  // record
  const rp=eio(P(t,c[1]+.3,1.3));const ring=$('nw-ring');ring.setAttribute('stroke-dasharray',`${f(.96*rp)} 1`);
  badge('g','96% on time',t,c[1]+1.4);
  $('nw-s0').textContent=Math.round(96*rp)+'%';$('nw-s1').textContent=(0.3*rp).toFixed(1)+'%';$('nw-s2').textContent=String(Math.round(19*rp));
  // compare
  draw(L.ak.p,eio(P(t,c[2]+.2,.6)));draw(L.vk.p,eio(P(t,c[2]+.45,.6)));
  badge('a','91% on time',t,c[2]+.6);badge('v','New',t,c[2]+.85,'g');
  ['gk','ak','vk'].forEach((k,i)=>{const go=P(t,c[2]+.85+i*.08,.75),back=P(t,c[2]+1.75+i*.12,.75);let u=-1,col='#7a2945';
   if(go>0&&go<1)u=1-eio(go);else if(back>0&&back<1){u=eio(back);col='#c89a2e';}
   const d=dots[i];if(u>=0){const pt=L[k].p.getPointAtLength(L[k].len*u);op(d,1);d.style.left=f(pt.x)+'px';d.style.top=f(pt.y)+'px';d.style.background=col;}else op(d,0);});
  ['r0','r1','r2'].forEach((r,i)=>{$('nw-'+r).style.width=f([92,71,58][i]*eio(P(t,c[2]+1.6+i*.1,.8)))+'%';});
  const ch=eio(P(t,c[2]+2.6,.5));gk.p.style.stroke=ch>0?`rgb(${f(201-1*ch)},${f(171-17*ch)},${f(131-85*ch)})`:'';gk.p.style.strokeWidth=f(2.6+3.4*ch);
  // invite and own buyers
  draw(L.km.p,eio(P(t,c[3]+.25,.7)));badge('m','Joins free',t,c[3]+1.25,'g');
  draw(L.mb1.p,eio(P(t,c[3]+2.45,.5)));draw(L.mb2.p,eio(P(t,c[3]+2.7,.5)));draw(L.mb3.p,eio(P(t,c[3]+2.95,.5)));
  // growth
  tiny.forEach(n=>{const at=c[4]-.6+(n.d/maxD)*2.7;const p=eb(P(t,at,.45));op(n.el,cl(P(t,at,.2)));n.el.style.transform=`scale(${f(.3+.7*p)})`;n.links.forEach(l=>draw(l,eio(P(t,at-.15,.4))));});
  const g=eio(P(t,c[4]-.6,3.4));$('nw-cam').style.transform=`translate3d(${f(-10*g)}px,${f(-6*g)}px,0)`;
  for(const n of Object.values(N)){const o=n.el.querySelector('.o');const pulse=n.c?Math.max(0,1-P(t,c[3]+.1,.9)):0;if(n.c)o.style.boxShadow=`0 14px 34px -12px #5b3d2560,0 0 0 ${f(40*(1-pulse))}px rgba(122,41,69,${f(.25*pulse)})`;}
 }

 /* ---------- three ---------- */
 function paintThree(t){
  const [c0,c1]=C('three');
  op($('th-h1'),1);words($('th-h1'),t,c0-.05,.08,.6);
  enter($('th-pill'),t,c0+.75,.55,{back:true,dy:20,s0:.8});
  const at={m:c1-.05,g:c1+1.1,e:c1+2.2};
  enter($('th-m'),t,at.m,.75,{back:true,dy:70,s0:.9});enter($('th-g'),t,at.g,.7,{back:true,dy:70,s0:.9,dx:-30});enter($('th-e'),t,at.e,.7,{back:true,dy:70,s0:.9,dx:30});
  draw($('th-c1'),eio(P(t,at.m+.3,.4)));draw($('th-c0'),eio(P(t,at.g+.3,.6)));draw($('th-c2'),eio(P(t,at.e+.3,.6)));
  const fl=$('th-m').querySelector('.flag');const fp=eb(P(t,at.m+.6,.45));fl.style.transform=`scale(${f(.4+.6*fp)})`;op(fl,cl(P(t,at.m+.6,.2)));
 }
 /* ---------- price ---------- */
 function paintPrice(t){
  const s=S.price,[c0,c1]=C('price');
  enter($('sc-price').querySelector('.kick'),t,s.t+.1,.5,{dy:8});
  op($('pr-h1'),1);words($('pr-h1'),t,s.t+.2,.07,.55);
  const a=$('pr-a'),b=$('pr-b');a.style.height='330px';b.style.height='31px';
  const ap=eio(P(t,c0+.1,1.1)),bp=eb(P(t,c0+1.45,.6));a.style.transform=`scaleY(${f(ap)})`;b.style.transform=`scaleY(${f(bp)})`;
  const va=$('pr-va'),vb=$('pr-vb');va.style.top='22px';vb.style.top='300px';
  enter(va,t,c0+.85,.5,{dy:16});enter(vb,t,c0+1.75,.5,{dy:16});
  const fr=$('pr-free');fr.style.top='248px';enter(fr,t,c0+.55,.5,{back:true,dy:14,s0:.7});
  [0,1,2].forEach(i=>enter($('pr-p'+i),t,c1-.1+i*.38,.6,{dx:50,dy:0}));
 }

 const PAINT={'sc-chain':paintChain,'sc-scramble':paintScramble,'sc-inside':paintInside,'sc-cost':paintCost,'sc-reveal':paintReveal,'sc-network':paintNetwork,'sc-three':paintThree,'sc-price':paintPrice,'sc-close':paintClose};
 function paint(t){
  let any=0,top=null,topO=0;
  for(const [id,w] of Object.entries(win)){
   const el=$(id);const fin=w.start<=0?eo(P(t,0,.9)):eo(P(t,w.start,.45));const fout=id==='sc-close'?1:1-P(t,w.end,.45);
   const o=t>=w.start-.001&&t<w.end+.45?fin*fout:0;
   if(o<=0){el.style.display='none';continue;}
   el.style.display='block';op(el,o);any=Math.max(any,o);if(o>topO){topO=o;top=el;}
   try{PAINT[id](t);}catch(e){console.error(id,e);}
  }
  root.style.display=any>0?'block':'none';
  stage.classList.toggle('story-on',any>.5);stage.classList.toggle('story-light',!!top&&top.classList.contains('light'));
 }
 return{paint};
}
global.XelorStory=Object.freeze({install});
})(window);
