# 02 — MSME Services Directory for XELOR Marketplace

Research date: 2026-10-03. Prepared for XELOR (trusted supplier network plus agentic AI ERP for MSME factories, piloting in Peenya, Bengaluru). Working assumption: XELOR only connects people and never handles money.

## Read this first: method and limits

- **WebFetch was blocked** by the session's network egress proxy for every primary-source domain tried: niti.gov.in, sidbi.in, pib.gov.in, eparlib.sansad.in, knnindia.co.in, etvbharat.com, businesstoday.in, theweek.in, cmrindia.com, help.indiamart.com and en.wikipedia.org. So **I did not read any of the pages cited here myself.** Every fact below comes from search-engine result summaries of the cited URLs. Open the source and check it before you use any number in a pitch, deck or grant application.
- The **WebSearch budget for the session (200 calls) ran out** partway through. That left these questions thin or unresearched:
  - Q4: Exotel, Knowlarity and WhatsApp-first contact, plus evidence on what makes a directory trusted.
  - Q6: outcomes for Venwiz, Zetwerk and Karkhana after 2024.
  - Q2: ClearTax for MSME, OfBusiness services and NSIC services.
  - Q1: energy audits, solar, insurance, packaging and safety audits.

  Each gap is marked **[GAP]** where it applies.
- Some sources disagree. For example, Peenya is described as both 8,500 units on 40 sq km and 13,500 units on 50 sq km. Both versions are recorded below with their sources.
- Statements marked **[UNVERIFIED – background knowledge]** come from general knowledge and have no source from this session.

---

## 1. Which services do Indian MSME manufacturers most need and struggle to find?

### 1.1 National survey evidence

**SIDBI, "Understanding Indian MSME Sector: Progress and Challenges" (May 2025; unabridged version July 2025)**
- Survey of 2,097 MSMEs across 19 sectors in manufacturing, services and trading. https://www.sidbi.in/uploads/Understanding_Indian_MSME_sector_Progress_and_Challenges_13_05_25_Final.pdf ; https://www.sidbi.in/uploads/publicationreport/Understanding-Indian-MSME-sector-Progress-and-Challenges%20-Unabridged-Version-07-07-2025.pdf
- Main challenge cited, by share of firms:
  - Access to credit: 22%
  - High competition: 18%
  - Inadequate infrastructure: 10%
  - Technology adoption: 8%
  - Regulatory compliance: 8%
  - Access to new markets: 6%

  Sources: https://www.sidbi.in/uploads/Understanding_Indian_MSME_sector_Progress_and_Challenges_13_05_25_Final.pdf ; https://c4scourses.in/sidbi/challenges-faced-by-indian-msmes-sidbi-report/
- 25% of MSMEs report a shortage of skilled manpower, worst in defence, garments, hotels and sanitaryware. https://visionias.in/current-affairs/news-today/2025-05-14/economy/understanding-indian-msme-sector-progress-and-challenges-report-released-by-sidbi ; https://cxotoday.com/press-release/sidbi-releases-report-titled-understanding-indian-msme-sector-progress-and-challenges/
- Addressable credit gap: 24%, about ₹30 lakh crore. It rises to 27% in services and 35% for women-owned MSMEs. (Same sources.)

**SIDBI MSME Outlook Survey (quarterly, about 1,200 MSMEs)**
- In Round 7 (Apr–Jun 2026), about 20% of manufacturing and services respondents said skilled-labour availability had got worse. Sentiment among manufacturers softened. Only 21% of manufacturers reported better net margins. https://www.tribuneindia.com/news/business/msme-business-confidence-declines-for-fourth-straight-quarter-cost-and-demand-pressures-weigh-sidbi/ ; https://newsarenaindia.com/economy/msmes-business-confidence-hit-for-4th-straight-quarter-sidbi/84093
- In Q1 FY2026, about a quarter of MSMEs reported better access to skilled workers, so the problem moves with the cycle but keeps returning. https://india.entrepreneur.com/en-in/news-and-trends/sidbis-latest-msme-outlook-survey-reflects-growing/495286

**NITI Aayog with Institute for Competitiveness, "Enhancing Competitiveness of MSMEs in India" (2 May 2025)**
- PDF: https://www.niti.gov.in/sites/default/files/2025-05/Enhancing_Competitiveness_of_MSMEs_in_India.pdf
- MSMEs struggle to use government schemes because of limited awareness. Many enterprises either do not know about state technology-upgradation schemes or cannot access them. https://www.drishtiias.com/daily-updates/daily-news-analysis/niti-aayog-report-on-msmes-in-india/print_manually ; https://factly.in/niti-aayogs-report-makes-multiple-recommendations-for-enhancing-competitiveness-of-msmes
- Only 6% of MSMEs use e-commerce. https://www.drishtiias.com/daily-updates/daily-news-analysis/niti-aayog-report-on-msmes-in-india/print_manually
- Between 2020 and 2024, the share of micro and small firms getting credit from scheduled banks rose from 14% to 20%. Only 19% of MSME credit demand was met formally by FY21, leaving about ₹80 lakh crore unmet. https://www.competitiveness.in/enhancing-msmes-competitiveness-in-india
- Over 90% of MSMEs are informal. Udyam had 95 lakh registrations against 6.34 crore MSMEs (at the time of the report). https://www.competitiveness.in/enhancing-msmes-competitiveness-in-india
- The report flags skill shortages and recommends aligning training with industry needs. (Same sources.)

**NITI Aayog / ASCI, "Achieving Efficiencies in MSME Sector Through Convergence of Schemes" (reported January 2025)**
- About 70% of MSMEs are unaware of available government schemes. 18 central schemes overlap. The report recommends one AI-powered central portal. https://www.uniindia.com/msmes-vital-for-india-s-economic-landscape-report/india/news/3707237.html

**TeamLease RegTech, "Decoding Compliance for Manufacturing MSMEs in India"**
- A typical single-state manufacturing MSME faces:
  - more than 1,450 regulatory obligations a year across seven areas of law
  - 48 registers to maintain
  - 59 types of inspectors
  - 486 imprisonment clauses, 66% of them in labour law
  - ₹13–17 lakh a year in compliance costs
- 9,331 regulatory changes in FY25, about 42 a day, and roughly 90% of them affect MSMEs.

  Sources: https://cxotoday.com/media-coverage/decoding-msme-compliance-over-rs-13-lakh-annual-burden-1000-regulations-and-50-risk-of-imprisonment/ ; https://caalley.com/news-updates/indian-news/msmes-burdened-by-high-compliance-costs-face-over-1-450-regulations-annually-report ; https://www.tribuneindia.com/news/business/regulatory-compliance-costs-weigh-heavily-on-small-businesses-annual-burden-hits-rs-13-17-lakh-report/
- India SME Forum estimates the GST Invoice Management System (IMS) adds about ₹1.5 lakh a year in compliance cost. https://taxonation.com/show-detail-news/2379636/msmes-fear-15-lakh-annual-burden-as-india-rolls-out-new-gst-invoice-management-system

**Testing and certification (BIS Quality Control Orders)**
- GTRI and press reports say testing costs and months-long backlogs at BIS-approved labs hit small firms hardest. One certification exercise cost about ₹16.5 lakh, close to the ₹25–30 lakh cost of building a lab. Some QCOs were revoked in October and November 2025. https://www.outlookbusiness.com/economy-and-policy/how-quality-testing-norms-are-squeezing-indian-msmes ; https://apparelresources.com/business-news/manufacturing/high-testing-costs-qcos-risk-squeezing-msmes-says-gtri/ ; https://www.outlookbusiness.com/economy-and-policy/govt-should-cap-charges-of-product-testing-under-quality-control-order-gtri

**Machine maintenance (evidence covers all of industry, not only MSMEs)**
- ABB "Value of Reliability" survey: 88% of Indian industrial businesses have an unplanned outage at least once a month, costing about ₹7 million an hour. 19% still run equipment until it fails. https://www.epcworld.in/abb-survey-reveals-unplanned-downtime-costs-inr-7-million-per-hour/
- A survey of more than 70 SME corrugated-box makers lists shortages of skilled workers and machine maintenance among its main problems. https://www.publishingindia.com/archive/jstr/challenges-faced-by-indian-msmes-a-survey-analysis-of-the-corrugated-box-manufacturing-industry

**Delayed payments, which create demand for legal and recovery services**
- MSME Samadhaan, as of 14 August 2026: 256,892 applications covering ₹55,244 crore. ₹20,979 crore is still pending, and about 40,580 cases (16%) have been unresolved for more than a year. https://intelligence.crisil.com/en/homepage/newsroom/press-releases/2026/08/executed-well-msme-bill-can-be-an-ibc-moment-for-delayed-payments.html ; https://www.newkerala.com/news/a/msme-bill-could-ibc-moment-delayed-payments-if-465.htm
- The 2026 MSMED Amendment Bill aims at faster dispute resolution. https://vinodkothari.com/2026/07/strengthening-msme-ecosystem-msmed-amendment-bill/

**Other sources requested**
- GAME (massentrepreneurship.org): its Delayed Payment 2.0 report (2023) informed the 45-day payment rule. It works on credit, formalisation and clusters. No services-demand survey was found. https://massentrepreneurship.org/wp-content/uploads/2025/11/GAME-Annual-Report-2024-2025-1.pdf
- LEAD at Krea: mostly research on women-led and rural enterprises (the STREE programme and the Business Readiness Scorecard). No manufacturing services-demand data was found. https://krea.edu.in/blog/business-readiness-scorecard-for-women-enterprises/
- **[GAP]** I found no services-demand data from IFC, FICCI, CII, LEDME or Peenya Industries Association surveys.

### 1.2 Ranked service categories (by strength of evidence)

| Rank | Category for the XELOR directory | Evidence | Strength |
|---|---|---|---|
| 1 | **Finance facilitation**: loan DSAs, bank MSME desks, CGTMSE-aware lenders, TReDS onboarding, CA help with loan files. XELOR connects only; it does not lend or collect. | SIDBI: credit is the top challenge (22%) with a ₹30 lakh crore gap. NITI: ₹80 lakh crore unmet demand. Only 24% of firms knew about CGTMSE (NILERD study). TReDS meets under 5% of demand. | Strong |
| 2 | **Compliance and licensing**: CA/GST/accounting, labour-law consultants, factory licence, KSPCB consent (CTE/CTO), fire NOC, occupancy and completion certificates (OC/CC), e-khata, Udyam | TeamLease: 1,450 obligations and ₹13–17 lakh a year. SIDBI: compliance 8%. KASSIA: OC/CC delays and e-khata. KSPCB: orange-category electroplating. ISF: IMS cost. | Strong |
| 3 | **Skilled manpower and staffing**: CNC/VMC operators, welders, contract labour agencies, ITI and NTTF placement cells | SIDBI: 25% short of skilled staff. Outlook Round 7: 20% say it got worse. NITI flags skills. Peenya CNC job posts. KASSIA: SMEs train school dropouts. | Strong |
| 4 | **Testing, certification and quality**: NABL labs, BIS/QCO consultants, ZED/ISO consultants, calibration labs | QCO cost and backlog (GTRI). 9.83 lakh firms registered for ZED. Peenya has ETDC/STQC, the BIS lab, TUV India, CMTI and the upcoming NSIC TCFC. | Medium–strong |
| 5 | **Machine repair, maintenance and MRO** (CNC service engineers, electricians, hydraulics, PLC) | ABB: 88% have a monthly unplanned outage. Venwiz raised $8.3M. Corrugated-box survey. Not MSME-specific. | Medium |
| 6 | **Job work and process subcontracting** (CNC, sheet metal, heat treatment, plating, surface finishing, tool and die) | Peenya has about 3,000 CNC units and about 800 chemical/electroplating units. Karkhana and Zetwerk exist. | Medium (supply side visible; demand-side survey missing) |
| 7 | **Logistics and transport** (tempo, truck, courier, ONDC logistics) | Peenya Industries Association (PIA): roads damage goods and raise logistics costs. SIDBI: infrastructure 10%. ONDC brought TCI and small fleets on board. | Medium |
| 8 | **Effluent, hazardous waste and scrap disposal** (authorised recyclers, ETP operators) | Peenya has had no CETP for more than 15 years. ₹10 crore sanctioned in 2018-19 lapsed. CEPI data. Garbage complaints. | Medium (Peenya-specific) |
| 9 | **Legal and delayed-payment recovery** (MSEFC filings, lawyers) | Samadhaan: 2.57 lakh cases, ₹55,244 crore. 16% older than a year. | Medium |
| 10 | **Technology, IT and digital** (ERP, e-commerce, automation integrators) | SIDBI: technology adoption 8%. NITI: 6% use e-commerce. | Medium–weak |
| 11 | **Market access and export documentation, CHA** | SIDBI: market access 6%. | Weak **[GAP]** |
| 12 | Energy audits and solar, insurance, safety audits, packaging | No evidence collected this session | **[GAP]** |

---

## 2. Existing services marketplaces and directories

### Private platforms

**Justdial (horizontal local search with paid listings and leads)**
- Free listing. Paid tiers (Platinum, Gold, Silver) buy ranking and badges. Plans are weekly to annual, with monthly ECS (auto-debit) plans. Packages run about ₹15,000 to ₹50,000+ a year depending on city and category. Some categories use cost-per-lead: one enquiry is sent to several competing providers who prepaid for leads. https://www.markhub24.com/post/justdial-s-local-search-monetization-model-1 ; https://www.outlookbusiness.com/markets/feature/wait-dont-justdial-379
- Q1 FY27 (to 30 June 2026): 639,200 active paid campaigns (+3.5% YoY), 56.1 million active listings (+13% YoY) and 41.7 million geocoded listings. https://www.businesstoday.in/amp/markets/stocks/story/just-dial-shares-jump-nearly-15-on-q1-fy27-earnings-details-here-542458-2026-07-13 ; https://www.kotakneo.com/news/stocks/just-dial-q1-fy27-results-kotak-neo-buy-13-july-2026/
- Complaints from 2020 to 2026 repeat the same themes:
  - "fake leads", where the customer says they never enquired
  - outdated, duplicate or irrelevant leads
  - sales staff promising 30–40 high-converting leads a month
  - ECS auto-debits continuing after cancellation

  Sources: https://www.consumercomplaints.in/justdial-com-complaint-against-justdial-for-poor-lead-quality-zero-business-conversion-unresponsive-support-and-continued-ecs-deductions-d-c3543240 ; https://www.consumercomplaints.in/justdial-com-stay-away-fake-leads-rude-support-and-unethical-practices-c3532793 ; https://voxya.com/consumer-complaints/false-advertisement-and-looted/263016

**Sulekha**
- Lead marketplace: free for consumers, providers pay for "verified, parameterised" leads. Subscriptions run about ₹10,000–40,000, with value-based lead prices by city and category. Some sources report commissions of up to 12%. https://www.markhub24.com/post/sulekha-s-performance-based-marketplace-model ; https://qz.com/india/1805932/how-sulekha-reinvented-itself-to-survive-in-era-of-ola-zomato
- Providers complain that leads stop after the subscription is paid, that leads never convert, and that rejecting a lead requires an undisclosed manual process. https://voxya.com/consumer-complaints/sold-the-leads-package-with-false-promises/253476 ; https://voxya.com/consumer-complaints/leads-not-delivered/24696

**Urban Company**
- A managed marketplace for consumers: about ₹1,144 crore revenue in FY2025 and 65,000+ professionals. B2B work for offices and co-working spaces is only described as "slowly developing", and I found no factory or industrial offering. https://thebrandhopper.com/featured-startups/urban-company-story-history-business-model-funding-growth/ ; https://en.wikipedia.org/wiki/Urban_Company

**IndiaMART (B2B products; services listed as "products")**
- Preferred Number Service (PNS): the seller gets a virtual number that rings up to 5 of their real numbers at once, hides those numbers from buyers, and claims "up to 95%" control of spam and telemarketing calls. A seller must add at least 3 numbers. https://help.indiamart.com/knowledge-base/preferred-number-service ; https://help.indiamart.com/knowledge-base/advantage-of-pns
- Q1 FY27:
  - 218,000 paying suppliers, a net loss of about 1,850
  - Silver-tier monthly churn about 7%, concentrated in the first 12 months
  - Silver sellers struggle against Gold and Platinum sellers, who get more visibility and leads
  - unique business enquiries down about 11% YoY, of which 4–5 points came from OTP-based bot filtering

  Sources: https://compoundingai.in/market-news/indiamart-q1-fy27-earnings-call ; https://inc42.com/buzz/indiamart-shares-sink-7-5-to-52-week-low-as-paid-supplier-concerns-mount/ ; https://quartr.com/events/indiamart-intermesh-limited-indiamart-q1-26-27_3PjDinW9
- Seller complaints: fake or irrelevant enquiries, the same lead sold to many sellers, ₹28,000–33,000 annual plans with no return, and no support after payment. https://www.trustpilot.com/review/m.indiamart.com?page=1 ; https://kimola.com/reports/indiamart-feedback-analysis-explore-business-insights-google-play-152188

**Zolvit (formerly Vakilsearch)**
- The compliance business was rebranded Zolvit in 2024, with Vakilsearch kept for legal services. Fixed-price catalogue of 350+ services, for example MSME registration at ₹1,999. Claims 5 lakh+ clients and 500+ experts. About $12M raised. https://lapaasvoice.com/startup/zolvit/ ; https://www.cbinsights.com/company/vakilsearch/
- Complaints: heavy follow-up until payment, then silence; a different person for each query; delays; refund disputes. One complaint site shows 37% satisfaction across 92 complaints. https://voxya.com/consumer-complaints/delay-process-payment-refund/235618 ; https://www.consumercomplaints.in/vakilsearch-legal-solutions-vakilsearch-paid-service-not-delivered-no-response-from-grievance-cell-c3536149

**IndiaFilings and LegalWiz**
- IndiaFilings sells fixed, transparent prices; claims 1.8 lakh businesses served and 800+ staff; is distributed through HDFC Bank's SME pages. https://app.dealroom.co/companies/indiafilings ; https://www.hdfcbank.com/sme/trade/tradexpress/registration-and-licensing/indiafilings
- LegalWiz (2020 prices): private limited registration ₹6,000, annual compliance ₹4,599, GST filing ₹799 a month. https://yourstory.com/2020/01/startup-bharat-legaltech-flipkart-instamojo-ahmedabad/amp

**[GAP]** I did not research ClearTax for MSME, OfBusiness services or NSIC's commercial services.

### Government channels

**SIDBI Udyami Mitra**
- Credit and handholding portal launched in 2017: 1.6 lakh+ lender branches plus 24,000+ "non-financial" handholding agencies (application filing, training, mentoring, subsidy help). Extended through CSC. This is the closest government version of a services directory, but there is no evidence it is used in clusters. https://development.sidbi.in/en/page/133 ; https://vikaspedia.in/social-welfare/entrepreneurship/udyamimitra-portal ; https://www.business-standard.com/article/news-cm/sidbi-launches-udyami-mitra-portal-117122700668_1.html

**MSME Samadhaan**
- Delayed-payment portal: large backlog (see §1.1).

**Udyam and Udyam Assist**
- 8.9 crore+ enterprises registered across the Udyam portal and Udyam Assist as of 14 July 2026. Udyam Assist brings in informal micro units without GST through banks and NBFCs. https://organiser.org/2026/07/15/369919/bharat/how-udyam-registration-and-udyam-assist-are-transforming-indias-msme-and-entrepreneurial-ecosystem/

**MSME Technology Centres and tool rooms**
- 18 existing centres (10 tool rooms and 8 technology development centres), plus 15 new ones under the World Bank-co-funded TCSP. https://www.vikaspedia.in/schemesall/schemes-for-entrepreneurs/skill-development-and-training/technology-centres-tool-rooms-technology-development-centres-
- New Bengaluru centre at Devanahalli: ₹156 crore, ESDM focus, about 10,000 trainees a year. Offers SMT lines, 5-axis and 3-axis CNC, EDM, additive manufacturing, testing and advisory. https://knnindia.co.in/news/newsdetails/msme/bengaluru-gets-rs-156-crore-msme-technology-centre-for-advanced-skills-esdm ; https://www.deccanherald.com/india/karnataka/tech-centre-near-airport-msmes-2246274

**District Industries Centres**
- An academic study recommends more awareness drives, simpler applications and faster responses. The RBI has asked for public views on whether DICs have met their objectives. https://pduamtulungia.co.in/upload/journal/1777886814.pdf ; https://rbi.org.in/Commonman/English/Scripts/PressReleases.aspx?Id=3049

**ONDC**
- TCI was the first B2B logistics player on ONDC. In October 2025, eight small logistics providers were digitised through ONDC FleetConnect, and more than 22 small fleet operators have joined. India Post joined as a logistics provider in January 2026. The MSME-TEAM scheme aims to bring 5 lakh MSMEs onto ONDC. https://itln.in/logistics/transport-corporation-of-india-to-go-live-on-ondc-1353872 ; https://knnindia.co.in/news/newsdetails/sectors/ondc-sees-strong-traction-in-fy26-focuses-on-scaling-digital-commerce-infrastructure ; https://www.drishtiias.com/state-pcs-current-affairs/india-post-delivers-first-ever-ondc-order-as-logistics-provider/print_manually

**Earlier SIDBI precedent: BDS market development**
- SIDBI adopted 19 clusters to build business development services (BDS) markets, with support from the World Bank, DFID, KfW and GIZ. A later BDS intervention covered 5 clusters. This shows a long-standing view that MSMEs cannot find service providers. https://development.sidbi.in/files/publicationreport/Implementing-Business-Development-Services-in-Chennai-Leather-Cluster.pdf ; https://www.crn.in/?p=45625

### What works and what fails (synthesis)

**Fails:**
- **Pay-per-lead and subscription-for-visibility models** (Justdial, Sulekha, IndiaMART Silver):
  - Providers are charged before any outcome, and the same lead is sold to several of them.
  - Ranking goes to whoever pays, not to quality.
  - Sales are aggressive, and auto-debit plans are hard to cancel.
  - New and low-tier sellers churn heavily (IndiaMART Silver: about 7% a month).
- **Lead fraud and bots.** IndiaMART had to add OTP checks, which cut enquiries by 4–5 points.
- **Weak service after payment** at aggregators that collect fees (Zolvit complaints).

**Works:**
- Fixed, published prices (IndiaFilings, Zolvit catalogues).
- Masked or virtual numbers that cut spam (IndiaMART PNS).
- Bank or partner distribution (HDFC with IndiaFilings; Udyam Assist through banks and NBFCs).

**Implication for XELOR:** a connect-only model that takes no money from MSMEs avoids the main complaint, paying for bad leads. XELOR still needs some other way to fund verification, and it should never sell rank.

---

## 3. Government schemes MSMEs miss

**General awareness**
- About 70% of MSMEs are unaware of government schemes (NITI/ASCI). https://www.uniindia.com/msmes-vital-for-india-s-economic-landscape-report/india/news/3707237.html
- NITI 2025 names low awareness as the main thing holding schemes back. https://www.drishtiias.com/daily-updates/daily-news-analysis/niti-aayog-report-on-msmes-in-india/print_manually
- Only 31% knew about Atmanirbhar Bharat schemes (post-lockdown survey). https://www.outlookbusiness.com/amp/story/news/over-50-of-microbusinesses-had-no-mechanisms-to-cushion-covid-impact-study-news-240235
- 24% of women entrepreneurs are unaware of schemes, and 34% have used none. https://india.entrepreneur.com/en-in/news-and-trends/24-of-women-entrepreneurs-unaware-of-government-schemes/480534

**CGTMSE**
- A NILERD study found only 24% of firms knew about CGTMSE and only 6.25% had applied. Study year not confirmed, possibly older. https://www.nilerd.ac.in/writereaddata/UploadFile/NILERD%20project%20report0MSME%20study%20in%20India_1632.pdf
- Ceiling raised from ₹5 crore to ₹10 crore from 1 April 2025, with lower fees. https://www.latestly.com/agency-news/india-news-centre-implements-credit-guarantee-scheme-for-msmes-mos-informs-lok-sabha-7529327.html/amp
- FY25 approvals were over ₹3 lakh crore, a record. https://cgtmse.in/Blogs/VS/4
- From 22–25 September 2026, CGTMSE covers 75% of default on MSE-to-MSE TReDS invoices (up to ₹2 crore per seller and ₹10 crore per buyer) on M1xchange, RXIL and DTX/KredX. https://www.gktoday.in/treds-gets-cgtmse-backed-guarantee-cover/ ; https://www.policyedge.in/p/government-guarantee-goes-live-for-small-firms-invoice-financing-on-treds

**TReDS**
- Companies with turnover above ₹250 crore, and CPSEs, had to register by 31 March 2025 (notification of 7 November 2024; the threshold was previously ₹500 crore). https://www.vjmglobal.com/blog/companies-with-turnover-more-than-inr-250-crores-have-to-get-registered-on-treds-by-31st-march-2025
- About 1,35,093 MSME sellers were registered by 31 March 2025, against crores of MSMEs. TReDS meets under 5% of MSME credit demand. https://www.impriindia.com/?p=75105 ; https://finbox.substack.com/p/can-treds-pull-some-threads-to-capture

**ZED certification**
- As of 31 July 2026: 9,83,003 registered and 7,03,585 certified, mostly at Bronze level (about 6.67 lakh Bronze, 6,700 Silver, 4,800 Gold as of 7 July 2026).
- Women-owned MSMEs get a 100% subsidy (since 11 November 2023).
- Testing and certification support covers up to 75% of cost, capped at ₹50,000.
- Few firms move beyond Bronze, which suggests they lack consultants to take them further (this is an inference).

  Sources: https://knnindia.co.in/news/newsdetails/msme/703-lakh-msmes-receive-zed-certification-as-govt-pushes-sustainable-manufacturing ; https://ddindia.co.in/2026/08/over-6-7-lakh-msmes-certified-under-zed-initiative-to-enhance-global-competitiveness/ ; https://indianmasterminds.com/news/zed-certification-women-msme-subsidy-221441/

**Lean (MSME Competitive LEAN scheme)**
- Visibility and uptake are low. Pilot results: 347 units saved ₹98 crore, productivity rose by up to 27%, and defects fell by 73%. https://yourstory.com/smbstory/lean-scheme-manufacturing-msmes-growth-global-competition ; https://protium.co.in/98-36-crore-saved-73-percent-fewer-defects/

**PMEGP**
- About 9.65 lakh units assisted up to July 2024, with ₹25,263 crore in margin money. Government says it uses technical experts and bank officials as handholders. https://eparlib.nic.in/bitstream/123456789/2978890/1/AU1743_yUrmzU.pdf

**[GAP]** I found no awareness numbers for MSE-CDP, CLCSS or its successors, or the state (Karnataka) Industrial Policy 2025-30 incentives. KASSIA says the 2025-30 investment subsidies are limited to micro and small industries in Bengaluru Rural district. https://cmrindia.com/?p=30735

**Product implication:** a "scheme navigator" that links to vetted consultants (CA, ZED, Lean, CGTMSE/TReDS facilitators) is backed by the evidence on low awareness. XELOR must never take a success fee out of a subsidy flow, because that would mean handling money.

---

## 4. Connect-only models and trust signals

**What was gathered**
- IndiaMART PNS: virtual number linked to up to 5 real numbers, real numbers hidden, spam control "up to 95%" (see §2).
- IndiaMART OTP verification of buyers cut enquiries by 4–5 points of an 11% YoY fall. This shows the cost of filtering bots, and that it is worth paying. https://compoundingai.in/market-news/indiamart-q1-fy27-earnings-call
- Sulekha markets "verified, parameterised" leads, i.e. it qualifies the requirement before matching. https://www.markhub24.com/post/sulekha-s-verified-service-provider-model-from-digital-classifieds-to-intelligent-matchmaking
- Justdial badges are bought rather than earned, which explains complaints that ranking does not reflect quality. https://www.markhub24.com/post/justdial-s-local-search-monetization-model-1

**[GAP]** Exotel and Knowlarity number masking (pricing, call-recording consent), WhatsApp Business API click-to-chat, research on how much verified-job reviews or response-time SLAs increase trust, and Google or Urban Company verification models were not researched because the search budget ran out.

**[UNVERIFIED – background knowledge]** The following need confirming:
- Exotel and Knowlarity both sell virtual numbers and call masking to Indian marketplaces such as ride-hailing and delivery apps.
- WhatsApp Business Platform charges per conversation or template message.
- Urban Company publishes ratings only from completed bookings.

**Design implications, given the evidence that pay-per-lead fails:**
1. Masked click-to-call and WhatsApp deep links, with logs of who contacted whom.
2. Reviews allowed only from verified contacts (a logged call or chat followed by the MSME confirming the job).
3. Badges earned through checks (GST/Udyam, NABL scope, licence numbers), never bought.
4. Response-time scores.
5. No ranking sold to providers.

---

## 5. Peenya and Bengaluru cluster evidence

### Scale
- One source: 8,500 units on 40 sq km with ₹20,000 crore annual turnover. Within that, the CNC cluster has about 3,000 units, 24,000 workers and ₹1,200 crore turnover. https://www.outlookbusiness.com/specials/state-of-the-economy-2018/sitting-tight-4189 (2018 figures)
- Another source: about 13,500 industries on 50 sq km, including about 800 chemical and electroplating units. https://www.etvbharat.com/en/!bharat/peenya-south-asias-largest-industrial-cluster-cries-for-urgent-govt-attention-enn25062104909 (June 2025)
- **The two counts conflict. Confirm with PIA before quoting either.**

### Pain points reported
- **Roads and logistics.** In September 2025, PIA wrote to Deputy CM D K Shivakumar. Potholes in KIADB and KSSIDC areas and more than 25 adjoining private estates are damaging goods and "precision machinery", delaying materials, raising logistics costs, and pushing some firms to consider moving to other states. https://www.theweek.in/wire-updates/national/2025/09/20/mes15-ka-peenya-letter.html
- **Waste and effluent.** Industries have sought a CETP for more than 15 years. ₹10 crore sanctioned in 2018-19 lapsed. Garbage is not collected.
  - CEPI plan: 334 red, 473 orange and 1,294 green units. KSPCB data: 136, 261 and 909.
  - Effluent: 1,458 KLD, of which 55 KLD is treated outside the area.

  Sources: https://deccanherald.com/india/karnataka/bengaluru/anatomy-of-industrial-pollution-3162636 ; https://www.etvbharat.com/en/!bharat/peenya-south-asias-largest-industrial-cluster-cries-for-urgent-govt-attention-enn25062104909
- **Governance.**
  - Peenya was declared a Special Investment Region / industrial township, with 70% of local taxes to go back into local infrastructure. https://www.deccanherald.com/india/karnataka/bengaluru/peenya-industrial-area-gets-spl-investment-region-status-hopes-float-for-good-infra-3581893
  - The decision was rolled back in May 2026, and Peenya returned to the Greater Bengaluru Authority (GBA). Former PIA president R Shiva Kumar said nothing changed on the ground and the promised committee was never formed. https://ibcworldnews.com/2026/05/29/peenya-back-under-gba-as-govt-rolls-back-industrial-township-plan/
- **Karnataka-wide MSME issues (KASSIA).**
  - Over 90% of SMEs operate in private industrial layouts with poor infrastructure.
  - Delays in OC/CC.
  - Faulty e-khata.
  - Land pricing and KIADB matters.
  - One minimum-wage policy for all industries, although SMEs train school dropouts.
  - In response, Chief Secretary Shalini Rajneesh set a 15-day deadline for departments, including action on delayed electricity connections.

  Sources: https://cmrindia.com/kassia-announces-platinum-jubilee-celebration-lists-top-10-challenges-for-msmes ; https://deccanherald.com/business/karnataka-chief-secretary-sets-15-day-deadline-to-address-msme-issues-4096427
- **Skills.** Ongoing CNC/VMC operator hiring in Peenya, for example 50 openings at ₹15,000–45,000 a month. https://www.teamlease.com/jobs/vmc-cnc-operators-recruitment-in-bangalore-1789980

### Common facilities and service institutions in or near Peenya

These are first targets for "anchor" listings.

| Facility | What it offers | Source |
|---|---|---|
| **NSIC Technology-cum-Common Facility Centre, Peenya** | Foundation stone laid 12 May 2026; about ₹46 crore. Material-testing labs, common facilities, skilling, incubation, automation and drones. | https://www.constructionworld.in/amp/latest-construction-technology/nsic-technology-cum-common-facility-centre-foundation-stone-laid-at-peenya/91628 ; https://nsic.co.in/Media/Details/4311 |
| **ETDC Bengaluru (STQC)**, Peenya 100 Ft Road | ISO/IEC 17025-accredited testing, calibration and training since 1983 | https://stqc.gov.in/etdc-bengaluru |
| **BIS Bangalore laboratory**, Peenya, Tumkur Road | Chemical, electrical, mechanical and microbiology testing | https://www.bis.gov.in/who-we-are-bnbol/?lang=en |
| **TUV India (TUV Nord)** lab, Plot 105, Peenya 3rd Phase | Electronics, electrical and industrial machinery testing | https://www.tuv-nord.com/in/en/tuv-india-electronics-electrical-industrial-machinery-product-testing-laboratory/ |
| **CMTI, Bengaluru** | Three new testing and certification facilities opened 12 February 2026; ball-screw technology transferred to Jyoti CNC | https://machinist.in/2026/02/cmti-inaugurates-three-testing-facilities-and-transfers-high-speed-ball-screw-technology-to-jyoti-cnc/ |
| **KSPCB head office** | Located in Peenya; issues CTE and CTO. Electroplating in industrial estates is orange category. | https://lexplosion.in/karnataka-state-pollution-control-board-includes-new-industrial-sectors-under-orange-category/ |
| **MSME Technology Centre, Devanahalli** | See §2 | |

**[UNVERIFIED – background knowledge]** GTTC (Government Tool Room and Training Centre), NTTF and several ITIs operate in or near Peenya. MSME-DFO Bengaluru is in Rajajinagar. Confirm these before listing.

---

## 6. Startups building service marketplaces for manufacturers

- **Venwiz** (Bengaluru): SaaS-enabled marketplace for capex and MRO industrial services. Raised $8.3M Series A led by Sorin Investments. The most direct comparable for "find a maintenance or industrial service vendor". https://news.ventureintelligence.com/private-equity/industrial-services-saas-marketplace-venwiz-raises-$8.3-m-led-by-sorin-investments
- **Karkhana.io**: custom manufacturing platform covering CNC, moulding, casting, forging and 3D printing. Raised $6.3M Series A in January 2024 (Arkam, SIG), aiming to work with 3,000 MSME suppliers in 3 years. It is a managed model: it takes the order and pays suppliers, unlike XELOR. https://www.vertexventures.sg/news/vertex-ventures-southeast-asia-and-indias-portfolio-karkhanaio-raised-series-a-funding-of-usd-63-million/
- **Zetwerk**: B2B manufacturing marketplace (fabrication, machining, casting, forging). The Series B was $32M; it has since become a large, contract-manufacturer-style business. https://techcrunch.com/?p=1922281
- **Frigate**: on-demand cloud manufacturing (fabrication, 3D printing, CNC). $175K pre-seed. https://entrackr.com/?p=71979
- **Metal Market**: custom manufacturing and metals trading with 100+ vendors. https://jobs.weekday.works/vendor-development-technical-sourcing-at-metal-market-wkdy9xabl1
- **IndustryBuying**: MRO products, not services. https://inc42.com/flash-feed/industrybuying-com-funding/

**Pattern:** funded players in India are **managed marketplaces** that hold the order and the money (Zetwerk, Karkhana) or **enterprise procurement SaaS** (Venwiz). I found **no funded connect-only directory of services for small factories in a cluster**. That gap is XELOR's opening, though it may also mean the model is hard to monetise.

**[GAP]** Post-2024 outcomes (revenue, shutdowns, pivots) and global comparables (e.g. Thomasnet, Xometry, MaintainX's vendor network) were not researched.

---

## 7. Recommendations for the XELOR Marketplace services directory

1. **Launch categories for Peenya, in this order:**
   1. CA/GST and compliance (including factory licence, KSPCB, fire NOC and OC/CC agents)
   2. Skilled manpower and contract labour agencies
   3. Testing and calibration labs (start with ETDC, BIS, TUV, CMTI and NSIC TCFC as anchors)
   4. Machine repair and electricians
   5. Job work and surface treatment
   6. Transport
   7. Waste and scrap (authorised recyclers)
   8. Finance facilitators (bank MSME desks, TReDS platforms, CGTMSE-aware lenders), with no money flowing through XELOR
2. **Avoid the Justdial/IndiaMART traps:** no pay-per-lead, no paid ranking, no auto-debit plans. Use masked calls and WhatsApp, with every contact logged.
3. **Trust layer:**
   - Check GST and Udyam numbers, NABL or BIS lab scope, and licence numbers.
   - Collect reviews only after a logged contact plus the MSME confirming the job.
   - Show response-time scores.
4. **Scheme navigator:** use the 70% unaware figure. Pair each scheme (ZED, CGTMSE, TReDS, Lean, PMEGP) with listed consultants and official links. Do not imply savings. Label any illustrative figures as synthetic, per CLAUDE.md.
5. **Data gaps to close with primary research in Peenya:** a short PIA/KASSIA member survey asking "Whom did you struggle to find in the last 6 months?" No published Peenya-specific services-demand survey was found.
