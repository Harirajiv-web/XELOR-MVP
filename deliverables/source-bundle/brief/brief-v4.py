# v4 of the brief: AI-era data message, XELOR Market, Find help and Xelogram, catchier headings.
# Runs inside make-brief.py after the v3 edits (shares t and rep).
import re

# ---------- icons ----------
rep('  <symbol id="i-x" viewBox="0 0 24 24">','''  <symbol id="i-store" viewBox="0 0 24 24"><path d="M3.5 9 5 4h14l1.5 5"/><path d="M3.5 9a2.8 2.8 0 0 0 5.7 0 2.8 2.8 0 0 0 5.6 0 2.8 2.8 0 0 0 5.7 0"/><path d="M5 11.5V20h14v-8.5M10 20v-5h4v5"/></symbol>
  <symbol id="i-camera" viewBox="0 0 24 24"><path d="M3.5 8.5A2 2 0 0 1 5.5 6.5h2l1.5-2h6l1.5 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/></symbol>
  <symbol id="i-wrench" viewBox="0 0 24 24"><path d="M15 4a5 5 0 0 0-4.6 7L4 17.4 6.6 20l6.4-6.4A5 5 0 0 0 20 9l-3 3-3-1-1-3z"/></symbol>
  <symbol id="i-rupee" viewBox="0 0 24 24"><path d="M6.5 4h11M6.5 8.5h11M9 4c4 0 6 1.7 6 4.3S13 12.5 9 12.5H8l7 7.5"/></symbol>
  <symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24">''')

# ---------- css ----------
v4css=r'''
/* ---------- v4: the data era, XELOR Market, Xelogram ---------- */
.dataera{position:relative;overflow:hidden;background:radial-gradient(90% 70% at 85% 0%,rgba(226,181,74,.16),transparent 60%),radial-gradient(70% 60% at 0% 100%,rgba(143,51,84,.45),transparent 65%),var(--deep)}
.dataera::before{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(246,236,220,.08) 1px,transparent 1px);background-size:26px 26px;mask-image:linear-gradient(180deg,#000,transparent 85%);-webkit-mask-image:linear-gradient(180deg,#000,transparent 85%);pointer-events:none}
.dataera .wrap{position:relative}
.dataera h2{font-size:clamp(44px,6.4vw,92px);line-height:.98;letter-spacing:-.045em;max-width:15ch}
.dataera h2 span{background:linear-gradient(100deg,#f6ecdc 0%,#e2b54a 45%,#f0c95f 60%,#e2b54a 100%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:goldsweep 6s ease-in-out infinite}
@keyframes goldsweep{0%,100%{background-position:0% 0}50%{background-position:100% 0}}
.dataera .lead{max-width:760px;font-size:21px}
.de-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center;margin-top:56px}
.stack{display:flex;flex-direction:column;gap:12px;perspective:1200px}
.layer{position:relative;display:grid;grid-template-columns:auto 1fr auto;gap:18px;align-items:center;padding:20px 22px;border-radius:18px;border:1px solid var(--deep-line);background:var(--deep-card);transform-origin:50% 100%}
.layer .lx{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;background:rgba(246,236,220,.06);color:var(--deep-sub)}
.layer .lx svg{width:22px;height:22px}
.layer b{display:block;font-family:var(--display);font-size:22px;color:var(--on-deep);letter-spacing:-.02em}
.layer small{display:block;font-size:15px;color:var(--deep-sub);margin-top:2px}
.layer .pill{background:rgba(246,236,220,.08);color:var(--deep-sub)}
.layer.l1{margin-inline:40px;opacity:.78} .layer.l2{margin-inline:20px;opacity:.9}
.layer.gold{border:0;background:linear-gradient(135deg,rgba(226,181,74,.20),rgba(226,181,74,.06));padding:26px 24px;isolation:isolate}
.layer.gold::before{content:"";position:absolute;inset:0;border-radius:18px;padding:1.5px;background:conic-gradient(from var(--ang,0deg),#e2b54a,rgba(226,181,74,.15) 30%,#f0c95f 50%,rgba(226,181,74,.15) 70%,#e2b54a);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:angspin 5s linear infinite;z-index:-1}
@property --ang{syntax:"<angle>";inherits:false;initial-value:0deg}
@keyframes angspin{to{--ang:360deg}}
.layer.gold .lx{background:var(--gold-hi);color:var(--on-gold)}
.layer.gold b{font-size:26px} .layer.gold small{color:#efd9a8}
.layer.gold .pill{background:var(--gold-hi);color:var(--on-gold)}
.stack-foot{display:flex;align-items:center;gap:10px;font-family:var(--mono);font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-hi);margin-top:6px;padding-left:4px}
.stack-foot::before{content:"";width:28px;height:1px;background:var(--gold-hi)}
.de-quote{font-family:var(--display);font-size:clamp(28px,3vw,40px);line-height:1.15;letter-spacing:-.03em;color:var(--on-deep)}
.de-quote em{font-style:normal;color:var(--gold-hi)}
.de-quote + p{margin-top:20px;font-size:18px;color:var(--deep-sub);max-width:520px}
.buys{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:64px}
.buys .card{padding:28px 26px;display:flex;flex-direction:column;gap:12px;transition:transform .5s var(--out),border-color .4s}
.buys .card:hover{transform:translateY(-6px);border-color:rgba(226,181,74,.5)}
.buys .n{font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.14em;color:var(--gold-hi)}
.buys h3{font-size:25px;letter-spacing:-.025em}
.buys p{font-size:16px;color:var(--deep-sub);flex:1}
.buys .src{color:rgba(201,171,183,.75)}
.de-close{margin-top:40px;display:flex;align-items:center;gap:16px;font-size:19px;color:var(--on-deep);flex-wrap:wrap}
.de-close .pill{background:rgba(91,193,146,.16);color:#7fd6ac}

.xm-grid{display:grid;grid-template-columns:.85fr 1.15fr;gap:64px;align-items:center}
.xm-grid.rev{grid-template-columns:1.15fr .85fr}
.xm-grid.rev > figure{order:-1}
.xm-grid h2{font-size:clamp(36px,4vw,56px)}
.xm-grid .btn{margin-top:34px}
.xshots{position:relative;padding:20px 0 70px}
.xshots .laptop{position:relative;border-radius:16px;overflow:hidden;box-shadow:var(--shadow-lg);border:1px solid var(--line);transform:perspective(1600px) rotateY(-5deg) rotateX(2deg);transition:transform .9s var(--out)}
.xm-grid.rev .xshots .laptop{transform:perspective(1600px) rotateY(5deg) rotateX(2deg)}
.xshots:hover .laptop{transform:perspective(1600px) rotateY(0) rotateX(0)!important}
.xshots .laptop img{display:block;width:100%;height:auto}
.xshots .sub2{position:absolute;right:-5%;bottom:-2%;width:54%;border-radius:12px;overflow:hidden;box-shadow:var(--shadow-lg);border:1px solid var(--line);will-change:transform}
.xshots .sub2 img{display:block;width:100%;height:auto}
.xshots .ph{position:absolute;width:30%;border-radius:30px;box-shadow:var(--shadow-lg);will-change:transform}
.xshots .ph.a{left:-5%;bottom:-6%} .xshots .ph.b{left:22%;bottom:-12%;width:26%}
.xshots figcaption{position:absolute;left:0;top:-6px;font-family:var(--mono);font-size:11px;letter-spacing:.08em;color:var(--muted)}
.xm-grid.rev .xshots figcaption{left:auto;right:0}
.xstats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:64px}
.xstats .card{padding:24px 26px}
.xstats b{display:block;font-family:var(--display);font-size:46px;font-weight:800;letter-spacing:-.045em;color:var(--ink);line-height:1}
.xstats p{margin-top:10px;font-size:15.5px;color:var(--muted)}
.xstats-h{display:flex;justify-content:space-between;align-items:baseline;gap:20px;margin-top:72px;flex-wrap:wrap}
.xstats-h h3{font-size:26px;letter-spacing:-.025em}
.xstats-h + .xstats{margin-top:18px}
.pillars{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:64px}
.pillars .card{padding:30px 28px 24px;display:flex;flex-direction:column;gap:12px;position:relative;overflow:hidden;transition:transform .5s var(--out),box-shadow .5s}
.pillars .card:hover{transform:translateY(-6px);box-shadow:var(--shadow)}
.pillars .card::after{content:"";position:absolute;right:-40px;top:-40px;width:140px;height:140px;border-radius:50%;background:radial-gradient(circle,var(--gold-soft),transparent 70%);opacity:.9;pointer-events:none}
.pillars .ico{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:var(--acc-soft);color:var(--acc)}
.pillars .ico svg{width:22px;height:22px}
.pillars h3{font-size:23px;letter-spacing:-.02em;margin-top:6px}
.pillars p{font-size:16px;color:var(--muted);flex:1}
.pillars .note{padding-top:14px;border-top:1px solid var(--line);font-size:14px;font-weight:700;color:var(--green)}
.vs{width:100%;border-collapse:separate;border-spacing:0;font-size:16px;margin-top:22px;background:var(--surface);border:1px solid var(--line);border-radius:20px;overflow:hidden}
.vs th,.vs td{padding:17px 20px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
.vs tr:last-child td{border-bottom:0}
.vs th{font-family:var(--display);font-size:18px;color:var(--ink);letter-spacing:-.015em}
.vs td:first-child{font-weight:700;color:var(--ink);width:22%}
.vs td:nth-child(2){color:var(--muted)}
.vs .us{background:var(--gold-soft);color:var(--ink)}
.vs th.us{color:var(--gold-ink)}
.vs td.us b{color:var(--ink)}
.vsw{overflow-x:auto}
.vsw .vs{min-width:720px}
.namenote{margin-top:16px;font-size:13.5px;color:var(--muted);display:flex;gap:8px;align-items:flex-start}
.namenote .pill{flex:none}
.mktband{margin-top:28px;display:grid;grid-template-columns:auto repeat(3,1fr);gap:16px;align-items:stretch}
.mktband .lbl{display:flex;flex-direction:column;justify-content:center;padding-right:10px;max-width:220px}
.mktband .lbl b{font-family:var(--display);font-size:22px;color:var(--on-deep);letter-spacing:-.02em}
.mktband .lbl small{font-size:14px;color:var(--deep-sub);margin-top:4px}
.mktband .card{padding:20px 22px}
.mktband .k{font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--deep-sub)}
.mktband .v{display:block;font-family:var(--display);font-size:34px;font-weight:800;letter-spacing:-.04em;color:var(--on-deep);margin-top:8px;line-height:1.05}
.mktband .v small{font-size:15px;font-weight:600;color:var(--deep-sub);letter-spacing:0;margin-left:4px}
.mktband p{margin-top:6px;font-size:14.5px;color:var(--deep-sub)}
.mktband .card.hl{background:linear-gradient(135deg,rgba(226,181,74,.22),rgba(226,181,74,.06));border-color:rgba(226,181,74,.5)}
@media (max-width:1100px){.xm-grid,.xm-grid.rev,.de-grid{grid-template-columns:1fr;gap:44px}.xm-grid.rev > figure{order:0}.mktband{grid-template-columns:1fr 1fr}.mktband .lbl{grid-column:1/-1;max-width:none}}
@media (max-width:820px){.buys,.pillars,.xstats{grid-template-columns:1fr}.layer.l1,.layer.l2{margin-inline:0}.layer{grid-template-columns:auto 1fr}.layer .pill{grid-column:2;justify-self:start}.xshots{padding-bottom:40px}.xshots .sub2{right:0;width:60%}.xshots .ph.a{left:0}}
@media (max-width:540px){.mktband{grid-template-columns:1fr}.xstats b{font-size:38px}}
'''
rep('/* --------------------------------- responsive --------------------------------- */', v4css+'\n/* --------------------------------- responsive --------------------------------- */')

# ---------- head + nav ----------
rep('content="XELOR seed investor brief with the interactive product inside: the trusted supplier network for Indian factories, run by an agentic AI ERP. AIKYANTRA, October 2026."',
    'content="XELOR seed investor brief with the interactive product inside: verified supplier records from an agentic AI ERP, put to work on XELOR Market and Xelogram. AIKYANTRA, October 2026."')
rep('''      <a href="#network">Network</a>''','''      <a href="#network">Network</a>
      <a href="#market">Market</a>''')

# ---------- hero ----------
rep('<h1 class="hero-in" style="--d:1">Every delivery becomes a record.<br><span>The trusted supplier network for Indian factories.</span></h1>',
    '<h1 class="hero-in" style="--d:1">Every delivery becomes proof.<br><span>Every factory gets found for it.</span></h1>')
rep('<p class="hero-in" style="--d:2">XELOR is an agentic AI ERP for small factories. Its agents draft, chase and post the work. Every receipt and inspection writes the supplier’s record, and every shipment writes the factory’s passport.</p>',
    '<p class="hero-in" style="--d:2">XELOR is an agentic AI ERP that turns a factory’s receipts, inspections and shipments into verified records. XELOR Market and Xelogram put those records to work, so Indian MSMEs can find, trust and hire each other.</p>')

# ---------- headings ----------
rep('<h2 data-r style="--d:1">A factory can’t see which<br>supplier keeps its promises.</h2>','<h2 data-r style="--d:1">Promises are cheap.<br>Proof is buried.</h2>')
rep('<div class="eyebrow" data-r>02 / Why now</div>','<div class="eyebrow" data-r>03 / Why now · the rules</div>')
rep('<h2 data-r style="--d:1">Rules want a record.<br>Buyers want proof.</h2>','<h2 data-r style="--d:1">The rules changed.<br>Proof is now mandatory.</h2>')
rep('<h2 data-r style="--d:1">Agents do the work.<br>People decide.</h2>','<h2 data-r style="--d:1">The agent does the work.<br>People sign.</h2>')
rep('<h2 data-r style="--d:1">Six roles.<br>One trusted record.</h2>','<h2 data-r style="--d:1">Seven roles. One record.<br>Nothing typed twice.</h2>')
rep('<p class="lead" data-r style="--d:2">Purchase works on a laptop. The owner and the supplier use their phones. Stores uses a tablet at the gate. Every screen reads the same order.</p>',
    '<p class="lead" data-r style="--d:2">Purchase works on a laptop. The owner and the supplier use their phones. Stores uses a tablet at the gate. XELOR Market opens in any browser. Every screen reads the same order.</p>')
rep('<li><svg class="ic"><use href="#i-check"/></svg>Demonstration data, labelled on every screen. Agent steps are scripted.</li>',
    '<li><svg class="ic"><use href="#i-check"/></svg>XELOR Market, Find help and Xelogram run as a seventh role, with four tour steps.</li>\n        <li><svg class="ic"><use href="#i-check"/></svg>Demonstration data, labelled on every screen. Agent steps are scripted.</li>')
rep('<h2 data-r style="--d:1">Buy the core.<br>Add a department when it pays.</h2>','<h2 data-r style="--d:1">Start with one department.<br>Add the next when it pays.</h2>')
rep('<h2 data-r style="--d:1">Earned at the gate.<br>Never typed in.</h2>','<h2 data-r style="--d:1">Earned at the gate.<br>Impossible to fake.</h2>')
rep('<h2 data-r style="--d:1">Two records, written by the work.<br>Every request grows the network.</h2>','<h2 data-r style="--d:1">Every request is an invitation.<br>Every delivery is a reference.</h2>')
rep('<h2 data-r style="--d:1">Accelerators fund the agents.<br>Nobody owns the record.</h2>','<h2 data-r style="--d:1">The agents are crowded.<br>The record is wide open.</h2>')
rep('<h2 data-r style="--d:1">Factories pay per plant.<br>Suppliers join free.</h2>','<h2 data-r style="--d:1">Factories pay per plant.<br>MSMEs list for ₹249.</h2>')
rep('<p data-r style="--d:2">Every user in the plant is included, and so is the agent. The first payment is the pilot. Suppliers never pay.</p>',
    '<p data-r style="--d:2">Every user in the plant is included, and so is the agent. Suppliers never pay for their record. On XELOR Market a listing is free, and Verified costs about ₹8 a day.</p>')
rep('<h2 data-r style="--d:1">Start in Peenya.<br>Win it plant by plant.</h2>','<h2 data-r style="--d:1">Start in Peenya.<br>Own the cluster.</h2>')
rep('<h2 data-r style="--d:1">Features are table stakes.<br>The record is the moat.</h2>','<h2 data-r style="--d:1">Features get copied.<br>Records don’t.</h2>')
rep('<h2>Put one trusted record under every Indian factory.</h2>','<h2>Own the record every Indian factory will run on.</h2>')

# ---------- timeline: replace the rolled-back Peenya item with the TReDS guarantee ----------
m=re.search(r'\s*<li data-r style="--d:5"><time>JUN 2025</time>.*?</li>',t)
assert m; t=t.replace(m.group(0),'',1)
m=re.search(r'(<li class="new" data-r style="--d:8"><time>AUG 2026</time>.*?</li>)',t)
assert m
t=t.replace(m.group(1),m.group(1)+'\n      <li class="new" data-r style="--d:9"><time>SEP 2026</time><span class="pip"></span><h3>TReDS gets a guarantee<span class="rep">REPORTED</span></h3><p>CGTMSE covers 75% of defaults on small-firm invoices financed on TReDS. Lenders still need proof of delivery.</p></li>',1)

# ---------- new 02: AI is everywhere, verified data isn't ----------
dataera=r'''
<!-- ============================ 02 · the data era ============================ -->
<section class="section dark dataera" id="data">
  <div class="wrap">
    <div class="eyebrow" data-r>02 / Why now · the AI era</div>
    <h2 data-r style="--d:1">AI is everywhere.<br><span>Verified data isn’t.</span></h2>
    <p class="lead" data-r style="--d:2">Anyone can rent a model. No model can invent a supplier’s real on-time rate, a factory’s real return rate or the price a plant actually paid. That data is earned at the gate, one receipt at a time. Every AI decision in a factory will run on it.</p>
    <div class="de-grid">
      <div class="stack">
        <div class="layer l1" data-r style="--d:2"><span class="lx"><svg class="ic"><use href="#i-code"/></svg></span><div><b>Models</b><small>Rented by anyone. Cheaper every quarter.</small></div><span class="pill">Commodity</span></div>
        <div class="layer l2" data-r style="--d:3"><span class="lx"><svg class="ic"><use href="#i-spark"/></svg></span><div><b>Agents</b><small>20+ funded by YC alone to write RFQs and chase suppliers.</small></div><span class="pill">Crowded</span></div>
        <div class="layer gold" data-r style="--d:4"><span class="lx"><svg class="ic"><use href="#i-shield"/></svg></span><div><b>Verified data</b><small>Counted from receipts, inspections and payments. Can’t be scraped, bought or back-filled.</small></div><span class="pill">Scarce · XELOR</span></div>
        <div class="stack-foot" data-r style="--d:5">Everything above runs on this layer</div>
      </div>
      <div data-r style="--d:3">
        <p class="de-quote">Without verified data you can’t build on any model.<br><em>You can only guess faster.</em></p>
        <p>XELOR keeps the layer every agent, lender and buyer will need: records written by the work itself, inside the factory’s own ERP.</p>
      </div>
    </div>
    <div class="buys">
      <article class="card" data-r style="--d:1"><span class="n">01 · BETTER PRICES</span><h3>The best rate, both ways</h3><p>Quotes are ranked on landed cost and earned record. Buyers compare real options. A reliable supplier wins on proof instead of cutting its price to be trusted.</p></article>
      <article class="card" data-r style="--d:2"><span class="n">02 · CHEAPER MONEY</span><h3>Credit priced on proof</h3><p>Lenders price risk on evidence. Accepted invoices and on-time deliveries beat a GST score, and MSMEs face a credit gap of about ₹30 lakh crore.</p><span class="src">SIDBI, May 2025</span></article>
      <article class="card" data-r style="--d:3"><span class="n">03 · FOUND FOR WHAT YOU DO</span><h3>The right buyer finds you</h3><p>XELOR Market and Xelogram rank factories by what they delivered, not by who paid for the top slot.</p></article>
    </div>
    <div class="de-close" data-r><span class="pill">The point</span>Connecting MSMEs is the start. Verified data is what makes each connection worth money.</div>
  </div>
</section>
'''
i=t.index('<!-- ============================ 02 ============================ -->'); t=t[:i]+dataera.lstrip('\n')+'\n'+t[i:]

# ---------- new 09 XELOR Market + 10 Xelogram, before the landscape ----------
market=r'''
<!-- ============================ 09 · XELOR Market ============================ -->
<section class="section" id="market">
  <div class="wrap">
    <div class="xm-grid">
      <div>
        <div class="eyebrow" data-r>09 / XELOR Market</div>
        <h2 data-r style="--d:1">Listed is not trusted.<br>XELOR Market shows proof.</h2>
        <p class="lead" data-r style="--d:2">A marketplace and a services directory for Indian MSMEs. A listing costs a fraction of the big directories, every seller shows an earned record, and XELOR never touches the money.</p>
        <ul class="checks" data-r style="--d:3">
          <li><svg class="ic"><use href="#i-check"/></svg>Two badges on every listing: identity checked, and an earned on-time and reject record.</li>
          <li><svg class="ic"><use href="#i-check"/></svg>A buyer’s request goes to five matched sellers at most, and is never resold.</li>
          <li><svg class="ic"><use href="#i-check"/></svg>Masked calls and WhatsApp, logged. No lead fees, no auto-debit.</li>
        </ul>
        <button class="btn product-launch" data-role="mkt" type="button">Open XELOR Market <svg class="ic arr"><use href="#i-arrow"/></svg></button>
      </div>
      <figure class="xshots" data-r style="--d:2">
        <div class="laptop"><img src="{{IMGM1}}" alt="XELOR Market on a laptop: sellers near Peenya, each with an identity badge and an earned on-time record" width="1680" height="1180" loading="lazy"></div>
        <div class="sub2" data-par="0.08"><img src="{{IMGM2}}" alt="Find help: machine down, three verified technicians with response times and masked calls" width="1680" height="1180" loading="lazy"></div>
        <figcaption>MARKET · FIND HELP — CAPTURED FROM THE PRODUCT</figcaption>
      </figure>
    </div>
    <div class="pillars">
      <article class="card" data-r style="--d:1"><span class="ico"><svg class="ic"><use href="#i-store"/></svg></span><h3>A market you can check</h3><p>Castings, machining shifts, coating, sheet metal and finished goods from verified MSMEs. Sellers are ranked by distance and earned record, never by who pays more.</p><span class="note">Free to list · Verified ₹249 a month</span></article>
      <article class="card" data-r style="--d:2"><span class="ico"><svg class="ic"><use href="#i-wrench"/></svg></span><h3>Find help, fast</h3><p>Nine kinds of help a factory needs and never knows whom to call: compliance, testing, repair, job work, finance, logistics, people, effluent and legal. A one-tap Machine down button. A scheme finder for CGTMSE, ZED, Lean and TReDS.</p><span class="note">About 7 in 10 MSMEs don’t know the schemes exist</span></article>
      <article class="card" data-r style="--d:3"><span class="ico"><svg class="ic"><use href="#i-lock"/></svg></span><h3>We never touch the money</h3><p>Buyers and sellers pay each other directly. That keeps XELOR out of payment licensing and GST collection at source, and keeps its incentives clean: no lead fees, so no reason to spam.</p><span class="note">Reviews only after a logged, confirmed job</span></article>
    </div>
    <div class="xstats-h" data-r><h3>The market the directories leave behind</h3><span class="pill acc">Q1 FY27</span></div>
    <div class="xstats">
      <div class="card" data-r style="--d:1"><b>8.8M</b><p>supplier storefronts listed on IndiaMART</p></div>
      <div class="card" data-r style="--d:2"><b>~2.5%</b><p>of them pay, about 2.18 lakh, and that number has fallen three quarters running</p></div>
      <div class="card" data-r style="--d:3"><b>₹<span class="num" data-count="32">32</span>K</b><p>a year for its entry paid plan, after a rise in Sept 2025</p></div>
    </div>
    <div class="vsw" data-r><table class="vs">
      <thead><tr><th></th><th>A typical B2B directory</th><th class="us">XELOR Market</th></tr></thead>
      <tbody>
        <tr><td>Price to sell</td><td>₹32,000+ a year for an entry paid plan; top tiers into lakhs</td><td class="us"><b>Free</b>, or Verified at ₹249 a month (₹2,490 a year)</td></tr>
        <tr><td>What the badge checks</td><td>Identity only, for about ₹50,000 a year</td><td class="us">Identity, plus an earned delivery and reject record</td></tr>
        <tr><td>A buyer’s enquiry</td><td>Shared with 10 or more sellers, sellers report</td><td class="us">Five matched sellers at most, never resold</td></tr>
        <tr><td>Renewal</td><td>Auto-debit mandates; complaints after cancelling</td><td class="us">No auto-debit. You renew yourself</td></tr>
        <tr><td>Services</td><td>Search results and paid ranking</td><td class="us">Checked providers, masked calls, reviews from confirmed jobs</td></tr>
      </tbody></table></div>
    <p class="foot-note" data-r>Directory figures from IndiaMART’s Q1 FY27 results and published price lists as summarised in October 2026 coverage, and from seller reviews. Not yet checked against the filings; the paying-share figure is our arithmetic.</p>
  </div>
</section>

<!-- ============================ 10 · Xelogram ============================ -->
<section class="section tint" id="xelogram">
  <div class="wrap">
    <div class="xm-grid rev">
      <div>
        <div class="eyebrow" data-r>10 / Xelogram</div>
        <h2 data-r style="--d:1">Instagram sells lifestyles.<br>Xelogram sells capability.</h2>
        <p class="lead" data-r style="--d:2">A marketing feed only for Indian MSMEs. The agent drafts posts from verified events, so every post carries proof, and any post can start a quote.</p>
        <ul class="checks" data-r style="--d:3">
          <li><svg class="ic"><use href="#i-check"/></svg>A verified delivery becomes a post. The owner approves it with one tap.</li>
          <li><svg class="ic"><use href="#i-check"/></svg>Captions in Tamil, Kannada, Hindi or English, labelled as AI-drafted.</li>
          <li><svg class="ic"><use href="#i-check"/></svg>A proof badge and a Request quote button on every post.</li>
          <li><svg class="ic"><use href="#i-check"/></svg>Buyer names stay hidden. Owners choose who sees each part of the record.</li>
          <li><svg class="ic"><use href="#i-check"/></svg>One tap shares to WhatsApp Status, Instagram and LinkedIn.</li>
        </ul>
        <button class="btn product-launch" data-role="mkt" type="button">Open Xelogram <svg class="ic arr"><use href="#i-arrow"/></svg></button>
      </div>
      <figure class="xshots" data-r style="--d:2">
        <div class="laptop"><img src="{{IMGM3}}" alt="Xelogram feed on a laptop: Sri Ganesh Castings' post with a verified-delivery badge and a Request quote button" width="1680" height="1180" loading="lazy"></div>
        <img class="ph b" data-par="0.06" src="{{IMGM5}}" alt="Supplier's phone: the post is live, shared to WhatsApp Status" width="639" height="1349" loading="lazy">
        <img class="ph a" data-par="0.12" src="{{IMGM4}}" alt="Supplier's phone: the agent's draft post with a Tamil caption, waiting for approval" width="639" height="1349" loading="lazy">
        <figcaption>KAVERI’S FEED · SRI GANESH’S PHONE — CAPTURED FROM THE PRODUCT</figcaption>
      </figure>
    </div>
    <div class="xstats">
      <div class="card" data-r style="--d:1"><b><span class="num" data-count="97">97</span>%</b><p>of MSMEs use WhatsApp. Xelogram posts travel there.</p><span class="src">SIDBI, May 2025</span></div>
      <div class="card" data-r style="--d:2"><b><span class="num" data-count="13">13</span>%</b><p>do any social-media marketing today. The habit is still open.</p><span class="src">SIDBI, May 2025</span></div>
      <div class="card" data-r style="--d:3"><b><span class="num" data-count="40">40</span>K+</b><p>Alibaba.com suppliers have tried livestreaming factory tours. Showing the floor sells.</p><span class="src">China Daily, 2023</span></div>
    </div>
    <p class="namenote" data-r><span class="pill gold">Note</span>Measured in quotes asked, not likes. “Xelogram” is a working name: Instagram has opposed other “-gram” marks, so a trade-mark search comes before launch.</p>
  </div>
</section>
'''
i=t.index('<!-- ============================ 08 · landscape ============================ -->')
t=t[:i]+market.lstrip('\n')+'\n'+t[i:]

# ---------- landscape table: add directories and the market rows ----------
i=t.index('<div class="mxw" data-r style="--d:2"><table class="mx">'); j=t.index('</table></div>',i)+len('</table></div>')
D=lambda c,txt:f'<span class="dc"><i{(" class="+chr(34)+c+chr(34)) if c else ""}></i>{txt}</span>'
rows=[
 ('Request, rank and award',[('f','crowded'),('f','inside the platform'),('','enquiries only'),('','manual')],'agent drafts, person awards'),
 ('Supplier quotes with no login',[('h','by email'),('','portal'),('h','calls and app'),('','—')],'message link, voice, API'),
 ('Record earned from receipts and inspections',[('','reads others’ systems'),('h','kept by the middleman'),('','identity badge only'),('','no network')],'counted at the gate'),
 ('Factory passport for buyers',[('','—'),('','—'),('','—'),('','—')],'read-only link'),
 ('Buyer request capped, never resold',[('','—'),('h','platform-owned'),('','shared with 10+'),('','—')],'5 sellers at most'),
 ('Services directory, reviews from real jobs',[('','—'),('','—'),('h','paid ranking'),('','—')],'Find help + scheme finder'),
 ('Marketing feed with proof',[('','—'),('','—'),('h','video catalogue'),('','—')],'Xelogram'),
 ('Peer capacity, no cut',[('','—'),('h','takes a margin'),('','—'),('','—')],'booked directly'),
 ('Inside a GST-native factory ERP',[('','overlay'),('','outside the factory'),('h','Busy, separately'),('f','yes')],'yes, or beside Tally'),
]
body=''.join(f'<tr><td>{r}</td>'+''.join(f'<td>{D(c,x)}</td>' for c,x in cells)+f'<td class="us">{D("f",us)}</td></tr>' for r,cells,us in rows)
table=('<div class="mxw" data-r style="--d:2"><table class="mx">'
 '<thead><tr><th style="width:20%">What it takes</th>'
 '<th>Buyer-side AI agents<small>Didero ($30M A) · Lio ($30M A, a16z) · Mandel AI (YC) · Tenkara (HF0) · Magentic (Sequoia Arc)</small></th>'
 '<th>Managed marketplaces<small>Zetwerk · Jiga (YC, $12M A) · CADDi ($1.2B)</small></th>'
 '<th>B2B directories<small>IndiaMART · JustDial · TradeIndia</small></th>'
 '<th>SME ERPs<small>Tally · Zoho · Odoo · Tiny (YC F24)</small></th>'
 '<th class="us">XELOR</th></tr></thead><tbody>'+body+'</tbody></table></div>')
t=t[:i]+table+t[j:]
rep('.mx{width:100%;border-collapse:collapse;font-size:15.5px;min-width:880px}','.mx{width:100%;border-collapse:collapse;font-size:15px;min-width:1040px}')

# ---------- business model: market prices, safer early-payment wording ----------
rep('<div class="agentline" data-r><svg class="ic"><use href="#i-spark"/></svg><p><b>Later, not live:</b> a share of supplier early payment through TReDS partners, priced on the earned record. Capacity bookings between factories carry no fee.</p></div>',
'''<div class="mktband">
      <div class="lbl" data-r><b>XELOR Market</b><small>For any MSME, with or without the ERP. No lead fees, no auto-debit.</small></div>
      <div class="card" data-r style="--d:1"><span class="k">Free</span><span class="v">₹0</span><p>A listing, call and WhatsApp buttons, Find help, posting on Xelogram.</p></div>
      <div class="card hl" data-r style="--d:2"><span class="k">Verified</span><span class="v">₹249<small>/ month</small></span><p>Identity and earned-record badges, matched buyer requests, capped and labelled boosts. ₹2,490 a year.</p></div>
      <div class="card" data-r style="--d:3"><span class="k">ERP plants</span><span class="v">Included</span><p>Records read live, posts drafted from verified events, capacity from the schedule.</p></div>
    </div>
    <div class="agentline" data-r><svg class="ic"><use href="#i-spark"/></svg><p><b>Later, not live:</b> XELOR facilitates access to early payment from RBI-regulated TReDS and lending partners, who pay the supplier directly and pay XELOR a referral fee. XELOR never holds or moves money. Capacity bookings between factories carry no fee.</p></div>''')

# ---------- now ----------
rep('<li><svg class="ic"><use href="#i-check"/></svg>The interactive product in this brief, now with the agent and passports</li>',
    '<li><svg class="ic"><use href="#i-check"/></svg>The interactive product in this brief: the agent, passports, XELOR Market, Find help and Xelogram</li>')
rep('<li><svg class="ic"><use href="#i-dot"/></svg>Agent steps are scripted; no language model is connected</li>',
    '<li><svg class="ic"><use href="#i-dot"/></svg>Agent steps are scripted; no language model is connected</li>\n        <li><svg class="ic"><use href="#i-dot"/></svg>Market listings, calls and posts are demonstration data; no payments run anywhere</li>')

# ---------- renumber every eyebrow in page order ----------
n=[0]
def renum(m):
    n[0]+=1
    return f'{m.group(1)}{n[0]:02d} / '
t=re.sub(r'(<div class="eyebrow"(?: data-r)?>)\d\d / ',renum,t)
print('v4 sections numbered:',n[0])
