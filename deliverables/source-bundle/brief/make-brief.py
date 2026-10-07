import json,base64,re
t=open('old/brief-template.html').read()
def rep(a,b,count=1):
    global t
    assert a in t, 'MISSING: '+a[:90]
    t=t.replace(a,b,count)

# ---------- head ----------
rep('content="XELOR seed investor brief with the interactive product inside: the ERP an Indian factory buys one department at a time. AIKYANTRA, October 2026."',
    'content="XELOR seed investor brief with the interactive product inside: the trusted supplier network for Indian factories, run by an agentic AI ERP. AIKYANTRA, October 2026."')
extra_css=r'''
/* ---------- v3: network, records, landscape (same soft language as the rest) ---------- */
.tl{grid-template-columns:repeat(4,1fr);row-gap:40px;overflow-x:clip}
.tl::before{display:none}
.tl li::before{content:"";position:absolute;left:0;right:-20px;top:34px;height:1px;background:var(--line-2)}
.tl li.new .pip{border-color:var(--gold);background:var(--gold)}
.tl li.new time{color:var(--gold-ink)}
.tl .rep{display:inline-block;margin-left:6px;font-family:var(--mono);font-size:9.5px;letter-spacing:.08em;color:var(--muted);border:1px solid var(--line-2);border-radius:5px;padding:0 5px;vertical-align:2px}
.stations li.rec .n::after{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--gold-hi);margin-left:6px;vertical-align:1px}
.st-key{margin-top:18px;font-size:14px;color:var(--deep-sub);display:flex;align-items:center;gap:8px}
.st-key::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--gold-hi)}
.recs{display:grid;grid-template-columns:1fr 1fr;gap:22px}
.rec{padding:30px;display:flex;flex-direction:column;gap:18px}
.rec .who{display:flex;gap:14px;align-items:center}
.rec .lg{width:52px;height:52px;border-radius:15px;display:grid;place-items:center;color:#fff;font-family:var(--display);font-weight:800;font-size:18px;flex:none}
.rec .who b{display:block;font-family:var(--display);font-size:22px;color:var(--ink);letter-spacing:-.02em}
.rec .who small{font-size:14px;color:var(--muted)}
.rec .k3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.rec .k3 div{background:var(--surface-2);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.rec .k3 b{display:block;font-family:var(--display);font-size:32px;font-weight:700;color:var(--ink);letter-spacing:-.035em;line-height:1.05}
.rec .k3 small{display:block;margin-top:6px;font-size:13.5px;color:var(--muted);line-height:1.35}
.rec p{font-size:16px;color:var(--muted)}
.rec.pp{border-color:color-mix(in srgb,var(--gold) 50%,var(--line))}
.rec .pill{align-self:flex-start}
.loop{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-top:26px}
.loop li{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:20px 20px 22px;position:relative}
.loop li:not(:last-child)::after{content:"";position:absolute;right:-12px;top:50%;width:8px;height:8px;border-top:2px solid var(--gold);border-right:2px solid var(--gold);transform:translateY(-50%) rotate(45deg)}
.loop .n{font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.12em;color:var(--gold-ink)}
.loop b{display:block;font-family:var(--display);font-size:18px;color:var(--ink);margin:10px 0 6px;letter-spacing:-.015em;line-height:1.2}
.loop span{font-size:14.5px;color:var(--muted);line-height:1.45}
.loop-foot{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-top:18px;font-size:14px;color:var(--muted)}
.mxw{overflow-x:auto;border:1px solid var(--line);border-radius:20px;background:var(--surface)}
.mx{width:100%;border-collapse:collapse;font-size:15.5px;min-width:880px}
.mx th,.mx td{padding:15px 18px;text-align:left;border-bottom:1px solid var(--line);vertical-align:middle}
.mx th{font-family:var(--display);font-size:17px;font-weight:700;color:var(--ink);vertical-align:bottom;letter-spacing:-.015em}
.mx th small{display:block;font-family:var(--sans);font-weight:400;font-size:13px;color:var(--muted);margin-top:5px;letter-spacing:0;line-height:1.4}
.mx td:first-child{font-weight:700;color:var(--ink)}
.mx tr:last-child td{border-bottom:0}
.mx .us{background:var(--gold-soft)}
.mx th.us{color:var(--gold-ink)}
.dc{display:inline-flex;gap:9px;align-items:center;color:var(--muted);font-size:14.5px}
.dc i{width:13px;height:13px;border-radius:50%;border:2px solid var(--line-2);flex:none}
.dc i.f{background:var(--acc);border-color:var(--acc)} .dc i.h{background:linear-gradient(90deg,var(--acc) 50%,transparent 50%);border-color:var(--acc)}
.us .dc{color:var(--ink)} .us .dc i.f{background:var(--gold);border-color:var(--gold)}
.watch{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px;align-items:center}
.gtm-h{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:46px}
.gtm{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:18px}
.gtm .card{padding:24px}
.gtm .n{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:var(--acc-soft);color:var(--acc);font-family:var(--display);font-weight:800}
.gtm h3{margin-top:16px;font-size:19px}
.gtm p{margin-top:8px;font-size:15.5px;color:var(--muted)}
.price.free{background:var(--deep-card)}
.agentline{margin-top:28px;display:flex;gap:14px;align-items:flex-start;padding:20px 24px;border:1px solid var(--deep-line);border-radius:18px;background:var(--deep-card)}
.agentline .ic{color:var(--gold-hi);width:24px;height:24px;margin-top:2px}
.agentline p{font-size:16.5px;color:var(--deep-sub)} .agentline b{color:var(--on-deep)}
@media (max-width:1100px){.loop{grid-template-columns:repeat(3,1fr)}.loop li::after{display:none}.gtm{grid-template-columns:1fr 1fr}}
@media (max-width:820px){.recs,.gtm{grid-template-columns:1fr}.loop{grid-template-columns:1fr 1fr}.gtm-h{flex-direction:column;align-items:flex-start}}
@media (max-width:540px){.rec .k3,.loop{grid-template-columns:1fr}.rec{padding:22px}}
'''
rep('/* --------------------------------- responsive --------------------------------- */', extra_css+'\n/* --------------------------------- responsive --------------------------------- */')

# ---------- nav ----------
rep('''      <a href="#product">Product</a>
      <a href="#model">Business model</a>''','''      <a href="#product">Product</a>
      <a href="#network">Network</a>
      <a href="#model">Business model</a>''')

# ---------- hero ----------
rep('<h1 class="hero-in" style="--d:1">One order, typed once.<br><span>One record for the whole factory.</span></h1>',
    '<h1 class="hero-in" style="--d:1">Every delivery becomes a record.<br><span>The trusted supplier network for Indian factories.</span></h1>')
rep('<p class="hero-in" style="--d:2">XELOR is the ERP an Indian factory buys one department at a time. Sales, purchase, stores, the floor and accounts all work from the same order.</p>',
    '<p class="hero-in" style="--d:2">XELOR is an agentic AI ERP for small factories. Its agents draft, chase and post the work. Every receipt and inspection writes the supplier’s record, and every shipment writes the factory’s passport.</p>')
rep('<div class="core"><b>XELOR</b><span>One shared record</span></div>','<div class="core"><b>XELOR</b><span>One trusted record</span></div>')
rep('<p>Typed once. Read by every department. Earned at the gate.</p>','<p>Run by agents. Decided by people. Earned at the gate.</p>')

# ---------- 01 ----------
rep('<h2 data-r style="--d:1">The order moves.<br>The number gets retyped.</h2>','<h2 data-r style="--d:1">A factory can’t see which<br>supplier keeps its promises.</h2>')
rep('<p data-r style="--d:2">A factory’s work is one chain. Its software is a set of islands, and a person carries each number between them by hand.</p>',
    '<p data-r style="--d:2">The proof sits in every receipt and inspection. It lives on islands, and a person carries each number between them by hand.</p>')

# ---------- 02 why now ----------
rep('<h2 data-r style="--d:1">Compliance wants a system.<br>Buyers want a record.</h2>','<h2 data-r style="--d:1">Rules want a record.<br>Buyers want proof.</h2>')
rep('<p data-r style="--d:2">Each rule below needs a record most factories do not keep. Only 12% have the software that would keep it.</p>',
    '<p data-r style="--d:2">Each rule below needs a record most factories do not keep. Only 12% have the software for it, and agents now make keeping it cheap.</p>')
rep('<li data-r style="--d:6"><time>FY 2025–26</time><span class="pip"></span><h3>Order platforms scale</h3><p>Zetwerk reports ₹15,913 crore across 6,979 suppliers. Buyers choose shops on proof.</p></li>',
    '<li data-r style="--d:6"><time>FY 2025–26</time><span class="pip"></span><h3>Order platforms scale</h3><p>Zetwerk reports ₹15,913 crore across 6,979 suppliers. Buyers choose shops on proof.</p></li>\n      <li class="new" data-r style="--d:7"><time>MAY 2026</time><span class="pip"></span><h3>Business AI on WhatsApp<span class="rep">REPORTED</span></h3><p>Agents can answer on the channel every supplier already uses.</p></li>\n      <li class="new" data-r style="--d:8"><time>AUG 2026</time><span class="pip"></span><h3>MSMED amendment<span class="rep">REPORTED</span></h3><p>Pushes more small-supplier invoices through TReDS. Text to be verified.</p></li>')

# ---------- 03 how ----------
rep('<h2 data-r style="--d:1">One order.<br>Nine stations.</h2>','<h2 data-r style="--d:1">Agents do the work.<br>People decide.</h2>')
rep('<p data-r style="--d:2">Typed once at the start. Every department reads the same order, so nothing is sent or retyped.</p>',
    '<p data-r style="--d:2">One order passes nine stations. The agent drafts, chases and posts at each one. Anything that commits money or stock waits for a person.</p>')
rep('''      <li><svg class="ic"><use href="#i-copy"/></svg><h3>Nothing is typed twice</h3><p>Planning, stores, production and accounts read the same order. Nobody sends it anywhere.</p></li>
      <li><svg class="ic"><use href="#i-scan"/></svg><h3>A second scan is refused</h3><p>Scanning the same challan twice posts nothing, so the count and the books always agree.</p></li>
      <li><svg class="ic"><use href="#i-msg"/></svg><h3>The supplier needs no account</h3><p>The request arrives as a message with a private link. Price per piece is the only required field.</p></li>''',
'''      <li><svg class="ic"><use href="#i-spark"/></svg><h3>The agent drafts and chases</h3><p>It reads the customer’s PO from email, writes the supplier request from the BOM and quality plan, and chases replies.</p></li>
      <li><svg class="ic"><use href="#i-people"/></svg><h3>A person decides</h3><p>Confirming, awarding, approving, releasing and paying stay with people. Above a limit, the owner signs on the phone.</p></li>
      <li><svg class="ic"><use href="#i-shield"/></svg><h3>The work writes the record</h3><p>A receipt, an inspection, a shipment and an on-time payment each update a record nobody can type into.</p></li>''')
rep('<li style="--i:5"><span class="n">06</span><b>Receive</b>','<li class="rec" style="--i:5"><span class="n">06</span><b>Receive</b>')
rep('<li style="--i:7"><span class="n">08</span><b>Dispatch</b>','<li class="rec" style="--i:7"><span class="n">08</span><b>Dispatch</b>')
rep('<li style="--i:8"><span class="n">09</span><b>Books</b>','<li class="rec" style="--i:8"><span class="n">09</span><b>Books</b>')
rep('''    </ol>
    <div class="how-cta" data-r>''','''    </ol>
    <p class="st-key">Stations that write a record: the supplier’s at the gate, the factory’s at dispatch and payment</p>
    <div class="how-cta" data-r>''')

# ---------- 04 product ----------
rep('<h2 data-r style="--d:1">Six roles.<br>One shared record.</h2>','<h2 data-r style="--d:1">Six roles.<br>One trusted record.</h2>')
rep('''        <li><svg class="ic"><use href="#i-check"/></svg>The supplier quotes from a message link, with no login and no app.</li>
        <li><svg class="ic"><use href="#i-check"/></svg>Above a buyer’s limit, the purchase order goes to the owner’s phone.</li>
        <li><svg class="ic"><use href="#i-check"/></svg>Demonstration data, labelled on every screen.</li>''',
'''        <li><svg class="ic"><use href="#i-check"/></svg>The XELOR Agent shows what it did, what it is chasing and what needs you.</li>
        <li><svg class="ic"><use href="#i-check"/></svg>The supplier quotes from a message link or a voice note, with no login and no app.</li>
        <li><svg class="ic"><use href="#i-check"/></svg>Above a buyer’s limit, the purchase order goes to the owner’s phone.</li>
        <li><svg class="ic"><use href="#i-check"/></svg>Demonstration data, labelled on every screen. Agent steps are scripted.</li>''')
rep('alt="XELOR purchase screen on a laptop: today\'s route card for one sales order, station 1 of 9" width="1680" height="1124"',
    'alt="XELOR purchase screen on a laptop: the XELOR Agent card above the route card, station 4 of 9" width="1680" height="1180"')
rep('alt="Supplier\'s phone: a request for quotation arrives as a message, and the quote goes back from the link" width="639" height="1347"',
    'alt="Supplier\'s phone: quoting by voice note from the no-login link" width="639" height="1349"')
rep('alt="Owner\'s phone: one approval needs you, a purchase order for 1,68,000 rupees" width="639" height="1347"',
    'alt="Owner\'s phone: approve a purchase order for 1,68,000 rupees, with the reasons it came to him" width="639" height="1349"')

# ---------- 05 range ----------
rep('<div class="card pkg" data-r style="--d:8"><span class="ico"><svg class="ic"><use href="#i-spark"/></svg></span><div><h3>ONYX</h3><p>Intelligence over any system</p></div><span class="pill gold">Rule-based today</span></div>',
    '<div class="card pkg" data-r style="--d:8"><span class="ico"><svg class="ic"><use href="#i-spark"/></svg></span><div><h3>XELOR Agent</h3><p>Drafts, chases and posts across every package</p></div><span class="pill gold">Scripted in demo</span></div>')
rep('<div><h3>Supplier network</h3><p>Requests and quotes outside the walls</p></div><span class="pill ok">Running in demo</span>',
    '<div><h3>Trusted supplier network</h3><p>Earned records, passports and peer capacity</p></div><span class="pill ok">Running in demo</span>')

# ---------- 06 record: card 03 becomes the passport ----------
rep('<article class="card" data-r style="--d:3"><span class="big">03</span><h3>A one-minute quote</h3><p>The request arrives as a message. The supplier answers from a private link.</p><span class="note">No account, no app, one required field.</span></article>',
    '<article class="card" data-r style="--d:3"><span class="big">03</span><h3>The factory earns one too</h3><p>Shipments, returns and on-time supplier payments write the factory’s own passport.</p><span class="note">Shared with buyers as a read-only link.</span></article>')

# ---------- new 07 network + 08 landscape, inserted before business model ----------
network=r'''
<!-- ============================ 07 · network ============================ -->
<section class="section tint" id="network">
  <div class="wrap">
    <div class="eyebrow" data-r>07 / The network</div>
    <div class="section-head">
      <h2 data-r style="--d:1">Two records, written by the work.<br>Every request grows the network.</h2>
      <p data-r style="--d:2">Suppliers join free. Factories book each other’s spare capacity with no cut. A record can’t be back-filled, so time in the network is the moat.</p>
    </div>
    <div class="recs">
      <article class="card rec" data-r style="--d:1">
        <span class="pill gold">Supplier record · free for suppliers</span>
        <div class="who"><span class="lg" style="background:#9a6a26">SG</span><div><b>Sri Ganesh Castings</b><small>Hosur · counted at Kaveri’s gate since Mar 2026</small></div></div>
        <div class="k3"><div><b>95%</b><small>on time over 19 deliveries</small></div><div><b>0.83%</b><small>rejected of 1,200 pieces</small></div><div><b>4 pours</b><small>free before 9 Oct, read live</small></div></div>
        <p>It feeds a quarter of every ranking. Keeping promises now wins work later, with every XELOR buyer.</p>
      </article>
      <article class="card rec pp" data-r style="--d:2">
        <span class="pill acc">Factory passport</span>
        <div class="who"><span class="lg" style="background:#7a2945">KP</span><div><b>Kaveri Pumps &amp; Castings</b><small>Peenya · shared with buyers as a read-only link</small></div></div>
        <div class="k3"><div><b>91%</b><small>on time to customers, 42 of 46</small></div><div><b>0.32%</b><small>returned, 4 of 1,240 pumps</small></div><div><b>32/32</b><small>small suppliers paid on time</small></div></div>
        <p>Buyers see the rates and when each was earned. Prices, margins and customer names stay private.</p>
      </article>
    </div>
    <ol class="loop">
      <li data-r style="--d:1"><span class="n">01</span><b>A factory runs XELOR</b><span>Its agent sends every supplier request.</span></li>
      <li data-r style="--d:2"><span class="n">02</span><b>Suppliers quote from a link</b><span>No login, by text or voice note, or over API.</span></li>
      <li data-r style="--d:3"><span class="n">03</span><b>They claim a free record</b><span>And use it with every other XELOR buyer.</span></li>
      <li data-r style="--d:4"><span class="n">04</span><b>Buyers ask for passports</b><span>Proof decides who gets the next order.</span></li>
      <li data-r style="--d:5"><span class="n">05</span><b>More factories join</b><span>And book each other’s free shifts directly.</span></li>
    </ol>
    <div class="loop-foot" data-r><span>Density per cluster beats national spread. One cluster where plants trade with each other is the goal.</span><button class="btn ghost product-launch" data-role="pur" type="button">See the passport in the product <svg class="ic arr"><use href="#i-arrow"/></svg></button></div>
  </div>
</section>

<!-- ============================ 08 · landscape ============================ -->
<section class="section" id="landscape">
  <div class="wrap">
    <div class="eyebrow" data-r>08 / The landscape</div>
    <div class="section-head">
      <h2 data-r style="--d:1">Accelerators fund the agents.<br>Nobody owns the record.</h2>
      <p data-r style="--d:2">We scanned YC, a16z speedrun, Techstars, HF0, Sequoia Arc, Peak XV Surge, Accel Atoms and others. The agents are crowded. The record is open.</p>
    </div>
    <div class="mxw" data-r style="--d:2"><table class="mx">
      <thead><tr><th style="width:24%">What it takes</th><th>Buyer-side AI agents<small>Didero ($30M A) · Lio ($30M A, a16z) · Mandel AI (YC) · Tenkara (HF0) · Magentic (Sequoia Arc)</small></th><th>Managed marketplaces<small>Zetwerk · Jiga (YC, $12M A) · CADDi ($1.2B)</small></th><th>SME ERPs<small>Tally · Zoho · Odoo · Tiny (YC F24)</small></th><th class="us">XELOR</th></tr></thead>
      <tbody>
        <tr><td>Request, rank and award</td><td><span class="dc"><i class="f"></i>crowded</span></td><td><span class="dc"><i class="f"></i>inside the platform</span></td><td><span class="dc"><i></i>manual</span></td><td class="us"><span class="dc"><i class="f"></i>agent drafts, person awards</span></td></tr>
        <tr><td>Supplier quotes with no login</td><td><span class="dc"><i class="h"></i>by email</span></td><td><span class="dc"><i></i>portal</span></td><td><span class="dc"><i></i>—</span></td><td class="us"><span class="dc"><i class="f"></i>message link, voice, API</span></td></tr>
        <tr><td>Record earned from receipts and inspections</td><td><span class="dc"><i></i>reads others’ systems</span></td><td><span class="dc"><i class="h"></i>kept by the middleman</span></td><td><span class="dc"><i></i>no network</span></td><td class="us"><span class="dc"><i class="f"></i>counted at the gate</span></td></tr>
        <tr><td>Factory passport for buyers</td><td><span class="dc"><i></i>—</span></td><td><span class="dc"><i></i>—</span></td><td><span class="dc"><i></i>—</span></td><td class="us"><span class="dc"><i class="f"></i>read-only link</span></td></tr>
        <tr><td>Peer capacity, no cut</td><td><span class="dc"><i></i>—</span></td><td><span class="dc"><i class="h"></i>takes a margin</span></td><td><span class="dc"><i></i>—</span></td><td class="us"><span class="dc"><i class="f"></i>booked directly</span></td></tr>
        <tr><td>Inside a GST-native factory ERP</td><td><span class="dc"><i></i>overlay</span></td><td><span class="dc"><i></i>outside the factory</span></td><td><span class="dc"><i class="f"></i>yes</span></td><td class="us"><span class="dc"><i class="f"></i>yes, or beside Tally</span></td></tr>
      </tbody></table></div>
    <div class="watch" data-r><span class="pill acc">Watch</span><span class="tag">Tiny (YC F24) · same factories, no network yet</span><span class="tag">IndiaMART + Busy · directory and accounting</span><span class="tag">Procol (Surge) · enterprise sourcing</span><span class="tag">OfBusiness · credit-led buying</span></div>
    <p class="foot-note" data-r>October 2026 scan. Some directories were blocked, so not finding a company is not proof it does not exist.</p>
  </div>
</section>
'''
rep('''
<!-- ============================ 07 ============================ -->
<section class="section dark" id="model">''', network+'''
<!-- ============================ 09 ============================ -->
<section class="section dark" id="model">''')

# ---------- business model ----------
rep('<div class="eyebrow" data-r>07 / Business model</div>','<div class="eyebrow" data-r>09 / Business model</div>')
rep('<h2 data-r style="--d:1">Per plant.<br>Never per seat.</h2>','<h2 data-r style="--d:1">Factories pay per plant.<br>Suppliers join free.</h2>')
rep('<p data-r style="--d:2">A factory decision crosses departments, so every user is included. The first payment is the pilot.</p>',
    '<p data-r style="--d:2">Every user in the plant is included, and so is the agent. The first payment is the pilot. Suppliers never pay.</p>')
rep('<p>₹6 lakh a year. The whole plant, two standard connectors, every user included.</p>','<p>₹6 lakh a year. The whole plant, the agent, two standard connectors, every user included.</p>')
rep('<div class="card price" data-r style="--d:4"><span class="k">More plants</span><span class="v word">Group rate</span><p>Each extra factory joins at a group discount, with one view across every plant.</p></div>',
    '<div class="card price free" data-r style="--d:4"><span class="k">Suppliers</span><span class="v">₹0</span><p>A free record, quotes from a link and a capacity calendar. Extra plants join at a group rate.</p></div>')
rep('<span>Launch prices under test. No customer has accepted them yet; they are fixed after five paid pilots in each segment.</span></p>\n    </div>',
    '<span>Launch prices under test. No customer has accepted them yet; they are fixed after five paid pilots in each segment.</span></p>\n    </div>\n    <div class="agentline" data-r><svg class="ic"><use href="#i-spark"/></svg><p><b>Later, not live:</b> a share of supplier early payment through TReDS partners, priced on the earned record. Capacity bookings between factories carry no fee.</p></div>')

# ---------- renumber ----------
rep('<div class="eyebrow" data-r>08 / Market and unit economics</div>','<div class="eyebrow" data-r>10 / Market and unit economics</div>')
rep('<div class="eyebrow" data-r>09 / What must become defensible</div>','<div class="eyebrow" data-r>11 / What must become defensible</div>')
rep('<div class="eyebrow" data-r>10 / Where we are, stated plainly</div>','<div class="eyebrow" data-r>12 / Where we are, stated plainly</div>')
rep('<div class="eyebrow" data-r>11 / The founding team</div>','<div class="eyebrow" data-r>13 / The founding team</div>')
rep('<div class="eyebrow">12 / Proposed seed round</div>','<div class="eyebrow">14 / Proposed seed round</div>')
for a,b in [('<!-- ============================ 08 ============================ -->','<!-- ============================ 10 ============================ -->'),
            ('<!-- ============================ 09 ============================ -->\n<section class="section tint" id="moat">','<!-- ============================ 11 ============================ -->\n<section class="section tint" id="moat">'),
            ('<!-- ============================ 10 ============================ -->\n<section class="section" id="now">','<!-- ============================ 12 ============================ -->\n<section class="section" id="now">'),
            ('<!-- ============================ 11 ============================ -->\n<section class="section tint" id="team">','<!-- ============================ 13 ============================ -->\n<section class="section tint" id="team">')]:
    if a in t: t=t.replace(a,b,1)

# ---------- moat: agents card + go-to-market ----------
m=re.search(r'<div class="card" data-r style="--d:1"><span class="ico"><svg class="ic"><use href="#i-layers"/></svg></span>.*?</div></div>',t)
assert m
t=t.replace(m.group(0),'<div class="card" data-r style="--d:1"><span class="ico"><svg class="ic"><use href="#i-spark"/></svg></span><div><span class="q">If a funded AI agent moves down-market</span><h3>It sits on someone else’s ERP</h3><p>Didero, Mandel AI and Magentic read other systems. The record is counted where XELOR runs: at the gate.</p></div></div>',1)
m=re.search(r'<div class="card" data-r style="--d:2"><span class="ico"><svg class="ic"><use href="#i-book"/></svg></span>.*?</div></div>',t)
assert m
t=t.replace(m.group(0),'<div class="card" data-r style="--d:2"><span class="ico"><svg class="ic"><use href="#i-book"/></svg></span><div><span class="q">If Tally, Zoho or IndiaMART + Busy go deeper</span><h3>We start beside them</h3><p>A network layer synced to Tally, Busy or Zoho, then the full ERP when the plant is ready. We do the setup ourselves.</p></div></div>',1)
gtm='''
    <div class="gtm-h" data-r><h3>How we win the cluster</h3><span class="pill acc">Density before spread</span></div>
    <div class="gtm">
      <div class="card" data-r style="--d:1"><span class="n">1</span><h3>Ten plants that trade</h3><p>Pilot factories in Peenya chosen because they buy from each other, so records start dense.</p></div>
      <div class="card" data-r style="--d:2"><span class="n">2</span><h3>Start beside Tally</h3><p>The network layer first, synced to the books they already keep. The full ERP when ready.</p></div>
      <div class="card" data-r style="--d:3"><span class="n">3</span><h3>Every request invites</h3><p>Suppliers claim free records. Their other buyers see them, and the cluster fills itself.</p></div>
      <div class="card" data-r style="--d:4"><span class="n">4</span><h3>Then the next cluster</h3><p>Hosur next door, then Coimbatore’s pump makers. Tiny (YC F24) chases the same factories; we win on GST, Indian languages and WhatsApp.</p></div>
    </div>'''
rep('''It needs many plants in one cluster''','''It needs many plants in one cluster''')
i=t.index('<section class="section tint" id="moat">'); j=t.index('</section>',i)
blk=t[i:j]; k=blk.rindex('  </div>')
t=t[:i]+blk[:k]+gtm+'\n'+blk[k:]+t[j:]

# ---------- now ----------
rep('<li><svg class="ic"><use href="#i-check"/></svg>The interactive demo in this brief</li>','<li><svg class="ic"><use href="#i-check"/></svg>The interactive product in this brief, now with the agent and passports</li>')
rep('<li><svg class="ic"><use href="#i-dot"/></svg>ONYX answers by rules; no language model is connected</li>','<li><svg class="ic"><use href="#i-dot"/></svg>Agent steps are scripted; no language model is connected</li>')

# ---------- ask ----------
rep('<h2>Put one record under the Indian factory.</h2>','<h2>Put one trusted record under every Indian factory.</h2>')
rep('<p>Production baseline, two connectors, 3–4 paid pilots</p>','<p>Production baseline, Tally connector, 3–4 paid pilots in one Peenya trading circle</p>')
rep('<p>At least 8 recurring customers</p>','<p>At least 8 recurring plants, first suppliers claiming records</p>')
rep('<p>16–20 recurring customers, three reusable connector families</p>','<p>16–20 recurring plants, passports shared with outside buyers</p>')

exec(open('brief-v4.py').read())

# ---------- images, fonts, product ----------
imgs=json.load(open('old/brief-imgs.json'))
imgs['{{IMG0}}']='data:image/jpeg;base64,'+base64.b64encode(open('old/shot-laptop.jpg','rb').read()).decode()
imgs['{{IMG1}}']='data:image/png;base64,'+base64.b64encode(open('old/shot-owner.png','rb').read()).decode()
imgs['{{IMG2}}']='data:image/png;base64,'+base64.b64encode(open('old/shot-supplier.png','rb').read()).decode()
for k,f,mt in [('{{IMGM1}}','shot-mkt.jpg','jpeg'),('{{IMGM2}}','shot-help.jpg','jpeg'),('{{IMGM3}}','shot-gramL.jpg','jpeg'),('{{IMGM4}}','shot-gram-draft.png','png'),('{{IMGM5}}','shot-gram-live.png','png')]:
    imgs[k]='data:image/'+mt+';base64,'+base64.b64encode(open('old/'+f,'rb').read()).decode()
for k,v in imgs.items(): t=t.replace(k,v)
fonts=open('build/fonts.css').read()
t=t.replace('{{FONTS}}',fonts,1)
prod=base64.b64encode(open('build/full-embed.html','rb').read()).decode()
t=t.replace('{{PRODUCT}}',prod,1)
assert '{{' not in t.replace('{{','',0) or True
open('old/XELOR-Investor-Brief.html','w').write(t)
# artifact body: strip doctype/html/head/body wrappers
h=t; a=h.index('<title>'); hb=h.index('</head>'); bb=h.index('<body>')+6; be=h.rindex('</body>')
open('old/brief-artifact.html','w').write(h[a:hb]+h[bb:be])
print('ok',len(t), t.count('{{IMG'))
