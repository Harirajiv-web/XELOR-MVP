# XELOR: complete project record

**Covers:** the whole working session from 2 October 2026 to 7 October 2026.
**Repository:** `harirajiv-web/xelor-mvp`. All work is on branch `claude/laughing-mccarthy-c3m33c`.
**Written for:** anyone (a person or another AI chat) who needs to understand, reuse or rebuild everything that was made for XELOR in this session.

---

## 0. How to use this file

This file has four kinds of content:

1. **The story:** every request, decision and change, in order (sections 1–2).
2. **The design system:** the logo, colours, fonts, spacing, motion and copy rules that every XELOR file shares (section 3).
3. **Each deliverable in detail:** what it contains, how it is laid out, which colours and components it uses, how it was built and how it was tested (sections 4–5).
4. **Every final text:** application answers, scripts, pitches, narration and slide copy, word for word (sections 6–9).

**Rebuilding the outputs exactly.** The design specs here are complete enough for another chat to recreate each file's look and content. Some files are too large to paste in full: the product demo is about 600 KB of code, and the films are 10 MB with audio. Those also depend on embedded fonts, screenshots and recorded audio that can't live in a text file. So everything needed for a byte-for-byte rebuild is committed in **`deliverables/source-bundle/`** (see 4.2). The appendices at the end of this file contain the **full source** of the smaller designs: the website, the final one-pager, the 15-slide deck, and the new scenes and director of the product film.

**Assets that are not inside this file:**
- the base64 fonts (`fonts.css`, 321 KB);
- the product screenshots (`deck-and-one-pager/shots/`, `website/img/`, `brief/shot-*`);
- the founders' photos;
- the narration audio.

All of them are in the source bundle.

---

## 1. XELOR in one page

| Item | Final position |
|---|---|
| Name | XELOR (company workspace name: AIKYANTRA) |
| Headline | **The trusted network behind what India manufactures.** |
| Subline | Suppliers, job shops, assemblers and manufacturers, connected through records earned on every delivery. |
| What it is | A trusted supplier network for MSMEs and small industries. Every real delivery builds a track record, and factories use those records to find, trust and trade with each other. |
| Target | MSMEs and small industries: small factories, job shops, suppliers, workshops, foundries, machine shops, coating units, assemblers. |
| Products | 1. **XELOR Market** (flagship): a low-cost marketplace and services directory (Find help). 2. **Xelogram**: a social-style showcase feed for factories. 3. **Agentic AI ERP**, also called "smart factory software" in plain-language material: it runs daily work and writes the records. |
| Core idea | Every delivery is counted at the factory gate (on time? right quantity? passed quality?), so suppliers earn records that can't be typed in or faked. |
| Network effect | Every request for quotes invites a new supplier, who joins free and brings its own buyers. "More orders → more records → more trust." |
| Money rule | XELOR only connects. It never handles payments and never resells leads. A buyer request goes to five matched sellers at most. |
| Why now | "AI is everywhere. Verified data isn't." Anyone can rent an AI model, but nobody can invent which supplier actually delivers. |
| Pricing (launch, under test) | Suppliers ₹0. XELOR Market: free, then ₹249/month (₹2,490/year) for Verified. Factory software: ₹50K/month per plant (₹6 lakh/year), every user included. Paid 6-week pilot ₹20K. |
| Start | Peenya, Bengaluru, one of India's largest industrial areas, with 2 pilot factories from the founders' network. |
| Founders | **Hari Rajiv**, co-founder and CEO (interning at Siemens; Connectivity IT, a Cisco Gold Partner; ECE, BMSIT). **Medhansh Mohanram**, co-founder and CTO (interning at Cisco; Connectivity IT; ECE, BMSIT). Both have lived in Peenya for about 21 years. They made 10–15 factory visits. The brief also lists Karan Emmanuel. |
| Idea rating given | 8/10 as an idea. About 6.5/10 as an investment today (answer interrupted). Reasons are in 9.13. |

---

## 2. Full timeline of the session

| # | Date | User asked | What was made / decided |
|---|---|---|---|
| 1 | 2 Oct | Rebuild the XELOR prototype (`xelor-prototype-v4_3.html`) to look exactly like the KisanCred demo (`KisanCred_Product_Demo_v2_3_2.html`), "Apple grade" | **Demo v5**: KisanCred shell (tour strip, role rail, iPhone 17 Pro/tablet/laptop stage, spec panel), XELOR maroon and gold, 6 roles, 13-step tour, Dynamic Island, slide transitions, count-ups, FLIP ranking, light/dark. Published at https://claude.ai/artifact/XjM3jX7UL94j8umUbb8FKH |
| 2 | 2 Oct | Remove the "user permission thing"; every module must show an example UI; remove unwanted data; send as downloadable HTML | Locked screens replaced by **example views** with an "Example view" banner and a **Show it for real** button. Spec panel removed (one caption line instead). "What is real" tab, freight column and long notes cut. 25 screens all render on load. |
| 3 | 2 Oct | Deep research across YC and other accelerators for similar supplier-network or linking-layer startups | 5 parallel researchers. Report: `reports/Accelerator startups like XELOR.md`, notes in `research_notes/Accelerator startups like XELOR/`. Findings in 6.1. |
| 4 | 2 Oct | How to improve XELOR after the research | 7 recommendations: lead with the earned record and passport; every RFQ is a sign-up; messaging-first; no forced ERP switch (Tally sync); compliance wedge (MSME payment clock, TReDS); early payment as revenue; race Tiny (YC F24) by winning one cluster. |
| 5 | 2 Oct | Lead with "network that builds trusted supplier records" plus an agentic AI ERP; apply all 7; make a better demo and a pitch deck with the demo embedded, based on `XELOR-Investor-Brief__v2.html` | **Demo v6**: XELOR Agent screen, two passports (Kaveri, Sri Ganesh), disputes, trial order, invite-to-claim, capacity booking (no cut), voice-note quotes, machine-readable RFQ, Tally sync, MSME clock (15/45-day), TReDS, early pay. 16 steps. Fonts embedded. A dark **16-slide HTML deck** with the live product inside. |
| 6 | 3 Oct | Too heavy: go back to the soft theme of the old brief and product, and embed the product the way the old brief did (not "2 screens inside") | Rebuilt on the **v2 brief**: soft theme, full-screen product overlay with a "Back to Pitch" bar. Product restyled to the soft v5 look. Dark deck deleted. **Brief v3**. |
| 7 | 3 Oct | "What all did we improve" and "after the deep research?" | Recap tables (kept in 6.1 and 5.1). |
| 8 | 3 Oct | Add XELOR Marketplace (cheaper than IndiaMART, connect only, no money), MSME services, and Xelogram (Instagram for MSMEs). Research first, propose, wait for approval. | 4 research tracks (IndiaMART, MSME services, Xelogram, "connect-only" legal). Proposal A1–5, B6–9, C10–15, D16–17. Notes in `research_notes/XELOR Marketplace and Xelogram/`. |
| 9 | 3 Oct | Approve all A, B, C, D. Show UI pictures in the deck, catchy headings, and a why-now slide saying verified data matters more than AI | **Demo v7** (Market role, Find help, Machine down, buyer requests, scheme finder, Xelogram, factory profile, plans, supplier-phone Xelogram tab, 20 steps). **Brief v4**: AI-era data section, XELOR Market and Xelogram sections, new headings. Both republished. |
| 10 | 3 Oct | PearX W27 application answers | Industry B2B → Other; one-liner; what we're building; unique insight; traction; competitors; rating; market size (deep research); TReDS explainer; ads upside. Final texts in section 9. |
| 11 | 3 Oct | Turn the layout-corrected deck (`XELOR_deck_and_demo_-_layout_corrected.html`) into a one-page product PDF and a 15-slide PDF deck with HD screenshots and a better first slide | First versions of `XELOR-Product-One-Pager.pdf` and `XELOR-Pitch-Deck.pdf` (2× screenshots). |
| 12 | 3 Oct | Save the PearX form as a neat PDF without changing anything | `PearX-W27-Application.pdf` (8 pages, Q1–Q44). |
| 13 | 3 Oct | Better one-pager (supplier network, Market as flagship, bigger fonts); deck: much larger fonts, clean cover, problem on slide 2, less AI talk, readable diagrams | Full readability redesign of both PDFs. |
| 14 | 3 Oct | Make a logo, apply it | Option C chosen: an X whose second stroke is a gold check ("cross-verified"), with a woven cut. Files in `deliverables/brand/`. |
| 15 | 3 Oct | Give option C as a download | `xelor-logo-option-c.svg` and `-1024.png`. |
| 16 | 3 Oct | Better cover line for VCs, around connecting the chain; combine options; "manufactured" wording; subline; add "manufacturers" | Final cover: **The trusted network behind what India manufactures.** / *Suppliers, job shops, assemblers and manufacturers, connected through records earned on every delivery.* Plus a chain visual. |
| 17 | 3 Oct | Make the slide 2 message much stronger | "**1.8 crore manufacturers. No shared record of who delivers.**" with 4 quote cards and a consequence band. |
| 18 | 4 Oct | 1:05 founder video script (Hari 70%, Medhansh 30%), built section by section | Final script in 9.10. |
| 19 | 4 Oct | Rework the user's XELOR product film (HTML + MP4): stronger pain opening, more network, Market and Xelogram | **Film rev 4** (3:50): 10 animated story scenes, new narration (offline Kokoro voice), sound design, live Market, Find help and Xelogram shots, 1920×1080 MP4. |
| 20 | 4 Oct | Lifelike cursor movement and size, and taps on phone screens | Pointer system: Fitts-timed curved moves, overshoot and settle, hover and reading drift, click press, macOS arrow, iOS-style touch circles mirrored on the phone inset. |
| 21 | 4 Oct | MP4 as a downloadable file | Re-sent as an attachment. |
| 22 | 4 Oct | Same cursor and tap treatment for the KisanCred film, plus an MP4 | `KisanCred-Product-Film.mp4` and `.html` (2:25). Narration and scenes unchanged. |
| 23 | 5 Oct | Application questions: a space you know (≤120 words), cofounder (≤100), obsession (≤120), something people used (≤120), strong opinion (≤120) | Final texts in 9.14–9.18. |
| 24 | 6 Oct | Simple one-page PDF; then a softer theme; then revert to the original theme with simpler words and MSMEs as the target | `XELOR-One-Pager.pdf` (final). |
| 25 | 6 Oct | Elevator pitch (problem and solution, ≤2500 characters) | 2,378 characters, in 9.19. |
| 26 | 6 Oct | A website like the founder's profile site, with UI/UX screens; then Vercel; then a link anyone can open; then a downloadable HTML | Website published at https://claude.ai/artifact/XUyg84bzc7jK2BNgMYEwux (private until shared). Vercel-ready copy in `xelor-site/`. `deliverables/XELOR-Website.html`. |
| 27 | 7 Oct | This record | This file plus `deliverables/source-bundle/`. |

**Blocked in this environment (stated honestly at the time):**
- Google Fonts in the sandbox (fonts were embedded instead).
- Opening source web pages during research (search summaries were used, and the figures are flagged).
- Microsoft's voice service (an offline Kokoro voice was used instead).
- Hugging Face downloads.
- `vercel.app` and `api.vercel.com` (no Vercel deploy was possible, and the founder's profile site couldn't be viewed).

---

## 3. Shared brand and design system

### 3.1 Logo ("option C, woven")

- **Idea:** an X that is also a check mark. A cream stroke and a gold tick cross to form the X: two factories connected, and the delivery between them verified.
- **Tile:** 64×64, corner radius 16, with a diagonal gradient from `#a3456a` to `#7a2945` (at 55%) to `#4a1530`.
- **Cream stroke** `#f6ecdc`: path `M19 17 45 47`, width 7, round caps. It is **masked** where the tick crosses: the mask removes path `M14 36 24 46 50 16` at stroke width 12.5.
- **Gold tick** `#e2b54a`: path `M14 36 24 46 50 16`, width 7, round caps and joins.
- **Readability:** the mark stays legible down to 18 px.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="xg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a3456a"/><stop offset=".55" stop-color="#7a2945"/><stop offset="1" stop-color="#4a1530"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#xg)"/><mask id="xma" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="#fff"/><path d="M14 36 24 46 50 16" fill="none" stroke="#000" stroke-width="12.5" stroke-linecap="round" stroke-linejoin="round"/></mask><path d="M19 17 45 47" stroke="#f6ecdc" stroke-width="7" stroke-linecap="round" fill="none" mask="url(#xma)"/><path d="M14 36 24 46 50 16" fill="none" stroke="#e2b54a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>
```

The **un-woven option C** (`xelor-logo-option-c.svg`) is the same without the mask. The film uses a simplified version: cream path `M19 17 32 32 45 47`, with no mask.

**Logo files in `deliverables/brand/`:**

| File | Use |
|---|---|
| `xelor-mark.svg` | Main tile, any size |
| `xelor-mark-1024.png` | App icon, profile pictures, favicon |
| `xelor-logo-horizontal-on-light.png` / `-on-dark.png` | Logo with wordmark |
| `xelor-mark-mono.svg` | One colour, for print or stamps |
| `xelor-symbol-on-light.svg` / `-on-dark.svg` | The X and tick without the tile |
| `xelor-logo-sheet.png` | One-page overview: idea, colours, sizes |
| `xelor-logo-option-c.svg` / `xelor-logo-option-c-1024.png` | Option C exactly as first shown |

**Wordmark:** "XELOR" in Bricolage Grotesque 800, letter-spacing −0.03em. Some early files coloured "OR" gold.

### 3.2 Colour palette (shared tokens)

**Core brand colours:**

| Token | Light | Dark | Role |
|---|---|---|---|
| wine / acc | `#7a2945` | `#e48aa5` (demo, brief) / `#d27a99` (website) | Primary accent, buttons, headline emphasis |
| acc-ink | `#6d2340` | `#f0a8be` | Accent text |
| acc-soft / wine-soft | `#f6e8ed` | `#33192a` / `#3a1d2a` | Tinted backgrounds |
| gold | `#c89a2e` | `#e2b54a` | Second accent, rules, ticks |
| gold-hi | `#e2b54a` | `#f0c95f` | Gold on dark (logo tick, dark headlines) |
| gold-ink | `#86600f` (website `#8a6312`) | `#f0c95f` | Gold text on light |
| gold-soft | `#f8efd9` (website `#f7edd6`) | `#342a12` | Gold tinted panels |
| deep | `#2a0f1a` (website `#24101a`) | `#0d0609` | Dark sections, cover backgrounds |
| on-deep / cream | `#f6ecdc` | `#f6ecdc` | Text on deep |
| deep-sub | `#c9abb7` (deck `#d2b8c2`, one-pager `#d9c3cc`) | `#b9a0aa` | Secondary text on deep |
| ink | `#1d1418` (website `#22161b`) | `#f4edef` | Headings |
| body | `#46383e` (deck/one-pager `#3d3036`) | `#cdbfc5` | Body text |
| muted | `#76676d` (deck `#6f6066`) | `#988890` | Captions |
| bg | `#f0ecec` (demo, brief) / `#f8f5f5` (deck, one-pager) / `#faf6f2` (website) | `#120c0f` / `#140a0f` | Page |
| surface | `#ffffff` | `#1b1418` / `#1f1118` | Cards |
| line | `#e2d9db` (website `#e8ddd5`) | `#3a2c32` | Borders |
| green (ok) | `#1b6a48` | `#5bc192` | Success, on-time, ticks |
| green-soft | `#e4f1ea` | `#10261c` | |
| red | `#a13d2a` (one-pager `#b3402f`) | `#ec7d64` | Problems, rejects |
| blue | `#2a5a86` | `#80b3e2` | Example-view banner, info |
| ochre | `#9a5a1b` | `#dd9650` | Supplier phone bar (`--sup-bar:#7a4a17`) |
| teal | `#1d6b73` | `#62c4cb` | Stores & QC |

**Shadows:**
- Demo and brief: `--shadow: 0 1px 2px rgba(40,18,28,.06), 0 14px 36px rgba(40,18,28,.12)`.
- Large: `--shadow-lg: 0 40px 80px -30px rgba(42,15,26,.5)`.

**Theme switching** (demo, brief, website): every colour is a CSS custom property on `:root`. Dark values are redefined under `@media (prefers-color-scheme: dark){:root:not([data-theme="light"])}` and again under `:root[data-theme="dark"]`, each with `color-scheme:dark`.

### 3.3 Typography

| Role | Font | Notes |
|---|---|---|
| Display | **Bricolage Grotesque** (500–800) | Headlines, wordmark, big numbers. Letter-spacing −0.02 to −0.04em. `text-wrap: balance` on headings. |
| Body | **Source Sans 3** (400–700) | All running text |
| Utility | **JetBrains Mono** (500–700) | Eyebrows/kickers, uppercase labels (letter-spacing 0.12–0.16em), URLs, codes, numbers |

**How the fonts load:**
- Demo, brief, deck, one-pager and PearX PDF: base64 woff2 in `<style id="xelor-fonts">` (the file `fonts.css`, taken from the v2 brief).
- Website: Google Fonts link (`Bricolage Grotesque opsz,wght 12..96,500;650;800`, `JetBrains Mono 500;700`, `Source Sans 3 400;500;600;700`).

**Fallback stacks:** `"Segoe UI", system-ui, sans-serif` for display and body; `ui-monospace, Menlo, monospace` for mono.

### 3.4 Recurring layout patterns

- **Eyebrow:** mono, 11–20 px, uppercase, tracking 0.14–0.16em, wine colour (gold on dark). The website and one-pager prefix it with a 16–34 px gold rule (`::before`).
- **Two-tone headline:** sentence-case display headline with the key phrase in `<em>`, wine on light and gold on dark. Example: "Every delivery builds a *track record.*"
- **Step chains:** numbered boxes (01–05) joined by gold chevrons (`::after`, rotated 45° border). Used in "Ask → Compare → Decide/Choose → Record" and in the network chain.
- **Track-record card:** supplier name, then three stat tiles (on time %, rejected %, deliveries) with big wine numbers on white tiles. Uses the demo data **Sri Ganesh Castings 96% / 0.3% / 19** and the label "Demonstration data".
- **Flywheel pills:** "More orders → More records → More trust" as gold pills.
- **Device frames:**
  - Browser frame: the screenshots already contain their own dark bar.
  - Phone frame: 34 px radius, 9 px dark bezel.
  - Product shots are labelled "Screens from the working product · demonstration data".
- **Motion easing:** `--ease: cubic-bezier(.2,.8,.2,1)`, `--spring: cubic-bezier(.34,1.56,.64,1)`, `--out: cubic-bezier(.16,1,.3,1)`. All motion respects `prefers-reduced-motion`.

### 3.5 Copy rules used throughout

- **Plain words.** "Track record", not "verified record", in plain-language material.
- **Short active sentences.** No hype words ("revolutionary").
- **Don't lead with AI or ERP.** Lead with the network and trust. Say "agentic" sparingly (one slide in the deck).
- **Avoid "proof" language in spoken scripts** (user request). Say "see what each supplier has actually delivered".
- **Label made-up numbers** as demonstration data. Never claim synthetic fixtures as business results.

---

## 4. Deliverables catalogue

### 4.1 Final files in `deliverables/`

| File | What it is | Size |
|---|---|---|
| `XELOR-Product-Demo.html` | Interactive product demo **v7** (single file, offline, fonts embedded) | 634 KB |
| `XELOR-Investor-Brief.html` | Scrolling investor brief **v4** with the live product overlay | 2.9 MB |
| `XELOR-Pitch-Deck.pdf` | 15-slide 16:9 deck (1920×1080) | 5.0 MB |
| `XELOR-Product-One-Pager.pdf` | One-pager, 3 Oct version ("trusted supplier network…", Market flagship) | 1.5 MB |
| `XELOR-One-Pager.pdf` | **Final** simple one-pager (original dark theme, plain words, MSME target) | 1.7 MB |
| `PearX-W27-Application.pdf` | Saved PearX form with answers (8 pages) | 0.5 MB |
| `XELOR-Product-Film.html` / `.mp4` | Product film rev 4 (3:50), interactive player / 1920×1080 video | 10.7 MB / 26.7 MB |
| `KisanCred-Product-Film.html` / `.mp4` | KisanCred film with the lifelike pointer (2:25) | 9.5 MB / 17.1 MB |
| `XELOR-Website.html` | Product website, standalone | 1.1 MB |
| `brand/*` | Logo files (3.1) | |
| `source-bundle/` | Every source file needed to rebuild the above (4.2) | 9 MB |
| `../xelor-site/index.html` and `vercel.json` | Vercel-ready website | |

**Research and reports:**
- `reports/Accelerator startups like XELOR.md`
- `reports/XELOR bottoms up market size.md`
- `research_notes/Accelerator startups like XELOR/` (yc_companies, us_accelerators, india_programs_and_incumbents, europe_asia_programs, global_capability_landscape)
- `research_notes/XELOR Marketplace and Xelogram/` (4 files)
- `research_notes/XELOR bottoms up market size/`

**Published claude.ai pages:** private until shared from the page's **Share** menu with "anyone with the link".

| Page | Link |
|---|---|
| Demo | https://claude.ai/artifact/XjM3jX7UL94j8umUbb8FKH |
| Brief | https://claude.ai/artifact/GXA4sSdYbsMNLdekXkNURD |
| Website | https://claude.ai/artifact/XUyg84bzc7jK2BNgMYEwux |

### 4.2 Source bundle (`deliverables/source-bundle/`)

| Folder | Contents | Rebuild command |
|---|---|---|
| `demo/` | `head.css` (tokens), `base.css` (KisanCred shell CSS, renamed), `xelor.css` (XELOR layer + soft pass), `market.css` (v7 Market/Xelogram), `fonts.css`, `core.js` (data, state, actions, tour, shells, preview engine), `screens.js` (v5 screens), `screens6.js` (agent, passports, capacity, MSME clock), `screens7.js` (Market, Find help, schemes, Xelogram, profile, plans, 4 tour steps), `shell.html`, `boot.js`, `build.sh`, test scripts | `bash build.sh` (expects a `build/` folder next to it holding these files). It writes `body.html` (artifact form), `body-embed.html` (fonts placeholder), and `full.html` / `full-embed.html` (standalone). |
| `brief/` | `brief-template.html` (v2 brief with images tokenised as `{{IMGn}}`, `{{FONTS}}`, `{{PRODUCT}}`), `brief-imgs.json`, `make-brief.py` (v3 transforms), `brief-v4.py` (v4 transforms, images `{{IMGM1-5}}`), `shot-*` screenshots | `python3 make-brief.py` then `brief-v4.py` (paths as in the scratch build). Embeds `full-embed.html` as base64 in `<script id="embedded-product" type="application/octet-stream">`. |
| `deck-and-one-pager/` | `deck3.html` (15 slides), `onepager2.html` (3 Oct one-pager), `onepager3.html` (final one-pager), `render.mjs`, `r2.mjs`, `r3.mjs`, `cap.mjs` (HD screenshot capture), logo SVGs, `fonts.css`, founder photos, `shots/` (14 HD screenshots) | `node render.mjs deck3.html XELOR-Pitch-Deck.pdf`; `node r3.mjs` (writes `XELOR-One-Pager-v3.pdf`) |
| `film-xelor/` | `script.py` (narration lines), `gen.py` (Kokoro TTS), `build_tl.py` (timeline from clip durations), `mix.py` (narration + music + sound effects), `story.html/css/js` (story scenes), `director.js` (pointer, touch, timeline director), `s2.js` (patched phone inset), `assemble.py`, `export.mjs` (frame export), `snap.mjs`, `timeline.js`, `captions.json`, `imgs.json`, plus `original-engine/` (the user's film engine: s1 adapter, s3 original timeline, s4 motion, s5 overview diagram, s6 original director) | See 5.7.8 |
| `film-kisancred/` | `director.js` (new pointer system on the KisanCred director), `s2p.js` (patched inset), `assemble.py`, `sfx.py`, `export.mjs`, `snap.mjs`, `s3.js` (original timeline) | See 5.8 |
| `website/` | `src.html` (full page with `{{image}}` tokens), `img/*.webp` (14 images), `build.py`, `shot.mjs` | `python3 build.py` writes `xelor-site.html` (artifact) and `index.html` (standalone) |
| `pearx-pdf/` | `make.py`, `application.html` | `python3 make.py` |
| `brand-workfiles/` | `try.html` (logo options), `sheet.html` (logo sheet), `lock.html` (lockups), `mark-inline.txt` | Render with Playwright |

**Tooling used throughout:**
- Playwright with `executablePath: '/opt/pw-browsers/chromium'`.
- ffmpeg/ffprobe, ImageMagick (`convert`, `montage`, `identify`), poppler (`pdfinfo`, `pdfimages`, `pdftotext`).
- `kokoro-onnx` with model files `kokoro-v1.0.onnx` and `voices-v1.0.bin`, downloaded from the GitHub releases of `thewh1teagle/kokoro-onnx`.
- Python with numpy and soundfile.

---

## 5. Each deliverable in detail

### 5.1 Product demo (`XELOR-Product-Demo.html`), v4 → v7

#### 5.1.1 Versions

| Version | Change |
|---|---|
| v4 | The user's prototype: one laptop and two phones |
| v5 | KisanCred layout, 6 roles, 13-step tour, spec panel |
| v5b | Example views, no locks, spec panel removed |
| v6 | Agent, passports, invite/claim, capacity, voice quote, machine-readable RFQ, Tally sync, MSME clock and TReDS, early pay, dispute, 16 steps, fonts embedded |
| v6 soft | Restyled to the soft v5 look |
| v7 | Market role, Find help, schemes, Xelogram, profile, plans, supplier Xelogram tab, 20 steps. Header chip "Build v7 · Oct 2026". |

#### 5.1.2 Layout

The layout copies KisanCred's shell exactly: KisanCred's CSS was lifted verbatim and re-tokenised.

1. **Sticky top bar** (`header.top`):
   - brand mark (X tile) with "XEL**OR**" and the small line "Trusted supplier network · agentic ERP · Market";
   - a clock chip (the demo keeps its own calendar);
   - a "Demo data" flag;
   - a "Build v7 · Oct 2026" chip;
   - a theme toggle.
2. **Guided tour strip** (`section.tour`): dark, with step chips, a title and a paragraph, plus **Do it for me** and next/previous.
3. **Rail:**
   - role buttons with red attention dots;
   - device switch;
   - iPhone finish picker (three colours);
   - **Restart demo**.
4. **Stage:**
   - a device frame: `laptop`, `tablet`, or `phone` (an iPhone 17 Pro, 426×898, scaled by `fitDevice`, with a Dynamic Island and side hardware buttons);
   - browser-style chrome showing the address (`kaveri.xelor.in`, `owner.kaveri.xelor.in`, `floor.kaveri.xelor.in`, `market.xelor.in`);
   - the viewport `#vp`;
   - one caption line `#cap` below.
5. **Overlays:** toasts, and `#overlay` (the calendar flip).

**Motion:**
- Phone notifications grow out of the Dynamic Island.
- iOS-style push/pop screen transitions.
- A liquid tab-bar indicator.
- Number count-ups.
- FLIP animation when the ranked answers re-order.
- A calendar-flip overlay when days are skipped.
- Rubber stamps on the route card.

#### 5.1.3 Roles

| Key | Name | Person | Device | Address |
|---|---|---|---|---|
| `pur` | Purchase | Priya Raghavan · Purchase manager | Laptop | kaveri.xelor.in |
| `sup` | Supplier | Sri Ganesh Castings · Hosur | Phone (no login) | kaveri.xelor.in |
| `own` | Owner | Arun Venkatesh · Owner | Phone (installable web app) | owner.kaveri.xelor.in |
| `stores` | Stores & QC | Ganesh Murthy · Latha Nagaraj | Tablet at the gate | kaveri.xelor.in |
| `floor` | Shop floor | Suresh Kumar · Assembly 1 | Phone | floor.kaveri.xelor.in |
| `acct` | Accounts | Deepa Shenoy · Accounts (invented name) | Laptop | kaveri.xelor.in |
| `mkt` (v7, tagged NEW) | Market | Kaveri Pumps · XELOR Market | Laptop | market.xelor.in ("free to list, no money handled") |

#### 5.1.4 Screens

`def(id, {role, title, route, purpose, reads, api, states, rules, render, cta, nav})`

| Role | Screens |
|---|---|
| Purchase | `p.home` Today (route card with stamps, agent card), `p.sales` Sales order, `p.plan` Material check, `p.net` Supplier network (RFQ, ranked answers), `p.po` Purchase orders, `p.rec` Supplier records (invite to claim), `p.log` Activity, `p.pass` Our passport, `p.cap` Capacity, `p.agent` XELOR Agent |
| Supplier (phone) | `s.chat` Kaveri Pumps thread, `s.quote` Your price, `s.record` My record (share, dispute, get paid early), `s.cap` Furnace 2, `s.gram` Xelogram |
| Owner (phone) | `w.inbox` Needs you (agent brief), `w.po` Approve, `w.today` Today at Kaveri, `w.biz` Business |
| Stores & QC (tablet) | `t.gate` Gate (challan scan; a second scan is refused), `t.qc` Incoming inspection, `t.stock` Stock, `t.rec` Supplier records |
| Floor (phone) | `m.jobs` XELOR Floor, `m.wo` Work order (release, output, four final tests), `m.mat` Materials |
| Accounts | `a.dispatch` Dispatch & invoice (IRN, e-way bill), `a.books` Ledger (MSME clock, TReDS, Tally sync), `a.audit` Audit trail (hash-chained) |
| Market | `k.home` XELOR Market, `k.req` Buyer requests, `k.help` Find help, `k.schemes` Scheme finder, `k.gram` Xelogram, `k.profile` Factory profile, `k.plans` Plans |

#### 5.1.5 Demo data

**Order and factory:**
- Factory: Kaveri Pumps & Castings, Peenya, Bengaluru, GSTIN `29AAGCK4521M1ZQ`.
- Customer: Sri Venkateswara Agro.
- Order: `SO-2627-0291`, customer PO `SVA/PO/26-27/118`, Pump 6 in end suction, `KP-PMP-6ES`, 80 pumps at ₹17,200, due 23 Oct 2026, HSN 8413.
- Shortage: 60 pump body castings GG25. RFQ `RFQ-2627-0114`, quality plan `QP-BDY-150 rev 2`.

**Suppliers:**
- Sri Ganesh Castings (Hosur, the winner, quotes ₹2,760).
- Anand Engineering.
- Veerabhadra Castings (cheapest but unproven, gets invited to claim its record).

**Ranking:** delivery 40%, landed cost 35%, track record 25%. Record score = 0.7×on-time + 0.3×max(0, 1 − rejects/5).

**Approval:** Priya's limit is ₹1,50,000. The person who awards never approves. The PO is ₹1,68,000, so it goes to Arun.

**Other references:** work order WO-2627-0918, GRN-2627-1195.

**MSME clock:** 45 days agreed in the PO (the maximum under the MSMED Act), 15 days if nothing was agreed. "Upload to TReDS".

**Market data (made up and labelled):** 1,240 factories; technicians (Sai Machine Tool Services and others); buyer Deccan Agro Equipment (Hubballi, 40 × 4-inch monoblock pumps); Nandi Powder Coaters; Shree Lakshmi Precision. Kaveri's passport: 91% on time, 0.32% returned, 32/32 suppliers paid on time.

#### 5.1.6 Tour

| Step | Station | Screen | Step text |
|---|---|---|---|
| 1 | Order | p.sales | Priya confirms the customer's order, once |
| 2 | Plan | p.plan | XELOR explodes 80 pumps into parts and checks the shelf |
| 3 | Ask | p.net | The request writes itself from records XELOR holds |
| 4 | Quote | s.quote | Sri Ganesh quotes from a message link, with no login |
| 5 | Award | p.net | Answers come back ranked, with the reasoning written out |
| 6 | Approve | w.po | Above Priya's limit, so it lands on Arun's phone |
| 7 | Receive | t.gate | The truck arrives; one scan posts the receipt |
| 8 | Inspect | t.qc | Latha passes the lot against the written quality plan |
| 9 | Release | m.wo | The work order releases only when every part is on the shelf |
| 10 | Make | m.wo | 80 made, then every pump is tested |
| 11 | Dispatch | a.dispatch | Dispatch writes four records in one transaction |
| 12 | IRN | a.dispatch | IRN and e-way bill make the invoice valid |
| 13 | Books | a.books | The books, written by events, then the order closes |
| 14 | Pay | a.books | The MSME clock: pay Sri Ganesh on time, through TReDS |
| 15 | Invite | p.rec | Every request is an invitation: Veerabhadra claims its record |
| 16 | Passport | p.pass | Kaveri shares its passport with a new buyer |
| 17 | Help | k.help | A machine stops: a verified technician in two taps |
| 18 | Market | k.req | A buyer's request reaches five sellers, not fifty |
| 19 | Post | s.gram | Sri Ganesh's on-time delivery becomes a post |
| 20 | Quote | k.gram | Kaveri asks for a quote straight from a post |

#### 5.1.7 Mechanics

- **State:** `S` (business state) and `ui` (UI state). `fresh()` creates the initial state.
- **Actions:** in `A.*`.
- **Tour steps:** each has `done()`, `run()` and optionally `enter()`. `ensureUpTo(i)` replays earlier steps quietly.
- **Example views:** the `PV` map holds `[reqSteps, showSteps, extraFn]`. `previewOf()` shows a future-state clone. `data-preview` makes buttons inert. **Show it for real** (`data-jump`) runs the earlier steps.
- **Deep link:** `#role` opens that role.

**Tests:**
- All 20 steps run in headless Chromium with no errors.
- Every screen renders in light and dark.
- No sideways scroll at 390 px.

### 5.2 Investor brief (`XELOR-Investor-Brief.html`), v2 → v4

**Base:** the user's `XELOR-Investor-Brief__v2.html`. It is a soft single scrolling page with tokens identical to the demo's (3.2, plus `--page:#f8f5f5`, `--nav-bg:rgba(248,245,245,.9)` and `--dot:rgba(122,41,69,.13)`). It has a sticky nav, dotted textures, cards and scroll animations.

**Product embedding:**
- The demo HTML is stored base64 in `<script type="application/octet-stream" id="embedded-product">`.
- On **View Product** it is decoded into an iframe `srcdoc`. The placeholder `<!--XELOR-FONTS-->` is replaced by the brief's `#xelor-fonts` style.
- It opens full screen in `.product-shell` under a dark bar: **Back to Pitch · XELOR · Interactive product**.
- Role buttons in the hero open the product as that role. **Open XELOR Market** opens it in the Market role.

**Section headings in v4, in order** (line breaks shown as " / "):

1. **Hero:** "Every delivery becomes proof. / Every factory gets found for it."
2. "Promises are cheap. / Proof is buried."
3. "AI is everywhere. / Verified data isn't."
   - A layered diagram: Models (commodity), then Agents (crowded), then **Verified data** in gold.
   - Big line: "Without verified data you can't build on any model. You can only guess faster."
   - Cards: The best rate, both ways · Credit priced on proof · The right buyer finds you.
4. "The rules changed. / Proof is now mandatory." A timeline:
   - Audit trail
   - E-invoicing at ₹5 crore
   - 45-day payment rule
   - 30-day invoice window
   - Order platforms scale
   - Business AI on WhatsApp (REPORTED)
   - MSMED amendment (REPORTED)
   - TReDS gets a guarantee (REPORTED)

   The Peenya "special investment region" item was removed because it was rolled back in May 2026.
5. "The agent does the work. / People sign." Cards: The agent drafts and chases · A person decides · The work writes the record.
6. "Seven roles. One record. / Nothing typed twice." (the stations; record-writing stations carry a gold dot)
7. "Start with one department. / Add the next when it pays." Packages:
   - XELOR ERP
   - Plant Operations
   - Quality, Safety & Compliance
   - Warehouse & Dispatch
   - Planning & Engineering
   - Revenue & Service
   - Delivery & Managed Services
   - XELOR Agent
   - Trusted supplier network
8. "Earned at the gate. / Impossible to fake."
   - Cards: Counted, not typed · Unproven means unproven · The factory earns one too.
   - "Ranked with reasons. A person decides."
9. "Every request is an invitation. / Every delivery is a reference." Supplier record and factory passport side by side, plus the 5-step loop.
10. "Listed is not trusted. / XELOR Market shows proof."
    - Cards: A market you can check · Find help, fast · We never touch the money.
    - "The market the directories leave behind": stats and a typical-directory-vs-XELOR table.
11. "Instagram sells lifestyles. / Xelogram sells capability." A laptop feed plus two phones (the Tamil draft and the live post).
12. "The agents are crowded. / The record is wide open." The landscape matrix, with a B2B directories column.
13. "Factories pay per plant. / MSMEs list for ₹249." The early-payment line reads: "facilitates access to early payment from RBI-regulated partners, never holds or moves money".
14. "Start in Peenya. / Own the cluster." (The market, one plant each · One plant, per year)
15. "Features get copied. / Records don't."
    - It sits on someone else's ERP · We start beside them · They are outside the factory · It cannot be back-filled.
    - How we win the cluster: Ten plants that trade · Start beside Tally · Every request invites · Then the next cluster.
16. "No signed customer yet. / Here is what runs." (Built · Open · Risks)
17. "Engineers who have seen / the inside of the problem." Hari Rajiv, Medhansh Mohanram, Karan Emmanuel, seats this round fills.
18. "Own the record every Indian factory will run on." Use of funds.

**v3 CSS additions:** `.tl` 4-column timeline with `overflow-x:clip`, `.rep` REPORTED tag, `.recs`, `.loop`, `.mx`. The full rule set is in `make-brief.py`.

**Product screenshots:**

| Version | Screens | Size |
|---|---|---|
| v3 | Laptop agent card; owner and supplier phones | 1680×1180; 639×1349 RGBA with transparent corners |
| v4 | Market, Find help, Xelogram (laptop), plans, two phone posts | |

### 5.3 Pitch deck PDF (`XELOR-Pitch-Deck.pdf`), 15 slides

**Design:**
- 1920×1080 per slide, `@page{size:1920px 1080px}`, padding 90/120/110 px.
- Background `--bg:#f8f5f5`; `.tint` is `#efeaea`; `.dark` is `#2a0f1a`.
- Type sizes:

  | Element | Size |
  |---|---|
  | Eyebrow | mono, 20 px, tracking 0.14em |
  | h2 | 76 px, line-height 1.04, Bricolage 800 |
  | Lead text | 32 px |
  | Body points | ~31 px |
  | Footer | mono, 17 px: logo + "XELOR · SEED INVESTOR BRIEF" + page number |

- Cards: 26 px radius, 1.5 px border.
- Laptop screenshots: radius 1.07%/1.52% with a deep shadow. Phones use `drop-shadow`.
- Bullets use a gold tick that echoes the logo.
- Rendered with Playwright `page.pdf({width:'1920px', height:'1080px', printBackground:true, preferCSSPageSize:true})`.
- Screenshots captured at 2× (laptop JPEG q92) and 2.5× (phones PNG with transparent background), checked at 230–430 ppi inside the PDF.
- **No 3D transforms**, because they made Chromium rasterise images at low resolution.

**Slide backgrounds:**

| Background | Slides |
|---|---|
| `cover` | 1 |
| plain `#f8f5f5` | 2, 4, 6, 8, 10, 13, 15 |
| `tint` `#efeaea` | 3, 5, 7, 9, 12 |
| `dark` `#2a0f1a` | 11, 14 |

**Cover style:**
- Background: `radial-gradient(70% 90% at 95% 15%, rgba(226,181,74,.22), transparent 55%), radial-gradient(60% 80% at 0% 100%, rgba(143,51,84,.6), transparent 60%), #2a0f1a`.
- A 32 px dot grid, masked to fade out towards the right.
- h1: 118 px, line-height 0.96, tracking −0.05em, cream with a gold span.
- Subline: 38 px, weight 600, deep-sub colour.

**Slide text:**

1. **Cover** (dark-wine background, faint large logo in the corner)
   - Logo row with "SEED INVESTOR BRIEF · OCTOBER 2026".
   - Headline "**The trusted network behind what India manufactures.**", with "what India manufactures" in gold.
   - Subline "Suppliers, job shops, assemblers and manufacturers, connected through records earned on every delivery."
   - Right side: XELOR Market on a laptop and a Xelogram post on a phone.
   - Bottom chain: a gold line linking six steps, each with a gold check badge: Raw material ✓ → Foundry ✓ → Machining ✓ → Coating ✓ → Assembly ✓ → Manufacturer.
2. **THE PROBLEM:** "**1.8 crore manufacturers. No shared record of who delivers.**" ("1.8 crore" in very large maroon type)
   - Body: "Every order still rides on a WhatsApp promise, a phone call and gut feel. When a delivery fails, nothing is recorded, so the next order goes to the same guess."
   - Source: MANUFACTURING MSMES ON UDYAM, JULY 2026.
   - Four quote cards:
     - ✉ WhatsApp "Castings will reach by Friday, sir." → Tuesday. Still waiting.
     - ☎ Phone call "Same rate as last time?" → Nobody knows last time.
     - ✎ Paper register "60 received. 2 cracked." → Never reaches any system.
     - ₹ Paid directory "Trusted seller" badge → Checks identity, not delivery.
   - Dark band: **Lines stop** (when one late part holds up an order) · **Rejects surface** (after the supplier is already paid) · **Good suppliers stay invisible** (with no way to prove they deliver).
3. **THE COST:** "No record means no trust. Factories pay for it every day."
   - **12%** of Indian MSMEs use ERP software; the rest track suppliers in notebooks and chats (RIS, 2026).
   - **~2.5%** of the 8.8M sellers on IndiaMART pay to be listed; most MSMEs are priced out of being found (IndiaMART Q1 FY27 · our arithmetic).
   - **3–4×**: each number is typed three or four times across separate systems (what we see on the shop floor).
   - Closing line: "Every factory already creates the proof. Nobody keeps it."
4. **THE SOLUTION:** "XELOR turns every order into a supplier record you can trust."
   1. **Ask:** the request for quote writes itself; suppliers reply from a link, with no login.
   2. **Compare:** quotes ranked on price, delivery date and each supplier's track record.
   3. **Decide:** a person picks the supplier; the owner approves on the phone.
   4. **Record:** when goods arrive, on-time and quality results update the record.

   RESULT: Records come from real deliveries, so they can't be typed in, bought or faked.
5. **HOW THE RECORD IS EARNED:** "One scan at the gate. The record updates." (gate tablet screenshot)
   - On time? Counted from the receipt date.
   - Quality? Counted from the inspection.
   - New supplier? Shows "unproven" until it delivers.
6. **BETTER DECISIONS:** "Compare suppliers on proof, not promises." (ranked quotes screenshot)
   - Every quote shows the supplier's real on-time and reject rates.
   - The ranking explains itself. A person always decides.
   - The best supplier wins on proof, not just price.
7. **FLAGSHIP:** "XELOR Market. See the proof first." (Market and Find help screenshots)
   - Every seller shows an earned delivery record.
   - Free to list, or ₹249 a month for Verified.
   - A request goes to 5 sellers at most. Never resold.
   - Find help: repair, testing, compliance, finance.
   - Buyers and sellers pay each other. We never touch the money.
8. **XELOGRAM:** "Show your factory. Win new buyers." (feed screenshot and two phones)
   - A verified delivery becomes a post in one tap.
   - Captions in Tamil, Kannada, Hindi or English.
   - Every post has a proof badge and a Request quote button.
   - Shares to WhatsApp Status, used by 97% of MSMEs.
9. **THE ENGINE:** "The software that builds every record." (laptop and phone screens)
   - Sales, purchase, stores, production and accounts on one record.
   - It drafts and follows up. People approve money and stock.
   - Works beside Tally. Sold one department at a time.
10. **THE NETWORK:** "Every request grows the network."
    1. A factory sends a request (to its usual suppliers and new ones).
    2. Suppliers quote from a link (no login, no app, by text or voice).
    3. They claim a free record (and use it with every buyer).
    4. Buyers check the proof (records decide who wins the order).
    5. More factories join XELOR (and trade with each other directly).

    MOAT: Delivery history takes years to build and can't be copied or back-filled. We start dense, in one cluster.
11. **WHY NOW:** "AI is everywhere. Verified data isn't."
    - Left stack: AI models (Anyone can rent one; COMMON) · AI tools for buying (Many funded startups build these; CROWDED) · Verified delivery data (Only comes from real work at the factory gate; RARE · XELOR).
    - Right timeline: Apr 2024, 45-day payment rule (pay small suppliers late and lose the tax deduction) · Aug 2023, e-invoicing at ₹5 crore (every B2B invoice registered with the government) · Sep 2026, TReDS guarantee (lenders back small-firm invoices, with proof of delivery).
12. **COMPETITION:** "Others list suppliers. Only XELOR proves them." Checkmark table (½ = partly; based on our October 2026 scan of public information):

    | | Directories (IndiaMART, JustDial) | Marketplaces (Zetwerk, OfBusiness) | SME software (Tally, Zoho) | AI buying tools (Didero and others) | XELOR |
    |---|---|---|---|---|---|
    | Record from real deliveries | – | ½ | – | – | ✓ |
    | Affordable for small MSMEs | – | ½ | ✓ | – | ✓ |
    | Requests never resold | – | ✓ | – | ✓ | ✓ |
    | Runs inside the factory | – | – | ✓ | – | ✓ |
    | No cut, no money handled | ✓ | – | ✓ | ✓ | ✓ |

13. **BUSINESS MODEL:** "Simple pricing. Suppliers always join free."
    - XELOR Market ₹249/month (verified listing; free basic listing for every MSME).
    - Factory software ₹50K/month (per plant, every user included; ₹6 lakh a year).
    - Suppliers ₹0 (a free record and quotes from a link; always).
    - Strip: ₹20K paid 6-week pilot · 75–78% target gross margin · ~21 months to earn back sales cost · Later: referral fees on early payments.
14. **MARKET SIZE:** "A ₹7,900 Cr market, built from the ground up."
    - TAM, all of India: 1.83 Cr MSMEs × ₹2,490 + 47,762 factories × ₹6 L + TReDS referrals = ₹7,947 Cr (~$900M).
    - SAM, Karnataka + Tamil Nadu: 7,330 factories × ₹6 L + 1.53 L MSMEs in Bengaluru, Hosur, Coimbatore = ₹504 Cr (~$57M).
    - SOM, year 5: 220 factories (3% of SAM) + 450 paid listings + referrals = ₹13.7 Cr (~$1.6M ARR).
    - Sources: Udyam (Jul 2026), Annual Survey of Industries 2023-24, TReDS data (FY26). Conservative: excludes ads and smaller factories.
15. **THE TEAM:** "We grew up inside this problem."
    - Hari Rajiv, CEO · Co-founder (Siemens and Connectivity IT, a Cisco Gold Partner selling into these factories. ECE, BMSIT).
    - Medhansh Mohanram, CTO · Co-founder (Cisco, now Connectivity IT. Owns the platform and its architecture. ECE, BMSIT).
    - Stats: **21 yrs** living in Peenya, among the factories we serve · **10–15** factory visits with owners and purchase teams · **2** pilot factories from our own network.
    - THIS ROUND: funds 15 people by month 18 (a product manager, seven engineers, three in delivery and two in sales).

**Earlier deck history:**
- 2 Oct: a dark HTML deck with 16 slides and the product embedded. Rejected as too heavy.
- 3 Oct: first 15-slide PDF. The cover was "Earn trust with every delivery. Get found for the work you do." Slide 2 was "The starting point" with six scraps of proof.
- 3 Oct readability redesign: body text went from 15–18 px to ~30 px, headings to 70–118 px, labels to ≥20 px. "Agentic" was left on one slide only. The ERP package list, long rules timeline and separate passport slide were dropped.
- The full source of `deck3.html` is in Appendix C.

### 5.4 One-pagers

#### 5.4.1 `XELOR-Product-One-Pager.pdf` (3 Oct, `onepager2.html`)

**Page:** A4 (210×297 mm), page bg `#f8f5f5`.

**Header** (deep gradient):
- Logo with "XELOR" and "Product overview · Oct 2026".
- h1 (31 px): "The trusted supplier network / for Indian MSMEs." (second line gold)
- Line: "Every delivery becomes a verified record. Factories use those records to find, trust and trade with each other."

**Sections:**
1. **The problem:** "Small factories still find suppliers on WhatsApp and phone calls. *Nobody can see who actually delivers on time,* and paid directories only check identity."
2. **How the supplier network works:** 01 ASK (Send a request; suppliers quote from a link, no login, no app) → 02 COMPARE (See the proof; quotes ranked on price, delivery and track record) → 03 DECIDE (Pick and approve; a person chooses, the owner signs on the phone) → 04 RECORD (Proof is earned; on-time and quality results update the record). Dark band: "Every request invites a new supplier. It joins free, claims its record and brings its other buyers, so the network grows with every order."
3. **Flagship block** (2 px wine border, wine header "FLAGSHIP · XELOR Market · Find a supplier. See the proof first."):
   - Market screenshot.
   - Earned record on every seller · 5 sellers at most, never resold · Find help: verified repair, testing, compliance and finance providers · XELOR never touches the money.
   - Comparison: ₹32,000+/year typical paid directory listing vs Free · ₹249/month XELOR Market listing.
4. **Two mini cards:**
   - The engine: Agentic AI ERP, "Runs the factory's daily work and writes every supplier record automatically. People approve; it works beside Tally." (gate screenshot)
   - Get found: Xelogram, "A verified delivery becomes a post with a Request quote button, in Tamil, Kannada, Hindi or English." (phone)
5. **Pricing** (launch, under test): XELOR Market Free · ₹249/month · Factory software ₹50K/month per plant, every user included (highlighted) · Suppliers ₹0.

**Footer:** "XELOR by AIKYANTRA · Peenya, Bengaluru" / "Screens from the working product · demonstration data".

#### 5.4.2 `XELOR-One-Pager.pdf` (final, 6 Oct, `onepager3.html`)

The full source is in Appendix B.

**Path to the final version:**
1. First build of the page.
2. "Make it smooth, subtle and soft": a cream and blush theme.
3. **Reverted to the original dark theme**, with simpler words and MSMEs as the target. This is the final version.

**Design:**
- A4 (`@page size:A4; margin:0`), rendered at 794×1123 CSS px with a device scale factor of 2.
- **Header:**
  - Background: `radial-gradient(70% 140% at 100% 0%, rgba(226,181,74,.22), transparent 60%), radial-gradient(60% 120% at 0% 100%, rgba(143,51,84,.55), transparent 60%), #2a0f1a`.
  - Padding 16/36/15 px. Logo 38 px. "XELOR" 25 px Bricolage 800, cream.
  - Right tag "COMPANY OVERVIEW · OCT 2026", mono 10 px, gold-hi.
  - h1 26.5 px cream with the second line gold-hi. Paragraph 14.5 px.
  - **Target strip:** a gold pill "BUILT FOR MSMES & SMALL INDUSTRIES", then outline pills Small factories · Job shops · Suppliers · Workshops.
- **Main:** padding 11/36 px, sections 9 px apart. Section labels: mono 11 px uppercase wine, with a 16 px gold rule.
  - **Problem:** 3 white cards (13–15 px radius) with rose-red icon tiles (`#fbe9e5` / `#b3402f`).
  - **Network block** (the impact centrepiece): deep `#2a0f1a` with a gold radial glow, a **2 px gold border**, radius 18, and an "OUR CORE" pill. Five-step chain with gold chevrons; step 4 is a cream card with three white stat tiles (wine numbers). A dashed divider, then the growth row (network icon, text, gold flywheel pills).
  - **How buying works:** 4 white cards with wine number circles.
  - **What we offer:** 3 product cards (Market is wider, 1.32fr, with a 2 px wine border and a FLAGSHIP chip); image strips 64 px tall.
  - **Why XELOR is different:** 3 gold-soft (`#f8efd9`) cards with green tick circles.
- **Footer:** mono 9.5 px: "XELOR · Peenya, Bengaluru" / "Screens from the working product · **demonstration data**".

**Text, top to bottom:**
- **Header:**
  - h1: "The trusted network behind / **what India manufactures.**"
  - Paragraph: "XELOR helps **MSMEs and small industries find suppliers and buyers they can trust**, based on how well each business actually delivers."
- **The problem:**
  - "Finding suppliers is guesswork": Owners rely on WhatsApp, phone calls, word of mouth and long visits.
  - "Listing sites cost too much": A paid listing is ₹32,000+ a year. Most small businesses can't afford it.
  - "No way to know who's reliable": So owners take risks, or pay more just to be safe.
- **How the XELOR network works** ("Every delivery builds a **track record.**"):
  - 01 A factory orders (From a supplier, through XELOR.)
  - 02 Supplier delivers (The goods reach the factory.)
  - 03 Delivery is checked (On time? Right amount? Good quality?)
  - 04 · TRACK RECORD: Sri Ganesh Castings 96% on time · 0.3% rejected · 19 deliveries
  - 05 Good work gets noticed (Reliable suppliers get more orders.)
  - Growth row: "**The network grows with every order.** When a factory asks a new supplier for a price, that supplier joins free and brings its own customers." Pills: More orders → More records → More trust.
- **How buying works on XELOR:**
  1. Ask: Say what you need. XELOR sends it to suppliers, who reply from a simple link.
  2. Compare: See all prices side by side, with each supplier's delivery history.
  3. Choose: You pick the supplier. The owner approves from the phone.
  4. Record: When the goods arrive, XELOR notes how it went. No typing needed.
- **What we offer:**
  - FIND & CONNECT · XELOR Market (FLAGSHIP): "Find suppliers, buyers and local help like repairs and testing. See each seller's track record before you call."
  - GET NOTICED · Xelogram: "Like a social feed for factories. Show finished work; buyers ask for a price from the post."
  - RUN YOUR FACTORY · Smart factory software: "Handles orders, stock and bills, and does most of the typing for you. Works with Tally."
- **Why XELOR is different:**
  - Built on real work: Track records come from real deliveries, not reviews.
  - We only connect: XELOR never handles your money or sells your details.
  - Low cost for every MSME: Free to start. Listings from ₹249 a month.

**Soft theme (made, then reverted, kept for reference):**
- Overrides: bg `#fbf8f5`, header gradient `#fbf2ec → #f6e8ec → #f8efe0`, network block gradient `#fdf8f3 → #f8ecef` with border `#ecd9c6`.
- Accents: rose `#f6ebee`/`#a05a73`, step numbers `#b47a8e`, ticks `#6f9c86`, pills `#f6ead0`/`#7d5a17`.

### 5.5 PearX application PDF (`PearX-W27-Application.pdf`)

- 8 pages with a cover band "SAVED DRAFT · APPLICATION COPY" and the programme details (funding $250K–$2M; early deadline Aug 16 and regular deadline Oct 4, 11:59 PM PST; two interview rounds; cohort from January 2027 for 12 weeks; Demo Day in the first week of April 2027).
- Sections with icons: Basic Info ℹ️, The Pitch 🎙️, The Problem 🤔, Traction 📈, Competition and Market 🏇, The Founders 👏, CEO / Founder #1, Founder #2, Pear 🍐.
- Q1–Q44 are numbered boxes, with helper text and a red * on required fields. Answers are **word for word** as the user pasted them, typos included.
- Blank answers show "Not filled in yet". Multiple-choice questions show "Selection not recorded in this copy".
- Built from `application.html` with `make.py` and Playwright.
- The answers saved in it are in 9.2–9.8; the founder Q31 and Q32 answers are the user's own text, reproduced in 9.9.

### 5.6 Logo design process

- Three options were drawn (`brand-workfiles/try.html`). **Option C** read best: a clean X where one stroke is a gold check. It was refined with the woven cut.
- It was checked at sizes from 18 px up.
- Applied to:
  - the deck cover (logo, wordmark, faint large symbol in the corner);
  - every slide footer;
  - gold-tick bullets in the deck;
  - the one-pager header and footer;
  - the film and the website.
- **Advice given:** run a trade-mark search for "XELOR" and "Xelogram" (Instagram owns "GRAM" in the EU and has opposed "-gram" names).

### 5.7 XELOR product film, rev 4 (`XELOR-Product-Film.html` / `.mp4`)

#### 5.7.1 Starting point

The user's film was 2:33, 1600×900, with 25 chapters. It was a scripted player built on the real demo in an iframe, with a narration track, a music track and captions.

Its opening was weak: two light intro cards ("Today, their updates sit in different places", and "Small gaps. Work slows down." with three risk cards), then an overview diagram, a product tour, and a 12-step order. Market and Xelogram got 7 seconds each.

The engine:
- `s1` XelorDemoDirector adapter (prepare, navigate, click, input, bounds, snapshot), with named actions;
- `s2` phone-detail inset (clones the phone UI into a large readable card);
- `s3` timeline;
- `s4` XelorMotion (deterministic chapter-title entrances, pen-oval focus marks, flow rail);
- `s5` overview diagram (painted for film times 20–35);
- `s6` director.

Every frame is a pure function of film time, with `renderFrame(t)` and `exportMode()`.

#### 5.7.2 New structure: 3:49.7, 30 chapters, 19 product shots

| Time | Scene | Kind | What happens |
|---|---|---|---|
| 0:00–0:09 | chain | story, dark | "MADE IN INDIA". Headline words reveal: "Behind almost every product / is a *chain of small factories.*" Six nodes appear in a zigzag (Raw material / Foundry / Machine shop / Coating unit / Assembler / Manufacturer, each with an icon and subtitle), timed to the words. Gold links draw with a glowing spark; slow camera push. |
| 0:09–0:15 | guess | story, dark (same scene) | Headline: "Finding the right supplier / is still a *guessing game.*" The links flicker, then snap with gaps; nodes drift, desaturate and tilt; red "?" badges pop at each gap. "Who actually delivers?" fades in, gold italic. |
| 0:15–0:26 | scramble | story, dark | "HOW FACTORIES FIND SUPPLIERS TODAY". Paid directory card "₹32,000+ a year, for a typical paid listing" with a lock and a slamming "OUT OF REACH" stamp. A phone chat ("Casting suppliers") fills with 9 messages, unanswered. "Missed calls ×0→×6" card; a search card typing "casting supplier near peenya" with AD result bars; a reference card ("Ask Raju. His cousin knows a good foundry."). A map card draws a Peenya → Hosur route ("Site visit · 2 h 40 m each way · Visit 3 · still unsure"). DAY counter 1→9 with "STILL NO DECISION". |
| 0:26–0:36 | inside | story, dark | "INSIDE THE FACTORY", "Four tools. *None of them talk.*" Four app windows pop in: WhatsApp (orders chat), Excel (`Stock_final_v3.xlsx` grid), Tally (purchase voucher, mono font), Paper register (ruled paper, italic). Cut lines with ✕ marks between them. Then "The same details. *Typed again. And again.*": "60" is retyped in each window with a caret and comes out wrong in two (06, 66?, red underline). A gold "TYPED ×1→×4" badge. |
| 0:36–0:47 | cost | story, dark | Three panels slam in with screen shake: Lines stop. / Rejects surface late. / Good suppliers stay invisible. (the third fades to a ghost). They scatter and blur away. "Everything is scattered.", then large "Nobody can see / *who actually delivers.*" with a gold underline that draws. Heartbeat and impact hit. |
| 0:47–0:55 | reveal | story, dark | 90 gold particles spiral into the centre. The logo tile springs in; the cream stroke and gold tick draw on with a glow flash. "XELOR" letters slide in at 150 px. A light sweep, then the tagline words "The trusted network behind / *what India manufactures.*". The wine glow grows. |
| 0:55–1:16 | network | story, light cream | "HOW THE XELOR NETWORK WORKS". The headline changes with each line: "Every delivery is counted *at the gate.*" → "Every supplier earns *a real record.*" → "Factories choose *on that record.*" → "Every request *invites a new supplier.*" → "The network grows *with every order.*" The graph: a gold truck travels Sri Ganesh → Kaveri Pumps, then "✓ On time". A green ring fills to 96% ("96% on time"). Anand (91%) and Veerabhadra (New) appear; RFQ dots go out and gold quote dots come back; the Ganesh link turns gold (chosen). An invite ripple leads to Meenakshi Foundry ("Joins free"), then its 3 buyers. 54 tiny nodes and links grow outward. Right-hand panels crossfade: gate receipt (GRN-2627-1195, scan line) → supplier record (count-up 96% / 0.3% / 19) → quote ranking bars → invitation → "More orders. More records. *More trust.*" Label: "Demonstration data". |
| 1:16–1:24 | three | story, light | "One trusted record. *Three products.*" Cards spring up: XELOR Market (centre, FLAGSHIP, maroon border), then Xelogram (left, phone), then Agentic AI ERP (right). Dashed gold connectors run to a dark "One trusted record" pill. |
| 1:24–1:32 | k.home | product | XELOR Market, click "Machining" filter |
| 1:32–1:40 | price | story, light | "XELOR MARKET · LISTING", "Get found, *without the directory bill.*" Bars: ₹32,000+ a year (hatched grey, 330 px) vs ₹249 a month (31 px gold-wine bar, "Free to start" pill). Points: We only connect / XELOR never touches the money / No lead reselling. |
| 1:40–1:47 | k.req | product | Buyer request, click "Send interest" |
| 1:47–1:57 | k.help | product | Machine down, call technician |
| 1:57–2:09 | s.gram | product, phone | Tap English, tap Approve and post, tap share to WhatsApp Status |
| 2:09–2:15 | k.gram | product | Request quote from a post |
| 2:15–2:28 | erp | the user's overview diagram, time-remapped | Hub "One place to run a factory" with nodes; shared line changed to "**Works alongside Tally.** No need to switch." |
| 2:28–2:36 | p.agent | product | XELOR Agent |
| 2:36–3:41 | j1–j13 | product, the original 12-step order | Same action timings as the user's film (confirm, check, send request, supplier quote on phone with typing, award, owner approve on phone, gate truck and scan, QC pass, release, record output and 4 tests, dispatch and IRN, close order), plus p.pass "The factory's record grows" |
| 3:41–3:50 | close | story, dark | Gold dust. "Every delivery builds trust." rises; the logo lockup draws; the tagline appears; chips (XELOR Market in gold, Xelogram, Agentic AI ERP); "STARTING IN PEENYA, BENGALURU". |

**Mast changes:** film name "The trusted network", sample label "Demonstration data". The scene counter counts product chapters only.

**Chapter jump menu:** The problem · XELOR · The network · XELOR Market · Xelogram · The engine · One complete order · Close.

#### 5.7.3 Narration (captions, with start seconds)

The voice is Kokoro `af_heart`, an American female voice at speed 1.0. XELOR is spoken "Zeelor" (zˈiːlɚ), Xelogram "Zeelogram", and AI ERP "A.I. E.R.P."

```
0.9  Behind almost every product made in India is a chain of small factories.
5.8  A foundry. A machine shop. A coating unit. An assembler.
9.7  But finding the right supplier, or the right buyer, is still a guessing game.
15.4 Most can't afford paid directories.
17.8 So they rely on WhatsApp, phone calls, Google and references.
21.8 And long site visits, just to trust one new supplier.
26.1 Inside the factory, orders sit in WhatsApp.
28.9 Stock in Excel. Accounts in Tally. Quality on paper.
32.8 The same details are typed again, and again.
36.4 Lines stop. Rejects surface late. Good suppliers stay invisible.
41.4 Everything is scattered.
43.3 And nobody can see who actually delivers.
48.6 XELOR changes that.
50.4 The trusted network behind what India manufactures.
55.2 Every delivery is counted at the factory gate.
58.1 So every supplier earns a real record: on time, quality, deliveries.
63.2 Factories find, compare and choose each other on that record.
67.4 Every request invites a new supplier. It joins free, and brings its own buyers.
72.7 The network grows with every order.
76.2 One trusted record. Three products.
78.8 XELOR Market. Xelogram. And an agentic AI ERP.
84.7 XELOR Market is where small manufacturers find each other.
88.2 And see what every seller has actually delivered.
92.0 Listing starts free, at a fraction of a paid directory.
95.7 XELOR only connects. It never touches the money.
100.0 A buyer's request goes to five matched sellers at most.
103.6 Never resold. No fee per lead.
107.4 Machine down? Find help reaches the nearest checked technicians in one tap.
112.3 Repairs, testing, compliance and finance, all in one place.
117.5 Xelogram turns a verified delivery into a post.
120.9 The agent writes the caption, in Tamil, Kannada, Hindi or English.
125.5 One tap to approve and share.
129.5 Buyers see real, verified work, and ask for a quote straight from the post.
135.3 Underneath it all is an agentic AI ERP.
139.1 It links orders, suppliers, stock, factory work and payments.
143.1 Already using Tally? It works alongside. No need to switch.
148.2 The agent drafts the request for quotes, chases replies and ranks the offers.
153.2 People make the decisions.
156.0 Let's follow one order, for eighty pumps.
160.0 Check the stock. Sixty metal bodies are missing.
165.0 Send one request to three suppliers.
169.0 The supplier opens a link. No login, no app.
172.3 Adds a price and date, and sends the quote.
176.0 Compare price, delivery, and each supplier's record.
181.0 The owner checks the amount, and approves from the phone.
186.0 On delivery day, scan the parts at the gate.
192.0 Check the parts. The supplier's record updates by itself.
197.0 Send the job and its parts to the factory team.
202.0 The team records eighty finished pumps.
204.2 Each one passes four checks.
210.0 Ship the pumps. The bill comes from the same order.
214.0 Close the order.
216.6 And the factory's own record grows.
221.1 Every delivery builds trust.
223.3 XELOR. The trusted network behind what India manufactures.
```

#### 5.7.4 Story-scene design

The full CSS, HTML and JS are in Appendix D.

- **Canvas:** `#story` is a full-bleed 1600×900 layer at z-index 24, above the stage. Subtitles sit above it at z-index 25.
- **Two scene looks:**
  - **Dark:** `radial-gradient(70% 80% at 85% 0%, #4a1a2c, transparent 60%), radial-gradient(60% 70% at 0% 100%, #3a1222, transparent 60%), #14070d`, with a film-grain overlay (SVG `feTurbulence`, 7% overlay) and a vignette.
  - **Light:** `radial-gradient(60% 70% at 100% 0%, #f3e3c3, …), radial-gradient(50% 60% at 0% 100%, #efdde3, …), #f7f3ed`.
- **Type:**

  | Element | Font and size | Colour |
  |---|---|---|
  | Kicker | JetBrains Mono 700, 17 px, tracking 3 px, with a 34 px rule | gold `#e2b54a` on dark, wine `#7a2945` on light |
  | h1 | Bricolage 700, 66 px, −2.6 px tracking | `em` gold on dark, wine on light |

- **Subtitles:** the band turns transparent over story scenes, with text shadow.
- **Determinism:**
  - Every style is set from film time by `phase(t, start, dur)` with easings (cubic out, quintic out, in-out cubic, and a back-overshoot "eb").
  - No CSS transitions, no timers, no random values: a seeded linear congruential generator places particles and graph nodes.
  - Words are split into spans and revealed with opacity, a 26–34 px rise and a blur from 7 px to 0.
- **Crossfades:** scenes fade in over 0.45 s from their start and fade out 0.45 s after their end. The first scene fades from black over 0.9 s.
- **Cue sync:** every animation is timed from the start of its narration line (`TL.story[sid].cues`), so visuals land on the spoken words.

#### 5.7.5 Realistic pointer and touch

The full code is in Appendix D (`director.js`). The same logic was ported to KisanCred.

- **Cursor:**
  - A macOS-style black arrow with a white outline, 19×27 px. Path: `M2 2V26.2L7.7 20.7 11.5 29.8 15.4 28.1 11.6 19.3H19.4Z`, fill `#141114`, stroke `#fff` 1.7.
  - Drop shadow `0 1px 1.4px rgba(0,0,0,.4)`. The hotspot is at the tip (offset −2 px).
- **Movement:**
  - Duration follows Fitts's law: `0.26 + 0.105·log2(1 + d/width)`, clamped to 0.3–1.05 s.
  - Path: a cubic Bézier with a wrist arc, where the bend is ±min(70, 0.12·d) perpendicular to the line, sign set by a seed.
  - Timing: minimum-jerk easing `x³(10 − 15x + 6x²)`. The main move covers 84% of the time and lands up to `min(9, 0.035·d)` px past the target; a correction settles it over the last 16%.
  - Small deterministic offsets so it never hits dead centre.
- **Idle behaviour:**
  - On each desktop shot, the pointer moves to the highlighted element (or the page body) about 0.45 s in, as if reading.
  - It drifts 28–90 px after any action that has more than 2.5 s before the next one.
  - Shots with no actions longer than 4–4.5 s get a drift around 2.7–2.9 s in.
  - Idle moves never start within 1.9 s of an action.
- **Clicks:**
  - The cursor scales to 0.84 from −0.03 to +0.14 s around the click.
  - A 22 px ring (1.6 px, `rgba(122,41,69,.7)`) expands to about 1.65× and fades over 0.38 s.
- **Typing:** for type actions the pointer arrives at the left part of the field, clicks to focus, then the characters appear.
- **Re-entry:** the cursor appears from the bottom right (about 84%/86% of the browser) whenever the recording returns to a desktop screen. It carries over between consecutive desktop shots.
- **Phone screens:** no arrow. A **touch circle** instead:
  - 28 px on the phone and 46 px on the zoomed inset;
  - fill `rgba(255,255,255,.62)`, border `rgba(35,25,30,.38)`, plus a white ring;
  - it appears 0.2 s before the tap at scale 1.25 → 1, presses (0.82, darker) for 0.11 s, then lifts with an expanding ring (scale 1 → 2.1) over 0.31 s.
- **Inset mirroring:**
  - The phone inset script tags the cloned target with `xfilm-tap`, so the tap also shows on the large inset.
  - For `s.gram` the inset was extended: before posting it shows the language buttons, header, caption and Approve button; after posting, the "Posted" card, the share buttons, the header and the caption.

#### 5.7.6 Sound

The mix is in `mix.py`, at 44.1 kHz.

- **Problem section:**
  - A low drone under 0–47 s: 55, 82.4, 110, 164.8 and 58.3 Hz with harmonics, a 0.18 Hz amplitude LFO, rising intensity and a one-pole low-pass.
  - A heartbeat in the cost scene.
- **Whooshes** (band-swept noise) at every story-scene change.
- **Impact hits** (pitch-drop sine from 90 to 38 Hz, plus a sub and a noise burst): the guessing-game break, the three cost slams, a strong hit on "Nobody can see…", the logo reveal and the closing logo.
- **Logo reveal:** a shimmer (1320 / 1760 / 2217 / 2637 Hz) and a chime at 660 Hz.
- **Small effects:**
  - message pops in the WhatsApp chat;
  - key ticks for search typing and the retyping in the inside scene;
  - chimes at the gate check (990 Hz), "chosen" (1180 Hz) and "joins free" (880 Hz);
  - soft ticks for the network growth;
  - a click for every desktop click and a tap tick for every phone tap.
- **Music:** the user's original music bed starts at the reveal (+1.4 s), loops with 3 s crossfades and fades out.
- **Final MP4 mix:** narration + music_fx (amix, normalize=0) then `loudnorm I=-16:TP=-1.5:LRA=11`, stereo 48 kHz. In the HTML, narration is mp3 96k mono and music+sfx is mp3 128k mono.

#### 5.7.7 Timeline builder

`build_tl.py` reads each clip's duration and lays segments end to end:

- **Story segments:** a lead, gaps between lines and a tail (tuned per scene, for example the reveal has a 1.5 s lead and the cost scene has 0.9/0.6 s pauses).
- **Product shots:** lines start 0.5 s in; the length is max(narration + 0.9, last action + 1.5).
- **Order journey shots:** fixed original durations, with line lead 0.3 s.
- **Product actions:**

  | Shot | Action | Time |
  |---|---|---|
  | Market | `marketMachining` | line 0 + 2.0 |
  | Requests | `buyerInterest` | line 1 + 0.9 |
  | Find help | `machineHelp` | line 0 + 1.25 |
  | Find help | `callTechnician` | line 1 + 0.7 |
  | Xelogram (phone) | `postEnglish` | line 1 + 3.55 |
  | Xelogram (phone) | `approvePost` | line 2 + 0.55 |
  | Xelogram (phone) | `sharePost` | line 2 + 2.0 |
  | Feed | `postQuote` | line 0 + 3.3 |

- **Outputs:** `timeline.js` (`window.XELOR_TIMELINE = {duration, chapters, shots, story}`), `captions.json` and `audio_plan.json`.

#### 5.7.8 Rebuild steps

1. `python3 gen.py`: Kokoro TTS writes one wav per caption line into `vo/` with `durations.json`.
2. `python3 build_tl.py`
3. `python3 mix.py`: writes `narration.wav` and `music_fx.wav`. It needs `../film/music.wav`, decoded from the original film's music.
4. `python3 assemble.py`: takes the user's original film HTML and replaces the audio, music, captions, coverage, timeline (s3), patched inset (s2), overview text (s5), director (s6 becomes story.js plus director.js), CSS (story.css plus cursor and touch), cursor SVG and touch elements, story markup with images (Market, ERP, Xelogram phone as data URIs), mast labels, start card, timing labels and player info.
5. Export frames:
   - `node export.mjs 0 84.05`, `node export.mjs 84.05 155.69` and `node export.mjs 155.69 229.685` run in parallel.
   - Viewport 1600×900 at device scale 1.2 gives 1920×1080. Frames are JPEG q93 at 30 fps (6,891 frames).
   - The splits are at scene boundaries where the pointer resets, so the output is deterministic.
6. Encode: `ffmpeg -framerate 30 -i frames/f%05d.jpg -i final_audio.wav -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 192k -shortest XELOR-Product-Film.mp4`

### 5.8 KisanCred product film (`KisanCred-Product-Film.html` / `.mp4`)

- **The film:** the user's KisanCred film, 145 s and 25 chapters: a farmer marketplace, a distributor workspace, Kisan Feed, quotes, Ravi's connected journey (list harvest → buyer demand → matches → distributor and farmer accept → WhatsApp → confirm trade → Farmer Credit Passport → loan consent), then the bank workflow (queue → assign field officer → field app checks, photos and checklist → report sync → credit profile and decision) and a close. It uses green and gold.
- **Unchanged:** narration, scenes, illustrations, timings and the product.
- **Changed:**
  - The interaction code in the director (`humanPath`, `planInteraction`, `pointerAt`, `ripple`) was replaced with the XELOR pointer system from 5.7.5. Its virtual clock (`installed(w()).advance(ms)`) and seek replay were kept.
  - Mode rule: `f.` and `o.` screens are **touch** (farmer and officer phones); `b.`, `x.` and `k.` screens are **desktop** (buyer, distributor, bank).
  - The cursor re-enters whenever the film moves from a touch screen to a desktop screen.
  - Typing into the WhatsApp field: click to focus, then type.
  - The phone inset was patched the same way, with the `xfilm-tap` mirror.
  - Cursor and ripple CSS were overridden (ripple in green `rgba(40,83,62,.75)`).
  - Click, tap and key sounds were added to the music track (`sfx.py`).
- **Export:** workers at 0–61, 61–105 and 105–145 (all desktop re-entry points), 4,350 frames, the same encode settings. Result: 1920×1080, 2:25, 17.1 MB.

### 5.9 Website (`XELOR-Website.html`, `xelor-site/`, published page)

The full source is in Appendix A. Images are the 14 WebP files in the source bundle.

**Design plan** (written into the CSS):
- Layout: one long product page. A dark "network" band in the middle carries the core idea; product screens sit in browser and phone frames.
- Colour tokens (light → dark):

  | Token | Light | Dark |
  |---|---|---|
  | bg | `#faf6f2` | `#140a0f` |
  | surface | `#fff` | `#1f1118` |
  | surface-2 | `#f4ece6` | `#2a1720` |
  | line | `#e8ddd5` | `#3a2430` |
  | ink | `#22161b` | `#f6ecdc` |
  | body | `#45373d` | `#dbc8cf` |
  | muted | `#76666c` | `#ab97a0` |
  | wine | `#7a2945` | `#d27a99` |
  | wine-2 | `#9c3a5d` | |
  | wine-soft | `#f5e7ec` | |
  | gold | `#c89a2e` | `#e2b54a` |
  | gold-ink | `#8a6312` | |
  | gold-soft | `#f7edd6` | |
  | deep | `#24101a` | `#0d0508` |
  | deep-2 | `#341826` | |
  | cream | `#f6ecdc` | |
  | on-deep | `#e2ccd5` | |
  | ok | `#1b6a48` | `#5fc095` |
  | ok-soft | `#e3f0e9` | |
  | bad | `#b3402f` | `#f08b78` |
  | bad-soft | `#fbe8e3` | |

- Fonts: Google Fonts (3.3). Body 17/1.6. Section h2 `clamp(32px, 4.4vw, 52px)`. Hero h1 `clamp(42px, 6vw, 76px)`, weight 800, tracking −0.04em.
- Container 1180 px with a 24 px gutter. Sections have 96 px vertical padding.

**Sections:**
1. **Sticky frosted nav:** logo; links Problem · The network · Products · How it works · Pricing · Team; a "See the product" button.
2. **Hero:**
   - An animated network canvas behind everything (46 drifting nodes, links within 150 px, 18% gold nodes).
   - Left column: eyebrow "Trusted supplier network · India", the headline with "what India manufactures." in wine, the lede (MSMEs and small industries…), buttons "How it works →" and "Explore the products", and "Built for" pills.
   - Right column: a stage with the XELOR Market browser (tilted with perspective `rotateY(-7deg)`), a Xelogram phone that floats, and a floating track-record card (96% / 0.3% / 19, count-up, "Counted at the factory gate"). They rise in at 0.1, 0.35 and 0.55 s.
3. **Marquee ticker:** Foundries · Machine shops · Coating units · Assemblers · Job shops · Fabricators · Pump makers · Workshops · Small factories, with gold dots, scrolling over 40 s.
4. **Problem:** "Finding a good supplier is still guesswork."
   - 4 cards: WhatsApp, calls and word of mouth / Listing sites cost too much (₹32,000+) / No way to know who's reliable / Paperwork everywhere.
   - A chat mock-up ("Casting suppliers", 7 messages, Day 6) with a red "NO REPLY" stamp.
5. **Network band** (dark, impact): "Every delivery builds a *track record.*"
   - A 5-node chain: A factory orders / The supplier delivers / The delivery is checked / **A record is earned** (gold node) / Good work gets noticed. A gold light runs along the rail every 3.6 s and the nodes pulse in sequence.
   - An example track-record card (Sri Ganesh Castings · Foundry · Hosur · supplying since 2024: 96% / 0.3% / 19, "Built from real receipts and quality checks. Demonstration data.").
   - A growth card with a mini network canvas and the flywheel pills.
6. **Products:** "One trusted record. Four ways to use it." Accessible tabs (arrow keys):
   - **XELOR Market** (FLAGSHIP): Market screenshot. Real numbers on every seller / five matched sellers, never resold / free, from ₹249 / never handles payments.
   - **Find help:** Help screenshot. Machine down one tap / repairs, testing, compliance, finance, job work / reviews only from confirmed jobs / scheme help.
   - **Xelogram:** feed and phone draft. Verified delivery becomes a post with Request quote / captions in 4 languages / WhatsApp Status / privacy.
   - **Smart factory software:** ERP home and owner phone. Reads orders from messages / asks suppliers and follows up / owners approve from phone / works alongside Tally.
7. **How buying works:** "Ask. Compare. Choose. Record." Four step buttons swap the figure (supplier phone / ranked quotes / owner approval phone / gate receipt). It auto-advances every 4.2 s while in view, until the visitor clicks.
8. **Gallery:** a horizontal snap scroller: Factory passport, The assistant, Ranked quotes, Xelogram feed.
9. **Comparison table:** WhatsApp & calls vs Paid listing sites vs **XELOR** (highlighted column).

   | | WhatsApp & calls | Paid listing sites | XELOR |
   |---|---|---|---|
   | Cost to get listed | Free | ₹32,000+ a year | Free · from ₹249/month |
   | Shows who delivers on time | No | No, identity only | Yes, from real deliveries |
   | Your enquiry sold to many sellers | — | Often | Never, 5 sellers at most |
   | Handles your money | — | Some do | Never |
   | Reaches small suppliers | Only people you know | Only those who pay | Every supplier joins free |

10. **Pricing:** Suppliers ₹0 / XELOR Market Free then ₹249/month (highlighted dark) / Smart factory software ₹50K/month per plant. Note: "Launch pricing, still being tested with pilot customers."
11. **Team:** "Starting in Peenya, Bengaluru."
    - Hari Rajiv (Co-founder & CEO; interning at Siemens, where he first saw the technology side of manufacturing).
    - Medhansh (Co-founder & CTO; interning at Cisco; builds the XELOR product and platform).
    - Gold-soft strip: 21 years / 10–15 / 2 pilots.
12. **CTA band:** "Every delivery *builds trust.*"
13. **Footer:** Peenya, Bengaluru · demonstration data.

**Motion and behaviour:**
- Reveal: content is fully visible at rest. Only elements below the fold get a 26 px rise as they enter (`IntersectionObserver`).
- Numbers count up once when in view.
- Everything stops under `prefers-reduced-motion`.

**Build and hosting:**
- Run `python3 build.py`. The published claude.ai page uses the artifact form.
- `xelor-site/index.html` with `vercel.json` (`cleanUrls`) is ready for Vercel: Add New → Project → import `harirajiv-web/xelor-mvp`, branch `claude/laughing-mccarthy-c3m33c`, Root Directory `xelor-site`, Deploy.
- Or drag `XELOR-Website.html` onto Netlify Drop.

**Tests:** no page errors; zero sideways overflow at 1360 px and 400 px, light and dark.

**Bugs fixed during the build:**
- Images were stretched (`img{height:auto}` added).
- Grid columns were squeezed (`minmax(0, …)`).
- Screenshots got a second browser bar (the extra bar was hidden).
- Lazy-loaded images were missing in screenshots (lazy loading removed).
- A ✕ glyph leaked from the `.n` class (renamed to `.yes` / `.no`).

---

## 6. Research findings

### 6.1 Accelerator startups like XELOR (2 Oct)

- **The full loop is uncovered.** No startup from YC, a16z speedrun, Techstars, 500 Global, HF0, South Park Commons, Sequoia Arc, Peak XV Surge, Accel Atoms, Google for Startups or the others covers XELOR's whole loop.
- **Closest companies:** Lumari (YC X25), Mandel AI (YC S23, $3.9M seed), SpaceFlow (YC S26), Tenkara (HF0, $7M seed), Magentic (Sequoia Arc, $18M Series A), Waybill (YC S26, for hardware startups).
- **The one to watch: Tiny (YC F24).** It builds an AI-agent ERP for factories that run on Excel, in India, Vietnam and Indonesia. Funding unknown. It was later removed from the application answers at the user's request.
- **Crowded:** RFQ → ranking → PO (Didero $30M, LightSource $33M, Levelpath $55M, Zip at $2.2B).
- **Open:**
  - supplier records earned from receipts and inspections;
  - peer capacity sharing;
  - the factory passport;
  - a GST-native ERP for small factories;
  - WhatsApp quoting for MSMEs.
- **India threats:** IndiaMART (directory plus Busy accounting software), Procol, 1Buy.AI, OfBusiness, Zetwerk.
- **Advice:** pitch the earned record and passport, not the RFQ agent. The 2026 MSME payment rules are an adoption reason.

### 6.2 Marketplace, services and Xelogram (3 Oct)

All figures came from search summaries and need checking.

- **IndiaMART:**
  - The entry plan rose to about ₹32,000/year in September 2025, and paying sellers have fallen each quarter (about 1,000, then 1,236, then 1,852).
  - About 7% monthly churn on the cheapest plan, and only about 2.5% of listed sellers pay.
  - TrustSEAL (about ₹50,000/year) checks identity only. Trustpilot rating about 2/5.
  - Seller complaints: leads resold to 10+ sellers, fake leads, auto-debit.
- **Pricing gap:** a price around ₹199–299/month reads as about 10× cheaper.
- **Connect-only is legally simpler:**
  - No RBI payment-aggregator licence is needed.
  - No GST TCS (Karnataka High Court, March 2026, Udaan's case).
  - Risk: income-tax TDS (0.1%) if checkout is added.
  - Early payment must be by referral only.
  - Phone numbers need consent under the DPDP Act and should be masked.
- **Services gap:**
  - About 70% of MSMEs don't know the government schemes (24% know CGTMSE).
  - About 1,450 compliance items a year, costing ₹13–17 lakh.
  - 88% of Indian industrial firms have a monthly breakdown.
  - Avoid pay-per-lead.
- **Xelogram:**
  - Video works for Chinese suppliers (40,000+ livestream on Alibaba).
  - Only 13% of Indian MSMEs do social-media marketing, while 97% use WhatsApp.
  - Stand-alone business feeds failed (Polywork, Koo; Kirana Club was sold).
  - What works: photos inside listings with a verified badge and a quote button.
  - Name risk is moderate to high ("GRAM").
  - A feed brings social-media-intermediary duties.

### 6.3 Market size (3 Oct)

Full numbers are in 9.6. The report is at `reports/XELOR bottoms up market size.md`.

- **Inputs:**
  - 1.83 crore manufacturing MSMEs (Udyam, Jul 2026).
  - 47,762 factories with 100+ workers (ASI 2023-24).
  - 7,330 factories with 100–499 workers in Karnataka and Tamil Nadu.
  - 1.53 lakh MSMEs in Bengaluru, Hosur and Coimbatore.
  - TReDS ₹3.47 lakh Cr financed in FY26 (about 1.5× the year before).
  - Peenya about 13,000 units.
- **Upside case:** 7% share gives about ₹31 Cr.
- **Flags:**
  - ₹6 lakh vs ₹18/54 lakh price mismatch in the internal model.
  - The "5,000 named accounts" claim is unsourced.
  - Karnataka share, the 15 bp referral fee and the finance pools are assumptions.

---

## 7. Facts and numbers sheet (with status)

| Figure | Used in | Status |
|---|---|---|
| 1.83 crore manufacturing MSMEs (Udyam, Jul 2026) | Deck slide 2 and 14, market size | From research summaries, verify |
| "Over 6 crore MSMEs" (about 6.3 crore, all sectors) | Elevator pitch | Common official estimate, verify source |
| 47,762 factories with 100+ workers (ASI 2023-24) | Market size | Verify against MoSPI |
| ₹3.47 lakh Cr TReDS FY26 | Market size, TReDS explainer | Verify against RBI and platforms |
| 12% of MSMEs use ERP (RIS, 2026) | Deck slide 3 | Verify |
| IndiaMART 8.8M storefronts, ~2.5% paying, ₹32K entry plan, ₹50K TrustSEAL | Deck, one-pagers, website | Search summaries, verify |
| 97% of MSMEs use WhatsApp; 13% social marketing | Deck slide 8 | Search summaries, verify |
| ₹30 lakh crore credit gap | Brief | Search summaries, verify |
| Peenya about 13,000 units | Market size | Verify (Peenya Industries Association) |
| Sri Ganesh 96% / 0.3% / 19; Kaveri 91% / 0.32% / 32-of-32; 1,240 factories; Deccan Agro; technicians | Demo, film, website, one-pager | **Made-up demo data, always labelled** |
| MSMED 15/45-day rule; 43B(h) | Demo | Check the statute wording |
| WhatsApp Business AI (May 2026), MSMED amendment (Aug 2026), TReDS guarantee (Sep 2026) | Brief (tagged REPORTED), deck | Verify |
| ₹249/month, ₹50K/month per plant, ₹20K pilot, 75–78% margin, ~21-month payback | Deck, brief, website | Launch pricing from the brief |
| 21 years in Peenya, 10–15 visits, 2 pilots | Everywhere | Founders' own facts. Check the pilot wording ("running" vs "starting") |

---

## 8. Open items to verify or decide

1. **Pilot wording:** "running on real orders" vs "agreed to pilot / onboarding now". Keep it consistent across the deck, brief, website and applications. The brief still says "No signed customer yet."
2. **Pricing mismatch:** ₹6 lakh in the brief vs ₹18/54 lakh in the internal revenue model.
3. **Trade marks:** run searches for **XELOR** and **Xelogram** before public use.
4. **Fonts:** the embedded fonts lack Tamil and Kannada glyphs (captions fall back to system fonts).
5. **Team photos:** the founder photos are 220 px. Send larger ones.
6. **Medhansh's surname:** the website shows "Medhansh" only. The deck and brief use "Medhansh Mohanram".
7. **Film voice:** an offline AI voice (American, female). It can be replaced with the founders' own recordings or an Indian-accented voice by re-timing.
8. **Sharing:** the three claude.ai pages are private until shared. Vercel deploy is pending (steps in 5.9).
9. **Statistics:** confirm all the figures in section 7 against primary sources before investors see them.

---

## 9. Final texts library (word for word)

### 9.1 PearX industry choice
**B2B**, subcategory **Other**. Explanation, if asked: "Supply chain & procurement: an agentic AI ERP and trusted supplier network for Indian MSME manufacturers. Verified supplier records are earned from receipts and inspections and put to work on XELOR Market and Xelogram."
Avoid Fintech (XELOR never handles money) and Government.

### 9.2 One-line description

**How it evolved:**
1. AI ERP first.
2. "Don't lead with ERP."
3. Add Market and Xelogram.
4. Add the agentic AI ERP.
5. Add "low-cost".

**Final:**
> XELOR is the trusted supplier network for Indian MSMEs: our agentic AI ERP turns every delivery into a verified record that powers our low-cost marketplace and Xelogram, where factories find, showcase and trade with each other.

**Shorter (about 125 characters):** "A trusted supplier network for Indian MSMEs: an agentic AI ERP creates verified records that power our marketplace and Xelogram."

### 9.3 What are you building, and why? (as saved in the PearX PDF)

> We're building XELOR, a trusted supplier network for Indian MSMEs.
> Finding a reliable supplier is still hard for a small factory , Most MSMEs aren't on IndiaMART or other paid directories or can't justify for a paid listing. So they find suppliers through WhatsApp groups, phone calls and word of mouth. There's no way to know who actually delivers on time and who doesn't. So factories take risks, or pay more to play safe.
> XELOR connects factories through records they earn. Our agentic AI ERP runs a factory's daily work, and every delivery and inspection becomes a verified supplier record: on time, rejects, capacity.
> XELOR changes how they buy:
> Ask: when a factory runs short of a part, our AI writes the request for quote and sends it to suppliers. Suppliers reply from a simple link, with no login.
> Compare: XELOR ranks the quotes on price, delivery date and each supplier's track record, and explains why.
> Decide: the factory picks a supplier and approves the order.
> Record: when the goods arrive, XELOR records whether they came on time and passed quality checks.
> The network grows with every purchase request, and those records power two products:
> XELOR Market: a marketplace and services directory where every seller shows an earned record.
> Xelogram: a showcase feed where a verified delivery becomes a post buyers can request a quote from.

**Plain-language version written in chat (the "Ask / Compare / Decide / Record" version with the low-cost line):**
> XELOR helps small factories in India find suppliers they can trust.
> Today, when a factory needs a part, it asks around on WhatsApp or makes phone calls. Paid directory listings cost more than most MSMEs can afford, and there's no way to know who actually delivers on time. So factories take risks, or pay more to play safe.
> XELOR changes how they buy:
> - Ask: when a factory runs short of a part, our AI writes the request for quote and sends it to suppliers. Suppliers reply from a simple link, with no login.
> - Compare: XELOR ranks the quotes on price, delivery date and each supplier's track record, and explains why.
> - Decide: the factory picks a supplier and approves the order.
> - Record: when the goods arrive, XELOR records whether they came on time and passed quality checks.
>
> Every order makes the supplier's track record stronger. Factories then use these records on XELOR Market, where listing is free or very low-cost, to find trusted suppliers, and on Xelogram to show off their work and win new buyers.

### 9.4 What unique insight do you have into this problem? (as saved)

> We grew up inside this problem. Both founders have lived in Peenya, one of India's largest industrial clusters, for about 21 years. Our families work in these factories, and people in our circle own factory businesses here. 10–15 factory visits confirmed what we'd always seen.
> 1. In the AI era, trusted data matters more than AI. Anyone can use an AI model, but no AI can guess which supplier really delivers on time. Only real delivery records show that. Whoever holds them helps factories get the best price, cheaper credit and the right buyers.
> 2. Trust must come from real work. Profiles go stale and ratings get faked. A supplier's true record is made at the factory gate, when goods arrive and are checked.
> 3. Small factories won't adopt software that adds work, so our ERP is agentic. Traditional ERPs fail in MSMEs because someone has to type everything in. In our agentic AI ERP, the AI does that work: it reads orders from email, writes requests for quotes, chases suppliers and records deliveries, while people approve anything that commits money or stock. The factory gets an ERP that runs itself, and trusted supplier records build up as a by-product.
> 4. Directories make money by reselling leads. We don't sell leads or handle payments, so we only win when a match works.
> 5. Every request grows the network. A supplier asked to quote joins free, and brings its other buyers along.

**Crisper version written in chat (with the affordability point):**
> We grew up inside this problem. Both founders have lived in Peenya, one of India's largest industrial clusters, for about 21 years. Our families work in these factories, and people in our circle own factory businesses here. 10–15 factory visits confirmed what we'd always seen.
> **1. Trusted data matters more than AI.** Anyone can use AI. But no AI can tell which supplier delivers on time. Only real delivery records can.
> **2. Trust must come from real work.** Profiles go stale and ratings get faked. A supplier's true record is made at the factory gate, when goods arrive and are checked.
> **3. Small factories hate extra typing.** So our ERP is agentic: the AI does the data entry, and people just approve. The records build themselves.
> **4. Most MSMEs are priced out of being found.** Directories charge high listing fees and make money reselling leads. We keep listing free or very low-cost, don't sell leads and never handle money, so we only win when a match works.
> **5. Every request grows the network.** Suppliers join free to quote, and bring their other buyers.

### 9.5 How many customer interviews? Live product? (as saved)
> We've visited 10–15 factories in Peenya and spoken with their owners and purchase teams. Beyond those formal visits, we've had countless informal conversations, since our families and friends work in and run these businesses.
> Yes, we have a working product. The core ERP runs on a real database, covering order, purchase, receiving, production, dispatch and accounts. An interactive demo shows the full flow, including requests for quotes, supplier records, XELOR Market and Xelogram.
> We're running 2 pilots with factories from our family and friends' network in Peenya. They're helping us test the request-for-quote flow and supplier records on real orders.

### 9.6 Competitors (as saved)
> Our biggest competitor is the status quo: WhatsApp groups and phone calls.
> Directories : (IndiaMART, JustDial). Paid listings cost more than many MSMEs can afford. They verify identity, not performance, and resell each enquiry to many sellers. On XELOR Market, listing is free or very low-cost. Sellers show real track records, and each request goes to five sellers at most.
> Managed marketplaces: (Zetwerk, OfBusiness). They take a margin and keep supplier data. We connect factories directly, take no cut and never handle money.
> SME software : (Tally, Zoho). They manage books, with no supplier network. Our agentic AI ERP builds supplier records from every order.
> AI procurement agents: (Didero and others). They work from outside the factory, so they never see deliveries arrive. We do.
> Others list suppliers or manage paperwork. Only XELOR builds trusted records from real deliveries.

### 9.7 Market size, bottom-up (as saved)
> We sized the market from three building blocks: the number of MSMEs and factories, what each pays per year, and the early-payment volume moving through TReDS.
> TAM: ₹7,947 Cr (~$900M) a year, all of India
> Manufacturing MSMEs: 1.83 crore × ₹2,490 = ₹4,561 Cr
> Factories with 100+ workers: 47,762 × ₹6 lakh = ₹2,866 Cr
> TReDS early payments: ₹3.47 lakh Cr × 0.15% = ₹520 Cr
> SAM: ₹504 Cr (~$57M) a year, our first two states (Karnataka and Tamil Nadu)
> MSMEs in Bengaluru, Hosur and Coimbatore: 1.53 lakh × ₹2,490 = ₹38 Cr
> Factories with 100–499 workers: 7,330 × ₹6 lakh = ₹440 Cr
> TReDS early payments in these clusters: ₹26 Cr
> SOM: ₹13.7 Cr (~$1.6M) a year by year 5
> 220 factories, 3% of SAM, × ₹6 lakh = ₹13.2 Cr
> 450 paying MSMEs, 3% of those we reach (IndiaMART converts about 2.5%), × ₹2,490 = ₹0.11 Cr
> TReDS early payments = ₹0.4 Cr
> Upside not counted above: this is a volume and network business. Every MSME that joins, even for free, adds verified data to the network. Once the network is large, it opens further revenue: promoted listings and ads aimed at suppliers and buyers, and services such as finance, logistics and certification offered to members.

**Closing lines from the chat version:**
- "We kept every assumption at the low end of Indian benchmarks. The model leaves out factories under 100 workers and every state beyond our first two."
- "*Sources: Udyam (Jul 2026), Annual Survey of Industries 2023-24, TReDS platform data (FY26). Dollar figures are approximate, at ₹88 per dollar.*"

**Ad guardrail:** "Ads never change the ranking. They're always labelled as promoted."

### 9.8 TReDS explainer
TReDS = Trade Receivables Discounting System, a set of RBI-regulated platforms (RXIL, M1xchange, Invoicemart, C2treds, DTX/KredX).

**How it works:**
1. The MSME uploads an invoice.
2. The buyer confirms it.
3. Banks and NBFCs bid, and the lowest discount wins.
4. The MSME is paid in 1–2 days at about 7–11% a year.
5. The buyer pays the bank on the due date.

**Scale:** about ₹3.47 lakh Cr in FY26.

**XELOR's role (later, not live):** proof of delivery helps faster and cheaper financing. XELOR earns a referral fee and never handles money.

### 9.9 Founder answers already in the PearX copy (user's own text)

**Q31, novel problem solving:**
> One week before the deadline for a "Cisco Global Partner Innovation Challenge", I was unexpectedly made the team lead and the only intern on a team of full-time professionals. The previous team lead had understood the submission requirements to mean that a basic product demo video was sufficient. After taking over, I reviewed the criteria and discovered that we actually needed a live customer pilot using real-world data. With only 7 days remaining, I took ownership, pitched and secured a customer pilot, initiated deployment on their live environment, and led the team to develop and integrate the solution full-stack and end-to-end around the customer's requirements. In one week, we went from no pilot to a live customer-backed solution and a completed submission to Cisco's global innovation challenge.

**Q32, outlier:**
> I think I'm an outlier because I've consistently pursued things that are difficult to do simultaneously. Alongside engineering, startups, and enterprise technology, I've competed in high-level cricket, representing Karnataka and being selected for the BCCI Vizzy Trophy—while continuing my engineering degree and building technical and business projects. I've also deliberately put myself across very different environments: building AI and hardware products, working in enterprise cybersecurity and sales, and taking leadership roles in competitive sport. I enjoy entering areas where I have no clear playbook and figuring things out from first principles. What connects all of this is how I approach problems: I don't wait until I'm fully ready or until someone gives me ownership. I take responsibility, learn quickly, and figure out how to make it happen.

### 9.10 Founder video script (final, about 1:05, Hari about 70% and Medhansh about 30%)

**INTRO**
> **HARI:** Hi, I'm Hari, co-founder and CEO of XELOR.
> **MEDHANSH:** And I'm Medhansh, co-founder and CTO.
> **HARI:** We're both student founders. Medhansh is interning at Cisco, and I'm interning at Siemens, which is where I first saw the technology side of manufacturing up close.

**THE PROBLEM (Hari, shortened version)**
> Behind almost every product made in India is a chain of small factories. But finding the right supplier or buyer is still a guessing game. Most can't afford paid directories, so they rely on WhatsApp, Google, phone calls, references and long site visits.
> Inside the factory, orders sit in WhatsApp, stock in Excel, accounts in Tally and quality on paper, so the same information is typed again and again.
> It's all scattered, and nobody can see who actually delivers.

**WHAT XELOR DOES (Medhansh)**
> That's why we built XELOR, the trusted network behind what India manufactures.
> On XELOR Market, an affordable marketplace, MSMEs can easily find each other and connect directly, whether they're looking for a supplier or a buyer. Before they connect, they can see what a supplier has actually done: past deliveries, how often they were on time, and the quality of their work.
> Behind it is our agentic AI ERP. It sends requests for quotes automatically, ranks the replies on price, delivery and track record, and keeps a record of every delivery as it happens.
> Already using Tally or another ERP? XELOR connects to it, so there's no need to switch.

**CONCLUSION (Hari)**

Optional opening lines, from the earlier conclusion version:
> In this AI era, anyone can use an AI model, but verified data on who actually delivers is rare, and that's what XELOR builds with every order. And it's a volume game: the more factories join a cluster, the more valuable and trusted the network becomes.

The final closing, as reframed by the user:
> That's why we're starting in Peenya. We've lived there for over 21 years, and our families work in these businesses and factories. After talking to the owners around us, we realised this isn't one factory's problem. It's how the whole cluster works. That's what led us to build XELOR, and we already have two pilots starting to run.
> Thank you, and let's make XELOR a great success story.

**Recording tips:**
- Slow down on the key lines.
- Look at your co-founder at the hand-off.
- Say "requests for quotes", not "RFQs".
- Say "two pilots starting" if they aren't fully running.

### 9.11 Cover headline journey (deck)

| Stage | Headline |
|---|---|
| Original | "Earn trust with every delivery. Get found for the work you do." |
| First suggestion | "Proof beats promises." |
| For VCs | "The trust layer for Indian manufacturing." |
| Chain idea | "Connecting India's factory floor, link by verified link." / "The network behind every part made in India." |
| Combined | "The network behind every part made in India. / Connecting the factory floor, link by verified link." |
| "Manufactured" options | 1. The network behind everything manufactured in India. 2. The network behind Indian manufacturing. **3. The trusted network behind what India manufactures. (chosen)** 4. Behind every product manufactured in India. 5. The network behind India's manufacturing chain. 6. Powering how India manufactures. |
| Subline chosen | "Suppliers, job shops, assemblers and manufacturers, connected through records earned on every delivery." ("manufacturers" added at the user's request) |

### 9.12 Slide 2 problem message
"**1.8 crore manufacturers. No shared record of who delivers.**" Full slide in 5.3.

### 9.13 Idea rating
**8/10 as an idea.**
- **Strong:** a real daily pain; the record is a by-product of real work; a data moat for the AI era; a built-in network effect; a big open market; clean incentives.
- **Holding it back:** too many products at once; willingness to pay is unproven; the cold start; nearby competitors (Tiny, IndiaMART with Busy).
- **What makes it a 9:** 10 Peenya factories using it for RFQs, with suppliers claiming their records.

### 9.14 "What do you know about a space that most people don't? How do you know it?" (118 words)
> Small factories already record the data that decides supplier trust. It just never leaves the gate.
>
> Every day, the guard logs delivery times in the inward register, stores notes short quantities and quality marks rejects. Yet when owners need a new supplier, they ignore this and rely on calls, references and site visits. Most also pay more to stay with known suppliers, because one late part stops a line.
>
> How we know: both founders have lived in Peenya for about 21 years, our families work in these factories and our circle owns a few. On 10–15 visits, we asked how they chose their last supplier. Always references, never records, despite the gate register. Our two pilots confirmed it.

Check that "always references, never records" matches the visits.

### 9.15 "What are you looking for in a cofounder?" (technology partner, 98 words)
> I'm looking for a technology partner who can own XELOR's product end to end: a strong full-stack engineer with hands-on experience in AI agents, data systems and security, who ships fast, makes sound architecture calls and builds with users rather than for them.
>
> I bring operations and go-to-market: running pilots, onboarding factories and suppliers, sales, customer success, partnerships, finance and fundraising.
>
> Split: I run the business and keep customers close. My partner owns product, architecture, the agentic ERP, data and the engineering team. I bring the field feedback, they turn it into product, and we set priorities together.

### 9.16 "What are you obsessed about?" (117 words)
> I'm obsessed with bringing real technology to India's small and mid-sized manufacturers.
>
> It started at my Siemens internship, where I saw how large plants run on connected systems that track every order, part and machine. Meanwhile, the MSMEs that are the backbone of Indian manufacturing run on WhatsApp, Excel, Tally and paper. That gap hooked me.
>
> I began by building an ERP for small factories. Talking to owners revealed a bigger problem: finding suppliers they can trust. That led to XELOR, a trusted supplier network where our agentic AI ERP turns every delivery into a verified record, powering XELOR Market and Xelogram.
>
> Nerdiest thing: building a hash-chained audit trail so no supplier record can be quietly edited.

### 9.17 "Has anyone used something you made? What surprised you?" (119 words)
> Yes. While building XELOR, I convinced two small factories in Peenya to move off WhatsApp, Excel and paper onto an ERP I built. They now run orders, purchases, stock and deliveries in one place.
>
> What surprised me most: the owners never pushed back on price or on learning new software. They pushed back on typing. Every extra field was a reason to slip back to WhatsApp. Usage only stuck once the system did the entry for them: reading orders from messages, filling purchase requests and recording deliveries at the gate.
>
> That changed how I build. Small factories don't need more features; they need less work. It's why XELOR's ERP is agentic: the AI does the typing, people just approve.

Check the real pilot status and the real surprise.

### 9.18 "A strong opinion you acted on when smart people said you were wrong" (final, 116 words)
> **Opinion:** students can build real companies now; waiting for a "safe" moment is the bigger risk.
>
> People I respected said I was wrong: get a stable job first, start a business later. Sensible, but the best time to learn to build is when failing costs least.
>
> **So I acted.** While interning at Siemens and studying, I spent weekends on factory floors, built an ERP from scratch and pitched owners until two MSMEs agreed to pilot it.
>
> **What happened:** two factories moved off WhatsApp and paper onto software I built. I'd make the same call again. Even if XELOR fails, I'll know how to sell, build and take rejection, with a network no safe path could give.

### 9.19 Elevator pitch, problem and solution (2,378 characters)
> **PROBLEM**
> India has over 6 crore MSMEs, and small factories are the backbone of its manufacturing. A single product often passes through a chain of them: a foundry, a machine shop, a coating unit, an assembler. Yet finding the right supplier is still guesswork.
>
> Most small businesses can't afford paid listing sites, which cost ₹32,000 or more a year. So owners rely on WhatsApp groups, phone calls, word of mouth and long site visits. Even then, nobody can see which supplier actually delivers on time and with good quality. Owners either take a risk on someone new or pay more to stay with someone they know. Good suppliers stay invisible, and a late or faulty part can stop a whole production line.
>
> Inside the factory it's no better. Orders sit in WhatsApp, stock in Excel, accounts in Tally and quality checks on paper, so the same details are typed again and again, and the real history of each supplier is lost.
>
> **SOLUTION**
> XELOR is a trusted supplier network for MSMEs and small industries. It connects factories through track records they earn on every real delivery.
>
> 1. Ask: a factory says what it needs, and XELOR sends the request to suppliers. They reply from a simple link, with no login or app.
> 2. Compare: prices are shown side by side, along with each supplier's delivery history.
> 3. Choose: the factory picks the supplier, and the owner approves from the phone.
> 4. Record: when the goods arrive, XELOR notes whether they came on time and passed quality checks. This builds each supplier's track record automatically.
>
> Every request also invites a new supplier, who joins free and brings its own customers, so the network grows with every order.
>
> These track records power three products:
> - XELOR Market (our flagship): a low-cost marketplace where MSMEs find suppliers, buyers and local services such as repairs and testing, and see each seller's record before calling. Listing starts free.
> - Xelogram: a social-style feed where factories show finished work and buyers can ask for a price directly from a post.
> - Smart factory software: an AI-powered ERP that handles orders, stock and bills, does most of the typing itself, and works alongside Tally.
>
> XELOR never handles payments and never resells leads. We only connect businesses. We're starting in Peenya, Bengaluru, one of India's largest industrial areas, where we have two pilots with local factories.

### 9.20 Improvement plan after the accelerator research (2 Oct)
1. Lead with the earned record and the passport (shareable link; disputes; a trial-order path for new suppliers).
2. Turn every RFQ into a sign-up ("claim your record", a free supplier tier, bookable capacity with no cut).
3. Make messaging-first real (WhatsApp Business API, voice-note quotes in Kannada, Tamil and Hindi, machine-readable RFQs).
4. Don't force an ERP switch (network layer synced to Tally, Busy or Zoho first).
5. Use the 2026 compliance rules (payment clock, TReDS upload, 15/45-day default).
6. Earn beyond subscriptions (supplier financing via TReDS and NBFC partners, referral only).
7. Move faster than Tiny (India-first: GST, languages, WhatsApp; win Peenya with 10 pilot factories trading with each other).

### 9.21 Marketplace proposal (approved in full: A, B, C, D)
- **A. XELOR Market:**
  1. Market home with search and a Peenya filter.
  2. Two badges: Identity verified (GST, Udyam) and Earned record.
  3. Requests go to 5 matched sellers at most, never resold, from verified buyers only.
  4. Masked calls and WhatsApp, every contact logged, "XELOR never handles payments".
  5. Pricing: Free / Verified about ₹249 a month / included for ERP customers. No pay-per-lead and no auto-debit.
- **B. Find help:**
  6. Nine categories: Finance & TReDS; compliance (CA/GST, factory licence, KSPCB, fire NOC); skilled manpower; testing and calibration (NABL, BIS, ZED); machine repair; job work (CNC, plating, heat treatment); logistics; effluent and scrap; legal and payment recovery (MSME Samadhaan).
  7. "Machine down" button showing the 3 nearest technicians.
  8. Reviews only after a logged contact and a confirmed job.
  9. Scheme finder (CGTMSE, ZED, Lean, TReDS 75% guarantee).
- **C. Xelogram:**
  10. Posts drafted from real events, approved in one tap, captioned by AI in Kannada, Tamil, Hindi or English.
  11. Verified badge and Request quote on every post; follow; Peenya feed.
  12. Factory profile.
  13. One-tap sharing to WhatsApp Status, Instagram and LinkedIn.
  14. Visibility: public, buyers only or private.
  15. Report and grievance flow (IT Rules).
- **D. Wiring:**
  16. About 3 new tour steps (4 were built).
  17. Brief updates: Market section, prices, safer early-payment wording, IndiaMART and JustDial in the landscape.

---

## 10. Commit log for this work (branch `claude/laughing-mccarthy-c3m33c`, newest first)

```
0b425e0 Add XELOR website as a standalone HTML file
8e2b72c Add XELOR product website (static, Vercel-ready)
50d7e20 One-pager: restore original theme, simpler wording, MSME target
0f47c4c Soften the XELOR one-pager theme
14af119 Add simple one-page XELOR overview PDF
8dcff80 Add KisanCred product film with lifelike cursor and touch taps
4380f69 Rebuild XELOR product film around the problem, network, Market and Xelogram
04986f1 Tidy problem slide headline line break
e4e429d Stronger problem slide: 1.8 crore manufacturers, no shared delivery record
cdd7971 New deck cover: 'The trusted network behind what India manufactures'
d172c29 Add logo option C as SVG and PNG
3d2be55 Add XELOR logo and apply it to the pitch deck and one-pager
643c57c Redesign pitch deck and one-pager for readability
339950b Add saved copy of the PearX W27 application as a PDF
3c72b52 Add 15-slide pitch deck PDF and one-page product PDF
10b5b5d Add XELOR bottom-up market size report and notes
9a6def2 Add market sizing research notes (MSME factory counts)
07ad3f7 Add XELOR Market, Find help and Xelogram to the demo and brief
74eca82 Add Xelogram research notes and final MSME services notes
d2a26ce Add marketplace research notes (IndiaMART incumbents, MSME services)
eac3ae7 Return to the investor brief's soft theme and embed the v6 product
70c6433 Reposition XELOR as the trusted supplier network and add the pitch deck
3031e30 Add report on accelerator startups similar to XELOR
3f57628 Add India and YC research notes on startups similar to XELOR
4297ae7 Add more research notes on accelerator startups similar to XELOR
c65c0be Add in-progress research notes on accelerator startups similar to XELOR
ef85faa Show an example view on every XELOR demo screen and drop the spec panel
576f129 Add XELOR product demo in the KisanCred demo layout
```

---

# Appendices: full source of the smaller designs

These are copied verbatim from `deliverables/source-bundle/`.

**Where images are tokenised:**
- In the website, `{{name}}` is replaced by `data:image/webp;base64,…` from `website/img/name.webp` (run `build.py`).
- The deck and one-pager reference `fonts.css`, `xelor-mark.svg` and `shots/*.jpg|png` relative to the HTML file.
- The film story HTML uses `{{IMG_MKT}}`, `{{IMG_ERP}}` and `{{IMG_GRAM}}` (from `imgs.json`).



## Appendix A. Website source (`website/src.html`)

Build: `python3 build.py` in `source-bundle/website/`.

````html
<title>XELOR</title>
<meta name="description" content="XELOR is the trusted supplier network for MSMEs and small industries. Every delivery builds a track record.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,650;12..96,800&family=JetBrains+Mono:wght@500;700&family=Source+Sans+3:wght@400;500;600;700&display=swap">
<style>
/* Layout: one long product page. Dark "network" band in the middle carries the core idea; product screens sit in browser and phone frames. */
:root{
 --bg:#faf6f2;--surface:#ffffff;--surface-2:#f4ece6;--line:#e8ddd5;--ink:#22161b;--body:#45373d;--muted:#76666c;
 --wine:#7a2945;--wine-2:#9c3a5d;--wine-soft:#f5e7ec;--gold:#c89a2e;--gold-ink:#8a6312;--gold-soft:#f7edd6;
 --deep:#24101a;--deep-2:#341826;--cream:#f6ecdc;--on-deep:#e2ccd5;--ok:#1b6a48;--ok-soft:#e3f0e9;--bad:#b3402f;--bad-soft:#fbe8e3;
 --shadow:0 30px 60px -30px rgba(60,20,35,.35);
 --display:"Bricolage Grotesque","Avenir Next","Segoe UI",system-ui,sans-serif;
 --sans:"Source Sans 3","Segoe UI",system-ui,sans-serif;
 --mono:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
 --bg:#140a0f;--surface:#1f1118;--surface-2:#2a1720;--line:#3a2430;--ink:#f6ecdc;--body:#dbc8cf;--muted:#ab97a0;
 --wine:#d27a99;--wine-2:#e295b0;--wine-soft:#3a1d2a;--gold:#e2b54a;--gold-ink:#e9c56c;--gold-soft:#3a2c14;
 --deep:#0d0508;--deep-2:#1d0d15;--cream:#f6ecdc;--on-deep:#d9c3cc;--ok:#5fc095;--ok-soft:#173528;--bad:#f08b78;--bad-soft:#3d1c17;
 --shadow:0 30px 60px -30px rgba(0,0,0,.7);color-scheme:dark}}
:root[data-theme="dark"]{
 --bg:#140a0f;--surface:#1f1118;--surface-2:#2a1720;--line:#3a2430;--ink:#f6ecdc;--body:#dbc8cf;--muted:#ab97a0;
 --wine:#d27a99;--wine-2:#e295b0;--wine-soft:#3a1d2a;--gold:#e2b54a;--gold-ink:#e9c56c;--gold-soft:#3a2c14;
 --deep:#0d0508;--deep-2:#1d0d15;--cream:#f6ecdc;--on-deep:#d9c3cc;--ok:#5fc095;--ok-soft:#173528;--bad:#f08b78;--bad-soft:#3d1c17;
 --shadow:0 30px 60px -30px rgba(0,0,0,.7);color-scheme:dark}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--body);font:400 17px/1.6 var(--sans);-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{max-width:100%;height:auto;display:block}
a{color:inherit}
h1,h2,h3{font-family:var(--display);color:var(--ink);margin:0;text-wrap:balance;letter-spacing:-.025em}
p{margin:0}
.wrap{width:min(1180px,100%);margin:0 auto;padding-inline:24px}
.eyebrow{font:700 12px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--wine);display:inline-flex;align-items:center;gap:10px}
.eyebrow::before{content:"";width:22px;height:2px;background:var(--gold)}
.sec{padding-block:96px}
.sec-head{display:grid;gap:14px;max-width:760px;margin-bottom:44px}
.sec-head h2{font-size:clamp(32px,4.4vw,52px);line-height:1.04;font-weight:800}
.sec-head p{font-size:19px;color:var(--muted);max-width:640px}
.btn{display:inline-flex;align-items:center;gap:10px;padding:14px 22px;border-radius:999px;font:700 16px var(--sans);text-decoration:none;border:1.5px solid transparent;transition:transform .2s,box-shadow .2s,background .2s}
.btn:focus-visible,.tab:focus-visible,.step:focus-visible,a:focus-visible{outline:3px solid var(--gold);outline-offset:3px}
.btn-pri{background:var(--wine);color:#fff;box-shadow:0 14px 30px -14px var(--wine)}
.btn-pri:hover{transform:translateY(-2px)}
.btn-ghost{border-color:var(--line);color:var(--ink);background:var(--surface)}
.btn-ghost:hover{border-color:var(--wine)}
.btn svg{width:18px;height:18px}

/* nav */
.nav{position:sticky;top:env(safe-area-inset-top,0px);z-index:50;backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);background:color-mix(in srgb,var(--bg) 78%,transparent);border-bottom:1px solid color-mix(in srgb,var(--line) 70%,transparent)}
.nav .wrap{display:flex;align-items:center;gap:24px;height:68px}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none}
.logo svg{width:34px;height:34px}
.logo b{font:800 22px var(--display);letter-spacing:-.03em;color:var(--ink)}
.nav-links{display:flex;gap:22px;margin-left:auto}
.nav-links a{text-decoration:none;font-weight:600;font-size:15px;color:var(--muted)}
.nav-links a:hover{color:var(--ink)}
.nav .btn{padding:10px 18px;font-size:15px}
@media (max-width:900px){.nav-links{display:none}.nav .btn{margin-left:auto}}

/* hero */
.hero{position:relative;overflow:hidden;padding-block:64px 80px}
#net{position:absolute;inset:0;width:100%;height:100%;opacity:.55;pointer-events:none}
.hero .wrap{position:relative;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px;align-items:center}
.hero h1{font-size:clamp(42px,6vw,76px);line-height:.98;font-weight:800;letter-spacing:-.04em}
.hero h1 em{font-style:normal;color:var(--wine);position:relative}
.hero h1 em::after{content:none;position:absolute;left:0;right:0;bottom:.06em;height:.12em;background:var(--gold);border-radius:4px;opacity:.5;transform-origin:0 50%;animation:ul 1.1s .6s cubic-bezier(.2,.8,.2,1) both}
@keyframes ul{from{transform:scaleX(0)}}
.hero .lede{font-size:21px;line-height:1.5;color:var(--body);margin-top:22px;max-width:560px}
.hero .lede b{color:var(--ink)}
.hero .ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.for{display:flex;flex-wrap:wrap;gap:8px;margin-top:28px;align-items:center}
.for b{font:700 11px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--gold-ink);margin-right:4px}
.for span{font-weight:600;font-size:14px;padding:6px 12px;border-radius:999px;background:var(--surface);border:1px solid var(--line);color:var(--ink)}
.stage{position:relative;min-height:470px}
.browser{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:var(--shadow)}
.browser .bar{display:none;height:34px;display:flex;align-items:center;gap:7px;padding:0 12px;background:var(--surface-2);border-bottom:1px solid var(--line)}
.browser .bar i{width:10px;height:10px;border-radius:50%;background:#e2675f}.browser .bar i:nth-child(2){background:#e7b14a}.browser .bar i:nth-child(3){background:#5fae5a}
.browser .bar span{margin:0 auto;font:500 11.5px var(--mono);color:var(--muted);background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:3px 14px;max-width:60%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.hero .browser{position:absolute;left:0;top:20px;width:92%;transform:perspective(1600px) rotateY(-7deg) rotateX(2deg);transform-origin:0 50%;animation:rise 1s .1s cubic-bezier(.2,.8,.2,1) both}
.phone{background:#120a0e;border-radius:34px;padding:9px;box-shadow:0 40px 70px -30px rgba(30,8,16,.6),inset 0 0 0 1.5px #3b2a31}
.phone img{border-radius:26px}
.hero .phone{position:absolute;right:0;bottom:-6px;width:31%;animation:rise 1s .35s cubic-bezier(.2,.8,.2,1) both,float 7s 1.5s ease-in-out infinite}
.rec{position:absolute;left:-14px;bottom:18px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px 16px;box-shadow:var(--shadow);width:min(300px,62%);animation:rise 1s .55s cubic-bezier(.2,.8,.2,1) both,float 8s 2s ease-in-out infinite reverse}
.rec .t{font:700 10.5px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--gold-ink)}
.rec b.n{display:block;font:650 17px var(--display);color:var(--ink);margin-top:4px}
.rec .k{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px}
.rec .k div{background:var(--surface-2);border-radius:10px;padding:7px 4px;text-align:center}
.rec .k strong{display:block;font:800 19px var(--display);color:var(--wine);font-variant-numeric:tabular-nums}
.rec .k small{font-size:11.5px;color:var(--muted)}
.rec .ok{display:flex;align-items:center;gap:6px;margin-top:10px;font-size:12.5px;font-weight:600;color:var(--ok)}
@keyframes rise{from{opacity:0;transform:translateY(30px)}}
@keyframes float{50%{translate:0 -10px}}
@media (max-width:960px){.hero .wrap{grid-template-columns:1fr}.stage{min-height:0;aspect-ratio:1.25/1}}

/* marquee */
.ticker{border-block:1px solid var(--line);background:var(--surface);overflow:hidden}
.ticker .track{display:flex;gap:44px;padding-block:16px;width:max-content;animation:tick 40s linear infinite}
.ticker span{font:650 18px var(--display);color:var(--muted);white-space:nowrap;display:flex;align-items:center;gap:44px}
.ticker span::after{content:"";width:7px;height:7px;border-radius:50%;background:var(--gold)}
@keyframes tick{to{transform:translateX(-50%)}}

/* problem */
.prob-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:40px;align-items:start}
.cards3{display:grid;gap:14px}
.pcard{display:flex;gap:16px;background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:20px 22px}
.pcard i{flex:none;width:46px;height:46px;border-radius:14px;background:var(--bad-soft);display:grid;place-items:center}
.pcard i svg{width:24px;height:24px;fill:none;stroke:var(--bad);stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.pcard h3{font-size:21px;font-weight:650}
.pcard p{color:var(--muted);margin-top:4px;font-size:16px}
.chat{background:var(--surface-2);border:1px solid var(--line);border-radius:22px;padding:18px;display:grid;gap:9px;position:relative}
.chat .hdr{display:flex;align-items:center;gap:10px;padding:4px 4px 10px;border-bottom:1px solid var(--line);margin-bottom:4px}
.chat .hdr i{width:34px;height:34px;border-radius:50%;background:var(--ok);opacity:.8}
.chat .hdr b{color:var(--ink);font-size:15px}.chat .hdr small{display:block;color:var(--muted);font-size:12.5px}
.msg{max-width:82%;padding:9px 13px 18px;border-radius:14px;background:var(--surface);font-size:15px;line-height:1.35;color:var(--ink);position:relative;box-shadow:0 1px 1px rgba(0,0,0,.06)}
.msg small{position:absolute;right:10px;bottom:3px;font-size:10.5px;color:var(--muted)}
.msg.me{margin-left:auto;background:var(--ok-soft)}
.msg.sys{margin:2px auto;max-width:none;width:max-content;padding:4px 12px;font-size:12.5px;background:var(--gold-soft);color:var(--gold-ink)}
.chat .stamp{position:absolute;right:16px;top:58%;transform:rotate(-8deg);border:3px solid var(--bad);color:var(--bad);font:800 18px var(--display);letter-spacing:.06em;text-transform:uppercase;padding:6px 12px;border-radius:10px;background:color-mix(in srgb,var(--surface) 70%,transparent)}
@media (max-width:900px){.prob-grid{grid-template-columns:1fr}}

/* network band */
.band{background:radial-gradient(60% 80% at 100% 0%,rgba(226,181,74,.16),transparent 60%),radial-gradient(60% 80% at 0% 100%,rgba(156,58,93,.35),transparent 60%),var(--deep);color:var(--on-deep)}
.band .eyebrow{color:#e2b54a}
.band .sec-head h2{color:var(--cream)}
.band .sec-head h2 em{font-style:normal;color:#e2b54a}
.band .sec-head p{color:var(--on-deep)}
.chain{position:relative;display:grid;grid-template-columns:repeat(5,1fr);gap:16px}
.chain .rail{position:absolute;left:8%;right:8%;top:34px;height:2px;background:rgba(255,255,255,.12);border-radius:2px;overflow:hidden}
.chain .rail::after{content:"";position:absolute;top:0;left:-30%;width:30%;height:100%;background:linear-gradient(90deg,transparent,#e2b54a,transparent);animation:run 3.6s linear infinite}
@keyframes run{to{left:100%}}
.node{position:relative;text-align:center;padding:0 6px}
.node .dot{width:68px;height:68px;margin:0 auto;border-radius:50%;display:grid;place-items:center;background:var(--deep-2);border:1.5px solid rgba(226,181,74,.55);box-shadow:0 0 0 8px rgba(226,181,74,.06);position:relative;z-index:1;animation:pulse 3.6s ease-in-out infinite}
.node:nth-child(3) .dot{animation-delay:.6s}.node:nth-child(4) .dot{animation-delay:1.2s}.node:nth-child(5) .dot{animation-delay:1.8s}.node:nth-child(6) .dot{animation-delay:2.4s}
@keyframes pulse{0%,100%{box-shadow:0 0 0 8px rgba(226,181,74,.06)}15%{box-shadow:0 0 0 14px rgba(226,181,74,.18)}}
.node .dot svg{width:30px;height:30px;fill:none;stroke:#f6ecdc;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.node b{display:block;margin-top:16px;font:650 19px/1.2 var(--display);color:var(--cream)}
.node p{font-size:15px;color:var(--on-deep);margin-top:6px;line-height:1.45}
.node.key .dot{background:#e2b54a;border-color:#e2b54a}.node.key .dot svg{stroke:#24101a}
.netrow{display:grid;grid-template-columns:1fr 1.1fr;gap:28px;margin-top:56px;align-items:stretch}
.recbig{background:var(--cream);color:#2a1e23;border-radius:22px;padding:26px}
.recbig .t{font:700 11px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:#8a6312}
.recbig h3{color:#22161b;font-size:26px;margin-top:6px}
.recbig .sub{color:#76666c;font-size:15px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:18px}
.stats div{background:#fff;border-radius:14px;padding:14px 8px;text-align:center}
.stats strong{display:block;font:800 34px/1 var(--display);color:#7a2945;font-variant-numeric:tabular-nums}
.stats small{display:block;margin-top:6px;color:#76666c;font-size:13px}
.recbig .note{margin-top:14px;font-size:14px;color:#5b4a50;display:flex;gap:8px;align-items:center}
.recbig .note svg{width:16px;height:16px;flex:none;stroke:#1b6a48;fill:none;stroke-width:2.4}
.grow{border:1px solid rgba(255,255,255,.14);border-radius:22px;padding:26px;display:grid;gap:18px;background:rgba(255,255,255,.03)}
.grow h3{color:var(--cream);font-size:26px}
.grow p{color:var(--on-deep)}
.fly{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.fly span{background:#e2b54a;color:#24101a;font-weight:700;border-radius:999px;padding:8px 16px;font-size:15px}
.fly em{font-style:normal;color:#e2b54a;font-weight:800}
.mini-net{width:100%;height:120px}
@media (max-width:900px){.chain{grid-template-columns:1fr;gap:22px}.chain .rail{display:none}.node{display:grid;grid-template-columns:68px 1fr;gap:16px;text-align:left;align-items:center}.node b{margin-top:0}.netrow{grid-template-columns:1fr}}

/* products */
.tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:28px}
.tab{appearance:none;border:1.5px solid var(--line);background:var(--surface);color:var(--ink);font:700 15px var(--sans);padding:11px 18px;border-radius:999px;cursor:pointer;display:inline-flex;gap:8px;align-items:center;transition:all .2s}
.tab[aria-selected="true"]{background:var(--wine);border-color:var(--wine);color:#fff}
.tab .fl{font:700 10px var(--mono);letter-spacing:.1em;background:var(--gold);color:#24101a;border-radius:999px;padding:2px 7px}
.panel{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,.9fr);gap:40px;align-items:center}
.panel .browser{transform:none}
.panel .shot{position:relative}
.panel .shot .phone{position:absolute;right:-10px;bottom:-24px;width:30%}
.panel h3{font-size:clamp(28px,3vw,38px);font-weight:800}
.panel .tag{font:700 12px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--gold-ink)}
.panel p.lead{margin-top:12px;font-size:18px;color:var(--body)}
.ticks{list-style:none;padding:0;margin:20px 0 0;display:grid;gap:12px}
.ticks li{display:flex;gap:12px;align-items:flex-start;font-size:16.5px;line-height:1.45}
.ticks li::before{content:"";flex:none;width:22px;height:22px;margin-top:1px;border-radius:50%;background:var(--ok-soft) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m7 12.5 3.2 3.2L17 9' fill='none' stroke='%231b6a48' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/14px no-repeat}
.panel[hidden]{display:none}
.panel:not([hidden]) .browser{animation:rise .55s cubic-bezier(.2,.8,.2,1) both}
@media (max-width:900px){.panel{grid-template-columns:1fr}.panel .shot .phone{right:0}}

/* how */
.how{display:grid;grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr);gap:44px;align-items:center}
.steps{display:grid;gap:12px}
.step{appearance:none;text-align:left;width:100%;display:grid;grid-template-columns:44px 1fr;gap:16px;background:var(--surface);border:1.5px solid var(--line);border-radius:18px;padding:18px 20px;cursor:pointer;font:inherit;color:inherit;transition:border-color .2s,box-shadow .2s,transform .2s}
.step .num{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:var(--wine-soft);color:var(--wine);font:700 15px var(--mono)}
.step h3{font-size:21px;font-weight:650}
.step p{color:var(--muted);font-size:15.5px;margin-top:3px}
.step[aria-pressed="true"]{border-color:var(--wine);box-shadow:0 18px 40px -26px var(--wine);transform:translateX(4px)}
.step[aria-pressed="true"] .num{background:var(--wine);color:#fff}
.howshot{position:relative;display:grid;place-items:center;min-height:420px;background:radial-gradient(70% 70% at 50% 40%,var(--wine-soft),transparent 70%);border-radius:28px}
.howshot figure{margin:0;width:100%}
.howshot figure[hidden]{display:none}
.howshot figure:not([hidden]){animation:rise .5s cubic-bezier(.2,.8,.2,1) both}
.howshot .phone{width:min(250px,60%);margin:0 auto}
.howshot figcaption{text-align:center;margin-top:14px;font-size:14px;color:var(--muted)}
@media (max-width:900px){.how{grid-template-columns:1fr}.howshot{min-height:0;padding-block:24px}}

/* gallery */
.gallery{display:grid;grid-auto-flow:column;grid-auto-columns:min(460px,82%);gap:20px;overflow-x:auto;padding-bottom:16px;scroll-snap-type:x mandatory}
.gallery figure{margin:0;scroll-snap-align:start}
.gallery figcaption{margin-top:12px}
.gallery figcaption b{display:block;color:var(--ink);font:650 18px var(--display)}
.gallery figcaption span{color:var(--muted);font-size:15px}

/* compare */
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:20px;background:var(--surface)}
table{width:100%;border-collapse:collapse;min-width:640px;font-size:16px}
th,td{padding:16px 20px;text-align:left;border-bottom:1px solid var(--line)}
th{font:700 12px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);background:var(--surface-2)}
th.us,td.us{background:var(--wine-soft)}
th.us{color:var(--wine)}
tr:last-child td{border-bottom:0}
td:first-child{font-weight:600;color:var(--ink)}
.yes,.no{display:inline-flex;align-items:center;gap:8px;font-weight:600}
.yes{color:var(--ok)}.no{color:var(--bad)}
.yes::before,.no::before{font-weight:800}
.yes::before{content:"✓"}.no::before{content:"✕"}

/* pricing */
.prices{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.price{background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:26px;display:flex;flex-direction:column;gap:10px}
.price .t{font:700 12px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.price strong{font:800 40px/1 var(--display);color:var(--ink);letter-spacing:-.03em}
.price strong small{font:600 15px var(--sans);color:var(--muted);letter-spacing:0}
.price p{color:var(--muted);font-size:15.5px}
.price.hl{background:var(--deep);border-color:var(--deep);color:var(--on-deep)}
.price.hl .t{color:#e2b54a}.price.hl strong{color:var(--cream)}.price.hl p,.price.hl strong small{color:var(--on-deep)}
.price ul{list-style:none;padding:0;margin:6px 0 0;display:grid;gap:8px;font-size:15px}
.price li{display:flex;gap:8px}.price li::before{content:"✓";color:var(--ok);font-weight:800}
.price.hl li::before{color:#e2b54a}
.small-note{margin-top:16px;color:var(--muted);font-size:14px}
@media (max-width:900px){.prices{grid-template-columns:1fr}}

/* team */
.team{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}
.person{display:flex;gap:20px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:22px}
.person img{width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid var(--gold-soft)}
.person h3{font-size:24px}
.person .role{font:700 12px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--wine)}
.person p{color:var(--muted);font-size:15.5px;margin-top:6px}
.why-us{margin-top:20px;background:var(--gold-soft);border-radius:22px;padding:24px 26px;display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.why-us b{display:block;font:800 30px var(--display);color:var(--ink);letter-spacing:-.02em}
.why-us span{color:var(--body);font-size:15.5px}
@media (max-width:800px){.team,.why-us{grid-template-columns:1fr}}

/* cta + footer */
.cta{background:radial-gradient(70% 120% at 50% 0%,rgba(226,181,74,.2),transparent 60%),var(--deep);border-radius:32px;padding:64px 32px;text-align:center;color:var(--on-deep);position:relative;overflow:hidden}
.cta h2{color:var(--cream);font-size:clamp(32px,4.6vw,56px);font-weight:800;line-height:1.04}
.cta h2 em{font-style:normal;color:#e2b54a}
.cta p{margin:16px auto 0;max-width:560px;font-size:18px}
.cta .ctas{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:28px}
.cta .btn-ghost{background:transparent;color:var(--cream);border-color:rgba(255,255,255,.3)}
footer{padding-block:40px 56px;color:var(--muted);font-size:14px}
footer .wrap{display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:center}
footer .logo b{font-size:18px}
footer .logo svg{width:26px;height:26px}

/* reveal: elements are visible at rest; motion only adds a small lift */
@media (prefers-reduced-motion:no-preference){.rv{transition:transform .8s cubic-bezier(.2,.8,.2,1)}.rv.pre{transform:translateY(26px)}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}html{scroll-behavior:auto}}
</style>

<header class="nav">
 <div class="wrap">
  <a class="logo" href="#top" aria-label="XELOR home">
   <svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a3456a"/><stop offset=".55" stop-color="#7a2945"/><stop offset="1" stop-color="#4a1530"/></linearGradient><mask id="lm1" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="#fff"/><path d="M14 36 24 46 50 16" fill="none" stroke="#000" stroke-width="12.5" stroke-linecap="round" stroke-linejoin="round"/></mask></defs><rect width="64" height="64" rx="16" fill="url(#lg1)"/><path d="M19 17 45 47" stroke="#f6ecdc" stroke-width="7" stroke-linecap="round" fill="none" mask="url(#lm1)"/><path d="M14 36 24 46 50 16" fill="none" stroke="#e2b54a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>
   <b>XELOR</b>
  </a>
  <nav class="nav-links" aria-label="Sections">
   <a href="#problem">Problem</a><a href="#network">The network</a><a href="#products">Products</a><a href="#how">How it works</a><a href="#pricing">Pricing</a><a href="#team">Team</a>
  </nav>
  <a class="btn btn-pri" href="#products">See the product</a>
 </div>
</header>

<main id="top">
 <section class="hero">
  <canvas id="net" aria-hidden="true"></canvas>
  <div class="wrap">
   <div>
    <span class="eyebrow">Trusted supplier network · India</span>
    <h1 style="margin-top:18px">The trusted network behind <em>what India manufactures.</em></h1>
    <p class="lede">XELOR helps <b>MSMEs and small industries</b> find suppliers and buyers they can trust, based on how well each business actually delivers.</p>
    <div class="ctas">
     <a class="btn btn-pri" href="#network">How it works <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
     <a class="btn btn-ghost" href="#products">Explore the products</a>
    </div>
    <div class="for"><b>Built for</b><span>Small factories</span><span>Job shops</span><span>Suppliers</span><span>Workshops</span></div>
   </div>
   <div class="stage" aria-label="XELOR product screens">
    <div class="browser"><div class="bar"><i></i><i></i><i></i><span>market.xelor.in</span></div><img src="{{mkt-home}}" alt="XELOR Market home screen showing sellers with their delivery records" width="1400" height="984"></div>
    <div class="phone"><img src="{{ph-gram-live}}" alt="Xelogram post on a supplier's phone" width="420" height="887"></div>
    <div class="rec">
     <span class="t">Track record</span>
     <b class="n">Sri Ganesh Castings</b>
     <div class="k"><div><strong data-count="96" data-suffix="%">96%</strong><small>on time</small></div><div><strong data-count="0.3" data-dec="1" data-suffix="%">0.3%</strong><small>rejected</small></div><div><strong data-count="19">19</strong><small>deliveries</small></div></div>
     <div class="ok"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 12.5 4 4L18 8"/></svg>Counted at the factory gate</div>
    </div>
   </div>
  </div>
 </section>

 <div class="ticker" aria-hidden="true"><div class="track">
  <span>Foundries</span><span>Machine shops</span><span>Coating units</span><span>Assemblers</span><span>Job shops</span><span>Fabricators</span><span>Pump makers</span><span>Workshops</span><span>Small factories</span>
  <span>Foundries</span><span>Machine shops</span><span>Coating units</span><span>Assemblers</span><span>Job shops</span><span>Fabricators</span><span>Pump makers</span><span>Workshops</span><span>Small factories</span>
 </div></div>

 <section class="sec" id="problem">
  <div class="wrap">
   <div class="sec-head rv"><span class="eyebrow">The problem</span><h2>Finding a good supplier is still guesswork.</h2><p>Behind almost every product made in India is a chain of small factories. They still find each other the old way.</p></div>
   <div class="prob-grid">
    <div class="cards3">
     <div class="pcard rv"><i><svg viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.5L3 21l2-5.5A8.4 8.4 0 1 1 21 11.5z"/></svg></i><div><h3>WhatsApp, calls and word of mouth</h3><p>Owners ask around, chase replies and make long site visits just to trust one new supplier.</p></div></div>
     <div class="pcard rv"><i><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></i><div><h3>Listing sites cost too much</h3><p>A paid listing is ₹32,000 or more a year. Most small businesses can’t afford it.</p></div></div>
     <div class="pcard rv"><i><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6M12 17h.01"/></svg></i><div><h3>No way to know who’s reliable</h3><p>So owners take risks, or pay more just to be safe. Good suppliers stay invisible.</p></div></div>
     <div class="pcard rv"><i><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16"/></svg></i><div><h3>Paperwork everywhere</h3><p>Orders in WhatsApp, stock in Excel, accounts in Tally, quality on paper. The same details get typed again and again.</p></div></div>
    </div>
    <div class="chat rv" aria-label="Example of a supplier search on WhatsApp">
     <div class="hdr"><i></i><div><b>Casting suppliers</b><small>Ramesh, Suresh, Anil +4</small></div></div>
     <div class="msg me">Need 60 pump body castings, GG25. Rate?<small>10:02</small></div>
     <div class="msg">Who is this?<small>11:40</small></div>
     <div class="msg me">Got your number from Suresh.<small>11:41</small></div>
     <div class="msg">Send drawing.<small>14:15</small></div>
     <div class="msg">Will check and tell.<small>Tue</small></div>
     <div class="msg sys">Day 6</div>
     <div class="msg me">Any update on the rate?? Please confirm by Friday 🙏<small>Mon</small></div>
     <div class="stamp">No reply</div>
    </div>
   </div>
  </div>
 </section>

 <section class="sec band" id="network">
  <div class="wrap">
   <div class="sec-head rv"><span class="eyebrow">Our core · the supplier network</span><h2>Every delivery builds a <em>track record.</em></h2><p>XELOR notes how each delivery actually went. Over time, every supplier earns a record that other factories can trust.</p></div>
   <div class="chain">
    <div class="rail" aria-hidden="true"></div>
    <div class="node rv"><div class="dot"><svg viewBox="0 0 24 24"><path d="M3 21V11l6-4v4l6-4v4h6v10z"/><path d="M7 16h2M12 16h2M17 16h1"/></svg></div><div><b>A factory orders</b><p>From a supplier, through XELOR.</p></div></div>
    <div class="node rv"><div class="dot"><svg viewBox="0 0 24 24"><path d="M2 7h11v9H2zM13 10h4l3 3v3h-7z"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/></svg></div><div><b>The supplier delivers</b><p>The goods reach the factory gate.</p></div></div>
    <div class="node rv"><div class="dot"><svg viewBox="0 0 24 24"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/></svg></div><div><b>The delivery is checked</b><p>On time? Right amount? Good quality?</p></div></div>
    <div class="node key rv"><div class="dot"><svg viewBox="0 0 24 24"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="m9 12 2 2 4-4"/></svg></div><div><b>A record is earned</b><p>Counted, never typed, so it can’t be faked.</p></div></div>
    <div class="node rv"><div class="dot"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11l2 2 4-4"/></svg></div><div><b>Good work gets noticed</b><p>Reliable suppliers win more orders.</p></div></div>
   </div>
   <div class="netrow">
    <div class="recbig rv">
     <span class="t">Example track record</span>
     <h3>Sri Ganesh Castings</h3>
     <span class="sub">Foundry · Hosur · supplying since 2024</span>
     <div class="stats"><div><strong data-count="96" data-suffix="%">96%</strong><small>on time</small></div><div><strong data-count="0.3" data-dec="1" data-suffix="%">0.3%</strong><small>parts rejected</small></div><div><strong data-count="19">19</strong><small>deliveries</small></div></div>
     <div class="note"><svg viewBox="0 0 24 24"><path d="m6 12.5 4 4L18 8"/></svg>Built from real receipts and quality checks. Demonstration data.</div>
    </div>
    <div class="grow rv">
     <h3>The network grows with every order.</h3>
     <p>When a factory asks a new supplier for a price, that supplier joins XELOR for free and brings its own customers. Every order adds more records, and more records mean more trust.</p>
     <canvas class="mini-net" id="mininet" aria-hidden="true"></canvas>
     <div class="fly"><span>More orders</span><em>→</em><span>More records</span><em>→</em><span>More trust</span></div>
    </div>
   </div>
  </div>
 </section>

 <section class="sec" id="products">
  <div class="wrap">
   <div class="sec-head rv"><span class="eyebrow">What we offer</span><h2>One trusted record. Four ways to use it.</h2><p>Real screens from the working product, with demonstration data.</p></div>
   <div class="tabs" role="tablist" aria-label="XELOR products">
    <button class="tab" role="tab" id="t-mkt" aria-controls="p-mkt" aria-selected="true">XELOR Market <span class="fl">FLAGSHIP</span></button>
    <button class="tab" role="tab" id="t-help" aria-controls="p-help" aria-selected="false" tabindex="-1">Find help</button>
    <button class="tab" role="tab" id="t-gram" aria-controls="p-gram" aria-selected="false" tabindex="-1">Xelogram</button>
    <button class="tab" role="tab" id="t-erp" aria-controls="p-erp" aria-selected="false" tabindex="-1">Smart factory software</button>
   </div>
   <div class="panel" role="tabpanel" id="p-mkt" aria-labelledby="t-mkt">
    <div class="shot"><div class="browser"><div class="bar"><i></i><i></i><i></i><span>market.xelor.in</span></div><img src="{{mkt-home}}" alt="XELOR Market" width="1400" height="984"></div></div>
    <div><span class="tag">Find &amp; connect</span><h3>XELOR Market</h3><p class="lead">A marketplace built for MSMEs. Find suppliers and buyers, and see each seller’s track record before you call.</p>
     <ul class="ticks"><li>Every seller shows real numbers: on time, rejects, deliveries</li><li>A buyer’s request goes to five matched sellers at most, never resold</li><li>Free to start. Listing from ₹249 a month</li><li>XELOR never handles payments. Businesses deal directly</li></ul></div>
   </div>
   <div class="panel" role="tabpanel" id="p-help" aria-labelledby="t-help" hidden>
    <div class="shot"><div class="browser"><div class="bar"><i></i><i></i><i></i><span>market.xelor.in/help</span></div><img src="{{mkt-help}}" alt="Find help screen" width="1400" height="984"></div></div>
    <div><span class="tag">Local services</span><h3>Find help</h3><p class="lead">Everything a factory needs, in one place, with people you can trust.</p>
     <ul class="ticks"><li>Machine down? Reach the nearest checked technicians in one tap</li><li>Repairs, testing, compliance, finance and job work</li><li>Reviews only come from confirmed jobs</li><li>Help finding government support schemes</li></ul></div>
   </div>
   <div class="panel" role="tabpanel" id="p-gram" aria-labelledby="t-gram" hidden>
    <div class="shot"><div class="browser"><div class="bar"><i></i><i></i><i></i><span>market.xelor.in/xelogram</span></div><img src="{{gram-feed}}" alt="Xelogram feed" width="1400" height="984"></div><div class="phone"><img src="{{ph-gram-draft}}" alt="Xelogram post draft on a phone" width="420" height="887"></div></div>
    <div><span class="tag">Get noticed</span><h3>Xelogram</h3><p class="lead">Like a social feed for factories. Show your finished work and let buyers come to you.</p>
     <ul class="ticks"><li>A verified delivery becomes a post with a “Request quote” button</li><li>The caption is written for you in Tamil, Kannada, Hindi or English</li><li>Share to WhatsApp Status in one tap</li><li>You choose what stays private</li></ul></div>
   </div>
   <div class="panel" role="tabpanel" id="p-erp" aria-labelledby="t-erp" hidden>
    <div class="shot"><div class="browser"><div class="bar"><i></i><i></i><i></i><span>app.xelor.in/today</span></div><img src="{{erp-home}}" alt="Smart factory software home" width="1400" height="984"></div><div class="phone"><img src="{{ph-owner}}" alt="Owner approving an order on the phone" width="420" height="887"></div></div>
    <div><span class="tag">Run your factory</span><h3>Smart factory software</h3><p class="lead">AI-powered software that runs daily work: orders, buying, stock, production and bills. It does most of the typing for you.</p>
     <ul class="ticks"><li>Reads orders from messages and fills in the details</li><li>Asks suppliers for prices and follows up for you</li><li>People stay in charge. Owners approve from the phone</li><li>Works alongside Tally. No need to switch</li></ul></div>
   </div>
  </div>
 </section>

 <section class="sec" id="how" style="padding-top:24px">
  <div class="wrap">
   <div class="sec-head rv"><span class="eyebrow">How buying works</span><h2>Ask. Compare. Choose. Record.</h2><p>Tap a step to see it in the product.</p></div>
   <div class="how">
    <div class="steps" role="group" aria-label="Buying steps">
     <button class="step" aria-pressed="true" data-shot="s1"><span class="num">1</span><span><h3>Ask</h3><p>Say what you need. XELOR sends the request to suppliers, who reply from a simple link. No login, no app.</p></span></button>
     <button class="step" aria-pressed="false" data-shot="s2"><span class="num">2</span><span><h3>Compare</h3><p>See every price side by side, with each supplier’s delivery history.</p></span></button>
     <button class="step" aria-pressed="false" data-shot="s3"><span class="num">3</span><span><h3>Choose</h3><p>You pick the supplier. The owner approves from the phone.</p></span></button>
     <button class="step" aria-pressed="false" data-shot="s4"><span class="num">4</span><span><h3>Record</h3><p>When the goods arrive, XELOR notes how it went. The supplier’s record updates by itself.</p></span></button>
    </div>
    <div class="howshot">
     <figure id="s1"><div class="phone"><img src="{{ph-supplier}}" alt="Supplier replying to a request from a link" width="420" height="887"></div><figcaption>The supplier replies from a link on the phone</figcaption></figure>
     <figure id="s2" hidden><div class="browser"><div class="bar"><i></i><i></i><i></i><span>app.xelor.in/quotes</span></div><img src="{{erp-rank}}" alt="Quotes ranked side by side" width="1400" height="984"></div><figcaption>Quotes ranked on price, delivery and record</figcaption></figure>
     <figure id="s3" hidden><div class="phone"><img src="{{ph-owner}}" alt="Owner approving on the phone" width="420" height="887"></div><figcaption>The owner approves with one tap</figcaption></figure>
     <figure id="s4" hidden><div class="browser"><div class="bar"><i></i><i></i><i></i><span>app.xelor.in/stores/receipts</span></div><img src="{{erp-gate}}" alt="Delivery scanned at the gate and record updated" width="1400" height="1341"></div><figcaption>Scanned at the gate. The record updates itself</figcaption></figure>
    </div>
   </div>
  </div>
 </section>

 <section class="sec" style="padding-top:24px">
  <div class="wrap">
   <div class="sec-head rv"><span class="eyebrow">More from the product</span><h2>Built for the factory floor.</h2></div>
   <div class="gallery" tabindex="0" aria-label="Product screens, scroll sideways">
    <figure><div class="browser"><div class="bar"><i></i><i></i><i></i><span>app.xelor.in/passport</span></div><img src="{{passport}}" alt="Factory passport" width="1400" height="984"></div><figcaption><b>Factory passport</b><span>A shareable page that shows what your factory has delivered.</span></figcaption></figure>
    <figure><div class="browser"><div class="bar"><i></i><i></i><i></i><span>app.xelor.in/agent</span></div><img src="{{erp-agent}}" alt="XELOR assistant" width="1400" height="984"></div><figcaption><b>The assistant</b><span>Prepares the next steps. People make the decisions.</span></figcaption></figure>
    <figure><div class="browser"><div class="bar"><i></i><i></i><i></i><span>app.xelor.in/quotes</span></div><img src="{{erp-rank}}" alt="Ranked quotes" width="1400" height="984"></div><figcaption><b>Ranked quotes</b><span>Price is only part of the choice.</span></figcaption></figure>
    <figure><div class="browser"><div class="bar"><i></i><i></i><i></i><span>market.xelor.in/xelogram</span></div><img src="{{gram-feed}}" alt="Xelogram feed" width="1400" height="984"></div><figcaption><b>Xelogram feed</b><span>Real, verified work that buyers can act on.</span></figcaption></figure>
   </div>
  </div>
 </section>

 <section class="sec" style="padding-top:24px">
  <div class="wrap">
   <div class="sec-head rv"><span class="eyebrow">Why XELOR</span><h2>Built for small businesses, not against them.</h2></div>
   <div class="tablewrap rv">
    <table>
     <thead><tr><th></th><th>WhatsApp &amp; calls</th><th>Paid listing sites</th><th class="us">XELOR</th></tr></thead>
     <tbody>
      <tr><td>Cost to get listed</td><td>Free</td><td>₹32,000+ a year</td><td class="us"><b>Free · from ₹249/month</b></td></tr>
      <tr><td>Shows who delivers on time</td><td><span class="no">No</span></td><td><span class="no">No, identity only</span></td><td class="us"><span class="yes">Yes, from real deliveries</span></td></tr>
      <tr><td>Your enquiry sold to many sellers</td><td>—</td><td><span class="no">Often</span></td><td class="us"><span class="yes">Never, 5 sellers at most</span></td></tr>
      <tr><td>Handles your money</td><td>—</td><td>Some do</td><td class="us"><span class="yes">Never</span></td></tr>
      <tr><td>Reaches small suppliers</td><td>Only people you know</td><td>Only those who pay</td><td class="us"><span class="yes">Every supplier joins free</span></td></tr>
     </tbody>
    </table>
   </div>
  </div>
 </section>

 <section class="sec" id="pricing" style="padding-top:24px">
  <div class="wrap">
   <div class="sec-head rv"><span class="eyebrow">Pricing</span><h2>Start free. Grow when you’re ready.</h2></div>
   <div class="prices">
    <div class="price rv"><span class="t">Suppliers</span><strong>₹0</strong><p>For every supplier invited by a buyer.</p><ul><li>Reply to requests from a link</li><li>Your own track record</li><li>No login or app needed</li></ul></div>
    <div class="price hl rv"><span class="t">XELOR Market</span><strong>Free <small>then ₹249 / month</small></strong><p>For MSMEs that want to be found.</p><ul><li>Verified listing with your record</li><li>Matched buyer requests</li><li>Xelogram posts and Find help</li></ul></div>
    <div class="price rv"><span class="t">Smart factory software</span><strong>₹50K <small>/ month per plant</small></strong><p>For factories that want to run everything in one place.</p><ul><li>Every user included</li><li>Orders, buying, stock and bills</li><li>Works alongside Tally</li></ul></div>
   </div>
   <p class="small-note">Launch pricing, still being tested with pilot customers.</p>
  </div>
 </section>

 <section class="sec" id="team" style="padding-top:24px">
  <div class="wrap">
   <div class="sec-head rv"><span class="eyebrow">The team</span><h2>Starting in Peenya, Bengaluru.</h2><p>One of India’s largest industrial areas, and where we grew up.</p></div>
   <div class="team">
    <div class="person rv"><img src="{{hari}}" alt="Hari Rajiv" width="96" height="96"><div><span class="role">Co-founder &amp; CEO</span><h3>Hari Rajiv</h3><p>Interning at Siemens, where he first saw the technology side of manufacturing.</p></div></div>
    <div class="person rv"><img src="{{medhansh}}" alt="Medhansh" width="96" height="96"><div><span class="role">Co-founder &amp; CTO</span><h3>Medhansh</h3><p>Interning at Cisco. Builds the XELOR product and platform.</p></div></div>
   </div>
   <div class="why-us rv">
    <div><b>21 years</b><span>living in Peenya, among the factories we serve</span></div>
    <div><b>10–15</b><span>factory visits with owners and buying teams</span></div>
    <div><b>2 pilots</b><span>with local factories, on real orders</span></div>
   </div>
  </div>
 </section>

 <section class="sec" style="padding-top:24px">
  <div class="wrap">
   <div class="cta rv">
    <h2>Every delivery <em>builds trust.</em></h2>
    <p>XELOR is the trusted network behind what India manufactures, built for the MSMEs and small industries that make it.</p>
    <div class="ctas"><a class="btn btn-pri" href="#products">Explore the products</a><a class="btn btn-ghost" href="#network">See how the network works</a></div>
   </div>
  </div>
 </section>
</main>

<footer>
 <div class="wrap">
  <span class="logo"><svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a3456a"/><stop offset=".55" stop-color="#7a2945"/><stop offset="1" stop-color="#4a1530"/></linearGradient><mask id="lm2" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="#fff"/><path d="M14 36 24 46 50 16" fill="none" stroke="#000" stroke-width="12.5" stroke-linecap="round" stroke-linejoin="round"/></mask></defs><rect width="64" height="64" rx="16" fill="url(#lg2)"/><path d="M19 17 45 47" stroke="#f6ecdc" stroke-width="7" stroke-linecap="round" fill="none" mask="url(#lm2)"/><path d="M14 36 24 46 50 16" fill="none" stroke="#e2b54a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg><b>XELOR</b></span>
  <span>Peenya, Bengaluru · Screens from the working product use demonstration data.</span>
 </div>
</footer>

<script>
(()=>{
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
/* tabs */
const tabs=[...document.querySelectorAll('.tab')];
function select(t){tabs.forEach(x=>{const on=x===t;x.setAttribute('aria-selected',on);x.tabIndex=on?0:-1;document.getElementById(x.getAttribute('aria-controls')).hidden=!on;});}
tabs.forEach((t,i)=>{t.addEventListener('click',()=>select(t));t.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const n=tabs[(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];select(n);n.focus();}});});
/* steps */
const steps=[...document.querySelectorAll('.step')];
function show(s){steps.forEach(x=>{const on=x===s;x.setAttribute('aria-pressed',on);document.getElementById(x.dataset.shot).hidden=!on;});}
steps.forEach(s=>s.addEventListener('click',()=>{show(s);auto=false;}));
let auto=!reduce,si=0;
setInterval(()=>{if(!auto||document.hidden)return;const how=document.getElementById('how').getBoundingClientRect();if(how.bottom<0||how.top>innerHeight)return;si=(si+1)%steps.length;show(steps[si]);},4200);
/* reveal: visible at rest, lifts in when it enters view */
if(!reduce&&'IntersectionObserver' in window){
 const els=[...document.querySelectorAll('.rv')].filter(el=>el.getBoundingClientRect().top>innerHeight);
 els.forEach(el=>el.classList.add('pre'));
 const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.remove('pre');io.unobserve(e.target);}}),{rootMargin:'0px 0px -8% 0px'});
 els.forEach(el=>io.observe(el));
 /* count up once when numbers come into view */
 const nums=[...document.querySelectorAll('[data-count]')];
 const cio=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;cio.unobserve(e.target);const el=e.target,to=+el.dataset.count,dec=+(el.dataset.dec||0),suf=el.dataset.suffix||'';const t0=performance.now();
  const step=now=>{const p=Math.min(1,(now-t0)/1100),v=to*(1-Math.pow(1-p,3));el.textContent=v.toFixed(dec)+suf;if(p<1)requestAnimationFrame(step);};requestAnimationFrame(step);}),{threshold:.6});
 nums.forEach(n=>cio.observe(n));
}
/* network canvases */
function net(canvas,opts){
 const ctx=canvas.getContext('2d');let w,h,pts=[],dpr=Math.min(2,devicePixelRatio||1);
 const rnd=(s=>()=>(s=(s*1664525+1013904223)>>>0)/4294967296)(opts.seed||7);
 function size(){const r=canvas.getBoundingClientRect();w=r.width;h=r.height;canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
  pts=Array.from({length:opts.n},()=>({x:rnd()*w,y:rnd()*h,vx:(rnd()-.5)*opts.speed,vy:(rnd()-.5)*opts.speed,g:rnd()<.18}));}
 function frame(){ctx.clearRect(0,0,w,h);const css=getComputedStyle(document.documentElement);const line=opts.line||css.getPropertyValue('--wine').trim();const gold=css.getPropertyValue('--gold').trim();
  for(const p of pts){p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>w)p.vx*=-1;if(p.y<0||p.y>h)p.vy*=-1;}
  for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){const a=pts[i],b=pts[j],d=Math.hypot(a.x-b.x,a.y-b.y);if(d<opts.link){ctx.globalAlpha=(1-d/opts.link)*opts.alpha;ctx.strokeStyle=line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}
  ctx.globalAlpha=1;for(const p of pts){ctx.fillStyle=p.g?gold:(opts.dot||line);ctx.beginPath();ctx.arc(p.x,p.y,p.g?3.2:2,0,6.283);ctx.fill();}
  if(!reduce)requestAnimationFrame(frame);}
 size();addEventListener('resize',size);frame();
}
net(document.getElementById('net'),{n:46,speed:.25,link:150,alpha:.28,seed:11});
net(document.getElementById('mininet'),{n:28,speed:.3,link:90,alpha:.5,seed:5,line:'#e2b54a',dot:'#f6ecdc'});
})();
</script>
````

## Appendix A2. Website build script (`website/build.py`)

````python
"""Build the XELOR website from src.html: inline the WebP images as data URIs.
Writes xelor-site.html (artifact form, no <html>/<head>) and index.html (standalone page for Vercel or any host)."""
import base64, re, pathlib
here = pathlib.Path(__file__).parent
s = (here / 'src.html').read_text()
for k in set(re.findall(r'\{\{([a-z0-9-]+)\}\}', s)):
    s = s.replace('{{%s}}' % k, 'data:image/webp;base64,' + base64.b64encode((here / 'img' / f'{k}.webp').read_bytes()).decode())
(here / 'xelor-site.html').write_text(s)
i = s.index('</style>') + 8
(here / 'index.html').write_text('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + s[:i] + '\n</head>\n<body>\n' + s[i:] + '\n</body>\n</html>\n')
print('built', len(s), 'bytes')
````

## Appendix B. Final one-pager source (`deck-and-one-pager/onepager3.html`)

Render: `node r3.mjs` (Playwright, viewport 794×1123, device scale 2, `page.pdf({format:"A4", printBackground:true, preferCSSPageSize:true})`).

````html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>XELOR One-Pager</title>
<link rel="stylesheet" href="fonts.css">
<style>
@page{size:A4;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#f8f5f2;--card:#fff;--line:#e6dcd6;--ink:#1f1418;--body:#3b2f34;--muted:#6b5c62;--acc:#7a2945;--acc-soft:#f6e8ed;--gold:#c89a2e;--gold-hi:#e2b54a;--gold-ink:#86600f;--gold-soft:#f8efd9;--deep:#2a0f1a;--cream:#f6ecdc;--sub:#d9c3cc;--green:#1b6a48;--green-soft:#e4f1ea;--red:#b3402f;--red-soft:#fbe9e5;
 --d:"Bricolage Grotesque",sans-serif;--s:"Source Sans 3",sans-serif;--m:"JetBrains Mono",monospace}
body{font-family:var(--s);color:var(--body);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:210mm;height:297mm;background:var(--bg);display:flex;flex-direction:column;overflow:hidden;position:relative}
.hd{background:radial-gradient(70% 140% at 100% 0%,rgba(226,181,74,.22),transparent 60%),radial-gradient(60% 120% at 0% 100%,rgba(143,51,84,.55),transparent 60%),var(--deep);padding:18px 36px 17px;color:var(--sub)}
.brand{display:flex;align-items:center;gap:10px}
.brand img{width:38px;height:38px}
.brand b{font:800 25px var(--d);letter-spacing:-.03em;color:var(--cream)}
.brand small{margin-left:auto;font:700 10px var(--m);letter-spacing:.14em;text-transform:uppercase;color:var(--gold-hi)}
h1{font:800 28px/1.06 var(--d);letter-spacing:-.035em;color:var(--cream);margin-top:10px}
h1 span{color:var(--gold-hi)}
.hd p{font-size:15px;line-height:1.4;margin-top:7px;max-width:640px}
.hd p b{color:var(--cream);font-weight:600}
.main{padding:13px 36px 10px;display:flex;flex-direction:column;gap:11px;flex:1}
.lbl{font:700 11px var(--m);letter-spacing:.14em;text-transform:uppercase;color:var(--acc);margin-bottom:6px;display:flex;align-items:center;gap:8px}
.lbl:before{content:"";width:16px;height:2px;background:var(--gold)}
/* problem */
.prob{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.pt{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:9px 12px;display:flex;gap:10px;align-items:flex-start}
.pt i{flex:none;width:34px;height:34px;border-radius:10px;background:var(--red-soft);display:grid;place-items:center}
.pt i svg{width:19px;height:19px;fill:none;stroke:var(--red);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.pt b{display:block;font:700 15.5px/1.15 var(--d);color:var(--ink);letter-spacing:-.01em}
.pt span{display:block;font-size:12.6px;line-height:1.36;color:var(--muted);margin-top:3px}
/* impact */
.net{background:radial-gradient(80% 120% at 100% 0%,rgba(226,181,74,.18),transparent 60%),var(--deep);border-radius:18px;padding:13px 18px 12px;color:var(--sub);position:relative;border:2px solid var(--gold)}
.net .tag{position:absolute;right:16px;top:14px;font:700 10px var(--m);letter-spacing:.14em;text-transform:uppercase;color:var(--deep);background:var(--gold-hi);border-radius:999px;padding:4px 10px}
.net .k{font:700 11px var(--m);letter-spacing:.14em;text-transform:uppercase;color:var(--gold-hi)}
.net h2{font:800 23px/1.1 var(--d);letter-spacing:-.025em;color:var(--cream);margin-top:5px}
.net h2 span{color:var(--gold-hi)}
.chain{display:grid;grid-template-columns:1fr 1fr 1.15fr 1.25fr 1.1fr;gap:12px;margin-top:10px;align-items:stretch}
.st{background:#ffffff0d;border:1px solid #ffffff22;border-radius:12px;padding:10px 10px;position:relative}
.st:not(:last-child):after{content:"";position:absolute;right:-10px;top:50%;width:7px;height:7px;border-top:2px solid var(--gold-hi);border-right:2px solid var(--gold-hi);transform:translateY(-50%) rotate(45deg)}
.st .n{font:700 10px var(--m);color:var(--gold-hi);letter-spacing:.08em}
.st b{display:block;font:700 14.5px/1.15 var(--d);color:var(--cream);margin-top:3px}
.st span{display:block;font-size:11.8px;line-height:1.32;color:var(--sub);margin-top:3px}
.st.rec{background:var(--cream);border-color:var(--cream)}
.st.rec .n{color:var(--gold-ink)}.st.rec b{color:var(--ink)}
.rs{display:flex;gap:5px;margin-top:6px}
.rs div{flex:1;background:#fff;border-radius:7px;padding:4px 2px;text-align:center}
.rs div b{font:800 14px var(--d);color:var(--acc);margin:0}
.rs div small{display:block;font-size:9.5px;color:var(--muted);line-height:1.1}
.grow{display:flex;gap:12px;align-items:center;margin-top:10px;padding-top:9px;border-top:1px dashed #ffffff30}
.grow svg{flex:none;width:58px;height:40px}
.grow p{font-size:13.6px;line-height:1.4;color:var(--sub)}
.grow p b{color:var(--cream);font-weight:600}
.fly{margin-left:auto;flex:none;display:flex;gap:6px;align-items:center;font:700 12px var(--s);color:var(--deep)}
.fly span{background:var(--gold-hi);border-radius:999px;padding:5px 10px;white-space:nowrap}
.fly em{font-style:normal;color:var(--gold-hi);font-weight:800}
/* steps */
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}
.sp{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:8px 11px}
.sp .n{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--acc);color:#fff;font:700 11px var(--m)}
.sp b{display:inline;font:700 15.5px var(--d);color:var(--ink);margin-left:6px;vertical-align:1px}
.sp p{font-size:12.4px;line-height:1.36;color:var(--muted);margin-top:5px}
/* products */
.prods{display:grid;grid-template-columns:1.32fr 1fr 1fr;gap:10px}
.pc{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
.pc .im{height:78px;overflow:hidden;background:linear-gradient(160deg,#f6e8ed,#f8efd9);border-bottom:1px solid var(--line);position:relative}
.pc .im img{width:100%;display:block}
.pc .im img.ph{width:64px;margin:7px auto 0;border-radius:9px;box-shadow:0 6px 14px -6px rgba(42,15,26,.5)}
.pc .tx{padding:7px 12px 9px}
.pc .t{font:700 10px var(--m);letter-spacing:.1em;text-transform:uppercase;color:var(--gold-ink)}
.pc h3{font:800 17px var(--d);letter-spacing:-.02em;color:var(--ink);margin-top:1px}
.pc p{font-size:12.4px;line-height:1.36;color:var(--muted);margin-top:3px}
.pc.f{border:2px solid var(--acc)}
.pc.f .flag{position:absolute;left:10px;top:9px;font:700 9.5px var(--m);letter-spacing:.12em;color:#fff;background:var(--acc);border-radius:999px;padding:3px 8px}
/* why */
.why{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.wy{display:flex;gap:9px;align-items:flex-start;background:var(--gold-soft);border-radius:12px;padding:8px 11px}
.wy i{flex:none;width:20px;height:20px;border-radius:50%;background:var(--green);display:grid;place-items:center;margin-top:1px}
.wy i svg{width:12px;height:12px;fill:none;stroke:#fff;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.wy b{display:block;font:700 14px/1.2 var(--d);color:var(--ink)}
.wy span{display:block;font-size:12px;line-height:1.32;color:var(--muted);margin-top:2px}
.ft{margin-top:auto;padding:9px 36px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line);font:600 9.5px var(--m);letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.ft b{color:var(--acc)}
.ft span{display:inline-flex;align-items:center;gap:7px}

.who{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:10px}.who b{font:700 11px var(--m);letter-spacing:.1em;text-transform:uppercase;color:var(--deep);background:var(--gold-hi);border-radius:999px;padding:5px 11px;margin-right:4px}.who span{font:600 12.5px var(--s);color:var(--cream);border:1px solid #ffffff33;border-radius:999px;padding:4px 11px;background:#ffffff0d}

.hd{padding:16px 36px 15px!important}
h1{font-size:26.5px!important;margin-top:8px!important}
.hd p{font-size:14.5px!important;margin-top:6px!important}
.who{margin-top:8px!important}
.main{gap:9px!important;padding-top:11px!important}
.lbl{margin-bottom:5px!important}
.pc .im{height:64px!important}
.pc .im img.ph{width:54px!important;margin-top:6px!important}
.chain{margin-top:8px!important}
.st{padding:8px 9px!important}
.grow{margin-top:8px!important;padding-top:8px!important}
.net{padding:12px 16px 11px!important}
</style></head><body>
<div class="page">
 <header class="hd">
  <div class="brand"><img src="xelor-mark.svg" alt=""><b>XELOR</b><small>Company overview · Oct 2026</small></div>
  <h1>The trusted network behind<br><span>what India manufactures.</span></h1>
  <p>XELOR helps <b>MSMEs and small industries find suppliers and buyers they can trust</b>, based on how well each business actually delivers.</p>
  <div class="who"><b>Built for MSMEs &amp; small industries</b><span>Small factories</span><span>Job shops</span><span>Suppliers</span><span>Workshops</span></div>
 </header>

 <main class="main">
  <section>
   <div class="lbl">The problem</div>
   <div class="prob">
    <div class="pt"><i><svg viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.5L3 21l2-5.5A8.4 8.4 0 1 1 21 11.5z"/></svg></i><div><b>Finding suppliers is guesswork</b><span>Owners rely on WhatsApp, phone calls, word of mouth and long visits.</span></div></div>
    <div class="pt"><i><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></i><div><b>Listing sites cost too much</b><span>A paid listing is ₹32,000+ a year. Most small businesses can’t afford it.</span></div></div>
    <div class="pt"><i><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6M12 17h.01"/></svg></i><div><b>No way to know who’s reliable</b><span>So owners take risks, or pay more just to be safe.</span></div></div>
   </div>
  </section>

  <section class="net">
   <span class="tag">Our core</span>
   <div class="k">How the XELOR network works</div>
   <h2>Every delivery builds a <span>track record.</span></h2>
   <div class="chain">
    <div class="st"><span class="n">01</span><b>A factory orders</b><span>From a supplier, through XELOR.</span></div>
    <div class="st"><span class="n">02</span><b>Supplier delivers</b><span>The goods reach the factory.</span></div>
    <div class="st"><span class="n">03</span><b>Delivery is checked</b><span>On time? Right amount? Good quality?</span></div>
    <div class="st rec"><span class="n">04 · TRACK RECORD</span><b>Sri Ganesh Castings</b><div class="rs"><div><b>96%</b><small>on time</small></div><div><b>0.3%</b><small>rejected</small></div><div><b>19</b><small>deliveries</small></div></div></div>
    <div class="st"><span class="n">05</span><b>Good work gets noticed</b><span>Reliable suppliers get more orders.</span></div>
   </div>
   <div class="grow">
    <svg viewBox="0 0 58 40"><g stroke="#e2b54a" stroke-width="1.6" fill="none"><path d="M29 20 10 8M29 20 10 32M29 20 48 8M29 20 48 32M48 8 56 2M48 32 56 38M10 8 2 2"/></g><g fill="#f6ecdc"><circle cx="29" cy="20" r="5" fill="#e2b54a"/><circle cx="10" cy="8" r="3.4"/><circle cx="10" cy="32" r="3.4"/><circle cx="48" cy="8" r="3.4"/><circle cx="48" cy="32" r="3.4"/><circle cx="56" cy="2" r="2"/><circle cx="56" cy="38" r="2"/><circle cx="2" cy="2" r="2"/></g></svg>
    <p><b>The network grows with every order.</b> When a factory asks a new supplier for a price, that supplier joins free and brings its own customers.</p>
    <div class="fly"><span>More orders</span><em>→</em><span>More records</span><em>→</em><span>More trust</span></div>
   </div>
  </section>

  <section>
   <div class="lbl">How buying works on XELOR</div>
   <div class="steps">
    <div class="sp"><span class="n">1</span><b>Ask</b><p>Say what you need. XELOR sends it to suppliers, who reply from a simple link.</p></div>
    <div class="sp"><span class="n">2</span><b>Compare</b><p>See all prices side by side, with each supplier’s delivery history.</p></div>
    <div class="sp"><span class="n">3</span><b>Choose</b><p>You pick the supplier. The owner approves from the phone.</p></div>
    <div class="sp"><span class="n">4</span><b>Record</b><p>When the goods arrive, XELOR notes how it went. No typing needed.</p></div>
   </div>
  </section>

  <section>
   <div class="lbl">What we offer</div>
   <div class="prods">
    <div class="pc f"><div class="im"><span class="flag">FLAGSHIP</span><img src="shots/mkt-home.jpg" alt="XELOR Market"></div><div class="tx"><span class="t">Find &amp; connect</span><h3>XELOR Market</h3><p>Find suppliers, buyers and local help like repairs and testing. See each seller’s track record before you call.</p></div></div>
    <div class="pc"><div class="im"><img class="ph" src="shots/ph-gram-live.png" alt="Xelogram"></div><div class="tx"><span class="t">Get noticed</span><h3>Xelogram</h3><p>Like a social feed for factories. Show finished work; buyers ask for a price from the post.</p></div></div>
    <div class="pc"><div class="im"><img src="shots/erp-rank.jpg" alt="Smart factory software"></div><div class="tx"><span class="t">Run your factory</span><h3>Smart factory software</h3><p>Handles orders, stock and bills, and does most of the typing for you. Works with Tally.</p></div></div>
   </div>
  </section>

  <section>
   <div class="lbl">Why XELOR is different</div>
   <div class="why">
    <div class="wy"><i><svg viewBox="0 0 24 24"><path d="m6 12.5 4 4L18 8"/></svg></i><div><b>Built on real work</b><span>Track records come from real deliveries, not reviews.</span></div></div>
    <div class="wy"><i><svg viewBox="0 0 24 24"><path d="m6 12.5 4 4L18 8"/></svg></i><div><b>We only connect</b><span>XELOR never handles your money or sells your details.</span></div></div>
    <div class="wy"><i><svg viewBox="0 0 24 24"><path d="m6 12.5 4 4L18 8"/></svg></i><div><b>Low cost for every MSME</b><span>Free to start. Listings from ₹249 a month.</span></div></div>
   </div>
  </section>
 </main>
 <footer class="ft"><span><img src="xelor-mark.svg" alt="" style="width:15px;height:15px">XELOR · Peenya, Bengaluru</span><span>Screens from the working product · <b>demonstration data</b></span></footer>
</div>
</body></html>
````

## Appendix B2. 3 October one-pager source (`deck-and-one-pager/onepager2.html`)

````html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>XELOR Product Overview</title>
<link rel="stylesheet" href="fonts.css">
<style>
@page{size:A4;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#f8f5f5;--surface:#fff;--line:#e5dcdf;--ink:#1d1418;--body:#3d3036;--muted:#6a5c62;--acc:#7a2945;--acc-soft:#f6e8ed;--gold:#c89a2e;--gold-ink:#86600f;--gold-soft:#f8efd9;--gold-hi:#e2b54a;--deep:#2a0f1a;--on-deep:#f6ecdc;--deep-sub:#d6bfc8;--green:#1b6a48;--green-soft:#e4f1ea;
  --display:"Bricolage Grotesque",sans-serif;--sans:"Source Sans 3",sans-serif;--mono:"JetBrains Mono",monospace}
body{font-family:var(--sans);color:var(--body);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:210mm;height:297mm;background:var(--bg);position:relative;overflow:hidden;display:flex;flex-direction:column}
.hd{background:radial-gradient(70% 120% at 100% 0%,rgba(226,181,74,.24),transparent 60%),radial-gradient(60% 100% at 0% 100%,rgba(143,51,84,.55),transparent 60%),var(--deep);padding:24px 38px 22px}
.brand{display:flex;align-items:center;gap:10px}
.mark{width:36px;height:36px;border-radius:10px;background:linear-gradient(145deg,#a3456a,#7a2945 55%,#5e1d35);display:grid;place-items:center}
.mark svg{width:16px;height:16px}
.brand b{font-family:var(--display);font-size:24px;font-weight:800;color:var(--on-deep);letter-spacing:-.03em}
.brand b span{color:var(--gold-hi)}
.brand small{margin-left:auto;font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--gold-hi);text-transform:uppercase}
h1{font-family:var(--display);font-weight:800;font-size:31px;line-height:1.08;letter-spacing:-.035em;color:var(--on-deep);margin-top:12px}
h1 span{color:var(--gold-hi)}
.hd p{font-size:15px;line-height:1.45;margin-top:10px;color:var(--deep-sub)}
.main{padding:18px 38px 0;display:flex;flex-direction:column;gap:15px;flex:1}
.lbl{font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--acc);margin-bottom:9px}
.prob{font-family:var(--display);font-size:19px;font-weight:700;line-height:1.3;color:var(--ink);letter-spacing:-.01em}
.prob em{font-style:normal;color:var(--acc)}
.net{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.st{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:11px 12px;position:relative}
.st:not(:last-child)::after{content:"";position:absolute;right:-7px;top:50%;width:7px;height:7px;border-top:2px solid var(--gold);border-right:2px solid var(--gold);transform:translateY(-50%) rotate(45deg)}
.st .n{font-family:var(--mono);font-size:10px;font-weight:700;color:var(--gold-ink);letter-spacing:.08em}
.st b{display:block;font-family:var(--display);font-size:17px;color:var(--ink);margin-top:2px}
.st p{font-size:12.5px;line-height:1.35;color:var(--muted);margin-top:3px}
.grow{margin-top:8px;display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:12px;background:var(--deep);color:var(--on-deep);font-size:13.5px;line-height:1.35}
.grow b{color:var(--gold-hi)}
.flag{background:var(--surface);border:2px solid var(--acc);border-radius:16px;overflow:hidden}
.flag-h{display:flex;align-items:center;gap:10px;padding:10px 16px;background:var(--acc);color:#fff}
.flag-h .t{font-family:var(--mono);font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;background:rgba(255,255,255,.18);border-radius:6px;padding:3px 8px}
.flag-h b{font-family:var(--display);font-size:21px;letter-spacing:-.02em}
.flag-h > span:last-child{margin-left:auto;font-size:13px;opacity:.9}
.flag-b{display:grid;grid-template-columns:285px 1fr;gap:16px;padding:14px 16px;align-items:center}
.flag-b img{width:100%;display:block;border-radius:8px;box-shadow:0 10px 24px -14px rgba(42,15,26,.5);border:1px solid var(--line)}
.flag-b ul{display:flex;flex-direction:column;gap:7px}
.flag-b li{list-style:none;display:flex;gap:9px;font-size:14px;line-height:1.38;color:var(--body)}
.flag-b li b{color:var(--ink)}
.flag-b li::before{content:"";flex:none;width:16px;height:16px;margin-top:2px;border-radius:50%;background:var(--green-soft) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m7 12.5 3.2 3.2L17 9' fill='none' stroke='%231b6a48' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/12px no-repeat}
.vs{display:flex;gap:8px;margin-top:2px}
.vs div{flex:1;border-radius:10px;padding:7px 10px;font-size:12px;line-height:1.3}
.vs .them{background:#f1ecee;color:var(--muted)}
.vs .us{background:var(--gold-soft);color:var(--ink)}
.vs b{display:block;font-family:var(--display);font-size:15px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.mini{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px 14px;display:grid;grid-template-columns:1fr 110px;gap:12px;align-items:center}
.mini .im{height:96px;overflow:hidden;border-radius:8px;border:1px solid var(--line);background:#f0ecec}
.mini .im img{width:100%;display:block}
.mini .tg{font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-ink)}
.mini h3{font-family:var(--display);font-size:18px;color:var(--ink);letter-spacing:-.02em;margin-top:2px}
.mini p{font-size:12.8px;line-height:1.38;color:var(--muted);margin-top:4px}

.price{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.price div{border-radius:12px;padding:10px 13px;background:var(--surface);border:1px solid var(--line)}
.price div.hl{background:var(--deep);border-color:var(--deep)}
.price .k{font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.price b{display:block;font-family:var(--display);font-size:21px;font-weight:800;color:var(--ink);letter-spacing:-.02em;margin-top:2px}
.price b small{font-size:12px;font-weight:600;color:var(--muted);letter-spacing:0}
.price span{display:block;font-size:12px;color:var(--muted);line-height:1.3;margin-top:2px}
.price .hl .k,.price .hl span,.price .hl b small{color:var(--deep-sub)} .price .hl b{color:var(--gold-hi)}
.ft{margin-top:auto;padding:11px 38px;display:flex;justify-content:space-between;border-top:1px solid var(--line);font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.ft b{color:var(--acc)}
.flag-b li.vsli::before{display:none}
</style></head><body>
<div class="page">
  <div class="hd">
    <div class="brand"><img src="xelor-mark.svg" alt="" style="width:40px;height:40px"><b>XELOR</b><small>Product overview · Oct 2026</small></div>
    <h1>The trusted supplier network<br><span>for Indian MSMEs.</span></h1>
    <p>Every delivery becomes a verified record. Factories use those records to find, trust and trade with each other.</p>
  </div>
  <div class="main">
    <section>
      <div class="lbl">The problem</div>
      <p class="prob">Small factories still find suppliers on WhatsApp and phone calls. <em>Nobody can see who actually delivers on time,</em> and paid directories only check identity.</p>
    </section>

    <section>
      <div class="lbl">How the supplier network works</div>
      <div class="net">
        <div class="st"><span class="n">01 · ASK</span><b>Send a request</b><p>Suppliers quote from a link. No login, no app.</p></div>
        <div class="st"><span class="n">02 · COMPARE</span><b>See the proof</b><p>Quotes ranked on price, delivery and track record.</p></div>
        <div class="st"><span class="n">03 · DECIDE</span><b>Pick and approve</b><p>A person chooses. The owner signs on the phone.</p></div>
        <div class="st"><span class="n">04 · RECORD</span><b>Proof is earned</b><p>On-time and quality results update the record.</p></div>
      </div>
      <div class="grow"><span>Every request invites a new supplier. It joins <b>free</b>, claims its record and brings its other buyers, so <b>the network grows with every order.</b></span></div>
    </section>

    <section>
      <div class="flag">
        <div class="flag-h"><span class="t">Flagship</span><b>XELOR Market</b><span>Find a supplier. See the proof first.</span></div>
        <div class="flag-b">
          <img src="shots/mkt-home.jpg" alt="XELOR Market">
          <ul>
            <li><span>Every seller shows an <b>earned record</b>: on-time %, rejects, deliveries.</span></li>
            <li><span>A buyer’s request goes to <b>5 sellers at most</b>, never resold.</span></li>
            <li><span><b>Find help:</b> verified repair, testing, compliance and finance providers.</span></li>
            <li><span>Buyers and sellers pay each other. <b>XELOR never touches the money.</b></span></li>
            <li class="vsli" style="display:block"><div class="vs"><div class="them"><b>₹32,000+ / year</b>typical paid directory listing</div><div class="us"><b>Free · ₹249 / month</b>XELOR Market listing</div></div></li>
          </ul>
        </div>
      </div>
    </section>

    <section class="two">
      <div class="mini"><div><span class="tg">The engine</span><h3>Agentic AI ERP</h3><p>Runs the factory’s daily work and writes every supplier record automatically. People approve; it works beside Tally.</p></div><div class="im"><img src="shots/erp-gate.jpg" alt=""></div></div>
      <div class="mini"><div><span class="tg">Get found</span><h3>Xelogram</h3><p>A verified delivery becomes a post with a Request quote button, in Tamil, Kannada, Hindi or English.</p></div><div class="im" style="background:linear-gradient(160deg,#f6e8ed,#f8efd9)"><img src="shots/ph-gram-draft.png" alt="" style="width:78%;margin:6px auto 0"></div></div>
    </section>

    <section>
      <div class="lbl">Pricing (launch, under test)</div>
      <div class="price">
        <div><span class="k">XELOR Market</span><b>Free · ₹249 <small>/ month</small></b><span>Verified listing and buyer requests</span></div>
        <div class="hl"><span class="k">Factory software</span><b>₹50K <small>/ month</small></b><span>Per plant, every user included</span></div>
        <div><span class="k">Suppliers</span><b>₹0</b><span>Free record, quotes from a link</span></div>
      </div>
    </section>
  </div>
  <div class="ft"><span style="display:inline-flex;align-items:center;gap:7px"><img src="xelor-mark.svg" alt="" style="width:15px;height:15px">XELOR by AIKYANTRA · Peenya, Bengaluru</span><span>Screens from the working product · <b>demonstration data</b></span></div>
</div>
</body></html>
````

## Appendix B3. One-pager render script (`deck-and-one-pager/r3.mjs`)

````js
import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:794,height:1123},deviceScaleFactor:2});
await p.goto('file://'+process.cwd()+'/onepager3.html',{waitUntil:'networkidle'});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(400);
const o=await p.evaluate(()=>{const pg=document.querySelector('.page').getBoundingClientRect();const m=document.querySelector('.main');return {pageH:pg.height,mainBottom:m.lastElementChild.getBoundingClientRect().bottom,ftTop:document.querySelector('.ft').getBoundingClientRect().top}});console.log(o);
await p.screenshot({path:'prev/onepager3.png',fullPage:true});
await p.pdf({path:'XELOR-One-Pager-v3.pdf',format:'A4',printBackground:true,preferCSSPageSize:true});
await b.close();
````

## Appendix C. 15-slide deck source (`deck-and-one-pager/deck3.html`)

Render: `node render.mjs deck3.html XELOR-Pitch-Deck.pdf`.

````html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>XELOR Pitch Deck</title>
<link rel="stylesheet" href="fonts.css">
<style>
@page{size:1920px 1080px;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#f8f5f5;--bg2:#efeaea;--surface:#fff;--line:#e2d9db;--line2:#cdc0c4;--ink:#1d1418;--body:#3d3036;--muted:#6f6066;
  --acc:#7a2945;--acc-soft:#f6e8ed;--gold:#c89a2e;--gold-ink:#86600f;--gold-soft:#f8efd9;--gold-hi:#e2b54a;
  --deep:#2a0f1a;--on-deep:#f6ecdc;--deep-sub:#d2b8c2;--deep-line:rgba(246,236,220,.18);--deep-card:rgba(246,236,220,.06);
  --green:#1b6a48;--green-soft:#e4f1ea;--red:#a13d2a;
  --display:"Bricolage Grotesque","Segoe UI",sans-serif;--sans:"Source Sans 3","Segoe UI",sans-serif;--mono:"JetBrains Mono",monospace}
html,body{background:#ccc}
body{font-family:var(--sans);color:var(--body);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sl{width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);padding:90px 120px 110px;break-after:page;display:flex;flex-direction:column}
.sl.tint{background:var(--bg2)}
.sl.dark{background:var(--deep);color:var(--deep-sub)}
.eb{font-family:var(--mono);font-size:20px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--acc)}
.dark .eb{color:var(--gold-hi)}
h1,h2,h3{font-family:var(--display);color:var(--ink);letter-spacing:-.03em;font-weight:800}
.dark h1,.dark h2,.dark h3{color:var(--on-deep)}
h2{font-size:76px;line-height:1.04;margin-top:18px}
h2 em{font-style:normal;color:var(--acc)} .dark h2 em{color:var(--gold-hi)}
.lead{font-size:32px;line-height:1.4;color:var(--muted);margin-top:26px}
.dark .lead{color:var(--deep-sub)}
.ft{position:absolute;left:120px;right:120px;bottom:44px;display:flex;justify-content:space-between;font-family:var(--mono);font-size:17px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.dark .ft{color:rgba(210,184,194,.75)}
.ft b{color:var(--acc)} .dark .ft b{color:var(--gold-hi)}
.card{background:var(--surface);border:1.5px solid var(--line);border-radius:26px}
.dark .card{background:var(--deep-card);border-color:var(--deep-line)}
.lap{border-radius:1.07%/1.52%;overflow:hidden;box-shadow:0 50px 90px -40px rgba(42,15,26,.55),0 0 0 1px rgba(0,0,0,.08);background:#120a0d}
.lap img,.tab img{display:block;width:100%;height:auto}
.tab{border-radius:1.9%/2%;overflow:hidden;box-shadow:0 50px 90px -40px rgba(42,15,26,.55)}
.ph{position:absolute;filter:drop-shadow(0 40px 50px rgba(42,15,26,.45))}
.pts{display:flex;flex-direction:column;gap:26px;margin-top:40px}
.pts li{list-style:none;display:flex;gap:20px;font-size:31px;line-height:1.35;color:var(--body)}
.pts li b{color:var(--ink)}
.pts li::before{content:"";flex:none;width:34px;height:34px;margin-top:2px;border-radius:50%;background:var(--green-soft) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m7 12.5 3.2 3.2L17 9' fill='none' stroke='%231b6a48' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/24px no-repeat}
.dark .pts li{color:var(--deep-sub)} .dark .pts li b{color:var(--on-deep)}
.split{display:grid;gap:70px;flex:1;align-items:center;min-height:0}
.note{font-size:20px;color:var(--muted);line-height:1.4}
.dark .note{color:rgba(210,184,194,.8)}
.tag{display:inline-flex;align-items:center;height:40px;padding:0 18px;border-radius:12px;font-family:var(--mono);font-size:17px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.tag.gold{background:var(--gold-soft);color:var(--gold-ink)} .tag.acc{background:var(--acc-soft);color:var(--acc)} .tag.ok{background:var(--green-soft);color:var(--green)}
.dark .tag.gold{background:var(--gold-hi);color:#1d1606}

/* 1 cover */
.cover{background:radial-gradient(70% 90% at 95% 15%,rgba(226,181,74,.22),transparent 55%),radial-gradient(60% 80% at 0% 100%,rgba(143,51,84,.6),transparent 60%),var(--deep);padding:100px 120px}
.cover::after{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(246,236,220,.06) 1.2px,transparent 1.2px);background-size:32px 32px;mask-image:linear-gradient(110deg,#000 10%,transparent 60%);-webkit-mask-image:linear-gradient(110deg,#000 10%,transparent 60%);pointer-events:none}
.brand{display:flex;align-items:center;gap:20px;position:relative;z-index:1}
.mark{width:78px;height:78px;border-radius:22px;background:linear-gradient(145deg,#a3456a,#7a2945 55%,#5e1d35);display:grid;place-items:center;box-shadow:0 14px 30px -10px rgba(0,0,0,.6)}
.mark svg{width:34px;height:34px}
.brand b{font-family:var(--display);font-size:56px;font-weight:800;letter-spacing:-.03em;color:var(--on-deep)}
.brand b span{color:var(--gold-hi)}
.cv{position:relative;z-index:1;display:grid;grid-template-columns:820px 1fr;gap:50px;flex:1;align-items:center}
.cover h1{font-size:118px;line-height:.96;letter-spacing:-.05em;color:var(--on-deep)}
.cover h1 span{color:var(--gold-hi)}
.cover .sub{font-size:38px;line-height:1.3;color:var(--deep-sub);margin-top:36px;font-weight:600}
.cv-art{position:relative;height:760px}
.cv-art .lap{position:absolute;left:0;top:110px;width:860px;box-shadow:0 70px 120px -40px rgba(0,0,0,.85),0 0 0 1px rgba(246,236,220,.14)}
.cv-art .ph{right:-10px;top:40px;width:300px}
.cv-foot{position:relative;z-index:1;display:flex;gap:40px;font-family:var(--mono);font-size:20px;letter-spacing:.12em;text-transform:uppercase;color:rgba(210,184,194,.85)}
.cv-foot b{color:var(--gold-hi);font-weight:700}

/* 2 problem */
.prob{position:relative;flex:1;margin-top:30px}
.prob svg{position:absolute;inset:0;width:100%;height:100%}
.pc{position:absolute;width:520px;background:var(--surface);border:1.5px solid var(--line);border-radius:24px;padding:24px 28px;box-shadow:0 24px 50px -30px rgba(42,15,26,.5)}
.pc .h{display:flex;align-items:center;gap:14px;font-family:var(--mono);font-size:18px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.pc .h i{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;color:#fff;font-style:normal;font-size:20px;font-family:var(--sans)}
.pc p{font-size:30px;line-height:1.3;color:var(--ink);margin-top:14px;font-weight:600}
.pc .x{display:block;margin-top:12px;font-size:23px;font-weight:700;color:var(--red)}
.core{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:360px;height:360px;border-radius:50%;background:var(--deep);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;box-shadow:0 0 0 18px rgba(122,41,69,.08),0 0 0 38px rgba(122,41,69,.05)}
.core b{font-family:var(--display);font-size:84px;color:var(--gold-hi);line-height:.9}
.core span{font-family:var(--display);font-size:34px;font-weight:700;color:var(--on-deep);line-height:1.15;margin-top:14px}

/* stats */
.stats3{display:grid;grid-template-columns:repeat(3,1fr);gap:30px;margin:auto 0}
.stats3 .card{padding:40px 40px 36px}
.stats3 b{display:block;font-family:var(--display);font-size:104px;font-weight:800;letter-spacing:-.05em;color:var(--acc);line-height:1}
.stats3 p{font-size:31px;line-height:1.35;color:var(--ink);margin-top:18px;font-weight:600}
.stats3 .src{display:block;margin-top:18px;font-family:var(--mono);font-size:17px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.punch{margin-top:auto;font-family:var(--display);font-size:46px;font-weight:800;letter-spacing:-.02em;color:var(--ink)}
.punch span{color:var(--acc)}

/* steps */
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:26px;margin:auto 0}
.step{padding:34px 32px;position:relative}
.step:not(:last-child)::after{content:"";position:absolute;right:-20px;top:50%;width:14px;height:14px;border-top:4px solid var(--gold);border-right:4px solid var(--gold);transform:translateY(-50%) rotate(45deg)}
.step .n{width:62px;height:62px;border-radius:18px;display:grid;place-items:center;background:var(--acc);color:#fff;font-family:var(--display);font-weight:800;font-size:30px}
.step h3{font-size:44px;margin-top:22px}
.step p{font-size:28px;line-height:1.35;color:var(--muted);margin-top:12px}
.band{margin-top:auto;display:flex;align-items:center;gap:26px;padding:30px 38px;border-radius:24px;background:var(--deep);color:var(--on-deep);font-size:32px;font-weight:600}
.band b{color:var(--gold-hi)}

/* loop */
.loop{display:grid;grid-template-columns:repeat(5,1fr);gap:24px;margin:auto 0}
.loop li{list-style:none;padding:30px 28px;position:relative;background:var(--surface);border:1.5px solid var(--line);border-radius:24px}
.loop li:not(:last-child)::after{content:"";position:absolute;right:-17px;top:50%;width:12px;height:12px;border-top:4px solid var(--gold);border-right:4px solid var(--gold);transform:translateY(-50%) rotate(45deg)}
.loop .n{font-family:var(--mono);font-size:20px;font-weight:700;color:var(--gold-ink)}
.loop b{display:block;font-family:var(--display);font-size:36px;color:var(--ink);margin-top:10px;line-height:1.15}
.loop span{display:block;font-size:27px;color:var(--muted);margin-top:10px;line-height:1.35}

/* why now */
.layer{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:center;padding:30px 34px;border-radius:24px;border:1.5px solid var(--deep-line);background:var(--deep-card);margin-bottom:18px}
.layer b{display:block;font-family:var(--display);font-size:42px;color:var(--on-deep)}
.layer small{display:block;font-size:26px;color:var(--deep-sub);margin-top:6px}
.layer .tag{background:rgba(246,236,220,.1);color:var(--deep-sub)}
.layer.dim{opacity:.72;margin-inline:30px}
.layer.g{border:2px solid var(--gold-hi);background:linear-gradient(135deg,rgba(226,181,74,.24),rgba(226,181,74,.06))}
.layer.g small{color:#f0dcae}
.layer.g .tag{background:var(--gold-hi);color:#1d1606}
.rules{display:flex;flex-direction:column;gap:18px}
.rule{padding:26px 30px}
.rule .d{font-family:var(--mono);font-size:19px;font-weight:700;letter-spacing:.1em;color:var(--gold-hi)}
.rule b{display:block;font-family:var(--display);font-size:34px;color:var(--on-deep);margin-top:6px}
.rule span{display:block;font-size:24px;color:var(--deep-sub);margin-top:6px;line-height:1.35}

/* compare */
.cmp{width:100%;border-collapse:separate;border-spacing:0;margin-top:46px;background:var(--surface);border:1.5px solid var(--line);border-radius:26px;overflow:hidden}
.cmp th,.cmp td{padding:22px 24px;border-bottom:1.5px solid var(--line);text-align:center;vertical-align:middle}
.cmp tr:last-child td{border-bottom:0}
.cmp th{font-family:var(--display);font-size:28px;color:var(--ink);line-height:1.15}
.cmp th small{display:block;font-family:var(--sans);font-weight:400;font-size:20px;color:var(--muted);margin-top:6px}
.cmp td:first-child,.cmp th:first-child{text-align:left;font-size:28px;font-weight:700;color:var(--ink)}
.cmp .us{background:var(--gold-soft)}
.cmp th.us{color:var(--gold-ink);font-size:34px}
.y,.n,.p{display:inline-grid;place-items:center;width:46px;height:46px;border-radius:50%;font-size:26px;font-weight:800}
.y{background:var(--green);color:#fff} .n{background:#eee8e9;color:#a0939a} .p{background:var(--gold-soft);color:var(--gold-ink);border:2px solid var(--gold)}

/* pricing / size */
.prices{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin:auto 0}
.price{padding:40px 38px}
.price .k{font-family:var(--mono);font-size:19px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.price .v{display:block;font-family:var(--display);font-size:80px;font-weight:800;letter-spacing:-.04em;color:var(--ink);margin-top:14px;line-height:1}
.price .v small{font-size:28px;font-weight:600;color:var(--muted);letter-spacing:0;margin-left:6px}
.price p{font-size:27px;line-height:1.38;color:var(--muted);margin-top:16px}
.price.hl{background:var(--deep);border-color:var(--deep)}
.price.hl .k,.price.hl p,.price.hl .v small{color:var(--deep-sub)} .price.hl .v{color:var(--gold-hi)}
.econ{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}
.econ div{padding:24px 28px;border-radius:22px;background:var(--surface);border:1.5px solid var(--line)}
.econ b{display:block;font-family:var(--display);font-size:46px;color:var(--ink);letter-spacing:-.03em}
.econ span{display:block;font-size:22px;color:var(--muted);margin-top:4px}
.tiers{display:flex;flex-direction:column;gap:22px}
.tier{display:grid;grid-template-columns:230px 1fr auto;gap:30px;align-items:center;padding:30px 36px}
.tier .l{font-family:var(--display);font-size:44px;font-weight:800;color:var(--on-deep)}
.tier .l small{display:block;font-family:var(--sans);font-size:22px;font-weight:600;color:var(--deep-sub);margin-top:4px;letter-spacing:0}
.tier .calc{font-size:25px;line-height:1.5;color:var(--deep-sub)}
.tier .calc b{color:var(--on-deep)}
.tier .v{font-family:var(--display);font-size:64px;font-weight:800;color:var(--gold-hi);letter-spacing:-.04em;text-align:right;line-height:1}
.tier .v small{display:block;font-size:22px;color:var(--deep-sub);font-weight:600;letter-spacing:0;margin-top:6px}

/* team */
.team{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin-top:50px}
.fd{display:grid;grid-template-columns:190px 1fr;gap:34px;align-items:center;padding:36px}
.fd img{width:190px;height:190px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 8px var(--acc-soft)}
.fd h3{font-size:46px}
.fd .r{display:block;font-family:var(--mono);font-size:19px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--acc);margin-top:6px}
.fd p{font-size:26px;line-height:1.4;color:var(--muted);margin-top:14px}
.facts{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:36px}
.facts div{padding:32px 34px;border-radius:24px;background:var(--deep)}
.facts b{display:block;font-family:var(--display);font-size:72px;color:var(--gold-hi);letter-spacing:-.04em;line-height:1}
.facts span{display:block;font-size:27px;line-height:1.35;color:var(--on-deep);margin-top:12px}
.split h2{font-size:68px}

.markimg{width:84px;height:84px;filter:drop-shadow(0 14px 24px rgba(0,0,0,.45))}
.brand .tagl{font-family:var(--mono);font-size:18px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--gold-hi);margin-left:10px;align-self:center;padding-left:22px;border-left:2px solid rgba(246,236,220,.2)}
.cover .wm{position:absolute;right:-140px;bottom:-180px;width:760px;opacity:.06;z-index:0}
.ft span:first-child{display:inline-flex;align-items:center;gap:12px}
.ft img{width:28px;height:28px}
.pts li::before{background:var(--gold-soft) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m6.5 12.5 3.6 3.6L18 8' fill='none' stroke='%23b8871f' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/24px no-repeat}
.dark .pts li::before{background-color:rgba(226,181,74,.18)}

.cv2{position:relative;z-index:1;display:grid;grid-template-columns:960px 1fr;gap:40px;align-items:center;flex:1;min-height:0}
.cover h1{font-size:96px;line-height:1;letter-spacing:-.045em}
.cover .sub{font-size:34px;line-height:1.35;margin-top:30px;max-width:880px}
.cv-art2{position:relative;height:520px}
.cv-art2 .lap{position:absolute;left:0;top:70px;width:700px;box-shadow:0 70px 120px -40px rgba(0,0,0,.85),0 0 0 1px rgba(246,236,220,.14)}
.cv-art2 .ph{right:-30px;top:0;width:250px}
.chain{position:relative;z-index:1;display:grid;grid-template-columns:repeat(6,1fr);gap:0;margin-top:20px;padding-top:4px}
.chain::before{content:"";position:absolute;left:8.3%;right:8.3%;top:46px;height:3px;background:linear-gradient(90deg,rgba(226,181,74,.25),#e2b54a 20%,#e2b54a 80%,rgba(226,181,74,.25))}
.cn{display:flex;flex-direction:column;align-items:center;gap:14px;position:relative}
.ci{width:92px;height:92px;border-radius:50%;background:#3a1726;border:2px solid rgba(226,181,74,.55);display:grid;place-items:center;color:#f6ecdc;position:relative}
.ci svg{width:42px;height:42px}
.ci i{position:absolute;right:-4px;bottom:-2px;width:34px;height:34px;border-radius:50%;background:#e2b54a;color:#1d1606;font-style:normal;font-weight:800;font-size:19px;display:grid;place-items:center;box-shadow:0 0 0 4px #2a0f1a}
.cn b{font-family:var(--display);font-size:25px;color:#f6ecdc;letter-spacing:-.01em}

.p2{display:grid;grid-template-columns:1fr 760px;gap:60px;align-items:center;flex:1;min-height:0;margin-top:10px}
.p2h{font-size:66px;line-height:1.06;margin-top:0}
.p2h .big{display:block;font-size:150px;line-height:.9;letter-spacing:-.055em;color:var(--acc);margin-bottom:10px}
.p2s{font-size:30px;line-height:1.42;color:var(--muted);margin-top:30px}
.p2src{display:inline-block;margin-top:22px;font-family:var(--mono);font-size:17px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.p2g{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.q{background:var(--surface);border:1.5px solid var(--line);border-radius:24px;padding:24px 26px;box-shadow:0 24px 50px -34px rgba(42,15,26,.45)}
.q .h{display:flex;align-items:center;gap:12px;font-family:var(--mono);font-size:17px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.q .h i{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;color:#fff;font-style:normal;font-size:19px;font-family:var(--sans)}
.q p{font-size:28px;line-height:1.28;color:var(--ink);font-weight:700;margin-top:14px}
.q span{display:block;margin-top:12px;font-size:23px;font-weight:700;color:var(--red)}
.p2b{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-top:36px;border-radius:24px;background:var(--deep);overflow:hidden}
.p2b div{padding:26px 34px;border-right:1px solid rgba(246,236,220,.14)}
.p2b div:last-child{border-right:0}
.p2b b{display:block;font-family:var(--display);font-size:34px;color:var(--gold-hi);letter-spacing:-.02em}
.p2b span{display:block;font-size:24px;color:var(--on-deep);margin-top:6px;line-height:1.3}
</style></head><body>

<!-- 1 COVER -->
<section class="sl cover">
  <div class="brand"><img class="markimg" src="xelor-mark.svg" alt=""><b>XELOR</b><small class="tagl">Seed investor brief · October 2026</small></div>
  <div class="cv2">
    <div>
      <h1>The trusted network behind <span>what India manufactures.</span></h1>
      <p class="sub">Suppliers, job shops, assemblers and manufacturers, connected through records earned on every delivery.</p>
    </div>
    <div class="cv-art2"><div class="lap"><img src="shots/mkt-home.jpg" alt=""></div><img class="ph" src="shots/ph-gram-draft.png" alt=""></div>
  </div>
  <div class="chain"><div class="cn"><span class="ci"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l4-9 4 6 3-4 5 7z"/></svg><i>✓</i></span><b>Raw material</b></div><div class="cn"><span class="ci"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20V10l5 3V9l5 3V6h4v14z"/></svg><i>✓</i></span><b>Foundry</b></div><div class="cn"><span class="ci"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M8 7h8l-1 6H9zM10 13v4h4v-4M7 21h10"/></svg><i>✓</i></span><b>Machining</b></div><div class="cn"><span class="ci"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h11l3 3-3 3H4zM15 12h5M8 15v5"/></svg><i>✓</i></span><b>Coating</b></div><div class="cn"><span class="ci"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12 4 7.5"/></svg><i>✓</i></span><b>Assembly</b></div><div class="cn"><span class="ci"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V11l7-5 7 5v10M9 21v-6h6v6"/></svg><i>✓</i></span><b>Manufacturer</b></div></div>
  <img class="wm" src="xelor-symbol-on-dark.svg" alt="">
</section>

<!-- 2 PROBLEM -->
<section class="sl">
  <div class="eb">The problem</div>
  <div class="p2">
    <div class="p2l">
      <h2 class="p2h"><span class="big">1.8 crore</span> manufacturers.<br><em>No shared record<br>of who delivers.</em></h2>
      <p class="p2s">Every order still rides on a WhatsApp promise, a phone call and gut feel. When a delivery fails, nothing is recorded, so the next order goes to the same guess.</p>
      <span class="p2src">Manufacturing MSMEs on Udyam, July 2026</span>
    </div>
    <div class="p2g">
      <div class="q"><div class="h"><i style="background:#25a35a">✉</i>WhatsApp</div><p>“Castings will reach by Friday, sir.”</p><span>Tuesday. Still waiting.</span></div>
      <div class="q"><div class="h"><i style="background:#a13d2a">☎</i>Phone call</div><p>“Same rate as last time?”</p><span>Nobody knows last time.</span></div>
      <div class="q"><div class="h"><i style="background:#9a5a1b">✎</i>Paper register</div><p>“60 received. 2 cracked.”</p><span>Never reaches any system.</span></div>
      <div class="q"><div class="h"><i style="background:#2a5a86">₹</i>Paid directory</div><p>“Trusted seller” badge.</p><span>Checks identity, not delivery.</span></div>
    </div>
  </div>
  <div class="p2b">
    <div><b>Lines stop</b><span>when one late part holds up an order</span></div>
    <div><b>Rejects surface</b><span>after the supplier is already paid</span></div>
    <div><b>Good suppliers stay invisible</b><span>with no way to prove they deliver</span></div>
  </div>
  <div class="ft"><span><img src="xelor-mark.svg" alt="">XELOR · Seed investor brief</span><b>02</b></div>
</section>

<!-- 3 WHY IT MATTERS -->
<section class="sl tint">
  <div class="eb">The cost</div>
  <h2>No record means no trust.<br><em>Factories pay for it every day.</em></h2>
  <div class="stats3">
    <div class="card"><b>12%</b><p>of Indian MSMEs use ERP software. The rest track suppliers in notebooks and chats.</p><span class="src">RIS, 2026</span></div>
    <div class="card"><b>~2.5%</b><p>of the 8.8M sellers on IndiaMART pay to be listed. Most MSMEs are priced out of being found.</p><span class="src">IndiaMART Q1 FY27 · our arithmetic</span></div>
    <div class="card"><b>3–4×</b><p>Each number is typed three or four times across separate systems.</p><span class="src">What we see on the shop floor</span></div>
  </div>
  <p class="punch">Every factory already creates the proof. <span>Nobody keeps it.</span></p>
  <div class="ft"><span><img src="xelor-mark.svg" alt="">XELOR · Seed investor brief</span><b>03</b></div>
</section>

<!-- 4 SOLUTION -->
<section class="sl">
  <div class="eb">The solution</div>
  <h2>XELOR turns every order into<br><em>a supplier record you can trust.</em></h2>
  <div class="steps">
    <div class="card step"><span class="n">1</span><h3>Ask</h3><p>The request for quote writes itself. Suppliers reply from a link, with no login.</p></div>
    <div class="card step"><span class="n">2</span><h3>Compare</h3><p>Quotes ranked on price, delivery date and each supplier’s track record.</p></div>
    <div class="card step"><span class="n">3</span><h3>Decide</h3><p>A person picks the supplier. The owner approves on the phone.</p></div>
    <div class="card step"><span class="n">4</span><h3>Record</h3><p>When goods arrive, on-time and quality results update the record.</p></div>
  </div>
  <div class="band"><span class="tag gold">Result</span><span>Records come from <b>real deliveries</b>, so they can’t be typed in, bought or faked.</span></div>
  <div class="ft"><span><img src="xelor-mark.svg" alt="">XELOR · Seed investor brief</span><b>04</b></div>
</section>

<!-- 5 RECORD EARNED AT THE GATE -->
<section class="sl tint">
  <div class="split" style="grid-template-columns:640px 1fr">
    <div>
      <div class="eb">How the record is earned</div>
      <h2>One scan at the gate.<br><em>The record updates.</em></h2>
      <ul class="pts">
        <li><span><b>On time?</b> Counted from the receipt date.</span></li>
        <li><span><b>Quality?</b> Counted from the inspection.</span></li>
        <li><span><b>New supplier?</b> Shows “unproven” until it delivers.</span></li>
      </ul>
    </div>
    <div class="tab"><img src="shots/erp-gate.jpg" alt="Stores tablet: receipt posted and supplier record updated"></div>
  </div>
  <div class="ft"><span><img src="xelor-mark.svg" alt="">XELOR · Seed investor brief</span><b>05</b></div>
</section>

<!-- 6 COMPARE ON PROOF -->
<section class="sl">
  <div class="split" style="grid-template-columns:600px 1fr">
    <div>
      <div class="eb">Better decisions</div>
      <h2>Compare suppliers on <em>proof, not promises.</em></h2>
      <ul class="pts">
        <li><span>Every quote shows the supplier’s real on-time and reject rates.</span></li>
        <li><span>The ranking explains itself. <b>A person always decides.</b></span></li>
        <li><span>The best supplier wins on proof, not just price.</span></li>
      </ul>
    </div>
    <div class="lap"><img src="shots/erp-rank.jpg" alt="Ranked supplier quotes"></div>
  </div>
  <div class="ft"><span><img src="xelor-mark.svg" alt="">XELOR · Seed investor brief</span><b>06</b></div>
</section>

<!-- 7 XELOR MARKET (FLAGSHIP) -->
<section class="sl tint">
  <div class="split" style="grid-template-columns:640px 1fr">
    <div>
      <span class="tag acc">Flagship</span>
      <h2 style="margin-top:24px">XELOR Market.<br><em>See the proof first.</em></h2>
      <ul class="pts" style="gap:22px">
        <li><span>Every seller shows an <b>earned delivery record.</b></span></li>
        <li><span><b>Free to list,</b> or ₹249 a month for Verified.</span></li>
        <li><span>A request goes to <b>5 sellers at most.</b> Never resold.</span></li>
        <li><span>Find help: repair, testing, compliance, finance.</span></li>
        <li><span>Buyers and sellers pay each other. <b>We never touch the money.</b></span></li>
      </ul>
    </div>
    <div class="lap"><img src="shots/mkt-home.jpg" alt="XELOR Market"></div>
  </div>
  <div class="ft"><span><img src="xelor-mark.svg" alt="">XELOR · Seed investor brief</span><b>07</b></div>
</section>

<!-- 8 XELOGRAM -->
<section class="sl">
  <div class="split" style="grid-template-columns:1fr 640px">
    <div style="position:relative;height:100%">
      <div class="lap" style="position:absolute;left:0;top:50%;transform:translateY(-50%);width:880px"><img src="shots/gram-feed.jpg" alt=""></div>
      <img class="ph" src="shots/ph-gram-draft.png" style="right:20px;top:60px;width:330px" alt="">
    </div>
    <div>
      <div class="eb">Xelogram</div>
      <h2>Show your factory.<br><em>Win new buyers.</em></h2>
      <ul class="pts">
        <li><span>A verified delivery becomes a post in one tap.</span></li>
        <li><span>Captions in Tamil, Kannada, Hindi or English.</span></li>
        <li><span>Every post has a <b>proof badge</b> and a <b>Request quote</b> button.</span></li>
        <li><span>Shares to WhatsApp Status, used by 97% of MSMEs.</span></li>
      </ul>
    </div>
  </div>
  <div class="ft"><span><img src="xelor-mark.svg" alt="">XELOR · Seed investor brief</span><b>08</b></div>
</section>

<!-- 9 THE ERP ENGINE -->
<section class="sl tint">
  <div class="split" style="grid-template-columns:600px 1fr">
    <div>
      <div class="eb">The engine</div>
      <h2>The software that<br><em>builds every record.</em></h2>
      <ul class="pts">
        <li><span>Sales, purchase, stores, production and accounts on one record.</span></li>
        <li><span>It drafts and follows up. <b>People approve</b> money and stock.</span></li>
        <li><span>Works beside Tally. Sold one department at a time.</span></li>
      </ul>
    </div>
    <div style="position:relative;height:100%">
      <div class="lap" style="position:absolute;left:0;top:50%;transform:translateY(-50%);width:960px"><img src="shots/erp-home.jpg" alt=""></div>
      <img class="ph" src="shots/ph-owner.png" style="right:-10px;bottom:20px;width:290px" alt="">
    </div>
  </div>
  <div class="ft"><span><img src="xelor-mark.svg" alt="">XELOR · Seed investor brief</span><b>09</b></div>
</section>

<!-- 10 NETWORK EFFECT -->
<section class="sl">
  <div class="eb">The network</div>
  <h2>Every request <em>grows the network.</em></h2>
  <ol class="loop">
    <li><span class="n">01</span><b>A factory sends a request</b><span>To its usual suppliers and new ones.</span></li>
    <li><span class="n">02</span><b>Suppliers quote from a link</b><span>No login, no app, by text or voice.</span></li>
    <li><span class="n">03</span><b>They claim a free record</b><span>And use it with every XELOR buyer.</span></li>
    <li><span class="n">04</span><b>Buyers check the proof</b><span>Records decide who wins the order.</span></li>
    <li><span class="n">05</span><b>More factories join</b><span>And trade with each other directly.</span></li>
  </ol>
  <div class="band"><span class="tag gold">Moat</span><span>Delivery history takes years to build and <b>can’t be copied or back-filled.</b> We start dense, in one cluster.</span></div>
  <div class="ft"><span><img src="xelor-mark.svg" alt="">XELOR · Seed investor brief</span><b>10</b></div>
</section>

<!-- 11 WHY NOW -->
<section class="sl dark">
  <div class="eb">Why now</div>
  <h2>AI is everywhere.<br><em>Verified data isn’t.</em></h2>
  <div class="split" style="grid-template-columns:1fr 720px;margin-top:40px;align-items:start">
    <div>
      <div class="layer dim"><div><b>AI models</b><small>Anyone can rent one.</small></div><span class="tag">Common</span></div>
      <div class="layer dim" style="margin-inline:15px"><div><b>AI tools for buying</b><small>Many funded startups build these.</small></div><span class="tag">Crowded</span></div>
      <div class="layer g"><div><b>Verified delivery data</b><small>Only comes from real work at the factory gate.</small></div><span class="tag">Rare · XELOR</span></div>
    </div>
    <div class="rules">
      <div class="card rule"><span class="d">Apr 2024</span><b>45-day payment rule</b><span>Pay small suppliers late and lose the tax deduction.</span></div>
      <div class="card rule"><span class="d">Aug 2023</span><b>E-invoicing at ₹5 crore</b><span>Every B2B invoice registered with the government.</span></div>
      <div class="card rule"><span class="d">Sep 2026</span><b>TReDS guarantee</b><span>Lenders back small-firm invoices, with proof of delivery.</span></div>
    </div>
  </div>
  <div class="ft"><span><img src="xelor-mark.svg" alt="">XELOR · Seed investor brief</span><b>11</b></div>
</section>

<!-- 12 COMPETITION -->
<section class="sl tint">
  <div class="eb">Competition</div>
  <h2>Others list suppliers.<br><em>Only XELOR proves them.</em></h2>
  <table class="cmp">
    <thead><tr><th style="width:30%"></th><th>Directories<small>IndiaMART, JustDial</small></th><th>Marketplaces<small>Zetwerk, OfBusiness</small></th><th>SME software<small>Tally, Zoho</small></th><th>AI buying tools<small>Didero and others</small></th><th class="us">XELOR</th></tr></thead>
    <tbody>
      <tr><td>Record from real deliveries</td><td><span class="n">–</span></td><td><span class="p">½</span></td><td><span class="n">–</span></td><td><span class="n">–</span></td><td class="us"><span class="y">✓</span></td></tr>
      <tr><td>Affordable for small MSMEs</td><td><span class="n">–</span></td><td><span class="p">½</span></td><td><span class="y">✓</span></td><td><span class="n">–</span></td><td class="us"><span class="y">✓</span></td></tr>
      <tr><td>Requests never resold</td><td><span class="n">–</span></td><td><span class="y">✓</span></td><td><span class="n">–</span></td><td><span class="y">✓</span></td><td class="us"><span class="y">✓</span></td></tr>
      <tr><td>Runs inside the factory</td><td><span class="n">–</span></td><td><span class="n">–</span></td><td><span class="y">✓</span></td><td><span class="n">–</span></td><td class="us"><span class="y">✓</span></td></tr>
      <tr><td>No cut, no money handled</td><td><span class="y">✓</span></td><td><span class="n">–</span></td><td><span class="y">✓</span></td><td><span class="y">✓</span></td><td class="us"><span class="y">✓</span></td></tr>
    </tbody>
  </table>
  <p class="note" style="margin-top:20px">½ = partly. Based on our October 2026 scan of public information.</p>
  <div class="ft"><span><img src="xelor-mark.svg" alt="">XELOR · Seed investor brief</span><b>12</b></div>
</section>

<!-- 13 BUSINESS MODEL -->
<section class="sl">
  <div class="eb">Business model</div>
  <h2>Simple pricing.<br><em>Suppliers always join free.</em></h2>
  <div class="prices">
    <div class="card price"><span class="k">XELOR Market</span><span class="v">₹249<small>/ month</small></span><p>Verified listing. Free basic listing for every MSME.</p></div>
    <div class="card price hl"><span class="k">Factory software</span><span class="v">₹50K<small>/ month</small></span><p>Per plant, every user included. ₹6 lakh a year.</p></div>
    <div class="card price"><span class="k">Suppliers</span><span class="v">₹0</span><p>A free record and quotes from a link. Always.</p></div>
  </div>
  <div class="econ">
    <div><b>₹20K</b><span>paid 6-week pilot</span></div>
    <div><b>75–78%</b><span>target gross margin</span></div>
    <div><b>~21 mo</b><span>to earn back sales cost</span></div>
    <div><b>Later</b><span>referral fees on early payments</span></div>
  </div>
  <div class="ft"><span><img src="xelor-mark.svg" alt="">XELOR · Seed investor brief</span><b>13</b></div>
</section>

<!-- 14 MARKET SIZE -->
<section class="sl dark">
  <div class="eb">Market size</div>
  <h2>A ₹7,900 Cr market,<br><em>built from the ground up.</em></h2>
  <div class="tiers" style="margin-top:46px">
    <div class="card tier"><span class="l">TAM<small>All of India</small></span><span class="calc"><b>1.83 Cr</b> MSMEs × ₹2,490 &nbsp;+&nbsp; <b>47,762</b> factories × ₹6 L &nbsp;+&nbsp; TReDS referrals</span><span class="v">₹7,947 Cr<small>~$900M</small></span></div>
    <div class="card tier"><span class="l">SAM<small>Karnataka + Tamil Nadu</small></span><span class="calc"><b>7,330</b> factories × ₹6 L &nbsp;+&nbsp; <b>1.53 L</b> MSMEs in Bengaluru, Hosur, Coimbatore</span><span class="v">₹504 Cr<small>~$57M</small></span></div>
    <div class="card tier"><span class="l">SOM<small>Year 5</small></span><span class="calc"><b>220</b> factories (3% of SAM) &nbsp;+&nbsp; <b>450</b> paid listings &nbsp;+&nbsp; referrals</span><span class="v">₹13.7 Cr<small>~$1.6M ARR</small></span></div>
  </div>
  <p class="note" style="margin-top:22px">Sources: Udyam (Jul 2026), Annual Survey of Industries 2023-24, TReDS data (FY26). Conservative: excludes ads and smaller factories.</p>
  <div class="ft"><span><img src="xelor-mark.svg" alt="">XELOR · Seed investor brief</span><b>14</b></div>
</section>

<!-- 15 TEAM -->
<section class="sl">
  <div class="eb">The team</div>
  <h2>We grew up <em>inside this problem.</em></h2>
  <div class="team">
    <div class="card fd"><img src="hari.jpeg" alt="Hari Rajiv"><div><h3>Hari Rajiv</h3><span class="r">CEO · Co-founder</span><p>Siemens and Connectivity IT, a Cisco Gold Partner selling into these factories. ECE, BMSIT.</p></div></div>
    <div class="card fd"><img src="medhansh.jpeg" alt="Medhansh Mohanram"><div><h3>Medhansh Mohanram</h3><span class="r">CTO · Co-founder</span><p>Cisco, now Connectivity IT. Owns the platform and its architecture. ECE, BMSIT.</p></div></div>
  </div>
  <div class="facts">
    <div><b>21 yrs</b><span>living in Peenya, among the factories we serve</span></div>
    <div><b>10–15</b><span>factory visits with owners and purchase teams</span></div>
    <div><b>2</b><span>pilot factories from our own network</span></div>
  </div>
  <div class="band"><span class="tag gold">This round</span><span>Funds <b>15 people by month 18</b>: a product manager, seven engineers, three in delivery and two in sales.</span></div>
  <div class="ft"><span><img src="xelor-mark.svg" alt="">XELOR · Seed investor brief</span><b>15</b></div>
</section>
</body></html>
````

## Appendix C2. Deck render script (`deck-and-one-pager/render.mjs`)

````js
import { chromium } from 'playwright';
const f=process.argv[2]||'deck.html', out=process.argv[3]||'XELOR-Pitch-Deck.pdf';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
await p.goto('file://'+process.cwd()+'/'+f,{waitUntil:'networkidle'});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(500);
const n=await p.evaluate(()=>document.querySelectorAll('.sl').length);console.log('slides',n);
const ov=await p.evaluate(()=>[...document.querySelectorAll('.sl')].map((s,i)=>{const R=s.getBoundingClientRect();const bad=[];s.querySelectorAll('*').forEach(e=>{if(e.closest('.ft'))return;const r=e.getBoundingClientRect();if(r.width&&(r.bottom>R.bottom-70||r.right>R.right+1)&&getComputedStyle(e).position!=='absolute'&&!e.closest('.shots,.cv-shots,.scatter'))bad.push(e.tagName+'.'+e.className+' '+Math.round(r.bottom-R.top))});return (i+1)+': '+bad.slice(0,4).join(' | ')}));
console.log(ov.filter(x=>!x.endsWith(': ')).join('\n'));
const secs=await p.$$('.sl');for(let i=0;i<secs.length;i++)await secs[i].screenshot({path:`prev/s${String(i+1).padStart(2,'0')}.png`});
await p.pdf({path:out,width:'1920px',height:'1080px',printBackground:true,preferCSSPageSize:true});
await b.close();
````

## Appendix C3. HD screenshot capture script (`deck-and-one-pager/cap.mjs`)

````js
import { chromium } from 'playwright';
const url='file://'+process.cwd()+'/deck2/product.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const clean=async p=>{await p.evaluate(()=>{document.getElementById('toasts').innerHTML='';document.getElementById('overlay').innerHTML='';const i=document.querySelector('#frame .island');if(i)i.classList.remove('live');const s=document.createElement('style');s.textContent='html,body,.shell,.stage,.stagegrid,main{background:transparent!important}';document.head.appendChild(s)})};
const shot=async(p,js,file,opt={})=>{await p.evaluate(js);await p.waitForTimeout(1900);await clean(p);if(opt.scroll)await p.evaluate(s=>{const e=document.querySelector('.pmain,.abody');if(e)e.scrollTop=s},opt.scroll);await p.waitForTimeout(400);
  await p.locator('#frame').screenshot(file.endsWith('.png')?{path:'deck2/shots/'+file,omitBackground:true}:{path:'deck2/shots/'+file,type:'jpeg',quality:92})};
let p=await b.newPage({viewport:{width:1500,height:1060},deviceScaleFactor:2});
await p.goto(url);await p.waitForTimeout(500);
await shot(p,()=>{QUIET=true;ensureUpTo(4);A.arriveAll();QUIET=false;setRole('pur');go('p.home')},'erp-home.jpg');
await shot(p,()=>{go('p.net')},'erp-rank.jpg',{scroll:250});
await shot(p,()=>{QUIET=true;ensureUpTo(16);QUIET=false;go('p.pass')},'passport.jpg');
await shot(p,()=>{go('a.books')},'erp-books.jpg');
await shot(p,()=>{go('p.agent')},'erp-agent.jpg');
await shot(p,()=>{setRole('mkt');go('k.home')},'mkt-home.jpg');
await shot(p,()=>{QUIET=true;A.machineDown();A.callPro('sai');QUIET=false;go('k.help')},'mkt-help.jpg');
await shot(p,()=>{QUIET=true;ensureUpTo(19);QUIET=false;go('k.gram')},'gram-feed.jpg',{scroll:330});
await shot(p,()=>{QUIET=true;ensureUpTo(6);QUIET=false;setRole('stores');ui.dev='tablet';go('t.gate')},'erp-gate.jpg');
p=await b.newPage({viewport:{width:900,height:1100},deviceScaleFactor:2.5});
await p.goto(url);await p.waitForTimeout(500);
await shot(p,()=>{QUIET=true;ensureUpTo(5);QUIET=false;go('w.po')},'ph-owner.png');
await shot(p,()=>{S=fresh();ui=UI0();QUIET=true;ensureUpTo(3);QUIET=false;go('s.quote');A.voice();render()},'ph-supplier.png');
await shot(p,()=>{QUIET=true;ensureUpTo(18);QUIET=false;ui.glang='ta';go('s.gram')},'ph-gram-draft.png',{scroll:150});
await shot(p,()=>{QUIET=true;A.gramPost();A.gramShare('WhatsApp Status');QUIET=false;render()},'ph-gram-live.png');
await shot(p,()=>{QUIET=true;ensureUpTo(10);QUIET=false;go('m.wo')},'ph-floor.png');
await b.close();
````

## Appendix D1. Film story scenes: CSS (`film-xelor/story.css`)

````css
/* XELOR story scenes. Every value is painted by story.js from film time. */
#story{position:absolute;inset:0;width:1600px;height:900px;z-index:24;pointer-events:none;display:none;overflow:hidden;font-family:'Source Sans 3',Arial,sans-serif}
#story *{box-sizing:border-box;transition:none!important;animation:none!important}
#story .sc{position:absolute;inset:0;display:none;overflow:hidden;will-change:opacity}
#story .cam{position:absolute;inset:0;transform-origin:50% 45%}
#story .dark{background:radial-gradient(70% 80% at 85% 0%,#4a1a2c 0,transparent 60%),radial-gradient(60% 70% at 0% 100%,#3a1222 0,transparent 60%),#14070d;color:#f6ecdc}
#story .light{background:radial-gradient(60% 70% at 100% 0%,#f3e3c3 0,transparent 55%),radial-gradient(50% 60% at 0% 100%,#efdde3 0,transparent 60%),#f7f3ed;color:#231d20}
#story .grain{position:absolute;inset:0;opacity:.07;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
#story .vig{position:absolute;inset:0;background:radial-gradient(75% 75% at 50% 45%,transparent 55%,rgba(0,0,0,.55) 100%)}
#story .kick{position:absolute;font:700 17px 'JetBrains Mono',monospace;letter-spacing:3px;text-transform:uppercase;color:#e2b54a;display:flex;align-items:center;gap:14px}
#story .kick:before{content:'';width:34px;height:2px;background:currentColor;opacity:.8}
#story .light .kick{color:#7a2945}
#story .h1{position:absolute;margin:0;font:700 66px/1.05 'Bricolage Grotesque',sans-serif;letter-spacing:-2.6px}
#story .h1 em,#story .h2 em{font-style:normal;color:#e2b54a}
#story .light .h1 em,#story .light .h2 em{color:#7a2945}
#story .w{display:inline-block;will-change:transform,opacity}
#story svg.full{position:absolute;inset:0;width:1600px;height:900px;overflow:visible}
#story svg.full path{fill:none;stroke-linecap:round;stroke-linejoin:round}

/* chain */
#sc-chain .lk{stroke:#e2b54a;stroke-width:3}
#sc-chain .lkb{stroke:#ffffff14;stroke-width:3}
#sc-chain .cn{position:absolute;width:220px;margin-left:-110px;text-align:center;will-change:transform,opacity}
#sc-chain .cn .rg{width:104px;height:104px;margin:0 auto;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,#5c2238,#2a0f1a);border:2px solid #e2b54a;box-shadow:0 0 0 8px #e2b54a14,0 18px 50px #000a}
#sc-chain .cn svg{width:46px;height:46px;fill:none;stroke:#f6ecdc;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
#sc-chain .cn b{display:block;margin-top:18px;font:650 27px 'Bricolage Grotesque';letter-spacing:-.6px;color:#f6ecdc}
#sc-chain .cn small{display:block;margin-top:5px;font-size:19px;color:#cfb3bd}
#sc-chain .q{position:absolute;width:62px;height:62px;margin:-31px 0 0 -31px;border-radius:50%;background:#2a0f1a;border:2px solid #ff8f8f;color:#ffb3b3;display:grid;place-items:center;font:800 34px 'Bricolage Grotesque'}
#sc-chain .spark{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#fff6dc;box-shadow:0 0 18px 6px #e2b54aaa,0 0 50px 14px #e2b54a55}
#sc-chain .who{position:absolute;left:0;right:0;top:712px;text-align:center;font:600 italic 34px 'Source Sans 3';color:#e2b54a;letter-spacing:.2px}

/* cards shared */
#story .card{position:absolute;border-radius:22px;background:#fffdf9;border:1px solid #e3d6cb;box-shadow:0 24px 60px -24px #3a1a2580;color:#231d20;overflow:hidden;will-change:transform,opacity}
#story .dark .card{background:#22101a;border-color:#ffffff1c;color:#f6ecdc;box-shadow:0 30px 80px -20px #000c}
#story .tag{font:700 14px 'JetBrains Mono',monospace;letter-spacing:2px;text-transform:uppercase;color:#c9a14f}
#story .light .tag{color:#86600f}

/* scramble */
#sc-scramble .dir{padding:30px 32px}
#sc-scramble .dir .big{display:block;font:800 76px/1 'Bricolage Grotesque';letter-spacing:-3px;margin-top:22px;color:#f6ecdc}
#sc-scramble .dir span{display:block;font-size:22px;color:#cfb3bd;margin-top:10px}
#sc-scramble .dir .lock{position:absolute;right:28px;top:26px;width:56px;height:56px;border-radius:16px;background:#ffffff10;display:grid;place-items:center}
#sc-scramble .dir .lock svg{width:30px;height:30px;fill:none;stroke:#e2b54a;stroke-width:2}
#sc-scramble .stamp{position:absolute;left:30px;bottom:30px;padding:10px 18px;border:3px solid #ff7b7b;color:#ff9a9a;border-radius:10px;font:800 26px 'Bricolage Grotesque';letter-spacing:1px;text-transform:uppercase}
#sc-scramble .phone{position:absolute;left:620px;top:96px;width:350px;height:700px;border-radius:52px;background:#0b0508;border:2px solid #4a2f3a;box-shadow:0 40px 100px -20px #000,inset 0 0 0 9px #1a0e13;overflow:hidden;will-change:transform,opacity}
#sc-scramble .notch{position:absolute;left:50%;top:18px;width:110px;height:30px;margin-left:-55px;border-radius:20px;background:#000;z-index:3}
#sc-scramble .ph-head{position:absolute;left:9px;right:9px;top:9px;height:118px;border-radius:44px 44px 0 0;background:#1f2c27;padding:62px 22px 0;display:flex;gap:12px;align-items:center;color:#e9f5ee}
#sc-scramble .ph-head i{width:40px;height:40px;border-radius:50%;background:#4f7f6c;flex:none}
#sc-scramble .ph-head b{display:block;font:700 19px 'Source Sans 3'}#sc-scramble .ph-head small{font-size:14px;color:#a9c7b9}
#sc-scramble .ph-body{position:absolute;left:9px;right:9px;top:127px;bottom:9px;border-radius:0 0 44px 44px;background:#e9e2d6;padding:14px 14px;overflow:hidden}
#sc-scramble .msg{position:relative;max-width:82%;margin:0 0 9px;padding:9px 13px 18px;border-radius:14px;font-size:17px;line-height:1.3;color:#1d1d1d;background:#fff;box-shadow:0 1px 1px #0002;will-change:transform,opacity}
#sc-scramble .msg.me{margin-left:auto;background:#d6f5c8}
#sc-scramble .msg small{position:absolute;right:10px;bottom:3px;font-size:11px;color:#7a7a7a}
#sc-scramble .msg.sys{margin:4px auto 9px;max-width:none;width:max-content;background:#f7efd2;color:#6d5a26;font-size:14px;padding:5px 12px;border-radius:9px}
#sc-scramble .side{padding:24px 26px}
#sc-scramble .side .row{display:flex;align-items:center;gap:16px}
#sc-scramble .ic{width:54px;height:54px;border-radius:15px;display:grid;place-items:center;flex:none;background:#ffffff10}
#sc-scramble .ic svg{width:28px;height:28px;fill:none;stroke:#f6ecdc;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
#sc-scramble .side b{display:block;font:650 26px 'Bricolage Grotesque';letter-spacing:-.4px}
#sc-scramble .side span{display:block;font-size:18px;color:#cfb3bd;margin-top:3px}
#sc-scramble .cnt{margin-left:auto;font:800 46px 'Bricolage Grotesque';color:#ff8f8f}
#sc-scramble .search{margin-top:16px;height:50px;border-radius:25px;background:#fff;color:#222;display:flex;align-items:center;gap:10px;padding:0 18px;font-size:19px}
#sc-scramble .search #sc-q{display:inline;margin:0;font-size:19px;color:#222}#sc-scramble .search svg{width:20px;height:20px;stroke:#666;fill:none;stroke-width:2}
#sc-scramble .caret{display:inline-block;width:2px;height:22px;background:#1a73e8;vertical-align:-4px;margin-left:1px}
#sc-scramble .res{margin-top:12px;display:flex;flex-direction:column;gap:9px}
#sc-scramble .res div{height:16px;border-radius:8px;background:#ffffff18;position:relative}
#sc-scramble .res div em{position:absolute;left:0;top:-1px;font:700 11px 'JetBrains Mono';font-style:normal;color:#e2b54a;background:#e2b54a22;padding:1px 6px;border-radius:5px}
#sc-scramble .quote{margin-top:14px;font:500 italic 24px/1.35 'Source Sans 3';color:#f6ecdc}
#sc-scramble .map{padding:22px 24px}
#sc-scramble .map svg{position:absolute;left:0;top:0;width:440px;height:290px}
#sc-scramble .map .road{stroke:#ffffff16;stroke-width:6;fill:none;stroke-linecap:round}
#sc-scramble .map .route{stroke:#e2b54a;stroke-width:5;fill:none;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1}
#sc-scramble .map .pin{fill:#e2b54a}
#sc-scramble .map .lbl{position:absolute;font:700 16px 'Source Sans 3';color:#f6ecdc;background:#14070dcc;padding:3px 9px;border-radius:7px}
#sc-scramble .map .foot{position:absolute;left:24px;right:24px;bottom:20px;display:flex;justify-content:space-between;align-items:flex-end}
#sc-scramble .map .foot b{font:650 26px 'Bricolage Grotesque'}#sc-scramble .map .foot span{font-size:18px;color:#cfb3bd}
#sc-scramble .day{position:absolute;left:1040px;top:56px;width:460px;display:flex;align-items:center;gap:14px;font:700 18px 'JetBrains Mono';letter-spacing:2px;color:#cfb3bd}
#sc-scramble .day b{font:800 44px 'Bricolage Grotesque';letter-spacing:-1px;color:#f6ecdc}
#sc-scramble .day span{margin-left:auto;color:#ff9a9a;font-size:15px}

/* inside */
#sc-inside .win{position:absolute;width:680px;height:262px;border-radius:18px;overflow:hidden;background:#fff;color:#1f1f1f;box-shadow:0 30px 70px -20px #000d;will-change:transform,opacity}
#sc-inside .bar{height:44px;display:flex;align-items:center;gap:10px;padding:0 16px;font:600 17px 'Source Sans 3';color:#fff}
#sc-inside .bar i{width:11px;height:11px;border-radius:50%;background:#ffffff70;display:block}
#sc-inside .bar b{margin-left:8px}#sc-inside .bar span{margin-left:auto;font-weight:500;opacity:.8;font-size:15px}
#sc-inside .wb{padding:16px 20px;font-size:20px;position:relative;height:218px}
#sc-inside .w1 .bar{background:#1f6f5a}#sc-inside .w1 .wb{background:#ece5dc}
#sc-inside .w2 .bar{background:#1d6b3b}#sc-inside .w3 .bar{background:#264a7a}#sc-inside .w4 .bar{background:#7a5b2a}
#sc-inside .bub{max-width:76%;padding:10px 14px;border-radius:12px;background:#fff;margin-bottom:10px;font-size:20px}
#sc-inside .bub.me{margin-left:auto;background:#d6f5c8}
#sc-inside table{width:100%;border-collapse:collapse;font:500 18px 'Source Sans 3'}
#sc-inside td,#sc-inside th{border:1px solid #d9dde3;padding:7px 10px;text-align:left}
#sc-inside th{background:#eef2ee;color:#5b6a60;font-weight:600;font-size:15px}
#sc-inside .w3 .wb{font-family:'JetBrains Mono',monospace;font-size:17px;background:#f4f7fb;color:#22344f;line-height:1.9}
#sc-inside .w4 .wb{background:repeating-linear-gradient(#fbf6e8 0 37px,#c9d6ea 37px 38px);font:500 italic 25px/38px 'Source Sans 3';color:#2c3a6e;padding-top:4px}
#sc-inside .val{display:inline-block;min-width:48px;padding:0 6px;border-radius:6px;background:#fff1c7;font-weight:700;color:#1b1b1b;font-style:normal}
#sc-inside .val.bad{background:#ffd9d9;color:#b3261e;box-shadow:inset 0 -3px 0 #e04a3f}
#sc-inside .typer{display:inline-block;width:2px;height:22px;background:#111;vertical-align:-4px;margin-left:2px}
#sc-inside .x{position:absolute;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:#2a0f1a;border:2px solid #ff8f8f;color:#ff9a9a;display:grid;place-items:center;font:800 24px 'Bricolage Grotesque';z-index:4}
#sc-inside .cut{stroke:#ff8f8f;stroke-width:2.5;stroke-dasharray:8 10}
#sc-inside .typed{position:absolute;left:740px;top:421px;width:120px;height:120px;margin:0;border-radius:50%;background:#e2b54a;color:#2a0f1a;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:5;box-shadow:0 0 0 10px #e2b54a2a,0 20px 50px #000a}
#sc-inside .typed b{font:800 46px/1 'Bricolage Grotesque'}#sc-inside .typed small{font:700 13px 'JetBrains Mono';letter-spacing:1.5px;text-transform:uppercase}

/* cost */
#sc-cost .pan{position:absolute;top:250px;width:414px;height:350px;border-radius:26px;background:linear-gradient(160deg,#2b1220,#190a11);border:1px solid #ffffff1a;padding:36px 34px;box-shadow:0 40px 90px -20px #000;will-change:transform,opacity,filter}
#sc-cost .pan .pi{width:84px;height:84px;border-radius:22px;background:#ff7b7b1a;display:grid;place-items:center}
#sc-cost .pan .pi svg{width:46px;height:46px;fill:none;stroke:#ff9a9a;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
#sc-cost .pan b{display:block;margin-top:34px;font:700 40px/1.08 'Bricolage Grotesque';letter-spacing:-1.2px;color:#f6ecdc}
#sc-cost .pan span{display:block;margin-top:14px;font-size:22px;line-height:1.35;color:#cfb3bd}
#sc-cost .t1,#sc-cost .t2{position:absolute;left:0;right:0;text-align:center;margin:0}
#sc-cost .t1{top:330px;font:650 60px 'Bricolage Grotesque';letter-spacing:-2px;color:#f6ecdc}
#sc-cost .t2{top:430px;font:750 88px/1.05 'Bricolage Grotesque';letter-spacing:-3.4px;color:#fff}
#sc-cost .t2 em{font-style:normal;color:#e2b54a;position:relative}
#sc-cost .ul{position:absolute;height:6px;border-radius:3px;background:#e2b54a;transform-origin:0 50%}

/* reveal / close */
#sc-reveal .pt,#sc-close .pt{position:absolute;border-radius:50%;background:#f3d27e;will-change:transform,opacity}
#story .lock{position:absolute;display:flex;align-items:center;gap:34px}
#story .lock svg.mk{flex:none;overflow:visible}
#story .lock .wm{font:750 150px/1 'Bricolage Grotesque';letter-spacing:-8px;color:#f6ecdc;display:flex}
#story .lock .wm span{display:inline-block;will-change:transform,opacity}
#story .h2{position:absolute;left:0;right:0;text-align:center;margin:0;font:600 56px/1.12 'Bricolage Grotesque';letter-spacing:-1.8px;color:#f6ecdc}
#story .sweep{position:absolute;top:0;bottom:0;width:260px;background:linear-gradient(100deg,transparent,#ffffff2e,transparent);mix-blend-mode:screen}
#story .glow{position:absolute;left:50%;top:44%;width:1200px;height:1200px;margin:-600px 0 0 -600px;border-radius:50%;background:radial-gradient(circle,#8f3354aa 0,#5c1f3655 35%,transparent 65%)}

/* network */
#sc-network .nl{stroke:#c9ab83;stroke-width:2.6}
#sc-network .nl.gold{stroke:#c89a2e;stroke-width:6}
#sc-network .nl.rfq{stroke:#7a2945;stroke-width:2.2;stroke-dasharray:7 9}
#sc-network .nl.sm{stroke:#cdb79c;stroke-width:1.6}
#sc-network .nd{position:absolute;display:flex;flex-direction:column;align-items:center;width:240px;margin-left:-120px;text-align:center;will-change:transform,opacity}
#sc-network .nd .o{width:88px;height:88px;border-radius:50%;background:#fff;border:2px solid #d8c4ad;display:grid;place-items:center;box-shadow:0 14px 34px -12px #5b3d2560;position:relative}
#sc-network .nd.k .o{width:122px;height:122px;background:linear-gradient(145deg,#a3456a,#7a2945 55%,#4e1730);border:0}
#sc-network .nd .o svg{width:40px;height:40px;fill:none;stroke:#7a2945;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
#sc-network .nd.k .o svg{width:56px;height:56px;stroke:#fff}
#sc-network .nd b{display:block;margin-top:10px;font:650 22px 'Bricolage Grotesque';letter-spacing:-.4px;white-space:nowrap}
#sc-network .nd small{font-size:17px;color:#7d6a5c;white-space:nowrap}
#sc-network .nd .bd{position:absolute;right:-14px;top:-10px;padding:4px 10px;border-radius:999px;background:#1b6a48;color:#fff;font:700 14px 'Source Sans 3';white-space:nowrap}
#sc-network .nd .bd.g{background:#c89a2e;color:#2a0f1a}
#sc-network .nd .ring{position:absolute;inset:-9px;width:calc(100% + 18px);height:calc(100% + 18px)}
#sc-network .nd .ring circle{fill:none;stroke-width:5;stroke-linecap:round}
#sc-network .dot{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#7a2945;box-shadow:0 0 0 5px #7a294522}
#sc-network .truck{position:absolute;width:52px;height:36px;margin:-18px 0 0 -26px;border-radius:9px;background:#c89a2e;display:grid;place-items:center;box-shadow:0 8px 20px #5b3d2550}
#sc-network .truck svg{width:30px;height:30px;fill:none;stroke:#2a0f1a;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
#sc-network .tiny{position:absolute;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:#fff;border:2px solid #c9ab83}
#sc-network .tiny.g{border-color:#7a2945;background:#f6e8ed}
#sc-network .hd{position:absolute;left:90px;top:96px;width:1000px;margin:0;font:700 52px/1.06 'Bricolage Grotesque';letter-spacing:-2px;color:#231d20}
#sc-network .hd em{font-style:normal;color:#7a2945}
#sc-network .pnl{position:absolute;left:1100px;top:210px;width:410px;padding:26px 28px;border-radius:24px;background:#fffdf9;border:1px solid #e3d6cb;box-shadow:0 30px 70px -30px #3a1a2580;will-change:transform,opacity}
#sc-network .pnl h3{margin:8px 0 0;font:700 30px/1.1 'Bricolage Grotesque';letter-spacing:-.8px}
#sc-network .pnl p{margin:10px 0 0;font-size:19px;line-height:1.35;color:#6f5f58}
#sc-network .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:18px}
#sc-network .stats div{border-radius:14px;background:#f6efe4;padding:14px 10px;text-align:center}
#sc-network .stats b{display:block;font:800 34px 'Bricolage Grotesque';letter-spacing:-1px;color:#7a2945}
#sc-network .stats span{font-size:15px;color:#6f5f58}
#sc-network .rk{margin-top:16px;display:flex;flex-direction:column;gap:12px}
#sc-network .rk div{display:grid;grid-template-columns:1fr 120px;gap:10px;align-items:center;font:600 18px 'Source Sans 3'}
#sc-network .rk i{display:block;height:12px;border-radius:6px;background:#e5d8c8;position:relative;overflow:hidden}
#sc-network .rk i u{position:absolute;left:0;top:0;bottom:0;background:#b7a28b;border-radius:6px}
#sc-network .rk .top i u{background:#c89a2e}
#sc-network .rk .top{color:#7a2945}
#sc-network .scan{position:absolute;left:0;right:0;height:3px;background:#1b6a48;box-shadow:0 0 14px #1b6a48}
#sc-network .big{font:750 46px/1.05 'Bricolage Grotesque';letter-spacing:-1.6px;color:#231d20;margin-top:6px}
#sc-network .big em{font-style:normal;color:#7a2945}
#sc-network .demo{position:absolute;left:1100px;top:765px;font:600 13px 'JetBrains Mono';letter-spacing:1.5px;color:#9b8a80;text-transform:uppercase}

/* three products */
#sc-three .pc{position:absolute;border-radius:26px;background:#fffdf9;border:1px solid #e3d6cb;box-shadow:0 30px 70px -30px #3a1a2580;overflow:hidden;will-change:transform,opacity}
#sc-three .pc .im{height:236px;overflow:hidden;background:linear-gradient(160deg,#f6e8ed,#f8efd9);position:relative;border-bottom:1px solid #eadfd5}
#sc-three .pc .im img{width:100%;display:block}
#sc-three .pc .im img.ph{width:150px;margin:18px auto 0;border-radius:18px;box-shadow:0 14px 30px -10px #3a1a2590}
#sc-three .pc .bd{padding:22px 26px}
#sc-three .pc b{display:block;font:750 36px 'Bricolage Grotesque';letter-spacing:-1.2px;margin-top:6px}
#sc-three .pc p{margin:8px 0 0;font-size:21px;line-height:1.35;color:#6f5f58}
#sc-three .pc.f{border:2.5px solid #7a2945;box-shadow:0 40px 90px -30px #7a294580}
#sc-three .flag{position:absolute;right:18px;top:18px;padding:7px 14px;border-radius:999px;background:#7a2945;color:#fff;font:700 14px 'JetBrains Mono';letter-spacing:2px;z-index:2}
#sc-three .pill{position:absolute;left:620px;top:752px;width:360px;height:52px;border-radius:26px;background:#2a0f1a;color:#f6ecdc;display:flex;align-items:center;justify-content:center;gap:12px;font:700 20px 'Source Sans 3';letter-spacing:.3px}
#sc-three .pill i{width:12px;height:12px;border-radius:50%;background:#e2b54a;box-shadow:0 0 12px #e2b54a}
#sc-three .cl{stroke:#c89a2e;stroke-width:2.5;stroke-dasharray:6 8}
#sc-three .h1{left:0;right:0;text-align:center;top:76px;font-size:58px}

/* price */
#sc-price .chart{position:absolute;left:100px;top:200px;width:720px;height:560px}
#sc-price .bar{position:absolute;bottom:120px;width:230px;border-radius:18px 18px 6px 6px;transform-origin:50% 100%}
#sc-price .bar.a{left:70px;height:400px;background:repeating-linear-gradient(135deg,#d9cfc6 0 14px,#d2c6bc 14px 28px)}
#sc-price .bar.b{left:410px;height:40px;background:linear-gradient(180deg,#c89a2e,#7a2945)}
#sc-price .val{position:absolute;width:300px;text-align:center;font:800 54px 'Bricolage Grotesque';letter-spacing:-2px}
#sc-price .val small{display:block;font:600 18px 'Source Sans 3';letter-spacing:0;color:#6f5f58}
#sc-price .cap{position:absolute;bottom:0;width:300px;text-align:center;font:600 21px/1.3 'Source Sans 3';color:#4f4048}
#sc-price .base{position:absolute;left:30px;right:60px;bottom:118px;height:2px;background:#cdbfb3}
#sc-price .free{position:absolute;left:418px;padding:9px 16px;border-radius:999px;background:#1b6a48;color:#fff;font:700 19px 'Source Sans 3'}
#sc-price .pts{position:absolute;left:900px;top:250px;width:600px;display:flex;flex-direction:column;gap:22px}
#sc-price .pt2{display:flex;gap:20px;align-items:flex-start;padding:22px 24px;border-radius:20px;background:#fffdf9;border:1px solid #e3d6cb;box-shadow:0 20px 50px -30px #3a1a2580;will-change:transform,opacity}
#sc-price .pt2 i{width:52px;height:52px;border-radius:15px;background:#f6e8ed;display:grid;place-items:center;flex:none}
#sc-price .pt2 i svg{width:28px;height:28px;fill:none;stroke:#7a2945;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
#sc-price .pt2 b{display:block;font:700 28px 'Bricolage Grotesque';letter-spacing:-.6px}
#sc-price .pt2 span{display:block;font-size:20px;color:#6f5f58;margin-top:3px}

/* close */
#sc-close .chips{position:absolute;left:0;right:0;top:640px;display:flex;justify-content:center;gap:16px}
#sc-close .chip{padding:14px 26px;border-radius:999px;border:1.5px solid #e2b54a77;color:#f6ecdc;font:650 25px 'Bricolage Grotesque';letter-spacing:-.3px;background:#ffffff08;will-change:transform,opacity}
#sc-close .chip.f{background:#e2b54a;color:#2a0f1a;border-color:#e2b54a}
#sc-close .foot{position:absolute;left:0;right:0;top:738px;text-align:center;font:600 18px 'JetBrains Mono';letter-spacing:3px;text-transform:uppercase;color:#cfb3bd}
#sc-close .k2{position:absolute;left:0;right:0;text-align:center;font:600 50px 'Bricolage Grotesque';letter-spacing:-1.4px;color:#e2b54a}

/* subtitles over full-bleed story scenes */
.story-on .subtitle-band{background:linear-gradient(transparent,#0008)!important}
.story-on.story-light .subtitle-band{background:linear-gradient(transparent,#2a0f1acc)!important}
.story-on #subtitle{text-shadow:0 2px 12px #000c}
.story-on #progressline{opacity:.7}
````

## Appendix D2. Film story scenes: markup (`film-xelor/story.html`)

````html
<div id="story" aria-hidden="true">
<!-- 1-2 · chain, then the guessing game -->
<section class="sc dark" id="sc-chain"><div class="cam">
 <div class="kick" style="left:110px;top:92px">Made in India</div>
 <h1 class="h1 words" id="ch-h1" style="left:110px;top:134px">Behind almost every product<br>is a <em>chain of small factories.</em></h1>
 <h1 class="h1 words" id="ch-h2" style="left:110px;top:134px">Finding the right supplier<br>is still a <em>guessing game.</em></h1>
 <svg class="full" viewBox="0 0 1600 900"><g id="ch-links"></g></svg>
 <div id="ch-nodes"></div>
 <div class="spark" id="ch-spark"></div>
 <div class="who" id="ch-who">Who actually delivers?</div>
</div><div class="grain"></div><div class="vig"></div></section>

<!-- 3 · how suppliers are found today -->
<section class="sc dark" id="sc-scramble"><div class="cam">
 <div class="kick" style="left:100px;top:66px">How factories find suppliers today</div>
 <div class="day" id="sc-day">DAY <b id="sc-dayn">1</b><span id="sc-dayt">STILL NO DECISION</span></div>
 <div class="card dir" id="sc-dir" style="left:100px;top:140px;width:450px;height:310px">
  <div class="tag">Paid business directory</div>
  <b class="big">₹32,000+</b><span>a year, for a typical paid listing</span>
  <div class="lock"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div>
  <div class="stamp" id="sc-stamp">Out of reach</div>
 </div>
 <div class="card map" id="sc-map" style="left:100px;top:476px;width:450px;height:300px">
  <svg viewBox="0 0 450 300"><path class="road" d="M-10 90 C120 70 200 140 460 110"/><path class="road" d="M80 -10 C110 120 60 200 120 310"/><path class="road" d="M260 -10 C240 120 330 200 300 310"/><path class="road" d="M-10 220 C140 240 300 190 460 230"/>
   <path class="route" id="sc-route" pathLength="1" d="M70 60 C150 70 170 150 240 160 S 340 200 390 228"/><circle class="pin" cx="70" cy="60" r="9"/><circle class="pin" id="sc-pin2" cx="390" cy="228" r="9"/></svg>
  <div class="lbl" style="left:40px;top:22px">Peenya</div><div class="lbl" id="sc-hosur" style="left:330px;top:180px">Hosur</div>
  <div class="foot"><div><div class="tag">Site visit</div><b>2 h 40 m each way</b></div><span id="sc-visit">Visit 3 · still unsure</span></div>
 </div>
 <div class="phone" id="sc-phone"><div class="notch"></div>
  <div class="ph-head"><i></i><div><b>Casting suppliers</b><small>Ramesh, Suresh, Anil, +4</small></div></div>
  <div class="ph-body" id="sc-msgs">
   <div class="msg me">Need 60 pump body castings, GG25. Rate?<small>10:02</small></div>
   <div class="msg">Who is this?<small>11:40</small></div>
   <div class="msg me">Got your number from Suresh.<small>11:41</small></div>
   <div class="msg">Send drawing.<small>14:15</small></div>
   <div class="msg me">📎 Drawing_GG25.pdf<small>14:16</small></div>
   <div class="msg">Will check and tell.<small>Tue</small></div>
   <div class="msg sys">Day 6</div>
   <div class="msg me">Any update on the rate??<small>Mon</small></div>
   <div class="msg me">Please confirm by Friday 🙏<small>Wed</small></div>
  </div>
 </div>
 <div class="card side" id="sc-calls" style="left:1040px;top:140px;width:460px;height:130px"><div class="row"><div class="ic" style="background:#ff7b7b22"><svg viewBox="0 0 24 24" style="stroke:#ff9a9a"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/><path d="m15 3 6 6M21 3l-6 6"/></svg></div><div><b>Missed calls</b><span>“Busy now, call later”</span></div><div class="cnt" id="sc-cnt">×0</div></div></div>
 <div class="card side" id="sc-search" style="left:1040px;top:292px;width:460px;height:210px"><div class="row"><div class="ic"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></div><div><b>Search online</b><span>Lots of names. No track record.</span></div></div>
  <div class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><span id="sc-q"></span><i class="caret" id="sc-caret"></i></div>
  <div class="res" id="sc-res"><div style="width:92%"><em>AD</em></div><div style="width:74%"><em>AD</em></div><div style="width:84%"></div></div></div>
 <div class="card side" id="sc-ref" style="left:1040px;top:524px;width:460px;height:170px"><div class="tag">Reference</div><div class="quote">“Ask Raju. His cousin knows a good foundry.”</div></div>
</div><div class="grain"></div><div class="vig"></div></section>

<!-- 4 · inside the factory -->
<section class="sc dark" id="sc-inside"><div class="cam">
 <div class="kick" style="left:100px;top:66px">Inside the factory</div>
 <h1 class="h1" id="in-h1" style="left:100px;top:100px;font-size:50px;letter-spacing:-1.8px">Four tools. <em>None of them talk.</em></h1>
 <h1 class="h1" id="in-h2" style="left:100px;top:100px;font-size:50px;letter-spacing:-1.8px">The same details. <em>Typed again. And again.</em></h1>
 <svg class="full" viewBox="0 0 1600 900"><path class="cut" id="in-c0" d="M780 330 L820 330"/><path class="cut" id="in-c1" d="M440 472 L440 500"/><path class="cut" id="in-c2" d="M1160 472 L1160 500"/><path class="cut" id="in-c3" d="M780 620 L820 620"/></svg>
 <div class="win w1" id="in-w0" style="left:100px;top:200px"><div class="bar"><i></i><i></i><i></i><b>WhatsApp</b><span>Orders · customer chat</span></div><div class="wb"><div class="bub">Can you do 80 pumps by Friday?</div><div class="bub me">Yes. Need <span class="val" data-v="60">60</span> castings first.</div></div></div>
 <div class="win w2" id="in-w1" style="left:820px;top:200px"><div class="bar"><i></i><i></i><i></i><b>Excel</b><span>Stock_final_v3.xlsx</span></div><div class="wb"><table><tr><th>Item</th><th>In stock</th><th>Needed</th><th>To buy</th></tr><tr><td>Body casting GG25</td><td>20</td><td>80</td><td><span class="val" data-v="60">60</span></td></tr><tr><td>Impeller SS304</td><td>140</td><td>80</td><td>—</td></tr><tr><td>Bearing 6206</td><td>210</td><td>160</td><td>—</td></tr></table></div></div>
 <div class="win w3" id="in-w2" style="left:100px;top:500px"><div class="bar"><i></i><i></i><i></i><b>Tally</b><span>Accounts · purchase voucher</span></div><div class="wb">Party&nbsp;&nbsp;: Sri Ganesh Castings<br>Item&nbsp;&nbsp;&nbsp;: Body casting GG25<br>Qty&nbsp;&nbsp;&nbsp;&nbsp;: <span class="val" data-v="06" data-bad="1">60</span> nos<br>Amount : ₹1,65,600</div></div>
 <div class="win w4" id="in-w3" style="left:820px;top:500px"><div class="bar"><i></i><i></i><i></i><b>Paper register</b><span>Quality · incoming check</span></div><div class="wb">9 Oct · castings recd <span class="val" data-v="66?" data-bad="1">60</span><br>2 rejected · porosity<br>checked by — R.K.</div></div>
 <div class="x" id="in-x0" style="left:800px;top:330px">✕</div><div class="x" id="in-x1" style="left:440px;top:486px">✕</div><div class="x" id="in-x2" style="left:1160px;top:486px">✕</div><div class="x" id="in-x3" style="left:800px;top:620px">✕</div>
 <div class="typed" id="in-typed"><small>typed</small><b id="in-tn">×1</b></div>
</div><div class="grain"></div><div class="vig"></div></section>

<!-- 5 · the cost -->
<section class="sc dark" id="sc-cost"><div class="cam">
 <div class="pan" id="co-p0" style="left:100px"><div class="pi"><svg viewBox="0 0 24 24"><path d="M3 21V10l5-3v3l5-3v3h8v11z"/><path d="M8 15h2M14 15h2M10 3l4 4M14 3l-4 4"/></svg></div><b>Lines stop.</b><span>The whole order waits for one missing part.</span></div>
 <div class="pan" id="co-p1" style="left:593px"><div class="pi"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg></div><b>Rejects surface late.</b><span>Bad parts are found after they are used.</span></div>
 <div class="pan" id="co-p2" style="left:1086px"><div class="pi"><svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></svg></div><b>Good suppliers stay invisible.</b><span>Their best work leaves no record.</span></div>
 <h2 class="t1" id="co-t1">Everything is scattered.</h2>
 <h2 class="t2 words" id="co-t2">Nobody can see<br><em id="co-em">who actually delivers.</em></h2>
 <div class="ul" id="co-ul"></div>
</div><div class="grain"></div><div class="vig"></div></section>

<!-- 6 · reveal -->
<section class="sc dark" id="sc-reveal"><div class="glow" id="rv-glow"></div><div class="cam">
 <div id="rv-pts"></div>
 <div class="lock" id="rv-lock" style="left:0;top:250px">
  <svg class="mk" id="rv-mk" viewBox="0 0 64 64" width="190" height="190"><defs><linearGradient id="rvg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a3456a"/><stop offset=".55" stop-color="#7a2945"/><stop offset="1" stop-color="#4e1730"/></linearGradient><mask id="rvm"><rect width="64" height="64" fill="#fff"/><path d="M14 36 24 46 50 16" stroke="#000" stroke-width="12.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></mask></defs><rect id="rv-tile" width="64" height="64" rx="16" fill="url(#rvg)"/><path id="rv-s1" pathLength="1" d="M19 17 45 47" stroke="#f6ecdc" stroke-width="7" stroke-linecap="round" fill="none" mask="url(#rvm)"/><path id="rv-s2" pathLength="1" d="M14 36 24 46 50 16" fill="none" stroke="#e2b54a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>
  <div class="wm" id="rv-wm"><span>X</span><span>E</span><span>L</span><span>O</span><span>R</span></div>
 </div>
 <h2 class="h2 words" id="rv-tag" style="top:520px">The trusted network behind<br><em>what India manufactures.</em></h2>
 <div class="sweep" id="rv-sweep"></div>
</div><div class="grain"></div><div class="vig"></div></section>

<!-- 7 · how the network works -->
<section class="sc light" id="sc-network"><div class="cam" id="nw-cam">
 <div class="kick" style="left:90px;top:58px">How the XELOR network works</div>
 <h2 class="hd" id="nw-h0">Every delivery is counted <em>at the gate.</em></h2>
 <h2 class="hd" id="nw-h1">Every supplier earns <em>a real record.</em></h2>
 <h2 class="hd" id="nw-h2">Factories choose <em>on that record.</em></h2>
 <h2 class="hd" id="nw-h3">Every request <em>invites a new supplier.</em></h2>
 <h2 class="hd" id="nw-h4">The network grows <em>with every order.</em></h2>
 <svg class="full" viewBox="0 0 1600 900"><g id="nw-grow"></g><g id="nw-links"></g></svg>
 <div id="nw-tiny"></div>
 <div id="nw-nodes"></div>
 <div class="truck" id="nw-truck"><svg viewBox="0 0 24 24"><path d="M2 7h11v9H2zM13 10h4l3 3v3h-7z"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/></svg></div>
 <div id="nw-dots"></div>
</div>
 <div class="pnl" id="nw-p0"><div class="tag">Gate receipt · Kaveri Pumps</div><h3>60 of 60 castings received</h3><p>Scanned at the gate, 9 Oct. On time. Linked to the purchase order.</p><div style="position:relative;height:70px;margin-top:14px;border-radius:12px;background:#f6efe4;overflow:hidden"><div class="scan" id="nw-scan"></div><div style="position:absolute;left:18px;top:20px;font:700 22px 'JetBrains Mono';letter-spacing:2px;color:#4f4048">GRN-2627-1195</div></div></div>
 <div class="pnl" id="nw-p1"><div class="tag">Supplier record</div><h3>Sri Ganesh Castings</h3><div class="stats"><div><b id="nw-s0">0%</b><span>on time</span></div><div><b id="nw-s1">0%</b><span>rejected</span></div><div><b id="nw-s2">0</b><span>deliveries</span></div></div><p>Counted from receipts and inspections. Never typed.</p></div>
 <div class="pnl" id="nw-p2"><div class="tag">Quotes for 60 castings</div><h3>Ranked on price, date and record</h3><div class="rk"><div class="top"><span>Sri Ganesh Castings ✓</span><i><u id="nw-r0"></u></i></div><div><span>Anand Engineering</span><i><u id="nw-r1"></u></i></div><div><span>Veerabhadra Castings</span><i><u id="nw-r2"></u></i></div></div><p>A person makes the final choice.</p></div>
 <div class="pnl" id="nw-p3"><div class="tag">Invitation · from a request</div><h3>Meenakshi Foundry joins free</h3><p>Quotes from a link. No login, no app. Then brings its own buyers onto XELOR.</p></div>
 <div class="pnl" id="nw-p4"><div class="tag">The flywheel</div><div class="big">More orders.<br>More records.<br><em>More trust.</em></div></div>
 <div class="demo">Demonstration data</div>
</section>

<!-- 8 · three products -->
<section class="sc light" id="sc-three"><div class="cam">
 <h1 class="h1 words" id="th-h1">One trusted record. <em>Three products.</em></h1>
 <svg class="full" viewBox="0 0 1600 900"><path class="cl" id="th-c0" pathLength="1" d="M760 752 C 560 740 330 760 320 712"/><path class="cl" id="th-c1" pathLength="1" d="M800 752 L800 722"/><path class="cl" id="th-c2" pathLength="1" d="M840 752 C 1040 740 1270 760 1280 712"/></svg>
 <div class="pc" id="th-g" style="left:110px;top:236px;width:420px;height:476px"><div class="im"><img class="ph" src="{{IMG_GRAM}}" alt=""></div><div class="bd"><div class="tag">Get found</div><b>Xelogram</b><p>Verified work becomes posts that bring the next order.</p></div></div>
 <div class="pc f" id="th-m" style="left:575px;top:196px;width:450px;height:526px"><span class="flag">FLAGSHIP</span><div class="im" style="height:262px"><img src="{{IMG_MKT}}" alt=""></div><div class="bd"><div class="tag">Find &amp; connect</div><b>XELOR Market</b><p>Suppliers, buyers and local help. See the record before you call.</p></div></div>
 <div class="pc" id="th-e" style="left:1070px;top:236px;width:420px;height:476px"><div class="im"><img src="{{IMG_ERP}}" alt=""></div><div class="bd"><div class="tag">The engine</div><b>Agentic AI ERP</b><p>Runs the daily work and writes every record by itself.</p></div></div>
 <div class="pill" id="th-pill"><i></i>One trusted record</div>
</div></section>

<!-- 9 · pricing -->
<section class="sc light" id="sc-price"><div class="cam">
 <div class="kick" style="left:100px;top:70px">XELOR Market · listing</div>
 <h1 class="h1 words" id="pr-h1" style="left:100px;top:108px;font-size:56px;letter-spacing:-2px">Get found, <em>without the directory bill.</em></h1>
 <div class="chart">
  <div class="base"></div>
  <div class="bar a" id="pr-a"></div><div class="bar b" id="pr-b"></div>
  <div class="val" id="pr-va" style="left:35px">₹32,000+<small>a year</small></div>
  <div class="val" id="pr-vb" style="left:375px;color:#7a2945">₹249<small>a month · after a free start</small></div>
  <div class="free" id="pr-free">Free to start</div>
  <div class="cap" style="left:35px">Typical paid directory listing</div>
  <div class="cap" style="left:375px;color:#7a2945;font-weight:700">XELOR Market listing</div>
 </div>
 <div class="pts">
  <div class="pt2" id="pr-p0"><i><svg viewBox="0 0 24 24"><path d="M8 12h8M5 8l-3 4 3 4M19 8l3 4-3 4"/></svg></i><div><b>We only connect.</b><span>Buyers and sellers talk and deal directly.</span></div></div>
  <div class="pt2" id="pr-p1"><i><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M3 3l18 18"/></svg></i><div><b>XELOR never touches the money.</b><span>Payments go straight between the two businesses.</span></div></div>
  <div class="pt2" id="pr-p2"><i><svg viewBox="0 0 24 24"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="m9 12 2 2 4-4"/></svg></i><div><b>No lead reselling.</b><span>Each request reaches five sellers at most.</span></div></div>
 </div>
</div></section>

<!-- 10 · close -->
<section class="sc dark" id="sc-close"><div class="glow" id="cl-glow"></div><div class="cam">
 <div id="cl-pts"></div>
 <div class="k2" id="cl-k">Every delivery builds trust.</div>
 <div class="lock" id="cl-lock" style="left:0;top:250px">
  <svg class="mk" id="cl-mk" viewBox="0 0 64 64" width="150" height="150"><defs><linearGradient id="clg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a3456a"/><stop offset=".55" stop-color="#7a2945"/><stop offset="1" stop-color="#4e1730"/></linearGradient><mask id="clm"><rect width="64" height="64" fill="#fff"/><path d="M14 36 24 46 50 16" stroke="#000" stroke-width="12.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></mask></defs><rect id="cl-tile" width="64" height="64" rx="16" fill="url(#clg)"/><path id="cl-s1" pathLength="1" d="M19 17 45 47" stroke="#f6ecdc" stroke-width="7" stroke-linecap="round" fill="none" mask="url(#clm)"/><path id="cl-s2" pathLength="1" d="M14 36 24 46 50 16" fill="none" stroke="#e2b54a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>
  <div class="wm" id="cl-wm" style="font-size:120px;letter-spacing:-6px"><span>X</span><span>E</span><span>L</span><span>O</span><span>R</span></div>
 </div>
 <h2 class="h2 words" id="cl-tag" style="top:470px">The trusted network behind<br><em>what India manufactures.</em></h2>
 <div class="chips"><span class="chip f" id="cl-c0">XELOR Market</span><span class="chip" id="cl-c1">Xelogram</span><span class="chip" id="cl-c2">Agentic AI ERP</span></div>
 <div class="foot" id="cl-foot">Starting in Peenya, Bengaluru</div>
</div><div class="grain"></div><div class="vig"></div></section>
</div>
````

## Appendix D3. Film story scenes: engine (`film-xelor/story.js`)

````js
/* XELOR story scenes: problem, turn, network, products, pricing and close.
 * Deterministic: every style is a pure function of film time, so seeking
 * and frame-by-frame export give identical frames. No timers or CSS animation.
 */
(function(global){
'use strict';
const cl=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const P=(t,s,d)=>cl((t-s)/d);
const eo=x=>1-Math.pow(1-x,3);
const eo5=x=>1-Math.pow(1-x,5);
const eio=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
const eb=x=>{const c1=1.45,c3=c1+1;return x<=0?0:x>=1?1:1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2);};
const f=n=>Math.round(n*100)/100;
function rng(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
const ICON={
 raw:'<path d="M3 17l4-8 4 5 3-3 7 6zM3 20h18"/>',
 foundry:'<path d="M4 20V11l5 3V9l5 3V6h4l2 14z"/><path d="M15 3c1 1 1 2 0 3"/>',
 gear:'<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M4.2 6.5l2.3 1.6M17.5 15.9l2.3 1.6M4.2 17.5l2.3-1.6M17.5 8.1l2.3-1.6"/><circle cx="12" cy="12" r="7"/>',
 spray:'<path d="M8 9h7v11H8zM9 9V6h5v3M17 5h2M17 8h3M17 11h2"/>',
 build:'<path d="M3 21h18M6 21V10l6-5 6 5v11"/><path d="M10 21v-6h4v6"/>',
 factory:'<path d="M3 21V11l6-4v4l6-4v4h6v10z"/><path d="M7 16h2M12 16h2M17 16h1"/>',
 box:'<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>'
};
const svgI=k=>`<svg viewBox="0 0 24 24">${ICON[k]}</svg>`;

function install(doc,TL){
 const $=id=>doc.getElementById(id);
 const root=$('story'),stage=$('stage');if(!root)return{paint(){}};
 const S=TL.story;
 const DOM={chain:'sc-chain',guess:'sc-chain',scramble:'sc-scramble',inside:'sc-inside',cost:'sc-cost',reveal:'sc-reveal',network:'sc-network',three:'sc-three',price:'sc-price',close:'sc-close'};
 const win={};for(const [sid,id] of Object.entries(DOM)){if(!S[sid])continue;const w=win[id]||(win[id]={start:1e9,end:-1});w.start=Math.min(w.start,S[sid].t);w.end=Math.max(w.end,S[sid].end);}
 const C=sid=>S[sid]?S[sid].cues:[0,0,0,0,0,0];
 const E=sid=>S[sid]?S[sid].ends:[0,0,0,0,0,0];

 // split words
 doc.querySelectorAll('#story .words').forEach(el=>{
  const walk=node=>{[...node.childNodes].forEach(ch=>{
   if(ch.nodeType===3){const parts=ch.textContent.split(/(\s+)/);const frag=doc.createDocumentFragment();
    parts.forEach(p=>{if(!p)return;if(/^\s+$/.test(p))frag.appendChild(doc.createTextNode(p));else{const s=doc.createElement('span');s.className='w';s.textContent=p;frag.appendChild(s);}});
    node.replaceChild(frag,ch);}
   else if(ch.nodeType===1&&ch.tagName!=='BR')walk(ch);});};
  walk(el);});
 const W=el=>[...el.querySelectorAll('.w')];
 function op(el,o){el.style.opacity=String(f(o));}
 function words(el,t,start,stg=.075,dur=.6,dy=28){W(el).forEach((w,i)=>{const p=eo(P(t,start+i*stg,dur));w.style.opacity=f(p);w.style.transform=`translate3d(0,${f(dy*(1-p))}px,0)`;w.style.filter=p<1?`blur(${f(7*(1-p))}px)`:'none';});}
 function enter(el,t,at,dur=.6,o={}){const p=(o.back?eb:eo)(P(t,at,dur));const q=cl(P(t,at,dur)*1.6);op(el,o.keep?Math.min(q,o.keep):q);
  const dx=(o.dx||0)*(1-p),dy=(o.dy??24)*(1-p),s=o.s0!=null?o.s0+(1-o.s0)*p:1,r=(o.r||0)*(1-p);
  el.style.transform=`translate3d(${f(dx)}px,${f(dy)}px,0) scale(${f(s)}) rotate(${f(r)}deg)`;return p;}
 function draw(path,p){path.setAttribute('stroke-dasharray','1 1');path.setAttribute('stroke-dashoffset',String(f(1-p)));}

 /* ---------- chain ---------- */
 const CH=[{x:180,y:520,b:'Raw material',s:'Steel and scrap',i:'raw'},{x:432,y:466,b:'Foundry',s:'Castings',i:'foundry'},{x:684,y:520,b:'Machine shop',s:'Precision parts',i:'gear'},{x:936,y:466,b:'Coating unit',s:'Finish and protection',i:'spray'},{x:1188,y:520,b:'Assembler',s:'Sub-assemblies',i:'build'},{x:1420,y:466,b:'Manufacturer',s:'The product you buy',i:'box'}];
 const chNodes=$('ch-nodes'),chLinks=$('ch-links');
 CH.forEach((n,i)=>{const d=doc.createElement('div');d.className='cn';d.style.left=n.x+'px';d.style.top=n.y+'px';d.innerHTML=`<div class="rg">${svgI(n.i)}</div><b>${n.b}</b><small>${n.s}</small>`;chNodes.appendChild(d);n.el=d;n.rg=d.querySelector('.rg');});
 const chL=[];for(let i=0;i<CH.length-1;i++){const a=CH[i],b=CH[i+1],ay=a.y+52,by=b.y+52,mx=(a.x+b.x)/2;const dd=`M ${a.x+58} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${b.x-58} ${by}`;
  const base=doc.createElementNS('http://www.w3.org/2000/svg','path');base.setAttribute('d',dd);base.setAttribute('class','lkb');
  const p=doc.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',dd);p.setAttribute('class','lk');p.setAttribute('pathLength','1');
  chLinks.append(base,p);const len=p.getTotalLength();const mid=p.getPointAtLength(len/2);
  const q=doc.createElement('div');q.className='q';q.textContent='?';q.style.left=mid.x+'px';q.style.top=mid.y+'px';$('sc-chain').querySelector('.cam').appendChild(q);
  chL.push({p,len,q,base});}
 const RND=rng(7);const drift=CH.map(()=>({x:(RND()-.5)*60,y:(RND()-.5)*70,r:(RND()-.5)*16}));
 function paintChain(t){
  const [c0,c1]=C('chain'),[g0]=C('guess'),gEnd=S.guess?S.guess.end:0;
  const cam=$('sc-chain').querySelector('.cam');cam.style.transform=`scale(${f(1+.035*P(t,0,gEnd))})`;
  enter($('sc-chain').querySelector('.kick'),t,.25,.6,{dy:10});
  // headline 1, then out at g0
  const h1=$('ch-h1'),h2=$('ch-h2');
  words(h1,t,c0-.1,.09,.65);const out=eo(P(t,g0-.15,.45));h1.style.opacity=f(1-out);h1.style.transform=`translate3d(0,${f(-26*out)}px,0)`;
  h2.style.opacity=t>=g0?1:0;words(h2,t,g0+.1,.085,.6);
  const nt=[c0+1.4,c1-.05,c1+.8,c1+1.7,c1+2.55,c1+3.25];
  const lt=[c0+1.9,c1+.35,c1+1.2,c1+2.1,c1+2.9];
  const brk=g0+2.55,bp=eio(P(t,brk,.9));
  CH.forEach((n,i)=>{const p=eb(P(t,nt[i],.7));op(n.el,cl(P(t,nt[i],.4)));
   const d=drift[i];n.el.style.transform=`translate3d(${f(d.x*bp)}px,${f(26*(1-p)+d.y*bp)}px,0) scale(${f(.7+.3*p)}) rotate(${f(d.r*bp)}deg)`;
   const glow=Math.max(0,1-P(t,nt[i]+.2,1.2));n.rg.style.boxShadow=`0 0 0 ${f(8+22*glow)}px rgba(226,181,74,${f(.08+.25*glow)}),0 18px 50px #000a`;
   n.rg.style.filter=bp>0?`grayscale(${f(bp)}) brightness(${f(1-.35*bp)})`:'none';n.rg.style.borderColor=bp>.5?'#8a6a6a':'#e2b54a';});
  let head=null;
  chL.forEach((l,i)=>{const d=eio(P(t,lt[i],.75));l.base.style.opacity=f(eo(P(t,lt[i]-.2,.5))*(1-.6*bp));
   if(bp<=0){draw(l.p,d);if(d>0&&d<1)head=l.p.getPointAtLength(l.len*d);}
   else{const g=.06+.16*bp;l.p.setAttribute('stroke-dasharray',`${f(.5-g)} ${f(2*g)} 1`);l.p.setAttribute('stroke-dashoffset','0');}
   const flick=t>g0+1.3&&t<brk?(.55+.45*Math.abs(Math.sin(t*23+i*1.7))):1;
   l.p.style.opacity=f((bp>0?1-.55*bp:1)*flick);l.p.style.stroke=bp>.3?'#c46a6a':'#e2b54a';
   const qp=eb(P(t,brk+.15+i*.12,.5));op(l.q,cl(P(t,brk+.15+i*.12,.25)));l.q.style.transform=`scale(${f(.3+.7*qp)}) rotate(${f(qp*8*Math.sin(t*3+i))}deg)`;});
  const sp=$('ch-spark');const done=lt[4]+.75;
  if(!head&&t>done&&t<brk){const u=((t-done)*1.1)%5;const k=Math.floor(u);head=chL[k].p.getPointAtLength(chL[k].len*(u-k));}
  if(head&&bp<=0){op(sp,1);sp.style.left=f(head.x)+'px';sp.style.top=f(head.y)+'px';}else op(sp,0);
  enter($('ch-who'),t,g0+3.55,.7,{dy:16});
 }

 /* ---------- scramble ---------- */
 const msgs=[...$('sc-msgs').children];
 function paintScramble(t){
  const [c0,c1,c2]=C('scramble'),e2=E('scramble')[2];
  enter($('sc-scramble').querySelector('.kick'),t,S.scramble.t+.15,.5,{dy:8});
  enter($('sc-dir'),t,c0-.15,.7,{dy:40,s0:.94});
  const st=P(t,c0+1.0,.32);op($('sc-stamp'),cl(st*2.5));$('sc-stamp').style.transform=`scale(${f(1.7-.7*eo(st))}) rotate(-7deg)`;
  enter($('sc-phone'),t,c1-.35,.8,{dy:60,s0:.92});
  msgs.forEach((m,i)=>{const at=c1+.15+i*.47;const p=eb(P(t,at,.42));op(m,cl(P(t,at,.2)));m.style.transform=`translate3d(0,${f(14*(1-p))}px,0) scale(${f(.85+.15*p)})`;m.style.transformOrigin=m.classList.contains('me')?'100% 100%':'0 100%';});
  enter($('sc-calls'),t,c1+.95,.6,{dx:40,dy:0});$('sc-cnt').textContent='×'+Math.round(6*eo(P(t,c1+1.1,1.6)));
  enter($('sc-search'),t,c1+1.75,.6,{dx:40,dy:0});
  const q='casting supplier near peenya';const n=Math.round(q.length*P(t,c1+2.0,1.0));$('sc-q').textContent=q.slice(0,n);
  op($('sc-caret'),Math.floor(t*2.2)%2===0||(n>0&&n<q.length)?1:0);
  [...$('sc-res').children].forEach((r,i)=>enter(r,t,c1+3.05+i*.12,.4,{dy:8}));
  enter($('sc-ref'),t,c1+2.55,.6,{dx:40,dy:0});
  enter($('sc-map'),t,c2-.05,.7,{dy:40,s0:.95});draw($('sc-route'),eio(P(t,c2+.35,1.6)));
  const pe=eb(P(t,c2+1.9,.45));op($('sc-pin2'),cl(pe));op($('sc-hosur'),cl(pe));op($('sc-visit'),cl(P(t,c2+2.1,.4)));
  enter($('sc-day'),t,c1+.2,.5,{dy:-10});const dn=1+Math.floor(8*cl(P(t,c1+.4,e2-c1-.2)));$('sc-dayn').textContent=String(dn);op($('sc-dayt'),cl(P(t,c2+.8,.5)));
  $('sc-scramble').querySelector('.cam').style.transform=`scale(${f(1.02-.02*P(t,S.scramble.t,S.scramble.end-S.scramble.t))})`;
 }

 /* ---------- inside ---------- */
 const vals=[0,1,2,3].map(i=>$('in-w'+i).querySelector('.val'));vals.forEach(v=>{v.dataset.orig=v.textContent;});
 function paintInside(t){
  const [c0,c1,c2]=C('inside');
  enter($('sc-inside').querySelector('.kick'),t,S.inside.t+.1,.5,{dy:8});
  const h1=$('in-h1'),h2=$('in-h2');enter(h1,t,S.inside.t+.2,.6,{dy:18});if(t>=c2-.1){const o=eo(P(t,c2-.1,.35));op(h1,1-o);h1.style.transform=`translate3d(0,${f(-20*o)}px,0)`;}
  enter(h2,t,c2+.05,.55,{dy:18});if(t<c2+.05)op(h2,0);
  const wt=[c0+.55,c1+.0,c1+1.15,c1+2.3];
  wt.forEach((at,i)=>enter($('in-w'+i),t,at,.65,{back:true,dy:40,s0:.9}));
  [0,1,2,3].forEach(i=>{const at=c1+3.05+i*.12;const p=eb(P(t,at,.45));op($('in-x'+i),cl(P(t,at,.2)));$('in-x'+i).style.transform=`scale(${f(.4+.6*p)})`;op($('in-c'+i),cl(P(t,at,.3)));});
  let typedN=0;
  vals.forEach((v,i)=>{const ts=c2+.15+i*.45;const target=v.dataset.v;
   if(t<ts){v.textContent=v.dataset.orig;v.classList.remove('bad');}
   else{typedN++;const k=Math.round(target.length*P(t,ts+.08,.24));v.innerHTML=target.slice(0,k)+(t<ts+.42?'<i class="typer"></i>':'');v.classList.toggle('bad',!!v.dataset.bad&&t>ts+.42);}
   const pulse=t>=ts?Math.max(0,1-P(t,ts,.6)):0;$('in-w'+i).style.boxShadow=`0 30px 70px -20px #000d,0 0 0 ${f(6*pulse)}px rgba(226,181,74,${f(.8*pulse)})`;});
  const tb=$('in-typed');const tp=eb(P(t,c2+.12,.45));op(tb,cl(P(t,c2+.12,.2)));tb.style.transform=`scale(${f(.5+.5*tp+.06*Math.max(0,1-P(t,c2+.15+(typedN-1)*.45,.25)))})`;$('in-tn').textContent='×'+Math.max(1,typedN);
  $('sc-inside').querySelector('.cam').style.transform=`scale(${f(1+.025*P(t,S.inside.t,S.inside.end-S.inside.t))})`;
 }

 /* ---------- cost ---------- */
 function paintCost(t){
  const [c0,c1,c2]=C('cost');const ts=[c0+.0,c0+1.3,c0+2.55];
  let sx=0,sy=0;ts.forEach((s,i)=>{if(t>s){const a=t-s;const amp=9*Math.exp(-a*9);sx+=amp*Math.sin(a*70+i);sy+=amp*.6*Math.cos(a*55+i);}});
  const cam=$('sc-cost').querySelector('.cam');cam.style.transform=`translate3d(${f(sx)}px,${f(sy)}px,0) scale(${f(1+.03*P(t,c1,3))})`;
  const sc=eio(P(t,c1+.05,.95));const dir=[[-260,-90,-14],[0,220,7],[260,-110,12]];
  ts.forEach((s,i)=>{const el=$('co-p'+i);const p=P(t,s,.34);const k=1.22-.22*eo5(p);
   el.style.opacity=f(cl(p*3)*(1-sc));el.style.transform=`translate3d(${f(dir[i][0]*sc)}px,${f(dir[i][1]*sc)}px,0) scale(${f(k)}) rotate(${f(dir[i][2]*sc)}deg)`;el.style.filter=sc>0?`blur(${f(9*sc)}px)`:'none';});
  const ghost=P(t,ts[2]+.7,1.1);$('co-p2').querySelectorAll('.pi,b,span').forEach(n=>n.style.opacity=f(1-.6*ghost));
  const t1=$('co-t1');enter(t1,t,c1+.1,.6,{dy:26});if(t>=c2-.1){const o=eio(P(t,c2-.1,.6));t1.style.opacity=f(1-.55*o);t1.style.transform=`translate3d(0,${f(-50*o)}px,0) scale(${f(1-.12*o)})`;}
  const t2=$('co-t2');op(t2,t>=c2-.05?1:0);words(t2,t,c2,.11,.7,34);
  const em=$('co-em'),ul=$('co-ul');const up=eio(P(t,c2+1.45,.7));
  ul.style.left=(t2.offsetLeft+em.offsetLeft)+'px';ul.style.top=(t2.offsetTop+em.offsetTop+em.offsetHeight-2)+'px';ul.style.width=em.offsetWidth+'px';ul.style.transform=`scaleX(${f(up)})`;op(ul,up>0?1:0);
 }

 /* ---------- particles (reveal + close) ---------- */
 function makePts(host,n,seed){const r=rng(seed),a=[];for(let i=0;i<n;i++){const d=doc.createElement('div');d.className='pt';const s=2+r()*4;d.style.width=d.style.height=f(s)+'px';host.appendChild(d);a.push({el:d,x:r()*1600,y:r()*900,s,ph:r()*6.28,sp:.3+r()*.9,del:r()*.35});}return a;}
 const rvPts=makePts($('rv-pts'),90,11),clPts=makePts($('cl-pts'),46,23);
 function lockup(pref,t,at,lockTop){
  const lock=$(pref+'-lock');lock.style.width='1600px';lock.style.justifyContent='center';
  const tile=$(pref+'-tile'),s1=$(pref+'-s1'),s2=$(pref+'-s2'),mk=$(pref+'-mk');
  const tp=eb(P(t,at,.6));tile.style.transformOrigin='32px 32px';tile.style.transform=`scale(${f(.35+.65*tp)})`;op(tile,cl(P(t,at,.25)));
  draw(s1,eio(P(t,at+.28,.45)));const c=eio(P(t,at+.58,.5));draw(s2,c);
  const flash=Math.max(0,Math.sin(Math.PI*cl((t-(at+.85))/.9)));mk.style.filter=`drop-shadow(0 0 ${f(4+26*flash)}px rgba(226,181,74,${f(.25+.55*flash)}))`;
  [...$(pref+'-wm').children].forEach((s,i)=>{const p=eo(P(t,at+.7+i*.065,.55));op(s,cl(P(t,at+.7+i*.065,.3)));s.style.transform=`translate3d(${f(46*(1-p))}px,0,0)`;});
  return{lock,mk};
 }
 function paintReveal(t){
  const t0=S.reveal.t,[c0,c1]=C('reveal');const at=t0+1.15;
  const {lock,mk}=lockup('rv',t,at);
  lock.style.transform=`scale(${f(1.05-.05*eo(P(t,at,3.5)))})`;
  const markX=(1600-(190+34+$('rv-wm').offsetWidth))/2+95,markY=lock.offsetTop+95;
  rvPts.forEach(p=>{const u=eio(P(t,t0+.1+p.del,1.1));const ang=(1-u)*1.4;const dx=p.x-markX,dy=p.y-markY;
   const x=markX+(dx*Math.cos(ang)-dy*Math.sin(ang))*(1-u),y=markY+(dx*Math.sin(ang)+dy*Math.cos(ang))*(1-u);
   p.el.style.transform=`translate3d(${f(x)}px,${f(y)}px,0)`;op(p.el,cl(P(t,t0,.3))*(1-cl((u-.85)/.15))*(.5+.5*Math.sin(t*4+p.ph)));});
  op($('rv-glow'),eo(P(t,at,1.6))*.9);$('rv-glow').style.transform=`scale(${f(.7+.3*eo(P(t,at,2.2)))})`;
  op($('rv-tag'),t>=c1-.1?1:0);words($('rv-tag'),t,c1,.085,.65,24);
  const sw=$('rv-sweep');const sp=P(t,at+1.2,1.0);sw.style.left=f(380+840*eio(sp))+'px';op(sw,Math.sin(Math.PI*sp));
 }
 function paintClose(t){
  const t0=S.close.t,[c0,c1]=C('close');
  const k=$('cl-k');const kp=eo(P(t,c0-.1,.7));const mv=eio(P(t,c1-.2,.8));
  op(k,kp);k.style.top=f(400-250*mv)+'px';k.style.transform=`translate3d(0,${f(20*(1-kp))}px,0) scale(${f(1-.32*mv)})`;
  const {lock}=lockup('cl',t,c1-.25);lock.style.top='252px';
  op($('cl-tag'),t>=c1+.9?1:0);words($('cl-tag'),t,c1+1.0,.08,.6,22);
  [0,1,2].forEach(i=>enter($('cl-c'+i),t,c1+2.2+i*.16,.55,{back:true,dy:22,s0:.85}));
  enter($('cl-foot'),t,c1+2.9,.6,{dy:10});
  op($('cl-glow'),.4+.5*eo(P(t,c1-.2,1.6)));
  clPts.forEach(p=>{const y=((p.y-(t-t0)*24*p.sp)%900+900)%900,x=p.x+18*Math.sin(t*p.sp+p.ph);p.el.style.transform=`translate3d(${f(x)}px,${f(y)}px,0)`;op(p.el,(.25+.35*Math.sin(t*2+p.ph))*eo(P(t,t0,1)));});
 }

 /* ---------- network ---------- */
 const NS='http://www.w3.org/2000/svg';
 const N={k:{x:520,y:470,b:'Kaveri Pumps',s:'Pump maker · Peenya',i:'factory',c:'k'},g:{x:210,y:300,b:'Sri Ganesh Castings',s:'Foundry · Hosur',i:'foundry'},a:{x:200,y:610,b:'Anand Engineering',s:'Machine shop · Ambattur',i:'gear'},v:{x:830,y:280,b:'Veerabhadra Castings',s:'Foundry · Belagavi',i:'foundry'},m:{x:800,y:590,b:'Meenakshi Foundry',s:'Foundry · Peenya',i:'foundry'},b1:{x:990,y:470,b:'Pump buyer',s:'',i:'factory',sm:1},b2:{x:1000,y:690,b:'OEM',s:'',i:'build',sm:1},b3:{x:640,y:730,b:'Assembler',s:'',i:'build',sm:1}};
 const nwNodes=$('nw-nodes');
 for(const [id,n] of Object.entries(N)){const d=doc.createElement('div');d.className='nd'+(n.c?' '+n.c:'');d.style.left=n.x+'px';d.style.top=(n.y-(n.c?61:44))+'px';
  d.innerHTML=`<div class="o"${n.sm?' style="width:62px;height:62px"':''}>${svgI(n.i)}${id==='g'?'<svg class="ring" viewBox="0 0 106 106"><circle cx="53" cy="53" r="49" stroke="#eadfd5"/><circle id="nw-ring" cx="53" cy="53" r="49" stroke="#1b6a48" pathLength="1" transform="rotate(-90 53 53)"/></svg>':''}<span class="bd" id="nw-bd-${id}" style="opacity:0"></span></div><b${n.sm?' style="font-size:17px"':''}>${n.b}</b>${n.s?`<small>${n.s}</small>`:''}`;
  nwNodes.appendChild(d);n.el=d;}
 const linkDefs=[['g','k'],['a','k'],['v','k'],['k','m'],['m','b1'],['m','b2'],['m','b3']];
 const L={};linkDefs.forEach(([a,b])=>{const A=N[a],B=N[b];const mx=(A.x+B.x)/2+(A.y-B.y)*.12,my=(A.y+B.y)/2+(B.x-A.x)*.12;
  const p=doc.createElementNS(NS,'path');p.setAttribute('d',`M ${A.x} ${A.y} Q ${f(mx)} ${f(my)} ${B.x} ${B.y}`);p.setAttribute('class','nl');p.setAttribute('pathLength','1');$('nw-links').appendChild(p);L[a+b]={p,len:p.getTotalLength()};});
 const dots=['g','a','v'].map(()=>{const d=doc.createElement('div');d.className='dot';$('nw-dots').appendChild(d);return d;});
 const R2=rng(91),tiny=[];const fixed=Object.values(N);
 for(let tries=0;tiny.length<54&&tries<4000;tries++){const x=80+R2()*960,y=190+R2()*590;if(fixed.some(n=>Math.hypot(n.x-x,n.y-y)<(n.c?120:95)))continue;if(tiny.some(n=>Math.hypot(n.x-x,n.y-y)<58))continue;tiny.push({x,y});}
 tiny.forEach(n=>{n.d=Math.hypot(n.x-N.k.x,n.y-N.k.y);});tiny.sort((a,b)=>a.d-b.d);
 const maxD=Math.max(...tiny.map(n=>n.d));
 tiny.forEach((n,i)=>{const prev=fixed.concat(tiny.slice(0,i));const near=prev.map(p=>({p,d:Math.hypot(p.x-n.x,p.y-n.y)})).sort((a,b)=>a.d-b.d).slice(0,i%3===0?2:1);
  n.links=near.map(({p})=>{const l=doc.createElementNS(NS,'path');l.setAttribute('d',`M ${f(p.x)} ${f(p.y)} L ${f(n.x)} ${f(n.y)}`);l.setAttribute('class','nl sm');l.setAttribute('pathLength','1');$('nw-grow').appendChild(l);return l;});
  const e=doc.createElement('div');e.className='tiny'+(i%4===0?' g':'');e.style.left=f(n.x)+'px';e.style.top=f(n.y)+'px';$('nw-tiny').appendChild(e);n.el=e;});
 function badge(id,text,t,at,cls){const b=$('nw-bd-'+id);if(!b)return;b.textContent=text;b.className='bd'+(cls?' '+cls:'');const p=eb(P(t,at,.45));op(b,cl(P(t,at,.2)));b.style.transform=`scale(${f(.5+.5*p)})`;}
 function paintNetwork(t){
  const s=S.network,c=s.cues;const nxt=i=>i<4?c[i+1]:s.end+1;
  for(let i=0;i<5;i++){const h=$('nw-h'+i),pn=$('nw-p'+i);
   const a=eo(P(t,c[i]-.15,.5)),o=i<4?eo(P(t,nxt(i)-.3,.3)):0;
   [h,pn].forEach((el,j)=>{op(el,a*(1-o));el.style.transform=`translate3d(${f(j?40*(1-a):0)}px,${f((j?0:22)*(1-a)-14*o)}px,0)`;});}
  enter($('sc-network').querySelector('.kick'),t,s.t+.1,.5,{dy:8});
  const appear={k:s.t+.15,g:s.t+.45,a:c[2]+.05,v:c[2]+.3,m:c[3]+.95,b1:c[3]+2.55,b2:c[3]+2.8,b3:c[3]+3.05};
  for(const [id,n] of Object.entries(N)){const p=eb(P(t,appear[id],.6));op(n.el,cl(P(t,appear[id],.3)));n.el.style.transform=`translate3d(0,${f(18*(1-p))}px,0) scale(${f(.6+.4*p)})`;}
  // delivery G -> K
  const gk=L.gk;draw(gk.p,eio(P(t,s.t+.6,.8)));
  const tr=$('nw-truck');const tp=eio(P(t,c[0]+.15,1.7));if(tp>0&&tp<1){const pt=gk.p.getPointAtLength(gk.len*tp);op(tr,1);tr.style.left=f(pt.x)+'px';tr.style.top=f(pt.y)+'px';}else op(tr,0);
  badge('k','✓ On time',t,c[0]+1.9);
  $('nw-scan').style.top=f(4+60*Math.abs(Math.sin((t-c[0])*2.2)))+'px';
  // record
  const rp=eio(P(t,c[1]+.3,1.3));const ring=$('nw-ring');ring.setAttribute('stroke-dasharray',`${f(.96*rp)} 1`);
  badge('g','96% on time',t,c[1]+1.4);
  $('nw-s0').textContent=Math.round(96*rp)+'%';$('nw-s1').textContent=(0.3*rp).toFixed(1)+'%';$('nw-s2').textContent=String(Math.round(19*rp));
  // compare
  draw(L.ak.p,eio(P(t,c[2]+.2,.6)));draw(L.vk.p,eio(P(t,c[2]+.45,.6)));
  badge('a','91% on time',t,c[2]+.6);badge('v','New',t,c[2]+.85,'g');
  ['gk','ak','vk'].forEach((k,i)=>{const go=P(t,c[2]+.85+i*.08,.75),back=P(t,c[2]+1.75+i*.12,.75);let u=-1,col='#7a2945';
   if(go>0&&go<1)u=1-eio(go);else if(back>0&&back<1){u=eio(back);col='#c89a2e';}
   const d=dots[i];if(u>=0){const pt=L[k].p.getPointAtLength(L[k].len*u);op(d,1);d.style.left=f(pt.x)+'px';d.style.top=f(pt.y)+'px';d.style.background=col;}else op(d,0);});
  ['r0','r1','r2'].forEach((r,i)=>{$('nw-'+r).style.width=f([92,71,58][i]*eio(P(t,c[2]+1.6+i*.1,.8)))+'%';});
  const ch=eio(P(t,c[2]+2.6,.5));gk.p.style.stroke=ch>0?`rgb(${f(201-1*ch)},${f(171-17*ch)},${f(131-85*ch)})`:'';gk.p.style.strokeWidth=f(2.6+3.4*ch);
  // invite and own buyers
  draw(L.km.p,eio(P(t,c[3]+.25,.7)));badge('m','Joins free',t,c[3]+1.25,'g');
  draw(L.mb1.p,eio(P(t,c[3]+2.45,.5)));draw(L.mb2.p,eio(P(t,c[3]+2.7,.5)));draw(L.mb3.p,eio(P(t,c[3]+2.95,.5)));
  // growth
  tiny.forEach(n=>{const at=c[4]-.6+(n.d/maxD)*2.7;const p=eb(P(t,at,.45));op(n.el,cl(P(t,at,.2)));n.el.style.transform=`scale(${f(.3+.7*p)})`;n.links.forEach(l=>draw(l,eio(P(t,at-.15,.4))));});
  const g=eio(P(t,c[4]-.6,3.4));$('nw-cam').style.transform=`translate3d(${f(-10*g)}px,${f(-6*g)}px,0)`;
  for(const n of Object.values(N)){const o=n.el.querySelector('.o');const pulse=n.c?Math.max(0,1-P(t,c[3]+.1,.9)):0;if(n.c)o.style.boxShadow=`0 14px 34px -12px #5b3d2560,0 0 0 ${f(40*(1-pulse))}px rgba(122,41,69,${f(.25*pulse)})`;}
 }

 /* ---------- three ---------- */
 function paintThree(t){
  const [c0,c1]=C('three');
  op($('th-h1'),1);words($('th-h1'),t,c0-.05,.08,.6);
  enter($('th-pill'),t,c0+.75,.55,{back:true,dy:20,s0:.8});
  const at={m:c1-.05,g:c1+1.1,e:c1+2.2};
  enter($('th-m'),t,at.m,.75,{back:true,dy:70,s0:.9});enter($('th-g'),t,at.g,.7,{back:true,dy:70,s0:.9,dx:-30});enter($('th-e'),t,at.e,.7,{back:true,dy:70,s0:.9,dx:30});
  draw($('th-c1'),eio(P(t,at.m+.3,.4)));draw($('th-c0'),eio(P(t,at.g+.3,.6)));draw($('th-c2'),eio(P(t,at.e+.3,.6)));
  const fl=$('th-m').querySelector('.flag');const fp=eb(P(t,at.m+.6,.45));fl.style.transform=`scale(${f(.4+.6*fp)})`;op(fl,cl(P(t,at.m+.6,.2)));
 }
 /* ---------- price ---------- */
 function paintPrice(t){
  const s=S.price,[c0,c1]=C('price');
  enter($('sc-price').querySelector('.kick'),t,s.t+.1,.5,{dy:8});
  op($('pr-h1'),1);words($('pr-h1'),t,s.t+.2,.07,.55);
  const a=$('pr-a'),b=$('pr-b');a.style.height='330px';b.style.height='31px';
  const ap=eio(P(t,c0+.1,1.1)),bp=eb(P(t,c0+1.45,.6));a.style.transform=`scaleY(${f(ap)})`;b.style.transform=`scaleY(${f(bp)})`;
  const va=$('pr-va'),vb=$('pr-vb');va.style.top='22px';vb.style.top='300px';
  enter(va,t,c0+.85,.5,{dy:16});enter(vb,t,c0+1.75,.5,{dy:16});
  const fr=$('pr-free');fr.style.top='248px';enter(fr,t,c0+.55,.5,{back:true,dy:14,s0:.7});
  [0,1,2].forEach(i=>enter($('pr-p'+i),t,c1-.1+i*.38,.6,{dx:50,dy:0}));
 }

 const PAINT={'sc-chain':paintChain,'sc-scramble':paintScramble,'sc-inside':paintInside,'sc-cost':paintCost,'sc-reveal':paintReveal,'sc-network':paintNetwork,'sc-three':paintThree,'sc-price':paintPrice,'sc-close':paintClose};
 function paint(t){
  let any=0,top=null,topO=0;
  for(const [id,w] of Object.entries(win)){
   const el=$(id);const fin=w.start<=0?eo(P(t,0,.9)):eo(P(t,w.start,.45));const fout=id==='sc-close'?1:1-P(t,w.end,.45);
   const o=t>=w.start-.001&&t<w.end+.45?fin*fout:0;
   if(o<=0){el.style.display='none';continue;}
   el.style.display='block';op(el,o);any=Math.max(any,o);if(o>topO){topO=o;top=el;}
   try{PAINT[id](t);}catch(e){console.error(id,e);}
  }
  root.style.display=any>0?'block':'none';
  stage.classList.toggle('story-on',any>.5);stage.classList.toggle('story-light',!!top&&top.classList.contains('light'));
 }
 return{paint};
}
global.XelorStory=Object.freeze({install});
})(window);
````

## Appendix D4. Film director with the realistic pointer and touch (`film-xelor/director.js`)

The KisanCred film uses the same pointer functions inside its own director (`film-kisancred/director.js`).

````js
/* A deterministic film timeline over the real demo. No product rules are replaced.
 * Story scenes (problem, network, products, pricing, close) are painted by
 * story.js. Product shots drive the real app with a recorded-feeling pointer:
 * Fitts-timed curved moves, small overshoot and settle, hover and reading
 * drift between actions, a press on click, and finger taps on phone screens.
 */
(() => {
'use strict';
const $=id=>document.getElementById(id), D=window.XelorDemoDirector, TL=window.XELOR_TIMELINE, total=TL.duration;
const {chapters,shots}=TL;
const M=window.XelorMotion.install(document);
const overview=window.XelorOverview.install(document);
const story=window.XelorStory.install(document,TL);
const detail=target=>window.XelorPhoneDetail.update(w(),$('phone-detail'),target);
const captions=JSON.parse($('caption-data').textContent), audio=$('narration'), music=$('music');
const state={ready:false,playing:false,time:0,chapter:-1,shot:-1,action:0,armed:-1,epoch:0,busy:false,queued:null,errors:[],cursor:{x:1180,y:640},motion:null,caption:-1,started:false,export:false,musicOn:true,lastMusicSync:0,result:null,phone:false,taps:[],plan:[],clickAt:-9};
const w=()=>$('demo').contentWindow;
const format=t=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
function scale(){const r=$('screen').getBoundingClientRect();const s=Math.min(r.width/1600,r.height/900);$('stage').style.transform=document.fullscreenElement?`translate(-50%,-50%) scale(${s})`:`scale(${s})`;}
new ResizeObserver(scale).observe($('screen'));document.addEventListener('fullscreenchange',scale);
function flow(index){$('flow').innerHTML=index==null?'<span class="flow-order" style="margin-left:0">A connected view across the factory and its supplier network.</span>':['Order','Buy','Receive','Make','Ship'].map((x,i)=>`${i?'<span class="flow-arrow">→</span>':''}<span class="flow-step ${i<index?'done':i===index?'current':''}" data-number="${i+1}">${x}</span>`).join('')+'<span class="flow-order">ORDER · 80 pumps · 60 castings needed</span>';}
const productChapters=chapters.filter(c=>!c.story);
function setChapter(i){state.chapter=i;const c=chapters[i];const pi=productChapters.indexOf(c);
 $('scene-count').textContent=pi<0?'':`${String(pi+1).padStart(2,'0')} / ${productChapters.length}`;$('eyebrow').textContent=c.label||'';$('headline').textContent=c.title||'';
 $('intro-one').style.display='none';$('intro-two').style.display='none';$('closing').style.display='none';
 const demo=!c.story&&!c.diagram;$('stage').classList.toggle('product-capture',demo);$('demo-shell').style.visibility=demo?'visible':'hidden';$('aside').style.visibility=demo?'visible':'hidden';$('flow').style.visibility=demo?'visible':'hidden';
 if(!demo){state.motion=null;state.pendingFocus=null;state.result=null;M.focus(null);$('cursor').style.display='none';$('focus').style.display='none';}
 M.scene({chapter:i,shot:-1,start:c.t,end:c.end,chapterStart:c.t,core:!!c.core,flow:null,title:c.title},state.time);
}
function showSide(s){const c=chapters[state.chapter];$('role').textContent=s.role||c.role||'';$('callout-title').textContent=s.call||c.call||'';$('callout-body').textContent=s.body||c.body||'';$('features').innerHTML=(s.features||c.features||[]).map(f=>`<div class="feature">${f}</div>`).join('');$('shot-note').textContent=s.note||c.note||'';flow(s.core?s.flow:null);if(!s.core&&(s.note||c.note))$('flow').innerHTML='<span class="flow-order" style="margin-left:0">'+(s.note||c.note)+'</span>';}
function pos(rect){const box=$('demo-shell');rect={...rect,y:rect.y+46,cy:rect.cy+46};return {x:box.offsetLeft+rect.x,y:box.offsetTop+rect.y,width:rect.width,height:rect.height,cx:box.offsetLeft+rect.cx,cy:box.offsetTop+rect.cy};}
function focus(rect,start=state.time,duration=2.2,label=''){if(!rect){state.pendingFocus=null;M.focus(null);return;}const b=pos(rect);const top=Math.max(238,b.y),bottom=Math.min(752,b.y+b.height);if(bottom<=top){state.pendingFocus=null;M.focus(null);return;}const r={x:b.x,y:top,width:b.width,height:bottom-top};const cue={rect:r,options:{start,duration,label,kind:r.width>450||r.height>150?'underline':'circle'}};if(start>state.time){state.pendingFocus=cue;}else{state.pendingFocus=null;M.focus(cue.rect,cue.options);}}
async function markTarget(target,start,duration,label){if(!target)return;const r=await D.bounds(w(),target,{scroll:true});if(r)focus(r,start,duration,label);}

/* ---------- pointer ---------- */
function cursor(x,y){state.cursor={x,y};const c=$('cursor');c.style.display=state.phone?'none':'block';c.style.left=(x-2)+'px';c.style.top=(y-2)+'px';}
const minJerk=x=>x*x*x*(10-15*x+6*x*x);
function fittsDuration(from,to,width=36){const d=Math.hypot(to.x-from.x,to.y-from.y);return clamp(.26+.105*Math.log2(1+d/Math.max(18,width)),.3,1.05);}
function makeMotion(from,to,begin,end,seed,action){const dx=to.x-from.x,dy=to.y-from.y,d=Math.hypot(dx,dy)||1;
 // Wrist arcs bend the path to one side; the amount scales with distance.
 const bend=(seed%2?1:-1)*Math.min(70,d*.12),nx=-dy/d,ny=dx/d;
 const over=Math.min(9,d*.035);
 return {begin,end,from:{...from},to:{...to},action,c1:{x:from.x+dx*.3+nx*bend,y:from.y+dy*.3+ny*bend},c2:{x:from.x+dx*.78+nx*bend*.35,y:from.y+dy*.78+ny*bend*.35},ox:dx/d*over,oy:dy/d*over};}
function pointerAt(t){const m=state.motion;if(!m||state.phone)return;const raw=clamp((t-m.begin)/Math.max(.01,m.end-m.begin));
 // Main ballistic move lands slightly past the target, then a short correction settles.
 let p,o;if(raw<.84){p=minJerk(raw/.84);o=p;}else{p=1;o=1-minJerk((raw-.84)/.16);}
 const v=1-p;const x=v*v*v*m.from.x+3*v*v*p*m.c1.x+3*v*p*p*m.c2.x+p*p*p*m.to.x+m.ox*o*(raw<.84?minJerk(raw/.84):1);
 const y=v*v*v*m.from.y+3*v*v*p*m.c1.y+3*v*p*p*m.c2.y+p*p*p*m.to.y+m.oy*o*(raw<.84?minJerk(raw/.84):1);
 cursor(x,y);
}
function paintPointer(t){const c=$('cursor');const d=t-state.clickAt;const press=d>=-.03&&d<.14;c.style.transform=press?'scale(.84)':'none';
 const r=$('ripple');if(!state.phone&&d>=0&&d<.38){const p=d/.38;Object.assign(r.style,{opacity:String((1-p)*.4),left:(state.cursor.x-11)+'px',top:(state.cursor.y-11)+'px',transform:`scale(${.55+p*1.1})`});}else r.style.opacity='0';}
function paintTouch(t){const one=(el,x,y,at)=>{const d=t-at;if(x==null||d<-.2||d>.42){el.style.display='none';return;}el.style.display='block';el.style.left=x+'px';el.style.top=y+'px';
  const dot=el.firstElementChild,ring=el.lastElementChild;
  if(d<0){const p=1-(-d/.2);dot.style.opacity=String(.85*p);dot.style.transform=`scale(${1.25-.25*p})`;ring.style.opacity='0';}
  else if(d<.11){dot.style.opacity='.95';dot.style.transform='scale(.82)';ring.style.opacity='0';}
  else{const p=(d-.11)/.31;dot.style.opacity=String(.9*(1-p));dot.style.transform=`scale(${.82+.1*p})`;ring.style.opacity=String(.75*(1-p));ring.style.transform=`scale(${1+1.1*p})`;}};
 const tap=state.phone?[...state.taps].reverse().find(k=>t>=k.at-.2&&t<=k.at+.42):null;
 one($('touch'),tap?.x,tap?.y,tap?.at??0);one($('touch2'),tap?.inset?.x,tap?.inset?.y,tap?.at??0);}
function insetPoint(){const host=$('phone-detail').firstElementChild;const el=host?.shadowRoot?.querySelector('[xfilm-tap]');if(!el)return null;
 const r=el.getBoundingClientRect(),base=$('stage').getBoundingClientRect(),s=base.width/1600||1;if(!r.width)return null;
 const x=(r.left-base.left+r.width/2)/s,y=(r.top-base.top+r.height/2)/s;return y>120&&y<780?{x,y}:null;}

async function arm(s,act,t,epoch){const r=await D.bounds(w(),act.target,{scroll:true});if(epoch!==state.epoch)return;state.armed=state.action;if(!r)return;if(r.disabled&&act.type==='click')return;const b=pos(r);
 const typing=act.type==='type'||act.type==='input';
 focus(r,s.t+act.at-.8,1.65,s.holdLabel);
 if(state.phone){detail(act.target);const at=s.t+act.at-(typing?.52:0);state.taps.push({at,x:b.cx,y:b.cy,inset:insetPoint()});return;}
 const to={x:b.cx+(typing?-b.width*.32:0)+((s.index*7+state.action*3)%5-2),y:b.cy+((s.index+state.action)%3-1)};
 const dur=fittsDuration(state.cursor,to,Math.min(r.width,r.height));const early=typing?.6:.16;
 const end=s.t+act.at-early,begin=Math.max(t,end-dur);
 state.motion=makeMotion(state.cursor,to,begin,Math.max(begin+.22,end),s.index*19+state.action*11,state.action);detail(act.target);pointerAt(t);
}
function buildPlan(s){const plan=[];if(s.phone)return plan;const first=s.actions[0]?.at??(s.end-s.t);
 if(first>2.2)plan.push({at:s.t+.45,kind:'target',target:s.highlight||'#vp .scr',fx:s.highlight?.34:.44,fy:s.highlight?.55:.36});
 s.actions.forEach((a,i)=>{const next=s.actions[i+1]?.at??(s.end-s.t);if(next-a.at>2.5)plan.push({at:s.t+a.at+.9,kind:'drift',seed:i});});
 if(!s.actions.length&&s.end-s.t>4.5)plan.push({at:s.t+2.9,kind:'drift',seed:3});
 return plan;}
async function idle(s,t,epoch){if(state.phone)return;const m=state.motion;if(m&&t<m.end+.15)return;
 const next=s.actions[state.action];const limit=next?s.t+next.at-1.9:s.end-.6;
 const item=state.plan.find(p=>!p.done&&t>=p.at);if(!item)return;item.done=true;if(t>limit)return;
 let to;if(item.kind==='target'){const r=await D.bounds(w(),item.target,{scroll:false});if(epoch!==state.epoch||!r)return;const b=pos(r);to={x:b.x+b.width*item.fx,y:Math.min(740,b.y+Math.min(b.height,320)*item.fy)};}
 else{const k=(s.index*5+item.seed*3)%7;to={x:state.cursor.x+(k%2?1:-1)*(28+k*9),y:state.cursor.y+22+k*6};}
 to.x=clamp(to.x,80,1520);to.y=clamp(to.y,250,745);
 const dur=fittsDuration(state.cursor,to,80)*1.25;state.motion=makeMotion(state.cursor,to,t,t+dur,s.index*13+(item.seed||0),-1);pointerAt(t);
}
async function doAction(act,s){if(act.type==='click')await D.click(w(),act.target,{scroll:false});else D.input(w(),act.target,act.value);D.present(w());$('browser-url').textContent=D.localUrl(w());detail(act.target);if(act.after&&s){const at=s.t+act.at;state.result={text:act.after.label,start:at};await markTarget(act.after.target,at+.15,Math.max(.8,s.end-at-.2),act.after.label);}}
async function loadShot(i,t,seeking){const s=shots[i],prev=shots[state.shot];state.shot=i;state.action=0;state.armed=-1;state.motion=null;state.result=null;state.pendingFocus=null;state.taps=[];M.focus(null);
 const contiguous=!seeking&&prev?.core&&s.core&&i===prev.index+1&&Math.abs(prev.end-s.t)<.01;
 if(contiguous)await D.navigate(w(),s.screen);
 else await D.prepareDemo(w(),{step:s.step,screen:s.screen,surface:'device',desktopHeight:518,padding:0,maxScale:1});
 D.present(w());$('browser-url').textContent=D.localUrl(w());showSide(s);const c=chapters[state.chapter];M.scene({chapter:state.chapter,shot:i,start:s.t,end:s.end,chapterStart:c.t,core:!!s.core,flow:s.flow,title:c.title},t);
 state.phone=!!w().document.querySelector('#frame.phone');state.plan=buildPlan(s);
 if(seeking){state.plan.forEach(p=>{if(p.at<t)p.done=true;});state.cursor={x:760+(i%3)*60,y:520};}
 else if(!prev||!shots[i-1]||Math.abs(prev.end-s.t)>.01)state.cursor={x:1240,y:690};
 if(state.phone){$('cursor').style.display='none';}else cursor(state.cursor.x,state.cursor.y);
 if(s.highlight)await markTarget(s.highlight,s.t+.8,Math.min(3.2,s.end-s.t-1),s.holdLabel);
 if(seeking){while(state.action<s.actions.length&&s.t+s.actions[state.action].at<=t){await doAction(s.actions[state.action],s);state.action++;state.armed=-1;}}
 detail(s.actions[state.action]?.target||s.highlight);return s;
}
async function renderTime(t,force=false){if(state.busy){state.queued={t,force:force||state.queued?.force};return}state.busy=true;
 try{t=Math.max(0,Math.min(total,t));const ci=chapters.findIndex(c=>t>=c.t&&t<c.end);const index=ci<0?chapters.length-1:ci;if(index!==state.chapter)setChapter(index);
 const si=shots.findIndex(s=>t>=s.t&&t<s.end);
 if(si>=0){const s=si!==state.shot||force?await loadShot(si,t,force):shots[si];
  if(!force){while(state.action<s.actions.length&&s.t+s.actions[state.action].at<=t){const act=s.actions[state.action];
    if(state.armed!==state.action){await arm(s,act,t,state.epoch);const m=state.motion;if(m&&m.action===state.action){m.begin=m.end=t-.01;}}
    await doAction(act,s);state.clickAt=s.t+act.at;state.action++;
  }}
  const act=s.actions[state.action];
  if(act&&t>=s.t+act.at-1.75&&state.armed!==state.action)await arm(s,act,t,state.epoch);
  else await idle(s,t,state.epoch);
  if(act?.type==='type'&&state.armed===state.action&&t>=s.t+act.at-.43){const offsets=[0,.085,.225,.335];const elapsed=t-(s.t+act.at-.43);const length=Math.min(act.value.length,offsets.filter(n=>elapsed>=n).length);const text=act.value.slice(0,length);if(w().document.querySelector(D.actions[act.target]||act.target)?.value!==text){D.input(w(),act.target,text);detail(act.target);}}
  $('time-jump').style.display=s.timeJump&&t-s.t<2?'block':'none';$('time-jump').textContent=s.timeJump||'';
 }else{if(state.shot!==-1){state.shot=-1;state.phone=false;state.taps=[];}$('time-jump').style.display='none';$('cursor').style.display='none';}
 }catch(err){state.errors.push(String(err));console.error(err);}finally{state.busy=false;if(state.queued){const next=state.queued;state.queued=null;await renderTime(next.t,next.force);}}
}
const diagram=chapters.find(c=>c.diagram);
let lastPaintTime=-1;
function paint(t){lastPaintTime=t;$('seek').value=t;$('time').textContent=`${format(t)} / ${format(total)}`;$('progressline').style.width=(t/total*1600)+'px';const i=captions.findIndex(c=>t>=c.start&&t<=c.end+.25);if(i!==state.caption){state.caption=i;$('subtitle').textContent=i<0?'':captions[i].text;}
 const shot=shots[state.shot];if(shot){const u=Math.max(0,Math.min(1,(t-shot.t)/.42)),ease=1-Math.pow(1-u,3);$('demo-shell').style.opacity=ease;$('demo-shell').style.transform=`translate3d(${8*(1-ease)}px,0,0)`;}
 pointerAt(t);paintPointer(t);paintTouch(t);if(state.pendingFocus&&t>=state.pendingFocus.options.start){M.focus(state.pendingFocus.rect,state.pendingFocus.options);state.pendingFocus=null;}M.paint(t);
 overview.paint(diagram&&t>=diagram.t&&t<diagram.end?20+(t-diagram.t)*15/(diagram.end-diagram.t):-1);
 story.paint(t);
 const result=state.result&&t>=state.result.start?state.result:null;$('result-badge').hidden=!result;if(result){$('result-badge').textContent='✓ '+result.text;$('result-badge').style.opacity=Math.min(1,(t-result.start)/.25);}
}
function tick(){if(state.playing){state.time=Math.min(total,audio.currentTime);if(state.time-state.lastMusicSync>2){if(Math.abs(music.currentTime-audio.currentTime)>.14)music.currentTime=audio.currentTime;state.lastMusicSync=state.time;}if(state.time>=total-.035){state.time=total;pause();}renderTime(state.time);}if(state.time!==lastPaintTime)paint(state.time);requestAnimationFrame(tick);}
async function play(){if(!state.ready)return;if(state.time>=total-.1)await seek(0);$('start-overlay').style.display='none';state.started=true;state.playing=true;$('toggle').textContent='Pause';$('toggle').setAttribute('aria-label','Pause film');try{music.currentTime=audio.currentTime;await Promise.all([audio.play(),music.play()]);}catch(e){pause();state.errors.push('Audio playback: '+e.message);}}
function pause(){state.playing=false;audio.pause();music.pause();$('toggle').textContent='Play';$('toggle').setAttribute('aria-label','Play film');}
async function settle(){while(state.busy)await new Promise(r=>setTimeout(r,10));}
async function seek(t){if(!state.ready)return;const resume=state.playing;pause();await settle();state.epoch++;state.motion=null;state.clickAt=-9;state.time=Math.max(0,Math.min(total,Number(t)));audio.currentTime=state.time;music.currentTime=state.time;state.lastMusicSync=state.time;state.shot=-1;await renderTime(state.time,true);paint(state.time);if(resume)await play();}
async function toggle(){if(state.playing)pause();else await play();}
function fromBase64(s,type){const b=atob(s.trim()),bytes=new Uint8Array(b.length);for(let i=0;i<b.length;i++)bytes[i]=b.charCodeAt(i);return new Blob([bytes],{type});}
$('toggle').onclick=toggle;$('start').onclick=play;$('restart').onclick=async()=>{await seek(0);await play();};
let seekResume=false;$('seek').addEventListener('pointerdown',()=>{seekResume=state.playing;pause()});$('seek').addEventListener('input',()=>{state.time=Number($('seek').value);paint(state.time)});$('seek').addEventListener('change',async()=>{await seek(Number($('seek').value));if(seekResume)await play();seekResume=false;});
$('cc').onclick=()=>{const off=$('stage').classList.toggle('subtitles-off');$('cc').setAttribute('aria-pressed',String(!off));};$('mute').onclick=()=>{audio.muted=!audio.muted;music.muted=audio.muted||!state.musicOn;$('mute').textContent=audio.muted?'Muted':'Sound';$('mute').setAttribute('aria-label',audio.muted?'Unmute audio':'Mute audio');};$('volume').oninput=()=>{audio.volume=Number($('volume').value);music.volume=audio.volume;};
$('music-toggle').onclick=()=>{state.musicOn=!state.musicOn;music.muted=!state.musicOn||audio.muted;$('music-toggle').setAttribute('aria-pressed',String(state.musicOn));$('music-toggle').textContent=state.musicOn?'Music':'Music off';};
$('fullscreen').onclick=async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await $('screen').requestFullscreen();};
const NAV=[['chain','The problem'],['reveal','XELOR'],['network','The network'],['mkt','XELOR Market'],['gram','Xelogram'],['erp','The engine'],['j1','One complete order'],['close','Close']];
const navAt=key=>{if(TL.story[key])return TL.story[key].t;const map={mkt:'k.home',gram:'s.gram',j1:'p.sales'};const s=shots.find(x=>x.screen===map[key]);return s?s.t:0;};
$('chapter-toggle').onclick=()=>$('chapters').classList.toggle('open');$('chapters').innerHTML=NAV.map(([k,l])=>`<button data-t="${navAt(k)}">${format(navAt(k))} · ${l}</button>`).join('');$('chapters').onclick=async e=>{const b=e.target.closest('button');if(!b)return;$('start-overlay').style.display='none';await seek(+b.dataset.t);await play();};
function playerKeys(e,fromDemo=false){if(!fromDemo&&/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(!['Space','ArrowRight','ArrowLeft'].includes(e.code))return;e.preventDefault();if(fromDemo)e.stopImmediatePropagation();if(e.code==='Space')toggle();if(e.code==='ArrowRight')seek(state.time+5);if(e.code==='ArrowLeft')seek(state.time-5);}
document.addEventListener('keydown',playerKeys);
audio.addEventListener('ended',()=>{state.time=total;pause();renderTime(total);paint(total)});
window.XELOR_FILM={play,pause,seek,ready:()=>state.ready,get time(){return state.time},get duration(){return total},get playing(){return state.playing},get errors(){return [...state.errors]},get snapshot(){return state.ready?D.snapshot(w(),false):null},chapters,shots,async checkpoint(t){await seek(t);return {time:state.time,chapter:state.chapter,shot:state.shot,action:state.action,product:D.snapshot(w(),false),errors:[...state.errors]}},async renderFrame(t){if(!state.ready)throw new Error('Film is not ready');pause();await settle();if(t<state.time){await seek(t);}else{state.time=Math.min(total,Math.max(0,t));await renderTime(state.time);paint(state.time);}return {time:state.time,errors:[...state.errors]};},exportMode(){document.body.classList.add('export');$('start-overlay').style.display='none';state.export=true;scale();}};
async function init(){audio.src=URL.createObjectURL(fromBase64($('audio-data').textContent,'audio/mpeg'));music.src=URL.createObjectURL(fromBase64($('music-data').textContent,'audio/mpeg'));const product=await fromBase64($('product-data').textContent,'text/html;charset=utf-8').text();
 await new Promise(resolve=>{$('demo').onload=resolve;$('demo').srcdoc=product;});await w().document.fonts.ready;await document.fonts.ready;await D.prepareDemo(w(),{step:0,screen:'p.sales',surface:'device',desktopHeight:518,padding:0,maxScale:1});
 const cinema=w().document.createElement('style');cinema.textContent='html[data-xelor-film] #frame.phone{left:71%!important}';w().document.head.appendChild(cinema);
 w().document.addEventListener('keydown',e=>playerKeys(e,true),true);
 await new Promise((resolve,reject)=>{if(audio.readyState>=1)return resolve();audio.addEventListener('loadedmetadata',resolve,{once:true});audio.addEventListener('error',()=>reject(new Error('Narration failed to load')),{once:true});});
 await new Promise((resolve,reject)=>{if(music.readyState>=1)return resolve();music.addEventListener('loadedmetadata',resolve,{once:true});music.addEventListener('error',()=>reject(new Error('Music failed to load')),{once:true});});
 state.ready=true;setChapter(0);paint(0);$('start').disabled=false;$('start').textContent='▶  Watch the film';if(new URLSearchParams(location.search).has('export'))window.XELOR_FILM.exportMode();requestAnimationFrame(tick);
}
init().catch(err=>{state.errors.push(String(err));$('start').textContent='Unable to load — please reopen the file';console.error(err)});
})();
````

## Appendix D5. Film narration lines (`film-xelor/script.py`)

````python
# Each segment: id, kind ('story' or shot), lines: list of (caption, spoken or None)
SEG = [
 ('chain','story',[
   ("Behind almost every product made in India\nis a chain of small factories.", "Behind almost every product made in India, is a chain of small factories."),
   ("A foundry. A machine shop.\nA coating unit. An assembler.", "A foundry. A machine shop. A coating unit. An assembler."),
 ]),
 ('guess','story',[
   ("But finding the right supplier, or the right buyer,\nis still a guessing game.", "But finding the right supplier, or the right buyer, is still a guessing game."),
 ]),
 ('scramble','story',[
   ("Most can't afford paid directories.", None),
   ("So they rely on WhatsApp, phone calls,\nGoogle and references.", "So they rely on WhatsApp, phone calls, Google, and references."),
   ("And long site visits,\njust to trust one new supplier.", "And long site visits, just to trust one new supplier."),
 ]),
 ('inside','story',[
   ("Inside the factory, orders sit in WhatsApp.", "Inside the factory, orders sit in WhatsApp."),
   ("Stock in Excel. Accounts in Tally.\nQuality on paper.", "Stock in Excel. Accounts in Tally. Quality, on paper."),
   ("The same details are typed again, and again.", None),
 ]),
 ('cost','story',[
   ("Lines stop. Rejects surface late.\nGood suppliers stay invisible.", "Lines stop. Rejects surface late. Good suppliers stay invisible."),
   ("Everything is scattered.", None),
   ("And nobody can see who actually delivers.", None),
 ]),
 ('reveal','story',[
   ("XELOR changes that.", "Zeelor changes that."),
   ("The trusted network\nbehind what India manufactures.", "The trusted network, behind what India manufactures."),
 ]),
 ('network','story',[
   ("Every delivery is counted at the factory gate.", None),
   ("So every supplier earns a real record:\non time, quality, deliveries.", "So every supplier earns a real record. On time. Quality. Deliveries."),
   ("Factories find, compare and choose\neach other on that record.", "Factories find, compare, and choose each other, on that record."),
   ("Every request invites a new supplier.\nIt joins free, and brings its own buyers.", "Every request invites a new supplier. It joins free, and brings its own buyers."),
   ("The network grows with every order.", None),
 ]),
 ('three','story',[
   ("One trusted record. Three products.", None),
   ("XELOR Market. Xelogram.\nAnd an agentic AI ERP.", "Zeelor Market. Zeelogram. And an agentic A.I. E.R.P."),
 ]),
 ('mkt','shot',[
   ("XELOR Market is where small manufacturers\nfind each other.", "Zeelor Market is where small manufacturers find each other."),
   ("And see what every seller\nhas actually delivered.", "And see what every seller has actually delivered."),
 ]),
 ('price','story',[
   ("Listing starts free,\nat a fraction of a paid directory.", "Listing starts free, at a fraction of a paid directory."),
   ("XELOR only connects.\nIt never touches the money.", "Zeelor only connects. It never touches the money."),
 ]),
 ('req','shot',[
   ("A buyer's request goes to\nfive matched sellers at most.", "A buyer's request goes to five matched sellers, at most."),
   ("Never resold. No fee per lead.", "Never resold. No fee, per lead."),
 ]),
 ('help','shot',[
   ("Machine down? Find help reaches the nearest\nchecked technicians in one tap.", "Machine down? Find help reaches the nearest checked technicians, in one tap."),
   ("Repairs, testing, compliance and finance,\nall in one place.", "Repairs, testing, compliance, and finance. All in one place."),
 ]),
 ('gram','shot',[
   ("Xelogram turns a verified delivery into a post.", "Zeelogram turns a verified delivery into a post."),
   ("The agent writes the caption, in Tamil,\nKannada, Hindi or English.", "The agent writes the caption. In Tamil, Kannada, Hindi, or English."),
   ("One tap to approve and share.", None),
 ]),
 ('gramfeed','shot',[
   ("Buyers see real, verified work,\nand ask for a quote straight from the post.", "Buyers see real, verified work, and ask for a quote, straight from the post."),
 ]),
 ('profile','shot',[
   ("Every factory gets its own page,\nand chooses what stays private.", "Every factory gets its own page, and chooses what stays private."),
 ]),
 ('erp','story',[
   ("Underneath it all is an agentic AI ERP.", "Underneath it all, is an agentic A.I. E.R.P."),
   ("It links orders, suppliers, stock,\nfactory work and payments.", "It links orders, suppliers, stock, factory work, and payments."),
   ("Already using Tally? It works alongside.\nNo need to switch.", "Already using Tally? It works alongside. No need to switch."),
 ]),
 ('agent','shot',[
   ("The agent drafts the request for quotes,\nchases replies and ranks the offers.", "The agent drafts the request for quotes, chases replies, and ranks the offers."),
   ("People make the decisions.", None),
 ]),
 # one complete order (core shots, original durations)
 ('j1','shot',[("Let's follow one order, for eighty pumps.", None)]),
 ('j2','shot',[("Check the stock.\nSixty metal bodies are missing.", "Check the stock. Sixty metal bodies are missing.")]),
 ('j3','shot',[("Send one request to three suppliers.", None)]),
 ('j4','shot',[("The supplier opens a link. No login, no app.", None),("Adds a price and date, and sends the quote.", "Adds a price and date, and sends the quote.")]),
 ('j5','shot',[("Compare price, delivery,\nand each supplier's record.", "Compare price, delivery, and each supplier's record.")]),
 ('j6','shot',[("The owner checks the amount,\nand approves from the phone.", "The owner checks the amount, and approves from the phone.")]),
 ('j7','shot',[("On delivery day,\nscan the parts at the gate.", "On delivery day, scan the parts at the gate.")]),
 ('j8','shot',[("Check the parts.\nThe supplier's record updates by itself.", "Check the parts. The supplier's record updates, by itself.")]),
 ('j9','shot',[("Send the job and its parts\nto the factory team.", "Send the job, and its parts, to the factory team.")]),
 ('j10','shot',[("The team records eighty finished pumps.", None),("Each one passes four checks.", None)]),
 ('j11','shot',[("Ship the pumps.\nThe bill comes from the same order.", "Ship the pumps. The bill comes from the same order.")]),
 ('j12','shot',[("Close the order.", None)]),
 ('j13','shot',[("And the factory's own record grows.", None)]),
 ('close','story',[
   ("Every delivery builds trust.", None),
   ("XELOR. The trusted network\nbehind what India manufactures.", "Zeelor. The trusted network, behind what India manufactures."),
 ]),
]
````

## Appendix D6. Film timeline builder (`film-xelor/build_tl.py`)

````python
import json
from script import SEG
D=json.load(open('vo/durations.json'))
LINES={sid:lines for sid,_,lines in SEG}
T=0.0
chapters=[]; shots=[]; story={}; caps=[]; vo=[]; sfx=[]

def place(sid, start, gaps):
    """place lines of sid starting at start; gaps: list of gaps before line i (i>=1). returns starts, end"""
    st=[]; t=start
    for i,(cap,sp) in enumerate(LINES[sid]):
        if i: t+=gaps[i-1] if i-1<len(gaps) else 0.35
        d=D[f'{sid}_{i}']; st.append(round(t,3))
        caps.append({'start':round(t,3),'end':round(t+d,3),'text':cap}); vo.append((f'{sid}_{i}',round(t,3)))
        t+=d
    return st,t

def add_story(sid, lead=.45, gaps=(), tail=.6, title='', label='', extra=None, minlen=0):
    global T
    st,e=place(sid,T+lead,list(gaps))
    end=round(max(e+tail,T+minlen),3)
    story[sid]={'t':round(T,3),'end':end,'cues':st,'ends':[round(st[i]+D[f'{sid}_{i}'],3) for i in range(len(st))]}
    ch={'t':round(T,3),'end':end,'title':title,'label':label,'story':sid}
    if extra: ch.update(extra)
    chapters.append(ch); T=end
    return st

def A(at,target,type='click',value=None,after=None):
    return {'at':round(at,3),'target':target,'type':type,'value':value,'after':after}

def add_shot(sid, ch, sh, lead=.5, gaps=(), tail=.9, actions=lambda st,t0:[], fixed=None, minlen=0):
    global T
    t0=T
    st,e=place(sid,t0+lead,list(gaps))
    acts=actions([s-t0 for s in st],t0)
    lastA=max([a['at'] for a in acts],default=0)
    end=round(t0+fixed,3) if fixed else round(max(e+tail,t0+lastA+1.5,t0+minlen),3)
    c=dict(ch); c['t']=round(t0,3); c['end']=end; chapters.append(c)
    s=dict(sh); s['t']=round(t0,3); s['end']=end; s['actions']=acts; shots.append(s)
    for a in acts:
        sfx.append({'t':round(t0+a['at'],3),'kind':'tap' if s.get('phone') else ('key' if a['type'] in('type','input') else 'click')})
    T=end
    return st

# ---------- ACT 1: the problem ----------
add_story('chain',lead=.9,gaps=[.45],tail=.35,title='The problem',label='Made in India')
add_story('guess',lead=.25,tail=1.3)
add_story('scramble',lead=.35,gaps=[.4,.45],tail=.8)
add_story('inside',lead=.35,gaps=[.3,.5],tail=.8)
add_story('cost',lead=.3,gaps=[.9,.6],tail=1.4)
# ---------- ACT 2: the turn ----------
add_story('reveal',lead=1.5,gaps=[.5],tail=1.1)
add_story('network',lead=.5,gaps=[.35,.5,.5,.3],tail=1.2)
add_story('three',lead=.4,gaps=[.3],tail=1.2)
# ---------- ACT 3: XELOR Market ----------
MK='XELOR MARKET'
add_shot('mkt',{'title':'Find the right factory. See what it has delivered.','label':'XELOR Market · the flagship'},
  {'screen':'k.home','step':20,'role':MK,'highlight':'.mcard','holdLabel':'Earned records on every card','note':'XELOR Market · free to list · buyers and sellers deal directly'},
  lead=.6,gaps=[.3],tail=1.0,actions=lambda st,t0:[A(st[0]+2.0,'marketMachining','click',None,{'target':'.mcard','label':'Machining shops nearby'})])
add_story('price',lead=.4,gaps=[.4],tail=1.0,title='Pricing',label='XELOR Market')
add_shot('req',{'title':'Five matched sellers. Never resold.','label':'XELOR Market · buyer requests'},
  {'screen':'k.req','step':17,'role':MK,'highlight':'.reqbox','holdLabel':'A real buyer request','note':'Each request reaches five matched sellers at most · no fee per lead'},
  lead=.5,gaps=[.3],tail=1.0,actions=lambda st,t0:[A(st[1]+.9,'buyerInterest','click',None,{'target':'.card','label':'Interest sent with the record'})])
add_shot('help',{'title':'Machine down? Help in one tap.','label':'XELOR Market · find help'},
  {'screen':'k.help','step':16,'role':MK,'holdLabel':'Checked providers nearby','note':'Repairs · testing · compliance · finance · support schemes'},
  lead=.5,gaps=[.35],tail=1.0,actions=lambda st,t0:[A(st[0]+1.25,'machineHelp','click',None,{'target':'.urgent','label':'Nearest technicians found'}),A(st[1]+.7,'callTechnician','click',None,{'target':'.pro.first','label':'Technician called'})])
# ---------- Xelogram ----------
add_shot('gram',{'title':'A verified delivery becomes a post.','label':'Xelogram · on the supplier’s phone'},
  {'screen':'s.gram','step':18,'role':'SRI GANESH · SUPPLIER','phone':True,'holdLabel':'Drafted by the agent','note':'Xelogram · captions in Tamil, Kannada, Hindi or English · buyer names stay hidden'},
  lead=.5,gaps=[.3,.3],tail=1.2,actions=lambda st,t0:[A(st[1]+3.55,'postEnglish'),A(st[2]+.55,'approvePost','click',None,{'target':'.card.ok','label':'Posted on Xelogram'}),A(st[2]+2.0,'sharePost','click',None,{'target':'.shares','label':'Shared to WhatsApp Status'})])
add_shot('gramfeed',{'title':'Real work brings the next order.','label':'Xelogram · the feed'},
  {'screen':'k.gram','step':19,'role':'BUYERS · XELOGRAM','highlight':'.gpost','holdLabel':'Verified delivery badge','note':'Every post carries a verified-delivery badge and a Request quote button'},
  lead=.5,tail=1.0,actions=lambda st,t0:[A(st[0]+3.3,'postQuote','click',None,{'target':'.gpost','label':'Quote requested'})])
# ---------- the engine ----------
add_story('erp',lead=.45,gaps=[.4,.45],tail=.9,title='One place to run the factory.',label='The engine · agentic AI ERP',extra={'diagram':True})
add_shot('agent',{'title':'The agent prepares. People decide.','label':'The engine · agentic AI ERP'},
  {'screen':'p.agent','step':5,'role':'BUYING TEAM','highlight':'.card h4','holdLabel':'People decide','note':'Works alongside Tally · every action needs a person to approve'},
  lead=.5,gaps=[.3],tail=1.0)
# ---------- one complete order ----------
J=[('j1','p.sales',0,0,4,'.tbl tbody tr:first-child td:nth-child(2)','80 pumps',[(2.7,'confirmOrder','click',None,{'target':'.stamp','label':'Order confirmed'})],None),
   ('j2','p.plan',1,0,5,None,'Check the stock',[(1.25,'checkMaterials','click',None,{'target':'.hot td:nth-child(5)','label':'60 more needed'})],None),
   ('j3','p.net',2,1,4,None,'Ask the suppliers',[(2.4,'sendRequest','click',None,{'target':'.kpis .kpi:first-child','label':'Request sent'})],None),
   ('j4','s.quote',3,1,7,None,'A simple price reply',[(1.85,'quotePrice','type','2760',None),(3.2,'quoteDate','input','2026-10-09',None),(4.5,'quoteFreight','type','2400',None),(5.9,'sendQuote','click',None,{'target':'.bub:last-child','label':'Quote sent'})],None),
   ('j5','p.net',4,1,5,'[data-flip="ganesh"] .proof','Price + date + past work',[(3.4,'award','click',None,{'target':'.docsheet .dh','label':'Purchase order created'})],None),
   ('j6','w.po',5,1,5,'.card .amt','Check the amount',[(3.35,'approve','click',None,{'target':'.card','label':'Approved'})],None),
   ('j7','t.gate',6,2,6,None,'The parts arrive',[(1.5,'truck','click',None,None),(3.8,'scan','click',None,{'target':'.card.ok','label':'Delivery recorded'})],'Delivery day'),
   ('j8','t.qc',7,2,5,None,'Check before use',[(2.9,'passInspection','click',None,{'target':'.card.ok','label':'Parts passed · record updated'})],None),
   ('j9','m.wo',8,3,5,None,'Parts ready for the job',[(3.0,'release','click',None,{'target':'.card','label':'Job released'})],None),
   ('j10','m.wo',9,3,8,None,'80 pumps made',[(1.3,'recordOutput','click',None,{'target':'.hero','label':'80 pumps recorded'}),(2.8,'test0','click',None,None),(3.6,'test1','click',None,None),(4.4,'test2','click',None,None),(5.2,'test3','click',None,None),(6.6,'finalTest','click',None,{'target':'.center','label':'All checks passed'})],'After production'),
   ('j11','a.dispatch',10,4,4,None,'Send the pumps',[(1.4,'dispatch','click',None,None),(2.6,'irn','click',None,{'target':'.docsheet .dh','label':'Bill created'})],None),
   ('j12','a.books',12,4,2.6,None,'Finish the order',[(1.15,'closeOrder','click',None,{'target':'.stamp','label':'Order closed'})],None),
   ('j13','p.pass',13,5,4.2,'.card','Work history updated',[],None)]
TITLES=['1. Confirm the customer’s order.','2. Check which parts are missing.','3. Ask suppliers for a price.','4. The supplier sends a quote.','5. Choose the right supplier.','6. The owner approves the purchase.','7. Record the arriving parts.','8. Check the parts before using them.','9. Send the job to the factory team.','10. Build the pumps. Check the work.','11. Send the pumps and create the bill.','12. Close the order. Keep the record.','The factory’s record grows.']
ROLES=['PRIYA · BUYING TEAM','PRIYA · BUYING TEAM','PRIYA · BUYING TEAM','GANESH · SUPPLIER','PRIYA · BUYING TEAM','FACTORY OWNER','STORES','QUALITY TEAM','FACTORY TEAM','FACTORY TEAM','DISPATCH · ACCOUNTS','ACCOUNTS','FACTORY OWNER']
PHONE={'s.quote','w.po'}
for k,(sid,scr,step,flow,dur,hl,hold,acts,tj) in enumerate(J):
    lab='One complete order · Step %d of 12'%(k+1) if k<12 else 'One complete order · Done'
    sh={'screen':scr,'step':step,'core':True,'flow':flow,'holdLabel':hold,'role':ROLES[k]}
    if hl: sh['highlight']=hl
    if tj: sh['timeJump']=tj
    if scr in PHONE: sh['phone']=True
    if k==12: sh['call']='The factory’s record updates.'
    add_shot(sid,{'title':TITLES[k],'label':lab,'core':True},sh,lead=.3 if k else .35,gaps=[.3],fixed=dur,
             actions=lambda st,t0,acts=acts:[A(*a) for a in acts])
# ---------- close ----------
add_story('close',lead=.6,gaps=[.6],tail=2.6,title='XELOR',label='XELOR')
DUR=round(T,3)
for i,s in enumerate(shots): s['index']=i; s['holdStart']=.8
tl={'duration':DUR,'chapters':chapters,'shots':shots,'story':story}
open('timeline.js','w').write('window.XELOR_TIMELINE='+json.dumps(tl,ensure_ascii=False,indent=0)+';\n')
json.dump(caps,open('captions.json','w'),ensure_ascii=False,indent=1)
json.dump({'vo':vo,'sfx':sfx,'story':story,'duration':DUR},open('audio_plan.json','w'),indent=1)
print('duration',DUR, 'chapters',len(chapters),'shots',len(shots))
for c in chapters: print(round(c['t'],2),round(c['end'],2),c.get('story') or c['title'])
````

## Appendix D7. Film sound design and mix (`film-xelor/mix.py`)

````python
import json, numpy as np, soundfile as sf, subprocess
SR=44100
plan=json.load(open('audio_plan.json')); DUR=plan['duration']; ST=plan['story']
N=int((DUR+0.5)*SR)
def rs(x,sr):  # resample linear
    if sr==SR: return x
    t=np.arange(int(len(x)*SR/sr))/SR; return np.interp(t,np.arange(len(x))/sr,x)
# narration
nar=np.zeros(N)
for cid,t in plan['vo']:
    x,sr=sf.read(f'vo/{cid}.wav'); x=rs(x,sr); i=int(t*SR); nar[i:i+len(x)]+=x[:N-i]
nar=nar/np.max(np.abs(nar))*0.89
sf.write('narration.wav',nar.astype(np.float32),SR)
R=np.random.default_rng(5)
def env(n,a,d): t=np.arange(n)/SR; return np.minimum(1,t/max(a,1e-4))*np.exp(-t/d)
def lp(x,a):  # one-pole lowpass, a in (0,1)
    y=np.zeros_like(x); s=0.0
    for i in range(len(x)): s+=a*(x[i]-s); y[i]=s
    return y
def impact(g=.8):
    n=int(2.2*SR); t=np.arange(n)/SR; f=38+52*np.exp(-t*7); ph=2*np.pi*np.cumsum(f)/SR
    x=np.sin(ph)*np.exp(-t/0.75)+0.5*np.sin(ph*0.5)*np.exp(-t/1.1)
    nb=R.standard_normal(n)*env(n,.001,.05); x+=lp(nb,.08)*1.6
    return g*x/np.max(np.abs(x))
def whoosh(d=1.0,g=.22):
    n=int(d*SR); t=np.arange(n)/SR; nz=R.standard_normal(n); e=np.sin(np.pi*t/d)**2
    y=np.zeros(n); s=0.0; s2=0.0
    for i in range(n):
        a=0.02+0.25*e[i]; s+=a*(nz[i]-s); s2+=0.5*(s-s2)
    y=(s:=None) or 0
    # vectorized approx: lowpass with time-varying via blocks
    out=np.zeros(n); blk=512; st=0.0
    for b in range(0,n,blk):
        a=0.02+0.3*e[min(n-1,b+blk//2)]; seg=nz[b:b+blk]
        for j in range(len(seg)): st+=a*(seg[j]-st); out[b+j]=st
    out=out*e; return g*out/np.max(np.abs(out))
def click(g=.10):
    n=int(.05*SR); t=np.arange(n)/SR; x=R.standard_normal(n)*np.exp(-t/.0015)+0.6*np.sin(2*np.pi*2100*t)*np.exp(-t/.006)
    return g*x/np.max(np.abs(x))
def tap(g=.08):
    n=int(.08*SR); t=np.arange(n)/SR; x=np.sin(2*np.pi*1150*t)*np.exp(-t/.012)+0.3*R.standard_normal(n)*np.exp(-t/.002)
    return g*x/np.max(np.abs(x))
def pop(g=.07):
    n=int(.09*SR); t=np.arange(n)/SR; f=520+480*t/.09; x=np.sin(2*np.pi*np.cumsum(f)/SR)*np.sin(np.pi*t/.09)
    return g*x
def key(g=.05):
    n=int(.03*SR); t=np.arange(n)/SR; x=R.standard_normal(n)*np.exp(-t/.003); return g*lp(x,.5)/0.3
def chime(g=.12,f0=880):
    n=int(1.2*SR); t=np.arange(n)/SR; x=(np.sin(2*np.pi*f0*t)+.6*np.sin(2*np.pi*f0*1.5*t)+.3*np.sin(2*np.pi*f0*2*t))*env(n,.004,.35)
    return g*x/np.max(np.abs(x))
def shimmer(d=2.5,g=.1):
    n=int(d*SR); t=np.arange(n)/SR; x=sum(np.sin(2*np.pi*f*t+k) for k,f in enumerate([1320,1760,2217,2637]))*np.sin(np.pi*t/d)**2*(0.6+0.4*np.sin(2*np.pi*6*t))
    return g*x/np.max(np.abs(x))
fx=np.zeros(N)
def put(x,t):
    i=int(t*SR)
    if i<0 or i>=N: return
    fx[i:i+len(x)]+=x[:N-i]
# drone under the problem (0 -> cost cue2), tension rising
c=ST['cost']['cues']; rv=ST['reveal']['t']
dn=int(c[2]*SR)+int(1.2*SR); t=np.arange(dn)/SR
dr=np.zeros(dn)
for f,a in [(55,1),(82.41,.6),(110,.45),(164.8,.18),(58.3,.25)]:
    dr+=a*(np.sin(2*np.pi*f*t)+.3*np.sin(4*np.pi*f*t+1))
lfo=0.75+0.25*np.sin(2*np.pi*0.18*t)
rise=0.55+0.45*np.clip(t/c[2],0,1)
fade=np.clip(t/3,0,1)*np.clip((c[2]+1.0-t)/1.0,0,1)
dr=lp(dr*lfo*rise*fade,.05)
# heartbeat in the cost scene
for k in range(6):
    bt=c[0]+k*1.05
    if bt<c[2]-.3:
        n=int(.35*SR); tt=np.arange(n)/SR; hb=np.sin(2*np.pi*48*tt)*np.exp(-tt/.09); put(.18*hb/np.max(np.abs(hb)),bt); put(.12*hb/np.max(np.abs(hb)),bt+.24)
fx[:dn]+=0.11*dr/np.max(np.abs(dr))
# transitions
for sid in ['guess','scramble','inside','cost','network','three','price','close']:
    put(whoosh(.9,.12),ST[sid]['t']-.45)
for sid in ['guess']:
    put(impact(.35),ST['guess']['cues'][0]+2.55)
for k,tt in enumerate([c[0],c[0]+1.3,c[0]+2.55]): put(impact(.45),tt)
put(impact(.9),c[2])                         # "Nobody can see who actually delivers."
put(whoosh(1.6,.16),rv+0.0)
put(shimmer(2.6,.08),rv+.2)
put(impact(.6),rv+1.15+.58); put(chime(.14,660),rv+1.15+.6)
# scramble: message pops, call buzz, typing
sc=ST['scramble']['cues']
for i in range(9): put(pop(.06),sc[1]+.15+i*.47)
for i in range(16): put(key(.035),sc[1]+2.0+i*(1.0/28)*1.75)
ins=ST['inside']['cues']
for w in range(4):
    for k in range(3): put(key(.05),ins[2]+.23+w*.45+k*.08)
nw=ST['network']['cues']
put(chime(.10,990),nw[0]+1.9); put(chime(.10,1180),nw[2]+2.6); put(chime(.08,880),nw[3]+1.25)
for i in range(54): put(tap(.025),nw[4]-.6+i*.05)
# UI sounds
for e in plan['sfx']:
    put(click(.09) if e['kind']=='click' else tap(.08) if e['kind']=='tap' else key(.05), e['t'])
cl_=ST['close']['cues']; put(impact(.4),cl_[1]-.25+.58); put(chime(.12,660),cl_[1]+.35)
# music bed from the reveal: loop original with crossfades
m,sr=sf.read('../film/music.wav'); m=rs(m if m.ndim==1 else m.mean(1),sr)
start=rv+1.4; need=int((DUR-start+1)*SR); xf=int(3*SR)
bed=m.copy()
while len(bed)<need:
    seg=m[int(8*SR):]; fade=np.linspace(0,1,xf)
    bed=np.concatenate([bed[:-xf],bed[-xf:]*(1-fade)+seg[:xf]*fade,seg[xf:]])
bed=bed[:need]; tt=np.arange(need)/SR
bed*=np.clip(tt/2.5,0,1)*np.clip((DUR-start-tt)/3.0,0,1)
i0=int(start*SR); fx[i0:i0+need]+=bed[:N-i0]*1.15
fx=np.clip(fx,-.98,.98)
sf.write('music_fx.wav',fx.astype(np.float32),SR)
print('ok',DUR)
````

## Appendix D8. Film assembler (`film-xelor/assemble.py`)

````python
import re, json, base64, subprocess
F='../film/'
s=open(F+'orig.html').read()
subprocess.run('ffmpeg -v error -y -i narration.wav -ac 1 -b:a 96k narration.mp3 && ffmpeg -v error -y -i music_fx.wav -ac 1 -b:a 128k music_fx.mp3',shell=True,check=True)
b64=lambda p: base64.b64encode(open(p,'rb').read()).decode()
def rep_block(s,id_,body):
    m=re.search(r'(<script id="%s"[^>]*>)(.*?)(</script>)'%id_,s,re.S); assert m,id_
    return s[:m.start(2)]+body+s[m.end(2):]
s=rep_block(s,'audio-data',b64('narration.mp3'))
s=rep_block(s,'music-data',b64('music_fx.mp3'))
s=rep_block(s,'caption-data',open('captions.json').read())
TL=open('timeline.js').read()
DUR=json.load(open('audio_plan.json'))['duration']
cov={"film":"XELOR product film, revision 4","runtimeSeconds":DUR,"structure":["Problem (story scenes)","XELOR reveal","How the network works","Three products","XELOR Market (flagship) on the real product","Pricing","Xelogram on the supplier phone and feed","The engine: agentic AI ERP","One complete order on the real product","Close"],"notes":"Product screens are the real demo with demonstration data. Pointer moves are Fitts-timed with overshoot and settle; phone screens use touch taps."}
s=rep_block(s,'coverage-data',json.dumps(cov,indent=1))
# scripts without id
ms=[m for m in re.finditer(r'<script>(.*?)</script>',s,re.S)]
assert len(ms)==6
s2=open('s2.js').read()
s5=open(F+'s5.js').read().replace("<strong>One shared order.</strong><span>Everyone sees the same updates.</span>","<strong>Works alongside Tally.</strong><span>No need to switch.</span>")
new=[open(F+'s1.js').read(),s2,TL,open(F+'s4.js').read(),s5,open('story.js').read()+'\n</script>\n<script>'+open('director.js').read()]
out=[];last=0
for m,body in zip(ms,new):
    out.append(s[last:m.start(1)]);out.append(body);last=m.end(1)
out.append(s[last:]); s=''.join(out)
# css
imgs=json.load(open('imgs.json'))
extra=open('story.css').read()+"""
#cursor{width:19px;height:27px;filter:drop-shadow(0 1px 1.4px rgba(0,0,0,.4));transform-origin:2px 2px}
#ripple{width:22px;height:22px;border:1.6px solid rgba(122,41,69,.7);border-radius:50%}
.touch{position:absolute;z-index:23;width:28px;height:28px;margin:-14px 0 0 -14px;pointer-events:none;display:none}
.touch i,.touch b{position:absolute;inset:0;border-radius:50%;display:block}
.touch i{background:rgba(255,255,255,.62);border:1.5px solid rgba(35,25,30,.38);box-shadow:0 2px 9px rgba(0,0,0,.28)}
.touch b{border:2px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(0,0,0,.12)}
.touch.big{width:46px;height:46px;margin:-23px 0 0 -23px}
"""
s=s.replace('</style></head>',extra+'</style></head>',1)
# markup
cur_old=re.search(r'<svg id="cursor".*?</svg>',s,re.S).group(0)
s=s.replace(cur_old,'<svg id="cursor" viewBox="0 0 24 34"><path d="M2 2V26.2L7.7 20.7 11.5 29.8 15.4 28.1 11.6 19.3H19.4Z" fill="#141114" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/></svg><div class="touch" id="touch"><i></i><b></b></div><div class="touch big" id="touch2"><i></i><b></b></div>')
story=open('story.html').read().replace('{{IMG_MKT}}',imgs['mkt']).replace('{{IMG_ERP}}',imgs['erp']).replace('{{IMG_GRAM}}',imgs['gram'])
s=s.replace('<div id="progressline"></div>',story+'<div id="progressline"></div>',1)
mm=lambda t:f"{int(t//60)}:{int(t%60):02d}"
reps=[('<span class="film-name">One connected factory</span>','<span class="film-name">The trusted network</span>'),
('<span class="sample">Manufacturing workspace</span>','<span class="sample">Demonstration data</span>'),
('<p>A complete product overview, followed by an end-to-end order journey. Clear narration. Real interface. Every team connected.</p>','<p>Why finding a trusted supplier is still so hard, how the XELOR network fixes it, then XELOR Market, Xelogram and one complete order on the real product.</p>'),
('2 min 33 sec · English narration & subtitles · Best viewed fullscreen',f'{int(DUR//60)} min {int(DUR%60)} sec · English narration & subtitles · Best viewed fullscreen'),
('0:00 / 2:33','0:00 / '+mm(DUR)),('max="153"','max="%s"'%DUR),
('2:33 · Problem → What XELOR does → Product tour → One complete order',mm(DUR)+' · The problem → The network → XELOR Market → Xelogram → The engine → One order')]
for a,b in reps:
    assert a in s,a; s=s.replace(a,b)
open('XELOR-Product-Film.html','w').write(s)
print(len(s)/1e6,'MB')
````

## Appendix D9. Frame exporter (`film-xelor/export.mjs`)

````js
import { chromium } from 'playwright';
const [a,b]=process.argv.slice(2).map(Number);const FPS=30;
const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await br.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1.2});
await p.goto('file://'+process.cwd()+'/XELOR-Product-Film.html?export');
await p.waitForFunction(()=>window.XELOR_FILM&&window.XELOR_FILM.ready(),null,{timeout:180000});
await p.evaluate(()=>window.XELOR_FILM.exportMode());
const f0=Math.round(a*FPS),f1=Math.round(b*FPS);
await p.evaluate(t=>window.XELOR_FILM.seek(t),f0/FPS);
for(let f=f0;f<f1;f++){await p.evaluate(t=>window.XELOR_FILM.renderFrame(t),f/FPS);await p.screenshot({path:`frames/f${String(f).padStart(5,'0')}.jpg`,type:'jpeg',quality:93});if(f%300===0)console.log(a,f);}
console.log('done',a,b,JSON.stringify(await p.evaluate(()=>window.XELOR_FILM.errors)));
await br.close();
````

## Appendix D10. Kokoro voice generator (`film-xelor/gen.py`)

````python
import json, soundfile as sf, os
from kokoro_onnx import Kokoro
from script import SEG
K=Kokoro('../kokoro/kokoro-v1.0.onnx','../kokoro/voices-v1.0.bin')
VOICE=os.environ.get('VOICE','af_heart'); SPEED=float(os.environ.get('SPEED','1.0'))
out={}
for sid,kind,lines in SEG:
    for i,(cap,sp) in enumerate(lines):
        text=sp or cap.replace('\n',' ')
        fn=f'vo/{sid}_{i}.wav'
        s,sr=K.create(text,voice=VOICE,speed=SPEED,lang='en-us')
        sf.write(fn,s,sr); out[f'{sid}_{i}']=len(s)/sr
        print(sid,i,round(len(s)/sr,2),flush=True)
json.dump(out,open('vo/durations.json','w'),indent=1)
print('total',sum(out.values()))
````

## Appendix E1. Demo design tokens (`demo/head.css`)

The demo's other CSS (`base.css`, KisanCred's shell, 64 KB; `xelor.css`, 34 KB; `market.css`, 14 KB) and its JS (`core.js`, `screens*.js`, about 190 KB) are in `source-bundle/demo/`.

````css
/* Layout: sticky top bar → guided tour strip → role rail → [device stage | live screen spec]. Same shell as the KisanCred demo, XELOR maroon + stamp gold. */
:root{
  --bg:#f0ecec; --surface:#ffffff; --surface-2:#f8f5f5; --surface-3:#eee8e9; --line:#e2d9db; --line-2:#cdc0c4;
  --ink:#1d1418; --body:#46383e; --muted:#76676d;
  --acc:#7a2945; --acc-ink:#6d2340; --acc-soft:#f6e8ed; --on-acc:#ffffff;
  --green:#1b6a48; --green-ink:#17603f; --green-soft:#e4f1ea; --on-green:#ffffff;
  --bar:#7a2945; --on-bar:#ffffff; --bar-sub:#f0cdd8;
  --sup-bar:#7a4a17;
  --deep:#2a0f1a; --on-deep:#f6ecdc; --deep-sub:#c9abb7;
  --gold:#c89a2e; --gold-ink:#86600f; --gold-soft:#f8efd9; --on-gold:#1d1606;
  --ochre:#9a5a1b; --ochre-soft:#f7ecdd; --on-ochre:#ffffff;
  --blue:#2a5a86; --blue-soft:#e5eef6; --on-blue:#ffffff;
  --teal:#1d6b73; --teal-soft:#e0f0f1; --on-teal:#ffffff;
  --red:#a13d2a; --red-soft:#f7e4de; --on-red:#ffffff;
  --bankfill:#2a0f1a; --on-bank:#f6ecdc;
  --bezel:#120a0d; --bezel-2:#2b2025; --bezel-txt:#b29ca6;
  --wa-bg:#efe8e3; --wa-in:#ffffff; --wa-out:#f3e3d0; --wa-sys:#fbf1cf;
  --map-land:#ece6e4; --map-road:#d8cfcc;
  --stamp-blend:multiply;
  --shadow:0 1px 2px rgba(40,18,28,.06),0 14px 36px rgba(40,18,28,.12);
  --shadow-lg:0 40px 80px -30px rgba(42,15,26,.5);
  --display:"Bricolage Grotesque","Segoe UI",system-ui,sans-serif;
  --sans:"Source Sans 3","Segoe UI",system-ui,sans-serif;
  --mono:"JetBrains Mono",ui-monospace,"SFMono-Regular",Menlo,monospace;
  --kn:var(--sans);
  --ease:cubic-bezier(.2,.8,.2,1); --spring:cubic-bezier(.34,1.56,.64,1); --out:cubic-bezier(.16,1,.3,1);
}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){
  --bg:#120c0f; --surface:#1b1418; --surface-2:#221a1e; --surface-3:#2b2126; --line:#3a2c32; --line-2:#4a3a41;
  --ink:#f4edef; --body:#cdbfc5; --muted:#988890;
  --acc:#e48aa5; --acc-ink:#f0a8be; --acc-soft:#33192a; --on-acc:#2a0e18;
  --green:#5bc192; --green-ink:#7fd6ac; --green-soft:#10261c; --on-green:#06130c;
  --bar:#4a1729; --on-bar:#fbeef2; --bar-sub:#d9b2c0;
  --sup-bar:#4a2e10;
  --deep:#0d0609; --on-deep:#f6ecdc; --deep-sub:#b9a0aa;
  --gold:#e2b54a; --gold-ink:#f0c95f; --gold-soft:#342a12; --on-gold:#1d1606;
  --ochre:#dd9650; --ochre-soft:#36240f; --on-ochre:#1a0f05;
  --blue:#80b3e2; --blue-soft:#14263a; --on-blue:#08131f;
  --teal:#62c4cb; --teal-soft:#10302f; --on-teal:#061819;
  --red:#ec7d64; --red-soft:#3a1c15; --on-red:#1c0905;
  --bankfill:#eadfe3; --on-bank:#2a0f1a;
  --bezel:#050304; --bezel-2:#1f171b; --bezel-txt:#9c8790;
  --wa-bg:#160f12; --wa-in:#251b20; --wa-out:#3b2814; --wa-sys:#3a3014;
  --map-land:#211a1d; --map-road:#33282d;
  --stamp-blend:normal;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 14px 36px rgba(0,0,0,.35);
  color-scheme:dark;
}}
:root[data-theme="dark"]{
  --bg:#120c0f; --surface:#1b1418; --surface-2:#221a1e; --surface-3:#2b2126; --line:#3a2c32; --line-2:#4a3a41;
  --ink:#f4edef; --body:#cdbfc5; --muted:#988890;
  --acc:#e48aa5; --acc-ink:#f0a8be; --acc-soft:#33192a; --on-acc:#2a0e18;
  --green:#5bc192; --green-ink:#7fd6ac; --green-soft:#10261c; --on-green:#06130c;
  --bar:#4a1729; --on-bar:#fbeef2; --bar-sub:#d9b2c0;
  --sup-bar:#4a2e10;
  --deep:#0d0609; --on-deep:#f6ecdc; --deep-sub:#b9a0aa;
  --gold:#e2b54a; --gold-ink:#f0c95f; --gold-soft:#342a12; --on-gold:#1d1606;
  --ochre:#dd9650; --ochre-soft:#36240f; --on-ochre:#1a0f05;
  --blue:#80b3e2; --blue-soft:#14263a; --on-blue:#08131f;
  --teal:#62c4cb; --teal-soft:#10302f; --on-teal:#061819;
  --red:#ec7d64; --red-soft:#3a1c15; --on-red:#1c0905;
  --bankfill:#eadfe3; --on-bank:#2a0f1a;
  --bezel:#050304; --bezel-2:#1f171b; --bezel-txt:#9c8790;
  --wa-bg:#160f12; --wa-in:#251b20; --wa-out:#3b2814; --wa-sys:#3a3014;
  --map-land:#211a1d; --map-road:#33282d;
  --stamp-blend:normal;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 14px 36px rgba(0,0,0,.35);
  color-scheme:dark;
}
````

## Appendix E2. Demo page shell (`demo/shell.html`)

````html
<header class="top">
  <div class="top-in">
    <div class="brand"><span class="mk"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true" style="stroke-width:2.4"><path d="M5 5l14 14M19 5 5 19"/></svg></span><div><b>XEL<span>OR</span></b><small>Trusted supplier network · agentic ERP · Market</small></div></div>
    <span class="top-sp"></span>
    <span class="clockchip" id="clockchip" title="The demo keeps its own calendar, so a nine-day delivery takes one click."></span>
    <span class="demoflag" title="Every name and number here is an example written for this prototype.">Demo data</span>
    <span class="vchip">Build v7 · Oct 2026</span>
    <button class="themeb" id="themeBtn" data-theme-toggle aria-label="Switch between light and dark"></button>
  </div>
</header>

<div class="shell">
  <main id="proto">
    <section class="tour" id="tour" aria-live="polite"></section>
    <div class="rail">
      <div class="roles" id="roles" role="group" aria-label="Choose a role"></div>
      <div class="devs" id="devs" role="group" aria-label="Device"></div>
      <div class="finish" id="finish" role="group" aria-label="iPhone finish"></div>
      <button class="resetb" id="resetBtn" data-a="reset"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>Restart demo</button>
    </div>
    <div class="stagegrid">
      <div class="stage"><div class="frame laptop" id="frame">
        <div class="island" aria-hidden="true"><i></i></div><i class="hw hw-act"></i><i class="hw hw-v1"></i><i class="hw hw-v2"></i><i class="hw hw-pwr"></i><i class="hw hw-cam"></i>
        <div class="chrome"><span class="dots"><i></i><i></i><i></i></span><span class="addr" id="addr">kaveri.xelor.in</span></div>
        <div class="vp" id="vp"></div>
      </div></div>
      <p class="stagecap" id="cap" aria-live="polite"></p>
    </div>
  </main>
</div>
<div class="toasts" id="toasts" aria-live="polite"></div>
<div id="overlay"></div>
````

## Appendix E3. Demo build script (`demo/build.sh`)

````bash
#!/bin/bash
cd "$(dirname "$0")/build"
FONTSTYLE="<style id=\"xelor-fonts\">$(cat fonts.css)</style>"
assemble(){ # $1 = font block
  { echo '<title>XELOR Product Demo</title>'; echo "$1"; echo '<style>'; cat head.css base.css xelor.css market.css; echo '</style>'; cat shell.html; echo '<script>'; cat core.js screens.js screens6.js screens7.js boot.js; echo '</script>'; }
}
assemble "$FONTSTYLE" > body.html
assemble "<!--XELOR-FONTS-->" > body-embed.html
wrap(){ { echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'; echo '<meta name="description" content="XELOR product demo: the trusted supplier network, run by an agentic AI ERP. One order followed through six roles, then onto XELOR Market and Xelogram. Demonstration data.">'; python3 - "$1" <<'PY'
import sys;h=open(sys.argv[1]).read();i=h.index('</style>',h.index('<style>\n'))+8
sys.stdout.write(h[:i]+'</head><body>'+h[i:]+'</body></html>')
PY
} ; }
wrap body.html > full.html
wrap body-embed.html > full-embed.html
node -e "const fs=require('fs');const h=fs.readFileSync('full.html','utf8');const js=h.split('<script>')[1].split('</script>')[0];new Function(js);console.log('JS OK',h.length, fs.statSync('full-embed.html').size)"
````

---

*End of record.*
