import re, pathlib, html

src = pathlib.Path("PHASE-2/docs/reports/xelor-platform-architecture-and-verification-dossier.html").read_text()
body = src[src.index("<body>")+6 : src.index("</body>")]

# ---- split cover from the rest ----
cover_m = re.search(r'<section class="cover">(.*?)</section>', body, re.S)
cover = cover_m.group(1)
rest = body[cover_m.end():]

# ---- collect sections, give them ids, wrap tables for horizontal scroll ----
secs = re.findall(r'<section[^>]*>(.*?)</section>', rest, re.S)
out, toc = [], []
for s in secs:
    h2 = re.search(r'<h2>(.*?)</h2>', s, re.S)
    if not h2: continue
    raw = h2.group(1)
    plain = re.sub(r'<[^>]+>', '', raw).strip()
    num = plain.split('.')[0].strip()
    title = plain.split('.', 1)[1].strip() if '.' in plain else plain
    sid = "s" + num
    toc.append((sid, num, title))
    s = s.replace(f'<h2>{raw}</h2>', f'<h2 id="{sid}"><span class="sn">{num}</span>{title}</h2>', 1)
    s = re.sub(r'(<table[^>]*>.*?</table>)', r'<div class="tw">\1</div>', s, flags=re.S)
    out.append(f'<section class="sec" aria-labelledby="{sid}">{s}</section>')

# cover pieces
sub = re.search(r'<div class="sub">(.*?)</div>', cover, re.S).group(1)
scope = re.search(r'<div class="scope">(.*?)</div>', cover, re.S).group(1)
scope = scope.replace('style="color:#bdeaff"', 'class="k"')

toc_html = "\n".join(
    f'<li><a href="#{i}"><span class="tn">{n}</span><span>{t}</span></a></li>' for i, n, t in toc)

CSS = r"""
*,*::before,*::after{box-sizing:border-box}
img,svg{max-width:100%}
:root{
  --measure:74ch;
  --s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:24px;--s6:32px;--s7:48px;--s8:64px;--s9:96px;
  --hdr:60px;
  --bg:#f5f7fb; --surface:#ffffff; --surface-2:#f0f4fa; --sunken:#eaeff7;
  --ink:#101a2e; --ink-2:#3d4d68; --ink-3:#65748d;
  --line:#d9e1ee; --line-2:#c3cfe2;
  --navy:#0a1730; --blue:#1d4ed8; --blue-2:#2563eb;
  --green:#0a7a53; --amber:#a15c00; --red:#b42318; --violet:#6d28d9; --cyan:#0e7490;
  --code:#173d82; --code-bg:#eef3fc;
  --pre-bg:#0a1730; --pre-ink:#dbe8ff;
  --shadow:0 1px 2px rgba(16,26,46,.05),0 4px 14px rgba(16,26,46,.06);
  --radius:12px;
  --fs-xs:12.5px;--fs-sm:13.5px;--fs:15.5px;--fs-lead:18px;--fs-h3:19px;--fs-h2:27px;--fs-display:44px;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#080d18; --surface:#0e1626; --surface-2:#131d31; --sunken:#0b1220;
    --ink:#e8eefb; --ink-2:#b3c2da; --ink-3:#8595b0;
    --line:#1f2c45; --line-2:#2b3b58;
    --blue:#7aa5ff; --blue-2:#96b8ff; --green:#3ecf9a; --amber:#e0a33c; --red:#ff8b80;
    --violet:#b191f5; --cyan:#4fc4dd;
    --code:#a8c7ff; --code-bg:#111c31; --pre-bg:#050a14; --pre-ink:#d3e2ff;
    --shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.35);
  }
}
:root[data-theme="dark"]{
  --bg:#080d18; --surface:#0e1626; --surface-2:#131d31; --sunken:#0b1220;
  --ink:#e8eefb; --ink-2:#b3c2da; --ink-3:#8595b0;
  --line:#1f2c45; --line-2:#2b3b58;
  --blue:#7aa5ff; --blue-2:#96b8ff; --green:#3ecf9a; --amber:#e0a33c; --red:#ff8b80;
  --violet:#b191f5; --cyan:#4fc4dd;
  --code:#a8c7ff; --code-bg:#111c31; --pre-bg:#050a14; --pre-ink:#d3e2ff;
  --shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.35);
}
html{scroll-behavior:smooth}
@media (prefers-reduced-motion: reduce){html{scroll-behavior:auto} *{transition:none!important;animation:none!important}}
body{margin:0;background:var(--bg);color:var(--ink);
  font:var(--fs)/1.62 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:var(--blue);text-underline-offset:2px}
:focus-visible{outline:2px solid var(--blue);outline-offset:3px;border-radius:3px}

/* ---------- chrome ---------- */
.topbar{position:sticky;top:0;z-index:60;height:var(--hdr);background:color-mix(in srgb,var(--bg) 88%,transparent);
  backdrop-filter:saturate(1.6) blur(10px);border-bottom:1px solid var(--line)}
.topbar-in{max-width:1400px;margin:0 auto;height:100%;display:flex;align-items:center;gap:var(--s4);padding:0 var(--s5)}
.brand{display:flex;align-items:center;gap:10px;font-weight:750;letter-spacing:-.2px;white-space:nowrap}
.brand .mk{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;
  background:linear-gradient(135deg,#1d4ed8,#6d28d9);color:#fff;font-size:11px;font-weight:800}
.brand .bt{font-size:14.5px}
.brand .bs{color:var(--ink-3);font-weight:500;font-size:12.5px}
@media (max-width:720px){.brand .bs{display:none}.brand{min-width:0}.topbar-in{gap:var(--s3);padding:0 var(--s4)}}
.spacer{flex:1}
.tbtn{appearance:none;border:1px solid var(--line-2);background:var(--surface);color:var(--ink-2);
  border-radius:8px;padding:6px 11px;font:600 12.5px/1 inherit;cursor:pointer;white-space:nowrap}
.tbtn:hover{border-color:var(--blue);color:var(--blue)}
.menu{display:none}
@media (max-width:1080px){.menu{display:inline-block}}

/* ---------- masthead ---------- */
.masthead{background:radial-gradient(1100px 420px at 82% -10%,rgba(31,122,167,.5) 0,transparent 60%),
  linear-gradient(145deg,#050f25 0%,#112d6b 58%,#4c1d95 130%);color:#fff}
.mh-in{max-width:1400px;margin:0 auto;padding:var(--s8) var(--s5) var(--s7)}
.eyebrow{color:#8de5ff;font-size:12px;font-weight:750;letter-spacing:2.4px;margin-bottom:var(--s3)}
.masthead h1{margin:0 0 var(--s4);font-size:var(--fs-display);line-height:1.06;letter-spacing:-1.4px;max-width:20ch;text-wrap:balance}
.masthead .sub{color:#dcecff;font-size:var(--fs-lead);line-height:1.55;max-width:66ch;margin:0 0 var(--s5)}
.masthead .scope{max-width:74ch;padding:var(--s4) var(--s5);border:1px solid #6ea6dc80;border-radius:var(--radius);
  background:#ffffff12;color:#d9e9fb;font-size:14px;line-height:1.62}
.masthead .scope b{color:#fff}
.masthead code,.masthead .k{color:#bdeaff;background:#ffffff1a;border:1px solid #ffffff26;padding:1px 6px;border-radius:5px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.88em}
.mh-meta{margin-top:var(--s5);padding-top:var(--s4);border-top:1px solid #6b9bcc55;color:#c9ddf4;font-size:12.5px}

/* ---------- shell ---------- */
.shell{max-width:1400px;margin:0 auto;padding:var(--s7) var(--s5) var(--s9);
  display:grid;grid-template-columns:264px minmax(0,1fr);gap:var(--s8);align-items:start}
@media (max-width:1080px){.shell{grid-template-columns:1fr;gap:var(--s5);padding-top:var(--s5)}}
main{min-width:0;max-width:1000px}

/* ---------- toc ---------- */
.toc{position:sticky;top:calc(var(--hdr) + var(--s4));max-height:calc(100vh - var(--hdr) - var(--s6));
  overflow:auto;overscroll-behavior:contain;font-size:var(--fs-sm)}
.toc h2{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--ink-3);margin:0 0 var(--s3);padding:0;border:0}
.toc ol{list-style:none;margin:0;padding:0}
.toc li{margin:0}
.toc a{display:flex;gap:9px;align-items:baseline;padding:5px 9px;border-radius:7px;color:var(--ink-2);
  text-decoration:none;line-height:1.35;border-left:2px solid transparent}
.toc a:hover{background:var(--surface-2);color:var(--ink)}
.toc a.on{background:var(--surface-2);color:var(--blue);font-weight:650;border-left-color:var(--blue)}
.tn{flex:0 0 20px;font-variant-numeric:tabular-nums;font-size:11.5px;color:var(--ink-3);font-weight:700}
.toc a.on .tn{color:var(--blue)}
@media (max-width:1080px){
  .toc{position:fixed;inset:var(--hdr) auto 0 0;width:280px;max-height:none;height:calc(100vh - var(--hdr));
    background:var(--surface);border-right:1px solid var(--line);padding:var(--s5);z-index:55;
    transform:translateX(-102%);transition:transform .22s ease;box-shadow:var(--shadow)}
  .toc.open{transform:none}
}

/* ---------- typography ---------- */
h2{margin:0 0 var(--s4);font-size:var(--fs-h2);line-height:1.2;letter-spacing:-.5px;
  padding-bottom:var(--s3);border-bottom:2px solid var(--blue);scroll-margin-top:calc(var(--hdr) + 14px);text-wrap:balance}
.sn{display:inline-grid;place-items:center;min-width:30px;height:30px;padding:0 7px;margin-right:11px;border-radius:8px;
  background:var(--blue);color:#fff;font-size:14px;font-weight:800;vertical-align:2px;font-variant-numeric:tabular-nums}
h3{margin:var(--s6) 0 var(--s3);font-size:var(--fs-h3);line-height:1.28;color:var(--blue);letter-spacing:-.2px;scroll-margin-top:calc(var(--hdr) + 14px)}
h4{margin:var(--s5) 0 var(--s2);font-size:15.5px;color:var(--ink)}
p{margin:0 0 var(--s4);max-width:var(--measure);text-wrap:pretty}
ul,ol{margin:0 0 var(--s4);padding-left:1.4em;max-width:var(--measure)}
li{margin:var(--s2) 0}
.lead{font-size:var(--fs-lead);line-height:1.56;color:var(--ink-2);max-width:66ch;margin-bottom:var(--s5)}
.small{font-size:var(--fs-xs);color:var(--ink-3)}
b,strong{font-weight:680}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.88em;color:var(--code);
  background:var(--code-bg);padding:1.5px 5px;border-radius:5px;overflow-wrap:anywhere}
th code{color:#cfe3ff;background:#ffffff1f}
pre{margin:0 0 var(--s5);padding:var(--s4) var(--s5);border-radius:var(--radius);background:var(--pre-bg);color:var(--pre-ink);
  font:13px/1.62 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow-x:auto;white-space:pre;box-shadow:var(--shadow)}
pre b{color:#7ee0b0;font-weight:600}
pre i{color:#93a9cc;font-style:normal}
pre code{background:none;color:inherit;padding:0;font-size:1em}

/* ---------- sections ---------- */
.sec{padding:var(--s7) 0;border-top:1px solid var(--line)}
.sec:first-of-type{border-top:0;padding-top:0}

/* ---------- tables ---------- */
.tw{overflow-x:auto;margin:0 0 var(--s5);border:1px solid var(--line);border-radius:var(--radius);
  background:var(--surface);box-shadow:var(--shadow);-webkit-overflow-scrolling:touch}
table{width:100%;border-collapse:collapse;font-size:var(--fs-sm);min-width:560px}
th{background:var(--navy);color:#fff;text-align:left;padding:10px 13px;font-weight:650;font-size:var(--fs-xs);
  letter-spacing:.2px;position:sticky;top:0;z-index:1}
:root[data-theme="dark"] th, :root:not([data-theme="light"]) th{background:#12203a}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]) th{background:var(--navy)}}
td{padding:9px 13px;border-top:1px solid var(--line);vertical-align:top;line-height:1.5}
tbody tr:nth-child(even) td,table tr:nth-child(even) td{background:var(--surface-2)}
table b{color:var(--ink)}

/* ---------- callouts ---------- */
.callout{margin:0 0 var(--s5);padding:var(--s4) var(--s5);border-left:3px solid var(--blue);border-radius:0 var(--radius) var(--radius) 0;
  background:color-mix(in srgb,var(--blue) 8%,var(--surface));max-width:var(--measure)}
.callout > :last-child{margin-bottom:0}
.callout.good{border-left-color:var(--green);background:color-mix(in srgb,var(--green) 9%,var(--surface))}
.callout.warn{border-left-color:var(--amber);background:color-mix(in srgb,var(--amber) 10%,var(--surface))}
.callout.bad{border-left-color:var(--red);background:color-mix(in srgb,var(--red) 8%,var(--surface))}
.callout.violet{border-left-color:var(--violet);background:color-mix(in srgb,var(--violet) 8%,var(--surface))}
.callout .tw{max-width:none;margin-top:var(--s3);margin-bottom:0}
.callout table{min-width:520px}

/* ---------- cards / kpi / grid ---------- */
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:var(--s4);margin:0 0 var(--s5)}
.grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:var(--s3);margin:0 0 var(--s5)}
.card{padding:var(--s5);border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);box-shadow:var(--shadow)}
.card > :last-child{margin-bottom:0}
.card h3,.card h4{margin-top:0}
.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--s3);margin:0 0 var(--s6)}
.kpi div{padding:var(--s4) var(--s5);border-radius:var(--radius);background:var(--navy);color:#dceaff;
  font-size:var(--fs-xs);line-height:1.42;box-shadow:var(--shadow)}
.kpi b{display:block;margin-bottom:3px;color:#7ad4ff;font-size:26px;font-weight:800;letter-spacing:-.8px;font-variant-numeric:tabular-nums}

/* ---------- verify blocks ---------- */
.verify{margin:0 0 var(--s5);border:1px solid var(--line-2);border-radius:var(--radius);overflow:hidden;background:var(--surface);box-shadow:var(--shadow)}
.verify .vh{padding:9px var(--s5);background:var(--sunken);border-bottom:1px solid var(--line);
  font-size:var(--fs-xs);font-weight:750;letter-spacing:.6px;color:var(--ink-2);display:flex;align-items:center;gap:8px}
.verify .vh::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--green);flex:0 0 auto}
.verify .vb{padding:var(--s4) var(--s5)}
.verify pre{margin:0;box-shadow:none}

/* ---------- flow ---------- */
.flow{display:flex;flex-wrap:wrap;align-items:stretch;gap:var(--s2);margin:0 0 var(--s5)}
.flow > div{flex:1 1 150px;display:grid;place-items:center;padding:var(--s4) var(--s3);border:1px solid var(--line-2);
  border-radius:10px;background:var(--surface);text-align:center;font-size:var(--fs-xs);font-weight:700;line-height:1.35;box-shadow:var(--shadow)}
.flow .arrow{flex:0 0 22px;border:0;background:none;box-shadow:none;color:var(--blue);font-size:17px;font-weight:400}

/* ---------- tags / severity ---------- */
.tag{display:inline-block;padding:2px 8px;border-radius:11px;font-size:11px;font-weight:750;white-space:nowrap;line-height:1.5}
.live{background:color-mix(in srgb,var(--green) 20%,transparent);color:var(--green)}
.stand{background:color-mix(in srgb,var(--amber) 22%,transparent);color:var(--amber)}
.off{background:color-mix(in srgb,var(--ink-3) 20%,transparent);color:var(--ink-2)}
.human{background:color-mix(in srgb,var(--violet) 20%,transparent);color:var(--violet)}
.sev{display:inline-block;min-width:54px;padding:2px 7px;border-radius:6px;text-align:center;font-size:10.5px;font-weight:800;letter-spacing:.3px}
.s-high{background:color-mix(in srgb,var(--red) 20%,transparent);color:var(--red)}
.s-med{background:color-mix(in srgb,var(--amber) 22%,transparent);color:var(--amber)}
.s-low{background:color-mix(in srgb,var(--blue) 18%,transparent);color:var(--blue)}
.s-none{background:color-mix(in srgb,var(--green) 20%,transparent);color:var(--green)}

/* ---------- misc from print sheet ---------- */
.num{display:inline-grid;place-items:center;width:22px;height:22px;margin-right:8px;border-radius:6px;
  background:var(--blue);color:#fff;font-size:11px;font-weight:800;vertical-align:-3px}
.toc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:4px 22px;margin:0 0 var(--s5);max-width:none}
.toc-grid p{margin:0;padding:5px 0}
.toc-grid a{text-decoration:none;color:var(--ink-2)}
.toc-grid a:hover{color:var(--blue)}
.dense{font-size:var(--fs-xs)}
.footer-note{margin-top:var(--s6);padding-top:var(--s4);border-top:1px solid var(--line);color:var(--ink-3);font-size:var(--fs-xs);max-width:none}
.no-break{}
.mono-col code{white-space:nowrap}
.page{}

/* ---------- back to top ---------- */
.top{position:fixed;right:22px;bottom:22px;z-index:50;width:42px;height:42px;border-radius:50%;
  border:1px solid var(--line-2);background:var(--surface);color:var(--ink-2);cursor:pointer;
  box-shadow:var(--shadow);font-size:17px;opacity:0;pointer-events:none;transition:opacity .2s}
.top.show{opacity:1;pointer-events:auto}
.top:hover{color:var(--blue);border-color:var(--blue)}
.scrim{position:fixed;inset:0;background:#0009;z-index:54;opacity:0;pointer-events:none;transition:opacity .2s}
.scrim.on{opacity:1;pointer-events:auto}
@media (min-width:1081px){.scrim{display:none}}

@media print{
  .topbar,.toc,.top,.menu,.scrim{display:none!important}
  .shell{display:block;padding:0;max-width:none}
  .sec{page-break-before:always;border-top:0}
  body{background:#fff;color:#000;font-size:10pt}
  .tw{overflow:visible;box-shadow:none}
  th{position:static}
}
"""

JS = r"""
(function(){
  var root=document.documentElement, KEY='xelor-dossier-theme';
  var saved=localStorage.getItem(KEY); if(saved) root.setAttribute('data-theme',saved);
  var btn=document.getElementById('theme');
  function label(){
    var t=root.getAttribute('data-theme');
    var dark = t ? t==='dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    btn.textContent = dark ? 'Light' : 'Dark';
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  }
  btn.addEventListener('click',function(){
    var t=root.getAttribute('data-theme');
    var dark = t ? t==='dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    var next = dark ? 'light':'dark';
    root.setAttribute('data-theme',next); localStorage.setItem(KEY,next); label();
  });
  label();

  var toc=document.querySelector('.toc'), scrim=document.querySelector('.scrim'), menu=document.getElementById('menu');
  function close(){toc.classList.remove('open');scrim.classList.remove('on');menu.setAttribute('aria-expanded','false');}
  menu.addEventListener('click',function(){
    var open=toc.classList.toggle('open'); scrim.classList.toggle('on',open);
    menu.setAttribute('aria-expanded',String(open));
  });
  scrim.addEventListener('click',close);
  toc.addEventListener('click',function(e){ if(e.target.closest('a')) close(); });
  addEventListener('keydown',function(e){ if(e.key==='Escape') close(); });

  var links={}; [].forEach.call(document.querySelectorAll('.toc a'),function(a){links[a.getAttribute('href').slice(1)]=a;});
  var heads=[].slice.call(document.querySelectorAll('h2[id]'));
  var current=null;
  function spy(){
    var pick=heads[0];
    for(var i=0;i<heads.length;i++){ if(heads[i].getBoundingClientRect().top<=110) pick=heads[i]; }
    if(pick && pick.id!==current){
      if(current&&links[current]) links[current].classList.remove('on');
      current=pick.id;
      if(links[current]){ links[current].classList.add('on');
        var a=links[current], pn=a.closest('.toc');
        if(a.offsetTop < pn.scrollTop || a.offsetTop > pn.scrollTop+pn.clientHeight-40) pn.scrollTop=a.offsetTop-pn.clientHeight/2;
      }
    }
    top.classList.toggle('show', scrollY>700);
  }
  var top=document.querySelector('.top');
  top.addEventListener('click',function(){scrollTo({top:0,behavior:'smooth'});});
  var tick=false;
  addEventListener('scroll',function(){ if(!tick){tick=true;requestAnimationFrame(function(){spy();tick=false;});} },{passive:true});
  spy();
})();
"""

doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>XELOR — Platform Architecture &amp; Verification Dossier</title>
<meta name="description" content="The complete technical account of XELOR (system of record) and ONYX (intelligence layer), with every structural claim reproducible from the repository.">
<style>{CSS}</style>
</head>
<body>
<a href="#main" class="tbtn" style="position:absolute;left:-9999px;top:0"
   onfocus="this.style.left='8px';this.style.top='8px';this.style.zIndex='99'"
   onblur="this.style.left='-9999px'">Skip to content</a>

<header class="topbar">
  <div class="topbar-in">
    <button class="tbtn menu" id="menu" aria-expanded="false" aria-controls="toc">Contents</button>
    <div class="brand"><span class="mk">XE</span>
      <span><span class="bt">XELOR</span> <span class="bs">· Architecture &amp; Verification Dossier</span></span>
    </div>
    <span class="spacer"></span>
    <button class="tbtn" id="theme">Dark</button>
  </div>
</header>

<div class="masthead">
  <div class="mh-in">
    <div class="eyebrow">XELOR · PLATFORM ENGINEERING</div>
    <h1>Architecture &amp; Verification Dossier</h1>
    <p class="sub">{sub}</p>
    <div class="scope">{scope}</div>
    <div class="mh-meta">Measured from the live stack, the schema, the route table, the CI gates and the test runners — not from design documents · 16 August 2026</div>
  </div>
</div>

<div class="scrim"></div>
<div class="shell">
  <nav class="toc" id="toc" aria-label="Document sections">
    <h2>Contents</h2>
    <ol>{toc_html}</ol>
  </nav>
  <main id="main">{''.join(out)}</main>
</div>

<button class="top" aria-label="Back to top">↑</button>
<script>{JS}</script>
</body>
</html>
"""

# the print sheet's in-document TOC uses .toc — rename so it doesn't inherit the sidebar styles
doc = doc.replace('<div class="toc">', '<div class="toc-grid">')
out_path = pathlib.Path("XELOR_Architecture_Dossier.html")
out_path.write_text(doc)
print(f"wrote {out_path} — {len(doc):,} bytes, {len(toc)} sections")
