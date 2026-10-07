/* =====================================================================
   v7 — XELOR Market, Find help and Xelogram.
   XELOR only connects people: it never holds, collects or routes money.
   Listings carry two badges: identity verified (GST, Udyam) and the
   earned record (on time, rejects) counted from real receipts.
   ===================================================================== */

Object.assign(ICONS,{
  store:'<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 11.5V20h14v-8.5"/><path d="M10 20v-5h4v5"/>',
  heart:'<path d="M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7.5 3c0 5.4-7.5 10-7.5 10z"/>',
  bookmark:'<path d="M6 3h12v18l-6-4-6 4z"/>',
  dots:'<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  wrench:'<path d="M15 4a5 5 0 0 0-4.6 7L4 17.4 6.6 20l6.4-6.4A5 5 0 0 0 20 9l-3 3-3-1-1-3z"/>',
  grid:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'
});

/* ---------- state ---------- */
const mktFresh=()=>({mkt:{cat:'all',cluster:true,urgent:false,called:{},jobDone:{},reviewed:{},contacts:[],interest:false,myReq:false,
  gram:{posted:false,vis:'public',shared:{}},kpost:false,likes:{},follows:{shree:true},rfqPost:{},plan:'verified',
  vis:{record:'public',capacity:'buyers',customers:'private',machines:'public'}}});
{const f0=fresh;fresh=function(){return Object.assign(f0(),mktFresh())}}
Object.assign(S,mktFresh());

/* ---------- people on the market (demonstration data) ---------- */
const MK={
  shree:{name:'Shree Lakshmi Precision',short:'Shree Lakshmi',town:'Peenya 2nd Stage',km:6,mark:'SL',tint:'#1d6b73',cat:'machining',what:'VMC and CNC machining · 2 shifts free this week',rec:{n:52,on:51,rej:0.6},xelor:true,peenya:true},
  nandi:{name:'Nandi Powder Coaters',short:'Nandi',town:'Peenya Industrial Area',km:11,mark:'NP',tint:'#5b3a6e',cat:'finish',what:'Powder coating · new line, 300 parts a day',rec:{n:31,on:29,rej:1.1},xelor:true,peenya:true},
  ganesh:{name:'Sri Ganesh Castings',short:'Sri Ganesh',town:'Hosur',km:38,mark:'SG',tint:'#9a6a26',cat:'casting',what:'Grey iron castings · Furnace 2',live:true,xelor:true,peenya:false},
  anand:{name:'Anand Engineering Industries',short:'Anand',town:'Ambattur, Chennai',km:340,mark:'AE',tint:'#1e3e66',cat:'casting',what:'Castings and machined pump parts',live:true,xelor:false,peenya:false},
  maruthi:{name:'Maruthi Sheet Metal Works',short:'Maruthi',town:'Peenya 3rd Phase',km:4,mark:'MS',tint:'#7a4a17',cat:'sheet',what:'Laser cutting and bending · new on XELOR',rec:null,xelor:false,peenya:true}
};
const MK_ORDER=['shree','nandi','ganesh','maruthi','anand'];
const MK_CATS=[['all','All'],['casting','Castings'],['machining','Machining'],['finish','Surface finish'],['sheet','Sheet metal']];
function mkRec(id){const m=MK[id];if(m.live){const h=H(id);return h&&h.deliveries?{n:h.deliveries,on:h.onTimeN,rej:rejPct(id)}:null}return m.rec}
const mlogo=id=>`<span class="logo" style="background:${MK[id].tint}">${MK[id].mark}</span>`;
const idBadge=()=>`<span class="mb id">${I('check')}GST · Udyam checked</span>`;
function recBadge(id){const r=mkRec(id);if(!r)return `<span class="mb none">No earned record yet</span>`;return `<span class="mb rec">${I('shield')}Earned record · ${Math.round(r.on/r.n*100)}% on time</span>`}

/* ---------- the services an MSME needs and never knows whom to call ---------- */
const HELP=[
  {k:'fin',ic:'rupee',t:'Finance & TReDS',d:'Loans, invoice discounting, TReDS onboarding',n:14,pros:[['Udyog Finance Advisors','TReDS onboarding · RBI-regulated partners only','2.8 km','4.8',41],['Peenya Credit Desk','Working capital and CGTMSE-backed loans','1.9 km','4.6',27]]},
  {k:'comp',ic:'file',t:'Compliance & licences',d:'CA and GST, factory licence, KSPCB consent, fire NOC',n:38,pros:[['Shenoy & Rao, Chartered Accountants','GST, audit, 43B(h) checks · ICAI number checked','3.1 km','4.9',112],['Karnataka Licence Consultants','Factory licence, KSPCB consent, fire NOC','5.4 km','4.5',36]]},
  {k:'man',ic:'users',t:'Skilled people',d:'CNC operators, welders, contract labour',n:22,pros:[['SkillBridge Staffing','Contract labour · licence number checked','2.2 km','4.4',58],['Peenya Operators Guild','CNC and VMC operators, trained','1.5 km','4.7',33]]},
  {k:'test',ic:'gauge',t:'Testing & calibration',d:'NABL labs, BIS, ZED and ISO help',n:17,pros:[['Metrolab Calibration','Gauges and instruments · NABL scope checked','4.0 km','4.8',74],['QualiCert Advisors','ZED, ISO 9001 and BIS certification','6.3 km','4.6',29]]},
  {k:'rep',ic:'wrench',t:'Machine repair',d:'CNC, spindles, panels, motor rewinding',n:31,pros:[['Sai Machine Tool Services','CNC and VMC repair','2.1 km','4.8',63],['Raghu Electricals','Panels and motor rewinding','1.4 km','4.6',88]]},
  {k:'job',ic:'factory',t:'Job work',d:'Machining, plating, heat treatment, coating',n:46,pros:[['Bharat Heat Treaters','Hardening and tempering','3.6 km','4.7',52],['Nandi Powder Coaters','Powder coating · runs XELOR','11 km','4.8',31]]},
  {k:'log',ic:'truck',t:'Logistics',d:'Part loads, tempo, transporters',n:25,pros:[['Peenya Part-Load Carriers','Same-day tempo within 40 km','0.9 km','4.5',140],['Southline Transport','Full loads to AP, TN and Kerala','7.2 km','4.4',66]]},
  {k:'waste',ic:'refresh',t:'Effluent & scrap',d:'Authorised recyclers, hazardous waste',n:9,pros:[['GreenLoop Recyclers','Metal scrap and coolant · KSPCB-authorised','8.8 km','4.6',23],['Peenya Effluent Services','Plating effluent pickup','5.0 km','4.3',12]]},
  {k:'legal',ic:'book',t:'Legal & recovery',d:'Delayed payments, MSME Samadhaan, contracts',n:11,pros:[['Kini Legal Associates','MSME Samadhaan filings, contracts','4.4 km','4.7',19],['Udyam Help Desk','Udyam, MSME Samadhaan, scheme forms','1.2 km','4.5',47]]}
];
const URGENT=[{id:'sai',n:'Sai Machine Tool Services',w:'CNC and VMC repair',km:'2.1 km',eta:'12 min',r:'4.8',j:63},{id:'spindle',n:'Precision Spindle Care',w:'Spindles and servo drives',km:'4.5 km',eta:'25 min',r:'4.7',j:41},{id:'raghu',n:'Raghu Electricals',w:'Panels and motor rewinding',km:'1.4 km',eta:'18 min',r:'4.6',j:88}];

/* ---------- Xelogram: post art, drawn not photographed ---------- */
function art(kind){const g={cast:['#2a1208','#9a5a1b'],coat:['#14263a','#3d6f9c'],vmc:['#0f2f31','#2f8a8f'],pump:['#2a0f1a','#7a2945'],truck:['#3a2a08','#c89a2e']}[kind];const id='a'+kind;
  const scene={
    cast:`<ellipse cx="300" cy="210" rx="120" ry="60" fill="url(#${id}g)" opacity=".85"/><rect x="230" y="120" width="140" height="110" rx="10" fill="#1a0b05" stroke="#5a3418" stroke-width="3"/><rect x="255" y="160" width="90" height="55" rx="6" fill="#ff8a2a"/><rect x="255" y="160" width="90" height="55" rx="6" fill="url(#${id}g)"/>${[0,1,2].map(i=>`<g transform="translate(${60+i*52} ${222-i*18})"><rect width="92" height="40" rx="9" fill="#6f6863"/><rect width="92" height="12" rx="6" fill="#8d8680"/><circle cx="46" cy="22" r="10" fill="#3b3632"/></g>`).join('')}`,
    coat:`<path d="M20 70H380" stroke="#c8d6e4" stroke-width="5"/>${[0,1,2,3,4].map(i=>`<g transform="translate(${44+i*72} 70)"><path d="M0 0v28" stroke="#c8d6e4" stroke-width="2"/><rect x="-18" y="28" width="36" height="58" rx="5" fill="${['#2a5a86','#c89a2e','#2a5a86','#a13d2a','#2a5a86'][i]}"/></g>`).join('')}<g opacity=".5" fill="#e5eef6">${[0,1,2,3,4,5,6].map(i=>`<circle cx="${250+i*14}" cy="${200-i%3*16}" r="${10+i%3*4}"/>`).join('')}</g><path d="M20 250H380" stroke="#0b1826" stroke-width="18"/>`,
    vmc:`<rect x="110" y="70" width="180" height="170" rx="12" fill="#e9f1f1"/><rect x="128" y="90" width="144" height="100" rx="8" fill="#0b2224"/><rect x="190" y="96" width="20" height="44" rx="3" fill="#9fb8b9"/><path d="M200 140v12" stroke="#d6f0f0" stroke-width="4"/><rect x="160" y="160" width="80" height="18" rx="3" fill="#62c4cb"/><rect x="128" y="204" width="60" height="10" rx="3" fill="#2f8a8f"/><circle cx="252" cy="209" r="8" fill="#e2b54a"/>`,
    pump:`<circle cx="150" cy="160" r="66" fill="#d9c9cf"/><circle cx="150" cy="160" r="26" fill="#2a0f1a"/><rect x="214" y="122" width="120" height="76" rx="12" fill="#efe3e7"/>${[0,1,2,3,4].map(i=>`<path d="M${232+i*20} 128v64" stroke="#c9b3bb" stroke-width="5"/>`).join('')}<rect x="90" y="226" width="250" height="16" rx="5" fill="#120a0d"/><rect x="138" y="72" width="24" height="30" rx="4" fill="#d9c9cf"/>`,
    truck:`<rect x="60" y="110" width="190" height="100" rx="8" fill="#f8efd9"/><path d="M250 140h56l34 36v34h-90z" fill="#efe0b8"/><circle cx="110" cy="218" r="20" fill="#1d1606"/><circle cx="290" cy="218" r="20" fill="#1d1606"/><path d="M80 140h150M80 165h110" stroke="#c89a2e" stroke-width="7" stroke-linecap="round"/>`
  }[kind];
  return `<svg class="art" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${g[0]}"/><stop offset="1" stop-color="${g[1]}"/></linearGradient><radialGradient id="${id}g"><stop offset="0" stop-color="#ffd27a" stop-opacity=".95"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient></defs><rect width="400" height="300" fill="url(#${id}b)"/><g opacity=".09" stroke="#fff">${[0,1,2,3,4,5,6,7].map(i=>`<path d="M${i*60-40} 300L${i*60+80} 0"/>`).join('')}</g>${scene}</svg>`}

const CAPTION={
  en:'60 pump body castings delivered on time to a pump maker in Peenya. Zero rejects at their inspection. Furnace 2 has room next week.',
  ta:'பீண்யாவில் உள்ள ஒரு பம்ப் தயாரிப்பாளருக்கு 60 பம்ப் பாடி வார்ப்புகளை நேரத்திற்கு டெலிவரி செய்தோம். ஆய்வில் ஒன்றும் நிராகரிக்கப்படவில்லை. அடுத்த வாரம் ஃபர்னஸ் 2-இல் இடம் உள்ளது.',
  kn:'ಪೀಣ್ಯದ ಪಂಪ್ ತಯಾರಕರೊಬ್ಬರಿಗೆ 60 ಪಂಪ್ ಬಾಡಿ ಎರಕಗಳನ್ನು ಸಮಯಕ್ಕೆ ಸರಿಯಾಗಿ ತಲುಪಿಸಿದ್ದೇವೆ. ತಪಾಸಣೆಯಲ್ಲಿ ಒಂದೂ ತಿರಸ್ಕೃತವಾಗಿಲ್ಲ. ಮುಂದಿನ ವಾರ ಫರ್ನೇಸ್ 2ರಲ್ಲಿ ಸ್ಥಳ ಲಭ್ಯವಿದೆ.',
  hi:'पीण्या के एक पंप निर्माता को 60 पंप बॉडी कास्टिंग समय पर पहुँचाईं। जाँच में एक भी रिजेक्ट नहीं। अगले हफ़्ते फर्नेस 2 में जगह खाली है।'};
const LANGS=[['ta','தமிழ்'],['kn','ಕನ್ನಡ'],['hi','हिन्दी'],['en','English']];

function gramPosts(){const P=[];
  if(S.mkt.gram.posted)P.push({id:'ganesh',who:'ganesh',art:'cast',when:'just now',likes:41,cap:CAPTION[ui.glang||'ta'],ai:true,proof:`Verified delivery · ${S.grn?S.grn.no:'GRN'} · inspection passed`,cta:true});
  if(S.mkt.kpost)P.push({id:'kaveri',who:'kaveri',art:'pump',when:'just now',likes:63,cap:'80 pumps shipped to a customer in Andhra Pradesh, 8 days early. Every one passed head, flow, hydro and vibration tests.',ai:true,proof:'Verified dispatch · final test passed',cta:false});
  P.push({id:'nandi',who:'nandi',art:'coat',when:'2 h',likes:128,cap:'Our new powder-coat line is running in Peenya: 300 parts a day, any RAL shade. Slots open from 14 Oct.',ai:false,proof:'Verified · new line registered in XELOR',cta:true});
  P.push({id:'shree',who:'shree',art:'vmc',when:'5 h',likes:214,cap:'51 of our last 52 deliveries reached customers on time. Two VMC shifts free on Thursday and Friday.',ai:true,proof:'Verified streak · counted from buyers’ receipts',cta:true});
  return P}
const WHO={kaveri:{name:'Kaveri Pumps & Castings',short:'Kaveri Pumps',town:'Peenya',mark:'KP',tint:'#7a2945'}};
const who=id=>MK[id]||WHO[id];
function postHtml(p,opt={}){const w=who(p.who);const liked=!!S.mkt.likes[p.id];const asked=!!S.mkt.rfqPost[p.id];const own=p.who==='kaveri'||(opt.mine);
  return `<article class="gpost" data-flip="g-${p.id}"><header><span class="gring"><span class="logo" style="background:${w.tint}">${w.mark}</span></span><div class="grow"><b>${esc(w.name)} <span class="vt" title="Identity verified">${I('check')}</span></b><small>${esc(w.town)} · ${esc(p.when)}</small></div>
    ${own?'':`<button class="btn xs gh" data-a="follow" data-id="${p.who}">${S.mkt.follows[p.who]?'Following':'Follow'}</button>`}<button class="ib" data-a="report" data-id="${p.id}" aria-label="Report this post">${I('dots')}</button></header>
    <div class="media">${art(p.art)}<span class="gproof">${I('shield')}${esc(p.proof)}</span></div>
    <div class="acts"><button class="ib ${liked?'on':''}" data-a="like" data-id="${p.id}" aria-label="Like">${I('heart')}</button><button class="ib" data-a="toast" data-msg="Comments go to the factory as messages" data-sub="Kept private between the two companies, like any XELOR thread." aria-label="Comment">${I('chat')}</button><button class="ib" data-a="share-post" data-id="${p.id}" aria-label="Share">${I('send')}</button><span class="grow"></span><button class="ib" aria-label="Save">${I('bookmark')}</button></div>
    <div class="gtx"><b>${nos(p.likes+(liked?1:0))} likes</b><p><b>${esc(w.short||w.name)}</b> ${esc(p.cap)}</p>${p.ai?`<span class="ailab">${I('spark')}Caption drafted by AI · approved by the factory</span>`:''}</div>
    ${p.cta&&!own?`<div class="gcta">${asked?`<span class="pill t-ok">${I('check')} Request sent</span><small>It lands in their XELOR like any request</small>`:`<button class="btn pri sm" data-a="rfq-post" data-id="${p.id}">${I('file')}Request quote</button><button class="btn gh sm" data-a="contact" data-id="${p.who}" data-ch="call">${I('phone')}Call</button>`}</div>`:''}</article>`}

/* ---------- actions ---------- */
function mkContact(id,ch,what){const n=(MK[id]&&MK[id].name)||id;S.mkt.contacts.unshift({at:S.clock,who:n,ch,what});log('Kaveri Pumps',`${ch==='call'?'Called':'Messaged'} ${n} on XELOR Market`,(what||'Masked number')+' · contact logged · no money handled')}
Object.assign(A,{
  mcat(id){S.mkt.cat=id},cluster(){S.mkt.cluster=!S.mkt.cluster},
  machineDown(){if(S.mkt.urgent)return;S.mkt.urgent=true;tick(1);toast('Three verified technicians can reach you','Nearest first, with how fast each usually answers. Calls go through a masked number.','info')},
  callPro(id){if(S.mkt.called[id])return;S.mkt.called[id]=S.clock;tick(3);const p=URGENT.find(x=>x.id===id);mkContact(id,'call','Machine down · masked call');S.mkt.contacts[0].who=p?p.n:id;
    toast('Connected through a masked number',`${p?p.n:'They'} can’t see your number and you can’t see theirs. The call is logged, so a review is possible once the job is done.`)},
  jobDone(id){if(!S.mkt.called[id]||S.mkt.jobDone[id])return;S.mkt.jobDone[id]=true;tick(90);toast('Job confirmed','Now a review counts. Reviews only come from logged contacts with a confirmed job.')},
  review(id){if(!S.mkt.jobDone[id]||S.mkt.reviewed[id])return;S.mkt.reviewed[id]=5;toast('Review posted','5 stars, tied to a real call and a confirmed job. It can’t be bought or faked.')},
  interest(){if(S.mkt.interest)return;S.mkt.interest=true;tick(4);log('Kaveri Pumps','Sent interest to Deccan Agro Equipment','Buyer request on XELOR Market · passport attached · sent to 5 sellers, never resold');
    toast('Interest sent with your passport','Deccan Agro sees your earned record. Numbers are shared only if both sides agree. No fee for the lead.')},
  myReq(){if(S.mkt.myReq)return;S.mkt.myReq=true;tick(2);log('Kaveri Pumps','Posted a request on XELOR Market','Powder coating · 80 pump casings · sent to 5 matched sellers');toast('Request sent to 5 matched sellers','Picked by earned record and distance. It is never sold to anyone else.')},
  gramPost(){if(S.inspection!=='pass'||S.mkt.gram.posted)return;S.mkt.gram.posted=true;tick(2);
    log('Sri Ganesh Castings','Posted on Xelogram','Drafted from verified delivery '+(S.grn?S.grn.no:'')+' · caption in '+({ta:'Tamil',kn:'Kannada',hi:'Hindi',en:'English'}[ui.glang||'ta'])+' · buyer name hidden');
    toast('Posted on Xelogram','The post carries the verified-delivery badge. Kaveri’s name stays hidden unless Kaveri agrees.')},
  gramShare(ch){S.mkt.gram.shared[ch]=true;toast('Ready to share on '+ch,'Opens '+ch+' with the post card and a link back to the verified record.','info')},
  kpost(){if(!S.closed||S.mkt.kpost)return;S.mkt.kpost=true;log('Arun Venkatesh','Approved a Xelogram post','Drafted from dispatch '+(S.dispatch?S.dispatch.dn:'')+' · customer name hidden');toast('Posted on Xelogram','Drafted by the agent from the dispatch, approved by you in one tap.')},
  like(id){S.mkt.likes[id]=!S.mkt.likes[id]},
  follow(id){S.mkt.follows[id]=!S.mkt.follows[id];toast(S.mkt.follows[id]?'Following '+who(id).name:'Unfollowed',S.mkt.follows[id]?'Their posts and free capacity show up in your feed.':'','info')},
  rfqPost(id){if(S.mkt.rfqPost[id])return;S.mkt.rfqPost[id]=true;tick(3);const p=gramPosts().find(x=>x.id===id);const w=who(p?p.who:id);
    log('Kaveri Pumps','Requested a quote from a Xelogram post',`${w.name} · powder coating for 80 pump casings · sent as a normal XELOR request`);
    toast('Request sent to '+w.name,'It started from their post and lands in their XELOR like any request. Answers are ranked like any other.')},
  report(id){toast('Report this post?','Tell us what’s wrong. A grievance officer acknowledges within 24 hours and decides within 7 days.','info')},
  plan(p){S.mkt.plan=p;toast(p==='free'?'Switched to Free':'Verified plan, ₹249 a month','No auto-debit. You renew yourself, and you can cancel in one tap.','info')},
  vis(k,v){S.mkt.vis[k]=v}
});
{const h0=handle;handle=function(a,el,e){const d=el.dataset;
  const m={mcat:()=>A.mcat(d.id),'call-pro':()=>A.callPro(d.id),'job-done':()=>A.jobDone(d.id),review:()=>A.review(d.id),like:()=>A.like(d.id),follow:()=>A.follow(d.id),
    'rfq-post':()=>A.rfqPost(d.id),report:()=>A.report(d.id),plan:()=>A.plan(d.id),vis:()=>A.vis(d.k,d.v),'gram-share':()=>A.gramShare(d.id),
    glang:()=>{ui.glang=d.id},hcat:()=>{ui.hcat=d.id},'share-post':()=>toast('Share to WhatsApp Status, Instagram or LinkedIn','The card links back to the verified record, so the proof travels with it.','info'),
    contact:()=>{mkContact(d.id,d.ch);toast(d.ch==='call'?'Calling through a masked number':'WhatsApp chat opened',`${(MK[d.id]||{}).name||(URGENT.find(x=>x.id===d.id)||{}).n||d.id} sees your business name, not your number. Logged in your contacts.`)}};
  if(m[a]){m[a]();render();return}return h0(a,el,e)}}

/* ---------- role ---------- */
ROLES.mkt={name:'Market',who:'Kaveri Pumps · XELOR Market',dev:'laptop',home:'k.home',cls:'r-mkt',ic:'store',surface:'XELOR Market · free to list, no money handled',host:'market.xelor.in',tag:'NEW'};
ui.scr.mkt='k.home';
{const r0=roleAlert;roleAlert=function(r){if(r==='mkt')return S.shared&&!S.mkt.interest;return r0(r)}}
{const s0=shellPortal;shellPortal=function(r,sc,body,pv){let h=s0(r,sc,body,pv);if(r!=='mkt')return h;
  return h.replace(`<span class="badge">${I('pin')} Gate 1 · Peenya</span>`,`<span class="badge b">${I('shield')} No money handled</span><span class="badge g">${S.mkt.plan==='free'?'Free plan':'Verified · ₹249/mo'}</span>`).replace('<span class="pm">XL</span>','<span class="pm">KP</span>')}}
TABS.mkt=[['k.home','store','Market'],['k.req','inbox','Buyer requests',()=>S.mkt.interest?0:1],['k.help','wrench','Find help'],['k.schemes','award','Scheme finder'],['k.gram','camera','Xelogram'],['k.profile','grid','Factory profile',()=>S.closed&&!S.mkt.kpost?1:0],['k.plans','rupee','Plans']];
NAVS.sup.push(['s.gram','camera','Xelogram',()=>S.inspection==='pass'&&!S.mkt.gram.posted?1:0]);

const promise=()=>`<div class="promise"><span>${I('shield')}<b>Two badges</b> identity checked, record earned</span><span>${I('users')}<b>5 sellers at most</b> per buyer request, never resold</span><span>${I('lock')}<b>No money handled</b> you pay each other directly</span></div>`;

/* ---------- market home ---------- */
def('k.home',{role:'mkt',title:'XELOR Market',route:'/',purpose:'A marketplace for MSMEs where a listing costs a fraction of the big directories and every seller shows an earned record. XELOR connects buyers and sellers and never handles the money.',
  render(){const c=S.mkt.cat;const L=MK_ORDER.filter(id=>(c==='all'||MK[id].cat===c)&&(!S.mkt.cluster||MK[id].peenya||MK[id].km<60));
    return `<div class="mhero"><div class="grow"><span class="eyb">XELOR Market · MSMEs only</span><h3>Find a supplier you can check, not just call.</h3><p>Every seller shows who they are and how they actually deliver. Free to list.</p>
      <div class="msearch">${I('search')}<span>castings, VMC shifts, powder coating, fire NOC…</span><kbd>⌘K</kbd></div></div>
      <div class="mstat"><b>${cu(1240)}</b><small>Peenya factories listed</small><b>${cu(412)}</b><small>with an earned record</small></div></div>
    ${promise()}
    <div class="row sb" style="flex-wrap:wrap;gap:8px"><div class="chiprow">${MK_CATS.map(([k,l])=>`<button class="chip" data-a="mcat" data-id="${k}" aria-pressed="${c===k}">${l}</button>`).join('')}</div>
      <label class="row" style="gap:8px;font-size:12.5px;font-weight:700;color:var(--ink)">Near Peenya<button class="tg" data-a="cluster" aria-pressed="${S.mkt.cluster}" aria-label="Only near Peenya"></button></label></div>
    <div class="mgrid">${L.map(id=>{const m=MK[id],r=mkRec(id);return `<div class="mcard"><div class="row">${mlogo(id)}<div class="grow"><b>${esc(m.name)}</b><small>${esc(m.town)} · ${m.km} km</small></div>${m.xelor?vbadge():''}</div>
      <p class="sub">${esc(m.what)}</p><div class="mbs">${idBadge()}${recBadge(id)}</div>
      ${r?`<div class="mrec"><div><b>${Math.round(r.on/r.n*100)}%</b><small>on time</small></div><div><b>${r.rej.toFixed(1)}%</b><small>rejected</small></div><div><b>${r.n}</b><small>deliveries</small></div></div>`:`<div class="mrec none"><small>Its record starts with the first delivery a XELOR buyer receives.</small></div>`}
      <div class="btns"><button class="btn gh sm" data-a="contact" data-id="${id}" data-ch="call">${I('phone')}Call</button><button class="btn gh sm" data-a="contact" data-id="${id}" data-ch="whatsapp">${I('msg')}WhatsApp</button><button class="btn pri sm" data-go="k.gram">${I('camera')}Posts</button></div></div>`}).join('')||empty('search','Nothing in this category nearby','Switch off “Near Peenya” to see more.')}</div>
    <p class="note">Contacts go through masked numbers and are logged. Numbers are published only with the owner’s consent. Demonstration data.</p>`}});

/* ---------- buyer requests: capped, never resold ---------- */
def('k.req',{role:'mkt',title:'Buyer requests',route:'/requests',purpose:'Requests from verified buyers, each sent to at most five matched sellers and never resold. Kaveri answers with its passport; numbers swap only when both agree.',
  render(){const P=passportStats();return `${head('Buyer requests','Each request goes to five matched sellers at most. It is never sold again, and you never pay per lead.')}
    <div class="two"><div style="display:flex;flex-direction:column;gap:12px;min-width:0">
      <div class="card ${S.mkt.interest?'ok':'tint'}"><div class="row" style="align-items:flex-start"><span class="logo" style="background:#2a5a86">DA</span><div class="grow"><div class="row sb"><h4>Deccan Agro Equipment</h4>${S.mkt.interest?tp('Interest sent','ok'):tp('New today','acc')}</div><p class="sub">Hubballi · ${idBadge()}</p></div></div>
        <div class="reqbox"><b>40 × 4-inch monoblock pumps</b><span>Needed by 20 Nov · drawings attached · delivery to Hubballi</span></div>
        <div class="split2"><div><h5>Why you were picked</h5><ul class="ticks"><li>You make end-suction pumps</li><li>Passport: ${P.pct}% on time to customers</li><li>${P.ret} returned by customers</li><li>220 km from the buyer</li></ul></div><div><h5>Who else got it</h5><ul class="ticks no"><li>4 other pump makers, 5 in all</li><li>Picked from 212 who make pumps</li><li>Never resold after today</li><li>No fee for the lead</li></ul></div></div>
        ${S.mkt.interest?`<div class="thread" style="margin:0;border-radius:12px;min-height:0"><div class="bub me" style="max-width:100%"><div class="from">Kaveri Pumps via XELOR Market</div>We can make 40 pumps by 14 Nov. Our record is attached. Happy to talk on a call.<div class="t">${stamp()} · passport attached</div></div></div><p class="note">They opened your passport. Numbers swap once both sides tap “Share contact”.</p>`:`<div class="btns"><button class="btn pri" data-a="interest">${I('send')}Send interest with our passport</button><button class="btn gh" data-a="toast" data-msg="Marked as not for you" data-sub="The buyer’s slot goes to the next matched seller." data-tone="info">Not for us</button></div>`}</div>
      <div class="card"><div class="row sb"><h4>Ask the market yourself</h4>${S.mkt.myReq?tp('Sent to 5','ok'):''}</div>
        <div class="reqbox"><b>Powder coating · 80 pump casings</b><span>RAL 5015 blue · 60–80 micron · pickup from Peenya · by 30 Oct</span></div>
        ${S.mkt.myReq?`<div class="list">${[['nandi','Replied · ₹38 a piece · can start 14 Oct'],['shree','Seen'],['maruthi','Seen']].map(([id,t])=>`<div class="li">${mlogo(id)}<div class="grow"><div class="t">${esc(MK[id].name)}</div><div class="m">${t}</div></div>${recBadge(id)}</div>`).join('')}</div>`:`<button class="btn pri sm" data-a="myReq" style="align-self:flex-start">${I('send')}Send to 5 matched sellers</button>`}</div></div>
    <div style="display:flex;flex-direction:column;gap:12px;min-width:0"><div class="card"><h4>Contacts this week</h4>${S.mkt.contacts.length?`<div class="list">${S.mkt.contacts.slice(0,6).map(c=>`<div class="li"><span class="av b">${I(c.ch==='call'?'phone':'msg')}</span><div class="grow"><div class="t">${esc(c.who)}</div><div class="m">${stamp(c.at)} · ${esc(c.what||'masked number')}</div></div></div>`).join('')}</div>`:`<p class="sub">Calls and WhatsApp chats you start from the market appear here. Each one is logged; none of them costs a lead fee.</p>`}</div>
      <div class="card"><h4>How XELOR Market stays clean</h4><ul class="ticks"><li>Buyers are GST and Udyam checked</li><li>Five sellers per request, never resold</li><li>Masked numbers, shared only with consent</li><li>Payment happens between you. XELOR never holds it.</li></ul></div></div></div>`}});

/* ---------- find help ---------- */
def('k.help',{role:'mkt',title:'Find help',route:'/help',purpose:'The services an MSME needs and never knows whom to call: compliance, testing, repair, job work, finance and more. Providers are checked, calls are masked, reviews come only from confirmed jobs.',
  render(){const cur=HELP.find(h=>h.k===(ui.hcat||'comp'));const u=S.mkt.urgent;
    return `${head('Find help','Who to call for anything a factory needs. Checked providers, masked calls, reviews only from confirmed jobs.')}
    <div class="urgent ${u?'on':''}"><span class="ui">${I(u?'check':'alert')}</span><div class="grow"><b>${u?'VMC 2 is down · help is on the way':'Machine down?'}</b><span>${u?'Nearest verified technicians, with how fast each usually answers':'Get the three nearest verified technicians in one tap'}</span></div>${u?'':`<button class="btn dn" data-a="machineDown">${I('wrench')}Get help now</button>`}</div>
    ${u?`<div class="list">${URGENT.map((p,i)=>{const c=S.mkt.called[p.id],dn=S.mkt.jobDone[p.id],rv=S.mkt.reviewed[p.id];return `<div class="pro ${i===0?'first':''}"><span class="av b">${I('wrench')}</span><div class="grow"><div class="t">${esc(p.n)} ${idBadge()}</div><div class="m">${esc(p.w)} · ${p.km} · answers in about <b>${p.eta}</b> · ★ ${p.r} from ${p.j} confirmed jobs</div>
      ${c?`<div class="prostate">${tp('Called '+tm(c),'ok')}${dn?(rv?tp('Reviewed ★★★★★','gold'):`<button class="btn xs gold" data-a="review" data-id="${p.id}">${I('star')}Leave a review</button>`):`<button class="btn xs gh" data-a="job-done" data-id="${p.id}">Fixed it? Confirm the job</button>`}</div>`:''}</div>
      ${c?'':`<div class="btns" style="flex:0 0 auto"><button class="btn pri sm" data-a="call-pro" data-id="${p.id}">${I('phone')}Call</button><button class="btn gh sm" data-a="contact" data-id="${p.id}" data-ch="whatsapp">${I('msg')}</button></div>`}</div>`}).join('')}</div>`:''}
    <div class="hgrid">${HELP.map(h=>`<button class="htile ${cur.k===h.k?'on':''}" data-a="hcat" data-id="${h.k}"><span class="hi">${I(h.ic)}</span><b>${esc(h.t)}</b><small>${esc(h.d)}</small><em>${h.n} near Peenya</em></button>`).join('')}</div>
    <div class="card"><div class="row sb"><h4>${esc(cur.t)} · near Peenya</h4><span class="badge b">${cur.n} checked providers</span></div><div class="list">${cur.pros.map(p=>`<div class="li"><span class="av b">${I(cur.ic)}</span><div class="grow"><div class="t">${esc(p[0])}</div><div class="m">${esc(p[1])} · ${p[2]} · ★ ${p[3]} from ${p[4]} confirmed jobs</div></div><button class="btn gh sm" data-a="contact" data-id="${esc(p[0])}" data-ch="call">${I('phone')}Call</button></div>`).join('')}</div>
      <p class="note">No pay-per-lead and no paid ranking: providers are ordered by distance and confirmed jobs. Provider names are demonstration data.</p></div>`}});

/* ---------- scheme finder ---------- */
def('k.schemes',{role:'mkt',title:'Scheme finder',route:'/schemes',purpose:'Government schemes most MSMEs never hear of, matched to Kaveri’s Udyam details, each linked to listed consultants who can help apply.',
  render(){const L=[
    ['TReDS','rupee','Get paid early on invoices to big buyers','Invoices are discounted by RBI-regulated financiers. A new government guarantee covering 75% of defaults on small-firm invoices was reported in Sept 2026.','fin',true],
    ['CGTMSE','shield','Loans without collateral','A government trust guarantees bank loans to micro and small enterprises, so the bank asks for less security.','fin',true],
    ['ZED certification','award','Zero Defect Zero Effect','A quality and sustainability certificate with most of the cost subsidised for micro and small units. Bronze is the first level.','test',true],
    ['Lean manufacturing','factory','A consultant to cut waste on the floor','The scheme pays most of a lean consultant’s fee for a group of MSMEs.','test',false],
    ['MSME Samadhaan','book','When a buyer pays late','File a delayed-payment case against a buyer that owes an MSME past the agreed terms.','legal',true]];
    return `${head('Scheme finder','Matched to Kaveri’s Udyam details: small enterprise, manufacturing, Karnataka. Most MSMEs never hear of these.')}
    <div class="card tint"><div class="row"><span class="av b">${I('info')}</span><div class="grow"><b style="color:var(--ink)">About 7 in 10 MSMEs don’t know these schemes exist</b><p class="sub">So each one here links to listed consultants who help you apply. XELOR doesn’t charge for the introduction.</p></div></div></div>
    <div class="sgrid">${L.map(([t,ic,s,d,cat,el])=>`<div class="card"><div class="row sb"><div class="row"><span class="av b">${I(ic)}</span><div><h4>${t}</h4><small class="sub">${s}</small></div></div>${el?tp('Likely eligible','ok'):tp('Check with a consultant','warn')}</div><p class="sub">${d}</p><button class="btn gh sm" data-a="hcat" data-id="${cat}" data-go-help style="align-self:flex-start">${I('users')}Consultants who can help</button></div>`).join('')}</div>
    <p class="note">Plain-language summaries for the demo. Terms change: confirm with the scheme office or a listed consultant.</p>`}});

/* ---------- Xelogram ---------- */
const stories=()=>`<div class="stories">${[['kaveri','Your story'],['shree','Shree Lakshmi'],['nandi','Nandi'],['ganesh','Sri Ganesh'],['maruthi','Maruthi'],['anand','Anand']].map(([id,l],i)=>{const w=who(id);return `<button class="story ${i===0?'me':''}" data-a="toast" data-msg="${i===0?'Add a reel of your shop floor':'Today on '+esc(w.name)+'’s floor'}" data-sub="${i===0?'Short clips of machines and finished work. Faces and customer parts can be blurred before posting.':'Stories disappear after a day. Proof badges stay on posts.'}" data-tone="info"><span class="gring"><span class="logo" style="background:${w.tint}">${i===0?I('plus'):w.mark}</span></span><small>${l}</small></button>`}).join('')}</div>`;
def('k.gram',{role:'mkt',title:'Xelogram',route:'/xelogram',purpose:'A marketing feed only for Indian MSMEs. Posts are drafted from verified events, carry a proof badge and a Request quote button, and share out to WhatsApp, Instagram and LinkedIn.',
  render(){const f=ui.gfeed||'peenya';const posts=gramPosts().filter(p=>f!=='following'||S.mkt.follows[p.who]||p.who==='kaveri');
    const asked=Object.keys(S.mkt.rfqPost).length;
    return `<div class="gwrap"><div class="gcol"><div class="ghead"><div class="glogo">Xelo<span>gram</span></div><div class="seg" style="flex:0 0 auto">${[['peenya','Peenya'],['following','Following'],['all','All India']].map(([k,l])=>`<button data-a="gfeed" data-id="${k}" aria-pressed="${f===k}">${l}</button>`).join('')}</div></div>
      ${stories()}${posts.map(p=>postHtml(p)).join('')}</div>
    <aside class="gside"><div class="card"><h4>Why buyers trust it</h4><ul class="ticks"><li>Every factory is GST and Udyam checked</li><li>Proof badges come from real receipts</li><li>AI captions are labelled</li><li>Report any post: answered within 24 hours</li></ul></div>
      <div class="card"><div class="row sb"><h4>Requests from posts</h4><span class="badge g">this month</span></div><div class="big">${9+asked}<small> requests started from Kaveri’s feed</small></div><p class="sub">Xelogram counts quotes asked, not likes.</p></div>
      <div class="card"><h4>Factories near you</h4><div class="list">${['maruthi','anand'].map(id=>`<div class="li">${mlogo(id)}<div class="grow"><div class="t">${esc(MK[id].short)}</div><div class="m">${esc(MK[id].town)}</div></div><button class="btn xs gh" data-a="follow" data-id="${id}">${S.mkt.follows[id]?'Following':'Follow'}</button></div>`).join('')}</div></div></aside></div>`}});
{const h1=handle;handle=function(a,el,e){if(a==='gfeed'){ui.gfeed=el.dataset.id;render();return}if(a==='hcat'&&el.hasAttribute('data-go-help')){ui.hcat=el.dataset.id;go('k.help');return}return h1(a,el,e)}}

/* ---------- factory profile ---------- */
def('k.profile',{role:'mkt',title:'Factory profile',route:'/kaveri-pumps',purpose:'Kaveri’s public face on Xelogram: posts, machines and the passport link, with owner-set visibility for every part of the record.',
  render(){const P=passportStats();const tiles=['pump','truck','vmc','coat','cast','truck'];const V=S.mkt.vis;
    const visRow=(k,l,s)=>`<div class="vrow"><div class="grow"><b>${l}</b><small>${s}</small></div><div class="seg">${[['public','Public'],['buyers','Buyers'],['private','Private']].map(([v,t])=>`<button data-a="vis" data-k="${k}" data-v="${v}" aria-pressed="${V[k]===v}">${t}</button>`).join('')}</div></div>`;
    return `<div class="prof"><span class="gring big"><span class="logo" style="background:#7a2945">KP</span></span><div class="grow"><div class="row" style="flex-wrap:wrap"><h3>${esc(FACTORY.name)}</h3><span class="vt">${I('check')}</span>${idBadge()}</div><p class="sub">Pump maker · Peenya, Bengaluru · Udyam Small · end-suction and monoblock pumps</p>
      <div class="pstats"><div><b>${6+(S.mkt.kpost?1:0)}</b><small>posts</small></div><div><b>1,284</b><small>followers</small></div><div><b>${P.pct}%</b><small>on time to customers</small></div><div><b>${9+Object.keys(S.mkt.rfqPost).length}</b><small>requests from posts</small></div></div>
      <div class="btns" style="justify-content:flex-start"><button class="btn pri sm" style="flex:0 0 auto" data-a="toast" data-msg="Profile card ready for WhatsApp Status" data-sub="It shows your on-time rate and links to the verified passport." data-tone="ok">${I('send')}Share profile card</button><button class="btn gh sm" style="flex:0 0 auto" data-go="p.pass">${I('shield')}Open passport</button></div></div></div>
    ${S.closed&&!S.mkt.kpost?`<div class="card gold"><div class="row sb"><div class="row"><span class="agmark">${I('spark')}</span><div><b style="color:var(--ink);display:block">Your agent drafted a post</b><small class="sub" style="display:block">From dispatch ${S.dispatch?S.dispatch.dn:''} · customer name hidden</small></div></div><button class="btn pri sm" data-a="kpost">${I('check')}Approve and post</button></div><p class="sub">“80 pumps shipped to a customer in Andhra Pradesh, 8 days early. Every one passed head, flow, hydro and vibration tests.”</p></div>`:''}
    <div class="two"><div class="pgrid">${(S.mkt.kpost?['pump',...tiles]:tiles).slice(0,6).map((k,i)=>`<div class="ptile">${art(k)}${i===0&&S.mkt.kpost?'<span class="newtag">New</span>':''}</div>`).join('')}</div>
    <div class="card"><h4>Who sees what</h4>${visRow('record','On-time and returns record','From the passport')}${visRow('capacity','Spare capacity','Read from your schedule')}${visRow('machines','Machine list','VMCs, test bench, foundry')}${visRow('customers','Customer names','Hidden in every post by default')}<p class="note">Competitors can’t harvest what you keep to buyers or private.</p></div></div>`}});

/* ---------- plans ---------- */
def('k.plans',{role:'mkt',title:'Plans',route:'/plans',purpose:'Simple prices with no lead fees: free to list, ₹249 a month for Verified, included with the XELOR ERP. No auto-debit lock-in.',
  render(){const p=S.mkt.plan;const plan=(k,t,price,per,sub,L,cta)=>`<div class="plan ${k==='verified'?'hot':''} ${p===k?'cur':''}">${k==='verified'?'<span class="ptag">Most factories</span>':''}<h4>${t}</h4><div class="pp"><b>${price}</b><small>${per}</small></div><p class="sub">${sub}</p><ul class="ticks">${L.map(x=>`<li>${x}</li>`).join('')}</ul>${cta}</div>`;
    return `${head('Plans','About ₹8 a day for Verified. No lead fees, no lock-in, and free to list.')}
    <div class="plans">${plan('free','Free','₹0','forever','For any MSME to be found.',['Listing with 5 photos','Call and WhatsApp buttons','Find help and scheme finder','Post on Xelogram'],p==='free'?`<span class="pill t-ok">Current plan</span>`:`<button class="btn gh sm block" data-a="plan" data-id="free">Switch to Free</button>`)}
      ${plan('verified','Verified','₹249','a month · or ₹2,490 a year','For factories that sell on the market.',['GST and Udyam identity badge','Earned-record badge on every listing','Buyer requests matched to you','30 photos and reels','Labelled “Promoted” boosts, capped'],p==='verified'?`<span class="pill t-ok">Current plan</span>`:`<button class="btn pri sm block" data-a="plan" data-id="verified">Choose Verified</button>`)}
      ${plan('erp','With XELOR ERP','Included','in every ERP plan','For factories that run XELOR.',['Everything in Verified','Record read live from your receipts','Posts drafted from verified events','Capacity shown from your schedule'],`<button class="btn gh sm block" data-go="p.home">See the ERP</button>`)}</div>
    <div class="card"><h4>Our promises</h4><div class="prom"><span>${I('x')}No pay-per-lead</span><span>${I('users')}5 sellers per request, at most</span><span>${I('refresh')}No auto-debit: you renew yourself</span><span>${I('check')}Cancel in one tap</span><span>${I('lock')}XELOR never handles payments</span></div></div>`}});

/* ---------- supplier phone: Xelogram ---------- */
def('s.gram',{role:'sup',title:'Xelogram',kn:'Sri Ganesh Castings',route:'/xelogram · Sri Ganesh',nav:'s.gram',purpose:'The agent turns a verified delivery into a post. Sri Ganesh picks a language, approves with one tap and shares it to WhatsApp Status. The buyer’s name stays hidden.',
  render(){const L=ui.glang||'ta';const g=S.mkt.gram;
    const draft={id:'ganesh',who:'ganesh',art:'cast',when:'draft',likes:0,cap:CAPTION[L],ai:true,proof:`Verified delivery · ${S.grn?S.grn.no:'GRN'} · inspection passed`,cta:false};
    if(!g.posted)return `<div class="agcard"><div class="row"><span class="agmark">${I('spark')}</span><div><b>Your agent drafted a post</b><small>From a delivery Kaveri received and passed. Check it, then post.</small></div></div></div>
      <div class="seg lang">${LANGS.map(([k,l])=>`<button data-a="glang" data-id="${k}" aria-pressed="${L===k}">${l}</button>`).join('')}</div>
      ${postHtml(draft,{mine:true})}
      <div class="card"><div class="row sb"><b style="color:var(--ink)">Who sees it</b><span class="pill t-ok">Public</span></div><p class="sub">Kaveri’s name is hidden. It shows “a pump maker in Peenya” unless Kaveri agrees.</p></div>`;
    return `<div class="card ok"><div class="row sb"><b style="color:var(--ink)">Posted on Xelogram</b>${tp('Live','ok')}</div><p class="sub">Buyers near Peenya see it with the verified-delivery badge and a Request quote button.</p></div>
      <div class="shares">${[['WhatsApp Status','msg'],['Instagram','camera'],['LinkedIn','users']].map(([n,ic])=>`<button class="shr ${g.shared[n]?'on':''}" data-a="gram-share" data-id="${n}"><span>${I(g.shared[n]?'check':ic)}</span><small>${n}</small></button>`).join('')}</div>
      ${postHtml(Object.assign({},draft,{when:'just now',likes:41}),{mine:true})}`},
});
Object.defineProperty(SCREENS['s.gram'],'cta',{get(){return S.mkt.gram.posted?null:()=>`<button class="im-btn pri big" data-a="gramPost">${I('check')}Approve and post</button>`}});

/* ---------- the agent knows about the market ---------- */
{const a0=agentItems;agentItems=function(){const L=a0();
  if(S.shared&&!S.mkt.interest)L.push({st:'ask',t:'A buyer request on XELOR Market matches Kaveri',d:'Deccan Agro · 40 pumps · sent to 5 sellers',go:'k.req'});
  if(S.mkt.interest)L.push({st:'done',t:'Sent interest to Deccan Agro with the passport',d:'Numbers swap only if both agree',go:'k.req'});
  if(S.closed&&!S.mkt.kpost)L.push({st:'ask',t:'Drafted a Xelogram post: 80 pumps shipped early',d:'Customer name hidden · approve on the profile',go:'k.profile'});
  return L}}

/* ---------- tour: four more steps ---------- */
TOUR.push(
  {role:'mkt',scr:'k.help',st:'Help',k:'Find help',t:'A machine stops: a verified technician in two taps',p:'Find help lists what an MSME needs and never knows whom to call: compliance, testing, repair, job work, finance. Providers are checked against GST and Udyam, calls go through masked numbers, and reviews come only from confirmed jobs.',hint:'Tap “Get help now” → Call the nearest',done:()=>!!S.mkt.called.sai,run:()=>{A.machineDown();A.callPro('sai')}},
  {role:'mkt',scr:'k.req',st:'Market',k:'XELOR Market',t:'A buyer’s request reaches five sellers, not fifty',p:'Deccan Agro needs 40 pumps. XELOR Market sends the request to five matched sellers at most, picked by earned record, and never resells it. Kaveri answers with its passport attached. XELOR never touches the money.',hint:'Tap “Send interest with our passport”',done:()=>S.mkt.interest,run:()=>A.interest()},
  {role:'sup',scr:'s.gram',st:'Post',k:'Xelogram',t:'Sri Ganesh’s on-time delivery becomes a post',p:'The agent drafts a post from the verified delivery and writes the caption in Tamil, Kannada, Hindi or English. Sri Ganesh approves with one tap and can share it to WhatsApp Status. Kaveri’s name stays hidden.',hint:'Pick a language → Approve and post',done:()=>S.mkt.gram.posted,run:()=>A.gramPost()},
  {role:'mkt',scr:'k.gram',st:'Quote',k:'Xelogram',t:'Kaveri asks for a quote straight from a post',p:'Nandi Powder Coaters posted its new line with a verified badge. One tap on “Request quote” sends an ordinary XELOR request, ranked like any other. Xelogram measures requests, not likes.',hint:'Tap “Request quote” on Nandi’s post',done:()=>!!S.mkt.rfqPost.nandi,run:()=>A.rfqPost('nandi')}
);
PV['s.gram']=[8,8];
