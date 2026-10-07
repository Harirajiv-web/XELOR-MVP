'use strict';
/* =====================================================================
   XELOR product demo — core: utils, icons, data, state, ranking,
   actions, tour, device shell, events. Screens live in SCREENS (next
   block). Everything re-renders from S + ui, exactly like the KisanCred demo.
   ===================================================================== */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const inr2=n=>'₹'+Number(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const nos=n=>Number(n).toLocaleString('en-IN');
const D=iso=>new Date(iso+'T00:00:00');
const dmy=iso=>D(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short'});
const dmyy=iso=>D(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
const addDays=(iso,n)=>{const d=D(iso);d.setDate(d.getDate()+n);const p=x=>String(x).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())};
const days=(a,b)=>Math.round((D(b)-D(a))/86400000);
const reduceMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- icons ---------- */
const ICONS={
home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-6h4v6"/>',
box:'<path d="M21 8 12 3 3 8l9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
truck:'<path d="M2 5h12v11H2z"/><path d="M14 9h4l3 3.5V16h-7"/><circle cx="6.5" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/>',
book:'<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z"/><path d="M4 20a2 2 0 0 0 2 1h13v-3"/><path d="M8 7h7M8 11h5"/>',
shield:'<path d="M12 3l8 3v6c0 4.8-3.4 8-8 9-4.6-1-8-4.2-8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
rupee:'<path d="M6 4h12M6 9h12M9 4c4 0 6 1.8 6 4.5S13 13 9 13H8l7 7"/>',
chat:'<path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1.4-4.4A8.5 8.5 0 1 1 20.5 11.5z"/>',
msg:'<path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1.4-4.4A8.5 8.5 0 1 1 20.5 11.5z"/><path d="M8 10h8M8 13.5h5"/>',
search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>',
check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>', x:'<path d="M6 6l12 12M18 6 6 18"/>',
left:'<path d="M15 5l-7 7 7 7"/>', right:'<path d="m9 5 7 7-7 7"/>', arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
pin:'<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
camera:'<path d="M3 8a2 2 0 0 1 2-2h2.5l1.5-2h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
inbox:'<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
chart:'<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
file:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
clipboard:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/>',
bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
refresh:'<path d="M20 11a8 8 0 0 0-14.5-4.5L3 9M4 13a8 8 0 0 0 14.5 4.5L21 15"/><path d="M3 4v5h5M21 20v-5h-5"/>',
eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
alert:'<path d="M12 3 2 20h20z"/><path d="M12 10v4.5M12 17.5h.01"/>',
info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
send:'<path d="M4 12 20 4l-6 16-3-7z"/><path d="m11 13 9-9"/>',
list:'<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
star:'<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/>',
cart:'<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="9.5" cy="20.5" r="1"/><circle cx="17.5" cy="20.5" r="1"/>',
factory:'<path d="M3 21V10l5 3V10l5 3V7l8 5v9z"/><path d="M7 17h.01M12 17h.01M17 17h.01"/>',
net:'<circle cx="12" cy="12" r="2.2"/><circle cx="5" cy="6" r="1.8"/><circle cx="19" cy="6" r="1.8"/><circle cx="5" cy="18" r="1.8"/><circle cx="19" cy="18" r="1.8"/><path d="M6.4 7.2 10.3 10.6M17.6 7.2l-3.9 3.4M6.4 16.8l3.9-3.4M17.6 16.8l-3.9-3.4"/>',
award:'<circle cx="12" cy="9" r="5"/><path d="M8.5 13 7 22l5-2.5L17 22l-1.5-9"/>',
spark:'<path d="m12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
scan:'<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3M3 12h18"/>',
gauge:'<path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 18 4-6"/>',
flame:'<path d="M12 21c-4 0-6.5-2.6-6.5-6 0-3.5 3-5.5 3.5-9 2 1.5 3 3 3 5 1-1 1.5-2 1.5-3.5 2 1.5 5 4.5 5 7.5 0 3.4-2.5 6-6.5 6z"/>',
sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
moon:'<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/>',
link:'<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
xl:'<path d="M5 5l14 14M19 5 5 19"/>'
};
const I=(n,c='')=>`<svg class="ic ${c}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]||''}</svg>`;

/* =====================================================================
   THE ONLY DATA IN THE DEMO. One factory, its people, one customer,
   one order, one short part and the three foundries that could make it.
   ===================================================================== */
const FACTORY={name:'Kaveri Pumps & Castings',short:'Kaveri Pumps',town:'Peenya, Bengaluru',gstin:'29AAGCK4521M1ZQ'};
const PEOPLE={priya:{name:'Priya Raghavan',role:'Purchase manager',mark:'PR',limit:150000},arun:{name:'Arun Venkatesh',role:'Owner',mark:'AV'},
  ganeshm:{name:'Ganesh Murthy',role:'Stores'},latha:{name:'Latha Nagaraj',role:'Quality'},suresh:{name:'Suresh Kumar',role:'Shop floor'},deepa:{name:'Deepa Shenoy',role:'Accounts'}};
const CUSTOMER={name:'Sri Venkateswara Agro',town:'Anantapur, Andhra Pradesh',gstin:'37AABCS4412K1ZN',terms:30,limit:2500000,outstanding:398000,km:220};
const ORDER={no:'SO-2627-0291',custPo:'SVA/PO/26-27/118',item:'Pump, 6 in end suction',code:'KP-PMP-6ES',qty:80,price:17200,due:'2026-10-23',hsn:'8413'};
const TAXABLE=ORDER.qty*ORDER.price, IGST=Math.round(TAXABLE*0.18), INVOICE_TOTAL=TAXABLE+IGST;
const BOM=[
  {code:'KP-BDY-150',name:'Pump body casting, GG25',per:1,stock:20,cost:2800,bin:'C-01-1'},
  {code:'KP-IMP-210',name:'Impeller, SS304, Ø210',per:1,stock:96,cost:3120,bin:'C-02-3'},
  {code:'KP-SHF-032',name:'Impeller shaft, EN19',per:1,stock:110,cost:412,bin:'B-04-1'},
  {code:'KP-SEA-032',name:'Mechanical seal, 32 mm',per:1,stock:84,cost:1590,bin:'A-01-2'},
  {code:'KP-BRG-6206',name:'Bearing 6206 2RS',per:2,stock:240,cost:140,bin:'A-03-4'},
  {code:'KP-FST-M12',name:'Hex bolt M12 × 60',per:8,stock:2400,cost:9,bin:'A-05-1'}
];
const SHORT=BOM[0];
const NEED_QTY=ORDER.qty*SHORT.per-SHORT.stock; /* 60 */
const RFQ={no:'RFQ-2627-0114',need:'2026-10-12',replyBy:'2026-10-03'};
/* A supplier's on-time and rejection rates are never typed. They are counted from
   Kaveri's own goods receipts and incoming inspections, so they move when this order
   is received. A supplier that runs XELOR also shares live capacity, read not claimed. */
const SUP={
  ganesh:{name:'Sri Ganesh Castings',short:'Sri Ganesh',town:'Hosur, Tamil Nadu',km:38,vendor:true,
    hist:{deliveries:18,onTimeN:17,pieces:1140,rejected:10,since:'Mar 2026'},
    xelor:{booked:62,free:'4 pours free before 9 Oct',line:'Furnace 2'},reply:'3 h',msme:'Micro',contact:'M. Ganesan',mark:'SG',tint:'#9a6a26',live:true},
  anand:{name:'Anand Engineering Industries',short:'Anand Engineering',town:'Ambattur, Chennai',km:340,vendor:true,
    hist:{deliveries:25,onTimeN:22,pieces:1850,rejected:44,since:'Nov 2025'},reply:'9 h',msme:'Small',mark:'AE',tint:'#1e3e66',
    auto:{unit:2690,freight:4800,date:'2026-10-10',note:'Your pattern is already at our foundry, so no tooling charge.',after:2400}},
  veera:{name:'Veerabhadra Castings',short:'Veerabhadra',town:'Belagavi, Karnataka',km:500,vendor:false,hist:null,reply:'6 h',msme:'Small',mark:'VC',tint:'#5b3a6e',
    auto:{unit:2610,freight:5600,date:'2026-10-11',note:'Cheapest per piece. Your pattern would have to be couriered to Belagavi.',after:4400}}
};
const QPLAN={no:'QP-BDY-150 rev 2',checks:[['Flange face flatness','0.10 mm','0.04–0.07 mm'],['Bore allowance','3 ± 0.5 mm','2.8–3.2 mm'],['Porosity on sealing face','None visible','None']],sample:'5 per lot'};
const KAVERI_REC={orders:45,onTimeN:41,since:'Apr 2026'};
const W={speed:0.40,cost:0.35,rec:0.25};
const SUP_ORDER=['ganesh','anand','veera'];
const START='2026-09-30T09:40';
const FTESTS=[['Head at duty point','32 m ± 3%'],['Flow at duty point','60 m³/h ± 5%'],['Hydro test, 1.5× pressure','no weep for 5 min'],['Vibration and noise','under 4.5 mm/s']];

/* The nine stations the order passes through: the route card is the spine. */
const STAGES=[
  {k:'order',name:'Order',who:'Sales'},{k:'plan',name:'Plan',who:'Planning'},{k:'ask',name:'Ask suppliers',who:'Supplier network'},
  {k:'award',name:'Award',who:'Supplier network'},{k:'approve',name:'Approve',who:'Owner'},{k:'receive',name:'Receive',who:'Stores & quality'},
  {k:'make',name:'Make',who:'Production'},{k:'dispatch',name:'Dispatch',who:'Dispatch'},{k:'books',name:'Books',who:'Accounts'}
];

const ROLES={
  pur:{name:'Purchase',who:'Priya Raghavan · Purchase manager',dev:'laptop',home:'p.home',cls:'r-pur',ic:'cart',surface:'XELOR portal · sales, planning & purchase',host:'kaveri.xelor.in'},
  sup:{name:'Supplier',who:'Sri Ganesh Castings · Hosur',dev:'phone',home:'s.chat',cls:'r-sup',ic:'msg',surface:'A message with a link · no login, no app',host:'kaveri.xelor.in',tag:'NO LOGIN'},
  own:{name:'Owner',who:'Arun Venkatesh · Owner',dev:'phone',home:'w.inbox',cls:'r-own',ic:'shield',surface:'XELOR Owner · installable web app',host:'owner.kaveri.xelor.in'},
  stores:{name:'Stores & QC',who:'Ganesh Murthy · Latha Nagaraj',dev:'tablet',home:'t.gate',cls:'r-stores',ic:'box',surface:'Stores & quality · tablet at the gate',host:'kaveri.xelor.in'},
  floor:{name:'Shop floor',who:'Suresh Kumar · Assembly 1',dev:'phone',home:'m.jobs',cls:'r-floor',ic:'factory',surface:'XELOR Floor · installable web app',host:'floor.kaveri.xelor.in'},
  acct:{name:'Accounts',who:'Deepa Shenoy · Accounts',dev:'laptop',home:'a.dispatch',cls:'r-acct',ic:'book',surface:'Accounts & audit console',host:'kaveri.xelor.in'}
};
const PHONE_ROLES=['sup','own','floor'];

/* =====================================================================
   State
   ===================================================================== */
let TIMERS=[];
function fresh(){return{
  clock:START,stamped:{},justStamped:null,
  order:'received',planRun:false,
  rfq:{status:'none',to:[],quotes:{}},
  po:null,grn:null,dupScans:0,inspection:null,
  wo:null,tests:[false,false,false,false],dispatch:null,closed:false,
  log:[],supMsgs:[],ownerFeed:[],unread:{sup:0,own:0,floor:0},
  draft:{unit:'',date:'',freight:'',note:''},
  hist:JSON.parse(JSON.stringify(Object.fromEntries(SUP_ORDER.map(id=>[id,SUP[id].hist])))),
  bumped:null,offered:false,verified:false,seq:0,
  shared:false,invited:{},claimed:{},treds:false,voice:false,dispute:false,early:false,bookings:{}
}}
let S=fresh();
const UI0=()=>({role:'pur',dev:'laptop',scr:Object.fromEntries(Object.entries(ROLES).map(([k,v])=>[k,v.home])),hist:{sup:[],own:[],floor:[]},tour:-1,
  finish:'orange',pick:{ganesh:true,anand:true,veera:true},lastScr:null,lastRole:null,navDir:null,tabIdx:{},flip:false});
let ui=UI0();

/* ---------- the earned record ---------- */
const H=id=>S.hist[id];
const onTimePct=id=>H(id)&&H(id).deliveries?H(id).onTimeN/H(id).deliveries*100:null;
const rejPct=id=>H(id)&&H(id).pieces?H(id).rejected/H(id).pieces*100:null;
/* Track record 0–1: on-time share counts 70%; rejects 30%, where 0% is full marks and
   5% or worse is nothing. No deliveries means no record: it scores 0 and says unproven. */
function recScore(id){const o=onTimePct(id),r=rejPct(id);if(o==null)return 0;return 0.7*(o/100)+0.3*Math.max(0,1-r/5)}
function recLine(id){const o=onTimePct(id);if(o==null)return '<span><b>Unproven</b> · no deliveries to Kaveri yet</span>';
  return `<span><b>${Math.round(o)}%</b> on time over ${H(id).deliveries} deliveries · <b>${rejPct(id).toFixed(1)}%</b> rejected at our gate</span>`}
const vbadge=()=>`<span class="vbadge" title="Runs XELOR in its own shop, so capacity is read from live data">${I('shield')}Runs XELOR</span>`;
function capLine(id){const x=SUP[id].xelor;if(!x)return '<span class="cap"><span>Capacity: as they tell us on the phone</span></span>';
  return `<span class="cap"><span class="cb"><i style="width:${x.booked}%"></i></span><span>${esc(x.line)} ${x.booked}% booked · <em>${esc(x.free)}</em> · live</span></span>`}

/* ---------- clock and log ---------- */
const clockDate=()=>S.clock.slice(0,10);
function isoOf(d){const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes())}
function tick(min){const d=new Date(S.clock);d.setMinutes(d.getMinutes()+min);S.clock=isoOf(d)}
function jump(iso){if(iso>S.clock)S.clock=iso}
function tm(s){return new Date(s||S.clock).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'}).toLowerCase()}
function stamp(s){const x=s||S.clock;return dmy(x.slice(0,10))+', '+tm(x)}
function log(who,what,detail){S.log.unshift({at:S.clock,who,what,detail})}
function feed(text,sub){S.ownerFeed.unshift({at:S.clock,text,sub,n:++S.seq});if(ui.role!=='own')S.unread.own++}
function supMsg(m){S.supMsgs.push(Object.assign({at:S.clock,n:++S.seq},m));if(ui.role!=='sup'||ui.scr.sup!=='s.chat')S.unread.sup++}

/* ---------- stations ---------- */
function stageDone(i){switch(STAGES[i].k){
  case 'order':return S.order!=='received';
  case 'plan':return S.planRun;
  case 'ask':return S.rfq.status!=='none';
  case 'award':return !!S.po;
  case 'approve':return !!S.po&&S.po.status==='approved';
  case 'receive':return S.inspection==='pass';
  case 'make':return !!S.wo&&S.wo.status==='done';
  case 'dispatch':return !!S.dispatch&&!!S.dispatch.irn;
  case 'books':return S.closed;}}
const current=()=>{for(let i=0;i<STAGES.length;i++)if(!stageDone(i))return i;return STAGES.length};
function sweep(){STAGES.forEach((s,i)=>{if(stageDone(i)&&!S.stamped[i]){S.stamped[i]=S.clock;S.justStamped=i}if(!stageDone(i)&&S.stamped[i])delete S.stamped[i]})}
/* What to do next, and where: used by empty states and the owner's progress ring. */
function nextStep(){const c=current();
  const N=[
    {t:'Confirm the customer’s order',b:'Open the sales order',go:'p.sales'},
    {t:'Check materials',b:'Open the material check',go:'p.plan'},
    {t:'Ask foundries for a price',b:'Open the supplier network',go:'p.net'},
    S.rfq.to.includes('ganesh')&&!S.rfq.quotes.ganesh?{t:'Answer as Sri Ganesh, then award',b:'Open Sri Ganesh’s phone',go:'s.quote'}:{t:'Award the top-ranked answer',b:'Open the ranked answers',go:'p.net'},
    {t:'Approve the purchase order',b:'Open Arun’s phone',go:'w.po'},
    S.grn&&!S.grn.pending?{t:'Inspect the castings',b:'Open incoming inspection',go:'t.qc'}:{t:'Receive the castings at the gate',b:'Open the gate',go:'t.gate'},
    {t:'Make the 80 pumps',b:'Open the work order',go:'m.wo'},
    {t:'Dispatch and invoice',b:'Open dispatch',go:'a.dispatch'},
    {t:'Check the books and close',b:'Open the ledger',go:'a.books'}];
  return c>=N.length?{t:'Order closed',b:'See the books',go:'a.books',done:true}:N[c]}

/* =====================================================================
   Ranking. Computed, never typed: delivery 40%, landed price 35%,
   track record 25%. An answer promised after the need date is unusable.
   ===================================================================== */
function ranked(){
  const rows=Object.keys(S.rfq.quotes).map(id=>{const q=S.rfq.quotes[id];const landed=q.unit*NEED_QTY+(q.freight||0);const late=!!q.date&&q.date>RFQ.need;const lead=q.date?Math.max(1,days('2026-09-30',q.date)):null;return Object.assign({id,s:SUP[id],landed,late,lead},q)});
  const usable=rows.filter(r=>!r.late);const best=usable.length?Math.min(...usable.map(r=>r.landed)):0;
  const dated=usable.filter(r=>r.lead);const bestLead=dated.length?Math.min(...dated.map(r=>r.lead)):0;
  rows.forEach(r=>{r.cost=best?Math.min(1,best/r.landed):0;r.speed=r.late||!r.lead?0:bestLead/r.lead;r.rec=recScore(r.id);
    r.expRej=rejPct(r.id)==null?null:NEED_QTY*rejPct(r.id)/100;r.score=r.late?-1:W.speed*r.speed+W.cost*r.cost+W.rec*r.rec});
  rows.sort((a,b)=>b.score-a.score||a.landed-b.landed);let n=0;rows.forEach(r=>{r.rank=r.late?null:++n});return rows}

/* ---------- toasts, island, veil ---------- */
let QUIET=false;
function toast(msg,sub='',tone='ok'){if(QUIET)return;const box=$('#toasts');const t=document.createElement('div');t.className='toast '+tone;
  const ic={ok:'check',bad:'x',warn:'alert',info:'info'}[tone]||'check';
  t.innerHTML=`<span class="ti ${tone}">${I(ic)}</span><span><b>${esc(msg)}</b>${sub?`<small>${esc(sub)}</small>`:''}</span>`;
  box.appendChild(t);while(box.children.length>3)box.firstChild.remove();setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),400)},4200)}
/* Dynamic Island live activity: a phone that is on screen gets its notification in the island. */
let islandTimer=null;
function island(role,title,text,ic='msg'){if(QUIET||ui.role!==role||ui.dev!=='phone')return;
  TIMERS.push(setTimeout(()=>{const el=$('#frame .island');if(!el)return;
    el.innerHTML=`<i></i><div class="la"><span class="li">${I(ic)}</span><div><b>${esc(title)}</b><small>${esc(text)}</small></div><span class="now">now</span></div>`;
    requestAnimationFrame(()=>el.classList.add('live'));clearTimeout(islandTimer);
    islandTimer=setTimeout(()=>{el.classList.remove('live')},3800)},380))}
function veil(when,title,text){if(QUIET)return;const d=new Date(when);const o=$('#overlay');
  o.innerHTML=`<div class="veil" data-veil><div class="skip"><div class="cal"><i>${d.toLocaleDateString('en-IN',{month:'short'})}</i><b>${d.getDate()}</b></div><small>${esc(title)}</small><h2>${d.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})}</h2><p>${esc(text)}</p></div></div>`;
  const close=()=>{const v=o.querySelector('.veil');if(v){v.classList.add('out');setTimeout(()=>{o.innerHTML=''},420)}};
  TIMERS.push(setTimeout(close,reduceMotion()?400:1900));$('#clockchip')?.classList.add('tick');setTimeout(()=>$('#clockchip')?.classList.remove('tick'),1300)}

/* =====================================================================
   Actions. Each one changes state, writes the activity log and, where a
   person elsewhere would be told, puts a message on their phone. All are
   idempotent, so the tour can replay them.
   ===================================================================== */
const A={
  confirmOrder(){if(S.order!=='received')return;tick(6);S.order='confirmed';
    log('Priya Raghavan','Confirmed '+ORDER.no,`${ORDER.qty} × ${ORDER.item} for ${CUSTOMER.name} · ${inr(TAXABLE)} before tax · credit check passed`);
    feed('New order confirmed',`${ORDER.qty} pumps for ${CUSTOMER.name} · ${inr(INVOICE_TOTAL)}`);
    toast('Order confirmed','Planning, stores and accounts can already see it. Nobody retypes it.')},
  runPlan(){if(S.order==='received'||S.planRun)return;tick(2);S.planRun=true;
    log('XELOR Agent','Checked materials for '+ORDER.no,`6 parts checked against stock · 1 short: ${NEED_QTY} × ${SHORT.name}`);
    feed('One part is short',`${NEED_QTY} pump bodies needed for ${ORDER.no}`);
    toast('Material check done',`${NEED_QTY} pump body castings are short. Everything else is on the shelf.`,'warn')},
  sendRfq(){if(!S.planRun||S.rfq.status!=='none')return;const picks=SUP_ORDER.filter(id=>ui.pick[id]);
    if(!picks.length){toast('Choose at least one supplier','A request needs somebody to answer it.','warn');return}
    tick(5);S.rfq.status='sent';S.rfq.to=picks;
    log('Priya Raghavan',`Sent ${RFQ.no} to ${picks.length} supplier${picks.length>1?'s':''}`,`${NEED_QTY} × ${SHORT.name} · needed by ${dmyy(RFQ.need)} · message composed, not delivered`);
    if(picks.includes('ganesh')){supMsg({kind:'rfq'});island('sup','Kaveri Pumps via XELOR',`New request: ${NEED_QTY} pump body castings`)}
    picks.filter(id=>SUP[id].auto).forEach(id=>TIMERS.push(setTimeout(()=>{if(A.arrive(id)){render({flip:true})}},SUP[id].auto.after)));
    toast(`Request sent to ${picks.length} supplier${picks.length>1?'s':''}`,picks.includes('ganesh')?'Sri Ganesh answers on the phone. The others reply on their own.':'Their replies land here as they come in.')},
  arrive(id){if(S.rfq.status!=='sent'||S.rfq.quotes[id]||!S.rfq.to.includes(id))return false;const a=SUP[id].auto;if(!a)return false;tick(id==='anand'?25:30);
    S.rfq.quotes[id]={unit:a.unit,freight:a.freight,date:a.date,note:a.note,at:S.clock,fresh:true};
    log(SUP[id].name,'Answered '+RFQ.no,`${inr2(a.unit)} per piece · delivery ${dmyy(a.date)} · simulated reply`);
    toast(SUP[id].short+' answered',`${inr2(a.unit)} per piece, delivery ${dmy(a.date)}. The ranking has updated.`,'info');A.allIn();return true},
  arriveAll(){SUP_ORDER.forEach(id=>{if(SUP[id].auto)A.arrive(id)})},
  allIn(){const n=Object.keys(S.rfq.quotes).length;if(n&&n===S.rfq.to.length)feed('All answers are in',`${n} prices for ${NEED_QTY} pump bodies, ranked`)},
  fillQuote(){S.draft.unit='2760';S.draft.date='2026-10-09';S.draft.freight='2400'},
  sendQuote(){if(S.rfq.status!=='sent'||!S.rfq.to.includes('ganesh'))return;const unit=Number(String(S.draft.unit).replace(/,/g,''));
    if(!(unit>0)){toast('Enter a price per piece','It’s the only field a supplier has to fill in.','warn');return}
    const freight=Number(String(S.draft.freight).replace(/,/g,''))||0;const had=S.rfq.quotes.ganesh;const before=had?ranked().find(r=>r.id==='ganesh'):null;
    tick(had?4:12);Object.values(S.rfq.quotes).forEach(q=>{q.fresh=false});
    S.rfq.quotes.ganesh={unit,freight,date:S.draft.date||null,note:'Pattern is with us. Can pour this week.',at:S.clock,fresh:true};
    const after=ranked().find(r=>r.id==='ganesh');
    log('Sri Ganesh Castings',(had?'Changed their quote on ':'Answered ')+RFQ.no,`${inr2(unit)} per piece · ${S.draft.date?'delivery '+dmyy(S.draft.date):'no date given'} · from the phone, no login`);
    supMsg({kind:'sent',unit,landed:after.landed,date:S.draft.date});A.allIn();
    const place=r=>r.late?'can’t be used, it’s after '+dmy(RFQ.need):'ranked '+r.rank+' of '+ranked().filter(x=>!x.late).length;
    toast('Quote sent',`On Priya’s screen it ${before&&before.rank===after.rank&&before.late===after.late?'is still ':'is now '}${place(after)}. The supplier never sees the ranking.`)},
  award(id){if(S.rfq.status!=='sent')return;const r=ranked().find(x=>x.id===id);if(!r)return;const s=SUP[id];
    if(!s.vendor){log('XELOR',`Refused to award ${RFQ.no} to ${s.name}`,'On the network but not an approved vendor · no purchase order raised');
      toast(`Refused: ${s.name} isn’t an approved vendor`,'Anyone on the network can be asked for a price. A purchase order can only go to an approved vendor.','bad');return}
    if(r.late){toast('Refused: it misses the need date',`Promised ${dmy(r.date)}, needed by ${dmy(RFQ.need)}.`,'bad');return}
    tick(5);const exGst=r.landed,gst=Math.round(exGst*0.18),needsOwner=exGst>PEOPLE.priya.limit;S.rfq.status='awarded';
    S.po={no:'PO-2627-00415',sup:id,unit:r.unit,freight:r.freight||0,exGst,gst,total:exGst+gst,promised:r.date||RFQ.need,status:needsOwner?'awaiting':'approved',needsOwner,rank:r.rank,raised:S.clock};
    log('Priya Raghavan',`Awarded ${RFQ.no} to ${s.name}`,`Ranked ${r.rank} · ${inr(exGst)} before GST · raised ${S.po.no}`);
    if(id==='ganesh')supMsg({kind:'won'});else if(S.rfq.to.includes('ganesh'))supMsg({kind:'lost'});
    if(needsOwner){feed('Approval needed: '+S.po.no,`${inr(exGst)} to ${s.name} · above Priya’s limit`);island('own','Approval needed',`${S.po.no} · ${inr(exGst)} · ${s.short}`,'bell');
      toast(S.po.no+' raised. It needs Arun’s approval',`${inr(exGst)} is above Priya’s ${inr(PEOPLE.priya.limit)} limit, so it went to the owner’s phone.`,'info')}
    else{tick(1);A._approved('Priya Raghavan','within her '+inr(PEOPLE.priya.limit)+' limit');toast(S.po.no+' raised and approved','Within Priya’s limit, so no second signature was needed.')}},
  _approved(by,why){S.po.status='approved';S.po.approvedBy=by;log(by,'Approved '+S.po.no,`${inr(S.po.exGst)} to ${SUP[S.po.sup].name} · ${why}`);if(S.po.sup==='ganesh'){supMsg({kind:'po'});island('sup','Kaveri Pumps via XELOR',S.po.no+' is confirmed')}},
  approve(){if(!S.po||S.po.status!=='awaiting')return;tick(20);A._approved('Arun Venkatesh','decided on the phone');
    S.ownerFeed.unshift({at:S.clock,text:'You approved '+S.po.no,sub:inr(S.po.exGst)+' to '+SUP[S.po.sup].short,n:++S.seq});
    toast('Approved on the phone',S.po.no+' now reads Approved on Priya’s laptop, and the supplier has been told.')},
  sendBack(){if(!S.po||S.po.status!=='awaiting')return;tick(10);
    log('Arun Venkatesh','Sent back '+S.po.no,'The award is undone. The answers stay ranked, so another can be chosen.');
    if(S.po.sup==='ganesh')supMsg({kind:'pulled'});S.po=null;S.rfq.status='sent';
    toast('Sent back to Priya','The award is undone and the answers are still ranked. Award again to continue.','warn')},
  truck(){if(!S.po||S.po.status!=='approved'||S.grn)return;const when=S.po.promised+'T11:20';const gap=days(clockDate(),S.po.promised);jump(when);
    S.grn={no:'GRN-2627-1195',pending:true};
    log('Security gate','Delivery arrived for '+S.po.no,`${NEED_QTY} × ${SHORT.name} · challan and e-way bill with the driver`);
    veil(when,'The truck is at the gate',`${gap} days later. ${SUP[S.po.sup].short} has delivered ${NEED_QTY} castings.`)},
  scan(){if(!S.grn)return;
    if(!S.grn.pending){S.dupScans++;log('XELOR','Refused a second scan of the same challan',`Same idempotency key as ${S.grn.no} · nothing posted`);
      toast('Refused: this challan is already received','Scanning twice does nothing. That keeps the count and the books the same.','bad');return}
    tick(8);S.grn.pending=false;S.grn.at=S.clock;const hs=H(S.po.sup);
    if(hs){hs.deliveries++;if(clockDate()<=S.po.promised)hs.onTimeN++}else S.hist[S.po.sup]={deliveries:1,onTimeN:clockDate()<=S.po.promised?1:0,pieces:0,rejected:0,since:'Oct 2026'};
    S.bumped=S.po.sup;
    log('Ganesh Murthy, stores',`Received ${NEED_QTY} against ${S.po.no}`,`${S.grn.no} · into bin ${SHORT.bin} · held for inspection · counted on time in ${SUP[S.po.sup].short}’s record`);
    toast(`Received ${NEED_QTY} castings, on time`,`Stock went up but is held for quality. ${SUP[S.po.sup].short}’s on-time record now reads ${Math.round(onTimePct(S.po.sup))}% over ${H(S.po.sup).deliveries} deliveries.`)},
  inspect(res){if(!S.grn||S.grn.pending||S.inspection==='pass')return;
    if(res==='reject'){toast('In the full product this raises a finding','The lot is held, the supplier is told, and rejected pieces count against their record. Pass the lot to keep this demo moving.','info');return}
    tick(40);S.inspection='pass';H(S.po.sup).pieces+=NEED_QTY;S.bumped=S.po.sup;
    log('Latha Nagaraj, quality','Passed incoming inspection',`5 of ${NEED_QTY} sampled against ${QPLAN.no} · within limits · lot released · 0 rejected added to ${SUP[S.po.sup].short}’s record`);
    if(S.po.sup==='ganesh')supMsg({kind:'received'});feed('Castings received and passed',`${NEED_QTY} pump bodies released to production`);
    toast('Lot passed and released',`${SUP[S.po.sup].short}’s rejection rate is now ${rejPct(S.po.sup).toFixed(2)}% over ${nos(H(S.po.sup).pieces)} pieces. Nobody typed that number.`)},
  release(){if(S.inspection!=='pass'||S.wo)return;const when=addDays(S.po.promised,1)+'T08:30';jump(when);
    S.wo={no:'WO-2627-0918',status:'issued',made:0};
    log('Suresh Kumar, shop floor',`Released ${S.wo.no} and issued materials`,`6 parts for ${ORDER.qty} pumps issued through the stock ledger`);
    veil(when,'Next morning',`Every part for ${ORDER.qty} pumps is on the shelf. ${S.wo.no} is released.`)},
  output(){if(!S.wo||S.wo.status!=='issued')return;const when=addDays(S.po.promised,5)+'T17:10';jump(when);S.wo.status='made';S.wo.made=ORDER.qty;
    log('Suresh Kumar, shop floor','Recorded output on '+S.wo.no,ORDER.qty+' made · 0 scrap');
    veil(when,'Four days on the floor',`${ORDER.qty} pumps assembled on Assembly 1. Final test is next.`)},
  test(i){if(!S.wo||S.wo.status!=='made')return;S.tests[i]=!S.tests[i]},
  finalTest(){if(!S.wo||S.wo.status!=='made'||!S.tests.every(Boolean))return;tick(30);S.wo.status='done';
    log('Latha Nagaraj, quality','Passed final test',`${ORDER.qty} of ${ORDER.qty} pumps · head, flow, hydro and vibration within tolerance`);
    feed(ORDER.qty+' pumps ready to ship',`${ORDER.no} · ${days(clockDate(),ORDER.due)} days before the due date`);
    toast('Final test passed',`${ORDER.qty} pumps are ready. Accounts can dispatch and invoice.`)},
  dispatch(){if(!S.wo||S.wo.status!=='done'||S.dispatch)return;const when=addDays(S.po.promised,6)+'T10:00';jump(when);
    S.dispatch={dn:'DN-2627-0288',inv:'INV-2627-0781',at:S.clock,irn:null,running:true}},
  finishDispatch(){if(!S.dispatch||!S.dispatch.running)return;S.dispatch.running=false;
    log('Deepa Shenoy, accounts','Dispatched '+ORDER.no,`${S.dispatch.dn} and ${S.dispatch.inv} · ${inr(INVOICE_TOTAL)} · stock, invoice, receivable and ledger in one transaction`);
    feed('Order dispatched and invoiced',`${inr(INVOICE_TOTAL)} due from ${CUSTOMER.name}`);
    toast('Four records, one transaction','Delivery note, GST invoice, receivable and ledger entry were written together.')},
  irn(){if(!S.dispatch||S.dispatch.running||S.dispatch.irn)return;tick(2);
    S.dispatch.irn=hx('IRN'+ORDER.no).slice(0,16);S.dispatch.ewb='1812 '+hx('EWB').replace(/\D/g,'').slice(0,4).padEnd(4,'7')+' '+hx('EWB2').replace(/\D/g,'').slice(0,4).padEnd(4,'3');
    log('XELOR','Requested IRN and e-way bill','Simulated in this demo · no GST provider connected');
    toast('IRN and e-way bill attached','Simulated here. In the product these come from a licensed GST provider.','info')},
  close(){if(!stageDone(7)||S.closed)return;tick(5);S.closed=true;
    log('Deepa Shenoy, accounts','Closed '+ORDER.no,'Order, purchase, receipt, production, dispatch and books all linked');
    feed('Order closed',ORDER.no+' · typed once, carried through nine stations');
    toast('Order closed','Every station on the route card is stamped.')},
  offer(){if(S.offered)return;S.offered=true;
    log('Priya Raghavan','Offered Assembly 1 spare capacity on the network','3 free shifts, week of 26 Oct · read from Kaveri’s own schedule · proposed feature, nothing published');
    toast('Offered on the network (proposed feature)','Other XELOR shops would see 3 free shifts on Assembly 1, backed by Kaveri’s earned record. Nothing is published in this demo.','info')},
  invite(id){if(S.invited[id])return;S.invited[id]=true;log('XELOR Agent','Invited '+SUP[id].name+' to claim its record','No deliveries to Kaveri yet · free supplier record · a 10-piece trial order is suggested');toast(SUP[id].short+' invited','It gets a free record. Its first delivery to Kaveri starts the count.')},
  claim(id){if(!S.invited[id]||S.claimed[id])return;S.claimed[id]=true;log(SUP[id].name,'Claimed its XELOR record','Free supplier tier · now quotes, records and capacity in one place');toast(SUP[id].short+' claimed its record','One more supplier on the network. Its record reads unproven until the first delivery is counted.')},
  share(){if(S.shared)return;S.shared=true;log('Priya Raghavan','Shared Kaveri’s passport with Deccan Agro Equipment','Read-only link · on-time, returns, supplier payments, spare capacity · prices and customers stay private');toast('Passport shared with Deccan Agro Equipment','They see the record, verified by XELOR. They never see your prices or customers.')},
  treds(){if(!S.grn||S.grn.pending||S.treds)return;tick(3);S.treds=true;log('Deepa Shenoy, accounts','Uploaded Sri Ganesh’s invoice to TReDS',`${inr(S.po.total)} · due ${dmyy(addDays(S.po.promised,45))} · simulated platform`);if(S.po.sup==='ganesh')supMsg({kind:'treds'});toast('Invoice on TReDS (simulated)','Sri Ganesh can take early payment. Kaveri’s on-time payment counts in its passport.')},
  voice(){S.voice=true;A.fillQuote()},
  dispute(){S.dispute=!S.dispute;toast(S.dispute?'Dispute raised':'Dispute withdrawn',S.dispute?'Kaveri’s stores team has 3 days to answer. The entry shows as disputed until then.':'The entry counts as recorded.',S.dispute?'info':'ok')},
  early(){if(S.early)return;S.early=true;toast('Early payment requested (simulated)','Discounted on a TReDS platform against Kaveri’s accepted invoice. Indicative, not a quote.','info')},
  book(id){if(S.bookings[id])return;S.bookings[id]=true;log('Priya Raghavan','Requested capacity from '+id,'Booked through the network · confirmed in the thread · XELOR takes no cut');toast('Booking requested','They confirm in the message thread. XELOR takes no cut of the booking.')},
  verify(){S.verified=true;toast('Audit chain verified',`${S.log.length} entries · every hash links to the one before it.`)}
};
/* short deterministic hash for idempotency keys and the audit chain (FNV-1a, display only) */
function hx(s,n=64){let out='';for(let r=0;out.length<n;r++){let h=(0x811c9dc5^r)>>>0;for(const c of s+'#'+r){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0}out+=h.toString(16).padStart(8,'0')}return out.slice(0,n)}
const hshort=h=>h.slice(0,8)+'…'+h.slice(-6);

/* =====================================================================
   Tour — 13 steps, each a role + screen, idempotent run() for “Do it for me”
   ===================================================================== */
const TOUR=[
  {role:'pur',scr:'p.sales',st:'Order',k:'Purchase',t:'Priya confirms the customer’s order, once',p:`Sri Venkateswara Agro emailed a PO for ${ORDER.qty} pumps. The credit check runs before confirming. Planning, stores, production and accounts all read this one record from here on.`,hint:'Tap “Confirm order”',done:()=>S.order!=='received',run:()=>A.confirmOrder()},
  {role:'pur',scr:'p.plan',st:'Plan',k:'Planning',t:'XELOR explodes 80 pumps into parts and checks the shelf',p:`Six parts against this morning’s stock. One is short: ${NEED_QTY} pump body castings, needed by ${dmy(RFQ.need)} to ship on ${dmy(ORDER.due)}.`,hint:'Tap “Check materials”',done:()=>S.planRun,run:()=>A.runPlan()},
  {role:'pur',scr:'p.net',st:'Ask',k:'Supplier network',t:'The request writes itself from records XELOR holds',p:'Part, quantity, need date, drawing and the incoming quality plan are read from the item master, BOM and QP. Priya only chooses who to ask: each foundry shows its earned record and, if it runs XELOR, live capacity.',hint:'Tap “Send request”',done:()=>S.rfq.status!=='none',run:()=>A.sendRfq()},
  {role:'sup',scr:'s.quote',st:'Quote',k:'Supplier',t:'Sri Ganesh quotes from a message link, with no login',p:'Price per piece is the only required field. The foundry sees how the castings will be judged before quoting, and its own record with Kaveri. It never sees the ranking.',hint:'Fill ₹2,760 → Send quote',done:()=>!!S.rfq.quotes.ganesh,run:()=>{A.fillQuote();A.sendQuote()}},
  {role:'pur',scr:'p.net',st:'Award',k:'Ranking',t:'Answers come back ranked, with the reasoning written out',p:'Delivery 40%, landed cost 35%, track record 25%. Veerabhadra is cheapest per piece but unproven and not an approved vendor, so it can be compared and never awarded. XELOR explains; Priya decides.',hint:'Tap “Award” on the top answer',done:()=>!!S.po,run:()=>{A.arriveAll();const top=ranked().find(r=>!r.late&&r.s.vendor);if(top)A.award(top.id)},enter:()=>{const q=QUIET;QUIET=true;A.arriveAll();QUIET=q}},
  {role:'own',scr:'w.po',st:'Approve',k:'Owner',t:'Above Priya’s limit, so it lands on Arun’s phone',p:`₹1,50,000 is Priya’s limit and the person who awards never approves. Arun sees why it’s with him, the ranking and the supplier’s record, then signs with one tap.`,hint:'Tap “Approve”',done:()=>!!S.po&&S.po.status==='approved',run:()=>A.approve()},
  {role:'stores',scr:'t.gate',st:'Receive',k:'Stores',t:'The truck arrives; one scan posts the receipt',p:'Receiving moves stock, valuation and the supplier’s on-time record in one step. Scan the same challan twice and the second is refused, so nothing is ever counted double.',hint:'Skip to delivery → Scan the challan',done:()=>!!S.grn&&!S.grn.pending,run:()=>{A.truck();A.scan()}},
  {role:'stores',scr:'t.qc',st:'Inspect',k:'Quality',t:'Latha passes the lot against the written quality plan',p:'Five castings sampled against QP-BDY-150 rev 2. Passing releases the stock, and the supplier’s rejection rate updates from this inspection. Nobody types that number.',hint:'Tap “Pass the lot”',done:()=>S.inspection==='pass',run:()=>A.inspect('pass')},
  {role:'floor',scr:'m.wo',st:'Release',k:'Shop floor',t:'The work order releases only when every part is on the shelf',p:'Suresh releases WO-2627-0918 and issues six parts for 80 pumps through the one stock ledger. The floor never starts a job it can’t finish.',hint:'Tap “Release and issue”',done:()=>!!S.wo,run:()=>A.release()},
  {role:'floor',scr:'m.wo',st:'Make',k:'Shop floor',t:'80 made, then every pump is tested',p:'Output is recorded against the work order, then final test checks head, flow, hydro pressure and vibration. Quality signs; the order is ready to ship eight days early.',hint:'Record output → tick 4 tests → Pass',done:()=>!!S.wo&&S.wo.status==='done',run:()=>{A.output();S.tests=[true,true,true,true];A.finalTest()}},
  {role:'acct',scr:'a.dispatch',st:'Dispatch',k:'Accounts',t:'Dispatch writes four records in one transaction',p:'Delivery note, GST invoice with IGST, the receivable and the ledger voucher are written together or not at all. There is no half-finished paperwork to chase.',hint:'Tap “Dispatch and invoice”',done:()=>!!S.dispatch&&!S.dispatch.running,run:()=>{A.dispatch();A.finishDispatch()}},
  {role:'acct',scr:'a.dispatch',st:'IRN',k:'Accounts',t:'IRN and e-way bill make the invoice valid',p:'Turnover above ₹5 crore and goods over ₹50,000 crossing a state need both. Simulated here: the product files through a licensed GST provider that isn’t chosen yet.',hint:'Tap “Get IRN and e-way bill”',done:()=>!!S.dispatch&&!!S.dispatch.irn,run:()=>A.irn()},
  {role:'acct',scr:'a.books',st:'Books',k:'Accounts',t:'The books, written by events, then the order closes',p:'Every ledger line came from a dispatch or a receipt, never a typed journal, so it reconciles with the floor. The 45-day MSME clock for Sri Ganesh starts on the day the goods were accepted.',hint:'Tap “Close the order”',done:()=>S.closed,run:()=>A.close()}
,
  {role:'acct',scr:'a.books',st:'Pay',k:'Accounts',t:'The MSME clock: pay Sri Ganesh on time, through TReDS',p:'Sri Ganesh is a micro enterprise. The PO agreed 45 days, the most the MSMED Act allows; with nothing agreed it would be 15. Uploading the invoice to TReDS lets the foundry be paid early and keeps Kaveri’s deduction safe.',hint:'Tap “Upload to TReDS”',done:()=>S.treds,run:()=>A.treds()},
  {role:'pur',scr:'p.rec',st:'Invite',k:'Network',t:'Every request is an invitation: Veerabhadra claims its record',p:'Veerabhadra quoted but has no record with Kaveri, so it scored zero for track record. XELOR invites it to claim a free record; a small trial order starts it.',hint:'Tap “Invite to claim its record”',done:()=>!!S.invited.veera,run:()=>A.invite('veera')},
  {role:'pur',scr:'p.pass',st:'Passport',k:'Network',t:'Kaveri shares its passport with a new buyer',p:'Every shipment, return and supplier payment wrote Kaveri’s own record. It goes to a new buyer as a link: on time, returns, pays suppliers on time, spare capacity. Prices and customers stay private.',hint:'Tap “Share passport”',done:()=>S.shared,run:()=>A.share()}
];
function ensureUpTo(i){const q=QUIET;QUIET=true;for(let j=0;j<i;j++){if(TOUR[j].enter)TOUR[j].enter();QUIET=true;if(!TOUR[j].done())TOUR[j].run()}QUIET=q}
function tourGo(i){if(i<0||i>=TOUR.length)return;ensureUpTo(i);ui.tour=i;const s=TOUR[i];if(s.enter)s.enter();setRole(s.role,true,false);ui.navDir=null;ui.scr[s.role]=s.scr;if(PHONE_ROLES.includes(s.role))ui.hist[s.role]=[];render();
  document.querySelector('.stagegrid')?.scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'nearest'})}
function tourNext(){const s=TOUR[ui.tour];if(s&&!s.done()){s.run();render();return}if(ui.tour<TOUR.length-1)tourGo(ui.tour+1);else{ui.tour=-2;render()}}

/* ---------- example views: every module shows something, even before the order reaches it ---------- */
/* A screen whose data doesn't exist yet is drawn from a copy of the demo run forward to that point.
   Nothing in the real demo changes; buttons in an example view are inert until you make it real. */
function previewOf(sc){const p=PV[sc.id];if(!p)return null;const [req]=p;return TOUR[req-1].done()?null:p}
function withState(st,fn){const s0=S,t0=TIMERS,q0=QUIET;S=st;TIMERS=[];QUIET=true;try{return fn()}finally{TIMERS.forEach(clearTimeout);S=s0;TIMERS=t0;QUIET=q0}}
function futureState(p){return withState(JSON.parse(JSON.stringify(S)),()=>{ensureUpTo(p[1]);A.arriveAll();if(p[2])p[2]();sweep();return S})}
function pvBanner(p){return `<div class="pvbar"><span class="pvi">${I('eye')}</span><div class="grow"><b>Example view</b><span>Filled in as if the order had reached this point. It becomes real after “${esc(TOUR[p[0]-1].t)}”.</span></div><button class="btn sm pvgo" data-jump="${p[0]}">Show it for real${I('arrow')}</button></div>`}
function jumpTo(n){ensureUpTo(n);toast('Done up to here','The steps before this screen ran, so it now shows the live order.');render()}

/* ---------- shell rendering ---------- */
function setRole(r,autoDev=true,doRender=true){if(ui.role!==r&&S.unread[r]!=null&&r!=='sup')S.unread[r]=0;ui.role=r;if(autoDev)ui.dev=ROLES[r].dev;if(r==='sup'&&ui.scr.sup==='s.chat')S.unread.sup=0;if(doRender)render()}
function go(id){const sc=SCREENS[id];if(!sc)return;const r=sc.role;if(r!==ui.role)setRole(r,true,false);
  if(PHONE_ROLES.includes(r)&&ui.scr[r]!==id){ui.hist[r].push(ui.scr[r]);ui.navDir='push'}else ui.navDir=null;
  ui.scr[r]=id;if(id==='s.chat')S.unread.sup=0;render()}
function back(){const r=ui.role,h=ui.hist[r];if(h&&h.length){ui.scr[r]=h.pop();ui.navDir='pop';render()}}
function renderTour(){
  const el=$('#tour');const n=TOUR.length;
  const bar=`<div class="tbar">${TOUR.map((s,i)=>`<button data-tour="${i}" data-st="${esc(s.st)}" class="${i===ui.tour?'cur':(s.done()?'done':'')}" aria-label="Step ${i+1}: ${esc(s.t)}" title="${i+1}. ${esc(s.t)}"></button>`).join('')}</div>`;
  if(ui.tour===-1){el.innerHTML=`<div class="tnum">${n}<small>STEPS</small></div><div class="ttxt"><div class="kick">The trusted supplier network · agentic AI ERP · XELOR Market</div><h2>Every delivery becomes a record nobody can type in.</h2><p>XELOR’s agents draft, chase and post the work inside the factory’s ERP. Every receipt and inspection writes the supplier’s record, and every shipment writes the factory’s passport. Follow one order for ${ORDER.qty} pumps across six people, then out onto XELOR Market and Xelogram, where those records find new buyers. Or pick any role and explore.</p>${bar}</div><div class="tctl"><button class="tbtn go" data-tour="start">${I('arrow')}Start the loop</button></div>`;return}
  if(ui.tour===-2){el.innerHTML=`<div class="tnum">${I('check')}</div><div class="ttxt"><div class="kick">Loop complete</div><h2>Typed once. Records earned. Now the market can see them.</h2><p>Sri Ganesh’s record moved because the castings arrived on time and passed, and it became a post buyers can trust. Kaveri’s passport moved because the pumps shipped ${S.dispatch?days(S.dispatch.at.slice(0,10),ORDER.due):8} days early, and it won a place on a buyer’s shortlist of five. XELOR never touched the money.</p>${bar}</div><div class="tctl"><button class="tbtn" data-tour="0">${I('refresh')}Replay</button><button class="tbtn go" data-go="p.pass">${I('shield')}Open the passport</button></div>`;return}
  const s=TOUR[ui.tour],dn=s.done();
  el.innerHTML=`<div class="tnum">${ui.tour+1}<small>OF ${n}</small></div><div class="ttxt"><div class="kick"><span class="rtag">${esc(s.k)}</span>${dn?'Done':'Try it'} · ${esc(s.hint)}</div><h2>${esc(s.t)}</h2><p>${esc(s.p)}</p>${bar}</div><div class="tctl"><button class="tbtn" data-tour="prev" ${ui.tour===0?'disabled':''}>${I('left')}Back</button><button class="tbtn go" data-tour="next">${dn?(ui.tour===n-1?'Finish':'Next step'):'Do it for me'}${I('arrow')}</button><button class="tbtn" data-tour="exit" aria-label="Exit tour">${I('x')}</button></div>`;
}
function roleAlert(r){
  if(r==='pur')return S.rfq.status==='sent'&&S.rfq.to.length>0&&S.rfq.to.every(id=>S.rfq.quotes[id]);
  if(r==='sup')return S.unread.sup>0||(S.rfq.status==='sent'&&S.rfq.to.includes('ganesh')&&!S.rfq.quotes.ganesh);
  if(r==='own')return !!S.po&&S.po.status==='awaiting';
  if(r==='stores')return !!S.po&&S.po.status==='approved'&&S.inspection!=='pass';
  if(r==='floor')return S.inspection==='pass'&&!(S.wo&&S.wo.status==='done');
  if(r==='acct')return !!S.wo&&S.wo.status==='done'&&!S.closed;return false}
const FINISHES=[['orange','Cosmic Orange'],['blue','Deep Blue'],['silver','Silver']];
function renderRoles(){
  $('#roles').innerHTML=Object.entries(ROLES).map(([k,v])=>`<button class="rbtn ${v.cls}" data-role="${k}" aria-pressed="${ui.role===k}"><span class="ri">${I(v.ic)}</span><span><b>${v.name}</b><small>${esc(v.who.split(' · ')[0])}</small></span>${v.tag?`<span class="new">${v.tag}</span>`:''}${roleAlert(k)&&ui.role!==k?'<span class="dot" aria-label="needs attention"></span>':''}</button>`).join('');
  $('#devs').innerHTML=[['phone','iPhone 17 Pro'],['tablet','Tablet'],['laptop','Laptop']].map(([d,l])=>`<button data-dev="${d}" aria-pressed="${ui.dev===d}">${l}</button>`).join('');
  const fin=$('#finish');fin.hidden=ui.dev!=='phone';
  fin.innerHTML=FINISHES.map(([k,l])=>`<button class="fsw fin-${k}" data-finish="${k}" aria-pressed="${ui.finish===k}" aria-label="${l}" title="${l}"></button>`).join('')+`<span>${FINISHES.find(f=>f[0]===ui.finish)[1]}</span>`;
}
function fitDevice(){const f=$('#frame'),st=$('.stage');if(!f||!st)return;if(ui.dev!=='phone'){f.style.transform='';st.style.height='';return}
  const W0=426,H0=898;const avail=Math.max(460,window.innerHeight-140);const s=Math.min(1,avail/H0,(st.clientWidth||W0)/W0);f.style.transform=`scale(${s.toFixed(4)})`;st.style.height=Math.ceil(H0*s)+'px'}
window.addEventListener('resize',()=>fitDevice());
const SB_ICONS=`<span class="sb-ic"><svg viewBox="0 0 19 12" aria-hidden="true"><rect x="0" y="8" width="3.2" height="4" rx="1"/><rect x="5" y="5.5" width="3.2" height="6.5" rx="1"/><rect x="10" y="3" width="3.2" height="9" rx="1"/><rect x="15" y="0" width="3.2" height="12" rx="1"/></svg><svg viewBox="0 0 17 12" aria-hidden="true"><path d="M8.5 11.6 5.9 8.9a3.7 3.7 0 0 1 5.2 0zM3.6 6.6a7 7 0 0 1 9.8 0l1.6-1.6a9.3 9.3 0 0 0-13 0zM.7 3.7a11.2 11.2 0 0 1 15.6 0L17 3A12.2 12.2 0 0 0 0 3z"/></svg><span class="batt"><i></i></span></span>`;
function phoneRight(r){
  if(r==='own'){const c=S.po&&S.po.status==='awaiting'?1:0;return `<button class="bell" data-nav="w.inbox" aria-label="Needs you">${I('bell')}${c?`<i>${c}</i>`:''}</button>`}
  if(r==='floor')return `<span class="offline">Assembly 1 · shift A</span>`;
  return `<span class="offline">Business · via XELOR</span>`}
function shellPhone(r,sc,body,pv){
  const nav=NAVS[r]||[];const cur=sc.nav||ui.scr[r];const h=ui.hist[r]||[];
  const header=sc.header?sc.header():`<div class="abar">${h.length?`<button class="bk" data-back aria-label="Back">${I('left')}</button>`:''}<div class="tt">${esc(sc.title)}${sc.kn?`<small>${esc(sc.kn)}</small>`:''}</div><div class="rt">${phoneRight(r)}</div></div>`;
  const ci=Math.max(0,nav.findIndex(n=>n[0]===cur));const pi=ui.tabIdx[r]??ci;
  const bottom=sc.cta?`<div class="stickycta">${sc.cta()}</div>`:`<nav class="tabbar" style="--n:${nav.length}"><span class="ind" data-ci="${ci}" style="width:calc((100% - 10px - ${(nav.length-1)*2}px)/${nav.length});transform:translateX(calc(${pi} * (100% + 2px)))"></span>${nav.map(([id,ic,l,cnt])=>{const c=cnt?cnt():0;return `<button data-nav="${id}" ${cur===id?'aria-current="page"':''}>${I(ic)}<span>${l}</span>${c?`<span class="cnt">${c}</span>`:''}</button>`}).join('')}</nav>`;
  if(!sc.cta)ui.tabIdx[r]=ci;
  const tm0=new Date(S.clock).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true}).replace(/\s?[ap]m/i,'');
  return `<div class="app ${sc.cta?'has-cta':''}" ${pv?'data-preview':''}><div class="statusbar"><span class="sb-time">${tm0}</span>${SB_ICONS}</div>${header}
  <div class="abody"><div class="scr">${body}</div></div>${bottom}<span class="homebar"></span></div>`;
}
function shellPortal(r,sc,body,pv){
  const v=ROLES[r];const tabs=TABS[r]||[];const cur=sc.nav||ui.scr[r];
  const mark={pur:'PR',stores:'GM',acct:'DS'}[r]||'XL';
  const right=r==='pur'?`<span class="badge g">${I('spark')} Agent on</span><span class="credits">Limit ${inr(PEOPLE.priya.limit)}</span>`:r==='acct'?`<span class="badge">${I('refresh')} Synced with Tally</span><span class="badge g">${I('lock')} Append-only books</span>`:`<span class="badge">${I('pin')} Gate 1 · Peenya</span>`;
  return `<div class="portal" ${pv?'data-preview':''}><div class="ptop"><span class="pm">${mark}</span><div class="grow"><b>${esc(v.who.split(' · ')[0])}</b><small>${esc(v.name)} · ${esc(FACTORY.name)}</small></div><div class="rt hide-n">${right}</div></div>
  <div class="pwrap"><nav class="pside"><span class="sb">${esc(v.name)}</span>${tabs.map(([id,ic,l,cnt])=>{const c=cnt?cnt():0;return `<button class="ptab" data-nav="${id}" ${cur===id?'aria-current="page"':''}>${I(ic)}${l}${c?`<span class="c">${c}</span>`:''}</button>`}).join('')}<div class="foot">${esc(v.surface)}. One database: every module reads the same order.</div></nav>
  <div class="pmain"><div class="scr">${body}</div></div></div></div>`;
}
function renderStage(o={}){
  const vp=$('#vp'),frame=$('#frame');const r=ui.role,id=ui.scr[r],sc=SCREENS[id];
  const same=ui.lastScr===id&&ui.lastRole===r;const old=vp.querySelector('.abody,.pmain');const top=same&&old?old.scrollTop:0;
  let before=null;if(o.flip&&same){before={};vp.querySelectorAll('[data-flip]').forEach(el=>{before[el.dataset.flip]=el.getBoundingClientRect().top})}
  frame.className='frame '+ui.dev+' fin-'+ui.finish;vp.className='vp '+ROLES[r].cls;
  const pv=previewOf(sc);
  const build=()=>{const body=(pv?pvBanner(pv):'')+sc.render();return PHONE_ROLES.includes(r)?shellPhone(r,sc,body,pv):shellPortal(r,sc,body,pv)};
  vp.innerHTML=pv?withState(futureState(pv),build):build();
  const sc2=vp.querySelector('.abody,.pmain');const inner=sc2.querySelector('.scr');
  if(same)sc2.scrollTop=top;else{inner.classList.add('enter','stg');if(PHONE_ROLES.includes(r)&&ui.navDir)inner.classList.add(ui.navDir);countUp(inner)}
  ui.navDir=null;
  const ind=vp.querySelector('.tabbar .ind');if(ind)requestAnimationFrame(()=>requestAnimationFrame(()=>{ind.style.transform=`translateX(calc(${ind.dataset.ci} * (100% + 2px)))`}));
  if(before&&!reduceMotion()){vp.querySelectorAll('[data-flip]').forEach(el=>{const b=before[el.dataset.flip];if(b==null)return;const dy=b-el.getBoundingClientRect().top;if(Math.abs(dy)>2)el.animate([{transform:`translateY(${dy}px)`},{transform:'none'}],{duration:560,easing:'cubic-bezier(.16,1,.3,1)'})})}
  $('#addr').innerHTML=`${I('lock')} ${ROLES[r].host}${sc.route}`;
  ui.lastScr=id;ui.lastRole=r;fitDevice();
}
/* numbers glide up to their value when a screen opens */
function countUp(root){if(reduceMotion())return;root.querySelectorAll('[data-cu]').forEach(el=>{const to=+el.dataset.cu,fmt=el.dataset.fmt||'n';if(!isFinite(to)||to===0)return;
  const f=v=>fmt==='inr'?inr(v):fmt==='pct'?Math.round(v)+'%':nos(Math.round(v));const t0=performance.now(),dur=900;
  const stepf=t=>{const k=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-k,4);el.textContent=f(to*e);if(k<1)requestAnimationFrame(stepf)};el.textContent=f(0);requestAnimationFrame(stepf)})}
const cu=(v,fmt='n')=>`<span data-cu="${v}" data-fmt="${fmt}">${fmt==='inr'?inr(v):fmt==='pct'?Math.round(v)+'%':nos(v)}</span>`;
function renderSpec(){const sc=SCREENS[ui.scr[ui.role]];const v=ROLES[sc.role];
  $('#cap').innerHTML=`<span class="ri ${v.cls}">${I(v.ic)}</span><b>${esc(v.who.split(' · ')[0])}</b><span class="sep">·</span><span>${esc(sc.title)}</span><span class="sep">·</span><span class="cp">${esc(sc.purpose.split('. ')[0].replace(/\.$/,''))}.</span>`}
function renderClock(){const d=new Date(S.clock);$('#clockchip').innerHTML=`${I('clock')}<b>${d.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})}</b><span class="lng">${d.getFullYear()} · </span>${tm()}`}
function render(o={}){sweep();renderTour();renderRoles();renderStage(o);renderSpec();renderClock();S.bumped=null;S.justStamped=null;
  Object.values(S.rfq.quotes).forEach(q=>{if(q.fresh)setTimeout(()=>{q.fresh=false},2500)})}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
  const t=e.target;
  if(t.closest('[data-veil]')){const v=t.closest('.veil');v.classList.add('out');setTimeout(()=>{$('#overlay').innerHTML=''},420);return}
  const jp=t.closest('[data-jump]');if(jp){jumpTo(+jp.dataset.jump);return}
  if(t.closest('[data-preview]')&&t.closest('[data-a]')){toast('This is an example view','Tap “Show it for real” at the top to run the steps up to here.','info');const b=$('.pvbar');if(b){b.classList.remove('nudge');void b.offsetWidth;b.classList.add('nudge')}return}
  const tr=t.closest('[data-tour]');if(tr){const v=tr.dataset.tour;if(v==='start')tourGo(0);else if(v==='next')tourNext();else if(v==='prev')tourGo(ui.tour-1);else if(v==='exit'){ui.tour=-1;render()}else tourGo(+v);return}
  const rb=t.closest('[data-role]');if(rb){setRole(rb.dataset.role);return}
  const db=t.closest('[data-dev]');if(db){ui.dev=db.dataset.dev;render();return}
  const fs=t.closest('[data-finish]');if(fs){ui.finish=fs.dataset.finish;render();return}
  if(t.closest('[data-theme-toggle]')){toggleTheme();return}
  if(t.closest('[data-back]')){back();return}
  const nv=t.closest('[data-nav]');if(nv){const r=ui.role;if(PHONE_ROLES.includes(r))ui.hist[r]=[];ui.navDir=null;ui.scr[r]=nv.dataset.nav;if(nv.dataset.nav==='s.chat')S.unread.sup=0;render();return}
  const a=t.closest('[data-a]');if(a){handle(a.dataset.a,a,e);return}
  const g=t.closest('[data-go]');if(g){go(g.dataset.go);return}
});
document.addEventListener('input',e=>{const id=e.target.id;if(!/^q(Unit|Date|Freight)$/.test(id))return;
  if(id==='qUnit')S.draft.unit=e.target.value;if(id==='qDate')S.draft.date=e.target.value;if(id==='qFreight')S.draft.freight=e.target.value;
  const unit=Number(String(S.draft.unit).replace(/,/g,''))||0,fr=Number(String(S.draft.freight).replace(/,/g,''))||0;
  const tot=$('#qTotal');if(tot)tot.textContent=unit?inr(unit*NEED_QTY+fr):'—';const sb=$('#qSend');if(sb)sb.disabled=!unit;
  const late=S.draft.date&&S.draft.date>RFQ.need,h=$('#qLate');if(h){h.style.color=late?'var(--red)':'';h.textContent=late?`After ${dmy(RFQ.need)}. You can still send it, but it can’t be used.`:'Leave it blank if unsure. A blank date beats a missed one.'}});
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target.id==='qUnit'){A.sendQuote();render();return}
  if((e.key==='Enter'||e.key===' ')&&e.target.matches('[role=checkbox][data-a],[role=button][data-go],[role=button][data-a]')){e.preventDefault();e.target.click()}
  if(e.key==='Escape'&&$('#overlay').innerHTML){$('#overlay').innerHTML=''}});
function handle(a,el){const d=el.dataset;
  switch(a){
    case 'reset':TIMERS.forEach(clearTimeout);TIMERS=[];$('#overlay').innerHTML='';S=fresh();ui=UI0();render();toast('Demo restarted','Every record is back to the morning of 30 Sep.','info');return;
    case 'pick':if(S.rfq.status!=='none')return;ui.pick[d.id]=!ui.pick[d.id];break;
    case 'award':A.award(d.id);if(S.po)return go(S.po.status==='awaiting'?'p.po':'p.po');break;
    case 'fill':A.fillQuote();break;
    case 'send-quote':A.sendQuote();if(S.rfq.quotes.ganesh){ui.hist.sup=[];ui.navDir='pop';ui.scr.sup='s.chat';S.unread.sup=0}break;
    case 'approve':A.approve();break;
    case 'send-back':A.sendBack();break;
    case 'inspect':A.inspect(d.res);break;
    case 'test':A.test(+d.i);break;
    case 'invite':A.invite(d.id);break;
    case 'claim':A.claim(d.id);break;
    case 'book':A.book(d.id);break;
    case 'dispatch':{A.dispatch();render();const lines=$$('[data-chk]');lines.forEach((x,i)=>setTimeout(()=>x.classList.add('on'),reduceMotion()?0:300*(i+1)));
      TIMERS.push(setTimeout(()=>{A.finishDispatch();render()},reduceMotion()?50:300*(lines.length+1)+200));return}
    case 'toast':toast(d.msg||'Done',d.sub||'',d.tone||'info');return;
    default:if(A[a])A[a]();else return;
  }
  render()}

/* ---------- theme ---------- */
function isDark(){const t=document.documentElement.dataset.theme;return t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches}
function paintTheme(){const b=$('#themeBtn');if(b)b.innerHTML=I(isDark()?'moon':'sun')}
function toggleTheme(){const n=isDark()?'light':'dark';document.documentElement.dataset.theme=n;try{localStorage.setItem('xelor-demo-theme',n)}catch(_){}paintTheme()}
try{const t=localStorage.getItem('xelor-demo-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(_){}
