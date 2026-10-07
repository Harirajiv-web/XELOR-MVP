import { chromium } from 'playwright';
const [file,out,...ts]=process.argv.slice(2);const times=ts.map(Number);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:1600,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+process.cwd()+'/'+file+'?export');
await p.waitForFunction(()=>window.KISAN_FILM&&window.KISAN_FILM.ready(),null,{timeout:120000});
await p.evaluate(()=>window.KISAN_FILM.exportMode());
for(const t of times){await p.evaluate(async t=>{const F=window.KISAN_FILM;await F.seek(Math.max(0,t-1.5));for(let x=Math.max(0,t-1.5);x<=t;x+=1/30)await F.renderFrame(x);await F.renderFrame(t);},t);
 await p.screenshot({path:`${out}/t${t.toFixed(2).padStart(7,'0')}.png`});}
console.log(JSON.stringify(await p.evaluate(()=>window.KISAN_FILM.errors)),errs.join('\n'));
await b.close();
