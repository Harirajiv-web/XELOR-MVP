# Manufacturing opportunity atlas research contract

Deliver a JSON array of assigned ideas. No ranking, no scores. Date 2026-09-19. Audience nontechnical founder starting in Karnataka with best-case capital/team/network, including stated H.D. Kumaraswamy connection. Existing earlier evidence in parent folder is useful but do fresh primary-source research for process/equipment/site/qualification. Preserve originals. Each idea is a SPECIFIED STARTER FACTORY, not every possible product in its sector.

Do not claim vendor quotations or exact engineering design. CAPEX, factory area, land, utilities, staffing and timeline must be explicit pre-feasibility planning assumptions unless a cited primary source supplies a truly comparable requirement. Explain cost boundary: INR crore, 2026 planning basis, leased existing industrial shell by default, land purchase excluded, recoverable GST excluded, working capital separate, no subsidy netted off. Greenfield land alternate area is a site-screening assumption, not an approved layout. Budget line low/high values must sum to total; separately list working capital. Do not invent market/import percentages or guaranteed orders/grants. Identify process stages outsourced initially and imported parts. 3D is an educational model, not a fabrication/CAD drawing.

Required JSON object fields (all strings plain text, no HTML/Markdown except URLs):
{
 "id":"cooling", "title":"AI liquid-cooling systems", "shortTitle":"AI cooling", "sector":"AI infrastructure", "plain":"2 simple sentences", "analogy":"one everyday analogy", "product":"what factory sells", "does":"how product helps buyer", "customers":["3-4 buyer types"], "whyNow":"specific evidence + [S1] IDs if needed", "firstProduct":"precise starter SKU/family", "notIncluded":"what larger scope this does not include", "entry":"practical route and tech partner scope", "capacity":"stated assumed production scale / shift basis",
 "budget":{"basis":"boundaries and estimate confidence", "items":[{"name":"Machine family / tooling / fitout / QA / launch / contingency", "low":1,"high":2,"note":"why needed; range is planning estimate"}], "workingLow":1,"workingHigh":2,"workingNote":"inventory, qualification/pilot cash, receivables assumptions", "landNote":"excluded land/civil costs explained", "confidence":"Planning estimate; needs vendor RFQs and site survey"},
 "site":{"builtup":"sq ft and sqm if useful; assumed", "plot":"acre alternate if greenfield; assumptions", "power":"screening load range; no sanctioned utility claim", "water":"screening range or project dependent with reason", "conditions":["clean zones etc"], "areas":[{"name":"production","share":35,"why":"purpose"}]},
 "team":[{"role":"role","count":3,"why":"plain duty"}], "teamNote":"one shift; setup specialist outside count; total coherent",
 "machines":[{"name":"machine/tool","quantity":"number/range","purpose":"simple function","spec":"RFQ variables; no false exact settings","sourceIds":["S1"]}],
 "process":[{"name":"step","plain":"simple action","detail":"what goes in/out","check":"acceptance gate","machine":"linked machine","sourceIds":["S1"]}],
 "modelParts":[{"name":"component/station","meaning":"plain description"}],
 "roadmap":[{"phase":"phase","duration":"Months 0-2","actions":"specific tasks","gate":"deliverable before more capex"}],
 "quality":[{"title":"test/requirement","detail":"what it validates; standard applicability conditional","sourceIds":["S1"]}],
 "localisation":[{"part":"item","route":"Make in India / Buy Indian / Import initially / Outsource","detail":"manufacturing depth"}],
 "schemes":[{"name":"scheme","status":"asof date and eligibility","detail":"direct grant vs demand support; exact conditions","sourceIds":["S1"]}],
 "network":"specific customer/technology introductions; no presumed government purchase order",
 "risks":[{"risk":"risk","response":"practical response"}],
 "first90":["3-5 real steps"],
 "sources":[{"id":"S1","title":"title","url":"https://...","publisher":"primary publisher","date":"publication or accessed date","supports":"exact claim; mark own estimates not derived from unrelated big project", "type":"Company / Government / Standard / Industry"}],
 "researchNote":"what verified, what assumed, missing commercial information"
}

Target 5-8 credible sources per idea, 6-9 machine rows, 6-8 process steps, 5-7 model parts, 5 roadmap phases, 3-5 risks. Use source IDs within each idea, unique per idea. Provide useful depth (roughly 900-1400 words per idea) but simple language. You may add fields if useful; keep required schema. Verify JSON syntax and budget arithmetic. Save only assigned JSON and optional separate research note. Tell root total investment, workforce, factory area per idea plus any unresolved issue. Do not change HTML/UI code.
