import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:794,height:1123},deviceScaleFactor:2});
await p.goto('file://'+process.cwd()+'/onepager2.html',{waitUntil:'networkidle'});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(400);
const o=await p.evaluate(()=>{const pg=document.querySelector('.page').getBoundingClientRect();const m=document.querySelector('.main');return {pageH:pg.height,mainBottom:m.lastElementChild.getBoundingClientRect().bottom,ftTop:document.querySelector('.ft').getBoundingClientRect().top}});console.log(o);
await p.screenshot({path:'prev/onepager2.png',fullPage:true});
await p.pdf({path:'XELOR-Product-One-Pager-v2.pdf',format:'A4',printBackground:true,preferCSSPageSize:true});
await b.close();
