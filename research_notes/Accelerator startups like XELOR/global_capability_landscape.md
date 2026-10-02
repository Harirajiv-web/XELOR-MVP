# Global capability landscape: venture-funded companies building XELOR's supplier-network capabilities (as of 2 Oct 2026)

Scope note: this covers capability-level benchmarking and market evidence, not accelerator portfolios. XELOR capability numbering used throughout:
(1) RFQ auto-written from item master/BOM/quality plan after a shortage; (2) supplier quotes via message link, no login/app; (3) explainable quote ranking (delivery, landed cost, earned record); (4) award to PO with approval limits; (5) GRN + incoming inspection automatically update supplier on-time/reject rates ("earned, not claimed"); (6) live capacity sharing between suppliers who also run XELOR; (7) the factory's own delivery record as a portable "passport"; (8) all of it inside the factory's own ERP (stock, production, GST invoicing, ledger).

Source-quality caveat: several network fetches were blocked (caddi.com, entproc.com, digitalcommerce360.com), so some facts rely on search-result summaries of the cited pages and on aggregators (Tracxn, CB Insights, getlatka, newmarketpitch, fastaijobs). These are flagged where used. Session budget limited verification to roughly 17 tool calls.

## Q1. AI procurement/sourcing agents and supplier-communication automation (capabilities 1–4)

### Takeaway
This is the most crowded and best-funded part of XELOR's scope. 2025–2026 saw a wave of $12M–$55M rounds into AI procurement agents (Didero, Lio, Levelpath, Pactum, Arkestro, LightSource, Procure Ai, Leverage), plus Zip at a $2.2B valuation. But nearly all of them sell to US/EU mid-market and enterprise buyers and sit on top of an existing ERP. Only a few (Didero, Leverage AI, LightSource, Arkestro) focus on direct materials for manufacturers. I found none aimed at Indian SME factories.

### Cited Findings
**Direct-materials / manufacturer-focused agents (closest to XELOR's capabilities 1–4)**
- **Didero** (New York). AI agents turn procurement information scattered across emails, PDFs, spreadsheets and supplier communications into structured workflows. Raised a **$30M Series A co-led by Chemistry and Headline, with Microsoft's M12**. Existing investors First Round Capital, Construct Capital, BoxGroup and **AI Grant** (an AI-focused accelerator/grant programme) also participated. It reports more than 30 manufacturing and distribution customers. It positions itself on raw materials and production inputs for manufacturers and distributors, in contrast to Levelpath, Zip and ORO Labs, which serve corporate purchasing — [Procurement Magazine](https://procurementmag.com/news/how-didero-is-putting-procurement-on-autopilot); [Robotics & Automation News, 24 Mar 2026](https://roboticsandautomationnews.com/2026/03/24/didero-raises-30-million-series-a-to-bring-ai-agents-to-global-supply-chains/100069/). Round date: **Feb 2026** per [Digital Commerce 360, 20 Feb 2026](https://www.digitalcommerce360.com/2026/02/20/didero-30-million-funding-ai-procurement/) (URL date; page fetch blocked) and [Didero blog](https://blog.didero.ai/blog/series-a-announcement).
- **Leverage AI** (HQ not confirmed). AI purchase-order visibility and supplier follow-up for manufacturers and distributors. It automates PO tracking, supplier communications and shipment visibility, and integrates with ERP systems. Listed as Series A with **$14M total**. Source is an aggregator, so treat as low confidence — [FastAIJobs profile](https://www.fastaijobs.com/companies/leverage-ai).
- **LightSource** (LightSource Labs Inc.). An AI-native enterprise procurement platform for **strategic and direct-material sourcing**. Came out of stealth with **$33M combined seed + Series A at a $130M valuation, co-led by Lightspeed Venture Partners and Bain Capital Ventures, with J2 Ventures**. It claims 10x ARR growth over 18 months. Named customers: Yum! Brands, Bombardier Recreational Products, Serta Simmons Bedding, HelloFresh, Shure. Announced **15 Apr 2025** — [Pulse 2.0](https://pulse2.com/lightsource-33-million-raised-at-130-million-valuation-for-modernizing-sourcing-and-procurement); [BusinessWire, 15 Apr 2025](https://www.businesswire.com/news/home/20250415296434/en).
- **Arkestro** (San Francisco). A "predictive procurement" platform: ML-generated price offers and supplier quoting. Raised **$36M (Series A extension), May 2025, led by Altira Group and Aramco Ventures**, with NEA, Koch Disruptive Technologies and Activant participating — [FinSMEs, May 2025](https://www.finsmes.com/2025/05/arkestro-raises-36m-in-funding.html).
- **Archlet** (Zurich). Sourcing and bid-analysis software. Latest round was an unattributed VC round on **10 Mar 2025** with Aramco Ventures participating — [CB Insights](https://www.cbinsights.com/company/archlet/financials) (aggregator).
- **Jiga** (Tel Aviv, **Y Combinator** alumnus). An AI-native sourcing platform for custom parts. Engineers upload drawings and specifications, the AI extracts requirements and flags risks, and the order is matched to vetted manufacturers. It claims to cut custom-parts procurement from three weeks to three hours. **$12M Series A led by Aleph, with Symbol and Y Combinator, Nov 2025**; $16.23M total. Customers include NASA and Siemens (aerospace, defence, robotics) — [FinSMEs, Nov 2025](https://www.finsmes.com/2025/11/jiga-raises-12m-in-series-a-funding.html); [Calcalist](https://www.calcalistech.com/ctechnews/article/hj8ti4qxzg); [Tech.eu 2021 (YC-backed)](https://tech.eu/2021/03/03/y-combinator-backed-tel-aviv-based-jiga-launches-b2b-marketplace-for-manufacturers/).

**Enterprise (mostly indirect/corporate spend) procurement orchestration and agents**
- **Lio** (Lio Technologies). Agentic AI for enterprise procurement. **$30M Series A, March 2026, led by Andreessen Horowitz**, with SV Angel, Harry Stebbings and **Y Combinator** participating — [Teardown.ai](https://www.teardown.ai/companies/lio); [VentureCapitalTracker](https://venturecapitaltracker.com/startup/lio) (aggregators).
- **Levelpath**. An AI-native enterprise procurement platform. **$55M Series B, 30 Jun 2025, led by Battery Ventures**, with Redpoint, Benchmark, 01A, NewView and World Innovation Lab. More than $100M raised in total — [TechCrunch, 30 Jun 2025](https://techcrunch.com/2025/06/30/next-gen-procurement-platform-levelpath-nabs-55m); [PYMNTS](https://www.pymnts.com/artificial-intelligence-2/2025/levelpath-raises-55-million-to-scale-ai-native-enterprise-procurement-platform).
- **Zip** (intake-to-procure). Valued at **$2.2B**, with **$371M** raised — [newmarketpitch](https://newmarketpitch.com/blogs/news/procurement-software-funding-analysis) (aggregator).
- **Pactum** (Mountain View, Estonian-founded). Agentic AI for autonomous supplier negotiation. **$54M Series C, June 2025, led by Insight Partners** — [FinSMEs, Jun 2025](https://www.finsmes.com/2025/06/pactum-raises-54m-in-series-c-funding.html); [Invest in Estonia](https://investinestonia.com/estonian-ai-startup-pactum-raises-54m/).
- **Procure Ai** (UK/Germany). An AI-native procurement platform with more than 40 configurable agents. **$13M seed led by Headline**, with C4 Ventures and Futury Capital — [Procure Ai blog](https://www.procure.ai/blog/seed-funding-announcement); [Pulse 2.0](https://pulse2.com/procure-ai-13-million-seed-funding/amp/).
- **Freehand**. Autonomous AI agents that manage supply-chain spend and back-office operations for Fortune 500 companies. **$75M Series B** — [Crunchbase News](https://news.crunchbase.com/transportation/freehand-pando-enterprise-supply-chain-spend-management-startup/).
- **Coverbase**. AI-powered procurement and vendor risk platform with customers including Okta and Coinbase. **$16M Series A** — [Crunchbase News](https://news.crunchbase.com/venture/coverbase-raise-ai-powered-procurement/).
- **Parspec**. AI-powered procurement for the construction supply chain. **$20M Series A** — [Crunchbase News](https://news.crunchbase.com/ai/construction-supply-chain-startup-parspec/).
- **Traza**. "AI workers" for procurement and supply-chain operations. **$2.1M** raised — [Pulse 2.0](https://pulse2.com/traza-2-1-million-raised-to-automate-procurement-and-supply-chain-operations-with-ai-workers/).
- Aggregate: Zip, Globality, ORO Labs, Omnea, Levelpath, Tonkean and Pactum have together raised more than **$1.2B**. Ramp, ORO Labs, Interos, SpotDraft, Summize, Lio and ProcurePro all raised new capital in 2026 — [newmarketpitch](https://newmarketpitch.com/blogs/news/procurement-software-funding-analysis) (aggregator).

**Names in the brief I could not verify, or that are out of scope**
- **Keelvar** (Cork, sourcing optimisation and bots): no 2025–2026 round found in this session's searches.
- **Fairmarkit**, **Tealbook** (see Q3), **Globality**: no new 2025–2026 round found beyond the aggregate figure above.
- **Conrad**: no procurement company by this name found. **Rose AI** is a financial-data company, **Tradeswell** does e-commerce retail operations, **Parabola** does general data-workflow automation, **Silvr** is revenue-based financing and **Kadoa** does web-data extraction. None is a procurement or supplier-network competitor, though Parabola and Kadoa could be used as building blocks.

### Inferences
- **Capability (1), RFQ auto-generation**: crowded at enterprise level. Jiga and CADDi generate RFQs from drawings/CAD, and Arkestro, LightSource and Didero automate sourcing events. But none of the cited companies describes triggering an RFQ from an **ERP shortage signal plus BOM plus quality plan** inside its own ERP. They either read the customer's ERP (Didero, Leverage) or start from an engineering drawing (Jiga, CADDi).
- **Capability (2), no-login supplier response**: partly addressed. Didero and Leverage AI work through supplier email, so suppliers need no portal. That is the strongest overlap with XELOR's message-link model. I found no evidence of a WhatsApp-first flow, which is how Indian SME suppliers usually communicate.
- **Capability (3), explainable ranking**: Arkestro, Archlet, Keelvar and LightSource compete here for enterprise. The ranking inputs are mostly price and bid data, not a receipt-derived performance record.
- **Capability (4), award to PO with approval limits**: table stakes in Zip, Levelpath and Coupa-class tools, so it is not differentiating.
- Accelerator signal: Y Combinator appears in Jiga's and Lio's cap tables, and AI Grant in Didero's.

### Gaps
- Didero's total funding, founders and ERP integrations could not be confirmed because the page fetch was blocked.
- Leverage AI's HQ, investors and round date were not confirmed; the only source is an aggregator.
- Procure Ai's round date is not confirmed in the snippet.
- Zip's latest-round date and leads were not verified this session. Background knowledge says Series D, Oct 2024, $2.2B valuation (unverified).
- Keelvar, Fairmarkit and Globality: no 2025–2026 round data found.

## Q2. Manufacturing marketplaces and contract-manufacturing networks: do they share supplier capacity? (capability 6)

### Takeaway
On-demand manufacturing networks are well funded and consolidating. Fictiv was acquired by MISUMI for $350M in 2025, CADDi reached a $1.2B valuation in Sep 2026, Jiga raised a Series A, and Zetwerk is preparing an Indian IPO. However, they "share capacity" by acting as a **managed marketplace intermediary**: they hold the supplier relationship and route orders to vetted shops. None was found offering **peer-to-peer, ERP-native live capacity sharing** between a factory and suppliers who run the same ERP, which is XELOR's capability 6.

### Cited Findings
- **CADDi** (Tokyo/US). A manufacturing AI data platform that structures drawing data and supports sourcing. **$114M Series D at a $1.2B valuation (Sep 2026)**, taking total funding to **$234M**. The valuation is more than double the $470M reported in March 2025 — [WOWTALE, 19 Sep 2026](https://en.wowtale.net/2026/09/19/235178/); [Yahoo Finance exclusive](https://finance.yahoo.com/technology/ai/articles/exclusive-manufacturing-ai-startup-caddi-170000222.html); [CADDi announcement](https://caddi.com/en-us/news/announcements/caddi-raises-114-million-to-fix-manufacturings-biggest-bottleneck-with-ai/) (fetch blocked).
- **Fictiv** (San Francisco). AI-powered custom-parts manufacturing platform with a global supplier network. **Acquired by MISUMI for $350M in cash.** Announced April 2025, completed 18 June 2025. The combined offer covers custom and standard mechanical components with MISUMI's 22 manufacturing sites and 20 logistics hubs — [PlasticsToday](https://www.plasticstoday.com/business/fictiv-joins-misumi-group-to-complete-350-million-acquisition); [Pulse 2.0](https://pulse2.com/misumi-to-buy-fictiv-in-350-million-deal/).
- **Zetwerk** (Bengaluru). B2B manufacturing marketplace and contract manufacturer, and the key India comparator. Latest round per Tracxn: **Series F, $52.8M, 26 Mar 2026**. It plans an IPO raising about $272M at roughly a $4B valuation in 2026, with pre-IPO talks at about $3B (the two figures conflict) — [Tracxn](https://tracxn.com/d/companies/zetwerk/__n78BE94Qxh8Psc5IP7-rnqZUlQUUPeCPfBx6SfzpybQ/funding-and-investors); [Business Review Live](https://businessreviewlive.com/b2b-manufacturing-marketplace-zetwerk-plans-rs-5000-cr-ipo-seeks-fresh-capital-amid-stable-valuation/). Earlier: $120M round in Feb 2021 — [TechCrunch, 2 Feb 2021](https://techcrunch.com/2021/02/02/zetwerk-raises-120-million-to-scale-its-b2b-marketplace-for-manufacturing-parts/).
- **Jiga** (YC). Matches orders to vetted manufacturers (see Q1) — [FinSMEs, Nov 2025](https://www.finsmes.com/2025/11/jiga-raises-12m-in-series-a-funding.html).
- **Paperless Parts** (Boston). Quoting and estimating software for job shops, so it sits on the **supplier** side. Latest round per CB Insights was a $5M Series C on 22 Dec 2023, with no 2025–2026 round found — [CB Insights](https://www.cbinsights.com/company/paperless-parts/financials) (aggregator).

### Inferences
- Marketplaces such as Xometry, Fictiv/MISUMI, Protolabs Network, Jiga and Zetwerk sell **outsourced capacity as a service**. They are buyers' alternatives to running their own supplier base, not tools for running one. They take margin on each order and do not give the factory a portable record of its own suppliers.
- Zetwerk is a contract manufacturer and aggregator, not SME software. Indian SME pump makers would see it as a competitor for orders or a customer, not as a tool.
- XELOR's capability 6 (capacity shared voluntarily by suppliers who run the same ERP) resembles a network-effect ERP play. I found no funded company doing this for SMEs. The closest analogues are marketplace capacity views, which are internal to the intermediary.

### Gaps
- Xometry (public, NASDAQ: XMTR), Protolabs/Hubs, Thomasnet (owned by Xometry), Mfg.com, RapidDirect, Partfox and Kreo were not verified this session. Plethora is believed defunct (background knowledge, unverified).
- No evidence found either way on whether CADDi or Zetwerk expose live supplier capacity to buyers.
- CADDi's Series D lead investors were not captured (fetch blocked).

## Q3. Supplier performance and supplier data networks: earned from receipts, or self-reported/external? (capabilities 5 and 7)

### Takeaway
Supplier data networks are funded mainly around **risk monitoring** (Prewave, Interos) and **self-reported or enriched supplier master data** (Tealbook). None of the cited companies builds supplier scores from the buyer's own goods receipts and incoming-inspection results, and none makes a factory's delivery record a portable credential. Capabilities 5 and 7 look like the clearest white space.

### Cited Findings
- **Prewave** (Vienna). AI supplier risk monitoring from external signals such as news and social media. Grew from €11M raised in Sep 2022 to more than €90M in total, including an €18M Series A+ and a **€63M Series B led by Hedosophia** — search-result summary of [texxr / The Logic coverage](https://texxr.com/839829) (exact page not opened; medium confidence).
- **Interos** (Arlington, VA). Supplier-network risk intelligence. About $310M raised in total, including **$40M from Blue Owl Capital and Structural Capital in 2025**. It is aiming to break even by end-2026 after moving from services to software, and launched "itariffs" for tariff exposure in June 2025 — search-result summary of [ExecutiveBiz](https://www.executivebiz.com/?p=470338) / [Technical.ly](https://technical.ly/entrepreneurship/interos-supply-chain-arlington-funding.md) (medium confidence).
- **Tealbook** (Toronto). A "supplier data foundation" that enriches the supplier master. Last major round found was a **$50M Series B led by Ten Coves Capital (2021)**, with no 2025–2026 round found — [The Logic](https://thelogic.co/briefing/supplier-data-company-tealbook-raises-us50m-in-series-b-funding/); [Pulse 2.0](https://pulse2.com/supplier-data-foundation-company-tealbook-raises-50-million/amp/).

### Inferences
- Prewave and Interos scores come from **external monitoring** (news, financials, geopolitics, tariffs), not transactions. Tealbook's data comes from web enrichment, supplier self-certification and ERP-sourced spend. None of the sources describes on-time or reject rates computed from GRN and quality-inspection events and shared across a network.
- Enterprise suites (SAP Ariba, Coupa, Jaggaer) compute supplier scorecards from receipts inside one buyer's instance. Those records stay with the buyer and are not portable for the supplier. This is background knowledge, not verified this session.
- A "passport" (capability 7: a verifiable, transaction-derived delivery record that the factory carries to win business as a supplier to OEMs) has no funded analogue in this research. It is the most distinctive part of XELOR's scope. It also has a cold-start and trust problem: buyers must accept records attested by another firm's ERP.

### Gaps
- Craft.co, Sphera and Supplyframe (owned by Siemens since 2021, background knowledge) were not researched for 2022–2026 changes.
- No Indian supplier-rating network based on receipts was found. IndiaMART/TradeIndia "trust seals" are self-reported or verified, not transaction-earned (background knowledge, unverified this session).

## Q4. ERP-tied supplier collaboration portals (Ariba, Coupa, Jaggaer, Ivalua, Kinaxis, o9, Tradeshift, Basware): why don't SMEs use them? (capability 8 context)

### Takeaway
These are incumbents, not venture-stage peers. This session found no 2022–2026 evidence of any of them targeting Indian SME manufacturers. The SME-adoption barriers below are inferences from product positioning, not documented survey data.

### Cited Findings
- New AI procurement entrants explicitly position against corporate-purchasing incumbents and peers. Didero, for example, contrasts its manufacturing direct-materials focus with Levelpath, Zip and ORO Labs — [Procurement Magazine](https://procurementmag.com/news/how-didero-is-putting-procurement-on-autopilot).
- Lists of affordable procurement tools for SMEs exist as a separate category from enterprise suites — [entproc, "15 Affordable Procurement Tools for SMEs (2026)"](https://entproc.com/procurement-tools-for-smes/) (page fetch blocked; title only).

### Inferences
- The likely reasons SMEs stay away are as follows; these are well-known industry patterns but **not sourced this session**.
  - Supplier-side network fees (for example, Ariba Network transaction and subscription fees).
  - Integration and implementation cost.
  - Per-buyer portals that force small suppliers to log into many different systems.
  - No GST e-invoicing / Indian ledger coupling.
  - An enterprise-only sales motion.
- XELOR's no-login link (capability 2) plus ERP-native GST (capability 8) answers the portal-fatigue problem directly.

### Gaps
- No 2024–2026 survey data found on SME adoption of supplier portals in India.
- No 2022–2026 funding or SME-strategy data gathered for Jaggaer, Ivalua, Kinaxis, o9, Elementum, Tradeshift or Basware (out of budget). Background knowledge, unverified: Coupa was taken private by Thoma Bravo in 2023.

## Q5. SME manufacturing ERP/MES: does any have a built-in supplier network? (capability 8)

### Takeaway
SME manufacturing ERPs are funded but modestly (Katana about $69M total, Fulcrum about $22M, TranZact about $7M in India). The exception is Odoo, at a $7B valuation, which is horizontal. None of the cited sources describes a built-in network in which supplier performance or capacity flows between ERP users. That combination is where XELOR differs.

### Cited Findings
- **Katana** (Tallinn). Cloud manufacturing ERP/inventory for small and medium manufacturers. Latest round per Tracxn: **Series B, $16.4M, 2 Oct 2025**. About $68.6M raised in total, including a **$35M Series B in 2022 led by Northzone**. Enterprise value about $175M — [Tracxn](https://tracxn.com/d/companies/katana-mrp/__Z39bD04JGrGbL74HriY4uNF9jzrNoBwb4pFB5itG9ic); [Dealroom](https://dealroom.co/companies/katana-mrp/) (aggregators; the 2025 round labelling is uncertain).
- **Fulcrum** (Minneapolis). Cloud manufacturing software for job tracking and production scheduling. Series A stage, **$21.9M total** over two rounds — [Tracxn](https://tracxn.com/d/companies/fulcrum/__YX3kZruekyXdQ37Q3fXP861dp28U9wwRLals3PBP9iA) (aggregator).
- **Odoo** (Belgium). Open-source suite including manufacturing, inventory and accounting. **About $7B valuation**, about $552M revenue in 2025, about $1B raised across 7 rounds — [getlatka](https://getlatka.com/companies/odoo-sa) (aggregator; low confidence on revenue).
- **TranZact** (Mumbai). Freemium ERP for Indian SME manufacturers covering purchase, inventory, sales and quotations. **$7M Series A (Dec 2021) led by Tribe Capital**, with Prime Venture Partners, Gemba Capital and Kae Capital. It reported more than 20,000 SMEs across industrial, electrical, electronics, chemical and packaging sectors — [Inc42](https://inc42.com/buzz/erp-startup-tranzact-raises-7-mn-in-series-a-funding); [YourStory, Dec 2021](https://yourstory.com/2021/12/funding-alert-tranzact-sme-tech-startup-saas).
- **Bizongo** (India). AI-powered vendor digitisation, material procurement, PO management, packaging sourcing and supply-chain financing. **Series E, Mar 2025; $256M total** — Tracxn search summary via [Tracxn India Procurement IT list](https://tracxn.com/d/explore/procurement-it-startups-in-india/__GJZV_3nHU-GtbGHsJh4mJQNcvz8089i3pV-3m5qcKtY/companies) (aggregator).
- **ProcUrPal** (Bengaluru). AI procurement SaaS aimed at India's SMBs, with RFP/RFI/RFQ workflows. Founded Dec 2023, launched Feb 2025. It claims more than 10 enterprise clients and over 8 lakh suppliers in its network — [Inc91 (promotional)](https://www.inc91.com/from-boardrooms-to-bharat-award-winning-msme-saas-platform-procurpal-onboards-over-85-lakh-suppliers-and-redefining-procurement-innovation) (low confidence; funding not disclosed).
- **Vayana** (India supply-chain finance). Series D funding on 23 Jun 2025, $91.9M total. India SaaS overall raised $2.54B in 2025 — Tracxn search summary (same Tracxn list as above).
- Bessemer cites **AI-native ERPs Everest, Doss and Rillet** as automating forecasting and procurement flows. These are finance- and operations-oriented, not manufacturing supplier networks — [Sky9 Capital summary of BVP](https://www.sky9capital.com/blog/blog-vcs-ai-native-enterprise-software-startups-2026/); [BVP State of AI 2025](https://www.bvp.com/atlas/the-state-of-ai-2025).

### Inferences
- In India, the SME manufacturing ERP layer is held by Tally, Zoho, TranZact, ERPNext and Odoo partners (Tally, Zoho and ERPNext not researched this session). None of the cited ones markets a supplier network with earned performance records.
- Bizongo and ProcUrPal are India's closest procurement-network analogues. Bizongo combines procurement, financing and sourcing, mostly for larger buyers. ProcUrPal does RFx for SMBs. Neither is described as the factory's own ERP with GST ledger plus earned supplier records.
- XELOR's defensible combination is: shortage, then auto-RFQ, then no-login quote, then GRN/inspection-earned score, all in a GST-native ERP. Point competitors exist for each step, but no one integrated SME vendor was found.

### Gaps
- Katana and MRPeasy supplier-portal features, and ProShop, Tulip and Plex supplier networks, were not checked. Background knowledge: Tulip raised a $100M Series C in 2021; Plex was acquired by Rockwell in 2021 (unverified).
- Zoho Inventory/Books and ERPNext procurement-portal capabilities were not researched.
- Funding totals for ProcUrPal are unknown.

## Q6. Market-level evidence: funding trends and analyst theses (2024–2026)

### Takeaway
Capital is flowing strongly into AI procurement agents and supply-chain software. Supply-chain and logistics startups raised $6.2B in H1 2026, on pace for their best year since 2022, and agent-focused seed rounds are a top 2025 trend. Top-tier funds (a16z, Battery, Benchmark, Lightspeed, Bain Capital Ventures, Insight, Headline, M12) now back procurement agents. I found no explicit analyst thesis on "networked ERP for SMEs".

### Cited Findings
- Supply-chain and logistics startups are on pace in 2026 for their strongest year since 2022, with **$6.2B raised in H1 2026 across 350 deals** — Crunchbase News search summary (from [Crunchbase News coverage](https://news.crunchbase.com/transportation/freehand-pando-enterprise-supply-chain-spend-management-startup/); specific article not confirmed).
- Investors put about **$700M into seed rounds for AI companies whose descriptions involve autonomous agents**, named a top seed trend of 2025 — [Crunchbase News](https://news.crunchbase.com/ai/autonomous-agents-top-seed-trend-2025/).
- Procurement orchestration leaders (Zip, Globality, ORO Labs, Omnea, Levelpath, Tonkean, Pactum) have together raised more than $1.2B — [newmarketpitch](https://newmarketpitch.com/blogs/news/procurement-software-funding-analysis) (aggregator).
- Bessemer's thesis is that vertical AI eclipses vertical SaaS because it competes for labour budgets rather than software budgets. It names AI-native ERPs (Everest, Doss, Rillet) that automate procurement flows — [Sky9 Capital summary](https://www.sky9capital.com/blog/blog-vcs-ai-native-enterprise-software-startups-2026/); [BVP State of AI 2025](https://www.bvp.com/atlas/the-state-of-ai-2025).
- a16z's Big Ideas 2026 lists procurement among the enterprise use cases that need multimodal data handling (alongside contracts, onboarding, claims, compliance and support) — [a16z Big Ideas 2026 Part 1](https://a16z.com/newsletter/big-ideas-2026-part-1/). a16z then led Lio's $30M Series A in Mar 2026 — [Teardown.ai](https://www.teardown.ai/companies/lio).
- The AI-native manufacturing-sourcing category reached unicorn scale: CADDi at $1.2B in Sep 2026 — [WOWTALE](https://en.wowtale.net/2026/09/19/235178/).

### Inferences
- Funding is clustered in **enterprise procurement agents** (US/EU, indirect and direct) and **manufacturing sourcing marketplaces/data**, so both categories are crowded and well capitalised. The SME, India, ERP-native, transaction-earned trust layer is not a funded category yet. That is an opportunity, and also a risk signal: it may mean investors see SME ACV as too low.
- Didero's shift from "AI for procurement" to "AI for manufacturing direct materials" shows that investors already accept manufacturer-specific supplier-communication agents. XELOR's angle is to deliver the same thing to SMEs inside the ERP.

### Gaps
- No Gartner, McKinsey or Battery Ventures report on "procurement agents" or "networked ERP" was retrieved. No CB Insights procurement market map was retrieved.
- No precise 2024 or 2025 total for AI-procurement funding was found. Only partial aggregates are available.

## Q7. Synthesis: which XELOR capabilities are crowded and which are underserved (especially for Indian SME manufacturers)?

### Takeaway
Crowded: (1) RFQ automation, (3) quote ranking and (4) award-to-PO at enterprise level, plus on-demand manufacturing marketplaces (as a substitute for capability 6). Partly served: (2) no-login supplier response, through email-based agents (Didero, Leverage) that are US/enterprise-focused. Underserved, with no funded analogue found: (5) GRN- and inspection-earned supplier records shared across a network, (6) peer ERP-to-ERP capacity sharing, (7) a portable delivery "passport", and the bundling of everything inside an **Indian GST-native SME ERP** (8).

### Cited Findings
- Capability-by-capability evidence summary (all cited above):

| XELOR capability | Crowding | Leading/recent funded players (2022–2026) | Segment/region | Coverage of XELOR scope |
|---|---|---|---|---|
| (1) Shortage-triggered auto-RFQ from BOM/QP | High (enterprise) | Didero ($30M A, Feb 2026), LightSource ($33M, Apr 2025), Arkestro ($36M, May 2025), Jiga ($12M A, Nov 2025, YC), CADDi ($114M D, Sep 2026) | US/EU/JP mid-market and enterprise | Partial: drawing- or event-driven; not ERP-shortage-driven inside the vendor's own ERP |
| (2) No-login supplier quoting via link | Medium | Didero, Leverage AI (~$14M) through email agents | US manufacturers/distributors | Close functional overlap; no WhatsApp/India focus found |
| (3) Explainable ranking (delivery, landed cost, record) | High | Arkestro, Archlet (Mar 2025), LightSource, Pactum ($54M C, Jun 2025), Levelpath ($55M B, Jun 2025) | Enterprise | Bid/price analytics; no earned receipt record as input |
| (4) Award to PO with approval limits | Very high (commodity) | Zip ($2.2B val.), Levelpath, Lio ($30M A, Mar 2026, a16z), Procure Ai ($13M seed) | Enterprise | Full overlap, but table stakes |
| (5) GRN/inspection-earned supplier record | Low across networks | Prewave (€63M B), Interos ($40M, 2025), Tealbook ($50M B, 2021) are external-risk or self-reported | Enterprise, global | Not transaction-earned; low overlap |
| (6) Live capacity sharing among network ERP users | Low (peer); High (marketplace substitute) | Fictiv/MISUMI ($350M exit, Jun 2025), Zetwerk (Series F, Mar 2026; IPO plan), Jiga, CADDi | Marketplace intermediaries | Intermediated, not peer-to-peer |
| (7) Portable delivery "passport" | None found | none found | — | White space |
| (8) Inside SME ERP (stock, production, GST, ledger) | Medium (ERP) / None (ERP+network) | Katana (~$68.6M), Fulcrum (~$21.9M), Odoo (~$7B val.), TranZact ($7M A, India), Bizongo (India, $256M, procurement and finance) | SME, global and India | ERP without a supplier network, or a network without the SME ERP |

### Inferences
- **Most defensible wedge for XELOR in India**: capabilities 5, 7 and 8 together. Transaction-earned supplier records generated by GST-native ERP usage, then made portable, create a network effect that point-solution AI agents (which sit on top of someone else's ERP) and marketplaces (which own the supplier relationship) structurally cannot copy without becoming an ERP.
- **Biggest competitive threats**:
  - Well-funded agents moving down-market. Didero and Leverage already target manufacturers and distributors.
  - Zetwerk/Bizongo-style Indian platforms adding SME tooling.
  - Odoo, Zoho or Tally adding AI RFQ features to their large SME install bases.
- **Positioning risk**: capabilities 1–4 alone would be judged as a "me-too procurement agent" against much better-funded US players. Pitch materials should lead with 5–8.
- The scarcity of funded SME-India supplier-network software may reflect low willingness to pay. Freemium ERP (TranZact's model) plus network monetisation, for example with financing partners in the Bizongo/Vayana pattern, is the observed local playbook.

### Gaps
- No direct India-specific competitor offering capabilities 5–7 was found. A deeper search of Indian MSME platforms (OfBusiness, Moglix, IndiaMART, ProcMart, Tally integrations) is needed to confirm the white space.
- Pricing and ACV data for SME procurement tools were not gathered.
