import { chromium } from 'playwright';
const [a,b]=process.argv.slice(2).map(Number);const FPS=30;
const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await br.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1.2});
await p.goto('file://'+process.cwd()+'/KisanCred-Product-Film.html?export');
await p.waitForFunction(()=>window.KISAN_FILM&&window.KISAN_FILM.ready(),null,{timeout:180000});
await p.evaluate(()=>window.KISAN_FILM.exportMode());
const f0=Math.round(a*FPS),f1=Math.round(b*FPS);
await p.evaluate(t=>window.KISAN_FILM.seek(t),f0/FPS);
for(let f=f0;f<f1;f++){await p.evaluate(t=>window.KISAN_FILM.renderFrame(t),f/FPS);await p.screenshot({path:`frames/f${String(f).padStart(5,'0')}.jpg`,type:'jpeg',quality:93});if(f%300===0)console.log(a,f);}
console.log('done',a,b,JSON.stringify(await p.evaluate(()=>window.KISAN_FILM.errors)));
await br.close();
