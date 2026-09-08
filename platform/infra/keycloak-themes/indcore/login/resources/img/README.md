# Sign-in panel imagery

## `factory-left.jpg` — in place

The left panel of the sign-in page paints this file behind its content, under a white veil.

**It is already the crop.** The file is columns **105–325** of the supplied 800×445
photograph — a **220×445** window centred on the robot arm. That centre is measured rather
than judged by eye: the centroid of every strongly-yellow pixel in the first arm falls at
**x=215**, and the window is placed around it.

> An earlier version cut at column 88 — *before* the arm — to keep the strongest detail away
> from the type. That was reversed on the brief: the arm is the subject now, and the veil
> below does the protecting instead.

### The crop must stay WIDER in aspect than the panel — 0.494

This is the rule that keeps the top of the arm on screen, and it is easy to break by accident.

With `background-size: cover` the browser scales to fill and crops the axis that is
proportionally smaller. The vertical is preserved only while

```
image aspect  ≥  panel aspect        (0.494 ≥ 0.444 today)
```

A previous 178×445 crop had an aspect of exactly **0.400** — identical to the panel's at
1600×1000, which happened to be the size every screenshot was taken at. It looked perfect
there and silently cropped the top of the arm on a 1920×1080 or 2560×1440 screen, whose panel
aspect is 0.444. The bug was invisible to testing because the test size *was* the edge case.

`_scratch/probe-arm-top.mjs` now asserts the inequality across 1600×1000, 1920×1080,
2560×1440, 1440×900 and 1366×768. **A narrower crop will fail it.** Widen the window rather
than nudging `background-position`, which has no slack to move in when `cover` is not cropping.

### Why the file is cropped rather than the CSS

A `background-position` percentage re-crops itself whenever the panel's aspect changes, so the
subject drifts at window sizes nobody tested. Centring the arm *in the file* means a taller or
shorter viewport trims symmetrically around it. `indcore.css` therefore only centres what it
is given.

### Re-cropping from the source

The original is kept at
`docs/08-presentations/assets/smart-factory-automation.png` from the workspace root. To
change where the cut falls, redo it from there — the only number that matters is the column:

```powershell
Add-Type -AssemblyName System.Drawing
$X0 = 105; $W = 220             # left column, and a width whose aspect stays above 0.444
$src = [System.Drawing.Bitmap]::FromFile(
  "E:\ERP\MVP FILES\docs\08-presentations\assets\smart-factory-automation.png"
)
$crop = New-Object System.Drawing.Bitmap($W, $src.Height)
$g = [System.Drawing.Graphics]::FromImage($crop)
$g.DrawImage($src, (New-Object System.Drawing.Rectangle(0,0,$W,$src.Height)),
                   (New-Object System.Drawing.Rectangle($X0,0,$W,$src.Height)),
                   [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | ? { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 92)
$crop.Save("$PSScriptRoot\factory-left.jpg", $codec, $ep)
$crop.Dispose(); $src.Dispose()
```

No rebuild and no restart — the container serves this folder directly with theme caching
disabled, so a new file shows on the next page load.

### The veil is banded against the layout, not uniform

A single opacity has to serve two irreconcilable jobs — show the photograph, and keep black
type readable on it — and whichever value it takes, one of them loses. So the veil in
`indcore.css` is banded instead:

| Band | Veil | Why |
|---|---|---|
| 0–14% | 0.66 → 0.60 | protects the wordmark |
| 18–36% | **0.26 → 0.30** | the arm, nearly unveiled — the showcase |
| 40–72% | 0.80 → 0.86 → 0.72 | protects labels, fields, errors, the button |
| 80–100% | **0.34 → 0.30** | the conveyor and panel below |

Transitions run over 80–140px, far too gradual to band.

### It is measured, not trusted

`_scratch/shoot-login.mjs` computes the **real WCAG contrast ratio** for each text colour
actually used, against the **5th-percentile** background it actually sits on — the 5th
percentile rather than the mean, because an average stays comfortable while one dark strut
behind one word ruins it, and the strut is what a reader notices.

| Text | Ratio | Required |
|---|---|---|
| Wordmark `#0a0a0a` | 13.8:1 | 4.5:1 |
| Field text `#0a0a0a` | 12.8:1 | 4.5:1 |
| **Field labels `#52525b`** | **5.0:1** | 4.5:1 |

The labels are the control that gets near the line — small uppercase text in the softer second
shade. An earlier version of this harness asserted "background brighter than 210", a number
with no derivation that tested only the wordmark, which was never at risk. Deriving the
threshold from the palette means it moves on its own if the palette does.

The same section also asserts the file genuinely loads, because a `background-image` that
404s computes identically to one that does not.

If a replacement image pushes the label ratio under 4.5:1, **raise the veil in that band
rather than lowering the requirement.**

### If the file goes missing

The page is not broken. The image layer paints nothing, the veil paints white onto white, and
the panel is the plain white it was designed as. The only trace is a single 404 for this path.
