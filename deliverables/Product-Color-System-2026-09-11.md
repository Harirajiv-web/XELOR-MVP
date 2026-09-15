# Product color system

11 September 2026. Current product identities follow the owner's requested maroon, navy, gold, light blue, cream, white and yellow families.

| Product | Character | Light navigation | Page | Main action |
|---|---|---|---|---|
| XELOR ERP | Maroon, prominent gold and ivory | `#4B1D30` maroon with gold selection | `#F8F4EF` ivory | `#D8AF55` gold with deep maroon text |
| ONYX intelligence | Navy and ivory, with maroon and gold accents | `#1E3048` navy | `#F7F5EF` ivory | `#233F62` navy with white text |
| AIKYANTRA supplier network | Cream, warm gold and bronze | `#F2E6C9` cream gold | `#FBF8EF` cream | Gold with dark bronze text and a visible bronze border |
| Integrated workspace | Navy, light blue and cool white | `#102846` navy | `#F3F7FC` blue white | `#205FA8` blue with white text |

XELOR keeps a maroon rail and now uses gold primary buttons, a gold selected navigation row and brand mark, a gold-tinted overview hero, gold KPI icons and figures, and gold quick-card hover surfaces. ONYX uses the former integrated palette of navy, ivory, maroon and gold. The integrated workspace uses the former ONYX navy and light-blue palette. Both light and dark palettes were exchanged exactly; product roles, routes and names are unchanged. AIKYANTRA retains its cream-gold rail and bronze labels.

White data surfaces keep tables and forms legible. Dark modes preserve each product's color family and use lighter action fills with dark labels. Gold and yellow are used with dark text; a dark border keeps gold controls visible against cream. Selected navigation has an inset marker as well as a color change. Existing success, warning and error meanings remain separate from product branding.

Source: [product-palettes.css](../platform/apps/web/src/app/product-palettes.css). Shared components receive the selected profile through the root `data-product-phase` attribute. [Product profiles](../platform/apps/web/src/spine/product/profile.ts) carry matching installed-app colors and icons.

## Verification

The targeted palette suite passed **31 tests**: four existing fallback checks and 27 product checks. The product checks resolve custom properties from both stylesheets in cascade order, honoring product/theme selector specificity and inherited values. They measure all four profiles in light and dark modes, including page, sidebar, topbar and tabs.

Coverage includes body text, muted text, action labels and hover states, action boundaries, navigation labels, focus indicators, status labels, distinct product identities and installed-app color consistency. The updated checks also cover XELOR gold navigation, hero copy, icons and focus edges. Its selected navigation text measures 8.70:1, gold button text 7.61:1 in light mode and 8.99:1 in dark mode, and muted hero text 5.35:1 and 6.69:1 respectively.

```powershell
cd platform/apps/web
node --import tsx --test src/spine/ui/palette-contrast.test.ts src/spine/ui/product-palette-contrast.test.ts
```

These are source-token regression checks. They do not certify every rendered page, dynamic color, gradient, image, or third-party authentication screen.

## Initial local rollout

All four production builds passed, including the final XELOR refresh. Frontend lint and type checking passed, with targeted lint repeated for the last label and supplier-button fixes. The supplier quote form uses the same semantic colors as its product; the sourcing badge and AI-control labels use the correct contrasting ink. Each product has a distinct SVG icon and matching installed-app metadata. The shared offline fallback uses navy and cream, and its cache version was refreshed.

At 18:26 IST on 11 September 2026, all four local sites passed HTTP checks for their rendered product attribute, theme metadata, manifest, stylesheet order and contents, SVG icon, direct API health, web API proxy and database-backed identity. XELOR is on port 4001, ONYX on 4101, AIKYANTRA on 4201 and the integrated workspace on 4301. All remain running; existing database data was preserved.

Local build logs and the machine-readable live check results are under `.run/palette-refresh/`. A connected browser was unavailable, so screenshot inspection was not performed.

## Theme exchange and additional XELOR gold

The owner's follow-up exchanges the complete ONYX and integrated palettes in light and dark modes. Their theme metadata and icon colors follow the exchange. XELOR now has gold primary actions, selected navigation, its brand mark, overview surfaces and KPI accents. The original ONYX/integrated token blocks were compared with the exchanged blocks and matched exactly in both modes.

All 31 contrast checks passed with added coverage for XELOR's gold surfaces, and targeted lint passed. XELOR, ONYX and the integrated workspace were rebuilt successfully and restarted. At 18:45 IST on 11 September 2026, all four sites passed live HTML, palette CSS, manifest, SVG, API, proxy and database identity checks. The XELOR check explicitly confirmed its new gold action, navigation and overview CSS. AIKYANTRA's palette and running profile were preserved. Evidence is under `.run/theme-exchange/`. Browser screenshot inspection remained unavailable.
