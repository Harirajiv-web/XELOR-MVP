# Supplemental video review log

Review date: 10 September 2026. Originals were preserved. Frames and audio were processed locally; no media was uploaded for transcription or QR decoding.

## Coverage and method

| Video | Duration and frames | Human visual review | Machine scan |
|---|---|---|---|
| `WhatsApp Video 2026-09-10 at 7.11.12 AM.mp4` — AnjX | 4.100 s; 123 frames at 30 fps; landscape | All five 1-second samples/contact sheet; full-size outer and inner spreads at 0, 2 and 4 seconds. | All 123 frames, native resolution and 2x scale, QR decoding with rotation/inversion. |
| `WhatsApp Video 2026-09-10 at 7.11.34 AM.mp4` — Slooze | 23.465 s; 704 frames at approximately 30 fps; 464×832 portrait | All 24 one-second samples/contact sheets; every distinct spread reviewed full-size, with sideways spreads rotated upright. | All 704 frames, native resolution and 2x scale, QR decoding with rotation/inversion. |

The all-frame decode found one unique QR in AnjX: `https://qrfy.io/TbOEEhO5KR`, beginning at frame 0. It found **no decodable QR in Slooze**. This means no additional readable code was found in the supplied video; it is not a guarantee that no tiny, covered or motion-blurred code exists. The QR destination audit for the AnjX code is in the main research evidence, not duplicated here.

Evidence: `evidence/video_review/full_frame_qr_scan.json`, `review_video_media.py`, `video_frames/video_1/`, `video_frames/video_2/`, and full-size upright images under `evidence/video_review/`. An initial all-barcode scan and a second QR-specific scan both completed with the same result. Human review covered sampled frames and all distinct page spreads, not an assertion of individually reading all 827 frames.

## Slooze page sequence and actual visible content

| Time | Document / visible pages | Reliably readable topics |
|---|---|---|
| 0–1 s | General company leaflet, “Why Us / Focus Four / Problem” | Experience and platform logos; four themes: Design, Discover, Delegate, Deliver. Design connects technical design to purchase/make jobs. Discover joins parts, vendors, inventory and market information. Delegate describes AI coworking and institutional knowledge. Deliver covers policy rollouts, leaderboards and reports. |
| 2–3 s | General leaflet, “Quick Check / Contact / Slooze” | Questions about preserving design intent, shared information, firefighting and measurable improvement. Positioning: accelerating design-to-delivery in manufacturing. Printed phone, location, website, booking and newsletter links. |
| 4–5 s | Procurement Professionals & CPO cover | “Procure-Tech Playbook”, September 2026, “Operational Excellence” edition. Cover says “In association with AOP, McKinsey & Company.” Printed contact is `playbook@slooze.xyz` — an email address. |
| 6 s | Procurement introduction and contents | Operator reality check; technology categories; operational playbook; about Slooze. Contents say “6 Process Upgrades for 2026.” |
| 7–8 s | Operator reality check + technology categories | Fragmented data, unmanaged tail spend, manual contract management, supplier onboarding bottlenecks, reactive risk management and adoption failures. Categories: source-to-pay; sourcing/cost; contract/legal; risk; strategy/process/performance; sustainable procurement; finance; B2B marketplaces. |
| 9 s | Operational playbook + about Slooze | The actual visible heading says **5 Process Upgrades** and displays five numbered boxes: unified spend visibility; maverick-procurement control; AI e-auctions; living contract repository; continuous supplier-risk monitoring. About page offers spend analytics setup, e-sourcing programmes, contract migration, supplier-onboarding automation and procurement-technology selection. |
| 10–11 s | Procurement back cover | Slooze branding, September 2026, same association claim, `www.slooze.xyz`, `hello@slooze.xyz`. |
| 12 s | Finance Leaders & Project Managers cover | Same playbook family; “Financial Leadership” edition; September 2026; email `playbook@slooze.xyz`. |
| 13 s | Finance introduction and contents | Procurement technology framed as capital allocation and P&L impact. Financial case, ROI categories, governance/measurement/growth, and about Slooze. |
| 14–15 s | Financial case + highest-ROI categories | Savings/cash statistics; CFO ownership of P&L, working capital, spending compliance, risk and ESG information. Categories: spend analytics, sourcing, source-to-pay, contract lifecycle, working capital, supply risk, ESG. |
| 16 s | Finance decision-maker playbook + about Slooze | Investment framework, finance-grade spend transparency, KPIs linked to business value, risk/governance controls, reusable business-case template. Services include ROI business cases, spend reporting, verified savings tracking, working-capital optimization and programme management. |
| 17–18 s | Finance back cover | Same website/email contacts and association claim. |
| 19 s | Owners & Risk Takers cover | “Strategic Risk” edition; September 2026; email `playbook@slooze.xyz`. |
| 20–21 s | Owners introduction and contents | Big picture, eight trend signals, five strategic moves and about Slooze. Contains a 20x productivity-potential statement attributed on the page to McKinsey & Company. |
| 22 s | Why procurement now + eight signals | Geopolitical fragmentation, AI, connected technology ecosystems, ESG and data quality. Signals: category convergence, real-world AI value, connected intelligence, modern contract management, connected source-to-pay stack, human-centred procurement, hybrid operating models and orchestrated ecosystems. |
| 23 s | Strategic playbook + about Slooze | Narrow AI pilot within 90 days, integration-debt audit, board-level supplier-risk view, procurement ESG discipline, and talent/upskilling. Services include procurement-tech advisory, pilot deployment, risk/ESG integration, board analytics and procurement due diligence. The clip ends before a full owner-edition back-cover view. |

The video shows brochures/playbooks, not a screen recording of working software. Dashboard, AI, support and implementation assertions should therefore be labelled as company claims unless corroborated separately.

## Slooze printed links and contact correction

The two cover addresses that might be mistaken for subdomains are emails:

- `playbook@slooze.xyz` — printed on the three playbook covers.
- `hello@slooze.xyz` — printed on back covers/about pages.

**`playbook.slooze.xyz` is not the printed address.** Its failed DNS lookup must not be described as a broken link supplied in the video.

Other visible contacts: Coimbatore, India; +91 9840629757; `www.slooze.xyz`; `meet.slooze.xyz/cal`; `about.slooze.xyz/news`.

### Supplemental redirect checks, 10 September 2026

| Printed link checked with HTTPS | Exact redirect chain | Content checked and limit |
|---|---|---|
| `https://meet.slooze.xyz/cal` | HTTP 302 → `https://zcal.co/slooze-cx/intro` → HTTP 200 | Destination is a zcal scheduling web application. HTML title is “zcal – Free Online Meeting Scheduling”; page requires JavaScript. Scheduling fields/availability were not rendered in this check. No meeting booked or form submitted. |
| `https://about.slooze.xyz/news` | HTTP 302 → `https://sloozexnewsletters.substack.com/` → HTTP 200 | “Slooze's newsletter,” described as product, team and industry updates by Slooze Inc. Public RSS feed was also checked successfully; nine posts were listed. No subscription submitted. |

Exact response evidence is in `evidence/video_review/slooze_link_audit.json`. The web retrieval tool could not render the scheduling page and several Substack post URLs; local read-only HTTP requests successfully checked redirects and the public RSS feed. This is an access/rendering distinction, not evidence that the sites are offline.

### Newsletter content found after following the printed link

The public RSS feed `https://sloozexnewsletters.substack.com/feed` returned HTTP 200. Latest listed posts were about ProcureCon Asia (12 July 2026), procurement in smart manufacturing (8 June), the procurement-technology value pyramid (1 June), and questions for procurement vendors (26 May). Three posts published on 6 April 2026 match the three filmed playbook audiences:

- [Finance Leaders & Project Managers](https://sloozexnewsletters.substack.com/p/procurement-playbook-for-finance): argues for trustworthy spend data, verified savings, payback and governance; attributes a 63x ROI benchmark to procurement analytics/Hackett Group rather than identifying it as a Slooze customer outcome.
- [Procurement Professionals & CPOs](https://sloozexnewsletters.substack.com/p/procurement-playbook-for-procurement): focuses on fragmented data, adoption, spend visibility and e-auctions; describes an operator playbook derived from ProcureTech100 material. Its text also alternates between five and six upgrades.
- [Owners & Risk Takers](https://sloozexnewsletters.substack.com/p/procurement-playbook-for-owners-and): treats procurement as a strategic issue and promotes bounded pilots; attributes 20x potential to ProcureTech100/McKinsey-related material. This does not independently validate a Slooze deployment.

The printed booklets are marked September 2026; the related newsletter posts are dated April 2026. They are related materials, not proven identical editions. RSS metadata/content are preserved in `slooze_news_feed.json` and `slooze_news_fulltext.json` in the same evidence folder.

## Slooze numerical-claim cautions

These are observations of vendor material, not research endorsements or AIKYANTRA targets:

- General leaflet: Design “85% clearer”; Discover “37% better”; Delegate “60% focus”; Deliver “KPI ready”. No denominator, study, sample or period is printed beside these figures.
- General leaflet claims 15+ years of SaaS experience, 8+ years of state-of-the-art AI experience and 90+ years combined domain experience. Later about pages say 10+ AI years. These are differing experience claims in the material, not independently verified company age or staff experience.
- Finance introduction: Coimbatore industries allegedly achieved 8–12% cost savings or 25–40% profit improvement, with ROI in 12–15 months. No named installation or calculation basis is supplied in the filmed passage.
- Finance spread: “9 L saved per crore spent”, “63x average ROI”, “37% improved savings”, “8% free cash unlocked”. Do not combine these as one case study or imply they refer to the same customer, expenditure or period. The newsletter provides a different procurement-analytics benchmark context for 63x; it does not establish Slooze performance.
- Finance table gives category payback/impact examples: spend analytics roughly 12 weeks, AI sourcing 3–6 months, source-to-pay 6–12 months, contract management 6–18 months. These are category claims, not a quotation or delivery promise.
- Owners material: 100+ pioneer solutions, 5,000+ providers evaluated, 20x productivity uplift/potential, “8 T” in spends managed. The currency/context for “8 T” is not sufficiently explicit in the filmed tile; do not convert it into a precise money claim. The surrounding text attributes the landscape to ProcureTech100-related research, not Slooze's own installed base.
- The filmed introduction attributes a 20x “raw productivity potential” statement to McKinsey. Treat potential, forecast and realised improvement separately. No independent verification of the exact quote, the AOP/McKinsey association or benchmark methodology was completed in this supplemental media task.

For a one-page company profile, it is clearer to say that Slooze promotes procurement productivity, spend visibility, contract/supplier workflows and measurable implementation services, while its numerical and affiliation claims need independent substantiation.

## AnjX visual findings

The outer spread (0–1 seconds) contains company name, contact, QR and qualitative “Impact & Success Metrics”: faster planning, lower inventory carrying cost, fewer stockouts/better service, and scalable architecture. **No numerical outcome percentage is visible on this spread.**

Printed contact: Surendhar Nagarajan, Founder & CEO, AnjX Solutions Pvt. Ltd.; +91 9080253220; `surendharnagarajan@anjx.in`; `www.anjx.in`; iTNT Hub, Anna University, Guindy, Chennai, TN 600025. Founder/title and address are brochure claims, not independently verified in this media-only pass.

The inner spread (2–4 seconds) describes AI demand forecasting, production planning/scheduling, inventory optimization, scenario simulation and 24/7 support/integration. It claims a modular SME focus, AI/optimization/simulation “Cognitive Engine,” sustainability/resource efficiency, pilot validation and support from iTNT Hub and IIT (BHU). The claimed experience spans automotive, semiconductor and aerospace sectors. Logos and support claims do not independently prove partnership status, model accuracy, paid deployments or actual staffed 24/7 service.

## Completed local audio analysis

Both videos contain audio tracks. They were extracted locally to 16 kHz mono WAV for transcription:

- `evidence/video_review/video_1_audio.wav`: 4.1085 seconds; approximately -49.7 dBFS RMS and -37.3 dBFS peak.
- `evidence/video_review/video_2_audio.wav`: 23.47394 seconds; approximately -49.0 dBFS RMS and -30.2 dBFS peak.

Local analysis completed using **faster-whisper base multilingual on CPU/int8**, beam size 5, with Silero voice-activity detection (VAD). Each video was checked at its original level and after normalization: +34.2 dB for AnjX, +27.1 dB for Slooze, targeting peak amplitude 0.7 without clipping. **All four passes retained 0.0 seconds after VAD and returned no transcript segments.** An independent direct Silero VAD check likewise found no speech intervals in either original or normalized track.

Conclusion: **no reliable speech was detected or transcribed; the research findings come from the visible material.** This is not a claim that the files have no audio, nor a guarantee that an exceptionally quiet word could never be present. The ASR metadata's identical English probability (~0.584) arises with no retained speech and must not be reported as a reliable language identification. No unfiltered near-silence transcript was generated or promoted into a company claim.

Only public model weights were downloaded; the recordings remained local. This model's tool interface cannot directly listen to audio, so the result is a documented local signal/VAD/ASR analysis rather than a claim of human auditory review. Evidence: `extract_review_audio.py`, `transcribe_review_audio.py`, `evidence/video_review/audio_metadata.json`, `audio_vad.json`, `audio_transcription.json`, and original/normalized WAVs.

## Readability limits

Slooze is only 464×832 pixels before rotation, and some spreads show two text-dense pages at once. Headings, contacts, most numbered plays and prominent metrics are readable; the smallest body text and footnotes are not reliably legible. Rotation helps orientation but does not create missing detail. Tiny logos, hidden page edges, transient page-turn frames and exact fine print should not be treated as fully transcribed. The audit logs record these limits rather than inventing missing wording.
