/* XELOR film adapter: presentation and navigation only.
 * The product remains an unmodified, same-origin srcdoc document. Seeking uses
 * the demo's own fresh()/ensureUpTo()/render() APIs. Visible actions use its
 * existing DOM handlers. No order, quote, stock or accounting rule is replaced.
 * Coordinates returned by bounds() are in iframe viewport CSS pixels.
 */
(function (global) {
  'use strict';
  const mounted = new WeakMap();
  const q = JSON.stringify;
  const action = (name, extra = '') => `[data-a="${name}"]${extra}`;
  const ACTIONS = Object.freeze({
    confirmOrder: action('confirmOrder'), checkMaterials: action('runPlan'),
    sendRequest: action('sendRfq'), fillQuote: action('fill'),
    quotePrice: '#qUnit', quoteDate: '#qDate', quoteFreight: '#qFreight',
    sendQuote: action('send-quote'), award: action('award', '[data-id="ganesh"]'),
    approve: action('approve'), truck: action('truck'), scan: action('scan'),
    passInspection: action('inspect', '[data-res="pass"]'), release: action('release'),
    recordOutput: action('output'), test0: action('test', '[data-i="0"]'),
    test1: action('test', '[data-i="1"]'), test2: action('test', '[data-i="2"]'),
    test3: action('test', '[data-i="3"]'), finalTest: action('finalTest'),
    dispatch: action('dispatch'), irn: action('irn'), closeOrder: action('close'),
    invoiceFinance: action('treds'), invite: action('invite', '[data-id="veera"]'),
    sharePassport: action('share'), machineHelp: action('machineDown'),
    callTechnician: action('call-pro', '[data-id="sai"]'),
    confirmRepair: action('job-done', '[data-id="sai"]'),
    reviewRepair: action('review', '[data-id="sai"]'),
    buyerInterest: action('interest'), postRequest: action('myReq'),
    approvePost: action('gramPost'), postEnglish: action('glang', '[data-id="en"]'),
    sharePost: action('gram-share', '[data-id="WhatsApp Status"]'),
    postQuote: action('rfq-post', '[data-id="nandi"]'),
    publishFactoryPost: action('kpost'), marketMachining: action('mcat', '[data-id="machining"]'),
    marketAll: action('mcat', '[data-id="all"]'),
    hideCustomers: action('vis', '[data-k="customers"][data-v="private"]'),
    shareCapacity: action('vis', '[data-k="capacity"][data-v="buyers"]'),
    freePlan: action('plan', '[data-id="free"]'), verifiedPlan: action('plan', '[data-id="verified"]')
  });
  const STEPS = Object.freeze([
    {screen:'p.sales', actions:['confirmOrder']},
    {screen:'p.plan', actions:['checkMaterials']},
    {screen:'p.net', actions:['sendRequest']},
    {screen:'s.quote', actions:['fillQuote','sendQuote']},
    {screen:'p.net', actions:['award']},
    {screen:'w.po', actions:['approve']},
    {screen:'t.gate', actions:['truck','scan']},
    {screen:'t.qc', actions:['passInspection']},
    {screen:'m.wo', actions:['release']},
    {screen:'m.wo', actions:['recordOutput','test0','test1','test2','test3','finalTest']},
    {screen:'a.dispatch', actions:['dispatch']},
    {screen:'a.dispatch', actions:['irn']},
    {screen:'a.books', actions:['closeOrder']},
    {screen:'a.books', actions:['invoiceFinance']},
    {screen:'p.rec', actions:['invite']},
    {screen:'p.pass', actions:['sharePassport']},
    {screen:'k.help', actions:['machineHelp','callTechnician']},
    {screen:'k.req', actions:['buyerInterest']},
    {screen:'s.gram', actions:['postEnglish','approvePost']},
    {screen:'k.gram', actions:['postQuote']}
  ]);
  const CINEMA_CSS = `
html[data-xelor-film],html[data-xelor-film] body{width:100%!important;height:100%!important;min-height:0!important;margin:0!important;overflow:hidden!important;background:transparent!important;scroll-behavior:auto!important}
html[data-xelor-film] body>.top,html[data-xelor-film] #tour,html[data-xelor-film] .rail,html[data-xelor-film] .stagecap,html[data-xelor-film] #toasts,html[data-xelor-film] #overlay{display:none!important}
html[data-xelor-film] .shell,html[data-xelor-film] #proto,html[data-xelor-film] .stagegrid,html[data-xelor-film] .stage{position:relative!important;display:block!important;width:100%!important;max-width:none!important;height:100%!important;min-height:0!important;margin:0!important;padding:0!important;gap:0!important;overflow:visible!important}
html[data-xelor-film] #frame{position:absolute!important;left:50%!important;top:50%!important;width:var(--film-native-w)!important;height:var(--film-native-h)!important;max-width:none!important;max-height:none!important;box-sizing:border-box!important;transform:translate(-50%,-50%) scale(var(--film-scale))!important;transform-origin:center center!important;transition:none!important;flex:none!important}
html[data-xelor-film] #frame.laptop,html[data-xelor-film] #frame.tablet{display:flex!important;flex-direction:column!important;padding:10px!important}
html[data-xelor-film] #frame.laptop .chrome,html[data-xelor-film] #frame.tablet .chrome{flex:0 0 40px!important;height:40px!important;min-height:40px!important;box-sizing:border-box!important}
html[data-xelor-film] #frame.laptop #vp,html[data-xelor-film] #frame.tablet #vp{width:100%!important;height:auto!important;flex:1 1 auto!important;min-height:0!important}
html[data-xelor-film] .pwrap,html[data-xelor-film] .pmain,html[data-xelor-film] .abody{min-height:0!important;scroll-behavior:auto!important}
html[data-xelor-film] .pmain,html[data-xelor-film] .abody{overscroll-behavior:contain;scrollbar-width:none}
html[data-xelor-film] .pmain::-webkit-scrollbar,html[data-xelor-film] .abody::-webkit-scrollbar{display:none}
html[data-xelor-film] *,html[data-xelor-film] *:before,html[data-xelor-film] *:after{animation:none!important;transition:none!important;caret-color:transparent!important}
html[data-xelor-film] .enter,html[data-xelor-film] .stg,html[data-xelor-film] .push,html[data-xelor-film] .pop{opacity:1!important;transform:none!important}
html[data-xelor-film="app"] #frame{padding:0!important;border:0!important;border-radius:14px!important;background:transparent!important;box-shadow:none!important}
html[data-xelor-film="app"] #frame>.chrome,html[data-xelor-film="app"] #frame>.island,html[data-xelor-film="app"] #frame>.hw{display:none!important}
html[data-xelor-film="app"] #frame #vp{width:100%!important;height:100%!important;border-radius:14px!important;box-shadow:none!important;flex:1 1 auto!important}
html[data-xelor-film] #frame.laptop,html[data-xelor-film] #frame.tablet{padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
html[data-xelor-film] #frame.laptop>.chrome,html[data-xelor-film] #frame.tablet>.chrome{display:none!important}
html[data-xelor-film] #frame.laptop #vp,html[data-xelor-film] #frame.tablet #vp{border-radius:0!important;box-shadow:none!important;height:100%!important}
html[data-xelor-film] .pvbar,html[data-xelor-film] [data-film-omit]{display:none!important}
html[data-xelor-film] [data-a="fill"]{display:none!important}
`;

  // Film-only presentation labels. The source document, state and actions are
  // unchanged; the player never implies a public deployment or a live provider.
  function localUrl(w) {
    const route=w.eval('SCREENS[ui.scr[ui.role]].route') || '/workspace';
    return 'localhost:3000'+route.replace(':token','q-ganesh').replace(':id','current');
  }
  function present(w) {
    const root=w.document.querySelector('#vp'); if(!root)return;
    for(const node of root.querySelectorAll('.sysnote,.note')) {
      if(/In this demo messages|Demo: agent steps|Transcribed in this demo/i.test(node.textContent))node.dataset.filmOmit='';
    }
    for(const badge of root.querySelectorAll('.pill')) {
      if(/^Being built$/i.test(badge.textContent.trim()))badge.dataset.filmOmit='';
    }
    const walker=w.document.createTreeWalker(root,w.NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())) {
      if(node.parentElement?.closest('script,style'))continue;
      let text=node.nodeValue;
      text=text.replace('Provider names are demonstration data.','')
        .replace(/Demonstration data\.?/gi,'')
        .replace(/Plain-language summaries for the demo\./g,'Plain-language scheme summaries.')
        .replace(/Skip to the day they arrive; the demo moves its calendar forward\./g,'The delivery is linked to the purchase order.')
        .replace(/Skip to (.*): the truck is at the gate/g,'Record arrival on $1')
        .replace(/Simulated reply/gi,'Supplier reply')
        .replace(/Simulated GST provider/gi,'GST filing')
        .replace(/Simulated in this demo · no GST provider connected/gi,'GST filing record')
        .replace(/\bsimulated\b/gi,'Illustrative')
        .replace(/\bprototype\b/gi,'workspace')
        .replace(/interactive HTML/gi,'product workspace')
        .replace(/\bdemo\b/gi,'workspace');
      if(text!==node.nodeValue)node.nodeValue=text;
    }
    const addr=w.document.getElementById('addr');if(addr)addr.textContent=localUrl(w);
  }

  function assertWindow(w) {
    if (!w || !w.document || !w.document.querySelector('#vp')) throw new Error('XELOR demo iframe is not ready or is not same-origin.');
    return w;
  }
  const frame = w => new Promise(resolve => w.requestAnimationFrame(() => resolve()));
  const wait = (w, ms) => new Promise(resolve => w.setTimeout(resolve, ms));
  function install(w, options = {}) {
    assertWindow(w);
    let meta = mounted.get(w);
    if (!meta) {
      const style = w.document.createElement('style');
      style.id = 'xelor-film-presentation'; style.textContent = CINEMA_CSS;
      w.document.head.appendChild(style);
      const originalMatchMedia = w.matchMedia.bind(w);
      // Film playback has its own motion/cursor. Ask the demo to render settled
      // counters and its existing reduced-motion dispatch completion (50 ms).
      const media = w.matchMedia;
      w.matchMedia = function(query) {
        const real = originalMatchMedia(query);
        if (query !== '(prefers-reduced-motion: reduce)') return real;
        return {matches:true,media:query,onchange:null,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true;}};
      };
      meta = {style, media, options:{}, scale:1, nativeWidth:1200,nativeHeight:760};
      mounted.set(w, meta);
      meta.resize = () => fit(w);
      w.addEventListener('resize', meta.resize);
    }
    Object.assign(meta.options, options);
    w.document.documentElement.dataset.xelorFilm = meta.options.surface === 'app' ? 'app' : 'device';
    w.document.documentElement.dataset.theme = meta.options.theme || 'light';
    return fit(w);
  }
  function fit(w) {
    const meta = mounted.get(w); if (!meta) return null;
    const el = w.document.querySelector('#frame'); if (!el) return null;
    const phone = el.classList.contains('phone'), tablet = el.classList.contains('tablet');
    const app = meta.options.surface === 'app';
    const nativeWidth = phone ? (app ? 402 : 426) : w.innerWidth;
    const nativeHeight = phone ? (app ? 874 : 898) : w.innerHeight;
    const padding = Number(meta.options.padding ?? 12);
    const scale = Math.max(0.05, Math.min((w.innerWidth - padding * 2) / nativeWidth, (w.innerHeight - padding * 2) / nativeHeight, Number(meta.options.maxScale || 1)));
    meta.scale = scale; meta.nativeWidth = nativeWidth; meta.nativeHeight = nativeHeight;
    const style = w.document.documentElement.style;
    style.setProperty('--film-native-w', nativeWidth + 'px');
    style.setProperty('--film-native-h', nativeHeight + 'px');
    style.setProperty('--film-scale', String(scale));
    present(w);
    return {device:phone?'phone':tablet?'tablet':'laptop',nativeWidth,nativeHeight,scale,viewportWidth:w.innerWidth,viewportHeight:w.innerHeight};
  }

  /** Prepare state before a tour step (0..19); step:20 means completed loop.
   * reset:true (default) rebuilds on seek. reset:false navigates ongoing work.
   * completed:true includes the selected step. screen overrides its screen.
   * screen-only cues default to fresh data, so use step when data is needed.
   * A captured snapshot can be supplied in cue.snapshot to restore exact state.
   */
  async function prepareDemo(w, cue = {}) {
    install(w, cue);
    const rawStep = Number(cue.step ?? 0);
    const step = Math.max(0, Math.min(20, Number.isFinite(rawStep) ? Math.floor(rawStep) : 0));
    const completed = cue.completed === true;
    const target = cue.screen || STEPS[Math.min(step,19)].screen;
    const source = `(() => {
      if (!SCREENS[${q(target)}]) throw new Error('Unknown film screen: '+${q(target)});
      TIMERS.forEach(clearTimeout); TIMERS=[];
      const previousQuiet=QUIET; QUIET=true;
      try {
        ${cue.snapshot ? `S=${q(cue.snapshot.state)};ui=Object.assign(UI0(),${q(cue.snapshot.ui || {})});` : cue.reset === false ? '' : 'S=fresh();ui=UI0();'}
        ${cue.snapshot || cue.reset === false ? '' : `ensureUpTo(${Math.min(20, step + (completed ? 1 : 0))});`}
        ${step < 20 && !completed ? `if(TOUR[${step}].enter)TOUR[${step}].enter();` : ''}
        TIMERS.forEach(clearTimeout);TIMERS=[];
        const sc=SCREENS[${q(target)}];
        setRole(sc.role,true,false);ui.tour=-1;ui.scr[sc.role]=sc.id;
        ui.navDir=null;ui.lastScr=null;ui.lastRole=null;
        if(PHONE_ROLES.includes(sc.role))ui.hist[sc.role]=[];
        ${cue.device ? `ui.dev=${q(cue.device)};` : ''}
        document.querySelector('#overlay').innerHTML='';
        document.querySelector('#toasts').innerHTML='';
        render();
        TIMERS.forEach(clearTimeout);TIMERS=[];
      } finally {QUIET=previousQuiet;}
      return {screen:ui.scr[ui.role],role:ui.role,device:ui.dev,tourDone:TOUR.map(s=>s.done())};
    })()`;
    const info = w.eval(source);
    fit(w); await frame(w); await frame(w);
    const scroller = w.document.querySelector('#vp .pmain,#vp .abody');
    if (scroller) scroller.scrollTop = Number(cue.scrollTop || 0);
    return Object.assign(info, {camera:fit(w)});
  }

  async function navigate(w, screen, options = {}) {
    assertWindow(w);
    w.eval(`go(${q(screen)})`);
    fit(w); await frame(w);
    if (options.scrollTop != null) {
      const sc = w.document.querySelector('#vp .pmain,#vp .abody'); if (sc) sc.scrollTop = Number(options.scrollTop);
    }
    return snapshot(w, false);
  }
  function selector(name) { return ACTIONS[name] || name; }
  function target(w, name) {
    const sel = selector(name), root = w.document.querySelector('#vp');
    return [...root.querySelectorAll(sel)].find(el => el.getClientRects().length && w.getComputedStyle(el).visibility !== 'hidden') || null;
  }
  async function bounds(w, name, options = {}) {
    assertWindow(w); fit(w);
    let el = target(w, name); if (!el) return null;
    if (options.scroll !== false) {
      const sc = el.closest('.pmain,.abody');
      if (sc) {
        const rect = el.getBoundingClientRect(), box = sc.getBoundingClientRect();
        const scale = mounted.get(w)?.scale || 1, pad = 16 * scale;
        let delta = 0;
        if (options.align === 'center') delta = (rect.top + rect.bottom - box.top - box.bottom) / 2;
        else if (rect.top < box.top + pad) delta = rect.top - box.top - pad;
        else if (rect.bottom > box.bottom - pad) delta = rect.bottom - box.bottom + pad;
        if (Math.abs(delta) > 1) sc.scrollTop += delta / scale;
        await frame(w);
      }
    }
    el = target(w, name); if (!el) return null;
    const r = el.getBoundingClientRect();
    return {selector:selector(name),x:r.left,y:r.top,width:r.width,height:r.height,
      cx:r.left+r.width/2,cy:r.top+r.height/2,
      nx:(r.left+r.width/2)/w.innerWidth,ny:(r.top+r.height/2)/w.innerHeight,
      disabled:!!el.disabled,text:(el.getAttribute('aria-label')||el.textContent||'').trim().replace(/\s+/g,' ').slice(0,160)};
  }
  async function click(w, name, options = {}) {
    const rect = await bounds(w, name, options);
    if (!rect) throw new Error('Film action not found on '+snapshot(w,false).screen+': '+name);
    const el = target(w, name); if (el.disabled) throw new Error('Film action is disabled: '+name);
    el.focus({preventScroll:true});
    const e = {bubbles:true,cancelable:true,view:w,clientX:rect.cx,clientY:rect.cy,button:0};
    el.dispatchEvent(new w.MouseEvent('mousedown',e));
    el.dispatchEvent(new w.MouseEvent('mouseup',e));
    el.click();
    // Use the product's real reduced-motion dispatch timer rather than
    // bypassing it through A.finishDispatch(). Other clicks are synchronous.
    if (selector(name) === ACTIONS.dispatch) await wait(w, 90);
    fit(w); await frame(w);
    return snapshot(w, false);
  }
  function input(w, name, value) {
    const el = target(w, name); if (!el) throw new Error('Film input not found: '+name);
    el.focus({preventScroll:true});
    const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set;
    setter.call(el,String(value));
    el.dispatchEvent(new w.Event('input',{bubbles:true}));
    return el.value;
  }
  function snapshot(w, full = true) {
    assertWindow(w);
    return w.eval(`(() => ({screen:ui.scr[ui.role],role:ui.role,device:ui.dev,
      completed:TOUR.map((s,i)=>s.done()?i:null).filter(i=>i!==null),
      order:S.order,closed:S.closed,dispatch:!!S.dispatch&&!S.dispatch.running,
      ${full ? 'state:JSON.parse(JSON.stringify(S)),ui:JSON.parse(JSON.stringify(ui))' : 'clock:S.clock'}
    }))()`);
  }
  function metadata(w) {
    return w.eval(`({screens:Object.values(SCREENS).map(s=>({id:s.id,role:s.role,title:s.title})),tour:TOUR.map((s,i)=>({step:i,screen:s.scr,role:s.role,title:s.t,done:s.done()}))})`);
  }
  function dispose(w) {
    const meta = mounted.get(w); if (!meta) return;
    w.removeEventListener('resize', meta.resize); w.matchMedia = meta.media;
    meta.style.remove(); delete w.document.documentElement.dataset.xelorFilm;
    mounted.delete(w); w.eval('fitDevice()');
  }
  const api = {prepareDemo,install,fit,navigate,bounds,click,input,snapshot,metadata,dispose,present,localUrl,actions:ACTIONS,steps:STEPS};
  global.XelorDemoDirector = Object.freeze(api);
  global.prepareDemo = prepareDemo;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
