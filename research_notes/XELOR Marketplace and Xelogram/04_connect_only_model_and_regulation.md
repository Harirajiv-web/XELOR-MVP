# 04 — Connect-only model and Indian regulation (XELOR Marketplace and Xelogram)

Researched 3 October 2026. **This is research, not legal advice.** Before launch, a practising Indian lawyer and CA should confirm every conclusion, especially those marked uncertain.

## How to read these notes (evidence labels)

- **[V]**: found through web search this session. The text comes from search-result extracts of the cited pages (law-firm briefings, government press items, news), not from a full read of the primary instrument.
- **[S]**: taken from sibling XELOR research notes in this repo (`research_notes/Accelerator startups like XELOR/india_programs_and_incumbents.md`). Not re-verified this session.
- **[B]**: background knowledge, **not verified this session**. Treat as a lead to check. Where a URL is given for [B] items, it is a starting point and may not be exact.

**Method limitations, stated plainly.** The egress proxy blocked every WebFetch attempt, including indiacode.nic.in, rbi.org.in, trai.gov.in, pib.gov.in, gstcouncil.gov.in, khaitanco.com, mondaq.com, taxguru.in, taxtmi.com, ikigailaw.com, vinodkothari.com, ondc.org, wikipedia.org and developers.facebook.com. So no primary instrument was read in full. The session's shared web-search budget (200 calls) also ran out partway through. Questions 1–4 are well covered by search evidence [V]. Questions 5, 6 and 7 rely more on [S] and [B] material and need a follow-up pass with fresh search budget and primary-source access.

---

## Executive summary

1. **Payments (RBI):** if no customer funds pass through XELOR, XELOR is not running a Payment Aggregator business and needs no RBI PA authorisation. Under the PA Master Direction (15 Sep 2025), non-bank PAs need authorisation and ₹15 crore net worth at application (₹25 crore within three years). PAs cannot run marketplaces. Pure tech/routing gateways that never touch funds are out of scope. [V]
2. **GST TCS (Section 52):** XELOR is still an "electronic commerce operator" under Section 2(45). But TCS applies only where the operator collects the consideration. On 9 Mar 2026 the Karnataka High Court quashed DGGI proceedings against Udaan (Hiveloop) on exactly this point. The TCS rate has been 0.5% since 10 Jul 2024. [V]
3. **Income-tax TDS (194-O, now Section 393(1) of the Income-tax Act 2025 from 1 Apr 2026):** **this is the main residual risk.** The deeming proviso treats direct buyer-to-seller payments as paid by the e-commerce operator **if the operator "facilitated" the sale**. A pure discovery/lead platform has a good argument that it facilitates no sale. Platform-side ordering, PO award or checkout would weaken that argument. Rate is 0.1% since 1 Oct 2024. [V] Take tax advice before adding any order or PO flow to the marketplace.
4. **Consumer Protection (E-Commerce) Rules 2020 and Dark Patterns Guidelines 2023:** a buyer purchasing for "commercial purpose" is not a "consumer", so pure B2B is largely outside scope. But small proprietors buying for self-employment livelihood can still be consumers, so follow the rules as good practice. [V]
5. **FDI:** marketplace e-commerce and B2B e-commerce take 100% FDI under the automatic route. Press Note 3 (2026) newly allows an inventory model, but only for exports of Indian-made goods. [V]
6. **Intermediary law:** XELOR qualifies for Section 79 safe harbour if it follows the due-diligence rules. Xelogram's follow/share/post features probably make XELOR a **"social media intermediary"**. It becomes a *significant* SMI only at **50 lakh registered users**. The 10 Feb 2026 amendment (in force 20 Feb 2026) adds AI-content labelling, 3-hour takedowns on government/court orders, and grievance resolution in 7 days (down from 15). [V]
7. **DPDP:** the Rules were notified 13/14 Nov 2025. Consent managers start 13 Nov 2026 and full obligations apply from **13 May 2027**. A proposal to pull the full deadline forward to Nov 2026 had not been notified as of Sep 2026. A proprietor's phone number is personal data: publish it only with notice and consent, and prefer number masking. [V]
8. **Calls and messages:** the TRAI TCCCPR amendment of 12 Feb 2025 requires the 140 series for promotional calls and 1600 for service/transactional calls, and bars ordinary 10-digit numbers for telemarketing. The Third Amendment (18 Sep 2026) adds AI-based spam detection, A2P/robocall rules and complaint-triggered action. Business-initiated WhatsApp messages need templates and opt-in, and are priced per message. [V]
9. **Early payment:** the line does not conflict with "never handle money" **if** XELOR acts only as a referral/tech partner. TReDS settles financier to MSME. Under RBI Digital Lending rules, an LSP must never sit in the fund flow. If XELOR is an LSP it takes on LSP duties: lender disclosure, fee paid by the lender, data limits, grievance officer. [B/S]
10. **ONDC:** technically possible as a buyer or seller app for B2B, with the MSE-TEAM scheme incentivising MSE onboarding. But ONDC orders carry payment collection and tax roles that cut against connect-only. Treat it as a phase-2 channel. [S/B]

---

## Q1. Legal advantages of a connect-only marketplace

### 1.1 RBI: Payment Aggregator authorisation

- **Current instrument.** RBI issued the consolidated *Reserve Bank of India (Regulation of Payment Aggregators) Directions, 2025* on 15 Sep 2025. They replace the 2020 PA/PG guidelines and later drafts. [V] — [AZB](https://www.azbpartners.com/bank/rbi-issues-consolidated-reserve-bank-of-india-regulation-of-payment-aggregators-directions-2025/); [Cyril Amarchand client alert](https://www.cyrilshroff.com/wp-content/uploads/2025/10/Client-Alert-RBI-Introduces-Consolidated-Framework-for-Payment-Aggregators-3.pdf); [Khaitan ERGO, 3 Oct 2025](https://www.khaitanco.com/sites/default/files/2025-10/ERGO%20-%20PA%20Master%20Directions%20-%203%20Oct%202025.pdf); [IndiaCorpLaw](https://indiacorplaw.in/2025/10/09/decoding-rbis-overhaul-of-the-payment-aggregator-directions/)
- **Three categories:** PA-Physical, PA-Online and PA-Cross Border. Every non-bank PA must get RBI authorisation (applications go through the Pravaah portal); banks are exempt. Physical PAs not previously regulated had to apply by 31 Dec 2025, and those not authorised by 28 Feb 2026 must wind up. [V] — [Lexology analysis](https://www.lexology.com/library/detail.aspx?g=af61fdc7-86f3-4c79-b7e2-669c3cee88c4); [Vinod Kothari highlights](https://vinodkothari.com/wp-content/uploads/2025/09/Key-Highlights-of-PA-2025-2.pdf)
- **Definition and net worth.** A PA aggregates customer payments to merchants and then settles the collected funds to the merchant. A non-bank needs ₹15 crore net worth when it applies and ₹25 crore by the end of the third year. [V] — [Mondaq](https://www.mondaq.com/india/financial-services/1727528/rbi-master-direction-on-digital-payment-aggregators-understanding-compliance-requirements-and-industry-implications); [Nasscom analysis](https://community.nasscom.in/communities/public-policy/analysis-rbi-issues-master-direction-regulation-payment-aggregators)
- **Marketplaces.** PAs may not run a marketplace business. Under the 2020 guidelines, marketplaces offering PA services had to stop by 30 Jun 2021 or move the PA business into a separate, authorised entity. [V] — [Trilegal on 2020 guidelines](https://trilegal.com/knowledge-repository/rbis-guidelines-on-regulation-of-payment-aggregators-and-payment-gateways/); [AuthBridge](https://authbridge.com/blog/rbi-payment-aggregator-master-direction-2025/)
- **Technology-only gateways** that route transactions without touching funds are out of PA scope. [V] — [Mondaq](https://www.mondaq.com/india/financial-services/1727528/rbi-master-direction-on-digital-payment-aggregators-understanding-compliance-requirements-and-industry-implications)
- **Statutory basis.** Section 4 of the Payment and Settlement Systems Act 2007 says no one other than RBI may operate a payment system without RBI authorisation. A "payment system" is one that enables payment between payer and beneficiary through clearing, payment or settlement. [V] — [PSS Act PDF (DFS)](https://financialservices.gov.in/beta/sites/default/files/2022-10/5.%20THE%20PAYMENT%20AND%20SETTLEMENT%20SYSTEMS%20ACT,%202007.pdf)
- **What this means for XELOR.** If buyers pay sellers directly (bank transfer, UPI to the seller's VPA, the seller's own PA link) and XELOR never receives, holds or splits buyer funds, XELOR runs no payment system and is not a PA. That avoids ₹15–25 crore net-worth capital, nodal/escrow accounts, PA KYC and audit. Two cautions [B]:
  - Collecting **XELOR's own subscription or boost fees** through a licensed PA (Razorpay, Cashfree and others) is ordinary merchant activity and does not make XELOR a PA.
  - Avoid "collect on behalf of seller", wallets, escrow, split settlement, or "pay through XELOR for protection". Each puts XELOR back in the funds flow, with PA, GST TCS and 194-O consequences.

### 1.2 GST: TCS under Section 52 CGST Act

- **Definition.** Section 2(45) CGST defines an electronic commerce operator as "any person who owns, operates or manages digital or electronic facility or platform for electronic commerce". A listing platform therefore **is** an ECO by definition. [V] — [ICAI Kochi material](https://kochiicai.org/uploads/events/materials/EKM-ICAI--material-413258.pdf); [CBIC e-commerce FAQ (GST Council)](https://gstcouncil.gov.in/sites/default/files/2024-02/faq-e-commerc.pdf)
- **When TCS applies.** Section 52 requires TCS on the net value of taxable supplies made through the ECO by other suppliers **"where the consideration with respect to such supplies is to be collected by the operator"**. [V] — [TaxTMI](https://www.taxtmi.com/article/detailed?id=16412)
- **Key 2026 ruling.** In *Hiveloop Technology Pvt Ltd (Udaan) v. Additional Director, DGGI* (Karnataka HC, WP No. 21130/2022, order dated **9 Mar 2026**), the court held that an ECO that only provides the platform and does not collect consideration is not liable to collect TCS. It also held that Section 74 proceedings against such an operator lack jurisdiction, and quashed the show-cause notice. [V] — [A2Z Taxcorp](https://a2ztaxcorp.net/no-liability-of-tcs-in-gst-on-e-commerce-operator-not-collecting-consideration/); [CAclubindia](https://www.caclubindia.com/judiciary/no-liability-of-tcs-in-gst-on-e-commerce-operator-not-collecting-consideration-5981.asp); [TaxGuru](https://taxguru.in/?p=1042596). *Uncertain:* whether the Department has appealed. Not checked.
- **Rate history.** Notification 15/2024-Central Tax (10 Jul 2024), following the 53rd GST Council meeting, cut TCS from 1% to **0.5%** (0.25% CGST + 0.25% SGST, or 0.5% IGST). [V] — [Taxmann](https://taxmann.com/post/?p=73256); [TaxGarden 2026 guide](https://taxgarden.in/blog/gst-on-ecommerce-operators-tcs-section-52-india-2026)
- **Registration** [B]: Section 24(x) compulsory registration applies to ECOs *required to collect TCS*. A connect-only XELOR registers under the normal threshold rules for its own services, and charges GST (generally 18%) on subscriptions, boosts and badges. Section 9(5) (the ECO pays tax on specified services such as passenger transport, accommodation and restaurant services) does not apply to industrial B2B listings.
- **Design rule.** Don't let buyers pay through XELOR. If XELOR later offers "pay on platform", TCS registration and filing (GSTR-8) follow.

### 1.3 Income tax: Section 194-O TDS, now Section 393(1) of the Income-tax Act 2025

- **Rate.** The Finance (No. 2) Act 2024 cut the rate from 1% to **0.1%** from **1 Oct 2024**. It is 5% without PAN/Aadhaar under 206AA. An individual/HUF participant with gross sales of ₹5 lakh or less who has furnished PAN/Aadhaar is exempt. [V] — [TaxGuru](https://taxguru.in/income-tax/section-194-o-amendment-lower-tds-rate-e-commerce-payments.html); [ClearTax](https://cleartax.in/s/section-194o)
- **New Act.** From **1 Apr 2026** the provision sits in **Section 393(1), Table Sl. No. 8(v)** of the Income-tax Act 2025, still at 0.1% of gross sales "facilitated" through the operator's platform. [V] — [TDSMAN, Jul 2026](https://blog.tdsman.com/2026/07/tds-on-e-commerce-transactions-section-3931-194o/); [TaxGarden FY26-27 guide](https://taxgarden.in/blog/tds-on-ecommerce-payments-section-194o-393-guide-india-fy-2026-27)
- **The trap: the deeming proviso.** "Any payment made by a purchaser of goods or services directly to an e-commerce participant for the sale of goods or provision of services or both, **facilitated by an e-commerce operator**, shall be deemed to be the amount credited or paid by the e-commerce operator". So not touching money does **not** by itself remove 194-O. What matters is whether the platform "facilitates" the *sale*. [V] — [Taxmann](https://www.taxmann.com/post/blog/tds-on-payment-by-e-commerce-operator-to-participants); [Indian Kanoon text of 194O](https://indiankanoon.org/doc/72905898/)
- **Analysis** [B, uncertain]:
  - A discovery or lead platform, where the buyer contacts the seller and the deal is negotiated, ordered, invoiced and paid off-platform, has a strong argument that no sale is facilitated through its "digital or electronic facility". The platform also cannot know the sale value, which makes deduction impossible. The prevailing view is that directory and lead platforms (IndiaMART's lead model, JustDial) are not treated as 194-O deductors for off-platform deals. This was **not verified this session**.
  - Risk rises if XELOR Marketplace lets buyers place orders, award RFQs, generate POs or e-invoices for a counterparty found on the marketplace, or track delivery against an order. XELOR's ERP does all of these, which blurs the line. Two mitigations: keep marketplace discovery and ERP procurement contractually and technically distinct (the ERP is the buyer's own tool, licensed SaaS), and get a written opinion.
  - CBDT Circulars 17/2020 and 20/2023 (on multi-ECO models such as ONDC) are relevant and should be read before any ONDC integration. [B]

### 1.4 Consumer Protection (E-Commerce) Rules 2020

- Under the Consumer Protection Act 2019, a "consumer" excludes anyone who buys for commercial purpose, except goods bought exclusively to earn a livelihood through self-employment. So the E-Commerce Rules usually don't govern company-to-company purchases. Sole proprietors and entrepreneurs buying for self-employment can still be consumers, and a B2B platform is then liable to that extent. [V] — [Trilegal](https://trilegal.com/knowledge-repository/consumer-protection-e-commerce-rules-2020/); [Trilegal PDF](https://trilegal.com/wp-content/uploads/2021/11/Consumer-Protection-E-Commerce-Rules-2020.pdf)
- The Rules cover marketplace and inventory e-commerce entities across all goods and services, and their B2B applicability is acknowledged to be unclear. [V] — [Mondaq](https://www.mondaq.com/india/dodd-frank-consumer-protection-act/995148/the-consumer-protection-e-commerce-rules-2020)
- **Practical stance.** Comply voluntarily with the low-cost marketplace duties [B]: seller identity and address display, a grievance officer, ranking-parameter disclosure, no manipulated reviews, and labelling of paid boosts. They match the Xelogram trust story anyway.

### 1.5 Dark Patterns Guidelines 2023 and the 2025 advisory

- CCPA notified the Guidelines under Section 18 CPA on **30 Nov 2023**. They list 13 dark patterns, including false urgency, basket sneaking, confirm shaming, forced action, subscription trap, interface interference, bait and switch, drip pricing, **disguised advertisement**, nagging, trick question, SaaS billing and rogue malware. They are CPA-based, so purely B2B dealings fall outside them. [V] — [JSA](https://www.jsalaw.com/newsletters-and-updates/ccpa-issues-guidelines-for-prevention-and-regulation-of-dark-patterns-2023/); [SCC Online](https://www.scconline.com/blog/post/2023/12/04/ccpa-notifies-guidelines-for-prevention-and-regulation-of-dark-patterns-2023-legal-news/)
- On **5 Jun 2025**, a CCPA advisory asked e-commerce platforms to self-audit for dark patterns within three months and encouraged self-declarations. [V] — [AZB](https://www.azbpartners.com/bank/central-consumer-protection-authority-issues-advisory-to-e-commerce-platforms-for-self-audit-to-detect-dark-patterns-on-their-platforms/); [IndiaLaw](https://www.indialaw.in/blog/civil/ccpas-dark-patterns-mandates-self-audit/)
- **Relevance.** Boosted posts and listings in Xelogram must be clearly labelled "Sponsored"; unlabelled ones are a "disguised advertisement". Subscription auto-renewals must be easy to cancel ("subscription trap", "SaaS billing").

### 1.6 FDI: marketplace model

- 100% FDI is allowed under the automatic route in B2B e-commerce and the marketplace model. FDI in inventory-based e-commerce is prohibited. Press Note 2 (2018), effective 1 Feb 2019, bars marketplace entities from owning or controlling inventory and from influencing prices, and caps any single vendor group at 25% of sales. [V] — [Mondaq](https://www.mondaq.com/india/contracts-and-commercial-law/686860/fdi-in-e-commerce); [Morgan Lewis](https://www.morganlewis.com/pubs/india-proposes-changes-to-fdi-policy-for-ecommerce-sector)
- **2026 change.** DPIIT **Press Note No. 3 (2026 Series), 23 Jul 2026**, lets e-commerce entities with FDI run an inventory model **only for exporting** goods made in India. DGFT operational notifications followed on 5 Aug 2026. Domestic inventory sales stay prohibited. [V] — [EY alert](https://www.ey.com/en_in/technical/alerts-hub/2026/09/dpiit-permits-foreign-investment-in-export-oriented); [India Briefing](https://www.india-briefing.com/news/india-fdi-inventory-based-e-commerce-exports-rule-change-46324.html/); [Mondaq](https://www.mondaq.com/india/international-trade-investment/1828958/dpiit-permits-inventory-based-e-commerce-model-for-export-of-manufacturedproduced-goods-domestically)
- **For XELOR** [B]: a connect-only platform that never takes title, sets prices or holds stock fits comfortably within the marketplace model, and arguably is just an IT/SaaS service. Investors from countries sharing a land border with India (Press Note 3 of 2020) still need government approval.

### 1.7 Pending and draft frameworks

- **Digital India Act** (to replace the IT Act 2000): announced 2023. As of 2026, consultations continue and no Bill has been introduced (status per secondary sources; *uncertain*). [V] — [Vidhi](https://vidhilegalpolicy.in/blog/explained-the-digital-india-act-2023/); [Legal500 on 2026 drafts](https://www.legal500.com/intelligence/india/media-telecoms-it-entertainment/from-safe-harbour-to-command%E2%80%91and%E2%80%91control-how-indias-2026-it-rules-draft-turns-intermediary-compliance-into-real%E2%80%91time-obedience)
- **National e-commerce policy:** no finalised policy was found this session. *Uncertain.*

---

## Q2. Intermediary obligations (IT Act s.79, IT Rules 2021)

### 2.1 Safe harbour (Section 79)

[B] Section 79 protects an intermediary from liability for third-party information if three conditions hold:
- its role is limited to providing access, transmission or hosting;
- it does not initiate the transmission, select the receiver, or select or modify the information;
- it observes due diligence (the IT Rules) and removes unlawful content on "actual knowledge". *Shreya Singhal v. Union of India* (2015) read "actual knowledge" as a court order or government notification.

Safe harbour is lost if the intermediary conspires in, abets or induces the unlawful act. *(The indiacode page could not be fetched.)* Takedown orders under s.79(3)(b) can now be issued only by officers of Joint Secretary rank or above (Director where no JS exists) or police DIG rank. Orders must state the legal basis and the specific URL, and are reviewed monthly by a Secretary-level officer. This came from the amendment to Rule 3(1)(d), effective **15 Nov 2025**. [V] — [Storyboard18](https://www.storyboard18.com/digital/only-joint-secretaries-and-dig-rank-officers-can-issue-content-takedown-orders-meity-82947.htm); [Legal500 / Anand & Anand](https://www.legal500.com/developments/thought-leadership/understanding-the-2025-amendment-to-indias-intermediaries-rules/)

### 2.2 Baseline due diligence (Rule 3) for every intermediary

[V unless marked]
- A Grievance Officer must acknowledge complaints within 24 hours. Resolution was due within 15 days, cut to **7 days** by the 2026 amendment. Grievances about unlawful content: 72 hours → **36 hours**. Nudity/CSAM/NCII-type content: 24 hours → **2 hours**. Government- or court-flagged unlawful content must come down within **3 hours** (previously 36). [V] — [iPleaders](https://blog.ipleaders.in/it-rules-2026/); [Lexology](https://www.lexology.com/library/detail.aspx?g=3e894ffc-4e0b-4487-a5e9-015d490d45d3); [PolicyCircle](https://www.policycircle.org/policy/it-rules-amendment-3-hour/)
- **Grievance Appellate Committee** (2022 amendment): users can appeal a Grievance Officer decision within 30 days, and the GAC aims to decide within 30 days. [V] — [Verdictum](https://www.verdictum.in/news/it-amendment-rules-2022-1445726); [LiveLaw](https://www.livelaw.in/amp/news-updates/with-it-rules-amendment-centre-to-constitute-appellate-committee-for-grievances-against-social-media-intermediaries-212685)
- [B] Other duties: publish rules, a privacy policy and a user agreement prohibiting listed content categories; remind users at least annually; retain removed content and registration data for prescribed periods; help authorised agencies within the prescribed hours; report cyber incidents to CERT-In (6-hour rule under the 2022 CERT-In directions).

### 2.3 Is XELOR a "social media intermediary"? (the Xelogram question)

- An SMI is one that "primarily or solely enables online interaction between two or more users" to create, upload, share, disseminate, modify or access information. MeitY's FAQs say intermediaries that primarily enable **commercial or business-oriented transactions** are not SMIs. Follow/subscribe, interaction with strangers and content sharing point towards SMI status. [V] — [Mondaq on MeitY FAQs](https://www.mondaq.com:443/india/social-media/1136030/meity-issues-faqs-on-the-intermediary-rules); [PSA Legal](https://psalegal.com/indias-new-intermediary-guidelines-overview/)
- **Assessment** [B, uncertain]: the marketplace or directory alone is probably *not* an SMI. **Xelogram** (feed, follows, likes, comments, reposts) very likely is, either as a separate feature or for XELOR as a whole if it becomes the main usage.
- **SSMI threshold:** **50 lakh (5 million) registered users in India.** [V] — [Business Today](https://www.businesstoday.in/latest/economy-politics/story/new-it-rules-govt-fixes-50-lakh-users-threshold-to-define-significant-social-media-intermediary-289547-2021-02-27); [Bar & Bench](https://barandbench.com/news/law-policy/platforms-with-more-than-50-lakh-users-to-be-significant-social-media-intermediaries-it-rules). An SSMI must appoint a Chief Compliance Officer, a nodal contact and a resident Grievance Officer, all resident in India. [V] [B] It must also publish monthly compliance reports and offer voluntary user verification. A Peenya pilot is orders of magnitude below 50 lakh, but the design should not prevent SSMI compliance later.

### 2.4 2026 synthetic-content (AI) amendment

- The IT (Intermediary Guidelines and Digital Media Ethics Code) Amendment Rules 2026 were notified **10 Feb 2026** and took effect **20 Feb 2026**, following a draft of Oct 2025. They define "synthetically generated information" (SGI): AI-created or substantially altered audio/visual content that appears authentic. Intermediaries that offer SGI creation tools must label such content prominently and attach metadata or identifiers that cannot be removed. The SGI definition was narrowed to exclude routine, good-faith edits. SSMIs carry extra verification duties. [V] — [Khaitan ERGO (16 Feb 2026)](https://www.khaitanco.com/sites/default/files/2026-02/ERGO%20-%20IT%20Rules%20Amendment%20-%2016%20February%202026.pdf); [Mondaq](https://www.mondaq.com/india/gaming/1783896/2026-it-rules-amendments-ai-content-labelling-and-intermediary-obligations); [Chandhiok & Mahajan](https://chandhiok.com/insights/cm-e-alert-ministry-of-electronics-and-information-technology-notifies-the-information-technology-intermediary-guidelines-and-digital-media-ethics-code-amendment-rules-2026); [IFF critique](https://internetfreedom.in/it-intermediary-amendment-rules-2026-contradict-their-purpose/)
- **For Xelogram:** if XELOR's AI writes posts or generates or alters product photos and videos (for example, AI-rendered images of a machined part or a factory walkthrough), outputs that look realistic must carry an "AI-generated" label and metadata. Routine enhancement (cropping, colour correction) is likely outside SGI, but confirm this against the final rule text.
- **Draft Second Amendment Rules 2026** (released 30 Mar 2026; comments closed 14 Apr 2026). Proposals: extend publisher-style obligations (Rules 14–16) to users posting "news and current affairs" at scale; require compliance with any MeitY advisory or SOP; expand the Inter-Departmental Committee. **Final notification status as of Oct 2026: not confirmed (uncertain).** Low direct relevance to an industrial B2B feed, unless Xelogram allows general news posting. [V] — [SFLC.in](https://sflc.in/initial-statement-on-the-draft-information-technology-intermediary-guidelines-and-digital-media-ethics-code-second-amendment-rules-2026/); [IFF](https://internetfreedom.in/sound-the-alarm-iffs-first-read-on-meitys-draft-it-rules-second-amendment-2026/); [CyberPeace](https://cyberpeace.org/resources/blogs/regulating-speech-or-controlling-it-a-critical-analysis-of-the-2026-it-second-amendment-rules)

---

## Q3. DPDP Act 2023 and DPDP Rules 2025

### 3.1 Status and timeline

- The DPDP Rules 2025 were notified as **G.S.R. 846(E) dated 13 Nov 2025**, published 14 Nov 2025. [V] — [PIB explainer PDF](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf); [Shardul Amarchand](https://www.amsshardul.com/insight/enforcement-of-the-dpdp-act-and-notification-of-the-dpdp-rules/)
- Rollout in phases [V]: Data Protection Board provisions immediately (Nov 2025); the **Consent Manager** framework (Rule 4) from **13 Nov 2026**; all remaining substantive obligations (notice, consent, security, breach reporting, rights) from **13 May 2027**. — [Sansa Legal](https://www.sansalegal.com/post/dpdp-act-2023-and-rules-2025-phased-implementation-timeline-and-business-compliance-deadlines); [Glocert](https://www.glocertinternational.com/resources/guides/dpdp-rules-2025-compliance-timeline/)
- **Proposal to accelerate.** On 23 Jan 2026 MeitY proposed cutting the 18-month window to 12 months (full compliance by 13 Nov 2026), aimed mainly at Significant Data Fiduciaries. One source says that as of 8 Sep 2026 it was not notified, so **13 May 2027 remains operative**. *Uncertain: re-check the Gazette.* [V] — [S.S. Rana](https://ssrana.in/articles/meity-plans-to-cut-short-dpdp-compliance-timeline-and-notify-cross-border-restrictions-for-sdfs/); [Mondaq](https://www.mondaq.com/india/data-protection/1773554/meity-plans-to-cut-short-dpdp-compliance-timeline-and-notify-cross-border-restrictions-for-sdfs); [ConsentOS tracker](https://consentos.in/learn/dpdp-compliance-timeline/)
- **Penalties (Schedule):** up to ₹250 crore for failing to take reasonable security safeguards; up to ₹200 crore for failing to notify a breach; up to ₹200 crore for children's-data breaches; ₹150 crore for SDF duties; ₹50 crore residual. Rule 7: breach intimation, then details within 72 hours, with no materiality threshold. [V] — [Taxmann](https://www.taxmann.com/post/blog/data-privacy-breach-enforcement-penalties-under-the-dpdp-act); [DPDPA Schedule](https://dpdpa.com/theschedule.html)

### 3.2 Lawful basis

- **Consent (s.6)** must be free, specific, informed, unconditional and unambiguous, given by clear affirmative action, and limited to necessary data. **Legitimate uses (s.7)** include 7(a): a specified purpose for which the data principal *voluntarily provided* the data and has not objected. [V] — [TCSA](https://www.tcsa.in/frameworks/dpdp/data-fiduciary-obligations); [Rainmaker FAQ](https://rainmaker.co.in/consent-isnt-a-pop-up-anymore-dpdp-act-dpdp-rules-2025-cms-and-consent-managers-faqs-for-indian-companies/)
- **Publicly available data exemption (s.3(c)(ii)).** The Act does not apply to personal data the data principal made public, or that someone under a legal obligation made public. This is **not** a blanket "found on the internet" exemption: scraped, indexed or third-party data does not automatically qualify. [V] — [India Briefing](https://www.india-briefing.com/news/india-dpdp-act-publicly-available-personal-data-46899.html); [Nasscom](https://community.nasscom.in/communities/public-policy/publicly-accessible-personal-data-under-dpdp-act-ai-training-and-other); [FPF](https://fpf.org/blog/five-ways-in-which-the-dpdpa-could-shape-the-development-of-ai-in-india/)

### 3.3 Implications for publishing MSME owner contacts and sharing leads ([B] analysis built on the [V] facts above)

1. **Company versus person.** A company's data (registered office, GSTIN, a generic sales line) is not personal data. A **sole proprietor's or partner's name and mobile number is** personal data, and most Peenya micro-units are proprietorships or partnerships.
2. **Seller self-listing.** When an owner lists their own business to be contacted, s.7(a) arguably covers display to buyers. Still, collect explicit, unbundled consent through a Rule 3-style notice: itemised data, purpose ("shown to registered buyers / shared with buyers whose RFQ you choose to answer"), how to withdraw, and how to complain to the Board. Make withdrawal as easy as giving consent.
3. **Default to masking.** Show a "Call / WhatsApp via XELOR" button backed by a virtual number (see Q4). Reveal the raw number only if the seller opts in. This lowers DPDP exposure, harvesting by scrapers and spam, and also lets XELOR measure leads.
4. **Buyer leads/RFQs.** A buyer posting an RFQ to "matched suppliers" is giving data for that purpose (7(a)), *if* the notice says how many and what kind of sellers will see it. Avoid reselling the same lead to unlimited sellers. That is both a DPDP purpose-limitation risk and the IndiaMART spam pattern (Q5).
5. **No seeding from scraped directories** (JustDial, IndiaMART, Google Maps) or from GST/Udyam lookups unless counsel confirms s.3(c)(ii) applies. Data made public by a third party does not qualify, and scraping also breaches those sites' terms.
6. **Processors.** Put DPDP-compliant processor contracts in place with cloud telephony (Exotel/Knowlarity), the WhatsApp BSP, SMS DLT vendors and analytics providers. Security safeguards and breach logs (Rule 6) carry the highest penalties.
7. **Retention.** Erase data once the purpose is over or consent is withdrawn. [B] The Third Schedule sets specific inactivity-erasure periods (3 years) for large e-commerce and social-media platforms (≥2 crore users). XELOR is far below that, but should build retention jobs anyway.
8. **Children.** Not relevant to B2B, but block under-18 sign-ups for Xelogram to avoid the verifiable parental consent regime.

---

## Q4. Calling and contact rules

### 4.1 TRAI TCCCPR 2018 and amendments

- **12 Feb 2025 amendment** [V]:
  - Promotional calls must use the **140 series**; the new **1600 series** is for transactional and service calls.
  - Senders may not use ordinary 10-digit numbers for telemarketing.
  - Promotional messages must carry an opt-out.
  - Headers are standardised.
  - TRAI can act directly against violating Principal Entities.
  - Sources: [TRAI Regulation, 12 Feb 2025 (PDF)](https://trai.gov.in/sites/default/files/2025-02/Regulation_12022025.pdf); [PIB](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2102413&reg=48&lang=2); [Saikrishna & Associates](https://www.saikrishnaassociates.com/strengthening-consumer-protection-by-trai-amendment-to-the-tcccpr/); [Sigma Chambers](https://www.sigmachambers.in/post/2025-tcccpr-amendments-a-renewed-push-by-trai-for-order-in-commercial-communications-1)
- **Third Amendment Regulations, 2026** [V]: draft released 13 Mar 2026; comments to 19 Apr 2026, counter-comments to 4 May 2026, open house 3 Jun 2026; **issued 18 Sep 2026** (TRAI Press Release No. 119/2026).
  - Defines "spam" and "spammer", and brings **A2P calls** (auto-dialers, robocalls, pre-recorded or AI voices) into scope.
  - Puts AI/ML spam detection into the framework, with suspected-spam numbers shared across operators.
  - Action starts on complaints from ≥3 unique consumers within 10 days combined with an operator AI flag. Escalation runs from KYC re-verification through suspension to disconnection.
  - Misused headers and templates must be suspended within 6 hours, and complaint records kept for 2 years.
  - Reports mention a termination charge of up to 5 paise per minute on A2P calls. **Some secondary sources differ on thresholds (3 vs 5); read the primary text.**
  - Sources: [TRAI PR 119/2026 (PDF)](https://www.trai.gov.in/sites/default/files/2026-09/PR_No119of2026.pdf); [DataGuidance](https://www.dataguidance.com/news/india-trai-strengthens-rules-unsolicited-commercial); [Tribune](https://www.tribuneindia.com/news/india/trai-harder-telecom-regulator-tightens-norms-to-curb-spamming/); [AA Plus analysis](https://www.aaplusconsultants.com/article-tcccpr-third-amendment.html); [Upstox](https://upstox.com/news/business-news/latest-updates/trai-tightens-spam-rules-when-can-telcos-block-callers-and-disconnect-numbers/article-201041/)
- **Digital Consent Acquisition (DCA):** consent to receive commercial communication from a sender is captured and recorded on the DLT platform after OTP verification. [V] — [TRAI Regulation PDF](https://trai.gov.in/sites/default/files/2025-02/Regulation_12022025.pdf)
- **Operational implications for XELOR** [B]:
  - XELOR's own outreach to MSMEs (sales calls, promotional SMS) needs Principal Entity registration on DLT, registered headers and templates, the 140 series for promotional voice, and DND scrubbing. A2P/AI voice-agent outreach now falls under the Third Amendment.
  - A **buyer-initiated** call to a seller about the buyer's own RFQ is not unsolicited commercial communication. A seller **cold-calling** many buyers from a 10-digit SIM is the seller's violation, but repeated complaints harm XELOR's reputation. Contractually ban sellers from mass-messaging contacts obtained through XELOR.
  - The **TRAI–OTT question** (whether WhatsApp-style business messaging falls under TCCCPR) was raised during the 2026 consultation. Outcome not confirmed. [V] — [Techtonetworks](https://www.techtonetworks.com/post/trai-s-new-rules-for-ott-messaging-apps-in-india-what-the-2026-draft-amendment-really-means-for-bus); [ORF](https://www.orfonline.org/expert-speak/more-than-spam-what-trai-s-latest-proposal-means-for-digital-regulation)

### 4.2 Number masking

- Exotel's number masking connects two parties through a virtual number (ExoPhone) without revealing either party's real number. It is used for buyer–seller e-commerce contact and helps track leads and keep conversations on the platform. Knowlarity (now part of Gupshup) offers masking, IVR and call analytics. [V] — [Exotel developer docs](https://developer.exotel.com/docs/call-support/advanced-features/number-masking); [Exotel use case](https://exotel.com/use-cases/number-masking/); [CallerDesk provider list](https://callerdesk.io/blog/top-virtual-number-providers-india-2025/)
- Pricing was not found this session. [B] Expect per-minute charges plus a monthly virtual-number rental; get quotes from Exotel, Knowlarity/Gupshup, Ozonetel and MyOperator.
- **Why masking fits connect-only:** it protects owners' numbers (DPDP), enables "pay-per-verified-call" or call-tracking metrics without touching money, deters scraping and spam, and lets XELOR cut off abusive callers.

### 4.3 WhatsApp Business Platform

- [V] **India rates (per delivered message, 2026 reports):** marketing roughly ₹0.86–1.09; utility and authentication roughly ₹0.115–0.145. The ranges reflect different reporting dates and BSP markups. 1,000 free service messages per number per month. Reported change: from **1 Oct 2026**, utility messages sent inside the customer-service window are also chargeable. Volume discounts apply to utility and authentication only, not marketing. — [Business Standard (1 Oct 2026)](https://www.business-standard.com/amp/world-news/whatsapp-business-pricing-changes-from-today-what-indian-firms-should-know-126100100165_1.html); [AiSensy](https://aisensy.com/pricing); [ChatMaxima India](https://chatmaxima.com/whatsapp-api-pricing/india/); [FlowCall (Oct 2026)](https://www.flowcall.co/blog/whatsapp-business-api-pricing). *Treat exact rupee figures as uncertain and check Meta's rate card.*
- [B] **Policy** (Meta's WhatsApp Business Messaging Policy; developers.facebook.com could not be fetched):
  - Business-initiated messages outside the 24-hour window must use **pre-approved templates** and require prior **opt-in** that names the business.
  - Users must be able to block or opt out. Quality ratings and messaging-tier limits throttle senders that draw blocks or reports.
  - Meta has added per-user caps on marketing messages in some markets.
  - So XELOR cannot blast WhatsApp promotions to scraped MSME numbers. Collect opt-in at sign-up and default to utility notifications (RFQ received, quote updates).
- Meta launched "Business AI on WhatsApp" for Indian small businesses in May 2026. [S] — [Meta newsroom](https://about.fb.com/news/2026/05/introducing-business-ai-on-whatsapp-for-small-businesses-in-india/)

---

## Q5. Revenue models for connect-only platforms

> **Evidence caveat:** the search budget ran out before benchmark searches, so the pricing figures below are **[B], from memory and approximate.** Re-verify before using them in investor materials.

| Model | Benchmarks [B] | Incentive alignment |
|---|---|---|
| **Seller subscription (tiered)** | IndiaMART's paid supplier packages run from roughly ₹40k–50k/yr at entry level to much higher "Leader/Star" tiers. Reported ARPU is around ₹60k+/yr across roughly 2.1–2.2 lakh paying suppliers (FY25–26; check IndiaMART investor releases at [corporate.indiamart.com](https://corporate.indiamart.com/)). JustDial sells annual listing and priority packages. Houzz Pro is SaaS (CRM, estimates, invoicing) with lead exposure, roughly US$65–400+/month. | **Good** when the subscription buys tools and verified presence. **Poor** when renewal depends on lead *volume*: the platform then floods sellers with low-quality enquiries to justify the price. |
| **Lead credits / pay-per-lead** | IndiaMART "BuyLeads" are consumed from credits on subscription plans. Thumbtack charges pros per lead/contact (variable by category, from a few dollars to US$100+). Angi/HomeAdvisor sell leads that may be **shared among several pros**. Sulekha sells service-provider lead packs. | **High spam risk.** Revenue scales with lead count, so the platform is pushed to resell one buyer to many sellers and loosen lead qualification. That produces many cold calls for the buyer and junk leads for the seller. In 2023 the US FTC ordered HomeAdvisor to pay about US$7.2M over misrepresenting lead quality ([FTC press release, Jan 2023 — URL not verified](https://www.ftc.gov/news-events/news/press-releases/2023/01/ftc-order-requires-homeadvisor-pay-72-million-stop-deceiving-small-businesses-about-service-leads-it-sells)). IndiaMART sellers widely complain about irrelevant BuyLeads and aggressive renewal selling (anecdotal; not verified this session). |
| **Pay-per-call / per verified conversation** | Cloud-telephony-measured calls (JustDial-style tracked numbers; Yelp/Google Local Services "pay per lead/call"). | **Medium.** Better than raw leads if billed only for answered calls longer than a set duration, with dispute and refund for spam. Masking makes it measurable without money flowing between buyer and seller. |
| **Verified badge / trust seal** | IndiaMART TrustSEAL and JustDial "Verified"/"Trust" stamps are paid or KYC-based. | **Good if earned, bad if bought.** XELOR's advantage is a badge *earned* from ERP evidence (GRNs, on-time delivery, inspection pass rates; see sibling notes). Charge for the verification audit, not for the badge itself. |
| **Boosted listings / sponsored posts (Xelogram)** | Yelp/Google CPC ads; Instagram boosted posts (CPM/CPC). | **Medium.** Must be labelled (Dark Patterns "disguised advertisement"; ASCI). Cap the share of sponsored results so organic, evidence-based ranking stays meaningful. |
| **Featured placement / category sponsorship** | Industry-directory "featured supplier" slots, banner positions. | **Medium.** Fixed-fee, finite inventory; low spam risk. |
| **SaaS bundling (ERP + network)** | IndiaMART bought Busy (accounting) for up to ₹500 Cr ([S] [IndiaMART](https://corporate.indiamart.com/2022/01/25/indiamart-to-acquire-busy-infotech-for-rs-500-crores)). TranZact pairs a freemium ERP with financing ([S]). | **Best aligned.** Revenue comes from a tool used every day. Marketplace visibility becomes a benefit of good operational data rather than a pay-to-play feature. |
| **Referral / partner fees** (finance, logistics, insurance) | TReDS/NBFC referral; LSP fees paid by the lender (Q6). | Aligned if disclosed and lender-paid. Must not influence supplier ranking. |

**Recommendation** [B, opinion]:
- Make the marketplace **free to list** with a **low-cost "Verified" subscription** (for example ₹3,000–6,000/yr, a fraction of IndiaMART entry plans). Bundle it with the XELOR ERP.
- Add **capped, labelled boosts** for Xelogram posts.
- Avoid **per-lead resale**. If leads are priced at all, deliver each RFQ to at most N (for example 3–5) buyer-selected or matched suppliers, and refund spam leads.
- Show buyers the response quality metrics of each seller. This positions XELOR as the "anti-IndiaMART spam" option.

---

## Q6. Does "early payment via TReDS/NBFC partners" conflict with "we never handle money"?

**Short answer: no, provided XELOR stays a referral/technology layer and funds always move financier → MSME and buyer → financier (or through TReDS settlement), never through XELOR accounts.** The brief should say "facilitates access to early payment from RBI-regulated partners" and never "XELOR pays early".

### 6.1 TReDS

- [B] TReDS (Trade Receivables electronic Discounting System) platforms are payment systems authorised by RBI under the PSS Act. The authorised operators include **RXIL** (Receivables Exchange of India), **M1xchange** (Mynd Solutions), **Invoicemart** (A.TReDS), and newer entrants such as C2treds (verify the current list at rbi.org.in).
- How it works: an MSME uploads an invoice, the corporate buyer accepts it, financiers (banks and NBFC-factors) bid, and the MSME is paid by the financier. On the due date the buyer pays the financier. Settlement runs through the platform's settlement arrangement. XELOR would at most **export invoices or e-invoice data to the TReDS platform (via API)** and **refer** MSMEs and buyers to onboard. It never receives funds.
- [S] Context for 2026: the **MSMED (Amendment) Act 2026** (assent 13 Aug 2026) routes certain MSME receivables through TReDS ([SCC Online](https://www.scconline.com/blog/post/2026/08/19/micro-small-medium-enterprises-development-amendment-act-2026/)). CPSEs must settle MSME invoices on TReDS from 30 Jun 2026 ([DP Jadhav](https://www.dpjadhav.com/post/govt-mandates-treds-for-cpse-msme-payments-what-manufacturers-need-to-know)). Both strengthen the case for a TReDS integration.
- [B] Check the referral-fee structure with each platform: some run channel or ecosystem partner programmes. GST at 18% applies to referral fees XELOR receives.

### 6.2 NBFC lending: DSA, LSP, co-lending

- [B] **RBI (Digital Lending) Directions, 2025** were issued in May 2025, consolidating the 2022 digital lending guidelines. Unverified this session; read the primary text on rbi.org.in. A **Lending Service Provider (LSP)** is an agent of a regulated entity (bank or NBFC) that performs functions such as customer acquisition, underwriting support, pricing support, servicing, monitoring or recovery. Key points for XELOR:
  1. **Direct fund flow (the core protection):** loans are disbursed straight into the borrower's bank account, and repayments go straight from the borrower to the lender. **No pass-through or pool account of the LSP or any third party** is allowed, except narrow statutory exceptions such as co-lending escrow between regulated entities. This rule prevents an LSP from handling money, and it matches XELOR's model.
  2. **Fees:** the lender pays the LSP. The LSP must not charge the borrower directly.
  3. **Disclosure:** the LSP must name its partner regulated entities, and the borrower gets a Key Fact Statement with APR from the lender. A **multi-lender LSP** must show all matching offers from willing lenders without bias, including the lender's name, and must not use dark patterns.
  4. **Grievance:** the LSP must appoint a grievance redressal officer and display the details.
  5. **Data:** collect only what is needed, with explicit consent and an audit trail. No access to the phone's files, media, contacts or call logs. Data stored on servers in India. Clear privacy policy and right to delete. This overlaps with the DPDP duties above.
  6. **Due diligence:** regulated entities must vet LSPs, and lenders' digital lending apps are reported to RBI (the CIMS portal / public DLA directory, from 2025). XELOR as an LSP will face partner audits.
  7. **DLG:** default loss guarantee arrangements are capped (5% of the portfolio). **XELOR should not offer a DLG.** Doing so means taking credit risk and needing more capital.
- [B] **DSA versus LSP:** a non-digital referral (a "DSA"/connector arrangement under the lender's outsourcing rules) carries lighter obligations. Once XELOR's app is part of the customer journey (showing offers, collecting applications), it is effectively an LSP under the Digital Lending Directions.
- [B] **Co-lending** (RBI Co-Lending Arrangements Directions 2025, reportedly effective 1 Jan 2026) is between regulated entities. XELOR cannot be a co-lender without an NBFC licence (s.45-IA RBI Act, net-owned-fund requirement).
- **Red lines for XELOR:**
  - no lending from its own balance sheet;
  - no collecting EMIs or repayments;
  - no escrow or nodal account;
  - no DLG or first-loss guarantee;
  - no "XELOR Pay Later" branding implying XELOR is the lender;
  - no ranking bias for suppliers who take XELOR-referred credit;
  - no sharing of ERP data with lenders without separate, purpose-specific DPDP consent.

### 6.3 Messaging fix for the investor brief

"XELOR never holds or moves customer funds. Early-payment revenue comes from referral/technology fees paid by RBI-regulated TReDS platforms and lenders. Financing is disbursed directly by those partners to the MSME's bank account." This wording is consistent with both the PA analysis (Q1.1) and the digital-lending direct-flow rule.

---

## Q7. ONDC as a channel

- [S] The **MSE-TEAM** (Trade Enablement and Marketing) initiative under RAMP aims to onboard **5 lakh MSEs (2.5 lakh women-owned)** onto ONDC. It encourages MSEs in the B2B archetype to bring existing buyers online to "build their reputation". — [MSME RAMP MSE-TEAM guidelines (May 2026 PDF)](https://ramp.msme.gov.in/ramp/sites/default/files/2026-05/Approved-msme-team-guidelines_0.pdf). [B] The scheme was launched in June 2024 with an outlay of about ₹277 crore. Incentives flow through **seller network participants (seller apps)** for onboarding, cataloguing, account management and logistics support for MSEs. Check the per-MSE incentive amounts and the empanelment process in the guidelines PDF.
- [S] Reliable ONDC B2B order volumes for industrial categories were not found. The ONDC site showed placeholder metrics. ([sibling notes](../Accelerator%20startups%20like%20XELOR/india_programs_and_incumbents.md))
- [B] ONDC runs B2C retail, B2B, mobility, logistics, financial services (credit, insurance) and some services domains on the Beckn protocol. Joining as a **network participant** means registering in the ONDC registry, signing the Network Participant Agreement, passing technical certification, and implementing ONDC's Issue & Grievance Management.
- **Fit with connect-only** [B, analysis]:
  - ONDC is an *order and transaction* network. Every order has a designated **payment collector** (the buyer app or seller app) and a reconciliation/settlement process. If XELOR became an ONDC buyer or seller app that collects payment, it would be in the funds flow (PA/escrow questions), and the ECO tax roles would attach: GST TCS under s.52 and 194-O/393. CBDT Circular 20/2023 allocated the 194-O duty in multi-ECO models such as ONDC, generally to the seller-side ECO.
  - A connect-only design could act as a **seller app that is not the collector**, or use ONDC only for **discovery and catalogue publication**. Whether ONDC's network policy allows a non-collecting seller app for B2B is **uncertain** and needs checking with ONDC.
  - The MSE-TEAM incentives could subsidise onboarding and catalogue work XELOR does anyway. That is attractive, but it needs empanelment and compliance with ONDC's SLAs and grievance timelines.
- **Recommendation:** treat ONDC as a phase-2 option. First publish XELOR seller catalogues and earned trust credentials to ONDC, with no order taking. Re-evaluate once MSE-TEAM empanelment terms and B2B volumes are verified.

---

## Open items / to verify with fresh access

1. The primary text of the PA Directions 2025 (rbi.org.in) on whether a marketplace's tech-only routing is clearly excluded.
2. Whether the Department appealed *Hiveloop* to the Supreme Court; the CBIC FAQ wording on non-collecting ECOs.
3. A written tax opinion on 194-O/393 "facilitation" for an RFQ-to-PO flow.
4. Final status of the IT Second Amendment Rules 2026, and whether the DPDP timeline-compression proposal has been notified.
5. The exact TCCCPR Third Amendment thresholds and effective date (TRAI primary PDF).
6. RBI Digital Lending Directions 2025: primary text and paragraph numbers for LSP duties; the current list of RBI-authorised TReDS platforms and their partner/referral programmes.
7. Current IndiaMART, JustDial, Thumbtack, Angi, Houzz Pro, Yelp and Sulekha price points from primary pricing pages and investor reports.
8. ONDC B2B network policy on payment collector roles, and MSE-TEAM per-MSE incentive amounts.

*Not legal advice. Prepared from secondary sources under restricted network access; see the evidence labels above.*
