
/* =====================================================================
   v6 — the trusted supplier network, run by an agentic AI ERP.
   The agent drafts, chases and posts; a person approves anything that
   commits money or stock. Records are earned at the gate, never typed.
   ===================================================================== */

/* ---------- the XELOR Agent: what it did, what it is doing, what needs a person ---------- */
function agentItems(){const L=[];const add=(st,t,d,go)=>L.push({st,t,d,go});
  const top=()=>{const r=ranked().find(x=>!x.late&&x.s.vendor);return r?r.s.short:'—'};
  if(S.order==='received')add('ask','Read Sri Venkateswara Agro’s PO from email','SO-2627-0291 is drafted · confirm it to start','p.sales');
  else add('done','Read the customer PO from email and drafted '+ORDER.no,`${ORDER.qty} pumps · credit check passed`,'p.sales');
  if(S.order!=='received'&&!S.planRun)add('ask','Material check is ready to run','6 parts against this morning’s shelf','p.plan');
  if(S.planRun)add('done','Found '+NEED_QTY+' pump bodies short','BOM v4 against bin '+SHORT.bin,'p.plan');
  if(S.planRun&&S.rfq.status==='none')add('ask','Drafted '+RFQ.no+' from the item master, BOM and quality plan','Choose who to ask, then send','p.net');
  if(S.rfq.status!=='none')add('done','Sent '+RFQ.no+' to '+S.rfq.to.length+' suppliers','By message link, and over API to supplier software','p.net');
  const miss=S.rfq.status==='sent'?S.rfq.to.filter(id=>!S.rfq.quotes[id]):[];
  if(miss.length)add('work','Chasing '+miss.map(id=>SUP[id].short).join(', '),'A reminder goes at 4 pm if there is no reply','p.net');
  if(S.rfq.status==='sent'&&!miss.length&&S.rfq.to.length)add('ask','Ranked '+S.rfq.to.length+' answers · recommends '+top(),'Delivery, landed cost and earned record, with reasons','p.net');
  if(S.rfq.status==='sent'&&S.rfq.to.includes('veera')&&!S.invited.veera)add('ask','Veerabhadra has no record with Kaveri','Invite it to claim a free record','p.rec');
  if(S.po&&S.po.status==='awaiting')add('work','Waiting on Arun for '+S.po.no,'The approval card is on his phone','w.po');
  if(S.po&&S.po.status==='approved')add('done',S.po.no+' sent to '+SUP[S.po.sup].short,'After '+(S.po.approvedBy||'approval'),'p.po');
  if(S.po&&S.po.status==='approved'&&!S.grn)add('work','Tracking the delivery','Sri Ganesh confirmed pouring on Furnace 2','t.gate');
  if(S.grn&&!S.grn.pending)add('done','Posted '+S.grn.no+' · '+SUP[S.po.sup].short+' +1 on-time delivery','Counted at the gate, not typed','t.gate');
  if(S.grn&&!S.grn.pending&&S.inspection!=='pass')add('ask','Inspection due on '+NEED_QTY+' castings','Sample of 5 against '+QPLAN.no,'t.qc');
  if(S.inspection==='pass')add('done','Updated '+SUP[S.po.sup].short+'’s reject rate','From the incoming inspection','t.rec');
  if(S.inspection==='pass'&&!S.wo)add('ask','Every part is on the shelf','WO-2627-0918 can be released','m.wo');
  if(S.wo&&S.wo.status==='done')add('done','Final test passed · tax invoice drafted','INV-2627-0781 waiting for dispatch','a.dispatch');
  if(S.wo&&S.wo.status==='done'&&!S.dispatch)add('ask','Invoice drafted','Dispatch when the truck is loaded','a.dispatch');
  if(S.dispatch&&S.dispatch.irn)add('done','IRN and e-way bill attached','Simulated GST provider','a.dispatch');
  if(S.grn&&!S.grn.pending&&!S.treds)add('work','MSME clock: pay '+SUP[S.po.sup].short+' by '+dmy(addDays(S.po.promised,45)),'45 days agreed on the PO','a.books');
  if(S.treds)add('done','Supplier invoice on TReDS','Sri Ganesh can take early payment','a.books');
  if(S.closed&&!S.shared)add('ask','Kaveri’s passport gained an on-time order','Share it with Deccan Agro Equipment?','p.pass');
  if(S.shared)add('done','Passport shared with Deccan Agro Equipment','Read-only link','p.pass');
  return L}
const agentAsks=()=>agentItems().filter(x=>x.st==='ask').length;
function agentRow(x){const ic={ask:'bell',work:'clock',done:'check'}[x.st];const tone={ask:'gold',work:'info',done:'ok'}[x.st];const lbl={ask:'Needs you',work:'Working',done:'Done'}[x.st];
  return `<div class="ag ${x.st}" data-go="${x.go}" role="button" tabindex="0"><span class="agi">${I(ic)}</span><div class="grow"><b>${esc(x.t)}</b><span>${esc(x.d)}</span></div>${tp(lbl,tone)}</div>`}
function agentCard(max=4){const L=agentItems();const order={ask:0,work:1,done:2};const top=[...L].sort((a,b)=>order[a.st]-order[b.st]).slice(0,max);const asks=L.filter(x=>x.st==='ask').length;
  return `<div class="agcard"><div class="row sb"><div class="row"><span class="agmark">${I('spark')}</span><div><b>XELOR Agent</b><small>${L.filter(x=>x.st==='done').length} done today · ${asks} need${asks===1?'s':''} you</small></div></div><button class="btn sm agopen" data-go="p.agent">Open${I('arrow')}</button></div><div class="aglist">${top.map(agentRow).join('')}</div></div>`}

/* ---------- the factory passport ---------- */
function passportStats(){const n=KAVERI_REC.orders+(S.closed?1:0),ok=KAVERI_REC.onTimeN+(S.closed&&S.dispatch&&S.dispatch.at.slice(0,10)<=ORDER.due?1:0);
  const inv=31+(S.treds?1:0);return {n,ok,pct:Math.round(ok/n*100),ret:'0.32%',retSub:'4 of 1,240 pumps returned',inv,
    receipts:212+(S.grn&&!S.grn.pending?1:0),insp:38+(S.inspection==='pass'?1:0),disp:46+(S.dispatch&&!S.dispatch.running?1:0)}}
function qrGrid(seed){const h=hx(seed,96);let r='';for(let y=0;y<11;y++)for(let x=0;x<11;x++){const corner=(x<3&&y<3)||(x>7&&y<3)||(x<3&&y>7);const on=corner?((x%8===0||x%8===2||y%8===0||y%8===2)||(x%8===1&&y%8===1)):parseInt(h[(y*11+x)%96],16)>7;if(on)r+=`<rect x="${x}" y="${y}" width="1" height="1"/>`}
  return `<svg class="qr" viewBox="-1 -1 13 13" aria-label="Verification code">${r}</svg>`}
def('p.pass',{role:'pur',title:'Our passport',route:'/passport',purpose:'Kaveri’s own record, earned the same way as a supplier’s: shipments, returns, supplier payments and spare capacity, verified by XELOR and shared as a read-only link.',
  render(){const P=passportStats();return `${head('Kaveri’s passport','Earned from every shipment, return and supplier payment. Nobody types a number into it, including us.')}
  <div class="two"><div class="pass"><div class="pass-h"><span class="seal">${I('shield')}</span><div class="grow"><small>Verified by XELOR · earned, not claimed</small><h4>${esc(FACTORY.name)}</h4><span>Peenya, Bengaluru · Udyam Small · GSTIN ${FACTORY.gstin.slice(0,6)}•••••</span></div>${qrGrid('pass'+P.n+P.inv)}</div>
    <div class="pass-stats"><div><b>${cu(P.pct,'pct')}${S.closed?'<span class="delta">+1</span>':''}</b><small>on time to customers<br>${P.ok} of ${P.n} orders since ${KAVERI_REC.since}</small></div><div><b>${P.ret}</b><small>returned by customers<br>${P.retSub}</small></div><div><b>${P.inv}/${P.inv}</b><small>MSME suppliers paid on time${S.treds?'<span class="delta">+1</span>':''}<br>within agreed terms</small></div></div>
    <div class="pass-cap"><span>${I('factory')} Spare capacity</span><b>Assembly 1 · 3 shifts · week of 26 Oct</b>${S.offered?tp('Offered on the network','ok'):`<button class="btn sm gold" data-a="offer">Offer it</button>`}</div>
    <div class="pass-f"><span>Earned from ${P.disp} dispatches · ${P.receipts} receipts · ${P.insp} inspections</span><span class="mono">${hshort(hx('passport'+P.n+P.inv+P.disp))}</span></div></div>
  <div style="display:flex;flex-direction:column;gap:12px;min-width:0"><div class="card"><h4>Share with a buyer</h4><div class="row">${'<span class="logo" style="background:#2a5a86">DA</span>'}<div class="grow"><b style="color:var(--ink)">Deccan Agro Equipment</b><div class="sub">Buyer · Hubballi · asked for a supplier record</div></div></div>
    ${S.shared?`<div class="card ok" style="padding:10px 12px"><div class="row sb"><b style="color:var(--ink)">Shared · read-only link</b>${tp('Opened','ok')}</div><p class="sub">They see the record and can check it against XELOR. They can’t edit it.</p></div>`:`<button class="btn pri block" data-a="share">${I('send')}Share passport</button>`}</div>
    <div class="card"><div class="split2"><div><h5>The buyer sees</h5><ul class="ticks"><li>On-time and return rates</li><li>Supplier payments on time</li><li>Spare capacity</li><li>When each number was earned</li></ul></div><div><h5>Stays private</h5><ul class="ticks no"><li>Prices and margins</li><li>Customer names</li><li>Supplier names</li><li>Anything typed by hand</li></ul></div></div></div></div></div>`}});

/* ---------- supplier records + invite to claim ---------- */
def('p.rec',{role:'pur',title:'Supplier records',route:'/purchase/network/suppliers',purpose:'Every supplier’s record, counted from Kaveri’s own receipts and inspections. A supplier with no record is invited to claim one for free.',
  render(){const v=SUP.veera;return `${head('Supplier records','Earned, not claimed. Every number comes from a receipt or an inspection at Kaveri’s gate.')}${scorecard()}
  <div class="card ${S.invited.veera?'':'gold'}"><div class="row">${logo('veera')}<div class="grow"><h4>${esc(v.name)} has no record with Kaveri</h4><p class="sub">It quoted, but it has never delivered here, so it scores zero for track record. A free record and a 10-piece trial order give it a fair start.</p></div>${S.claimed.veera?tp('Claimed','ok'):S.invited.veera?tp('Invited','info'):''}</div>
    ${S.invited.veera?`<div class="thread" style="margin:0;border-radius:12px;min-height:0"><div class="bub me" style="max-width:100%"><div class="from">XELOR for ${esc(FACTORY.short)}</div>Kaveri Pumps counts every delivery it receives from you: on time, pieces checked, rejects. Claim your free record to see it, share it with other buyers and show your spare capacity.<div class="t">sent · link expires in 14 days</div></div></div>
      ${S.claimed.veera?`<p class="note">Claimed. Its record reads unproven until the trial order is received and inspected.</p>`:`<button class="btn gh sm" data-a="claim" data-id="veera" style="align-self:flex-start">Simulate: Veerabhadra claims it</button>`}`
    :`<div class="btns" style="justify-content:flex-start"><button class="btn pri sm" style="flex:0 0 auto" data-a="invite" data-id="veera">${I('link')}Invite to claim its record</button></div>`}</div>`}});

/* ---------- network capacity: booked peer to peer, no cut ---------- */
def('p.cap',{role:'pur',title:'Capacity',route:'/network/capacity',purpose:'Free capacity at factories near Kaveri, read live from the ones that run XELOR. Booked directly between factories; XELOR takes no cut.',
  render(){const rows=[
    {id:'ganesh',who:'Sri Ganesh Castings',what:'Furnace 2 · grey iron pours',free:S.po&&S.po.sup==='ganesh'&&S.po.status==='approved'?'1 pour free before 9 Oct':'4 pours free before 9 Oct',km:38,load:S.po&&S.po.sup==='ganesh'&&S.po.status==='approved'?84:62,mark:'SG',tint:'#9a6a26'},
    {id:'shree',who:'Shree Lakshmi Precision',what:'2 VMC machining shifts',free:'Thu and Fri, this week',km:6,load:71,mark:'SL',tint:'#1d6b73'},
    {id:'nandi',who:'Nandi Powder Coaters',what:'Powder-coat line, 300 parts a day',free:'From 14 Oct',km:11,load:48,mark:'NP',tint:'#5b3a6e'}];
    return `${head('Capacity near you','Read live from factories that run XELOR. You book each other directly. XELOR takes no cut.')}
    <div class="list">${rows.map(r=>`<div class="sup" style="cursor:default"><span class="logo" style="background:${r.tint}">${r.mark}</span><span class="tx"><b>${esc(r.who)}${vbadge()}</b><small>${esc(r.what)} · ${r.km} km</small><span class="cap"><span class="cb"><i style="width:${r.load}%"></i></span><span>${r.load}% booked · <em>${esc(r.free)}</em> · live</span></span></span>${S.bookings[r.id]?tp('Requested','ok'):`<button class="btn gh sm" data-a="book" data-id="${r.id}">Request booking</button>`}</div>`).join('')}
    <div class="sup" style="cursor:default;border-style:dashed"><span class="logo" style="background:#7a2945">KP</span><span class="tx"><b>Your Assembly 1</b><small>3 shifts free · week of 26 Oct · read from your schedule</small></span>${S.offered?tp('Offered','ok'):`<button class="btn pri sm" data-a="offer">Offer it</button>`}</div></div>`}});

/* ---------- the agent's own screen ---------- */
def('p.agent',{role:'pur',title:'XELOR Agent',route:'/agent',purpose:'What Priya’s agent did, what it is doing and what needs her. It drafts, chases and posts; anything that commits money or stock waits for a person.',
  render(){const L=agentItems();const g=st=>L.filter(x=>x.st===st);
    const sec=(t,st,emptyTxt)=>`<div class="card"><div class="row sb"><h4>${t}</h4><span class="badge">${g(st).length}</span></div>${g(st).length?`<div class="aglist">${(st==='done'?[...g(st)].reverse():g(st)).map(agentRow).join('')}</div>`:`<p class="sub">${emptyTxt}</p>`}</div>`;
    return `${head('XELOR Agent','Drafts, chases and posts inside the ERP. Anything that commits money or stock waits for a person.',`<span class="pill t-gold">${I('spark')} Agent on</span>`)}
    <div class="two"><div style="display:flex;flex-direction:column;gap:12px;min-width:0">${sec('Needs you','ask','Nothing needs you right now.')}${sec('Working on it','work','Nothing in progress.')}</div>${sec('Done','done','Nothing yet today.')}</div>
    <div class="card"><h4>What the agent may do on its own</h4><div class="split2"><div><h5>Does by itself</h5><ul class="ticks"><li>Read POs and quotes from email and messages</li><li>Draft requests, orders and invoices</li><li>Chase suppliers and track deliveries</li><li>Post receipts and update records</li></ul></div><div><h5>Always asks a person</h5><ul class="ticks no"><li>Confirm a customer order</li><li>Award, approve or pay</li><li>Release a work order</li><li>Share a record outside the company</li></ul></div></div><p class="note">Demo: agent steps are scripted. No language model is connected.</p></div>`}});

/* ---------- home: the agent leads ---------- */
SCREENS['p.home'].render=function(){const hr=new Date(S.clock).getHours();const hi=hr<12?'Good morning':hr<17?'Good afternoon':'Good evening';const left=days(clockDate(),ORDER.due);const asks=agentAsks();const P=passportStats();const o=onTimePct('ganesh');
  return `${head(hi+', Priya.',asks?`Your agent has been working. ${asks} thing${asks===1?'':'s'} need${asks===1?'s':''} you.`:'Your agent has nothing waiting on you.')}
  ${agentCard(3)}
  ${routeCard()}
  <div class="kpis"><div class="kpi hl"><b>${cu(INVOICE_TOTAL,'inr')}</b><span>order value, incl. IGST</span></div><div class="kpi"><b>${dmy(ORDER.due)}</b><span>due to ship · ${left>0?left+' days away':'today'}</span></div><div class="kpi"><b>${Math.round(o)}%</b><span>Sri Ganesh on time · earned at the gate</span></div><div class="kpi"><b>${P.pct}%</b><span>Kaveri’s passport · on time to customers</span></div></div>`};

/* ---------- supplier: the record is a free passport ---------- */
SCREENS['s.record'].title='My passport';SCREENS['s.record'].kn='free for suppliers';
{const base=SCREENS['s.record'].render;SCREENS['s.record'].render=function(){
  return base()+`<div class="btns"><button class="btn pri" data-a="toast" data-msg="Passport link copied" data-sub="Any buyer can check it against XELOR. It shows your record, never your prices." data-tone="ok">${I('send')}Share my passport</button><button class="btn gh" data-a="dispute">${S.dispute?'Withdraw dispute':'Dispute an entry'}</button></div>
  ${S.dispute?`<div class="card warn"><div class="row sb"><b style="color:var(--ink)">1 entry under review</b>${pill('review')}</div><p class="sub">12 Aug delivery marked late. Kaveri’s stores team has 3 days to answer with the gate scan.</p></div>`:''}
  ${S.inspection==='pass'?`<div class="card ok"><div class="row sb"><h4>Get paid early</h4>${S.early?pill('requested'):''}</div><p class="sub">Kaveri accepted your ${inr(S.po?S.po.total:0)} invoice${S.treds?' and put it on TReDS':''}. A TReDS platform can pay you now at an indicative discount.</p>${S.early?'':`<button class="btn pri sm" data-a="early" style="align-self:flex-start" ${S.treds?'':'disabled'}>${I('rupee')}Request early payment</button>${S.treds?'':'<p class="note">Opens once Kaveri uploads the invoice to TReDS.</p>'}`}</div>`:''}`}}

/* ---------- owner: the agent's brief ---------- */
{const base=SCREENS['w.inbox'].render;SCREENS['w.inbox'].render=function(){const L=agentItems();
  return `<div class="agcard"><div class="row"><span class="agmark">${I('spark')}</span><div><b>Agent brief</b><small>${L.filter(x=>x.st==='done').length} things done today · approvals come to you only above someone’s limit</small></div></div></div>`+base()}}

/* ---------- accounts: MSME clock with the 15/45-day rule and TReDS ---------- */
function msmeClock(acc,payDue){const today=clockDate(),gone=Math.max(0,days(acc,today)),leftD=days(today,payDue),pct=Math.min(100,Math.round(gone/45*100));
  return `<div class="card ${S.treds?'ok':'warn'}"><div class="row sb"><h4>MSME payment clock · ${esc(SUP[S.po.sup].short)}</h4>${S.treds?tp('On TReDS','ok'):tp(leftD+' days left','warn')}</div>
  <div class="bar" style="grid-template-columns:minmax(0,1fr) 92px"><span class="tr"><i style="width:${pct}%;background:${S.treds?'var(--green)':'var(--ochre)'}"></i></span><b>day ${gone} of 45</b></div>
  <p class="sub">${esc(SUP[S.po.sup].name)} is a ${SUP[S.po.sup].msme.toLowerCase()} enterprise. The PO agreed 45 days, the most the MSMED Act allows; with nothing agreed it would be 15. Pay later and the cost can’t be deducted this year (section 43B(h)). Clock started ${dmy(acc)}, pay by ${dmyy(payDue)}.</p>
  ${S.treds?'':`<button class="btn pri sm" data-a="treds" style="align-self:flex-start">${I('send')}Upload to TReDS</button>`}</div>`}

/* ---------- nav ---------- */
TABS.pur=[['p.home','home','Today'],['p.agent','spark','XELOR Agent',agentAsks],['p.sales','file','Sales order',()=>S.order==='received'?1:0],['p.plan','chart','Material check'],['p.net','net','Supplier network',()=>S.rfq.status==='sent'?Object.keys(S.rfq.quotes).length:0],['p.po','cart','Purchase orders',()=>S.po&&S.po.status==='awaiting'?1:0],['p.rec','award','Supplier records'],['p.cap','factory','Capacity'],['p.pass','shield','Our passport'],['p.log','list','Activity']];
NAVS.sup[2]=['s.record','shield','Passport'];
