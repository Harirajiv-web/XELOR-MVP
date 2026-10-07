window.XELOR_TIMELINE = (() => {
const chapters=[
 {t:0,end:10,title:'The trusted network behind what India manufactures.',label:'The everyday factory problem'},
 {t:10,end:20,title:'Small gaps slow everyone down.',label:'What gets in the way'},
 {t:20,end:26,title:'Everyone works from the same order.',label:'One connected factory',role:'EVERY TEAM',call:'One place for the whole team.',body:'Each person sees the work that matters to them.',features:['Buying · Suppliers · Owner','Stores · Factory team · Accounts','Owner sees progress and money']},
 {t:26,end:31,title:'Know what needs to happen next.',label:'Orders, parts & help',role:'BUYING TEAM',call:'See what is missing.',body:'The assistant prepares the next steps. People make the decisions.',features:['Customer orders & parts needed','Suggested next steps','People stay in control']},
 {t:31,end:37,title:'Choose a supplier with confidence.',label:'Buying & approvals',role:'BUYING TEAM · SUPPLIERS · OWNER',call:'Price is only part of the choice.',body:'Compare price, delivery date and past work.',features:['Messages & simple quote links','Purchase orders & delivery updates','Owner checks bigger purchases']},
 {t:37,end:43,title:'Know what arrived. Know what is ready.',label:'Stores, checks & factory work',role:'STORES · QUALITY · FACTORY TEAM',call:'The right parts for the right job.',body:'Track parts from the gate to the finished product.',features:['Deliveries, stock & parts on hold','Ready jobs & parts sent to the team','Finished work & final checks']},
 {t:43,end:48,title:'The bills stay connected to the work.',label:'Accounts & records',role:'ACCOUNTS',call:'See what is due, and when.',body:'Keep bills and payments in one place.',features:['Customer bills & payment dates','Options to get invoices paid early','History of actions & record checks']},
 {t:48,end:54,title:'Let good work build your reputation.',label:'Factory record & free machine time',role:'FACTORY OWNER · BUYING TEAM',call:'Show what your factory can do.',body:'Share work history and free machine time with buyers.',features:['Supplier history & new invitations','A shareable factory passport','Available time from the job schedule']},
 {t:54,end:61,title:'Find the people and help you need.',label:'The marketplace',role:'XELOR MARKET',call:'Suppliers. Buyers. Local help.',body:'A place to find products, new work and support.',features:['Products & buyer requests','Repairs & service professionals','Support schemes & application help']},
 {t:61,end:68,title:'Show your work. Choose what to share.',label:'Xelogram & your factory page',role:'SUPPLIERS · MARKETPLACE',call:'Good work can bring the next order.',body:'Approve a post, share it, and let buyers get in touch.',features:['Work posts, likes & follows','Requests for a price','Public, buyers only, or private']},
 {t:68,end:72,title:'Start small. Add tools as you grow.',label:'Ways to get started',role:'PLANS',call:'Start with a free listing.',body:'Add verification or factory tools when you need them.',features:['Free listing','Verification & connected tools'],note:'Optional paid pilot: ₹20,000. Separate from marketplace plans.'},
 {t:72,end:76,title:'1. Confirm the customer’s order.',label:'One complete order · Step 1 of 12',role:'PRIYA · BUYING TEAM',call:'80 pumps to make.',body:'Confirm once. The rest of the team sees the same order.',features:['Customer, quantity and date','One shared order record'],core:true},
 {t:76,end:81,title:'2. Check which parts are missing.',label:'One complete order · Step 2 of 12',role:'PRIYA · BUYING TEAM',call:'We need 60 more pump bodies.',body:'These metal bodies form the outside of each pump.',features:['80 needed · 20 already in stock','60 more to buy'],core:true},
 {t:81,end:85,title:'3. Ask suppliers for a price.',label:'One complete order · Step 3 of 12',role:'PRIYA · BUYING TEAM',call:'The request is already filled in.',body:'The part, quantity and delivery date come from the order.',features:['Choose suppliers','Send the same clear request'],core:true},
 {t:85,end:92,title:'4. The supplier sends a quote.',label:'One complete order · Step 4 of 12',role:'GANESH · SUPPLIER',call:'Open a link. Add the details.',body:'Enter the price, delivery date and transport cost.',features:['A simple link, with no login','The buying team sees the reply'],core:true},
 {t:92,end:97,title:'5. Choose the right supplier.',label:'One complete order · Step 5 of 12',role:'PRIYA · BUYING TEAM',call:'Look at price, delivery and history.',body:'XELOR helps compare the offers. Priya makes the choice.',features:['See how the offers compare','Create the purchase order'],core:true},
 {t:97,end:102,title:'6. The owner approves the purchase.',label:'One complete order · Step 6 of 12',role:'FACTORY OWNER',call:'Check the amount before buying.',body:'This order needs the owner’s approval.',features:['See the amount and the reason','Approve from a phone'],core:true},
 {t:102,end:108,title:'7. Record the arriving parts.',label:'One complete order · Step 7 of 12',role:'STORES',call:'Scan the delivery at the gate.',body:'The delivery stays linked to the purchase order.',features:['The parts arrive on delivery day','Record them once'],core:true},
 {t:108,end:113,title:'8. Check the parts before using them.',label:'One complete order · Step 8 of 12',role:'QUALITY TEAM',call:'Good parts go into stock.',body:'Parts are checked before the factory team uses them.',features:['Inspect the delivery','Release the parts that pass'],core:true},
 {t:113,end:118,title:'9. Send the job to the factory team.',label:'One complete order · Step 9 of 12',role:'FACTORY TEAM',call:'The job and its parts move together.',body:'Start the work when all the parts are ready.',features:['Release the job','Issue the parts to that job'],core:true},
 {t:118,end:126,title:'10. Build the pumps. Check the work.',label:'One complete order · Step 10 of 12',role:'FACTORY TEAM',call:'80 finished pumps. Four final checks.',body:'Record the finished quantity, then check each pump.',features:['Record 80 finished pumps','Complete all four checks','Mark the job ready to send'],core:true},
 {t:126,end:130,title:'11. Send the pumps and create the bill.',label:'One complete order · Step 11 of 12',role:'DISPATCH · ACCOUNTS',call:'The bill comes from the same order.',body:'The team does not type the order again.',features:['Record the shipment','Create the customer’s bill'],note:'Tax filing shown for illustration.',core:true},
 {t:130,end:134,title:'12. Close the order. Keep the record.',label:'One complete order · Step 12 of 12',role:'ACCOUNTS',call:'The completed work stays with you.',body:'Close the order and update the factory’s work history.',features:['Order closed','Factory record updated'],core:true},
 {t:134,end:138,title:'The trusted network behind what India manufactures.',label:'XELOR'}
];
const a=(at,target,type='click',value,after)=>({at,target,type,value,after});
const shots=[
 {t:20,screen:'p.home',step:13,highlight:'.route-h .doc',holdLabel:'One shared order'},
 {t:26,screen:'p.agent',step:5,highlight:'.card h4',holdLabel:'People decide'},
 {t:31,screen:'p.net',step:4,highlight:'[data-flip="ganesh"] .proof',holdLabel:'Check the supplier’s record'},
 {t:37,screen:'t.stock',step:8,highlight:'.kpi',holdLabel:'Know what is ready'},
 {t:43,screen:'a.books',step:14,highlight:'.kpi',holdLabel:'See the payment dates'},
 {t:48,screen:'p.pass',step:16,highlight:'.card',holdLabel:'Work builds a record'},
 {t:51.2,screen:'p.cap',step:16,call:'Find available machine time.',highlight:'.card',holdLabel:'Make use of free time'},
 {t:54,screen:'k.home',step:20,highlight:'.mcard',holdLabel:'Find products and services'},
 {t:58.2,screen:'k.schemes',step:20,call:'Find support for the factory.',highlight:'.card',holdLabel:'Help with the next step'},
 {t:61,screen:'k.gram',step:20,highlight:'.gpost',holdLabel:'Share completed work'},
 {t:65,screen:'k.profile',step:20,call:'You choose what stays private.',holdLabel:'You control what is shared'},
 {t:68,screen:'k.plans',step:20,holdLabel:'Start with what you need'},
 {t:72,screen:'p.sales',step:0,core:true,flow:0,highlight:'.tbl tbody tr:first-child td:nth-child(2)',holdLabel:'80 pumps',actions:[a(2.7,'confirmOrder','click',null,{target:'.stamp',label:'Order confirmed'})]},
 {t:76,screen:'p.plan',step:1,core:true,flow:0,holdLabel:'Check the stock',actions:[a(1.25,'checkMaterials','click',null,{target:'.hot td:nth-child(5)',label:'60 more needed'})]},
 {t:81,screen:'p.net',step:2,core:true,flow:1,holdLabel:'Ask the suppliers',actions:[a(2.4,'sendRequest','click',null,{target:'.kpis .kpi:first-child',label:'Request sent'})]},
 {t:85,screen:'s.quote',step:3,core:true,flow:1,holdLabel:'A simple price reply',actions:[a(1.85,'quotePrice','type','2760'),a(3.2,'quoteDate','input','2026-10-09'),a(4.5,'quoteFreight','type','2400'),a(5.9,'sendQuote','click',null,{target:'.bub:last-child',label:'Quote sent'})]},
 {t:92,screen:'p.net',step:4,core:true,flow:1,highlight:'[data-flip="ganesh"] .proof',holdLabel:'Price + date + past work',actions:[a(3.4,'award','click',null,{target:'.docsheet .dh',label:'Purchase order created'})]},
 {t:97,screen:'w.po',step:5,core:true,flow:1,highlight:'.card .amt',holdLabel:'Check the amount',actions:[a(3.35,'approve','click',null,{target:'.card',label:'Approved'})]},
 {t:102,screen:'t.gate',step:6,core:true,flow:2,timeJump:'Delivery day',holdLabel:'The parts arrive',actions:[a(1.5,'truck'),a(3.8,'scan','click',null,{target:'.card.ok',label:'Delivery recorded'})]},
 {t:108,screen:'t.qc',step:7,core:true,flow:2,holdLabel:'Check before use',actions:[a(2.9,'passInspection','click',null,{target:'.card.ok',label:'Parts passed'})]},
 {t:113,screen:'m.wo',step:8,core:true,flow:3,holdLabel:'Parts ready for the job',actions:[a(3.0,'release','click',null,{target:'.card',label:'Job released'})]},
 {t:118,screen:'m.wo',step:9,core:true,flow:3,timeJump:'After production',holdLabel:'80 pumps made',actions:[a(1.3,'recordOutput','click',null,{target:'.hero',label:'80 pumps recorded'}),a(2.8,'test0'),a(3.6,'test1'),a(4.4,'test2'),a(5.2,'test3'),a(6.6,'finalTest','click',null,{target:'.center',label:'All checks passed'})]},
 {t:126,screen:'a.dispatch',step:10,core:true,flow:4,holdLabel:'Send the pumps',actions:[a(1.4,'dispatch'),a(2.6,'irn','click',null,{target:'.docsheet .dh',label:'Bill created'})]},
 {t:130,screen:'a.books',step:12,core:true,flow:4,holdLabel:'Finish the order',actions:[a(1.15,'closeOrder','click',null,{target:'.stamp',label:'Order closed'})]},
 {t:132.4,screen:'p.pass',step:13,core:true,flow:5,call:'The factory’s record updates.',holdLabel:'Work history updated',highlight:'.card'}
];
// Add a 15-second explanation before the existing product tour.
// Every product shot keeps its original duration and relative action times.
chapters.forEach(c=>{if(c.t>=20){c.t+=15;c.end+=15;}});
chapters.splice(2,0,{t:20,end:35,title:'What does XELOR do?',label:'The whole factory, connected',diagram:true});
shots.forEach(s=>{s.t+=15;});
shots.forEach((s,i)=>{s.end=shots[i+1]?.t??149;s.index=i;s.actions=s.actions||[];s.holdStart=.8;});
return {duration:153,chapters,shots,coreStart:87,closingStart:149};
})();
