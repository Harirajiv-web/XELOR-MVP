import { chromium } from 'playwright';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage({viewport:{width:794,height:1123},deviceScaleFactor:2});
await p.goto('file://'+process.cwd()+'/pricing2.html'); await p.waitForTimeout(700);
console.log(JSON.stringify(await p.evaluate(()=>({secs:[...document.querySelectorAll('main section')].map(e=>Math.round(e.getBoundingClientRect().bottom)),ft:Math.round(document.querySelector('footer.ft').getBoundingClientRect().top),ftb:Math.round(document.querySelector('footer.ft').getBoundingClientRect().bottom)}))));
await p.screenshot({path:'shots/pr2.png'});
await p.pdf({path:'pricing2.pdf',format:'A4',printBackground:true,preferCSSPageSize:true});
await b.close();
