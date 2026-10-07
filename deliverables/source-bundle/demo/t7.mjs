import { chromium } from 'playwright';
const url='file://'+process.cwd()+'/build/full.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:1440,height:960}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto(url);await p.waitForTimeout(500);
const snap=async(n)=>{await p.evaluate(()=>{document.getElementById('overlay').innerHTML='';document.getElementById('toasts').innerHTML='';window.scrollTo(0,300)});await p.waitForTimeout(1100);await p.screenshot({path:'shots7/'+n+'.png'})};
// market screens before the tour
for(const id of ['k.home','k.req','k.help','k.schemes','k.gram','k.profile','k.plans','s.gram']){await p.evaluate(id=>go(id),id);await p.waitForTimeout(60)}
await p.evaluate(()=>go('k.home'));await snap('m01-home');
await p.click('[data-tour=start]');
const n=await p.evaluate(()=>TOUR.length);
for(let i=0;i<n;i++){const t=await p.textContent('#tour h2');await p.click('[data-tour=next]');await p.waitForTimeout(300);await p.evaluate(()=>document.getElementById('overlay').innerHTML='');
  const dn=await p.evaluate(i=>TOUR[i].done(),i);console.log(i+1,dn?'✓':'✗',t);
  if(i>=16) await snap('t'+(i+1));
  await p.click('[data-tour=next]');await p.waitForTimeout(200)}
console.log('final:',await p.textContent('#tour h2'));
const ids=await p.evaluate(()=>Object.keys(SCREENS));for(const id of ids){await p.evaluate(id=>go(id),id);await p.waitForTimeout(40)}
for(const id of ['k.home','k.req','k.help','k.schemes','k.gram','k.profile','k.plans','s.gram','p.agent']){await p.evaluate(id=>go(id),id);await snap('e-'+id)}
await p.evaluate(()=>{document.documentElement.dataset.theme='dark';go('k.gram')});await snap('d-gram');
await p.evaluate(()=>go('k.help'));await snap('d-help');
console.log('errors',errs);await b.close();
