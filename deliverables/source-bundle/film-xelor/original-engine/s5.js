/* High-level XELOR overview, 00:20–00:35. Presentation only.
 * const overview = XelorOverview.install(document); overview.paint(filmTime);
 * All animation is deterministic, including backwards seeks and offline export.
 */
(function(global){
  'use strict';
  const mounted=new WeakMap();
  const NS='http://www.w3.org/2000/svg';
  const clamp=v=>Math.min(1,Math.max(0,v));
  const phase=(t,start,duration)=>clamp((t-start)/duration);
  const ease=v=>1-Math.pow(1-clamp(v),3);
  const f=v=>Number(v.toFixed(4));
  const icon={
    orders:'<rect x="5" y="4" width="15" height="20" rx="2"/><path d="M9 2h7v5H9zM9 12h7M9 16h7M9 20h4"/>',
    suppliers:'<path d="M3 10h21M5 10v14h17V10M3 10l2-7h17l2 7M9 24v-8h9v8M9 3v7M18 3v7"/>',
    stock:'<path d="m4 8 9-5 10 5-10 5-9-5Zm0 0v12l9 5 10-5V8M13 13v12M9 5l10 5"/>',
    factory:'<path d="M3 24V13l7-5v5l7-5v5h7v11H3ZM20 13V3h4v10M7 18v2M12 18v2M17 18v2"/>',
    delivery:'<path d="M2 5h14v14H2zM16 10h5l4 5v4h-9M18 10v6h6"/><circle cx="7" cy="21" r="3"/><circle cx="21" cy="21" r="3"/>'
  };
  const nodes=[
    {id:'orders',title:'Customer orders',body:'What to make · by when',x:617,y:44,start:24.15,p:[800,211,800,189,800,186,800,164]},
    {id:'suppliers',title:'Suppliers',body:'Buy missing parts',x:1096,y:164,start:24.90,p:[972,273,1034,273,1034,224,1096,224]},
    {id:'stock',title:'Stock',body:'Know what is ready',x:1056,y:352,start:25.84,p:[935,393,985,430,998,412,1056,412]},
    {id:'factory',title:'Factory work',body:'Make it · check quality',x:178,y:352,start:26.55,p:[665,393,615,430,602,412,544,412]},
    {id:'delivery',title:'Delivery & payments',body:'Send it · track the money',x:158,y:164,start:27.65,p:[628,273,566,273,566,224,524,224]}
  ];
  function svg(doc,tag,attrs){const el=doc.createElementNS(NS,tag);Object.entries(attrs||{}).forEach(([key,value])=>el.setAttribute(key,String(value)));return el;}
  function cubic(p,t){const u=1-t;return{x:u*u*u*p[0]+3*u*u*t*p[2]+3*u*t*t*p[4]+t*t*t*p[6],y:u*u*u*p[1]+3*u*u*t*p[3]+3*u*t*t*p[5]+t*t*t*p[7]};}
  function opacity(el,v){el.style.opacity=String(f(clamp(v)));}
  function install(doc){
    if(mounted.has(doc))return mounted.get(doc);
    const stage=doc.getElementById('stage');
    if(!stage)throw new Error('XelorOverview needs #stage.');
    const section=doc.createElement('section');section.id='overview-diagram';
    section.setAttribute('role','img');section.setAttribute('aria-label','XELOR is one place to run a factory. It connects customer orders, suppliers, stock, factory work, delivery and payments. Everyone sees the same order updates.');
    const lines=svg(doc,'svg',{viewBox:'0 0 1600 603',class:'ovd-connections','aria-hidden':'true'});section.appendChild(lines);
    const hubPulse=doc.createElement('div');hubPulse.className='ovd-pulse';section.appendChild(hubPulse);
    const hub=doc.createElement('div');hub.className='ovd-hub';hub.id='overview-hub';
    // The supplied logo's paths, gradient and proportions are preserved exactly.
    hub.innerHTML='<div class="ovd-lockup"><svg class="ovd-logo" id="overview-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="overview-logo-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a3456a"/><stop offset=".55" stop-color="#7a2945"/><stop offset="1" stop-color="#4e1730"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#overview-logo-gradient)"/><path d="M19 17 32 32 45 47" stroke="#f6ecdc" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M14 36 24 46 50 16" fill="none" stroke="#e2b54a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="ovd-wordmark">XELOR</div></div><p>One place to run<span>a factory.</span></p>';
    section.appendChild(hub);
    const parts=nodes.map((item,index)=>{
      const p=item.p,d=`M${p[0]} ${p[1]} C${p.slice(2).join(' ')}`;
      const base=svg(doc,'path',{class:'ovd-line-base',d,pathLength:1});
      const line=svg(doc,'path',{class:'ovd-line',d,pathLength:1});
      const dot=svg(doc,'circle',{class:'ovd-dot',r:5});lines.append(base,line,dot);
      const card=doc.createElement('article');card.className='ovd-node';card.id='overview-node-'+item.id;card.style.left=item.x+'px';card.style.top=item.y+'px';
      card.innerHTML=`<div class="ovd-icon" aria-hidden="true"><svg viewBox="0 0 28 28">${icon[item.id]}</svg></div><span class="ovd-step" aria-hidden="true">${index+1}</span><h2>${item.title}</h2><p>${item.body}</p>`;
      section.appendChild(card);return{...item,card,base,line,dot};
    });
    const shared=doc.createElement('div');shared.className='ovd-shared';shared.id='overview-shared';
    shared.innerHTML='<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M23 10a10 10 0 0 0-17-4L3 9M3 3v6h6M5 18a10 10 0 0 0 17 4l3-3M25 25v-6h-6"/></svg><strong>One shared order.</strong><span>Everyone sees the same updates.</span>';
    section.appendChild(shared);stage.appendChild(section);
    const logoPaths=[...hub.querySelectorAll('.ovd-logo path')];
    logoPaths.forEach(path=>{path.setAttribute('pathLength','1');path.setAttribute('stroke-dasharray','1');});
    function paint(t){
      const visible=Number.isFinite(t)&&t>=20&&t<35;
      section.style.display=visible?'block':'none';section.setAttribute('aria-hidden',String(!visible));
      if(!visible)return;
      section.dataset.filmTime=String(f(t));
      const exit=ease(phase(t,34.5,.5));opacity(section,1-exit);
      section.style.transform=`translate3d(${f(-8*exit)}px,0,0)`;
      const h=ease(phase(t,20.25,.8));opacity(hub,h);hub.style.transform=`translate3d(0,${f(12*(1-h))}px,0) scale(${f(.975+.025*h)})`;
      logoPaths.forEach((path,i)=>path.setAttribute('stroke-dashoffset',String(f(1-ease(phase(t,20.40+i*.36,.7))))));
      const pulseProgress=phase(t,t<28.9?20.5:29.2,1.7);
      opacity(hubPulse,Math.sin(Math.PI*pulseProgress)*.4);hubPulse.style.transform=`scale(${f(1+.065*pulseProgress)})`;
      parts.forEach((item,index)=>{
        const p=ease(phase(t,item.start,.5));opacity(item.card,p);item.card.style.transform=`translate3d(0,${f(10*(1-p))}px,0)`;
        const next=nodes[index+1]?.start??29.2;
        item.card.classList.toggle('is-speaking',t>=item.start&&t<next);
        item.card.classList.toggle('is-connected',t>=29.2);
        const stroke=ease(phase(t,item.start-.18,.68));
        item.base.style.opacity=String(f(stroke*.65));
        item.line.setAttribute('stroke-dasharray','1');item.line.setAttribute('stroke-dashoffset',String(f(1-stroke)));
        item.line.style.opacity=String(f(t>=29.2?.85:t<next?1:.55));
        // A node sends its update inward; the final shared update travels outward.
        const travelStart=t>=29.2?29.35+index*.1:item.start+.42;
        const travelDuration=t>=29.2?1.18:.84;
        const travel=phase(t,travelStart,travelDuration);
        const point=cubic(item.p,t>=29.2?travel:1-travel);
        item.dot.setAttribute('cx',String(f(point.x)));item.dot.setAttribute('cy',String(f(point.y)));
        item.dot.style.opacity=String(f(Math.sin(Math.PI*travel)*.96));
      });
      const s=ease(phase(t,29.2,.65));opacity(shared,s);shared.style.transform=`translate3d(0,${f(8*(1-s))}px,0)`;
    }
    const api={paint,start:20,end:35,duration:15};mounted.set(doc,api);paint(0);return api;
  }
  global.XelorOverview={install};
})(window);
