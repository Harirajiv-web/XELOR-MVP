/* A readable inset of the actual phone UI. This never changes the product.
 * Call after a shot/action/input change, not on every animation frame.
 * draw(frameWindow, targetName) returns an inert, self-styled parent DOM node,
 * or null for desktop/tablet shots. Content is cloned from the current DOM.
 */
(function(global){
  'use strict';
  const SKIP = new Set(['SCRIPT','STYLE','LINK','IFRAME','OBJECT','EMBED']);
  const selector = (w, value) => (global.XelorDemoDirector?.actions[value] || value);
  const one = (doc,s) => doc.querySelector(s);
  const list = (doc,s) => [...doc.querySelectorAll(s)];
  function unique(nodes){return [...new Set(nodes.filter(Boolean))];}

  function pick(w,targetName){
    const doc=w.document;
    if(!one(doc,'#frame.phone'))return null;
    const screen=w.eval('ui.scr[ui.role]');
    let target=null;
    if(targetName){try{target=one(doc,selector(w,targetName));}catch(_){}}
    let nodes=[];
    if(screen==='s.quote'){
      // These are the real current field values, including partial typing.
      nodes=unique([
        one(doc,'label[for="qUnit"]'),one(doc,'#qUnit')?.parentElement,
        one(doc,'label[for="qDate"]'),one(doc,'#qDate'),
        one(doc,'label[for="qFreight"]'),one(doc,'#qFreight')?.parentElement,
        one(doc,'.qtotal')
      ]);
    }else if(screen==='w.po'){
      nodes=list(doc,'#vp .scr > .card').slice(0,2);
      const approve=one(doc,'#vp [data-a="approve"]');
      if(approve)nodes.push(approve);
    }else if(screen==='m.wo'){
      const tests=one(doc,'#vp [data-a="test"]')?.closest('.card');
      const focused=target?.closest('.card');
      const done=one(doc,'#vp .scr > .center');
      nodes=unique([done,focused || tests || one(doc,'#vp .scr > .card')]);
      if(target?.matches('[data-a="finalTest"]'))nodes.push(target);
    }else if(screen==='s.gram'){
      nodes=one(doc,'#vp .scr > .card.ok')?unique([one(doc,'#vp .scr > .card.ok'),one(doc,'#vp .shares'),one(doc,'#vp .gpost header'),one(doc,'#vp .gtx')]):unique([one(doc,'#vp .seg.lang'),one(doc,'#vp .gpost header'),one(doc,'#vp .gtx'),one(doc,'#vp [data-a="gramPost"]')]);
    }else{
      nodes=unique([target?.closest('.card,.hero,.xp-task,.act,.feedline') || one(doc,'#vp .scr > .card,#vp .scr > .hero')]);
    }
    if(!nodes.length)return null;
    return {screen,nodes,target,title:one(doc,'#vp .abar .tt')?.childNodes[0]?.textContent?.trim() || 'Phone view'};
  }

  function clone(source,doc,w,tgt){
    if(source.nodeType===3)return doc.createTextNode(source.textContent);
    if(source.nodeType!==1 || SKIP.has(source.tagName))return null;
    const node=source.namespaceURI==='http://www.w3.org/2000/svg'
      ?doc.createElementNS(source.namespaceURI,source.localName):doc.createElement(source.localName);
    for(const attr of source.attributes){
      const name=attr.name.toLowerCase();
      if(name==='id'||name==='name'||name==='for'||name==='class'||name==='style'||name==='tabindex'||name.startsWith('on')||name.startsWith('data-')||name==='href'||name==='target'||name==='action')continue;
      node.setAttribute(attr.name,attr.value);
    }
    if(tgt&&source===tgt)node.setAttribute('xfilm-tap','');
    const style=w.getComputedStyle(source);
    // Fixed computed geometry preserves the real card. The source phone is
    // transformed to fit; computed styles retain its unscaled, readable size.
    for(const name of style){
      if(name.startsWith('--')||name.startsWith('animation')||name.startsWith('transition')||name==='cursor'||name==='pointer-events'||name==='transform'||name==='transform-origin'||name==='content')continue;
      try{node.style.setProperty(name,style.getPropertyValue(name));}catch(_){}
    }
    node.style.setProperty('animation','none','important');
    node.style.setProperty('transition','none','important');
    node.style.setProperty('pointer-events','none','important');
    node.style.setProperty('caret-color','transparent','important');
    if(source instanceof w.HTMLInputElement){
      node.value=source.value;node.setAttribute('value',source.value);node.readOnly=true;
    }
    if(source instanceof w.HTMLTextAreaElement){node.value=source.value;node.readOnly=true;}
    if(source instanceof w.HTMLButtonElement)node.tabIndex=-1;
    for(const child of source.childNodes){const copied=clone(child,doc,w,tgt);if(copied)node.appendChild(copied);}
    return node;
  }

  function draw(w,targetName,options={}){
    const chosen=pick(w,targetName);if(!chosen)return null;
    const doc=options.document || global.document;
    const host=doc.createElement('div');
    host.setAttribute('aria-hidden','true');host.inert=true;
    host.style.cssText='display:block;width:100%;pointer-events:none;contain:layout style;';
    const shadow=host.attachShadow({mode:'open'});
    const wrap=doc.createElement('div');
    wrap.style.cssText='all:initial;display:block;box-sizing:border-box;background:#fffdfb;border:1px solid #d2beb3;border-radius:16px;padding:16px;box-shadow:0 12px 38px #513b2516;overflow:hidden;font-family:"Source Sans 3",Arial,sans-serif;';
    const label=doc.createElement('div');
    label.textContent=chosen.title;
    label.style.cssText='display:block;margin:0 0 13px;color:#764354;font:700 13px/1.3 "Source Sans 3",Arial,sans-serif;letter-spacing:.8px;text-transform:uppercase;';
    wrap.appendChild(label);
    const viewport=doc.createElement('div');
    viewport.style.cssText=`display:block;position:relative;overflow:hidden;max-height:${Number(options.maxHeight || 360)}px;`;
    const stack=doc.createElement('div');
    stack.style.cssText='display:flex;flex-direction:column;gap:10px;position:relative;align-items:stretch;';
    const rootWidth=Math.max(...chosen.nodes.map(n=>parseFloat(w.getComputedStyle(n).width)||0),340);
    // The inset is designed for a 390–420 px host (phone cards are ~374 px).
    // A narrower host proportionately scales content instead of clipping it.
    const width=Number(options.width || 406)-34;
    const sourceHeight=chosen.nodes.reduce((sum,node)=>sum+(parseFloat(w.getComputedStyle(node).height)||node.offsetHeight||0),0)+(chosen.nodes.length-1)*10;
    const scale=Math.min(Number(options.maxScale || 1),width/rootWidth,Number(options.maxHeight || 360)/Math.max(1,sourceHeight));
    stack.style.width=rootWidth+'px';stack.style.zoom=String(scale);
    stack.style.margin='0 auto';
    for(const source of chosen.nodes){
      const copied=clone(source,doc,w,chosen.target);if(!copied)continue;
      copied.style.setProperty('position','relative','important');
      copied.style.setProperty('inset','auto','important');
      copied.style.setProperty('margin','0','important');
      copied.style.setProperty('transform','none','important');
      copied.style.setProperty('flex','0 0 auto','important');
      copied.style.setProperty('max-width','100%','important');
      if(source.matches('button,input,label,.money,.qtotal,.gproof')){
        copied.style.setProperty('width','100%','important');
        copied.style.setProperty('box-sizing','border-box','important');
      }
      stack.appendChild(copied);
    }
    viewport.appendChild(stack);wrap.appendChild(viewport);shadow.appendChild(wrap);
    host.dataset.phoneDetailScreen=chosen.screen;
    return host;
  }

  function update(w,container,targetName,options={}){
    const detail=draw(w,targetName,{...options,document:container.ownerDocument,width:options.width || container.clientWidth || 406});
    container.replaceChildren(...(detail?[detail]:[]));
    container.hidden=!detail;
    return detail;
  }
  global.XelorPhoneDetail=Object.freeze({draw,update});
  if(typeof module!=='undefined'&&module.exports)module.exports=global.XelorPhoneDetail;
})(typeof window!=='undefined'?window:globalThis);
