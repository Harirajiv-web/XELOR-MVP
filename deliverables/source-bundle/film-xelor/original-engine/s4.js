/* Deterministic XELOR film motion. Every position, opacity and stroke is a pure
 * function of film time. No timers, rAF loop, random values or Web Animations.
 * Product iframe content and business state are never modified.
 *
 * const M=XelorMotion.install(document);
 * M.scene({chapter,shot,start,end,chapterStart,core,flow,title},time);
 * M.focus(stageRect,{start:actionTime-.8,duration:3,label,kind:'circle'});
 * M.paint(time); // after the player's own paint()
 *
 * stageRect uses 1600x900 stage coordinates, NOT browser viewport coordinates.
 * scene() also paints. chapterStart is optional but recommended to avoid
 * replaying a chapter-heading entrance at each shot change. Call focus(null)
 * to clear a mark. A mark fades once, then holds still, then clears.
 */
(function(global){
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const mounted=new WeakMap();
  const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,v));
  const phase=(t,start,duration)=>clamp((t-start)/Math.max(.001,duration));
  const ease=v=>1-Math.pow(1-clamp(v),3);
  const smooth=v=>{v=clamp(v);return v*v*(3-2*v)};
  const fixed=v=>Number(v.toFixed(3));
  const op=(node,value)=>{if(node)node.style.opacity=String(fixed(clamp(value)))};
  function svg(doc,tag,attrs={}){const n=doc.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;}
  function visible(w,el){return !!el && w.getComputedStyle(el).display!=='none';}
  function enter(node,t,start,duration,x=0,y=10){
    if(!node)return;
    const p=ease(phase(t,start,duration));op(node,p);
    node.style.transform=`translate3d(${fixed(x*(1-p))}px,${fixed(y*(1-p))}px,0)`;
  }
  function pathStroke(node,progress){node.setAttribute('stroke-dasharray','1');node.setAttribute('stroke-dashoffset',String(fixed(1-clamp(progress))));}

  function install(doc){
    if(mounted.has(doc))return mounted.get(doc);
    const stage=doc.getElementById('stage');
    if(!stage)throw new Error('XelorMotion needs the film #stage.');
    const w=doc.defaultView;
    const layer=svg(doc,'svg',{viewBox:'0 0 1600 900',class:'mfx-layer','aria-hidden':'true'});
    const defs=svg(doc,'defs');
    const clip=svg(doc,'clipPath',{id:'mfx-safe-stage'});
    clip.appendChild(svg(doc,'rect',{x:0,y:96,width:1600,height:712}));defs.appendChild(clip);
    const arrow=svg(doc,'marker',{id:'mfx-ink-arrow',viewBox:'0 0 10 10',refX:8,refY:5,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'});
    arrow.appendChild(svg(doc,'path',{d:'M 1 1 L 8 5 L 1 9',stroke:'#a9896f','stroke-width':1.6,fill:'none'}));defs.appendChild(arrow);layer.appendChild(defs);
    const ink=svg(doc,'g',{'clip-path':'url(#mfx-safe-stage)'});layer.appendChild(ink);
    const introGroup=svg(doc,'g');ink.appendChild(introGroup);
    const connectors=[0,1].map(()=>{
      const path=svg(doc,'path',{class:'mfx-connector',pathLength:1,'marker-end':'url(#mfx-ink-arrow)'});
      const dot=svg(doc,'circle',{class:'mfx-connector-dot',r:4});introGroup.append(path,dot);return{path,dot};
    });
    const titleRule=svg(doc,'path',{class:'mfx-title-rule',d:'M 52 180 L 178 180',pathLength:1});ink.appendChild(titleRule);
    const flowGroup=svg(doc,'g');ink.appendChild(flowGroup);
    const rail=svg(doc,'path',{class:'mfx-rail-base'}),progress=svg(doc,'path',{class:'mfx-rail-progress',pathLength:1}),pulse=svg(doc,'circle',{class:'mfx-success-pulse'});
    flowGroup.append(rail,progress,pulse);
    const focusGroup=svg(doc,'g');ink.appendChild(focusGroup);
    const glow=svg(doc,'path',{class:'mfx-focus-glow',pathLength:1}),focusLine=svg(doc,'path',{class:'mfx-focus-line',pathLength:1}),echo=svg(doc,'path',{class:'mfx-focus-echo',pathLength:1});
    focusGroup.append(glow,focusLine,echo);stage.appendChild(layer);
    const nodes={eyebrow:doc.getElementById('eyebrow'),headline:doc.getElementById('headline'),role:doc.getElementById('role'),callout:doc.getElementById('callout-title'),body:doc.getElementById('callout-body'),detail:doc.getElementById('phone-detail'),introOne:doc.getElementById('intro-one'),introTwo:doc.getElementById('intro-two'),closing:doc.getElementById('closing')};
    let current={chapter:0,shot:-1,start:0,end:10,chapterStart:0,core:false,flow:null,title:''};
    let focusCue=null;
    let lastSceneKey='';

    function stageRect(el){
      const r=el.getBoundingClientRect(),base=stage.getBoundingClientRect();
      const sx=base.width/1600 || 1,sy=base.height/900 || 1;
      return{x:(r.left-base.left)/sx,y:(r.top-base.top)/sy,width:r.width/sx,height:r.height/sy,
        right:(r.right-base.left)/sx,bottom:(r.bottom-base.top)/sy};
    }
    function logo(id,t,start,duration=1.8,scale=false){
      const el=doc.getElementById(id);if(!el)return;
      const p=ease(phase(t,start,.42));op(el,p);
      if(scale)el.style.transform=`scale(${fixed(.92+.08*ease(phase(t,start,.9)))})`;
      const paths=[...el.querySelectorAll('path')];
      paths.forEach((path,i)=>{path.setAttribute('pathLength','1');pathStroke(path,ease(phase(t,start+.12+i*.44,Math.min(.8,duration-.55))));});
    }
    function scene(info,time){
      const next={...current,...info,chapterStart:info.chapterStart??info.start??current.chapterStart};
      const key=String(next.chapter)+'/'+String(next.shot)+'/'+String(next.start);
      if(key!==lastSceneKey){
        // A freshly prepared focus may arrive immediately before scene().
        // Preserve it if its authored timestamp belongs to this new shot.
        if(focusCue&&(focusCue.start<Number(next.start)-.95||focusCue.start>=Number(next.end)))focusCue=null;
        lastSceneKey=key;
      }
      current=next;
      if(Number.isFinite(time))paint(time);
      return api;
    }
    function focus(rect,options={}){
      if(!rect){focusCue=null;focusGroup.style.display='none';return api;}
      const r={x:Number(rect.x??rect.left),y:Number(rect.y??rect.top),width:Number(rect.width),height:Number(rect.height)};
      if(![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.width<=0||r.height<=0){focusCue=null;return api;}
      focusCue={rect:r,start:Number(options.start??current.start),duration:Math.max(.8,Number(options.duration??3.2)),kind:options.kind==='underline'?'underline':'circle',label:options.label||''};
      focusGroup.setAttribute('aria-label',focusCue.label);
      return api;
    }
    function paintIntro(t){
      const show=visible(w,nodes.introOne),impact=visible(w,nodes.introTwo);
      introGroup.style.display=show?'':'none';
      if(show){
        const start=Number(current.chapterStart??current.start),span=Math.max(7,Number(current.end)-start);
        const fragments=[...nodes.introOne.querySelectorAll('.fragment')];
        fragments.forEach((el,i)=>{
          const at=start+span*[.025,.29,.56][i],p=ease(phase(t,at,.72));
          const tilt=parseFloat(w.getComputedStyle(el).getPropertyValue('--tilt'))||0;
          op(el,p);el.style.transform=`translate3d(${fixed((i%2?24:-18)*(1-p))}px,${fixed(20*(1-p))}px,0) rotate(${fixed(tilt+(i%2?3:-3)*(1-p))}deg)`;
        });
        enter(nodes.introOne.querySelector('.kicker'),t,start,.42,0,8);
        enter(nodes.introOne.querySelector('h1'),t,start+.12,.66,0,17);
        enter(nodes.introOne.querySelector('.intro-left p'),t,start+.32,.65,0,12);
        connectors.forEach(({path,dot},i)=>{
          if(!fragments[i]||!fragments[i+1])return;
          const first=stageRect(fragments[i]),second=stageRect(fragments[i+1]);
          const x1=first.right+7,y1=first.y+first.height*.71,x2=second.right+7,y2=second.y+second.height*.39;
          const bend=Math.min(1562,Math.max(first.right,second.right)+45);
          path.setAttribute('d',`M ${fixed(x1)} ${fixed(y1)} C ${fixed(bend)} ${fixed(y1)}, ${fixed(bend)} ${fixed(y2)}, ${fixed(x2)} ${fixed(y2)}`);
          const at=start+span*[.34,.61][i],draw=smooth(phase(t,at,1.15));
          pathStroke(path,draw);op(path,draw>0?.7:0);
          path.setAttribute('marker-end',draw>.97?'url(#mfx-ink-arrow)':'none');
          if(draw>0&&draw<1){const p=path.getPointAtLength(path.getTotalLength()*draw);dot.setAttribute('cx',p.x);dot.setAttribute('cy',p.y);op(dot,.9);}else op(dot,0);
        });
      }
      if(impact){
        const start=Number(current.chapterStart??current.start),span=Math.max(6,Number(current.end)-start);
        enter(nodes.introTwo.querySelector('.kicker'),t,start,.4,0,8);
        enter(nodes.introTwo.querySelector('h1'),t,start+.12,.7,0,15);
        [...nodes.introTwo.querySelectorAll('.risk')].forEach((el,i)=>enter(el,t,start+.65+i*span*.22,.62,0,22));
      }
      return show||impact;
    }
    function paintFlow(t){
      const steps=[...doc.querySelectorAll('#flow .flow-step')];
      const show=current.core&&steps.length>1&&Number.isFinite(Number(current.flow));
      flowGroup.style.display=show?'':'none';if(!show)return;
      const rects=steps.map(stageRect),centres=rects.map(r=>r.x+12.5),y=803;
      rail.setAttribute('d',`M ${fixed(centres[0])} ${y} L ${fixed(centres.at(-1))} ${y}`);
      progress.setAttribute('d',rail.getAttribute('d'));
      const idx=clamp(Number(current.flow),0,steps.length),previous=clamp(idx-1,0,steps.length-1),dest=clamp(idx,0,steps.length-1);
      const p=ease(phase(t,current.start,.7));
      const length=centres.at(-1)-centres[0];
      const fraction=(centres[previous]-centres[0]+(centres[dest]-centres[previous])*p)/Math.max(1,length);
      pathStroke(progress,idx===0?0:fraction);
      if(idx>0){const age=t-current.start,r=rects[previous],pulseP=phase(t,current.start+.1,.75);
        pulse.setAttribute('cx',fixed(centres[previous]));pulse.setAttribute('cy',fixed(r.y+r.height/2));pulse.setAttribute('r',fixed(13+10*pulseP));
        op(pulse,age>=.1&&age<.85?.5*(1-pulseP):0);
      }else op(pulse,0);
    }
    function paintFocus(t){
      const c=focusCue,closing=visible(w,nodes.closing);
      if(!c||closing||t<c.start||t>=c.start+c.duration){focusGroup.style.display='none';return;}
      focusGroup.style.display='';
      const age=t-c.start,draw=ease(phase(t,c.start,.52)),fade=1-smooth(phase(t,c.start+c.duration-.38,.38));
      const r=c.rect,x=r.x+r.width/2,y=r.y+r.height/2;
      const rx=r.width/2+12,ry=r.height/2+10;
      let d;
      if(c.kind==='underline'){
        d=`M ${fixed(r.x-3)} ${fixed(r.y+r.height+7)} Q ${fixed(x)} ${fixed(r.y+r.height+11)} ${fixed(r.x+r.width+4)} ${fixed(r.y+r.height+6)}`;
      }else{
        // Unequal cubic handles reproduce a single quick pen oval, not a
        // perfect computer ellipse. Geometry stays identical on every seek.
        d=`M ${fixed(x+rx)} ${fixed(y-2)} C ${fixed(x+rx+3)} ${fixed(y+ry*.63)},${fixed(x+rx*.53)} ${fixed(y+ry+3)},${fixed(x-2)} ${fixed(y+ry)} C ${fixed(x-rx*.62)} ${fixed(y+ry-1)},${fixed(x-rx-2)} ${fixed(y+ry*.48)},${fixed(x-rx)} ${fixed(y-1)} C ${fixed(x-rx+2)} ${fixed(y-ry*.67)},${fixed(x-rx*.47)} ${fixed(y-ry-2)},${fixed(x+2)} ${fixed(y-ry)} C ${fixed(x+rx*.64)} ${fixed(y-ry+1)},${fixed(x+rx+2)} ${fixed(y-ry*.49)},${fixed(x+rx)} ${fixed(y+4)}`;
      }
      [focusLine,glow,echo].forEach(n=>n.setAttribute('d',d));
      pathStroke(focusLine,draw);pathStroke(glow,draw);pathStroke(echo,draw);
      echo.setAttribute('transform',c.kind==='underline'?'translate(0 2)':'translate(2 -1)');
      echo.setAttribute('stroke-dasharray',c.kind==='underline'?'0.2 0.8':'0.14 0.86');
      echo.setAttribute('stroke-dashoffset',String(fixed(1-draw)));
      op(focusGroup,fade);op(glow,.045+.055*(1-ease(phase(age,0,.7))));
    }
    function paint(t){
      if(!Number.isFinite(t))return;
      logo('brand-logo',t,0);logo('opening-logo',t,0);
      const intro=paintIntro(t),closing=visible(w,nodes.closing);
      titleRule.style.display=intro||closing?'none':'';
      flowGroup.style.display=intro||closing?'none':'';
      if(!intro&&!closing){
        const titleStart=Number(current.chapterStart??current.start);
        enter(nodes.eyebrow,t,titleStart,.38,0,7);enter(nodes.headline,t,titleStart+.07,.55,0,12);
        pathStroke(titleRule,ease(phase(t,titleStart+.2,.75)));
        enter(nodes.role,t,current.start+.03,.35,9,0);
        enter(nodes.callout,t,current.start+.09,.5,13,0);
        enter(nodes.body,t,current.start+.16,.5,9,0);
        [...doc.querySelectorAll('#features .feature')].forEach((el,i)=>enter(el,t,current.start+.23+i*.055,.46,9,0));
        if(nodes.detail&&!nodes.detail.hidden)enter(nodes.detail,t,current.start+.14,.55,-9,0);
        paintFlow(t);
      }
      if(closing){
        const start=Number(current.chapterStart??current.start);
        logo('closing-logo',t,start,1.8,true);
        enter(nodes.closing.querySelector('.wordmark,.logo'),t,start+.16,.75,0,14);
        enter(nodes.closing.querySelector('h2'),t,start+.4,.7,0,10);
        enter(nodes.closing.querySelector('.path'),t,start+.7,.7,0,7);
      }
      paintFocus(t);
      return api;
    }
    function dispose(){layer.remove();mounted.delete(doc);}
    const api=Object.freeze({scene,focus,paint,dispose,element:layer});
    mounted.set(doc,api);return api;
  }
  global.XelorMotion=Object.freeze({install});
  if(typeof module!=='undefined'&&module.exports)module.exports=global.XelorMotion;
})(typeof window!=='undefined'?window:globalThis);
