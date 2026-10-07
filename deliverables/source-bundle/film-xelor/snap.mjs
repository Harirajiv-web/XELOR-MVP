import { chromium } from 'playwright';
const times=process.argv.slice(3).map(Number), out=process.argv[2];
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
const errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('file://'+process.cwd()+'/XELOR-Product-Film.html?export');
await p.waitForFunction(()=>window.XELOR_FILM&&window.XELOR_FILM.ready(),null,{timeout:120000});
await p.evaluate(()=>window.XELOR_FILM.exportMode());
for(const t of times){
  // play forward through the preceding second so pointer motions are realistic
  await p.evaluate(async t=>{const F=window.XELOR_FILM;if(t<1.2){await F.renderFrame(t);return;}await F.seek(Math.max(0,t-1.2));for(let x=t-1.2;x<=t;x+=1/30)await F.renderFrame(x);await F.renderFrame(t);},t);
  await p.screenshot({path:`${out}/t${String(t.toFixed(2)).padStart(7,'0')}.png`});
}
console.log(JSON.stringify(await p.evaluate(()=>window.XELOR_FILM.errors)),errs.slice(0,8).join('\n'));
await b.close();
