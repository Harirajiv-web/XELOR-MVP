# Y Combinator-backed startups similar to XELOR (as of 2 October 2026)

Method note: ycombinator.com, extruct.ai and most other sites were blocked by this environment's egress proxy, so pages could not be fetched directly. Every fact below comes from web-search result content that cites the URL shown, including YC directory and Launch YC pages as the search engine indexed them. Batch codes: W = Winter, S = Summer, F = Fall (from 2024), X/P = Spring (YC renamed "X" batches "P"; for example "P26 (formerly X26)" per [extruct](https://www.extruct.ai/data-room/ycombinator-companies-p26/)). Closeness scores are judged against XELOR's loop: shortage detected, RFQ generated from the item master/BOM/quality plan, suppliers quote through a no-login link, quotes ranked, award becomes a PO, owner approves on phone, GRN and inspection feed each supplier's earned record, suppliers share capacity, and the factory gets a "passport".

## Q1. Which YC companies build AI procurement / sourcing agents for manufacturers or industrial buyers?

### Takeaway
Since 2023 YC has funded a dense cluster of buyer-side "AI procurement agent" companies for direct materials. The closest to XELOR's sourcing loop are Lumari (X25), Mandel AI (S23), Tesora (S25), SpaceFlow (S26), Lighthouz AI (S24) and Waybill (S26, India). Almost all of them sit as an agent layer on top of an existing ERP, email and supplier portals for US/EU mid-market and enterprise buyers. None was found to offer XELOR's own ERP, a no-login supplier quote link, supplier capacity sharing, or a factory "passport". Didero, often named as the category leader, is **not** a YC batch company.

### Cited Findings

**Lumari — YC X25 (Spring 2025; some sources write "P25", the same batch). Closeness: HIGH**
- Builds "AI-powered procurement automation purpose-built for direct materials and supply chain execution". It deploys "100s of always-on AI agents" that run sourcing, manage RFQs, expedite POs and coordinate supplier communication end to end, including quote follow-ups, PO confirmations, delivery status and risk escalation — [YC search snippets](https://www.ycombinator.com/companies/industry/supply-chain-and-logistics); [Fondo launch summary](https://fondo.com/blog/lumari-launches)
- Founders: Sam Lamba (ex-Google engineering lead who built AI supply-chain systems at Google, Tesla and Amazon; 2 AI patents) and Eshani Mehta (ex-Stripe engineer). 2025, team of about 5 — [Lumari about](https://lumari.ai/about-us); [Work at a Startup](https://www.workatastartup.com/companies/lumari)
- Funding: about $500K from Y Combinator, Matador Ventures and Sterling Road (aggregator data, no date) — [extruct](https://www.extruct.ai/hub/lumari-io); [Crunchbase](https://www.crunchbase.com/organization/lumari)
- Status: active and hiring founding forward-deployed engineers — [YC jobs](https://www.ycombinator.com/companies/lumari/jobs/y8Reyou-founding-forward-deployed-engineer)
- Overlap: shortage-to-RFQ-to-PO follow-up for direct materials. Differences: a buyer-side agent with no ERP, no supplier network or capacity sharing, and no GRN/inspection scorecard was found. US focus.

**Mandel AI — YC S23. Closeness: HIGH**
- "AI coordination layer for supply chain". It runs operational work across direct-materials sourcing and ordering "from RFQ through invoice" for manufacturers and distributors: it coordinates suppliers, checks orders and invoices against agreed terms, resolves discrepancies, recovers supplier credits and keeps the ERP current, working across email, supplier portals, EDI and ERP — [YC profile](https://www.ycombinator.com/companies/mandel-ai)
- Founders: Nick Gospodinov (CEO; engineering at Kraken, previously co-founded a fintech) and CTO Alex Bonin (from the same earlier venture) — [Tech.eu, 25 Mar 2026](https://tech.eu/2026/03/25/y-combinator-backed-mandel-ai-raises-3-9m-to-automate-global-supply-chains/)
- Funding: $3.9M seed (about €3.6M) announced in March 2026, backed by YC, Category Ventures, Ritual Capital, e2vc and angels. Reported $30M post-money valuation — [Mandel blog](https://www.mandel.ai/blog/seed-announcement); [Startup.eu](https://www.startup.eu/investments/mandel-ai-3-9m-03-2026); [Wolves Summit](https://www.wolvessummit.com/blog/2026/03/31/mandel-ai-raises-e3-6-million-seed-round/)
- Traction: "processed $1B+ in material spend" for aerospace, pharma and industrial clients (company claim) — [Tech.eu](https://tech.eu/2026/03/25/y-combinator-backed-mandel-ai-raises-3-9m-to-automate-global-supply-chains/)
- Overlap: RFQ-to-PO-to-invoice supplier coordination on top of the ERP. Differences: complex, larger manufacturers (aerospace and pharma), no supplier-side network, Europe/US.

**Lighthouz AI — YC S24 (Atlanta). Closeness: MEDIUM (it pivoted away from procurement)**
- Launched in Aug 2024 as "AI procurement specialists for manufacturers", an agentic system doing "autonomous purchasing" — [YC on X](https://x.com/ycombinator/status/1828507775833645473); [Launch YC](https://www.ycombinator.com/launches/Lfz-lighthouz-ai-ai-procurement-specialists-for-manufacturers)
- **The current YC profile title reads "Freight bill audits, AP, AR automation for freight brokers"**, which implies a pivot to freight-broker back office — [YC profile](https://www.ycombinator.com/companies/lighthouz-ai)
- Founders: Srijan Kumar (former Georgia Tech CS professor, Google research scientist, Stanford postdoc) and Sonali Pattnaik (former lead AI engineer at Progressive, American Family and Halliburton) — [Dealroom](https://app.dealroom.co/companies/lighthouz_ai)
- Funding: $125K from YC (Aug 2024); about $500K total from Gaingels, Pioneer Fund, Soda Cap, z21 and Plug and Play — [Latka](https://getlatka.com/companies/lighthouz.ai); [Tracxn](https://tracxn.com/d/companies/lighthouz/__Iz63WUraWI-7j8geyecQm3BWauXClfwGTN1n35dkyTU)

**Tesora — YC S25 (San Francisco). Closeness: HIGH on supplier communication**
- Builds "AI procurement analysts that conduct supplier discovery, qualification, and negotiation via voice and email" for "advanced industries" — [vcbacked](https://www.vcbacked.co/company/tesora); [YC jobs](https://www.ycombinator.com/companies/tesora/jobs)
- Founders: Vivek Rao (CEO) and Federico Reyes Gomez. Team of 2. Funding: $500K pre-seed (Sept 2025) including YC — [vcbacked](https://www.vcbacked.co/company/tesora)
- Overlap: supplier outreach and quote collection. Differences: discovery and negotiation only; no ERP, PO, GRN or scorecard.

**SpaceFlow Technologies — YC S26 (San Francisco). Closeness: HIGH**
- An "AI-native procurement services company" and "managed runtime for AI agents that execute supply chain work across ERPs, email, spreadsheets, documents, and supplier portals". Its agents "normalize multi-round quotations, chase suppliers and delivery confirmations, repair incomplete requests, classify materials, reconcile phantom inventory" and support S&OP — [YC procurement listing](https://www.ycombinator.com/companies/industry/Procurement); [yespress](https://yespress.io/spaceflow-yc-s26)
- Traction: about $400M annual supplier spend processed and six-figure ARR (company claim). 4 employees — [YC supply chain listing](https://www.ycombinator.com/companies/industry/supply-chain-and-logistics/san-francisco-bay-area)
- Overlap: quote normalisation and comparison (similar to XELOR's ranking) plus delivery chasing. Differences: a services-plus-agents model for enterprises; no supplier network.

**Waybill — YC S26 (Gurugram, India). Closeness: HIGH; INDIA-BASED**
- "Agentic procurement & inventory for deep tech teams". Customers send a part, spec or BOM; Waybill sources it, pulls quotes, routes approvals, negotiates and pays the supplier, handles freight and customs, tracks delivery to the dock and updates stock counts. "Built as an agent system, not a dashboard" — [YC profile](https://www.ycombinator.com/companies/waybill); [Work at a Startup](https://www.workatastartup.com/companies/waybill)
- Founders: Rishi Laddha (CEO; previously ran operations, supply chain and government relations at LAT Aerospace, founded by Zomato's Deepinder Goyal; BTech CS & AI, Plaksha University) and Tushar Goyal (previously built AI and software at WareIQ, YC S20; Plaksha CS). Founded 2026, 3 people — [YC profile](https://www.ycombinator.com/companies/waybill)
- Funding: no round beyond the standard YC deal found.
- Overlap: BOM-to-quote-to-approval-to-PO-to-receipt-to-inventory, India-based. Differences: serves hardware/deep-tech buyers (startups) rather than SME job-shop factories; a managed agent service, not an ERP plus supplier network.

**Lio (formerly askLio) — YC S23 (Munich origin). Closeness: MEDIUM**
- Enterprise procurement multi-agent system. Agents per purchase request research vendors, negotiate terms, manage approvals and track deliveries — [PR Newswire, 5 Mar 2026](https://www.prnewswire.com/news-releases/lio-raises-30m-series-a-to-bring-agentic-ai-to-enterprise-procurement-302705236.html)
- Funding: $30M Series A led by a16z with SV Angel, Harry Stebbings and YC (5 Mar 2026); about $33M total; about 80 employees — [Lio newsroom](https://www.lio.ai/newsroom/lio-technologies-raises-30m-series-a-to-bring-agentic-ai-to-enterprise-procurement); [Bouncewatch](https://bouncewatch.com/company/asklio-yc-s23)
- Traction: "global tier-1 industrial manufacturer automated 75% of previously outsourced procurement work in six months"; 95% adoption (company claims) — [PR Newswire](https://www.prnewswire.com/news-releases/lio-raises-30m-series-a-to-bring-agentic-ai-to-enterprise-procurement-302705236.html)
- Differences: large enterprises and mostly indirect/tail spend; no supplier network or factory ERP.

**Mentum — YC S21 (San Francisco). Closeness: MEDIUM. ACQUIRED**
- AI for strategic sourcing that turns unstructured, email-driven procurement data into insights, for CPG, energy, automotive and aerospace. Backed by Gradient Ventures and YC — [Nuvocargo](https://www.nuvocargo.com/acquisition/mentum-ai/); [YC](https://www.ycombinator.com/companies/mentum)
- Acquired by Nuvocargo (Mexico/US freight) on 29 Oct 2025; founder Gustavo Trigos joined NuvoOS R&D; terms undisclosed — [Nuvocargo blog](https://www.nuvocargo.com/blog-posts/nuvocargo-acquires-mentum-ai-agent-logistics); [Mexico Business News](https://mexicobusiness.news/logistics/news/nuvocargo-acquires-mentum-accelerate-ai-supply-chains)

**Applied Kinetics — YC F26 (Fall 2026, San Francisco). Closeness: MEDIUM**
- "AI employees" for the energy and data-centre buildout. Agents "chase suppliers, track equipment approvals and delivery dates, and flag delays" for long-lead equipment from issued PO to delivery. Integrates with SAP, Oracle, NetSuite, Outlook, Excel and SharePoint via Teams/Slack — [YC profile](https://www.ycombinator.com/companies/applied-kinetics); [site](https://appliedkinetics.ai/)
- Founders: Adhik Durga and Rohit Naras. 2 people, founded 2026 — [YC profile](https://www.ycombinator.com/companies/applied-kinetics)
- Overlap: post-PO expediting. Differences: EPC/energy projects, not SME factories.

**Pollinate (now Khotan) — YC W26 (Brisbane / US). Closeness: LOW-MEDIUM**
- Ontology-driven agents that pull supplier invoices from email and automate three-way matching (PO, receipt, invoice) across ERPs. Pivoted from hospitality (2024) to supply-chain ERP/order processing; started in fresh produce, meat and seafood, now also deep-tech manufacturing — [Business News Australia](https://www.businessnewsaustralia.com/amp-html/articles/brisbane-startup-pollinate-joins-y-combinator.html); [Dealroom (renamed Khotan)](https://app.dealroom.co/companies/khotan_formerly_pollinate)
- Founders: Corey Berther and Adeep Mitra. US$500K initial YC funding — [Business News Australia](https://direct.businessnewsaustralia.com/articles/brisbane-startup-pollinate-joins-y-combinator.html)
- Overlap: the PO, GRN and invoice match (XELOR's receipt step). Differences: AP-focused.

**Ovlo — YC W25. Closeness: LOW**
- A no-code AI agent builder for supply-chain teams: forecasting, compliance validation, invoice reconciliation and inventory optimisation on top of the current stack, including email and Sheets. Co-founder Andrew Malouf led product at HelloFresh, Anghami and Amazon — [YC](https://www.ycombinator.com/companies/ovlo); [aiagentstore](https://aiagentstore.ai/ai-agent/ovlo)

**Derya — YC S26 (San Francisco). Closeness: MEDIUM**
- "AI Brokers for Industrial Trade". Agents plan and execute procurement, logistics, production and distribution for robotics, commodities and F&B firms ("startups, SMEs, and enterprises") — [YC](https://www.ycombinator.com/companies/derya); [roundfunded](https://www.roundfunded.com/en/yc-startup/derya)
- Founders: Oguzhan Karaca (CEO) and Mert Turna (CTO; built ship-operations software used on 30+ vessels). Over $15M of freight handled before expanding scope — [roundfunded](https://www.roundfunded.com/en/yc-startup/derya)

**Zip — YC S20. Closeness: LOW (indirect spend)**
- An "intake-to-procure" front door for employee purchase requests. Founders Rujul Zaparde and Lu Cheng (ex-Airbnb). $43M Series B (May 2022, led by YC Continuity), $100M Series C (2023, $1.5B valuation), $190M Series D (21 Oct 2024, led by BOND, $2.2B valuation, YC participating). Named a Visionary in the Jan 2026 Gartner MQ for Source-to-Pay; "$107B+ customer spend processed" — [Crunchbase News](https://news.crunchbase.com/news/procurement-zip-y-combinator/); [BusinessWire](https://www.businesswire.com/news/home/20241021142811/en/Zip-Secures-190-Million-in-Landmark-Series-D-Funding-Marking-the-Largest-Investment-in-Procurement-Technology-in-Over-Two-Decades); [Pulse2](https://pulse2.com/zip-procurement-orchestration-platform-company-raises-190-million-series-d-at-2-2-billion-valuation/)
- Differences: corporate/indirect procurement, not factory direct materials.

**Bonfire — YC W15 (Waterloo, Canada). Closeness: LOW. ACQUIRED**
- eSourcing, competitive bidding and RFx platform, mainly public sector. Raised $11M; acquired in Feb 2019 by the company now called Euna Solutions (source wording) — [BetaKit](https://betakit.com/waterloo-based-bonfire-raises-11-million-to-automate-the-procurement-process); [YC jobs](https://www.ycombinator.com/companies/bonfire/jobs)

**Didero — NOT a YC batch company (verify before citing as YC)**
- New York, founded Dec 2023 by Tim Spencer (previously ran Markai, an Asia e-commerce company sold in 2023), Lorenz Pallhuber (ex-McKinsey procurement) and Tom Petit. Agentic AI on top of the ERP that automates "the email-and-phone-call grind" of direct-materials procurement — [yespress](https://yespress.io/tim-spencer.md)
- $7M seed led by First Round (announced 1 Jul 2024); $30M Series A (Feb 2026) co-led by Chemistry and Headline with Microsoft M12 — [startupintros](https://startupintros.com/news/2024-07-01-didero-seed); [Digital Commerce 360](https://www.digitalcommerce360.com/2026/02/20/didero-30-million-funding-ai-procurement/)
- One aggregator lists YC as a seed investor — [startupintros](https://startupintros.com/orgs/didero); a search of funding coverage found "no mention of Y Combinator" — [Digital Commerce 360](https://www.digitalcommerce360.com/2026/02/20/didero-30-million-funding-ai-procurement/). Treat as non-YC.

### Inferences
- Ranked by closeness to XELOR's sourcing loop: Lumari ≈ Mandel AI ≈ SpaceFlow > Waybill (India, deep-tech buyers) > Tesora > Applied Kinetics ≈ Derya > Lio > Pollinate > Ovlo/Zip/Bonfire.
- In this group the pattern is "an agent on top of someone else's ERP", working through email, portals and EDI. XELOR's differentiators are an ERP plus a two-sided network: no-login supplier links, supplier records earned from GRN and inspection, shared capacity, and a passport. None of these YC companies was found to have them.
- These companies are almost all US/EU-targeted and at seed stage (about $0.5M–$4M), except Lio ($33M). Funding concentration suggests the buyer-side agent category is crowded at seed; scale capital has gone to non-YC Didero and to YC's Lio.

### Gaps
- The YC directory (ycombinator.com/companies?query=procurement / industry=Procurement) could not be fetched. The full Procurement, Supply Chain and Manufacturing lists were seen only through search snippets, so smaller or quieter companies may be missing.
- No funding beyond the YC standard deal was found for Waybill, SpaceFlow, Applied Kinetics or Derya. Lumari's $500K comes only from aggregators.

## Q2. Which YC companies build supplier networks, RFQ platforms, or manufacturing marketplaces?

### Takeaway
YC's manufacturing-marketplace bets fall into four models: (a) managed RFQ marketplaces to vetted job shops (Jiga W21, Vendra S24); (b) software-defined own factories selling parts (Forge Automation W25, Prototyping.io X26/P26, Nox Metals S25, GUILD S26); (c) overseas-factory brokers and trading companies (Sourcify W18, Saudara AI X26/P26, Donkey S26, No Logo); (d) AI brokers for industrial equipment (Andustry X26/P26). Jiga is the most mature and closest to XELOR's RFQ network. Most of these act as marketplaces or brokers that take the transaction, whereas XELOR is software that lets a factory run its own supplier base.

### Cited Findings

**Jiga — YC W21 (Tel Aviv). Closeness: HIGH (RFQ network) / MEDIUM overall**
- "AI-native manufacturing platform": engineers upload drawings and specs, software agents extract requirements and match them to vetted manufacturers for ordering — [Pulse2](https://pulse2.com/jiga-12-million-series-a/); [Tech.eu 2021](https://tech.eu/2021/03/03/y-combinator-backed-tel-aviv-based-jiga-launches-b2b-marketplace-for-manufacturers/)
- Founders: Adar Hay (CEO), Yonatan Wolowelsky (CTO) and Assaf Geuz (COO); founded 2020 — [Pulse2](https://pulse2.com/jiga-12-million-series-a/)
- Funding: $4.1M seed (Symbol) — [Payload](https://payloadspace.com/jiga-raises-4-1m-for-procurement-platform); $12M Series A led by Aleph with Symbol and YC (press release 19 Nov 2025); reported as **already profitable** — [Supply Chain Dive](https://www.supplychaindive.com/press-release/20251119-jiga-secures-12m-series-a-to-eliminate-hardware-sourcing-bottleneck-threat/)
- Target: aerospace, defence, robotics and AI hardware teams procuring custom parts.
- Overlap: RFQ to multiple suppliers, quote comparison, PO. Differences: the buyer is a hardware engineer rather than an SME factory; supplier performance is held by the marketplace, not as an ERP-fed record.

**Vendra — YC S24 (San Francisco). Closeness: MEDIUM-HIGH**
- "Submit one RFQ" and Vendra matches suppliers, handles outreach, collects competitive quotes and manages production through delivery via qualified US suppliers. ITAR-registered; finishing (anodising, plating, heat treat), CMM reports and FAIRs. Customers include Anduril, Mach Industries, Relativity Space, Castelion and Planet Labs — [Launch YC](https://www.ycombinator.com/launches/N8n-vendra-custom-parts-manufactured-in-america); [startups.fm](https://startups.fm/startups/vendra-yc)
- Funding: Pioneer Fund and YC; latest deal 7 Jul 2025 (Pioneer); Urban Innovation Fund lists Vendra in its portfolio (May 2026) — [Crunchbase](https://www.crunchbase.com/organization/vendra); [Urban.vc](https://www.urban.vc/portfolio-57/2026/5/20/vendra)
- Overlap: automated supplier outreach and quote collection. Differences: a US defence/aerospace managed marketplace.

**Andustry — YC X26/P26 (Spring 2026, San Francisco). Closeness: HIGH (two-sided supplier automation)**
- "AI-native broker for industrial equipment" (mid-size machinery). Manufacturers avoid contacting hundreds of suppliers; **suppliers can "automate responding to customers and receiving ready-to-fulfill orders"**. Claims 30% average cost savings and half the sourcing time — [Launch YC](https://www.ycombinator.com/launches/QP4-andustry-ai-native-broker-for-industrial-equipment); [YC](https://www.ycombinator.com/companies/andustry)
- Founders: Het Dave and Johann Stürken (from a family trading business). 2 people — [altss](https://altss.com/companies/yc/andustry)
- Overlap: two-sided buyer and supplier automation of RFQ response. Differences: capital equipment brokerage, not recurring BOM parts; no ERP or scorecard.

**Sourcify — YC W18 (San Diego). Closeness: LOW-MEDIUM**
- A sourcing platform helping e-commerce brands and Fortune 500s manufacture in Asia; founder Nathan Resnick; about $2.5M raised (last round Apr 2018); listed active with about 15 staff — [vcbacked W18](https://www.vcbacked.co/yc/batch/w18); [TechCrunch 2018](https://techcrunch.com/2018/02/13/sourcify-is-connecting-entrepreneurs-directly-to-pre-vetted-overseas-factories/)

**Saudara AI — YC X26/P26 (Spring 2026). Closeness: MEDIUM (emerging-market supply side)**
- "AI sourcing broker" connecting US brands with vetted overseas (notably Indonesian) factories. A human broker runs every deal, assisted by AI for sourcing, quoting, QC, logistics and vendor financing — [YC](https://www.ycombinator.com/companies/saudara-ai); [altss](https://altss.com/companies/yc/saudara-ai)
- Founders: Edward Haryono (CEO; family with 50 years in Indonesian retail and logistics; 5 years in Amazon procurement) and Jennifer Prasetyo (CTO; ex-Microsoft Quantum and Meta Reality Labs; family with 50+ years in Indonesian textile manufacturing). $500K raised; "$1M+ sourced for 40+ brands in 5 months" — [altss](https://altss.com/companies/yc/saudara-ai)

**Donkey — YC S26 (SF + China). Closeness: LOW-MEDIUM**
- "AI-native trading company": buys from Chinese factories and sells to US importers at one delivered, duty-paid USD price. It reads US customs records to learn supply lanes, names the real factory from a photo, and promises to "beat their landed cost in 72 hours". Its own inspectors check goods before the factory is paid; credit-insured net-45. Founders Benjamin Martindale and Minghao Tan — [YC](https://www.ycombinator.com/companies/donkey); [yespress](https://yespress.io/donkey-yc-s26.md)
- Overlap: landed-cost ranking plus inspection-gated payment, which resembles XELOR's landed-cost ranking and incoming inspection. Differences: Donkey takes title (a trading model).

**No Logo — YC (batch not confirmed). Closeness: LOW**
- An orchestration layer that uses generative AI to break a creator's product into components and processes and match each step to "underutilized overseas factories" in its network. It runs production, QC and fulfilment — [Launch YC](https://www.ycombinator.com/launches/Qtg-no-logo-turn-any-idea-into-a-real-manufactured-product)
- Overlap: uses spare factory capacity. Differences: consumer products.

**Forge Automation — YC W25 (Toronto). Closeness: LOW**
- Software-enabled CNC factories: upload CAD, get an instant quote, parts in 4 days or less; in-house "Foundry" CAD-to-toolpath software; customers can reserve a dedicated machine with an SLA. Founders Timothy Seto and Walter Raftus; about $635K raised — [yespress](https://yespress.io/forge-automation-yc-w25.md); [YC](https://www.ycombinator.com/companies/forge-automation)

**Prototyping.io — YC X26/P26 (San Francisco). Closeness: LOW**
- "Autonomous manufacturing for mechanical parts": DFM analysis, sourcing and CAM; CNC, sheet metal, 3D printing and moulding. Reported about $400K monthly revenue at launch; $6.2M seed (Dealroom headline). Founders Revanth Bodepudi and Prerit Oberai — [yespress](https://yespress.io/prototyping-io-yc-p26.md); [Dealroom](https://dealroom.co/news/156465-prototyping-io-pauses-hiring-after-6-2m-seed-round/)

**Nox Metals — YC S25. Closeness: LOW**
- AI-powered, automated metals supplier (custom-cut aluminium blocks for CNC). $11.5M seed (June 2026) with Palmer Luckey, YC, Robo Strategy, Hyperion, Operator Collective and others — [American Bazaar](https://americanbazaaronline.com/2025/08/15/nox-metals-aims-to-redefine-us-manufacturing-with-automated-metals-factories-466293/); [Signalbase](https://www.trysignalbase.com/news/funding/nox-metals-raises-115m-seed-round)

**GUILD — YC S26. Closeness: LOW**
- "AI-native defense contractor" for aerospace parts. It interprets drawings, specs and contract clauses into production and procurement workflows, then delivers to government buyers. Founders Kaya Celebi and Erim Gurlemis — [YC](https://www.ycombinator.com/companies/guild)

### Inferences
- No YC company was found running a **live capacity-sharing network among factories that also use the same ERP**, which is XELOR's "suppliers who also run XELOR share live capacity". The nearest analogues are Forge's machine reservation (a single owner) and No Logo's or Saudara's managed overseas networks.
- Donkey's "inspect before pay plus landed-cost guarantee" and Jiga's profitability make them useful reference points for XELOR's ranking and inspection logic, and for proof that RFQ marketplaces can make money.

### Gaps
- No Logo's batch and funding were not found. Andustry's and Saudara's funding beyond the YC deal were not found.
- Older YC hardware-marketplace companies (for example Plethora and MakeTime) could not be confirmed or ruled out as YC; not included.

## Q3. Which YC companies automate supplier communication (PO follow-ups, quote chasing, order acknowledgements via email/WhatsApp/phone/voice)?

### Takeaway
Buyer-to-supplier chasing is covered by Lumari, Mandel, SpaceFlow, Tesora (voice and email) and Applied Kinetics (see Q1). A second large YC cluster automates the **supplier/seller side**: inbound PO and RFQ intake, quoting and order entry into the ERP for manufacturers and distributors (Comena S25, Korso X26/P26, Smartbase X26/P26, Seals AI S24, Kanava AI X25, Lark F26, Whitespace S26, Axal W25, Corvera W26). HappyRobot is the scaled voice-agent player, but in freight. No YC company was found using **WhatsApp no-login links for supplier quoting** in manufacturing.

### Cited Findings

**Comena — YC S25 (Munich). Closeness: MEDIUM (supplier-side mirror of XELOR)**
- AI agents that read POs and quotes from email or PDF, extract line items, match products to SKUs and push orders to the ERP, with optional human review. For industrial distributors and manufacturers; claims 75–99% time saved on order processing — [Launch YC](https://www.ycombinator.com/launches/O3U-comena-ai-agents-that-automate-order-processing-for-distributors-and-manufacturers); [YC](https://www.ycombinator.com/companies/comena)
- Founders: Almo Sutedjo (first hire at Leaping AI, YC W25; ex-AWS, HubSpot, Microsoft) and Jiehua Wu (first sales hire at askLio, YC S23; PM at Pina Earth, YC W22; ex-Google). 8 staff; customers in the US and Germany — [YC](https://www.ycombinator.com/companies/comena)
- Funding: about $1M seed including Bessemer and YC — [extruct](https://www.extruct.ai/hub/comena-ai/); [startupintros](https://startupintros.com/orgs/comena)

**Korso — YC (listed as "P26"/Spring 2026 on one source and "S26" on the YC Tier List; conflicting) (Los Angeles). Closeness: HIGH**
- "AI agents for manufacturing" across ERP, CRM, MES and inbox. It parses incoming RFQs, prices against history and current cost, drafts and routes quotes, and covers "RFQ handling, quote follow-up, purchase order tracking, supplier ETA chasing, and customer updates", with long-running checkpointed workflows that last weeks — [Launch YC](https://www.ycombinator.com/launches/QKn-korso-ai-agents-for-manufacturing); [YC](https://www.ycombinator.com/companies/korso); [YC Tier List](https://yctierlist.com/s26/korso/)
- Founders: Daichi Hiraoka (electrical hardware engineer), Alex Liu and Martin Pan. 3 people — [altss](https://altss.com/companies/yc/korso)
- Overlap: both the inbound quote side and the outbound supplier ETA-chasing side for manufacturers. Differences: sits on existing systems, no own ERP or supplier network.

**Smartbase — YC X26/P26 (San Francisco; the YC Tier List says S26). Closeness: MEDIUM**
- "AI-native ERP for manufacturers"; the current product automatically converts incoming customer POs into ERP orders, because even small manufacturers employ multiple full-time staff to type them in — [YC](https://www.ycombinator.com/companies/smartbase); [altss](https://altss.com/companies/yc/smartbase)
- Founders: Sam Goldman (CEO; previously founded a DevOps platform that raised $2M) and Taira Fujioka (CTO; youngest SDE2 at AWS SageMaker Inference) — [altss](https://altss.com/companies/yc/smartbase)

**Seals AI — YC S24. Closeness: LOW-MEDIUM**
- "AI employees" for the 700,000 US wholesalers: quoting, order-taking, payment collection and ERP data entry (product "Titanio"). Founders Luis Mario Garcia, Heber Uriegas, Javier Gonzalez and Fernando Huerta (Mexico-linked team) — [YC on X](https://x.com/ycombinator/status/1834006676724482535); [Launch YC](https://www.ycombinator.com/launches/LqH-seals-ai-ai-employees-for-wholesalers-distributors); [Runtime Wire](https://runtimewire.com/article/startup-spotlight-seals-ai-titanio-wholesale-distributors)

**Kanava AI — YC X25. Closeness: LOW**
- Voice agents acting as junior sales reps for wholesale distributors: inbound calls, stock and price checks, CRM updates from live ERP data. Founders Smit Dagli and Vikhyath Mondreti — [YC](https://www.ycombinator.com/companies/kanava-ai); [Analytics Insight](https://www.analyticsinsight.net/artificial-intelligence/how-kanava-ai-is-bringing-voice-automation-to-industrial-workflows-an-interview-with-smit-dagli)

**Lark — YC F26. Closeness: LOW-MEDIUM**
- Specialised agents for wholesale distributors (purchasing, forecasting, inventory, sales, analytics) that learn from ERP history. Founders Jason Wang and Michael Wang — [YC](https://www.ycombinator.com/companies/lark-2); [site](https://www.trylark.ai/)

**Whitespace — YC S26. Closeness: LOW-MEDIUM**
- "AI Operating System for Wholesale Distribution": self-improving agents for inventory planning, customer service and order processing. Founders Alex Tung and Leon Yao — [YC](https://www.ycombinator.com/companies/whitespace)

**Axal — YC W25. Closeness: LOW-MEDIUM**
- AI automating manual operational workflows (data entry, process tracking, coordination) for manufacturers and distributors. Founders Samai Patel (built space-safety software for Amazon Kuiper at 20) and Nand Vinchhi (ex-Airchat, MIT CSAIL) — [YC](https://ycombinator.com/companies/axal); [roundfunded](https://www.roundfunded.com/en/yc-startup/axal)

**Corvera — YC W26 (London-founded, SF-based). Closeness: LOW**
- Agentic supply-chain management for CPG brands: inbox-to-delivery order recording, fulfilment and invoicing on top of the ERP. £3M ($4.2M) seed (May 2026) led by 6 Degrees Capital with 20VC, Rebel Fund and others. CEO Chris Kong (built tempeh brand Better Nature to 5,000 stores); CTO Dirk Breeuwer (ex-head of data and AI at Google, per source) — [Tech.eu, 5 May 2026](https://tech.eu/2026/05/05/london-founded-corvera-raises-42m-to-bring-agentic-ai-to-cpg-supply-chains/); [Crowdfund Insider](https://www.crowdfundinsider.com/2026/05/278068-agentic-supply-chain-management-firm-corvera-raises-4-2m-round/)

**Spherecast — YC S24. Closeness: LOW**
- "Agnes", an AI supply-chain manager for CPG brands that decides what to produce, where, and how to move it. Pre-seed about $1.5M (Dec 2024) per one source; $500K per another (conflict) — [Seedtable](https://seedtable.com/companies/spherecast); [Work at a Startup](https://www.workatastartup.com/jobs/86768)

**HappyRobot — YC-backed (batch not confirmed in sources). Closeness: LOW (freight, but the reference voice/email agent)**
- AI agents for freight communications (rate negotiation, appointment booking) across voice, email and documents for DHL, Ryder, Flexport, Kuehne+Nagel and others. $44M Series B (Sept 2025, led by Base10, with a16z and YC). **$150M Series C at a $1.22B post-money valuation, announced 4 Aug 2026, co-led by Prysm Capital and Eurazeo**; 150+ enterprise customers — [IT Brief](https://itbrief.co.uk/story/happyrobot-raises-usd-44-million-to-boost-ai-for-supply-chains); [Fortune, 4 Aug 2026](https://fortune.com/2026/08/04/happyrobot-worth-1-2-billion-founder-says-just-getting-started/); [Dealroom](https://dealroom.co/news/142933-happyrobot-raises-150m-series-c-at-1-2b-valuation-to-scale-enterprise-ai/)

### Inferences
- XELOR spans both sides of a transaction that YC funds as separate companies: buyer agents (Lumari, Mandel, Tesora) and seller order-intake agents (Comena, Korso, Smartbase, Seals). XELOR's link layer, where a supplier answers an RFQ without a login and that answer flows into both parties' records, is a network design. None of these single-sided agents was found to offer it.
- HappyRobot's $1.2B valuation shows that investors will pay for automating "communication-heavy" B2B workflows. In freight this happened first; manufacturing supplier communication is the analogous, less mature market.

### Gaps
- No YC company was found that uses WhatsApp specifically for supplier quoting or PO acknowledgement in manufacturing. Sila (W26, "agentic WhatsApp") appeared only as a label in a search snippet, without detail — [YC directory snippet](https://www.ycombinator.com/companies/?batch=W26&batch=Winter+2026).
- HappyRobot's YC batch was not confirmed.

## Q4. Which YC companies build manufacturing ERP/MES or "operating systems" for SME factories with a supplier-facing component?

### Takeaway
Very few. **Tiny (YC F24) is the single closest YC analogue to XELOR as a product thesis**: an AI-agent ERP for the "four million factories still primarily relying on Excel", already used by automotive and electronics supplier factories in **Indonesia, Vietnam and India**. Smartbase (X26/P26) calls itself an AI-native ERP for manufacturers but currently does order entry. Paloma (S25) builds custom software for manufacturers. Raven (S22, Bengaluru) and Optifye (W25) are plant-operations AI with no supplier component. YC's 2026 RFS explicitly invites challengers to ERP and supply-chain SaaS.

### Cited Findings

**Tiny — YC F24. Closeness: HIGH (ERP thesis and emerging-market SME factories, India included)**
- "Rippling for factories": "a new kind of ERP system for factories where AI agents automate repetitive workflows", for "the four million factories still primarily relying on Excel"; one platform tracking "the full lifecycle of a manufactured item across every department". Positioned against SAP-class ERPs costing over $1M — [Launch YC](https://www.ycombinator.com/launches/MH3-tiny-rippling-for-factories); [YC](https://ycombinator.com/companies/tiny)
- "Already working with several factories in Indonesia, Vietnam, and India, focusing on suppliers in the automotive and electronics industries" — [Launch YC](https://www.ycombinator.com/launches/MH3-tiny-rippling-for-factories)
- Co-founder/CTO Edward Zhang (led scaling of Apple's Services API gateway; ex-Zenefits, Addepar). Batch F24 per his LinkedIn — [LinkedIn](https://www.linkedin.com/in/edward-zhang-14685828/)
- Overlap: SME factory ERP for emerging-market tier-2/3 suppliers, which is XELOR's customer profile. Differences: no supplier network, no-login RFQ link, scorecard or passport was found in the launch text. Funding and current status beyond the YC profile were not found.

**Smartbase — YC X26/P26.** Pitched as an "AI-native ERP for manufacturers", currently PO-to-ERP order automation (details in Q3) — [YC](https://www.ycombinator.com/companies/smartbase). Closeness: MEDIUM.

**Paloma — YC S25. Closeness: LOW-MEDIUM**
- Embeds engineers and operations experts to build custom AI-native operational software replacing manual operations at manufacturers; repositioned in 2026 around digital transformation for "real-economy" businesses. Founders Nazli Danis (CEO; Deel's first product hire, led Deel's EOR product), Alex Avnit and Kaiwen Song (all ex-Deel) — [yespress](https://yespress.io/paloma-yc-s25.md)

**Raven — YC S22 (Bengaluru). Closeness: LOW; INDIA**
- AI assistants and data infrastructure for process plants (manufacturing, chemicals, oil & gas): training, job planning, troubleshooting, reporting — [Work at a Startup](https://www.workatastartup.com/jobs/80991); [altss](https://altss.com/companies/yc/raven)

**Optifye.ai — YC W25. Closeness: LOW; INDIA-LINKED**
- Computer vision that monitors factory-worker performance in real time. YC deleted promotional posts after a viral surveillance backlash in Feb 2025 — [SF Standard](https://sfstandard.com/2025/02/25/ycombinator-startups-surveillance-backlash-garrytan/); [American Bazaar](https://americanbazaaronline.com/2025/02/27/y-combinator-deletes-posts-by-ai-startup-after-backlash460061/)
- A search snippet claimed "0 to $25M in 9 months"; no primary source was found, so treat it as unverified — [Work at a Startup](https://www.workatastartup.com/jobs/74288)

**Sculpt — YC S22 (Pune, India). Closeness: MEDIUM-LOW; INDIA**
- Automated should-cost analysis that turns manufacturing drawings into costing quotations "in minutes, not weeks" for precision manufacturers (Tier-1s and batch manufacturers); supports 200+ operations; claims 98% accuracy. Founder Vidhi Vakharia; 2 staff — [YC](https://www.ycombinator.com/companies/sculpt); [site](https://www.sculptcosting.com/)
- Overlap: supplier-side quotation for Indian precision job shops, which is complementary to XELOR's RFQ response.

**Epsilon3** is named in a search summary as "AI-powered ERP, MES and test management for complex engineering" under YC listings — [YC operations listing](https://www.ycombinator.com/companies/industry/Operations). It targets aerospace, not SMEs; its YC batch was not verified in this session.

**Tailor — YC (Japan)** is a "headless ERP" for retail operations backed by YC and Global Brain (Sept 2022). Not manufacturing — [TechCrunch](https://techcrunch.com/2022/09/05/y-combinator-global-brain-back-tailor-a-japanese-headless-erp-startup/).

### Inferences
- Tiny is the YC company whose pitch ("ERP for Excel-run supplier factories in India, Vietnam and Indonesia") most directly overlaps XELOR's. It should be tracked closely. XELOR's network features (supplier links, earned records, capacity sharing, passport) are the main differentiation found.
- YC money for "AI-native ERP for manufacturers" is very early (Smartbase, Tiny), which suggests the category is still open.

### Gaps
- Tiny's founding CEO, funding amounts and current traction or status (Oct 2026) were not found.
- No YC MES company with supplier portals was found.

## Q5. Which YC companies focus on India or emerging-market manufacturing/industrial B2B?

### Takeaway
YC's India-based industrial list is thin. Directly relevant are **Waybill (S26, Gurugram; agentic procurement)**, **Sculpt (S22, Pune; should-cost quoting)**, **Raven (S22, Bengaluru; plant AI)** and **Optifye.ai (W25; factory vision)**. Tiny (F24) serves Indian, Vietnamese and Indonesian factories from the US, and Saudara (Indonesia factories) and Donkey (China) serve emerging-market supply bases for US buyers. **Zetwerk, OfBusiness and Jumbotail are not YC companies.** No YC company was found doing XELOR's exact play: an SME factory ERP plus supplier network in India.

### Cited Findings
- YC listed 156 India-headquartered startups as of April 2026 — [startupbooted summary of YC directory](https://www.startupbooted.com/list-of-y-combinator-backed-indian-startups)
- Waybill (S26, Gurugram), Sculpt (S22, Pune), Raven (S22, Bengaluru) and Optifye (W25): see Q1 and Q4 for details and sources.
- Flux Auto (W21) builds physical AI for material movement in warehouses and factories (customers named include Walmart, Daimler, Bajaj, Mahindra Logistics). Closeness: LOW — [YC India B2B listing](https://www.ycombinator.com/companies/industry/b2b/india)
- ODWEN (S21) is a warehouse/3PL network for India's SMEs (2,000+ warehouses, 180 locations). Closeness: LOW, but an SME-network analogue — [YC India listing](https://www.ycombinator.com/companies/industry/b2b/india)
- Material Depot (W22) brings interior materials from manufacturers to customers. LOW — [YC India marketplace listing](https://www.ycombinator.com/companies/industry/marketplace/india)
- Zoko (W21, India) is WhatsApp commerce for Shopify merchants; $1.4M seed (Mar 2021) from YC, Binny Bansal's family office and Ryan Hoover. A WhatsApp-native B2C/D2C reference, not manufacturing — [Daily Excelsior](https://www.dailyexcelsior.com/?p=1129525); [Seedtable](https://seedtable.com/companies/zoko/funding-rounds/seed-2021-03)
- BusinessOnBot (W21) does WhatsApp commerce for Indian D2C brands and SMBs. LOW — [YC India search snippet](https://www.ycombinator.com/companies/industry/b2b/india)
- A search snippet described Rastro (S24) as serving "distributors and manufacturers" with pan-India catalogs shared via WhatsApp, but Rastro's YC profile shows London-based founders (Augustin Baudoin, Baptiste Cumin, Papa Sougou Wele) offering "the fastest way to launch product catalogs". The India description could not be verified — [YC jobs](https://www.ycombinator.com/companies/rastro/jobs)
- **Zetwerk is not YC**: seed from Kae Capital and Sequoia India (Peak XV), 2018; $9M Series A led by Accel — [Entrackr](https://entrackr.com/2019/03/zetwerk-fund-accel-sequoia); [DealStreetAsia](https://media.dealstreetasia.com/stories/india-sequoia-accel-lead-9m-round-in-b2b-tech-startup-zetwerk-127424)
- **Jumbotail is not YC** (Nexus, Kalaari) — [search result summary citing zerogtalent](https://zerogtalent.com/tech-companies/jumbotail). OfBusiness, NowPurchase and Power2SME came up as Indian raw-material procurement marketplaces, but no YC link was found — [OfBusiness](https://www.ofbusiness.com/)
- S26 had an estimated 90+ India-origin founders (about 20% of about 470), per an informal community estimate. The article highlighted robotics, hardware-testing and semiconductor companies, not supply chain — [Enterprise AI Weekly](https://enterpriseaiweeklybyvp.substack.com/p/what-ycombinators-september-2026)
- Emerging-market supply bases for US buyers: Saudara AI (Indonesia), Donkey (China) and Seals AI (a Mexico-linked team serving US wholesalers). See Q2 and Q3.

### Inferences
- XELOR's India SME factory focus is largely uncontested within YC's portfolio. The closest India-adjacent YC players are Tiny (an SME factory ERP serving India among other markets) and Waybill (procurement for Indian deep-tech hardware buyers).
- Sculpt is complementary: a supplier-side quoting tool for Indian precision job shops. In principle it could plug into XELOR's RFQ response flow.

### Gaps
- The YC India directory could not be enumerated; smaller India industrial companies may be missing.
- No YC company was found in Peenya/Bengaluru SME engineering clusters specifically.

## Q6. Is YC's Requests for Startups (RFS) calling for anything like this?

### Takeaway
Yes, partially. The Summer 2026 RFS includes "Hardware Supply Chain", "Supply Chain 2.0 for Semiconductors" and "SaaS Challengers" (explicitly naming ERP and supply-chain management). Spring 2026 asked for software-defined American metal mills; Winter 2025 asked for US reshoring and automated manufacturing. These requests are US/reshoring-framed and centre on hardware speed, not emerging-market SME supplier networks.

### Cited Findings
- Summer 2026 "Hardware Supply Chain" (Nicolas Dessaigne): "In Shenzhen, a team can go from design to a new physical part in one day… in the US the same loop takes weeks"; asks for startups producing parts faster and integrating design, manufacturing and logistics — [modelence RFS mirror](https://modelence.com/yc-rfs-summer-2026/hardware-supply-chain); [VC Cafe](https://www.vccafe.com/requests-for-startups-summer-2026-edition/)
- Summer 2026 "Supply Chain 2.0 for Semiconductors": one AI chip passes through 1,400 process steps across a dozen countries over 5 months, a supply chain "managed with spreadsheets, SAP, and phone calls"; asks for multi-tier supplier-risk visibility — [VC Cafe](https://www.vccafe.com/requests-for-startups-summer-2026-edition/); [openfor.co](https://www.openfor.co/post/yc-summer-2026-requests-for-startups-an-independent-reading)
- Summer 2026 "SaaS Challengers": attack "big, hard SaaS categories like ERP, chip design software, industrial control systems and supply chain management" — [The VC Corner](https://www.thevccorner.com/p/yc-summer-2026-requests-for-startups-ideas)
- Spring 2026: "Modern software-defined metal mills" (8–30 week lead times for rolled aluminium and steel tube); Winter 2025: US-based manufacturing and reshoring through robotics and ML — [VC Cafe 2025](https://www.vccafe.com/2025/01/08/requests-for-startups-in-2025/); [YC RFS 2025](https://www.ycombinator.com/rfs?year=2025)
- One analysis says the supply-chain share of YC batches rose from 4.3% to 8.5% — [extruct W26 breakdown](https://www.extruct.ai/research/ycw26/) (via search snippet)

### Inferences
- XELOR fits the "SaaS Challengers: ERP / supply chain" request, and its supplier-performance record maps to the multi-tier supplier visibility theme. Its India SME framing differs from YC's US-reshoring framing.

### Gaps
- The full text of the Fall 2026 RFS (13 ideas, per [Superframeworks](https://superframeworks.com/articles/yc-fall-2026-rfs-indie-hacker-plays)) could not be retrieved, so any manufacturing or supply-chain items in it are unverified.
- Flexport (YC W14, freight forwarding) and Faire (YC W17, wholesale marketplace) are well-known YC supply-chain and B2B-commerce companies. They were not re-verified in this session and are judged LOW closeness.
