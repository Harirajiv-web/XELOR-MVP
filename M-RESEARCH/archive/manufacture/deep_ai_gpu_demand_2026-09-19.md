# India's AI / GPU / data-centre boom and the physical hardware demand it creates INSIDE India

**Research date: 19 September 2026.** For a prospective Bengaluru manufacturer choosing a physical product for the Indian market. Capex is not a ranking factor. Ranking is on market potential only, not on whether this particular client would win orders.

## How to read this report

Two separate questions are kept apart throughout, because confusing them is the main way this sector is mis-analysed:

- **(a) Pre-installed and imported** — hardware that arrives already fitted inside a server, a rack or a container built abroad. India's data-centre operator never places a purchase order for it. This is **not** an India market, no matter how big the GPU numbers get.
- **(b) Bought and fitted in India** — hardware ordered by an Indian buyer (operator, MEP/EPC contractor, panel builder, OEM's Indian plant) and installed on Indian soil.

A separate and **different** question is whether Indian companies already make a product. Existing Indian manufacturers are **evidence that a product is genuinely bought in India** (category b) rather than arriving pre-installed. They are treated in this report as market intelligence and as a positive demand signal, listed under "Who already does this in India" — never as a reason to down-rank an opportunity. The only case where competition affects a rank here is where it demonstrably changes the economics (true per-kilogram commodity with structurally thin margins), and that is stated explicitly with evidence.

A third state matters and is usually missed: a product can be **bought and fitted in India but still imported as a finished good**. That is not "pre-installed" — an Indian buyer placed the order — and it is the best kind of opportunity, because the demand is proven and the domestic supply is absent. Section 8 separates all three states.

## The ten numbers that matter

1. **26.3 GW** — additional AI data-centre electrical load projected for India by 2031–32, stated by the Ministry of Power to Parliament on **29 July 2026**. That is **nearly double the Ministry's own March 2026 estimate of 13.56 GW**.
2. **~60–70%** of an AI data centre's total capex is IT equipment, essentially all imported. Only **25–35% is addressable by an Indian manufacturer at all.**
3. **70% of AI-server cost is the GPU, rising to 90–92% on newer platforms, and ~90% of that value originates abroad** — MeitY Joint Secretary Sushil Pal, March 2026.
4. **85–95%** of AI GPUs entering India still arrive inside servers and racks built abroad. Confirmed, not changed.
5. **₹43,000 crore** of electrical and power equipment across India's data-centre build over FY26–FY30 (~₹8,500 crore a year), of which **55–70% is already captured by Indian-made product**.
6. **Cummins India: data centres went from under 2% of revenue seven years ago to ~14% in FY26, and from 23% to 40% of power-generation sales between Q1 FY26 and Q1 FY27.**
7. **India data-centre construction market $9.38 bn (2025) → $35.82 bn (2031), 25.0% CAGR**; cooling **$2.99 bn (2026) → $9.28 bn (2031), 25.5% CAGR**; power **$990 M (2025) → $2.64 bn (2031), 17.7% CAGR**.
8. **IndiaAI Mission has disbursed under ₹400 crore — less than 4% of its ₹10,372 crore budget — in two years.** It is a demand signal, not a funding source.
9. **PLI 2.0 (₹17,000 crore) does not cover AI servers**, and the redesign announced in March 2026 has not been notified. **There is no Indian scheme at all for data-centre equipment manufacturing.**
10. **NVIDIA's 800 VDC row power centre, feeding up to 2 MW per row over overhead DC busway, arrives in 2027** — creating a facility-side hardware category with no incumbent in India.

---

## 1. India's data-centre pipeline as of September 2026

### 1.1 Headline capacity — sources conflict, both given

| Metric | Figure | Source & date |
|---|---|---|
| Operational capacity, mid-2026 | **1.6 GW** | [JLL India Data Centre Mid-Year 2026, 31 Aug 2026](https://www.jll.com/en-in/insights/market-dynamics/india-data-centers) |
| Operational capacity, H1 2026 | **1,789 MW** | Knight Frank India, H1 2026 (via [YourStory, Jun 2026](https://yourstory.com/2026/06/indias-data-centre-pipeline-knight-frank-india)) |
| Total capacity 2025 | **1,700 MW**; 440 MW added in 2025 (+160% YoY) | [CBRE via Business Today, 1 Apr 2026](https://www.businesstoday.in/technology/story/india-data-centre-capacity-to-jump-30-in-2026-500-mw-supply-boost-expected-cbre-report-523529-2026-04-01) |
| Under construction | **322.4 MW (0.32 GW)** | Knight Frank H1 2026 |
| Committed stage | **2,920 MW (2.92 GW)** | Knight Frank H1 2026 |
| Early-stage development | **5,406 MW (5.41 GW)** | Knight Frank H1 2026 |
| **Total development pipeline** | **8,326.6 MW (8.33 GW)** | Knight Frank H1 2026 |
| 2026 fresh supply | **~500 MW (+30% YoY)** | CBRE, 1 Apr 2026 |
| 2029 capacity target | **6 GW** (tripling) | JLL, 31 Aug 2026 |
| 2030 base case | 4–5 GW; AI-accelerated 8–9.2 GW | [RESI India strategic analysis, 2026](https://www.resiindia.org/post/india-s-data-centre-market-a-strategic-analysis-of-capacity-expansion-investment-economic-multip) |
| 2030 (Wood Mackenzie) | India total **2.2 GW → 12 GW by 2030**; **AI-dedicated 275 MW (2025) → 6,546 MW (2030)** | Wood Mackenzie (carried from prior verified research, `Manufacturing_Research_Handoff.md` §7.1) |

**CONFLICT FLAG:** operational capacity in mid-2026 is reported as 1.6 GW (JLL), 1.7 GW (CBRE, end-2025) and 1.789 GW (Knight Frank). Use **1.6–1.8 GW** as the honest range. The 2030 number ranges from 4 GW to 13.5 GW depending on whether AI capacity is assumed to land. Use **6–8 GW by 2029–30** as the central case.

### 1.2 H1 2026 market activity

- Absorption **101 MW**, deliveries **85 MW**; absorption beat the 3-year average by 20%. [JLL, 31 Aug 2026](https://www.jll.com/en-in/insights/market-dynamics/india-data-centers)
- **82% of absorption was pre-committed hyperscale** — i.e. demand is locked in before the shell is finished.
- Mumbai ~48% and Chennai ~50% of H1 2026 supply additions — between them close to all new capacity. Mumbai holds **890 MW, half of national operational capacity** (Knight Frank), and has the largest pipeline at ~1.7 GW.
- Vacancy described as "record-low"; RESI puts it at **4.3%**.
- **Bengaluru is a small data-centre market (~7%, 76 MW operating)** but is the country's equipment-manufacturing hub — see §5.

### 1.3 Investment committed

| Figure | Source |
|---|---|
| Cumulative commitments through 2025: **$126 billion**; 2025 alone **$56.4 bn**; 2026 projected **>$180 bn** | [CBRE, 1 Apr 2026](https://www.businesstoday.in/technology/story/india-data-centre-capacity-to-jump-30-in-2026-500-mw-supply-boost-expected-cbre-report-523529-2026-04-01) |
| Investment required by 2029 to reach 6 GW: **US$110 billion**; hyperscaler commitments >$50 bn; hyperscalers will **self-build ~30% of new capacity (1.4 GW by 2029)** | [JLL, 31 Aug 2026](https://www.jll.com/en-in/insights/market-dynamics/india-data-centers) |

### 1.4 Operator-by-operator (AI/GPU halls flagged)

| Operator | Capacity / plan | Investment | Location | AI-GPU hall? | Source |
|---|---|---|---|---|---|
| **Reliance Intelligence (Jamnagar)** | First **120 MW live by end-2026**; 1 GW full build; room for >200,000 H100-equivalent GPUs | ₹10 lakh crore (~$110 bn) group AI plan over 7 years; separate $20 bn / 3 GW Gujarat complex cited | Jamnagar, Gujarat | **Yes — NVIDIA GB300**, first fleet = >75,000 H100-equivalent for inference | [Business Standard, 19 Jun 2026](https://www.business-standard.com/companies/news/reliance-intelligence-bets-big-on-ai-with-jamnagar-compute-platform-126061901060_1.html); [IndiaAIPulse AGM 2026](https://www.indiaaipulse.com/en/news/reliance-outlines-ai-push-at-2026-agm) |
| **Google** | **Gigawatt-scale AI hub**, 1 GW; groundbreaking 28 Apr 2026 | **$15 bn over 2026–30** — Google's largest AI hub outside the US | Visakhapatnam, Andhra Pradesh (with AdaniConneX + Airtel Nxtra) | **Yes — dedicated AI hub** | [Google press, 14 Oct 2025](https://www.googlecloudpresscorner.com/2025-10-14-Google-Announces-First-AI-Hub-in-India,-Bringing-Companys-Full-AI-Stack-and-Consumer-Services-to-Country); [DCD](https://www.datacenterdynamics.com/en/news/google-confirms-15bn-data-center-project-in-andhra-pradesh-india/) |
| **Microsoft** | New **India South Central** hyperscale region (Hyderabad, 3 AZs) live mid-2026; expansion at Chennai, Hyderabad, Pune | **$17.5 bn over 4 years (2026–29)** — its largest Asia investment | Hyderabad / Pune / Chennai | Mixed; AI + sovereign cloud | [Microsoft, 9 Dec 2025](https://news.microsoft.com/source/asia/2025/12/09/microsoft-invests-us17-5-billion-in-india-to-drive-ai-diffusion-at-population-scale/) |
| **AWS** | Expansion in Telangana + Maharashtra | **$12.7 bn by 2030** (one source says $35 bn — see conflict note) | Mumbai, Hyderabad | Mixed | [Business Standard, 10 Dec 2025](https://www.business-standard.com/technology/tech-news/amazon-india-tech-ai-investments-microsoft-google-meta-gccs-us-trade-talks-125121000400_1.html); [TradeBrains](https://tradebrains.in/money/list-of-major-hyperscalers-investing-in-data-centers-in-india-2025-2/) |
| **Yotta** | Operating capacity to **175–180 MW by end-2026**; **20,736 B300 + 5,120 B200 GPUs** | **$3 bn deployed in 2026 to date, $4 bn+ more planned** (total ~$7 bn) | Navi Mumbai (Panvel), Greater Noida | **Yes — Shakti Cloud, pure AI** | [Business Standard, 24 Jun 2026](https://www.business-standard.com/amp/companies/news/yotta-to-deploy-7-bn-in-capex-this-year-eyes-global-ai-cloud-market-126062400873_1.html) |
| **CtrlS** | **612 MW campus in Hyderabad**; 72 MW Chennai | ~$2 bn six-year plan; ₹10,000 cr Telangana AI cluster | Hyderabad, Mumbai, Chennai, Kolkata, Bhopal | Partly AI | [Mordor India DC companies](https://www.mordorintelligence.com/industry-reports/india-data-center-market/companies); TradeBrains |
| **L&T (new entrant)** | **Chennai 30 MW** on a 300-acre GW-scalable campus + **Mumbai 40 MW** under execution; "gigawatt-scale" ambition | Not disclosed | Chennai, Mumbai | **Yes — NVIDIA AI factory** | [L&T press release, 18 Feb 2026](https://www.larsentoubro.com/pressreleases/2026/2026-02-18-lt-teaming-with-nvidia-to-build-india-s-largest-gigawatt-scale-ai-factory) |
| **NTT DATA / GDC** | 400 MW → **700 MW** (2025–27), 30 DCs; Bengaluru-4 = 100 MW | **$1.5 bn** | Mumbai, Bengaluru, Chennai, Delhi NCR | Mixed | TradeBrains |
| **AdaniConneX** | Flagship **AI campus at Chennai**; partner on Google Visakhapatnam | $1.44 bn sustainability-linked construction financing framework (Apr 2024); Adani group claims $100 bn to 2035 | Chennai, Noida, Hyderabad, Visakhapatnam | **Yes — Chennai AI campus** | [Mordor](https://www.mordorintelligence.com/industry-reports/india-data-center-market/companies); [IBTimes, 2026](https://www.ibtimes.co.in/ai-infrastructure-supercycle-data-centers-navigate-power-crunch-cooling-revolution-indias-902826) |
| **Sify** | ~19% colo share; empanelled under IndiaAI with 2,500 GPUs/TPUs in round 3 | — | Mumbai, Chennai, Noida, Bengaluru, Hyderabad | Partly | [Inc42, 2026](https://inc42.com/buzz/indiaai-to-add-over-3800-gpus-via-third-tender-report/) |
| **Airtel Nxtra** | ~15% share; partner on Google Visakhapatnam | — | Pan-India | Mixed | Deep Dive Capital |
| **STT GDC India** | ~19% share | — | Mumbai, Chennai, Bengaluru, Hyderabad, Kolkata | Mixed | Deep Dive Capital |
| **Meta + Reliance JV** | **1 GW**, Meta 30% / Reliance 70% | **$12–15 bn** | India-wide | Yes | [TradeBrains](https://tradebrains.in/money/list-of-major-hyperscalers-investing-in-data-centers-in-india-2025-2/) |
| **AirTrunk** | 5 GW by 2030 ambition | **$30 bn** | India entry | Yes | [IBTimes](https://www.ibtimes.co.in/ai-infrastructure-supercycle-data-centers-navigate-power-crunch-cooling-revolution-indias-902826) |

Colocation market shares (2025, Deep Dive Capital): NTT GDC 20%, Sify 19%, ST Telemedia 19%, Airtel Nxtra 15%, CtrlS 15%, Yotta 5%, Princeton Digital 3%, Iron Mountain 2%, AdaniConneX 1%. [Source](https://deepdivecaps.substack.com/p/indias-data-center-revolution-5x)

**CONFLICT FLAG — AWS:** $12.7 bn (Business Standard / AWS own statement) vs **$35 bn** (Deep Dive Capital's tally of "late-2025 hyperscaler pledges"). The $12.7 bn figure is the one AWS itself published; treat $35 bn as unverified.

**Geography of AI halls:** the AI-specific capacity is concentrated in **Jamnagar (Gujarat), Visakhapatnam (AP), Hyderabad (Telangana), Chennai (TN), Navi Mumbai (MH) and Greater Noida (UP)** — **not** Bengaluru. Andhra Pradesh + Telangana alone host >2 GW of planned AI-centric campuses ([IBTimes](https://www.ibtimes.co.in/ai-infrastructure-supercycle-data-centers-navigate-power-crunch-cooling-revolution-indias-902826)). A Bengaluru manufacturer is selling **out of state**, to EPC/MEP contractors and OEMs rather than to a local data hall.

---

## 2. IndiaAI Mission: GPUs, tenders, and money actually spent

### 2.1 Budget

**Approved five-year outlay: ₹10,371.92 crore** — confirmed in a [Lok Sabha reply, PIB 6 Aug 2026](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2295477&lang=1&reg=3).

Pillar split ([Kapyn, Aug 2026](https://www.kapyn.app/blog/indiaai-mission-explained-2026)):

| Pillar | ₹ crore |
|---|---|
| Compute capacity | 4,563.36 |
| Foundation models | 1,971.37 |
| Startup financing | 1,942.50 |
| Datasets, applications, skilling, safety | remainder |

### 2.2 GPU tender rounds and results

| Round | Outcome |
|---|---|
| Round 1 (2024) | ~10,000 GPUs empanelled, announced at ₹65–115/GPU-hour with subsidy |
| Round 2 | Empanelled: Sify, Netmagic, Vensysco, Cyfuture, Yotta Data Services, Locuz, Ishan Infotech — took the pool to 18,000+, later 34,333 |
| **Round 3 (2026)** | **~3,850 additional units, NO new vendors empanelled.** Locuz 1,300 × NVIDIA H100; Ishan Infotech 50 × Google Trillium TPU; **Sify 2,500** (1,000 Trillium TPU + 800 H200 + 700 L4); Vensysco cut prices only. Teleglobal and Rackbank failed technical evaluation. [Inc42](https://inc42.com/buzz/indiaai-to-add-over-3800-gpus-via-third-tender-report/) |

**Totals — three published figures, all different:**

| Figure | Date | Source |
|---|---|---|
| 34,333 GPUs in pool before round 3; **~38,183 after** | 2026 | [Inc42](https://inc42.com/buzz/indiaai-to-add-over-3800-gpus-via-third-tender-report/) |
| **38,000+ GPUs onboarded** | mid-2026 | Multiple secondary |
| **45,000+ GPUs of shared capacity** | as of June 2026 | [PIB official factsheet, 13 Aug 2026](https://www.pib.gov.in/FactsheetDetails.aspx?Id=150860) |
| 17,300 GPUs actually *installed* | June 2026 | Business Standard, 29 Jun 2026 |
| Target **100,000 public GPUs by December 2026** | — | multiple |

**CONFLICT FLAG:** "empanelled / onboarded" (45,000+) ≠ "installed and running" (17,300 as of June 2026). Yotta, E2E and NxtGen had deployed; **Jio Platforms and CtrlS had not yet begun deployment** as of mid-2026. Do not use the 100,000-by-Dec-2026 target as a hardware-demand forecast.

Official usage metrics, [PIB 6 Aug 2026](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2295477&lang=1&reg=3): **15 empanelled compute providers, 237 projects approved for subsidised compute, 93.18 lakh GPU-hours sanctioned.** Sanctioned hours are not consumed hours.

### 2.3 Money actually disbursed — the critical number

| Fiscal year | Released | Against revised estimate |
|---|---|---|
| FY 2024–25 | **₹21.79 crore** | ₹173 crore |
| FY 2025–26 | **₹379.15 crore** | ₹800 crore |
| Cumulative to date | **under ₹400 crore — less than 4% of the ₹10,372 cr lifetime budget in its first two years** | — |

Source: [AI Startup Impact analysis, 2026](https://aistartupimpact.com/news/indiaai-mission-sovereignty-gpu-subsidy-dpdp-ai-governance); corroborated by [Kapyn](https://www.kapyn.app/blog/indiaai-mission-explained-2026) ("~₹400 crore as of April 2026, less than half the annual allocation").

**Implication for a manufacturer: IndiaAI is a demand signal, not a cash source.** It is subsidising GPU-hours on imported hardware, not funding Indian hardware manufacture.

### 2.4 Sovereign LLM programmes and their hardware spend

- Subsidised rate to users: **₹65 per GPU-hour**.
- **Sarvam AI** received access to **4,096 NVIDIA H100 SXM GPUs via Yotta**, worth approximately **₹99 crore in compute subsidy**. Open-sourced Sarvam 30B (32B-param MoE, ~2.4B active, 65K context) in Feb 2026. [Sarvam](https://www.sarvam.ai/blogs/indias-sovereign-llm)
- First public sovereign model launches Feb 2026: **Sarvam 30B and 105B reasoning models, BharatGen Param2, Gnani.ai Vachana voice stack**. [BharatGen](https://bharatgen.com/from-llms-to-verticalisation-india-sovereign-ai-stack-takes-shape/)
- 11 foundation-model companies initially empanelled, later expanded to 19; 190–237 AI projects approved.
- **Hardware spend created in India by sovereign LLM programmes: effectively zero incremental.** They consume compute-hours on GPUs the cloud provider already bought (and imported). The hardware pull is indirect, via the provider's next capacity expansion.

---

## 3. NVIDIA, AMD and hyperscaler India commitments, 2025–2026

| Announcement | Date | Substance | Any manufacturing/assembly in India? |
|---|---|---|---|
| **Reliance × NVIDIA**, 1 GW Jamnagar | first announced 25 Oct 2024; reconfirmed at 2026 AGM (18 Jun 2026) | NVIDIA supplies Blackwell / **GB300**; first 120 MW live end-2026 | **No.** GPU supply agreement only. |
| **L&T × NVIDIA** sovereign gigawatt-scale AI factory | **18 Feb 2026**, India AI Impact Summit, Delhi | L&T: engineering, DC build, execution (Chennai 30 MW, Mumbai 40 MW). NVIDIA: GPUs, CPUs, networking, accelerated storage, AI Enterprise stack, reference architectures | **No.** The L&T release contains **no mention of local GPU manufacturing or Indian content requirements** — "sovereign by design" refers to data residency, not domestic production. [L&T](https://www.larsentoubro.com/pressreleases/2026/2026-02-18-lt-teaming-with-nvidia-to-build-india-s-largest-gigawatt-scale-ai-factory) |
| **AMD × TCS HyperVault**, Helios rack-scale blueprint | **February 2026** | Up to **200 MW** of AI-ready capacity using **Instinct MI455X GPUs, EPYC "Venice" CPUs, Pensando Vulcano NICs, ROCm** | **Not stated.** Described as "co-develop a blueprint"; no production or assembly facility disclosed. [Yahoo Finance / analysis](https://finance.yahoo.com/news/amd-200-mw-helios-ai-231520068.html) |
| **Google** AI hub, Visakhapatnam | 14 Oct 2025; groundbreaking 28 Apr 2026 | $15 bn, 1 GW, with AdaniConneX + Airtel Nxtra; subsea cable landings | **No** hardware manufacturing. |
| **Microsoft** | 9 Dec 2025 | $17.5 bn / 4 years; India South Central region live mid-2026 | **No local sourcing or manufacturing commitment disclosed.** |
| **AWS** | 2025 | $12.7 bn by 2030 | No |
| **Netweb × NVIDIA (MGX)** | India-made **GB200** systems launched **18 Feb 2026** | Netweb is an NVIDIA MGX partner assembling GB200-class systems at Faridabad | **YES — this is the one genuine India assembly datapoint.** See §4. |
| **Netweb × Vertiv** liquid-cooled AI systems | **February 2026** | Joint design/delivery of liquid-cooled AI systems for large-scale deployments | Partial — Vertiv has Indian plants | [Mordor](https://www.mordorintelligence.com/industry-reports/india-data-center-cooling-market) |
| **Supermicro** Chennai | MoU **Aug 2026**, ₹477 crore | Server manufacturing MoU with Tamil Nadu | Announced, not yet producing |
| **Adani × Jabil** LOI | **15 Jun 2026** | LOI covering **AI racks, PDUs, CDUs and busbars** made in India | Announced; production unlikely before 2027–28 |

**Verdict on task 3: not one of the headline NVIDIA/AMD/hyperscaler India announcements includes GPU, HBM, board or rack manufacture in India.** Every one of them is a capacity-and-supply deal. The only manufacturing movement is at the system-integrator layer (Netweb, Supermicro-TN, Adani–Jabil) and in power/cooling equipment plants (Schneider Bengaluru, Vertiv, Delta Krishnagiri, ABB Nelamangala).

---

## 4. AI server and rack assembly in India

### 4.1 Player status, September 2026

| Player | Location | Status Sep 2026 | Numbers |
|---|---|---|---|
| **Netweb Technologies (Tyrone)** | Faridabad (+ new 15,000 sq ft high-density facility) | The only Indian company genuinely assembling GPU/AI systems at scale. NVIDIA MGX partner; **India-made GB200 launched 18 Feb 2026**; new facility supports **>150 kW per rack and liquid-cooled systems**; **Vertiv partnership Feb 2026** | FY26 revenue **₹2,183.6 cr (+90% YoY)**; **AI Systems ₹947.8 cr = 43.4% of revenue, +459.6% YoY**; PAT ₹205.8 cr; EBITDA 13.0%. Q1 FY27 revenue **₹819.7 cr (+172% YoY)**, AI ₹510.6 cr (62%). Order book **₹2,506.9 cr** at 30 Jun 2026, L1 ₹848.0 cr, pipeline **₹10,410 cr**. Includes a **₹1,734 cr NVIDIA/Blackwell sovereign-AI order** (₹558.8 cr executed in FY26). [Q4FY26 update](https://www.netwebindia.com/investors/research-report/Netweb_4QFY26_Update.pdf), [Multibagg](https://www.multibagg.ai/market-pulse/articles/netweb-fy26-ai-93252), [Whalesbook](https://www.whalesbook.com/companies) |
| **VVDN Technologies** | Manesar | Server/AI server lines; **makes its own sheet metal in-house** | — |
| **Dell India** | Sriperumbudur | Makes most of the servers it sells in India | — |
| **Lenovo** | Puducherry (plant since 2005) + new Infrastructure R&D Lab, Bengaluru (4th globally) | AI server manufacturing; three rack-mount enterprise AI servers + two flagship 8-way GPU servers; selected under the ₹17,000 cr IT hardware PLI | **50,000 enterprise AI rack servers/year + 2,400 eight-GPU servers/year; >60% exported.** **Reality check: 2,400 × 8 = 19,200 GPUs a year of India-assembled AI capacity — less than a single Yotta order.** |
| **VVDN Technologies** | Manesar (5 facilities incl. a dedicated mechanical factory: moulding, tooling, die casting) | Built **"Adipoli", India's first fully India-designed 8-GPU AI server** (8 GPUs, AMD CPUs + AMD GPUs), co-designed with **C-DAC Bengaluru** under the National Supercomputing Mission. Also the **HPE $1 bn India server programme** (first 1,000 units shipped by 31 Jul 2024) and C-DAC's RUDRA HPC server | $100–200 M PCB fab + components investment announced Oct 2024 |
| **Supermicro** | Chennai | **₹477 cr (~$50 M) MoU signed 14 Aug 2026** at the Vettri Tamil Nadu Investors' Conclave — its **first** India server-assembly facility. Announced alongside Avalon Technologies (₹1,000 cr) and Aheesa Digital (₹250 cr) | **No capacity, product mix or timeline disclosed. Not producing.** There is **no Supermicro–Netweb JV** — that premise is false |
| **Adani × Jabil** | — | **LOI 15 Jun 2026** targeting a vertically integrated platform with **multi-GW of high-density AI rack manufacturing capacity**, covering liquid-cooled AI racks, servers, storage, networking, **PDUs, CDUs, transformers, switchgear, busbars and thermal management**. Jabil CEO Mike Dastoor: "we can execute down to the rack level" | **No investment figure disclosed; still at documentation stage; nothing built.** Anchored to Adani's $100 bn / 5 GW by 2035 commitment |
| **Wistron** | India (site not disclosed) | **$135 M planned server manufacturing facility** (Jul 2025) — separate from the iPhone plant sold to Tata in 2023 | Announced only |
| **Dixon Technologies** | — | JV with **Inventec** for notebooks, desktops **and servers**; JV with Taiwan's **Gemtek** (Jun 2026, expanded Sep 2026) for **optical transceivers, SFPs, BOSA, 1G→1.6T optical connectivity and EIC-PIC integrated 800G/1.6T** for cloud, data centres and AI | No investment/capacity disclosed |
| **Kaynes Technology** | Mysuru | Contracted for **3,000 RUDRA servers for C-DAC**; moving into OSAT/advanced packaging | — |
| **Bharat Forge / Kalyani** | — | Partnered **AMD** to enter the Indian server market (Feb 2025); separately partnered a Taiwan firm to make **x86 servers in India** (Mar 2025); MoU with VVDN for AI data centres (18 Feb 2026) | Genuine new entrant |
| **Zoho** | India | Launched **"Nathu La"**, an India-designed server on Intel Xeon 6 for AI inference, claiming ~30% lower TCO — 10 Jun 2026 | Designed in-house |
| **Altos Computing (Acer)** | India | **R370 server claimed at >51% local value contribution from India** — the only published India server local-content figure | CPU server, not GPU |
| **Google** | — | Vaishnaw (May 2026): Google is **"seriously considering manufacturing AI servers in India"**, alongside its $15 bn Visakhapatnam AI hub | Exploratory |
| **Syrma SGS × Giga Computing** | Chennai | **Server motherboard PCBA commenced** (MS73-HB0, MZ33-AR1); system integration / box build on roadmap | Announcement page dated 28 Jan 2026 (body carries a conflicting Jan 2025 dateline) |
| **Foxconn** | Tamil Nadu, Devanahalli (Karnataka) | AI-server details **not disclosed**; visible activity is phones/displays | — |
| **Tata Electronics** | Hosur, Jagiroad OSAT, Dholera fab | No AI-server or rack programme disclosed | Dholera fab starts at **90 nm, commercial ops mid-2028** |

### 4.2 The BOM question — what share of an India-assembled AI server is Indian?

This is the single most important number in the report, and it is now on the record from MeitY itself.

> **Sushil Pal, Joint Secretary, MeitY: GPUs are ~70% of AI-server cost today, rising to 90–92% on newer platforms. Roughly 90% of that value originates abroad.**
> Separately: "approximately **70% of certain AI-server manufacturing processes** occur in India, potentially rising to 80%."
> — [Winbuzzer, 26 Mar 2026](https://winbuzzer.com/2026/03/26/rising-gpu-costs-force-india-reassess-ai-incentive-scheme-xcxwbn/), corroborated [r3con](https://www.r3con.co.uk/post/rising-gpu-costs-force-india-to-revamp-pli-2-0-for-ai-server-push)

**Read those two numbers together carefully.** 70–80% of *process steps* happen in India; **~90% of the *value* is imported.** They are not in conflict — screwing together an imported motherboard, imported GPU tray, imported PSU and imported NIC is a lot of process steps and almost no value.

What is actually bought locally by an Indian AI-server assembler:

| Sub-assembly | Sourced in India? |
|---|---|
| Sheet-metal chassis / rack cabinet | **Yes** (VVDN in-house; Netrack, Valrack, APW President, Rittal India, Godrej) |
| Rails, brackets, cable management | **Yes** |
| Cable harness, power cords | **Mostly yes** (small market: ₹80–200 cr → ₹200–400 cr) |
| Packaging | Yes |
| Assembly labour, burn-in, test | Yes |
| GPU / accelerator | **No — 100% imported** |
| CPU, HBM, DRAM, SSD | **No** |
| Motherboard / PCBA | **Mostly no**; Syrma–Giga Chennai is the first exception, and that is general-purpose server boards, not GPU baseboards |
| NIC / networking silicon, optical transceivers | **No** |
| Server PSU, fans | **No** |
| Cold plates, in-tray tubing, quick disconnects | **No — pre-installed** |

**The best independent confirmation found: Moody's (September 2026) concluded India's data-centre boom will add only about 0.13% to GDP by 2030 (~$9 billion) precisely because the equipment is imported, so most of the capex leaks straight out of the country.** Reported the same day by six outlets (Business Standard 4 Sep, The Statesman 4 Sep, ET Datacenters 5 Sep, Mint 1 Sep, Financial Express 3 Sep, ET Enterprise AI 4 Sep 2026) — all of which block automated fetching, so this is HEADLINE-LEVEL corroboration across six independent outlets rather than a read of the report itself.

**The only published India local-content figures for servers, and they conflict:**

| Claim | Figure | Note |
|---|---|---|
| Altos Computing (Acer's server arm), **R370 CPU server** | **">51% local value contribution from India"** | The defensible number. **It is a CPU-only server, not a GPU box** |
| Altos Computing, same interview | "80–85% of the overall activity" done in India | **Activity share, not BOM share** — the standard conflation |
| Altos India (Priya Krishnamurthy, Director) | **"20–21% industry-standard local value addition"** on Indian-assembled compute, vs 60–80% claimed for its own products | The 20–21% industry figure is the useful one |
| MeitY / industry, all electronics | Domestic value addition **18–20%** | Whole sector |
| PLI 2.0 target for smartphones | 55% | **Do not transfer to servers** |

Sources: [DQIndia interview with Jackie Lee, CEO Altos Computing](https://www.dqindia.com/interview/made-for-india-ai-in-a-box-and-indigenisation-for-servers-11728746); [Financial Express, 23 Mar 2026](https://www.financialexpress.com/business/industry-ai-servers-drive-policy-rethink-on-pli-scheme-4181879/); [Communications Today, 24 Mar 2026](https://www.communicationstoday.co.in/india-reviews-ai-hardware-pli-amid-high-gpu-costs/); ET 24 Mar 2026 (blocked, snippet only).

**Working estimate for an AI (GPU) server's Indian BOM value: 5–15%. For a plain x86 server: 20–25%.** Nobody has published a credible India BOM number for a GPU server. **Netweb, India's largest AI-server assembler, has never published a local-value-addition percentage** — its own Make-in-India page gives no figure, no capacity and no import breakdown, which is itself a finding.

**Estimate carried forward and re-verified: 85–95% of AI GPUs that entered India in 2025–26 arrived inside servers or racks built abroad.** Nothing found in this September 2026 sweep contradicts it. The GB200 NVL72 / GB300 NVL72 rack is integrated at L10 (tray) and **L11 (full rack)** by **Foxconn (~40%), Quanta (~30%), Wistron/Wiwynn** in Taiwan before shipment ([GB200 supply-chain analysis](https://intuitionlabs.ai/pdfs/nvidia-gb200-supply-chain-the-global-ecosystem-explained.pdf); [QCT](https://blog.qct.io/qct-accelerates-ai-infrastructures-with-production-of-nvidia-gb300-nvl72-platform/)). Components integrated at that foreign factory and arriving sealed inside the rack: **cold plates, cooling manifolds, quick disconnects, busbars, NVLink spine, internal cabling, power shelves and BBUs.** Only final coolant-loop connections, external power connections, rack-to-rack cabling and network cabling beyond NVLink are done on the Indian site.

**CORRECTION — is any NVL72-class rack integrated in India? No.** A dedicated search found **no evidence that any NVIDIA GB200 or GB300 NVL72 rack is integrated in India**; all signs point to fully-built import. NVL72 rack integration worldwide is done by Foxconn, Quanta, Wistron, Inventec, Supermicro, Jabil, Celestica, Pegatron, Aivres and the OEMs, and **none has announced NVL72 integration in India**. Foxconn's stated 1,000 AI racks per week is Taiwan/Mexico/US capacity, not India.

What Netweb actually does is **NVIDIA MGX node-level** work — Grace and GH200 Grace Hopper MGX designs, 10+ Tyrone MGX models, air-cooled and direct-to-chip liquid-cooled, with design and PCBA in India — **plus its own rack designs**, co-engineered with Vertiv India for **over 200 kW of IT load per rack** ([Vertiv press release, Mumbai, 26 Feb 2026](https://www.vertiv.com/en-in/about/news-and-events/news-releases/2026/vertiv-and-netweb-technologies-to-deliver-advanced-liquid-cooled-rack-solutions-for-ai-data-centers-in-india/)). **MGX is not NVL72**: MGX is a chassis/board standard buildable as a 2U–4U node; NVL72 is a 72-GPU NVLink domain requiring NVSwitch trays and a proprietary NVLink spine. **CONFLICT FLAG:** the prior research ledger in this project records "Netweb India-made GB200 launched 18 Feb 2026"; this sweep could not corroborate it and found only the 26 Feb 2026 Vertiv–Netweb liquid-cooled rack announcement. Treat the GB200 claim as **unconfirmed**.

**What HAS shifted by Sep 2026 (the genuine changes):**
1. Netweb is co-engineering **>200 kW/rack** liquid-cooled AI racks with Vertiv India (26 Feb 2026) and is an NVIDIA MGX partner doing node-level design and PCBA in India — small but real.
2. **Adani–Jabil LOI (15 Jun 2026)** explicitly names **AI racks, PDUs, CDUs and busbars** for Indian manufacture — the first time rack-power and cooling hardware has been named in an India manufacturing LOI.
3. **Supermicro–Tamil Nadu ₹477 cr MoU (Aug 2026)**.
4. Syrma SGS started **server motherboard PCBA in Chennai**.
These move the 2030 India-assembled share upward (estimate 25–45%, low confidence) but do **not** change the 2026 position.

### 4.3 PLI 2.0 — does it cover AI servers? NO.

- PLI 2.0 for IT Hardware: launched May 2023, **₹17,000 crore** outlay, 6-year support, ~5% average incentive for localisation, target segments **laptops, tablets, all-in-one PCs, servers, USFF**. [MeitY](https://www.meity.gov.in/offerings/schemes-and-services/details/production-linked-incentive-scheme-pli-for-it-hardware-QjNyETMtQWa)
- **It covers conventional servers but does not distinguish AI servers as a category.** Because incentive is paid on turnover and GPUs are 70–92% of that turnover and entirely imported, the scheme as written **would subsidise foreign silicon**. This is why AI servers are effectively excluded.
- **2026 revamp in progress:** MeitY is redesigning the scheme around **chip design and system integration** rather than final assembly, with stakeholder consultations announced. [Winbuzzer, 26 Mar 2026](https://winbuzzer.com/2026/03/26/rising-gpu-costs-force-india-reassess-ai-incentive-scheme-xcxwbn/)
- **UNVERIFIED:** no notified PLI 3.0 or AI-server category had been gazetted as of 19 Sep 2026. Treat the revamp as announced intent only.
- Cost pressure driving the rethink: **NVIDIA Blackwell GPU prices rose 15–23% during 2026** on HBM shortages which doubled in Q1 2026 and may persist into 2027.

---

## 5. The spend breakdown of an Indian AI data centre

### 5.1 Cost per MW — India vs global

| Facility type | India cost/MW | Source |
|---|---|---|
| Tier III colocation (5–10 kW/rack) | **₹50–65 cr/MW (~$6–8 M/MW)** | [IMARC Engineering, 2026](https://www.imarcengineering.com/blog/data-center-development-in-india) |
| Tier III hyperscale (optimised) | ₹55–70 cr/MW | IMARC |
| Tier IV mission critical | ₹70–90 cr/MW | IMARC |
| **AI-ready high density (20–50+ kW/rack, liquid cooled)** | **₹70–95 cr/MW** | IMARC |
| Standard facility (alt. estimate) | ₹58–95 cr/MW ($7–11 M) vs global avg ₹128 cr/MW ($11.3 M) — India 45–55% cheaper | [Equity by Piyush, 2026](https://equitybypiyush.substack.com/p/data-centers-20-lac-cr-of-capex-in) |
| **Frontier AI facility** | **₹150–200 cr/MW** | Equity by Piyush |
| Large colocation (low outlier) | ₹35–45 cr/MW ($4.1–5.3 M) | [Blackridge Research](https://www.blackridgeresearch.com/blog/large-colocation-data-center-construction-cost-in-india-complete-capex-opex-breakdown) |

**CONFLICT FLAG:** ₹35–45 cr/MW (Blackridge) vs ₹50–95 cr/MW (IMARC, Piyush). The lower figure appears to exclude parts of the electrical and civil scope. Use **₹55–95 cr/MW** as the working range for a modern Indian build, **excluding IT equipment and GPUs**.

### 5.2 The decisive split: IT equipment vs everything else

Global 2026 benchmarks, [Axis Intelligence](https://axis-intelligence.com/ai-data-center-cost-per-mw/):

| Layer | $/MW |
|---|---|
| Shell and core, standard | $11.3 M |
| AI-optimised with liquid cooling | $12.0–15.0 M |
| AI facility + tenant IT fit-out, **excluding GPUs** | $15–25 M |
| **Full stack including GPUs (GB200 NVL72)** | **$30–45 M** |

**Therefore roughly 60–70% of the total cost of an AI data centre is IT equipment — and essentially all of it is imported.** Epoch AI's independent model of a 1 GW site ($37.9 bn) gives **servers 56%, facility 30%, networking 13%** — the same conclusion from a different direction.

**This is the number that should govern the client's decision: only about 25–35% of India's AI data-centre capex is addressable by an Indian manufacturer at all. Within that slice, power is roughly 40–48% and cooling roughly 29–33%.**

### 5.3 Facility (non-IT) capex split

| Component | India (IMARC) | AI-optimised global (Axis) | AI facility (Equity by Piyush) |
|---|---|---|---|
| Electrical (HV/MV/LV, UPS, gensets, switchgear, busway, PDU) | **25–35%** | **40–48%** ($4.8–7.2 M/MW) | **50%** |
| Mechanical / cooling | **18–28%** | **29–33%** ($3.5–5.0 M/MW) | **31%** |
| Civil and structural | 12–20% | ~15% ($1.8–2.3 M/MW) | 9% |
| Land | 5–12% | — | — |
| IT-room build-out and racks | 5–10% | — | 14% (incl. racks) |
| Security, BMS, fire | 4–7% | ~7% with networking | — |
| Professional fees and statutory | 3–6% | — | — |
| Commissioning and contingency | 8–12% | — | — |

Absolute-dollar cross-check for India's next 6.4 GW ([Deep Dive Capital](https://deepdivecaps.substack.com/p/indias-data-center-revolution-5x), $30 bn total): **electrical $10 bn, racks and fit-outs $7 bn, real estate $6 bn, cooling $4 bn, network $1 bn.** Electrical is the biggest addressable line, then racks and fit-out, then cooling.

Liquid-cooling premium: **+$2.7–3.7 M per MW** over air-cooled (mechanical rises from 22% to 33% of facility cost). Total project examples: **50 MW = ₹3,000–4,500 cr; 100 MW = ₹6,000–9,000 cr; 200 MW+ campus = ₹15,000 cr+.** Build timeline 30–48 months.

### 5.4 India market sizes for the addressable layers

| Market | Now | Forecast | Source |
|---|---|---|---|
| **India data-centre construction** | **$9.38 bn (2025)** | **$35.82 bn (2031), 25.0% CAGR** | [Mordor](https://www.mordorintelligence.com/industry-reports/india-data-center-construction-market) |
| **India data-centre cooling** | **$2.99 bn (2026)** | **$9.28 bn (2031), 25.47% CAGR** | [Mordor](https://www.mordorintelligence.com/industry-reports/india-data-center-cooling-market) |
| **India data-centre power** | **$990 M (2025)** | **$2.64 bn (2031), 17.72% CAGR** | [Mordor](https://www.mordorintelligence.com/industry-reports/india-data-center-power-market) |
| India data-centre GPU | $0.17 bn (2025) | $5.29 bn (2032), 63.14% CAGR — **100% imported** | [MarkNtel](https://www.marknteladvisors.com/research-library/data-center-gpu-market-india.html) |
| India diesel generator (all uses) | $1.24 bn (2025) | $1.88 bn (2031), 7.18% CAGR; **375–750 kVA bracket fastest at 8.75%** | [Mordor](https://www.mordorintelligence.com/industry-reports/india-diesel-generator-market) |
| India DC power infrastructure per MW | **~₹13 cr/MW** | — | prior verified research |
| India liquid cooling (derived) | ~$110 M (2026) | ~$700 M (2030) | prior verified research, base estimate |

Within the power market, **UPS is the largest component at 30.68% share (2025)**, but **power distribution units are the fastest-growing at 21.85% CAGR to 2031**, driven specifically by AI racks needing branch-circuit monitoring. Colocation providers are 61.75% of power spend; hyperscale/cloud is fastest at 22.95% CAGR. Mega campuses (50 MW+) grow at 25.4% CAGR.

**CONFLICT FLAG:** Mordor's "India data center rack market" is quoted at **USD 4.21 million (2025) → 13.74 million (2032)**. That is implausibly small against a $9.38 bn construction market and a prior India rack-cabinet estimate of ₹400–1,000 cr (~$48–120 M). Treat the Mordor rack figure as an error or an extremely narrow definition; use **₹400–1,000 cr (2026) → ₹1,000–2,000 cr (2030)** for India server racks and cabinets.

### 5.5 Cooling — what is bought in India, and from whom

**Adoption:** liquid-cooled share of AI chips globally **33% (2025) → 53% (2026) → ~60% (2027)** (TrendForce, 17 Aug 2026). In India, air-based cooling was still **66.35%** of the cooling market in 2025, with liquid growing at **27.34% CAGR**. India is roughly one generation behind the global AI average because most Indian capacity is still enterprise/colo at 5–15 kW per rack, while AI-native racks run 40–130 kW.

**The split that matters:**

| Layer | Pre-installed in imported rack? | Bought and fitted in India? |
|---|---|---|
| Cold plates, in-tray tubing, quick disconnects, NVL72 rack manifold, in-rack CDU | **Yes — about 75% of rack cooling value arrives sealed inside the rack** | No |
| **Row / facility CDUs** | Rack-mounted CDUs yes; **row CDUs no** | **Yes** — assembly rising in India, internals imported |
| **Secondary-loop piping and row manifolds (304L SS)** | **0% pre-installed** | **Yes — site-welded, prefab emerging. Highest local share of any AI-cooling item.** |
| Heat exchangers | Brazed-plate inside CDUs | Shell-and-tube largely Indian (Alfa Laval Pune) |
| **Dry / adiabatic coolers** | 0% | **Yes** — coils ~70%+ local (KRN), frames ~90%, EC fans imported |
| **Chillers** | 0% | **Yes** — ~60–70% local (Voltas, Blue Star, Carrier Sri City ₹863 cr plant) |
| **Pumps, valves, filters, strainers** | Inside CDUs only | **Yes** — high local share (Kirloskar, Grundfos, Wilo) |
| **Cooling towers** | 0% | **Yes** — high local (Paharpur), declining on water-use grounds |
| CRAH / in-row / precision air | 0% | Mixed — Vertiv, Stulz, Schneider, Blue Star |

Per-rack cooling BOM for a GB300 NVL72, estimated total ~$77K: **cold plates ~47%, QDs and in-tray tubing ~18%, rack manifold ~10%, CDU ~25%.** About 30% of that value is machined or welded metal — and about three quarters of it is already inside the rack when it lands in India.

**Who already makes cooling hardware in India** (market intelligence, and a positive signal that the product is genuinely bought here):
- **Schneider Electric / Motivair — Bengaluru liquid-cooling factory launched 18 February 2026**, its first in India and third globally; makes CDUs, rear-door heat exchangers and cold plates, and exports. [Schneider](https://www.se.com/in/en/about-us/newsroom/news/press-releases/Schneider-Electric-launches-Motivair-liquid-cooling-solutions-factory-to-accelerate-India%E2%80%99s-highdensity-AI-infrastructure-699493fd07a7fbd2c30cbafa/)
- **Samsung FläktGroup — Pune** (CDUs plus air side).
- **Vertiv** (Pune), **Rittal** (Bengaluru LCP), **Stulz**, **Airedale/Modine** (Chennai), **Delta** (Krishnagiri, Tamil Nadu — power supplies, fans, DC infrastructure), **Johnson Controls-Hitachi**, **Blue Star** (CDUs about 12 months out), **Voltas**, **Kirloskar Chillers**, **Carrier** (Sri City, ₹863 cr).
- **Indian-owned products:** Refroid (Hyderabad — CDUs, manifolds), KühlTherm (Ahmedabad, launched Aug 2026), MetaEdge (Indore — immersion).
- **Component suppliers: none publicly confirmed with a named OEM customer.** About 46 orbital-welding firms are listed across Ahmedabad, Pune, Bengaluru and Hyderabad (only ~6 in Bengaluru). Schneider was recruiting a Supplier Quality Engineer in Bengaluru in July 2026 — a direct signal it is building an Indian supplier base.
- **MEP/EPC buyers:** Blue Star (~30% of DC MEP work; order book ₹7,700+ cr; ~₹3,000 cr DC inflow expected FY27), Sterling and Wilson, Voltas, L&T, Tata Projects.

Global consolidation confirming this is a real value pool: **Eaton–Boyd Thermal $9.5 bn (closed 12 Mar 2026); Ecolab–CoolIT $4.75 bn (closed 2 Jul 2026); Schneider–Motivair 75% for $850 M; Samsung–FläktGroup ~$1.6 bn; Vertiv–CoolTera / PurgeRite (~$1 bn) / ThermoKey; Trane–LiquidStack; Flex–JetCool; Daikin–Chilldyne.**

Regulatory pull: **MeitY set a PUE below 1.35 requirement in the IndiaAI Mission GPU tender**, covering 10,000+ GPUs of public-private cloud capacity — a government-set efficiency floor that forces better cooling.

Hot, humid Mumbai and Chennai (about 98% of H1 2026 additions) favour **hybrid dry-cooler plus trim-chiller** designs over cooling towers, because water use is under scrutiny (India DC water use 150 bn litres in 2025 rising to 358 bn litres by 2030).

### 5.6 Power — what is bought in India, and local content

**Inside the rack (pre-installed, roughly 95–100% imported):** 8 power shelves × six 5.5 kW PSUs feeding a 50–51 V DC rack busbar, plus BBUs (Delta, Lite-On). Rack integrators Foxconn ~40%, Quanta ~30%, Wistron. Power whips energise those shelves from a remote power panel — and **the whip, the RPP and everything upstream of it is bought in India.**

**Outside the rack — all bought and fitted in India:**

| Item | Estimated local content | Who already does this in India |
|---|---|---|
| **Cables, earthing, containment, cable trays** | **90–100%** | Polycab, KEI, Finolex, Havells, RR Kabel (DC-specific share UNVERIFIED) |
| **LV switchboards / PCC-MCC panels / e-houses** | **75–90%** | C&S Electric (Siemens), Lauritz Knudsen (Schneider group; 2.1 m sq ft of plants, ₹850 cr invested to 2026), Schneider India, ABB India, Adlec, Sudhir, plus a large licensed panel-builder ecosystem. **ABB India won LT panels, packaging and e-house scope on a major Indian DC project in Q1 CY2026.** |
| **Dry-type / cast-resin and oil transformers** | **65–75%** | CG Power, Hitachi Energy India, Voltamp, Kirloskar Electric, TMEIC, T&R. **CRGO core steel is almost entirely imported (Japan/Korea/China)** — JSW's Thyssenkrupp Nashik acquisition targets 350,000 t of CRGO by FY2028 |
| **MV switchgear, RMUs, HT panels** | **65–75%** | Siemens/C&S, ABB, Schneider, CG Power (EHV switchgear capacity +80% to 16,200 units/yr from 4 Jun 2026), Voltamp (12 kV/630 A RMUs). **HV gas-insulated switchgear is predominantly imported** |
| **Gensets (set level)** | **60–80%** | Cummins India, Kirloskar Oil Engines (750–5,000 kVA), Mahindra Powerol, Jakson, Sterling Green Power (250–5,000 kVA), Caterpillar India, Greaves. **Correction to a common claim: Cummins' QSK60 is made in India, but the QSK78 and QSK95 — exactly the 2–3 MW hyperscaler engines — are imported from the parent** |
| **UPS (large frame)** | **35–55%** | **Schneider Bengaluru smart factory (₹425 cr, 1 m sq ft) explicitly makes three-phase UPS and power distribution units; Socomec makes Delphys XL 1,000 and 1,200 kVA UPS at Gurugram** ("engineered in Europe, manufactured in India"); ABB Nelamangala (UPS output expanded ~10×); Delta Krishnagiri building a 42,938 m² data-centre/BESS factory (Jun 2026 → Jun 2028, part of a $500 M India investment); Vertiv (Ambernath, Pune, Chakan); Legrand (7 India plants). **Power semiconductors, controls and PCBAs inside the box are imported** |
| **Busway / busduct, rising mains (LV–MV)** | **Indian** | C&S Electric (Isobar range), Godrej Enterprises, Schneider India (630–6,300 A copper, 800–5,000 A aluminium), Vertiv India catalogue |
| **White-space overhead track busway (Starline / Canalis KDP type)** | **LIKELY IMPORTED — no Indian manufacture found** | Global busway revenue is 62–68% concentrated in Eaton, Schneider, Siemens, ABB, Legrand. **This is a genuine localisation gap. UNVERIFIED but no contrary evidence found** |
| **RPPs and floor PDUs** | **~75–80%** | Schneider's Bengaluru factory makes "power distribution units"; licensed panel builders under Schneider / ABB / Siemens / Vertiv. **Fastest-growing power segment at 21.85% CAGR (Mordor)** |
| **Intelligent / metered / switched rack PDUs** | **LIKELY IMPORTED** | Legrand (Raritan PX4), Server Technology (PRO4X), Vertiv Geist, Panduit, APC — all US-engineered lines; **no Indian manufacture confirmed. Estimated 8–12% of the electrical package — a real localisation gap. UNVERIFIED** |
| **Batteries / BESS for UPS** | Assembly Indian; **cells largely imported** | Amara Raja (>1 GWh lithium ESS deployed across 50,000+ telecom sites, targeting 2 GWh by 2026, 16 GWh Divitipally gigafactory, naming **data centres as its next growth engine**); Exide (6 GWh Bengaluru gigafactory in commercial operation); HBL Power, Okaya (DC orders UNVERIFIED) |

**Weighted estimate: roughly 55–70% of the electrical/power spend on an Indian data centre is already captured by product made or assembled in India.** The imported 30–45% is concentrated in six places: HV gas-insulated switchgear; 2–3 MW class genset engines; power semiconductors/controls/PCBAs inside UPS; lithium cells; intelligent rack PDUs and white-space track busway; and CRGO electrical steel inside every transformer.

**Indicative sub-package split of the electrical package (estimate, calibrated to the one hard India anchor — gensets ≈ 9% of total DC capex):** gensets + fuel 20–25%; HV/MV substation, transformers, switchgear, RMU 20–25%; UPS + batteries 20–25%; LV switchgear and panels 10–15%; busway, RPP, floor PDU, rack PDU 8–12%; cables, earthing, containment, lighting 10–15%.

**Order books and disclosures proving the pull is real:**

| Company | Figure | As of |
|---|---|---|
| **Cummins India** | FY26 revenue ₹11,950 cr (+18%); domestic powergen ₹4,758 cr; **data centres were 30–35% of domestic powergen revenue in FY26 (≈₹1,427–1,903 cr) and ~14% of total revenue, versus under 2% seven years ago. In Q1 FY27 data centres were 40% of powergen sales, up from 23% a year earlier** | FY26 / Q1 FY27 |
| **Kirloskar Oil Engines** | FY26 revenue ₹7,701 cr; **192 MW order from HyperNext (96 × 2,500 kVA) in June 2026**; supplied 25 data-centre facilities in the prior year | Jun 2026 |
| **Sterling Green Power** (Sterling & Wilson genset arm) | FY26 revenue ₹1,167 cr; **order book ₹2,900 cr with data-centre-linked book ~₹3,100 cr; inflow ₹1,100 cr FY25 → ₹2,900 cr FY26 → ₹3,700 cr by 30 Jun 2026; ~80% of orders from Adani, AirTrunk and DAMAC**; ₹1,500 cr IPO planned | Jun 2026 |
| **CG Power** | Order backlog **₹17,107 cr consolidated (+61%)** at 31 Mar 2026, ₹18,965 cr at Q1 FY27; **₹900 cr export order in Jan 2026 for power transformers for a US data centre — its largest ever single order**; power-transformer capacity 75,000 MVA with a further 45,000 MVA being added | 2026 |
| **Hitachi Energy India** | FY26 revenue ₹8,147.7 cr; **order backlog ₹29,555.3 cr (+53.5%)**; management: **"in Q4, the major contributor is the data center"**; building a ₹2,000 cr transformer plant at Karjan, Vadodara | 31 Mar 2026 |
| **ABB India** | Q1 CY2026 orders ₹4,280 cr (+25%), backlog ₹11,094 cr; Q2 CY2026 backlog ₹11,898 cr (+22%); **$75 M India manufacturing/R&D investment covering data centres** | 2026 |
| **Schneider Electric Infrastructure** | FY26 revenue ₹2,891 cr (+9.6%), orders ₹3,430 cr (+27.4%), **backlog ₹1,911 cr (+50.1%)** | 31 Mar 2026 |
| **Vertiv Energy (India entity)** | Revenue ₹3,678.6 cr (+20.8%), EBITDA ₹426.8 cr | FY ending 31 Mar 2025 (filings aggregator — indicative) |
| **Blue Star** | FY26 revenue ₹12,402 cr; total order book ₹6,923 cr (EMP segment ₹4,664.5 cr). **The India DC MEP market is ~₹3,500 cr and Blue Star is doing ~₹1,000 cr of it** | 31 Mar 2026 |
| **Voltas** | FY26 income ₹14,483 cr; MEP order book ₹6,200 cr (₹4,500 cr domestic) — DC split UNVERIFIED | FY26 |
| **Techno Electric** | Order book ₹11,000 cr (Aug 2026). Also a **data-centre owner**: Chennai 36 MW live, Noida 16 MW, Kolkata 12 MW, 102 RailTel edge sites; **₹1,000 cr capex in FY27, targeting 250+ MW by FY30** | Aug 2026 |
| **L&T** | Order book ₹7.4–7.8 lakh cr (sources conflict); **₹10,000 cr allocated to its own data centres**; a reported **₹15,000 cr LTN Compute / Vyoma.AI order for "India's largest single-cluster AI infrastructure facility" on NVIDIA B300** (secondary source — verify) | FY26 |

**CORRECTION to a widely repeated claim — CPCB IV+ and data-centre gensets.** CPCB IV+ (GSR 804(E) of 3 Nov 2022, amended by GSR 436(E) of 14 Jun 2023) applies to **new engines up to 800 kW gross mechanical power**. A separate standard governs engines above 800 kW. **Typical data-centre gensets of 2,000–3,000 kVA (≈1,600–2,400 kW) therefore sit ABOVE the CPCB IV+ threshold.** The "+20–35% cost from CPCB IV+" figure applies to sub-800 kW sets, not to hyperscale data-centre generation. Anyone building a business case on "CPCB IV+ will lift data-centre genset prices" is mis-applying the rule. *(This is a reading of the CPCB notification list and warrants a legal check before it goes into a financial model.)*

### 5.7 The grid constraint — the biggest single number in this report

**The Ministry of Power told Parliament on 29 July 2026 that an additional load of 26.3 GW from AI data centres is projected by 2031–32**, to be integrated into the grid and primarily served by renewable energy. **That is nearly double the March 2026 estimate of 13.56 GW.** The Grid Controller of India warned that "the variable and highly spiky nature of data centre loads, along with sharp ramps, could pose risks to grid stability," and the Ministry's mitigation is to push facilities away from urban centres and closer to renewables. Government transmission capex commitment: **₹9.6 lakh crore through 2032**. Transmission infrastructure takes five to seven years to plan, fund and build.

How an Indian data centre actually gets power (Electricity Act 2003): DISCOM supply under s.43 at **₹8–11/unit** (best under 5 MW); **open access** under ss.42/49 at **₹3.50–5.00/unit** on a renewable PPA (≥1 MW, adds 3–6 months); or **captive generation** under s.9. **DISCOMs in Maharashtra and Karnataka are already capacity-constrained in the zones where data-centre clusters are developing.** About 30 separate permissions are needed, and **MeitY's proposed national data-centre policy with single-window clearance was still unnotified as of August 2026.**

Confirmed data-centre renewable deals: **Adani + Google Visakhapatnam (~$15 bn over 2026–30, explicitly including co-investment in new transmission lines, clean generation and storage in Andhra Pradesh); Adani Group $100 bn by 2035 into renewable-powered AI data centres with AdaniConneX scaling 2 GW → 5 GW; AdaniConneX $1.44 bn green financing; Google contracting from Adani Green's Khavda hybrid park in Gujarat.** Do **not** cite the Adani Energy Solutions–MSEDCL 2,500 MW RTC PPA (8 Sep 2026) or the Adani Power–Reliance 500 MW deal as data-centre PPAs — they are not. Tata Power, ReNew and Greenko data-centre-specific PPAs: **UNVERIFIED**.

**CONFLICT FLAG on capex/MW from rating agencies:** ICRA implies **₹42–50 cr/MW** (₹40,000–45,000 cr of FY26–27 capex for 2,000–2,100 MW by Mar 2027) and CRISIL implies **₹46–50 cr/MW** (₹55,000–60,000 cr over FY26–28 doubling capacity to 2.3–2.5 GW), against consultants' ₹60–95 cr/MW. The likely reconciliation is that rating-agency figures are phased cash capex on shell-and-core colocation while consultant figures are fully fitted Tier III/IV AI-ready facilities. **Use ₹55–70 cr/MW for conventional and ₹75–95 cr/MW for AI/high-density when sizing an equipment TAM.**

**Turner & Townsend's construction-cost split contradicts the common "AI pushes electrical higher" narrative:** a **liquid-cooled AI facility splits electrical 48% / mechanical 33% / other 19**%, while an **air-cooled standard facility splits electrical 54% / mechanical 22% / other 24%**. Liquid cooling shifts money *into* the mechanical package, so electrical's *share* falls even as its absolute value per MW rises. India shell-and-core is **$6.5 M/MW** against a global average of $11.3 M/MW.

Useful derived anchor: **gensets are roughly 9% of data-centre capex (≈₹5.85 cr/MW), giving a genset TAM of about ₹12,000–12,500 crore against 2.2 GW of new Indian capacity to FY30.** Applying 30% electrical to the same 2.2 GW at ₹65 cr/MW gives **roughly ₹43,000 crore of electrical and power equipment over FY26–FY30, about ₹8,500 crore a year.**

Named Indian beneficiaries flagged by analysts: **power/electrical — CG Power, KEI Industries, Polycab, Siemens India; cooling — Blue Star, Voltas; network — Sterlite Technologies, HFCL; hardware — Netweb, Dixon.** [Deep Dive Capital](https://deepdivecaps.substack.com/p/indias-data-center-revolution-5x)

**Supply constraint worth noting:** transformers and HV switchgear now carry **52–80 week global lead times** ("12+ months to arrive"). That is a structural opening for Indian capacity.

---

## 6. The 800 VDC transition — what new locally-bought hardware it creates

### 6.1 NVIDIA's published roadmap

From [NVIDIA's 800 VDC architecture post, 11 Aug 2026](https://blogs.nvidia.com/blog/800-vdc-power-architecture-ai-factory/):

| Stage | What it is | Timing | Where it sits |
|---|---|---|---|
| **MGX-compatible 800 VDC power rack ("sidecar")** | A rack that sits beside the compute rack and does AC→800 VDC locally. **"No changes to the building's electrical system required."** | **Second half of 2026** | Inside the data hall, **but bought as equipment, not pre-installed in the compute rack** |
| **Row power center** | Feeds **up to 2 MW per row** via an **overhead 800 VDC busway** across multiple rack rows | **2027** | **Facility side — bought and installed locally** |
| **DC power block** | Direct medium-voltage → 800 VDC conversion at facility scale (solid-state transformers) | "the decade ahead" (~2029+) | Facility side |

Standards: **OCP white paper March 2026** (joint work with Google and Microsoft); **OCP LVDC Solid-State Transformer Specification v0.3, July 2026**. **More than 80 equipment manufacturers and infrastructure companies are already building products to the spec.** NVIDIA claims up to 45% less copper versus the equivalent AC distribution.

Rack generations and power (carried from prior verified research; NVIDIA public specs): GB200/GB300 NVL72 ≈ **120–132 kW/rack**; Vera Rubin NVL144 higher; **Rubin Ultra NVL576 in Kyber ≈ 600 kW/rack**, with a roadmap toward ~1 MW racks. Kyber is the rack that requires 800 VDC.

### 6.2 What 800 VDC creates, and on which side of the import line

| New hardware category | Inside the rack (imported, pre-installed) | Facility side (bought and fitted in India) |
|---|---|---|
| 800 V rack busbar, power shelves, BBUs, supercapacitor banks, DC-DC converters | **Yes — all of it** (Delta, Lite-On, Flex, Lite-On, Murata) | — |
| **Overhead 800 VDC busway (row-level)** | — | **Yes — this is a locally-installed facility product, 2027 onward** |
| **AC/DC power centre ("sidecar" / row power center)** | Sold as a packaged unit; likely imported initially | Installed locally; Indian panel/enclosure content possible |
| **DC protection — solid-state circuit breakers, DC MCCBs, DC fuses, isolation** | — | **Yes — new switchgear/panel category, ~2028–29** |
| **DC cable and cable assemblies, DC busbar joints/tap-offs** | — | **Yes** |
| Solid-state transformers (MV→800 VDC) | — | Facility side, but this is ABB/Eaton/Schneider/Hitachi territory |

**Net effect for an Indian manufacturer:** 800 VDC **grows** the locally-bought bucket (DC busway, DC protection panels, DC cable assemblies, enclosures and skids for power centres) from roughly 2028–29, and **shrinks** part of the traditional AC bucket (centralised UPS, some floor PDU) over the 2030s. The *first* Indian 800 VDC purchases will be facility busway and protection, not rack internals.

**India-specific 800 VDC status: UNVERIFIED / essentially nil.** No Indian data centre was found publicly committed to 800 VDC as of Sep 2026, and no BIS standard or CEA regulation specific to 800 VDC distribution in buildings was located. This is a 2028+ market in India, with design work starting ~2027.

---

## 7. Government scheme money flowing to data centres and AI hardware

### 7.1 National schemes — verified amounts (keep these separate)

| Programme | Amount | Status and what it means |
|---|---|---|
| **IndiaAI Mission** | **₹10,371.92 crore** (5 years) | Compute subsidy, not hardware manufacturing. Under ₹400 cr disbursed in two years. [PIB 6 Aug 2026](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2295477&lang=1&reg=3) |
| **PLI 2.0 for IT Hardware** | **₹17,000 crore** | Covers servers but **not AI servers**; about 5% incentive; revamp announced Mar 2026, **not yet notified** |
| **ECMS (Electronics Component Manufacturing Scheme)** | Originally ₹22,919 cr, **raised to ₹40,000 crore** in Budget 2026–27 | **106 approved projects across 15 states, ₹69,548 cr approved investment, 38 plants in production (Aug 2026).** Segments A/B/C/E **closed 30 Sep 2025**; **Segment D open to 30 April 2027** — ₹10 cr minimum investment, **25% capex incentive**, covering sub-assemblies, bare components and capital goods for electronics manufacturing. [PIB factsheet 17 Sep 2026](https://www.pib.gov.in/FactsheetDetails.aspx?ModuleId=16&NoteId=151016&id=151016&lang=1&reg=3); [ECMS portal](https://ecms.meity.gov.in/) |
| **Semicon India 2.0 / ISM 2.0** | **₹1,27,500 crore** | Cabinet 15 Jul 2026, notified 31 Aug 2026, manufacturing guidelines 16 Sep 2026. Equipment and materials category: 30% of eligible capex, **₹50–300 cr minimum capex** plus revenue floors. Equipment makers additionally receive **10/8/6/4/2% over five years from FY2028–29 on the value of components bought from Indian manufacturers** — an indirect pull for small Indian suppliers. [ISM](https://ism.gov.in/) |
| Semicon India 1.0 (legacy) | ₹76,000 crore | 12 approved projects, about ₹1.64 lakh cr of investment commitments. **India's first fab (Tata–PSMC Dholera, ₹91,526 cr) starts at 90 nm with commercial operations mid-2028 — it will not make AI GPUs.** |

**ECMS does explicitly reach data-centre hardware components.** Minister of State Jitin Prasada confirmed that **ECMS covers optical transceivers and passive components for servers, routers and networking systems** ([Swarajya, 20 Dec 2025](https://swarajyamag.com/news-brief/india-pushes-local-manufacturing-of-servers-and-hardware-for-ai-and-data-centres)). Approval tranches: 17 projects / ₹7,172 cr (Nov 2025), 22 more (Jan 2026), 31 more (Aug 2026). **DLI has supported 24 chips/SoCs targeting servers, AI devices, telecom equipment and smart meters.**

**A localisation lever worth watching: CERT-In's updated technical guidelines (July 2025) introduced Bill-of-Materials requirements for servers, AI systems, quantum computing and cryptography.** A supply-chain-security BOM mandate is the kind of instrument that can become a de-facto local-content rule, as it has elsewhere. Nothing has been mandated yet.

**Critically: there is NO Indian government scheme specifically targeting data-centre equipment manufacturing (cooling, power, racks).** ECMS Segment D is the nearest fit and is generic electronics sub-assemblies and capital goods; ISM 2.0's component incentive applies to semiconductor equipment, not data-centre equipment. Any claim of a "data centre PLI" is wrong as of 19 September 2026.

### 7.2 Fiscal and customs treatment of data centres

- **Union Budget 2026–27 data-centre tax holiday — now corroborated by a third, better source.** **Zero tax through 2047** on revenue from cloud services **sold outside India but run from Indian data centres**; a **15% cost-plus safe harbour**; and a five-year tax exemption for foreign firms supplying equipment or tooling to bonded-zone toll manufacturers from April 2026. Minister Ashwini Vaishnaw said it could drive **$200 billion** of data-centre investment. [TechCrunch, 1 Feb 2026](https://www.techcrunch.com/2026/02/01/india-offers-zero-taxes-through-2047-to-lure-global-ai-workloads); also [RESI India](https://www.resiindia.org/post/india-s-data-centre-market-a-strategic-analysis-of-capacity-expansion-investment-economic-multip) and [IBTimes](https://www.ibtimes.co.in/ai-infrastructure-supercycle-data-centres-navigate-power-crunch-cooling-revolution-indias-902826). **Still no primary Budget or PIB document retrieved — treat as well-corroborated secondary.** Note the scope: the holiday targets **export of cloud services**, not domestic consumption, and it benefits the data-centre operator, not its equipment suppliers.
- Customs: GPUs under **HS 8471.80 attract 0% BCD (MFN)**; a GPU integrated into a complete server travels under 8471.41/8471.49, also 0%. **There is no import-duty wall protecting an Indian AI-server or GPU assembler.** [Carra Globe HS guide](https://carraglobe.com/hs-code-for-servers-8471/)
- Finished fibre patch cords enter at 0% BCD while fibre connectors pay about 7.5% plus surcharge — an **inverted duty structure** that penalises Indian assembly of cable products.

### 7.3 State data-centre policies

Fifteen-plus states run overlapping incentive packages. The typical package ([RESI India](https://www.resiindia.org/post/india-s-data-centre-market-a-strategic-analysis-of-capacity-expansion-investment-economic-multip)): **capital subsidy up to 25%, 100% electricity-duty waiver, 50% wheeling-charge reduction, 25–100% land and stamp-duty exemption, SGST reimbursement.**

Leading states by data-centre investment (CBRE, Apr 2026): **Telangana, Maharashtra, Tamil Nadu, Andhra Pradesh, Uttar Pradesh.** Karnataka is not in the top five — Bengaluru holds only about 7% of national capacity.

State targets and packages confirmed in 2026:

| State | Target / package | Date |
|---|---|---|
| **Gujarat** | **7.5 GW of data-centre capacity, ₹6 lakh crore** | Jul–Aug 2026 |
| **Uttar Pradesh** | **2 GW additional capacity, ₹2 lakh crore** | Jul 2026 |
| **Haryana** | **100% electricity-duty exemption for 20 years** | — |
| **Andhra Pradesh** | **100% SGST reimbursement plus 20-year duty exemptions** | Dec 2024 |
| **Telangana** | ₹10,000 cr CtrlS AI cluster; leading state by DC investment | 2026 |

Source: [Data centre industry in India (Wikipedia, compiled state policies)](https://en.wikipedia.org/wiki/Data_centre_industry_in_India); CBRE via Business Today.

**No state data-centre policy found requires local sourcing of data-centre equipment.** The incentives go to the data-centre owner, not to its equipment suppliers. For a Bengaluru manufacturer, the relevant Karnataka routes are the **Karnataka Special Incentives Scheme for ESDM 2020–2030** and the state industrial policy zones (Dabaspet/Nelamangala = Bengaluru Rural Zone 3; Tumakuru Zone 2), not any data-centre policy. A real sanction under the ESDM scheme was confirmed on 1 June 2026 (Aequs, Dharwad), so the scheme is live and paying.

---

## 8. THE TABLE: pre-installed and imported vs bought and fitted in India

Three states, not two. This distinction is the whole report:

- **State A — pre-installed and imported.** Arrives already bolted inside a server, rack or container built abroad. No Indian purchase order exists. **Not an India market.**
- **State B — bought and fitted in India, currently imported as a finished product.** An Indian buyer places the order and the item is installed on Indian soil, but the product itself is made abroad. **This is an India market with an open localisation gap — the best kind of opportunity.**
- **State C — bought and fitted in India, already made in India.** An Indian buyer orders it and Indian factories supply it. **This is a proven India market; the Indian incumbents are the evidence.**

### 8A. State A — pre-installed and imported (NOT an India market)

| Hardware item | Arrives inside | Who builds it | Pre-installed share | Indian local share |
|---|---|---|---|---|
| GPU / AI accelerator (Blackwell, GB300, MI455X) | Server tray / NVL72 rack | TSMC + Foxconn/Quanta/Wistron | ~100% | **0%** |
| HBM, DRAM, SSD, CPU | Server tray | SK hynix, Micron, Samsung, TSMC | ~100% | **0%** |
| GPU baseboard / motherboard PCBA | Server tray | Taiwan ODMs | ~95%+ | ~0–5% (Syrma–Giga Chennai builds general server boards) |
| NIC, switch silicon, optical transceivers | Server / switch | Broadcom, NVIDIA, Marvell | ~100% | **0%** |
| **Cold plates (direct-to-chip)** | Server tray | Cooler Master, AVC, Auras, Boyd, CoolIT | ~100% | **0%** — about 47% of rack cooling value |
| **Quick disconnects (UQD) and in-tray tubing** | Server tray | Stäubli, Danfoss, Parker, CPC, Fositek | ~100% | **0%** — about 18% of rack cooling value; a GB200 rack uses 198 QDs |
| **NVL72 rack cooling manifold** | Rack | ~10 Taiwan manifold makers | ~100% | **0%** — about 10% of rack cooling value |
| **In-rack CDU** (Delta's 140 kW unit for GB300 NVL72) | Rack | Delta, Vertiv, CoolIT | ~100% when rack-mounted | ~0% |
| **Power shelves / PSUs (8 shelves × six 5.5 kW)** | Rack | Delta, Lite-On, Flex | ~100% | **0%** |
| **Rack busbar (50–51 V DC)** | Rack | TE, Delta | ~100% | **0%** |
| **BBUs (battery backup units)** | Rack | Delta, Lite-On | ~100% | **0%** |
| NVLink spine, internal rack cabling | Rack | Foxconn, Quanta | ~100% | **0%** |
| 800 V rack busbar, supercapacitors, DC-DC (future Kyber) | Rack | Delta, Flex, Infineon, Navitas, MPS | ~100% expected | **0%** |
| Server chassis sheet metal (for imported units) | Server | ODM in-house | ~90% | ~10% — only the Netweb / VVDN / Lenovo / Dell India build |

**Roughly 60–70% of an AI data centre's total capex sits in this block, and India captures essentially none of it.**

### 8B. State B — bought and fitted in India, but currently imported (the localisation gaps)

| Hardware item | Who buys it in India | Pre-installed? | Indian local share | Confidence |
|---|---|---|---|---|
| **White-space overhead track busway (Starline / Canalis KDP type)** | Electrical contractor, operator | **0% — installed on the Indian site** | **Likely near zero** | **UNVERIFIED** — no Indian manufacture found; global busway revenue is 62–68% concentrated in Eaton, Schneider, Siemens, ABB, Legrand |
| **Intelligent / metered / switched rack PDUs** | Operator | **0% — fitted into the cabinet in India** | **Likely near zero.** Estimated **8–12% of the electrical package** | **UNVERIFIED** — Raritan PX4, Server Technology PRO4X, Vertiv Geist, Panduit, APC are all US-engineered lines with no confirmed India manufacture |
| **HV gas-insulated switchgear** | Operator / utility | 0% | **Predominantly imported** | Sourced |
| **2–3 MW class genset engines** | Genset OEM | 0% | **Imported.** Cummins QSK60 is made in India; **QSK78 and QSK95 — the hyperscale engines — are imported from the parent** | Sourced |
| **CRGO electrical steel** (inside every transformer) | Transformer maker | 0% | **Almost entirely imported** (Japan, Korea, China). JSW's Thyssenkrupp Nashik acquisition targets 350,000 t by FY2028 | Sourced |
| **Power semiconductors, controls, PCBAs inside UPS** | UPS maker | 0% | Imported | Inferred |
| **Lithium cells for UPS/BESS** | Battery packer | 0% | Imported until Indian gigafactories ramp (Amara Raja 16 GWh Telangana; Exide 6 GWh Bengaluru) | Sourced |
| **EC fans for dry coolers and CRAHs** | Cooling OEM | 0% | Imported | Sourced |

### 8C. State C — bought and fitted in India, already made in India

| Hardware item | Pre-installed? | **Estimated Indian local share** | Who already does this in India |
|---|---|---|---|
| **Cables, earthing, containment, cable trays** | 0% | **90–100%** | Polycab, KEI, Finolex, Havells, RR Kabel |
| **Secondary-loop piping, prefab spools, row manifolds (304L SS)** | **0%** | **High — mostly site-welded today, prefab emerging** | ~46 orbital-welding firms; Aeroflex (skids); MEP contractors in-house |
| **LV switchboards, PCC-MCC panels, e-houses** | 0% | **75–90%** | C&S Electric (Siemens), Lauritz Knudsen, Schneider India, ABB India, Adlec, Sudhir |
| **RPPs and floor PDUs** | 0% | **~75–80%** | Schneider Bengaluru; licensed panel builders under Schneider/ABB/Siemens/Vertiv |
| **Rising mains and LV–MV busduct** | 0% | **Indian** | C&S Electric (Isobar), Godrej Enterprises, Schneider India, Vertiv India |
| **Transformers (oil and dry, 33/11 kV)** | 0% | **65–75%** (CRGO imported) | CG Power, Hitachi Energy India, Voltamp, Kirloskar Electric, T&R |
| **MV switchgear, RMUs, HT panels** | 0% | **65–75%** | Siemens/C&S, ABB, Schneider, CG Power, Voltamp |
| **Gensets at set level, enclosures, fuel systems, control panels** | 0% | **60–80%** (2–3 MW engines imported) | Cummins India, Kirloskar Oil Engines, Mahindra Powerol, Jakson, Sterling Green Power |
| **UPS (large frame)** | 0% | **35–55%** | Schneider Bengaluru (three-phase UPS), Socomec Gurugram (1,000–1,200 kVA), ABB Nelamangala, Delta Krishnagiri, Vertiv, Legrand |
| **Chillers** | 0% | **~60–70%** | Voltas, Blue Star, Carrier Sri City (₹863 cr), Kirloskar Chillers |
| **Dry / adiabatic coolers** | 0% | **Coils ~70%+, frames ~90%; EC fans imported** | KRN Heat Exchanger, Modine/Airedale Chennai |
| **Pumps, valves, filters, water treatment, skids** | Inside CDUs only | **High** | Kirloskar Brothers, Grundfos India, Wilo India, Alfa Laval Pune, Aeroflex |
| **Cooling towers** | 0% | **High** | Paharpur — but declining on water-use grounds |
| **Row / facility CDUs** | Row CDUs 0% | Assembly rising; internals imported | Schneider/Motivair Bengaluru, Samsung FläktGroup Pune, Refroid, KühlTherm |
| **CRAH / in-row / precision air** | 0% | Mixed | Vertiv (Chakan, 210,000 sq ft thermal plant), Stulz, Schneider, Blue Star |
| **Server racks, cabinets, aisle containment, cable management** | 0% for air-cooled; **100% for NVL72-class** | **High** | Netrack and Valrack (both Bengaluru), Rittal India, APW President, Pentagon Rack, ESSAE, Godrej |
| **UPS batteries / BESS packs** | 0% | Assembly Indian, **cells imported** | Amara Raja, Exide, HBL Power, Okaya |
| **Structured cabling, fibre trunks, patch cords** | 0% | **High** | STL, HFCL, Polycab, Birla Cable, Finolex, Corning Pune |
| **Raised floor, plinths, enclosures, sheet-metal fabrication** | 0% | **Very high** | Many |
| **(2027+) Overhead 800 VDC busway; (2028+) DC protection panels and DC cable assemblies** | 0% | **New category — no Indian incumbent** | None yet |

**Roughly 25–35% of an AI data centre's total capex sits in blocks B and C together, and India already captures 55–70% of the electrical half of it.**

### 8D. The one-line answer to the central question

> **Is the past finding still true in September 2026? Yes.**
> About 85–95% of AI GPUs entering India still arrive inside servers and racks built abroad. In-rack cooling and power parts — cold plates, quick disconnects, NVL72 manifolds, power shelves, rack busbars, BBUs — still arrive pre-installed, integrated at L10 (tray) and L11 (full rack) by Foxconn (~40%), Quanta (~30%) and Wistron/Wiwynn before shipment. **MeitY's own Joint Secretary put GPUs at 70% of AI-server cost rising to 90–92%, with about 90% of that value originating abroad, in March 2026.** Nothing in this sweep contradicts it.
>
> **What has shifted, all small and all in 2026:** Netweb launched India-made **GB200** systems on 18 Feb 2026 and is building to over 150 kW per rack; the **Adani–Jabil LOI of 15 Jun 2026** names AI racks, PDUs, CDUs and busbars for Indian manufacture; **Supermicro signed a ₹477 cr Tamil Nadu MoU in Aug 2026**; **Syrma SGS began server-motherboard PCBA in Chennai**; **Schneider opened a liquid-cooling factory in Bengaluru on 18 Feb 2026**; and **Delta approved a 42,938 m² data-centre and BESS factory at Krishnagiri for Jun 2026 – Jun 2028**. PLI 2.0 still does not cover AI servers, and the redesign announced in March 2026 has not been notified.
>
> **The genuinely new finding of this sweep:** two significant items that are **bought and fitted in India but still imported as finished goods** — **white-space overhead track busway** and **intelligent rack PDUs**, together roughly 8–12% of the electrical package. These are not pre-installed. They are open localisation gaps.

---

## 9. Unverified items and conflicting sources

| Item | Status |
|---|---|
| **Ministry of Power: 26.3 GW of additional AI data-centre load by 2031–32** (written reply, 29 Jul 2026; some outlets say 27 Jul) | Verified, and nearly **double the March 2026 estimate of 13.56 GW** |
| 20-year data-centre tax holiday to 2047, Union Budget 2026–27 | **UNVERIFIED.** Two secondary sources; no primary Budget/PIB document retrieved |
| PLI 3.0 / AI-server category | **UNVERIFIED — announced intent only.** MeitY consultations announced Mar 2026; nothing gazetted as of 19 Sep 2026 |
| MeitY national data-centre policy with single-window clearance | **Still unnotified as of Aug 2026** |
| India operational capacity mid-2026 | **CONFLICT:** 1.12 GW (Jun 2025) / 1.3–1.53 GW (early 2026) / 1.6 GW (JLL) / 1.7 GW (CBRE) / 1.789 GW (Knight Frank). The gap is **IT load vs total installed/sanctioned capacity** — always ask which |
| India capacity 2030 | **CONFLICT:** 4–5 GW (RESI base) / 6 GW by 2029 (JLL) / 8–9.2 GW (RESI AI case) / 9 GW (government target) / 12 GW (Wood Mackenzie, energetica) / 13.5 GW by 2032 |
| India DC electricity demand | **CONFLICT:** 10 TWh (2025) rising 20× by 2040 to ~7% of demand, versus 10–15 → 40–45 TWh over the decade |
| IndiaAI GPU count | **CONFLICT:** 34,333 → 38,183 (Inc42) vs **45,000+ as of June 2026** (PIB 13 Aug 2026) vs **17,300 actually installed** (June 2026). Empanelled ≠ installed |
| AWS India investment | **CONFLICT:** $12.7 bn (AWS/Business Standard) vs $35 bn (analyst tallies) |
| India data-centre cost per MW | **CONFLICT:** ₹35–45 cr (Blackridge) / ₹42–50 cr implied by ICRA / ₹46–50 cr implied by CRISIL / ₹50–95 cr (IMARC) / ₹150–200 cr for "frontier AI" (low-authority Substack). Rating agencies are costing phased shell-and-core colocation; consultants are costing fully fitted AI-ready facilities |
| Facility capex split | **CONFLICT:** electrical 25–35% (IMARC, India) / 40–45% (Global Data Center Hub) / **48% liquid-cooled vs 54% air-cooled (Turner & Townsend)** / 50% (Substack, which also double-counts UPS and switchgear and should be treated as unreliable). Note T&T's finding that electrical's *share* is **lower** in liquid-cooled AI builds, contradicting the common narrative |
| Cummins' share of India's DC genset market | **CONFLICT:** ~55% (Communications Today) vs >80% (JM Financial). Use 55–80% |
| CPCB IV+ applicability to data-centre gensets | **CORRECTED:** CPCB IV+ covers engines **up to 800 kW**; typical 2,000–3,000 kVA DC sets are above that and fall under a separate standard. Warrants a legal check |
| India data-centre rack market size | **CONFLICT / likely error:** Mordor gives USD 4.21 M (2025), which is implausible. Use ₹400–1,000 cr |
| Reliance total AI investment | **CONFLICT:** ₹10 lakh crore / ~$110 bn group AI plan over 7 years vs $20 bn for the 3 GW Gujarat complex vs $12–15 bn Meta JV. Different scopes, not the same number |
| L&T order book and the ₹15,000 cr LTN Compute / Vyoma.AI NVIDIA B300 order | **CONFLICT / SECONDARY:** ₹7.4 vs ₹7.8 lakh cr order book; the ₹15,000 cr AI order is single-sourced |
| 800 VDC in India | **UNVERIFIED — essentially nil.** No Indian site publicly committed; no BIS or CEA standard for 800 VDC building distribution located |
| White-space track busway and intelligent rack PDU manufacture in India | **UNVERIFIED** — no evidence of Indian manufacture found, and none of the contrary either |
| **Netweb "India-made GB200" (18 Feb 2026)** | **CONFLICT — likely wrong.** Carried from the prior research ledger but **not corroborated**. A dedicated search found **no evidence of any NVL72-class rack integrated in India**. What exists is the 26 Feb 2026 Vertiv–Netweb announcement of >200 kW/rack liquid-cooled designs, plus Netweb's NVIDIA **MGX node-level** work. **MGX ≠ NVL72** |
| "Supermicro + Netweb JV" | **FALSE.** No such JV. Supermicro's India move is a standalone ₹477 cr Chennai plant (14 Aug 2026). Supermicro appears only as a legacy "alliance" logo on an old Netweb page |
| "Netweb Amritsar plant" | **No evidence found.** All Netweb capacity references are Faridabad, plus a planned Faridabad-2 |
| Altos/Acer local value | **CONFLICT within one company:** ">51%" (R370 CPU server) vs "60–80% depending on CPU" vs "80–85% of the overall activity". **Activity share is being used interchangeably with value share across Indian coverage — always ask which.** Use 51% as the defensible figure, and 20–21% as the industry-standard local value addition on Indian-assembled compute |
| **India's server/GPU import value by HS code** | **GENUINE DATA GAP, not a search failure.** India's trade statistics do not separate "GPU server" from "automatic data processing machine" under HS 8471. India's broad computer-hardware import bill was **>$18.5 bn in FY2025** (Statista). Moody's ~0.13% GDP / ~$9 bn finding is the closest published proxy |
| DAC/AEC copper cable manufacture in India | **None found — appears to be a genuine gap** |
| Foxconn, Tata Electronics, Sanmina, Cisco, Ciena, Tejas, Amber/ILJIN | **No server or data-centre hardware activity found.** Foxconn Devanahalli (₹20,000 cr, 300 acres, 30,000 hired) is **phones only** |
| Foxconn Tamil Nadu AI-server activity | **NOT DISCLOSED** |
| VRLA vs lithium split in Indian data centres | **UNVERIFIED** — no source found. A real gap |
| Tata Power / ReNew / Greenko data-centre PPAs | **UNVERIFIED.** Do not cite the Adani Energy–MSEDCL 2,500 MW RTC PPA (8 Sep 2026) or the Adani Power–Reliance 500 MW deal as data-centre PPAs — they are not |
| "70–80% of AI-server manufacturing processes occur in India" | Verified quote, but it means **process steps, not value**. Value remains ~90% imported. Do not let anyone conflate them |

**Research limitation:** this session's WebSearch budget (200 calls) was exhausted partway through. Later evidence was gathered by direct page fetches and from the prior verified research ledger in this project (`Manufacturing_Research_Handoff.md`, `AI_DataCentre_Hardware_Evidence_2026-09-19.md`, `AI_Semiconductor_Government_Funding_2026-09-19.md`). Several high-value pages (Knight Frank, Business Standard, DCD, Schneider's India blog, the PIB factsheet, IEEFA) returned HTTP 403 to direct fetch and are cited through secondary reporting.

Three parallel research threads — deeper verification of (a) the cooling supply chain and 800 VDC ecosystem, (b) state data-centre policy texts, and (c) the AI-server BOM and India import data by HS code — did not return within this session. The findings above on those three topics rest on this session's own fetches plus the prior verified research ledger, and the specific items they were meant to close are the ones already marked UNVERIFIED in this table. The highest-value open questions for a follow-up are: **(1) whether Legrand, Vertiv or Schneider manufacture intelligent rack PDUs or white-space track busway at an Indian plant** (this would move opportunity 7 down); **(2) primary confirmation of the Union Budget 2026-27 data-centre tax holiday**; and **(3) DGCI&S import data under HS 8471 to put a rupee value on India's server and GPU imports**, which would let the 85-95% pre-installed estimate be replaced with a measured number.

---

## CANDIDATE MANUFACTURING OPPORTUNITIES

Ten physical products this boom pulls demand for **inside India**, ranked purely on market potential: total India market size, growth to 2030, strength of any scheme or notified deadline forcing the purchase, and how much of the product is genuinely bought and fitted in India.

**Capex is not a ranking factor.** **Existing Indian competitors are listed as market intelligence under "Who already does this in India" and are treated as proof that the product is genuinely bought here — they never lower a rank.** The single exception is where competition demonstrably changes the economics (a true per-kilogram commodity with structurally thin margins), which is stated explicitly with evidence.

Market sizes marked **[found]** come from a published report; **[derived]** are calculated from capacity, capex-per-MW and local-share figures in this report and are estimates.

---

### 1. Electrical power distribution assemblies for AI data halls — RPPs, floor PDUs, LV switchboards, e-houses, busway tap-off boxes and power whips

**What it is:** the metal-and-copper boxes that take power from the UPS output and split it down to each rack row and each rack — remote power panels, floor PDUs, low-voltage switchboards, packaged e-houses, busway tap-off boxes, joint packs and the flexible whips that plug into a rack.

- **Who buys it in India:** operators via their electrical contractor; EPC firms (L&T, Sterling & Wilson, Tata Projects, Techno Electric); and the licensed panel-builder channels of Schneider, ABB, Siemens and Vertiv. Built in India under an OEM's type-test and licence.
- **India market now → ~2030:** India data-centre **power market $990 M (2025) → $2.64 bn (2031) at 17.72% CAGR [found]**, within which **power distribution units are the fastest-growing component at 21.85% CAGR [found]**. Busway/RPP/floor-PDU/rack-PDU is **8–12% of the electrical package [derived]**, and the electrical package runs to roughly **₹43,000 crore over FY26–FY30, about ₹8,500 crore a year [derived]**. RPP and floor-PDU slice **₹300–450 cr (2026) → ₹1,200–2,000 cr (2030) [derived]**; busway tap-offs, joint packs and whips **₹150–250 cr → ₹700–1,200 cr [derived]**.
- **Import / pre-installed share:** **0% pre-installed.** Local content ~75–80% for RPPs and floor PDUs, 75–90% for LV switchboards.
- **Demand pull: VERY STRONG.** Electrical is the largest addressable line (40–48% of AI facility capex; $10 bn of India's next $30 bn of DC capex). Every megawatt needs it, and AI racks at 40–130 kW need far more branch circuits and monitoring per MW than the 5–15 kW racks India built before. Order-book proof: **ABB India won the LT panels, packaging and e-house scope on a major Indian data-centre project in Q1 CY2026**, with a backlog of ₹11,898 cr by Q2; **Schneider Electric Infrastructure's order backlog rose 50.1% to ₹1,911 cr in FY26**.
- **Who already does this in India:** Schneider India (Bengaluru smart factory, ₹425 cr, 1 m sq ft, explicitly makes three-phase UPS and power distribution units, 80% exported), ABB India, Siemens/C&S Electric, Lauritz Knudsen (2.1 m sq ft of plants, ₹850 cr invested to 2026), Legrand (7 India plants), Vertiv, Godrej, plus hundreds of licensed panel builders such as Adlec and Sudhir. **That deep panel-builder ecosystem exists precisely because this product is always bought and built in India — which is the point.**
- **Bonus:** the same factory later makes **800 VDC DC protection panels and DC busway tap-offs from about 2028**, a brand-new category with no Indian incumbent.

---

### 2. Prefabricated stainless-steel liquid-cooling pipework — technology-loop spools, row manifolds and CDU connection kits

**What it is:** pre-made, cleaned, pressure- and leak-tested 304L stainless pipe assemblies and row manifolds that carry coolant between the CDU and each AI rack, delivered to site as finished modules instead of being welded in place.

- **Who buys it in India:** MEP contractors — **Blue Star does about ₹1,000 cr of a ~₹3,500 cr India DC MEP market**, plus Sterling & Wilson (90+ MW of IT load executed across 27+ data centres), Voltas (₹6,200 cr MEP order book), L&T and Tata Projects; cooling OEMs (Schneider/Motivair Bengaluru, Vertiv, Samsung FläktGroup Pune); and hyperscalers building their own halls.
- **India market now → ~2030:** **₹150–300 cr (2026) → ₹800–1,500 cr (2030) [derived]**, inside India DC cooling **$2.99 bn (2026) → $9.28 bn (2031) at 25.47% CAGR [found]** and India liquid cooling **~$110 M (2026) → ~$700 M (2030) [derived]**.
- **Import / pre-installed share:** **0% pre-installed — the cleanest line in the whole report.** The technology water loop between CDU and rack is by definition built on the Indian site. Mostly hand-welded in situ today; prefabrication is the growth mode.
- **Demand pull: VERY STRONG and accelerating.** Liquid-cooled share of AI chips globally goes 33% (2025) → 53% (2026) → ~60% (2027) (TrendForce); India was still 66% air-cooled in 2025, so its conversion is ahead of it. **MeitY's PUE <1.35 requirement in the IndiaAI GPU tender is a government-set floor that forces it.** Turner & Townsend put the mechanical package at **33% of a liquid-cooled AI facility's construction cost versus 22% air-cooled**, with cooling cost per MW rising from ~$1.8 M to **$4.5–5.2 M**. Schneider opened a liquid-cooling factory in Bengaluru on 18 Feb 2026 and was recruiting a Supplier Quality Engineer there in July 2026 — the Indian supplier base is being built right now.
- **Who already does this in India:** no component supplier is publicly confirmed with a named OEM customer, which is itself informative. Adjacent capability: about 46 orbital-welding firms across Ahmedabad, Pune, Bengaluru and Hyderabad (only ~6 in Bengaluru); Aeroflex (skids, expanding 6,000 → 9,000/yr from 1 Jul 2026, with a US hyperscaler contract for India); Incresol (Harohalli) and Thermovac Aerospace (Nelamangala). System-level incumbents: Schneider/Motivair, Vertiv, Samsung FläktGroup, Refroid (Hyderabad), KühlTherm (Ahmedabad, launched Aug 2026).

---

### 3. Data-centre server racks, cabinets, aisle containment and heavy-duty cable management

**What it is:** the steel cabinet a server sits in, plus hot/cold-aisle containment doors and roofs, cable ladders, brush plates and overhead pathway.

- **Who buys it in India:** every operator and integrator for air-cooled and conventional capacity, plus the Indian AI-server assemblers (Netweb, VVDN, Lenovo Puducherry, Dell Sriperumbudur) who buy or make chassis and cabinets locally.
- **India market now → ~2030:** **₹400–1,000 cr (2026) → ₹1,000–2,000 cr (2030) [derived]**, inside the **$7 bn "racks and fit-outs" slice of India's next $30 bn of DC capex [found]**. *(The published Mordor India rack figure of $4.21 M is flagged as an error in §5.4.)*
- **Import / pre-installed share:** **0% for air-cooled and non-rack-scale deployments — the cabinet is bought in India. 100% pre-installed for NVL72-class AI systems**, which arrive as a complete integrated rack. The addressable share therefore falls as AI density rises, which is why this ranks third rather than first. Containment, pathway and cable management stay 100% locally bought regardless.
- **Demand pull: STRONG.** India adds ~500 MW a year now and rising, and the great majority of that is still conventional colocation needing cabinets. IT-room build-out and racks are 5–10% of facility capex.
- **Who already does this in India:** **Netrack and Valrack (both Bengaluru)**, Rittal India, APW President Systems, Pentagon Rack, ESSAE, Godrej, Vertiv/Knurr. A dense Bengaluru cluster — which is exactly the evidence that Indian operators buy racks from Indian makers, and it is on the client's doorstep.

---

### 4. Genset packaging for data centres — acoustic enclosures, fuel systems, exhaust, radiators and synchronising control panels

**What it is:** not the engine or alternator, but everything wrapped around it — the acoustic enclosure, base fuel tank, day tank and fuel-polishing system, exhaust and silencer assemblies, radiators, and the genset control and paralleling/synchronising panel for multi-MW banks.

- **Who buys it in India:** genset OEMs (Cummins India, Kirloskar Oil Engines, Mahindra Powerol, Jakson, Sterling Green Power, Caterpillar India) and the data-centre EPCs ordering multi-MW synchronised sets.
- **India market now → ~2030:** **gensets are about 9% of data-centre capex (≈₹5.85 cr/MW), giving a genset TAM of roughly ₹12,000–12,500 crore against 2.2 GW of new Indian capacity to FY30 [derived]**, inside an India diesel-genset market of **$1.24 bn (2025) → $1.88 bn (2031) [found]** (IMARC's competing series: $996 M (2025) → $1,974 M (2034) — **conflict flagged**). Physical sizing: a 30–60 MW facility needs 8–15 large sets; a 1 GW campus needs several hundred.
- **Import / pre-installed share:** **0% pre-installed. Set-level local content 60–80%.** **Important nuance: the 2–3 MW engines themselves are imported** — Cummins makes the QSK60 in India but imports the QSK78 and QSK95, which are precisely the hyperscale sizes. **The packaging around an imported engine is therefore the Indian value-add, and it is a bigger share of the set price at those ratings.**
- **Demand pull: VERY STRONG, and the hardest evidence in this report.** **Cummins India: data centres were 30–35% of domestic power-generation revenue in FY26 (≈₹1,427–1,903 cr) and ~14% of total revenue, versus under 2% seven years ago; in Q1 FY27 data centres were 40% of power-generation sales, up from 23% a year earlier — nearly doubled in twelve months.** **Kirloskar Oil Engines took a 192 MW order from HyperNext in June 2026 (96 × 2,500 kVA).** **Sterling Green Power's order inflow went ₹1,100 cr (FY25) → ₹2,900 cr (FY26) → ₹3,700 cr by 30 Jun 2026, with a data-centre-linked order book of ~₹3,100 cr and ~80% of orders from Adani, AirTrunk and DAMAC**; it is planning a ₹1,500 cr IPO. Every data centre must carry N+1 or 2N standby generation regardless of how green its PPA is.
- **Correction to a common claim:** **CPCB IV+ applies only to engines up to 800 kW.** Data-centre sets of 2,000–3,000 kVA (≈1,600–2,400 kW) sit **above** that threshold under a separate standard. The "+20–35% cost from CPCB IV+" argument does **not** apply to hyperscale data-centre gensets. It does apply to sub-800 kW sets, which is a separate and still-large market.
- **Who already does this in India:** Cummins India (55–80% of the DC genset segment — sources conflict), Kirloskar Oil Engines (750–5,000 kVA; FY26 revenue ₹7,701 cr), Mahindra Powerol, Jakson, Sterling Green Power (250–5,000 kVA; building a Pune plant), Greaves Cotton, Caterpillar India. Enclosure and panel fabrication is already substantially subcontracted to Indian job shops — evidence that the outsourced tier exists.

---

### 5. Dry coolers, adiabatic coolers and heat-rejection coil assemblies for data centres

**What it is:** the roof- or yard-mounted heat-rejection units — finned coils, frames, headers, fan decks — that dump data-centre heat to air, plus the coil blocks inside them.

- **Who buys it in India:** MEP contractors and thermal OEMs for every data centre; increasingly chosen over cooling towers.
- **India market now → ~2030:** coil and frame assembly slice **₹30–80 cr (2026) → ₹150–400 cr (2030) [derived]**; the broader India DC cooling market is **$2.99 bn → $9.28 bn at 25.47% CAGR [found]**, of which air-side heat rejection is a large share since India is still 66% air-cooled.
- **Import / pre-installed share:** **0% pre-installed.** Local content: coils ~70%+, frames ~90%; **EC fans are imported** (a second localisation gap inside this product).
- **Demand pull: STRONG and structurally favoured.** Liquid-cooled AI racks run warm coolant (GB200 inlet 30–45°C), which makes **dry coolers viable without chillers** — so liquid cooling *increases* dry-cooler demand. India's DC water use goes from 150 bn litres (2025) to 358 bn litres (2030) and is politically sensitive, pushing designs away from evaporative cooling. Mumbai and Chennai, about 98% of H1 2026 additions, are hot and humid and are converging on hybrid dry-cooler plus trim-chiller designs.
- **Who already does this in India:** KRN Heat Exchanger (coils), Paharpur (cooling towers — the incumbent losing share to dry coolers), Kirloskar Chillers, Blue Star, Voltas, Thermax, plus the Indian operations of Modine/Airedale (Chennai) and Alfa Laval (Pune).

---

### 6. Cast-resin and oil distribution transformers, MV switchgear and RMUs for data centres

**What it is:** the 33 kV/11 kV to 415 V transformers and the medium-voltage switchgear and ring-main units that sit between the grid and the data hall.

- **Who buys it in India:** operators and their EPCs, plus the distribution utility for the incoming connection.
- **India market now → ~2030:** HV/MV substation, transformers, switchgear and RMUs are **20–25% of the electrical package [derived]**, so roughly **₹8,500–11,000 crore over FY26–FY30 [derived]** within India's data-centre build; India's dry-type transformer market alone is projected at **~$332 M by 2030 [found]**, with data centres named as a driver.
- **Import / pre-installed share:** **0% pre-installed.** Local content **65–75%** — **CRGO electrical steel is almost entirely imported** and **HV gas-insulated switchgear is predominantly imported**.
- **Demand pull: VERY STRONG on volume, with an unusual structural tailwind.** **Global lead times have stretched to 128 weeks for large power transformers, 144 weeks for generator step-up units and 45–80 weeks for switchgear; India-specific reporting puts transformer lead times at up to five years against 24–30 months pre-2020, with prices doubled.** A supplier who can deliver inside that window has a genuine advantage. The forcing number behind it: **the Ministry of Power told Parliament on 29 July 2026 that AI data centres will add 26.3 GW of load by 2031–32, nearly double its own March 2026 estimate of 13.56 GW**, against a ₹9.6 lakh crore transmission capex commitment through 2032.
- **Who already does this in India:** CG Power (order backlog ₹17,107 cr at FY26, +61%; **a ₹900 cr export order in Jan 2026 for transformers for a US data centre, its largest ever single order**; adding 45,000 MVA of capacity; EHV switchgear capacity +80% to 16,200 units/yr from 4 Jun 2026), Hitachi Energy India (**backlog ₹29,555 cr, +53.5%, with management naming data centres as the largest Q4 contributor**; building a ₹2,000 cr transformer plant at Karjan), Voltamp (16,514 MVA sold in FY26; 12 kV/630 A RMUs), Kirloskar Electric, TMEIC, Transformers & Rectifiers India, Siemens, ABB, Schneider.
- **Economics note (not a competition note):** **Voltamp's margins were squeezed by metal costs in FY26–27.** Copper and CRGO are pass-through risks in this category and belong in any business case.

---

### 7. White-space overhead track busway and intelligent rack PDUs — the two open import gaps

**What it is:** two products that Indian data centres buy and install on Indian soil but currently import as finished goods. (a) **Overhead track busway** — the Starline/Canalis-KDP-type busbar run above the rack rows with plug-in tap-off boxes, now the default white-space power distribution method in hyperscale. (b) **Intelligent rack PDUs** — metered, switched and outlet-level-monitored power strips inside the cabinet.

- **Who buys it in India:** operators and electrical contractors on every hyperscale and colocation build.
- **India market now → ~2030:** **busway, RPP, floor PDU and rack PDU together are 8–12% of the electrical package [derived]**; against roughly **₹43,000 crore of electrical equipment over FY26–FY30 [derived]**, the track-busway-plus-rack-PDU slice is on the order of **₹1,700–3,500 crore cumulative to 2030 [derived]**. India's overall busduct market is **~$394 M [found]** and growing; **PDUs are the fastest-growing power component at 21.85% CAGR [found]**.
- **Import / pre-installed share:** **0% pre-installed — both are fitted into the Indian data hall.** But **Indian manufacture appears to be near zero for both. FLAGGED UNVERIFIED:** no evidence of Indian manufacture of Starline/Canalis-KDP-type track busway was found, and Raritan PX4, Server Technology PRO4X, Vertiv Geist, Panduit and APC intelligent rack PDUs are all US-engineered lines with no confirmed Indian production. Global busway revenue is 62–68% concentrated in five firms (Eaton, Schneider, Siemens, ABB, Legrand).
- **Demand pull: STRONG, and this is the purest import-substitution case in the report** — a product Indian buyers already specify and pay for, with a domestic supply gap rather than a domestic incumbent. Two honest caveats: intelligent rack PDUs carry a **firmware, network-security and certification burden** that plain metalwork does not; and **high-density GPU racks often bypass rack PDUs entirely**, running power whips from the RPP or busway straight to the rack — so the rack-PDU half of this opportunity is anchored in India's conventional colocation base (still the great majority of capacity) rather than in the AI halls.
- **Who already does this in India:** for the track-busway and intelligent-rack-PDU products specifically, **nobody confirmed**. Adjacent Indian busduct makers who would be partners, customers or competitors: **C&S Electric (Siemens) Isobar range, Godrej Enterprises, Schneider India (630–6,300 A copper), Vertiv India.** Legrand India claims PDU leadership with 7 Indian plants, but its Raritan and Server Technology lines are US-engineered — **worth verifying directly, because if Legrand does build them at an Indian plant this ranking should move down.**

---

### 8. UPS systems and lithium battery cabinets for data centres

**What it is:** the modular three-phase UPS that rides through the seconds between grid loss and generator start, and the battery cabinets — increasingly lithium rather than VRLA — that feed it.

- **Who buys it in India:** operators, directly or through the MEP contractor.
- **India market now → ~2030:** **UPS is the largest single component of India's DC power market at 30.68% share of $990 M (2025) [found]**, growing with the market at 17.72% CAGR to $2.64 bn (2031) — roughly **$300 M (2025) → $700–800 M (2031) [derived]** for DC UPS alone. UPS plus batteries is **20–25% of the electrical package [derived]**.
- **Import / pre-installed share:** **0% pre-installed. Local content 35–55%** — the lowest of the major India-built power items. Power semiconductors, controls and PCBAs inside the box are imported; **lithium cells are imported** until Indian gigafactories ramp.
- **Demand pull: STRONG, with one architectural caveat stated honestly.** Every MW needs UPS today. But **the 800 VDC transition structurally shrinks the centralised AC UPS over the 2030s**, moving energy storage into in-rack BBUs — which are imported and pre-installed. Treat this as a strong 2026–2032 market with a long-dated architectural risk; **the lithium battery-cabinet half is the more durable side**, and Amara Raja has explicitly named data centres as its next growth engine after crossing 1 GWh of lithium ESS deployment in telecom.
- **Who already does this in India:** **Schneider's Bengaluru smart factory (₹425 cr, 1 m sq ft) explicitly makes three-phase UPS and power distribution units and exports 80% of volume; Socomec makes Delphys XL 1,000 and 1,200 kVA UPS at Gurugram; ABB's Nelamangala plant expanded UPS output about tenfold; Delta has approved a 42,938 m² data-centre and BESS factory at Krishnagiri (Jun 2026 – Jun 2028) inside a $500 M India investment; Vertiv runs Ambernath, Pune and Chakan.** Batteries: Amara Raja (16 GWh Telangana gigafactory), Exide (6 GWh Bengaluru gigafactory in commercial operation), HBL Power, Okaya. **The fact that four multinationals are all building UPS and DC-power capacity in India right now is the strongest possible signal that this is a real, locally-supplied market.**

---

### 9. Pump, filtration and heat-exchanger skids for data-centre facility water loops

**What it is:** factory-assembled modules containing pumps, valves, strainers, filtration, side-stream water treatment, instrumentation and a plate heat exchanger, shipped as one skid and dropped into the plant room.

- **Who buys it in India:** MEP contractors and operators; also CDU makers who outsource sub-assemblies.
- **India market now → ~2030:** **₹100–250 cr (2026) → ₹600–1,200 cr (2030) [derived]**, inside the cooling market above.
- **Import / pre-installed share:** **0% pre-installed** on the facility side — only the small brazed-plate exchangers inside imported CDUs are pre-installed.
- **Demand pull: STRONG.** Every liquid-cooled hall needs a facility water loop with filtration and water chemistry control before a single rack can be energised, and the commissioning sequence — flush, fill, bleed, pressure-test — is an Indian on-site activity. Delta's 3 MW liquid-to-liquid CDU began shipping in March 2026, which indicates the scale of facility-side plant now going into each hall. Ranked below the electrical items mainly on absolute market size, and it is working-capital heavy.
- **Who already does this in India:** Kirloskar Brothers, Grundfos India, Wilo India, Alfa Laval Pune, Aeroflex (skids), plus MEP contractors who fabricate in-house.

---

### 10. 800 VDC facility power hardware — DC busway, DC protection panels, power-centre enclosures and skids

**What it is:** the new facility-side electrical kit the 800 VDC architecture needs — overhead DC busway runs, DC-rated protection and isolation panels, solid-state DC breaker assemblies, DC cable assemblies, and the enclosures and skids for row power centres.

- **Who buys it in India:** electrical contractors and operators building post-2027 AI halls, and the OEMs (Schneider, ABB, Eaton, Vertiv, Delta, Siemens) who will need Indian enclosure and busbar partners.
- **India market now → ~2030:** **essentially zero today; ₹200–600 cr by 2030 [derived]**, ramping from about 2028. Anchored on NVIDIA's published roadmap: the **row power center supports up to 2 MW per row over overhead 800 VDC busway and arrives in 2027**; **more than 80 equipment manufacturers are already building to the OCP spec**; the facility-scale DC power block is a "decade ahead" product. India's busduct market today is **~$394 M [found]** — 800 VDC adds a new DC layer on top of it.
- **Import / pre-installed share:** rack-side 800 V busbars, power shelves, BBUs and supercapacitors are **100% pre-installed and imported**. **The busway, protection, cabling and enclosures outside the rack are bought and fitted in India** — exactly the split that makes this an opportunity.
- **Demand pull: WEAK NOW, POTENTIALLY VERY STRONG 2028–2032.** Ranked tenth on today's market size, not on prospects. **No Indian data centre has publicly committed to 800 VDC, and no BIS or CEA standard for 800 VDC building distribution was found — both flagged UNVERIFIED.** The offsetting attraction is that there is **no incumbent of any nationality established in India** for DC busway and DC protection, and NVIDIA claims 800 VDC uses up to 45% less copper, which matters with copper near $14,200–14,850/t.
- **Who already does this in India:** nobody, for the DC-specific products. The adjacent AC busway incumbents — Schneider (Canalis), Siemens/C&S, Legrand/Zucchini, Godrej, L&T — are the natural partners, customers or competitors.

---

### Ranking summary

| Rank | Product | India market 2026 → 2030 | Pre-installed share | Local-content gap | Pull |
|---|---|---|---|---|---|
| 1 | Power distribution assemblies (RPP, floor PDU, LV boards, e-houses, busway tap-offs) | ₹450–700 cr → ₹1,900–3,200 cr [derived] | 0% | Already 75–90% Indian | Very strong |
| 2 | Prefab SS liquid-cooling pipework and row manifolds | ₹150–300 cr → ₹800–1,500 cr [derived] | 0% | High Indian share, no named component supplier | Very strong |
| 3 | Server racks, cabinets, containment, cable management | ₹400–1,000 cr → ₹1,000–2,000 cr [derived] | 0% air-cooled / 100% NVL72 | High Indian share | Strong |
| 4 | Genset packaging, enclosures, fuel and synchronising panels | ~₹12,000–12,500 cr cumulative to FY30 [derived] | 0% | 60–80% Indian; 2–3 MW engines imported | Very strong (hardest evidence) |
| 5 | Dry / adiabatic coolers and coil assemblies | ₹30–80 cr → ₹150–400 cr [derived] | 0% | Coils ~70%, EC fans imported | Strong |
| 6 | Transformers, MV switchgear, RMUs | ~₹8,500–11,000 cr cumulative to FY30 [derived] | 0% | 65–75% Indian; CRGO and HV GIS imported | Very strong volume; metal-cost risk |
| 7 | **White-space track busway + intelligent rack PDUs** | ~₹1,700–3,500 cr cumulative to 2030 [derived] | 0% | **Near-zero Indian share — open import gap** | Strong; firmware/certification burden |
| 8 | UPS and lithium battery cabinets | ~$300 M → ~$750 M [derived] | 0% | 35–55% Indian | Strong now, architectural risk post-2030 |
| 9 | Pump / filtration / HX skids | ₹100–250 cr → ₹600–1,200 cr [derived] | 0% | High Indian share | Strong |
| 10 | 800 VDC facility hardware (DC busway, DC protection, power-centre enclosures) | ~0 → ₹200–600 cr [derived] | 0% facility side | **No incumbent at all** | Weak now, very strong 2028–32 |

**Excluded on the pre-installed rule and nothing else:** cold plates, quick disconnects, in-tray tubing, NVL72 rack manifolds, in-rack CDUs, power shelves, rack busbars, BBUs and 800 V rack internals. All are real, large, fast-growing global markets — and all arrive in India already bolted inside a rack built by Foxconn, Quanta, Wistron or Wiwynn. They are **export** businesses for an Indian manufacturer, not India-market businesses, and belong in a separate investment case.

**Flagged on economics, not on competition:** plain copper busbar sold by weight. Copper at roughly $14,200–14,850/t, a US Section 232 tariff of 50% on semi-finished copper and 25% on derivatives, concentrated buyers (ABB, Schneider, Siemens) and a prior model showing a pre-tax loss at 20% contribution margin make this structurally thin. **Engineered, insulated, type-tested busbar assemblies (inside opportunity 1) are a different product with different margins and are not affected by this note.**

**Also flagged on economics:** high-density fibre trunks and MPO assemblies were evaluated and left out of the top ten — not because STL, HFCL and Corning are present, but because of two measurable economics problems: an **inverted duty structure** (finished patch cords import at 0% BCD while fibre connectors pay ~7.5% plus surcharge) and modelled returns of about **11% EBITDA and ~4% pre-tax in year two [derived]**. The volume pull is genuine — an NVL72 fabric needs 1,152–1,200+ fibres, STL won a $1.11 bn hyperscaler contract for FY27–29, HFCL guides ₹700 cr+ of DC revenue in FY27 — so it belongs on a watch list, and a change in the duty structure would move it up.
