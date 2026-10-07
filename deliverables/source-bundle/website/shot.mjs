import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for(const [name,vw,scheme] of [['desk',1360,'light'],['mob',400,'light'],['dark',1360,'dark']]){
 const p=await b.newPage({viewport:{width:vw,height:900},colorScheme:scheme});
 const errs=[];p.on('pageerror',e=>errs.push(String(e)));
 await p.goto('file://'+process.cwd()+'/vercel/index.html',{waitUntil:'load'});await p.waitForTimeout(2500);
 const ov=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 await p.screenshot({path:`s-${name}.png`,fullPage:true});console.log(name,'overflow',ov,errs.join('|'));await p.close();}
await b.close();
