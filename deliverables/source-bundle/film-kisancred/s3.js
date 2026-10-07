window.KISAN_TIMELINE=(()=>{
const chapters=[
 {t:0,end:8,title:'The trade happens. The record gets lost.',label:'The farmer’s everyday problem'},
 {t:8,end:15,title:'A good trading history. Hard to show the bank.',label:'The record is missing'},
 {t:15,end:30,title:'The whole farm economy, connected.',label:'One marketplace. A credible farmer record.',diagram:true},
 {t:30,end:37,title:'More buyers for the harvest. Fresh from the farm.',label:'KisanCred marketplace',role:'FARMERS · BUYERS',call:'Compare offers. Connect directly.',body:'Fresh produce and cash crops reach buyers beyond the usual contact.',features:['Farmers choose their asking price','Buyers find farms near them']},
 {t:37,end:41,title:'Find the people and tools the farm needs.',label:'Farm services & supplies',role:'FARMERS · SERVICE PROVIDERS',call:'Local services, one search.',body:'Find a machine, an operator or farm supplies nearby.',features:['Farm services','Machinery and inputs']},
 {t:41,end:48,title:'A wider market for every distributor.',label:'Distributor workspace',role:'DISTRIBUTORS',call:'Source from farms. Reach more buyers.',body:'Stock, farmer sourcing, leads and bulk orders stay together.',features:['One stock view','Direct farm sourcing','Customer orders and enquiries']},
 {t:48,end:52,title:'Let buyers see what is ready.',label:'Kisan Feed',role:'FARMERS · BUYERS',call:'A harvest photo starts the connection.',body:'Share a harvest, discover local sellers and send an enquiry.'},
 {t:52,end:56,title:'Compare prices before you connect.',label:'Seller quotes',role:'FARMER',call:'The farmer chooses.',body:'Compare price and delivery, then choose the seller.'},
 {t:56,end:61,title:'1. Ravi lists his harvest.',label:'One connected journey',role:'RAVI · FARMER',call:'His harvest. His asking price.',body:'Publish the available quantity so buyers can find it.',core:true},
 {t:61,end:66,title:'2. A buyer posts what she needs.',label:'One connected journey',role:'ANNAPOORNA · BUYER',call:'Two items in one request.',body:'Tomatoes from a farmer and onions from a distributor.',core:true},
 {t:66,end:70,title:'3. Compare the match and send requests.',label:'One connected journey',role:'BUYER',call:'Nearby supply, together.',body:'Choose the farmer and distributor for this request.',core:true},
 {t:70,end:73,title:'4. The distributor accepts.',label:'One connected journey',role:'KAVERI AGRI · DISTRIBUTOR',call:'A new buyer for existing stock.',body:'The distributor accepts the onion request.',core:true},
 {t:73,end:76,title:'5. Ravi accepts the tomato request.',label:'One connected journey',role:'RAVI · FARMER',call:'His harvest has a buyer.',body:'Ravi checks the quantity and price.',core:true},
 {t:76,end:83,title:'6. Continue the conversation on WhatsApp.',label:'Connection → direct conversation',role:'BUYER · SELLER',call:'Agree the details directly.',body:'Quantity, quality and pickup stay in the conversation.',features:['A thread for the accepted request','KisanCred handles no money'],core:true},
 {t:83,end:87,title:'7. Confirm the completed trade.',label:'After both deliveries',role:'BUYER · SELLERS',call:'A shared trading record.',body:'Both sides confirm what was delivered.',core:true},
 {t:87,end:94,title:'8. Build credibility. Request a loan.',label:'Farmer Credit Passport',role:'RAVI · FARMER',call:'A clearer record for the bank.',body:'The farmer controls when to share it.',core:true},
 {t:94,end:105,title:'9. Send the application with permission.',label:'Farmer → KisanCred for Banks',role:'RAVI · FARMER',call:'His phone. His permission.',body:'A loan request reaches the selected bank’s workspace.',core:true},
 {t:105,end:110,title:'KisanCred for Banks: reach more farmers.',label:'The bank’s workflow · 30 seconds',role:'BANK',call:'New applicants from village clusters.',body:'Farmer requests arrive in the bank’s own KisanCred workspace.',core:true},
 {t:110,end:115,title:'The bank appoints its field officer.',label:'The bank’s workflow',role:'BANK · FIELD OFFICER',call:'A field app replaces the notebook.',body:'Assign the visit, then capture the findings at the farm.',core:true},
 {t:115,end:120,title:'Check the farmer and the farm location.',label:'KisanCred Field · bank-appointed officer',role:'SUMA · FIELD OFFICER',call:'A guided visit.',body:'Confirm location and identity on the phone.',core:true},
 {t:120,end:127,title:'Capture photos and complete the farm checks.',label:'KisanCred Field · offline-ready',role:'FIELD OFFICER',call:'A clear inspection report.',body:'The app keeps the evidence together, even with weak signal.',core:true},
 {t:127,end:130,title:'The report updates the bank’s file.',label:'Field app → bank software',role:'FIELD OFFICER · BANK',call:'One connected inspection.',body:'Sync once connected. The bank receives the report.',core:true},
 {t:130,end:135,title:'A credit profile the bank can review.',label:'KisanCred for Banks · lending decision',role:'BANK',call:'The bank reviews and decides.',body:'Farm checks, source records and reasons support the review.',core:true},
 {t:135,end:140,title:'Ravi sees the bank’s decision.',label:'The connected journey is complete',role:'RAVI · FARMER',call:'Less paperwork. Clearer reasons.',body:'The bank handles the loan and next steps directly.',core:true},
 {t:140,end:145,title:'Better connections. A stronger credit story.',label:'KisanCred'}
];
const a=(at,target,after,type='click',value)=>({at,target,type,value,after});
const sel=(key,extra='')=>'[data-a="'+key+'"]'+extra;
const shots=[
 {t:30,scene:'fresh-market',screen:'b.market',highlight:'.im-row',holdLabel:'Buy fresh, directly from farms'},
 {t:34,scene:'fresh-farmer',screen:'f.home',highlight:'.im-card',detail:'detail:#vp .im-card:first-child',holdLabel:'The farmer sets the asking price'},
 {t:37,scene:'services',screen:'f.home',highlight:'.im-card',detail:'detail:#vp .im-card:first-child',holdLabel:'Find a local service provider'},
 {t:41,scene:'stock',screen:'x.stock',highlight:'.kpis',holdLabel:'Manage stock and customer demand'},
 {t:44.5,scene:'source',screen:'x.source',highlight:'.im-row',holdLabel:'Source directly from nearby farms'},
 {t:48,scene:'feed',screen:'f.feed',highlight:'.fp',holdLabel:'Make the harvest visible'},
 {t:52,scene:'quotes',screen:'f.quotes',highlight:'.im-card.quote.best',detail:'detail:#vp .im-card.quote:first-child,#vp .im-card.quote.best',holdLabel:'Compare before choosing'},
 {t:56,scene:'sell',screen:'f.sell',core:true,flow:0,highlight:'.card',holdLabel:'Ravi chooses his price',actions:[a(4.5,sel('publish-lot'),{target:'.card.ok',label:'Harvest listed'})]},
 {t:61,scene:'demand',screen:'b.demand',core:true,flow:1,highlight:'#d1',holdLabel:'Post the buying requirement',actions:[a(4,sel('post-demand'),{target:'.res',label:'Nearby supply found'})]},
 {t:66,scene:'matches',screen:'b.matches',core:true,flow:1,highlight:'.resc.best',holdLabel:'Choose the supply match',actions:[a(3,sel('send-orders'),{label:'Requests sent to both sellers'})]},
 {t:70,scene:'dist-accept',screen:'x.orders',core:true,flow:2,holdLabel:'Accept the onion request',actions:[a(2.2,sel('accept','[data-id="KC-2052"]'),{label:'Distributor accepted'})]},
 {t:73,scene:'farmer-accept',screen:'f.orders',core:true,flow:2,holdLabel:'Accept the tomato request',actions:[a(2.2,sel('accept','[data-id="KC-2051"]'),{label:'Ravi accepted'})]},
 {t:76,scene:'whatsapp',screen:'b.chat',core:true,flow:2,highlight:'.wa',holdLabel:'The conversation continues directly',actions:[a(3.8,'#wa-in',null,'type','Pickup at 7 am works.'),a(5.6,sel('chat-send','[data-id="KC-2051"]'),{label:'Pickup details sent on WhatsApp'})]},
 {t:83,scene:'delivery',screen:'b.orders',core:true,flow:3,timeJump:'After both deliveries',holdLabel:'Confirm what arrived',actions:[a(1.2,sel('confirm','[data-id="KC-2052"]'),{label:'Onions confirmed'}),a(2.7,sel('confirm','[data-id="KC-2051"]'),{label:'Both sides confirmed'})]},
 {t:87,scene:'passport',screen:'f.record',core:true,flow:4,highlight:'.nodes',detail:'detail:#vp .scr > .card:first-child,#vp .nodes',holdLabel:'Build a credible farmer record',actions:[a(5.7,'[data-go="f.loan"]',{label:'Loan request opened'})]},
 {t:94,scene:'consent',screen:'f.loan',core:true,flow:4,holdLabel:'Share only with permission',actions:[a(.5,sel('brief-play')),a(3.2,sel('consent-toggle')),a(4.8,sel('otp-fill')),a(6.8,sel('consent-confirm'),{label:'Application shared with the bank'})]},
 {t:105,scene:'bank-queue',screen:'k.queue',core:true,flow:5,highlight:'.kc-tbl',holdLabel:'The bank receives the application',actions:[a(3.4,sel('bank-open','[data-id="ravi"]'),{label:'Ravi’s loan file opened'})]},
 {t:110,scene:'bank-assignment',screen:'k.assign',core:true,flow:5,highlight:'.kc-assignment',holdLabel:'Assigned by the bank',actions:[a(2.4,'[data-film="assign-officer"]',{label:'Suma assigned by the bank'})]},
 {t:113.2,scene:'assignments',screen:'o.visits',core:true,flow:5,highlight:'.kc-task',detail:'detail:#vp .kc-task:not(.done)',holdLabel:'The visit appears in the field app'},
 {t:115,scene:'field-check',screen:'o.visit',core:true,flow:5,timeJump:'At Ravi’s farm',holdLabel:'Check location and identity',actions:[a(.35,sel('geo')),a(1.65,sel('ostep','[data-v="1"]')),a(1.95,sel('idrun')),a(3.55,sel('ostep','[data-v="2"]'))]},
 {t:120,scene:'field-photos',screen:'o.visit',core:true,flow:5,holdLabel:'Capture the farm evidence',actions:[a(.25,sel('photo','[data-i="0"]')),a(.9,sel('photo','[data-i="1"]')),a(1.55,sel('photo','[data-i="2"]')),a(2.2,sel('photo','[data-i="3"]')),a(2.85,sel('ostep','[data-v="3"]')),a(3.3,sel('check','[data-i="0"]')),a(3.8,sel('check','[data-i="1"]')),a(4.3,sel('check','[data-i="2"]')),a(4.8,sel('check','[data-i="3"]')),a(5.4,sel('ostep','[data-v="4"]'))]},
 {t:127,scene:'field-submit',screen:'o.visit',core:true,flow:5,holdLabel:'Send the report to the bank',actions:[a(.75,sel('officer-submit'),{label:'Inspection received by the bank'})]},
 {t:130,scene:'bank-review',screen:'k.file',core:true,flow:5,highlight:'.kc-score',holdLabel:'Credit profile and verified facts',actions:[a(3.7,sel('decide','[data-d="APPROVE"]'),{label:'Bank decision recorded'})]},
 {t:135,scene:'decision',screen:'f.decision',core:true,flow:6,highlight:'.card',holdLabel:'Ravi sees the bank’s decision'}
];
shots.forEach((s,i)=>{s.end=shots[i+1]?.t??140;s.index=i;s.actions=s.actions||[];s.holdStart=.8;});
return{duration:145,chapters,shots,coreStart:56,bankStart:105,bankEnd:135,closingStart:140};
})();
