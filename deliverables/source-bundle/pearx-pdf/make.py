import html, re
E = html.escape
def fmt(t):
    """Escape text verbatim; keep paragraphs and line breaks; render **bold** as bold."""
    t = E(t.strip('\n'))
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    paras = [p for p in re.split(r'\n\s*\n', t)]
    return ''.join('<p>' + p.replace('\n', '<br>') + '</p>' for p in paras)

BLANK = None
# (question, help text, answer | None, options list | None, required)
S = []
def sec(title, icon=''): S.append(('sec', title, icon))
def q(question, answer=BLANK, help='', options=None, req=True): S.append(('q', question, help, answer, options, req))

sec('Basic Info', 'ℹ️')
q('Company name')
q('Company website URL', req=False)
q('Headquarters country', 'India')
q('Headquarters city')
q('How much funding have you raised to date?', help='Use the format "$xx amount Investor 1, $yy Investor 2, etc". If you haven\'t raised please just enter "0".')
q('Industry: Primary', options=['B2B','Biotech','Consumer','Deep Tech','Education','Fintech','Government','Healthcare','Real Estate & Property Tech'])
q('Industry Subcategory: B2B', options=['Analytics','Developer Tools','Product','Design','Finance','HR','Legal','Marketing','Recruiting','Sales','Security','Other'])

sec('The Pitch', '🎙️')
q('One-line description of the company', help='Pitch your startup in one sentence.')
q('Please record a 1-min video introducing yourselves and the company', help='Please submit a link to an unlisted YouTube video.')
q('Product demo video URL', help='Please submit a link to an unlisted YouTube video.', req=False)
q('Submit your pitch deck in PDF format', req=False)

sec('The Problem', '🤔')
q('What are you building, and why?', """We're building XELOR, a trusted supplier network for Indian MSMEs.

Finding a reliable supplier is still hard for a small factory , Most MSMEs aren't on IndiaMART or other paid directories or can't justify for a paid listing. So they find suppliers through WhatsApp groups, phone calls and word of mouth. There's no way to know who actually delivers on time and who doesn't. So factories take risks, or pay more to play safe.

XELOR connects factories through records they earn. Our agentic AI ERP runs a factory's daily work, and every delivery and inspection becomes a verified supplier record: on time, rejects, capacity.

XELOR changes how they buy:
Ask: when a factory runs short of a part, our AI writes the request for quote and sends it to suppliers. Suppliers reply from a simple link, with no login.
Compare: XELOR ranks the quotes on price, delivery date and each supplier's track record, and explains why.
Decide: the factory picks a supplier and approves the order.
Record: when the goods arrive, XELOR records whether they came on time and passed quality checks.

The network grows with every purchase request, and those records power two products:
XELOR Market: a marketplace and services directory where every seller shows an earned record.
Xelogram: a showcase feed where a verified delivery becomes a post buyers can request a quote from.""")
q('What unique insight do you have into this problem?', """We grew up inside this problem. Both founders have lived in Peenya, one of India's largest industrial clusters, for about 21 years. Our families work in these factories, and people in our circle own factory businesses here. 10–15 factory visits confirmed what we'd always seen.
1. In the AI era, trusted data matters more than AI. Anyone can use an AI model, but no AI can guess which supplier really delivers on time. Only real delivery records show that. Whoever holds them helps factories get the best price, cheaper credit and the right buyers.
2. Trust must come from real work. Profiles go stale and ratings get faked. A supplier's true record is made at the factory gate, when goods arrive and are checked.
3. Small factories won't adopt software that adds work, so our ERP is agentic. Traditional ERPs fail in MSMEs because someone has to type everything in. In our agentic AI ERP, the AI does that work: it reads orders from email, writes requests for quotes, chases suppliers and records deliveries, while people approve anything that commits money or stock. The factory gets an ERP that runs itself, and trusted supplier records build up as a by-product.
4. Directories make money by reselling leads. We don't sell leads or handle payments, so we only win when a match works.
5. Every request grows the network. A supplier asked to quote joins free, and brings its other buyers along.""")

sec('Traction', '📈')
q('How far along are you?', """We've visited 10–15 factories in Peenya and spoken with their owners and purchase teams. Beyond those formal visits, we've had countless informal conversations, since our families and friends work in and run these businesses.

Yes, we have a working product. The core ERP runs on a real database, covering order, purchase, receiving, production, dispatch and accounts. An interactive demo shows the full flow, including requests for quotes, supplier records, XELOR Market and Xelogram.

We're running 2 pilots with factories from our family and friends' network in Peenya. They're helping us test the request-for-quote flow and supplier records on real orders.""", help='How many customer interviews have you done? Do you have a live product?')
q('Do you have people using your product?', options=['Yes','No'], req=False)
q('How many active users do you have?')
q('Do you have revenue?', options=['Yes','No'], req=False)

sec('Competition and Market', '🏇')
q('Who are your competitors? How do you differentiate from them?', """Our biggest competitor is the status quo: WhatsApp groups and phone calls.

Directories : (IndiaMART, JustDial). Paid listings cost more than many MSMEs can afford. They verify identity, not performance, and resell each enquiry to many sellers. On XELOR Market, listing is free or very low-cost. Sellers show real track records, and each request goes to five sellers at most.

Managed marketplaces:  (Zetwerk, OfBusiness). They take a margin and keep supplier data. We connect factories directly, take no cut and never handle money.

SME software : (Tally, Zoho). They manage books, with no supplier network. Our agentic AI ERP builds supplier records from every order.

AI procurement agents: (Didero and others). They work from outside the factory, so they never see deliveries arrive. We do.

Others list suppliers or manage paperwork. Only XELOR builds trusted records from real deliveries.""")
q('How big is the market opportunity? Provide a bottoms-up calculation of how you estimated the market size.', """We sized the market from three building blocks: the number of MSMEs and factories, what each pays per year, and the early-payment volume moving through TReDS.

TAM: ₹7,947 Cr (~$900M) a year, all of India

Manufacturing MSMEs: 1.83 crore × ₹2,490 = ₹4,561 Cr
Factories with 100+ workers: 47,762 × ₹6 lakh = ₹2,866 Cr
TReDS early payments: ₹3.47 lakh Cr × 0.15% = ₹520 Cr

SAM: ₹504 Cr (~$57M) a year, our first two states (Karnataka and Tamil Nadu)

MSMEs in Bengaluru, Hosur and Coimbatore: 1.53 lakh × ₹2,490 = ₹38 Cr
Factories with 100–499 workers: 7,330 × ₹6 lakh = ₹440 Cr
TReDS early payments in these clusters: ₹26 Cr

SOM: ₹13.7 Cr (~$1.6M) a year by year 5

220 factories, 3% of SAM, × ₹6 lakh = ₹13.2 Cr
450 paying MSMEs, 3% of those we reach (IndiaMART converts about 2.5%), × ₹2,490 = ₹0.11 Cr
TReDS early payments = ₹0.4 Cr

Upside not counted above: this is a volume and network business. Every MSME that joins, even for free, adds verified data to the network. Once the network is large, it opens further revenue: promoted listings and ads aimed at suppliers and buyers, and services such as finance, logistics and certification offered to members.""")

sec('The Founders', '👏')
q('How many founders do you have?', options=['1','2','3','4'], req=False)
q('How long have you been working on this company?', options=['<6 months','6 months - 1 year','> 1 year'])
q('What is the equity split among the founders?', help='Please list in this format: [Founder 1: xx%, Founder 2: yy%, etc.]')

sec('CEO / Founder #1', '')
S.append(('note', "If the CEO title has not been defined, don't overthink it and just pick a person."))
q('Full name'); q('LinkedIn URL'); q('Email'); q('Phone number', req=False)
q('Are you currently working on this startup full-time or part-time?', options=['Full-time','Part-time'])
q('Are you currently a student?', options=['Yes','No'])
q('College / University')
q('Current degree program:', "Bachelor's Degree")
q('Please share an example of a time you tackled a problem in a novel way and achieved something truly impressive.', """One week before the deadline for a "Cisco Global Partner Innovation Challenge", I was unexpectedly made the team lead and the only intern on a team of full-time professionals. The previous team lead had understood the submission requirements to mean that a basic product demo video was sufficient. After taking over, I reviewed the criteria and discovered that we actually needed a live customer pilot using real-world data.

With only 7 days remaining, I took ownership, pitched and secured a customer pilot, initiated deployment on their live environment, and led the team to develop and integrate the solution full-stack and end-to-end around the customer's requirements.

In one week, we went from no pilot to a live customer-backed solution and a completed submission to Cisco's global innovation challenge.""")
q('We are looking for outlier founders. What makes you an outlier?', """I think I’m an outlier because I’ve consistently pursued things that are difficult to do simultaneously. Alongside engineering, startups, and enterprise technology, I’ve competed in **high-level cricket**, representing Karnataka and being selected for the **BCCI Vizzy Trophy**—while continuing my engineering degree and building technical and business projects.

I’ve also deliberately put myself across very different environments: building AI and hardware products, working in enterprise cybersecurity and sales, and taking leadership roles in competitive sport. I enjoy entering areas where I have no clear playbook and figuring things out from first principles.

What connects all of this is how I approach problems: **I don't wait until I'm fully ready or until someone gives me ownership. I take responsibility, learn quickly, and figure out how to make it happen.**""")

sec('Founder #2', '')
q('Full name'); q('LinkedIn URL'); q('Email'); q('Phone number', req=False)
q('Are you currently working on this startup full-time or part-time?', options=['Full-time','Part-time'])
q('Are you currently a student?', options=['Yes','No'])
q('College / University')
q('Current degree program:', "Bachelor's Degree")
q('Please share an example of a time you tackled a problem in a novel way and achieved something truly impressive.')
q('We are looking for outlier founders. What makes you an outlier?')

sec('Pear', '🍐')
q('Have you applied to PearX before?', options=['Yes','No'])
q('How did you first hear about PearX?', options=['Pear Employee','Pear Community','Pear Founder','Pear Fellow','Pear Event','Friend','Email list','X / Twitter','LinkedIn','Google / ChatGPT / Claude / Perplexity, etc.','Other'])

# ---------- render ----------
body = []; secn = 0; qn = 0
for item in S:
    if item[0] == 'sec':
        secn += 1
        body.append(f'<h2 class="sec"><span class="sn">{secn:02d}</span>{E(item[1])} <span class="emo">{item[2]}</span></h2>')
    elif item[0] == 'note':
        body.append(f'<p class="secnote">{E(item[1])}</p>')
    else:
        _, ques, help_, ans, opts, req = item; qn += 1
        h = f'<div class="qa"><div class="qh"><span class="qn">Q{qn}</span><h3>{E(ques)}{" <i class=req>*</i>" if req else ""}</h3></div>'
        if help_: h += f'<p class="help">{E(help_)}</p>'
        if opts:
            h += '<div class="opts">' + ''.join(f'<span>{E(o)}</span>' for o in opts) + '</div><p class="empty">Selection not recorded in this copy</p>'
        elif ans:
            h += f'<div class="ans">{fmt(ans)}</div>'
        else:
            h += '<p class="empty">Not filled in yet</p>'
        h += '</div>'
        body.append(h)

doc = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PearX W27 Application</title>
<link rel="stylesheet" href="fonts.css"><style>
@page{{size:A4;margin:18mm 16mm 18mm}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:"Source Sans 3",sans-serif;color:#2b2226;font-size:10.6pt;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.cover{{border-radius:14px;padding:22px 24px;background:linear-gradient(135deg,#2a0f1a,#4a1a2c);color:#f1e6d8;margin-bottom:18px}}
.cover .k{{font-family:"JetBrains Mono",monospace;font-size:7.5pt;letter-spacing:.16em;text-transform:uppercase;color:#e2b54a}}
.cover h1{{font-family:"Bricolage Grotesque",sans-serif;font-size:24pt;line-height:1.05;letter-spacing:-.03em;margin-top:6px;color:#fff}}
.cover p{{font-size:9.6pt;color:#d6c2c9;margin-top:8px;line-height:1.5}}
.cover ul{{margin-top:8px;padding-left:16px;font-size:9.2pt;color:#d6c2c9}}
.cover .saved{{margin-top:12px;font-family:"JetBrains Mono",monospace;font-size:7.5pt;letter-spacing:.08em;color:#c9abb7}}
h2.sec{{font-family:"Bricolage Grotesque",sans-serif;font-size:15pt;letter-spacing:-.02em;color:#1d1418;margin:22px 0 10px;padding-bottom:7px;border-bottom:2px solid #7a2945;display:flex;align-items:center;gap:10px;break-after:avoid}}
h2.sec .sn{{font-family:"JetBrains Mono",monospace;font-size:8.5pt;color:#fff;background:#7a2945;border-radius:6px;padding:2px 7px;letter-spacing:.06em}}
h2.sec .emo{{font-size:12pt}}
.secnote{{font-size:9pt;color:#76676d;font-style:italic;margin:-4px 0 10px}}
.qa{{border:1px solid #e6dde0;border-radius:10px;padding:11px 14px 12px;margin-bottom:9px;background:#fff;break-inside:avoid}}
.qa:has(.ans p:nth-of-type(3)){{break-inside:auto}}
.qh{{display:flex;gap:9px;align-items:baseline}}
.qn{{font-family:"JetBrains Mono",monospace;font-size:7.5pt;font-weight:700;color:#86600f;background:#f8efd9;border-radius:4px;padding:1px 5px;flex:none}}
h3{{font-family:"Bricolage Grotesque",sans-serif;font-size:11pt;font-weight:700;color:#1d1418;letter-spacing:-.01em;line-height:1.3}}
.req{{color:#b03050;font-style:normal}}
.help{{font-size:8.6pt;color:#8a7a80;margin:3px 0 0 38px}}
.ans{{margin:8px 0 0 38px;padding:9px 12px;background:#f8f5f5;border-left:3px solid #c89a2e;border-radius:0 8px 8px 0}}
.ans p+p{{margin-top:7px}}
.ans b{{color:#1d1418}}
.empty{{margin:6px 0 0 38px;font-size:8.8pt;color:#a0939a;font-style:italic}}
.opts{{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0 0 38px}}
.opts span{{font-size:8.6pt;border:1px solid #d8ccd0;border-radius:999px;padding:1px 9px;color:#46383e;background:#fbf9f9}}
</style></head><body>
<div class="cover"><div class="k">Saved draft · application copy</div><h1>PearX W27 Application Form</h1>
<p>PearX is our exclusive, small batch accelerator program for pre-seed companies. → Read more about the program at pear.vc/pearx.</p>
<ul><li>💰 PearX teams receive between $250K to $2M in funding.</li>
<li>📨 The early application deadline is August 16th at 11:59 PM PST. Early apps can expect a decision by early September.</li>
<li>📅 The regular application deadline is October 4th at 11:59 PM PST. Regular apps can expect a decision by early November.</li></ul>
<p>For teams invited to interview, we host 2 rounds of interviews: R1 interviews are 10 mins and are conducted over Zoom. R2 interviews are 20 mins in-person at Pear Studio SF with at least two Pear partners.</p>
<p>The cohort will officially kick off in January 2027 and run for 12 weeks, with Demo Day scheduled for the first week of April 2027.</p>
<div class="saved">Answers reproduced exactly as entered · * = required field</div></div>
{''.join(body)}
</body></html>'''
open('application.html', 'w').write(doc)
print('questions', qn)
