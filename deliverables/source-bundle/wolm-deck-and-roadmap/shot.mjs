import { chromium } from 'playwright';
const [,, file, out, pdf] = process.argv;
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage({viewport:{width:1440,height:810},deviceScaleFactor:1});
await p.goto('file://'+process.cwd()+'/'+file); await p.waitForTimeout(800);
const r = await p.evaluate(()=>[...document.querySelectorAll('section.s')].map((s,i)=>{
  const st=s.getBoundingClientRect(); const f=s.querySelector('.sf'); const ft=f?f.getBoundingClientRect().top-st.top:810;
  let maxb=0, who='';
  for(const c of s.querySelectorAll('*')){ if(c.closest('.sf')||c.classList.contains('sf'))continue; const cs=getComputedStyle(c); if(cs.position==='absolute'&&!c.closest('.card'))continue;
    const r=c.getBoundingClientRect(); if(r.height===0)continue; const b=r.bottom-st.top; if(b>maxb){maxb=b;who=c.className||c.tagName}}
  const ov=[...s.querySelectorAll('*')].filter(e=>e.scrollWidth>e.clientWidth+2&&['visible',''].includes(getComputedStyle(e).overflowX)===false&&e.clientWidth>0).length;
  return {i:i+1, contentBottom:Math.round(maxb), who, footerTop:Math.round(ft), clipped:ov};
}));
console.log(r.map(x=>JSON.stringify(x)).join('\n'));
const n = r.length;
for(let i=0;i<n;i++){ const el=(await p.$$('section.s'))[i]; await el.screenshot({path:`${out}-${String(i+1).padStart(2,'0')}.png`}); }
if(pdf) await p.pdf({path:pdf,width:'1440px',height:'810px',printBackground:true,preferCSSPageSize:true});
await b.close();
