import json
from script import SEG
D=json.load(open('vo/durations.json'))
LINES={sid:lines for sid,_,lines in SEG}
T=0.0
chapters=[]; shots=[]; story={}; caps=[]; vo=[]; sfx=[]

def place(sid, start, gaps):
    """place lines of sid starting at start; gaps: list of gaps before line i (i>=1). returns starts, end"""
    st=[]; t=start
    for i,(cap,sp) in enumerate(LINES[sid]):
        if i: t+=gaps[i-1] if i-1<len(gaps) else 0.35
        d=D[f'{sid}_{i}']; st.append(round(t,3))
        caps.append({'start':round(t,3),'end':round(t+d,3),'text':cap}); vo.append((f'{sid}_{i}',round(t,3)))
        t+=d
    return st,t

def add_story(sid, lead=.45, gaps=(), tail=.6, title='', label='', extra=None, minlen=0):
    global T
    st,e=place(sid,T+lead,list(gaps))
    end=round(max(e+tail,T+minlen),3)
    story[sid]={'t':round(T,3),'end':end,'cues':st,'ends':[round(st[i]+D[f'{sid}_{i}'],3) for i in range(len(st))]}
    ch={'t':round(T,3),'end':end,'title':title,'label':label,'story':sid}
    if extra: ch.update(extra)
    chapters.append(ch); T=end
    return st

def A(at,target,type='click',value=None,after=None):
    return {'at':round(at,3),'target':target,'type':type,'value':value,'after':after}

def add_shot(sid, ch, sh, lead=.5, gaps=(), tail=.9, actions=lambda st,t0:[], fixed=None, minlen=0):
    global T
    t0=T
    st,e=place(sid,t0+lead,list(gaps))
    acts=actions([s-t0 for s in st],t0)
    lastA=max([a['at'] for a in acts],default=0)
    end=round(t0+fixed,3) if fixed else round(max(e+tail,t0+lastA+1.5,t0+minlen),3)
    c=dict(ch); c['t']=round(t0,3); c['end']=end; chapters.append(c)
    s=dict(sh); s['t']=round(t0,3); s['end']=end; s['actions']=acts; shots.append(s)
    for a in acts:
        sfx.append({'t':round(t0+a['at'],3),'kind':'tap' if s.get('phone') else ('key' if a['type'] in('type','input') else 'click')})
    T=end
    return st

# ---------- ACT 1: the problem ----------
add_story('chain',lead=.9,gaps=[.45],tail=.35,title='The problem',label='Made in India')
add_story('guess',lead=.25,tail=1.3)
add_story('scramble',lead=.35,gaps=[.4,.45],tail=.8)
add_story('inside',lead=.35,gaps=[.3,.5],tail=.8)
add_story('cost',lead=.3,gaps=[.9,.6],tail=1.4)
# ---------- ACT 2: the turn ----------
add_story('reveal',lead=1.5,gaps=[.5],tail=1.1)
add_story('network',lead=.5,gaps=[.35,.5,.5,.3],tail=1.2)
add_story('three',lead=.4,gaps=[.3],tail=1.2)
# ---------- ACT 3: XELOR Market ----------
MK='XELOR MARKET'
add_shot('mkt',{'title':'Find the right factory. See what it has delivered.','label':'XELOR Market · the flagship'},
  {'screen':'k.home','step':20,'role':MK,'highlight':'.mcard','holdLabel':'Earned records on every card','note':'XELOR Market · free to list · buyers and sellers deal directly'},
  lead=.6,gaps=[.3],tail=1.0,actions=lambda st,t0:[A(st[0]+2.0,'marketMachining','click',None,{'target':'.mcard','label':'Machining shops nearby'})])
add_story('price',lead=.4,gaps=[.4],tail=1.0,title='Pricing',label='XELOR Market')
add_shot('req',{'title':'Five matched sellers. Never resold.','label':'XELOR Market · buyer requests'},
  {'screen':'k.req','step':17,'role':MK,'highlight':'.reqbox','holdLabel':'A real buyer request','note':'Each request reaches five matched sellers at most · no fee per lead'},
  lead=.5,gaps=[.3],tail=1.0,actions=lambda st,t0:[A(st[1]+.9,'buyerInterest','click',None,{'target':'.card','label':'Interest sent with the record'})])
add_shot('help',{'title':'Machine down? Help in one tap.','label':'XELOR Market · find help'},
  {'screen':'k.help','step':16,'role':MK,'holdLabel':'Checked providers nearby','note':'Repairs · testing · compliance · finance · support schemes'},
  lead=.5,gaps=[.35],tail=1.0,actions=lambda st,t0:[A(st[0]+1.25,'machineHelp','click',None,{'target':'.urgent','label':'Nearest technicians found'}),A(st[1]+.7,'callTechnician','click',None,{'target':'.pro.first','label':'Technician called'})])
# ---------- Xelogram ----------
add_shot('gram',{'title':'A verified delivery becomes a post.','label':'Xelogram · on the supplier’s phone'},
  {'screen':'s.gram','step':18,'role':'SRI GANESH · SUPPLIER','phone':True,'holdLabel':'Drafted by the agent','note':'Xelogram · captions in Tamil, Kannada, Hindi or English · buyer names stay hidden'},
  lead=.5,gaps=[.3,.3],tail=1.2,actions=lambda st,t0:[A(st[1]+3.55,'postEnglish'),A(st[2]+.55,'approvePost','click',None,{'target':'.card.ok','label':'Posted on Xelogram'}),A(st[2]+2.0,'sharePost','click',None,{'target':'.shares','label':'Shared to WhatsApp Status'})])
add_shot('gramfeed',{'title':'Real work brings the next order.','label':'Xelogram · the feed'},
  {'screen':'k.gram','step':19,'role':'BUYERS · XELOGRAM','highlight':'.gpost','holdLabel':'Verified delivery badge','note':'Every post carries a verified-delivery badge and a Request quote button'},
  lead=.5,tail=1.0,actions=lambda st,t0:[A(st[0]+3.3,'postQuote','click',None,{'target':'.gpost','label':'Quote requested'})])
# ---------- the engine ----------
add_story('erp',lead=.45,gaps=[.4,.45],tail=.9,title='One place to run the factory.',label='The engine · agentic AI ERP',extra={'diagram':True})
add_shot('agent',{'title':'The agent prepares. People decide.','label':'The engine · agentic AI ERP'},
  {'screen':'p.agent','step':5,'role':'BUYING TEAM','highlight':'.card h4','holdLabel':'People decide','note':'Works alongside Tally · every action needs a person to approve'},
  lead=.5,gaps=[.3],tail=1.0)
# ---------- one complete order ----------
J=[('j1','p.sales',0,0,4,'.tbl tbody tr:first-child td:nth-child(2)','80 pumps',[(2.7,'confirmOrder','click',None,{'target':'.stamp','label':'Order confirmed'})],None),
   ('j2','p.plan',1,0,5,None,'Check the stock',[(1.25,'checkMaterials','click',None,{'target':'.hot td:nth-child(5)','label':'60 more needed'})],None),
   ('j3','p.net',2,1,4,None,'Ask the suppliers',[(2.4,'sendRequest','click',None,{'target':'.kpis .kpi:first-child','label':'Request sent'})],None),
   ('j4','s.quote',3,1,7,None,'A simple price reply',[(1.85,'quotePrice','type','2760',None),(3.2,'quoteDate','input','2026-10-09',None),(4.5,'quoteFreight','type','2400',None),(5.9,'sendQuote','click',None,{'target':'.bub:last-child','label':'Quote sent'})],None),
   ('j5','p.net',4,1,5,'[data-flip="ganesh"] .proof','Price + date + past work',[(3.4,'award','click',None,{'target':'.docsheet .dh','label':'Purchase order created'})],None),
   ('j6','w.po',5,1,5,'.card .amt','Check the amount',[(3.35,'approve','click',None,{'target':'.card','label':'Approved'})],None),
   ('j7','t.gate',6,2,6,None,'The parts arrive',[(1.5,'truck','click',None,None),(3.8,'scan','click',None,{'target':'.card.ok','label':'Delivery recorded'})],'Delivery day'),
   ('j8','t.qc',7,2,5,None,'Check before use',[(2.9,'passInspection','click',None,{'target':'.card.ok','label':'Parts passed · record updated'})],None),
   ('j9','m.wo',8,3,5,None,'Parts ready for the job',[(3.0,'release','click',None,{'target':'.card','label':'Job released'})],None),
   ('j10','m.wo',9,3,8,None,'80 pumps made',[(1.3,'recordOutput','click',None,{'target':'.hero','label':'80 pumps recorded'}),(2.8,'test0','click',None,None),(3.6,'test1','click',None,None),(4.4,'test2','click',None,None),(5.2,'test3','click',None,None),(6.6,'finalTest','click',None,{'target':'.center','label':'All checks passed'})],'After production'),
   ('j11','a.dispatch',10,4,4,None,'Send the pumps',[(1.4,'dispatch','click',None,None),(2.6,'irn','click',None,{'target':'.docsheet .dh','label':'Bill created'})],None),
   ('j12','a.books',12,4,2.6,None,'Finish the order',[(1.15,'closeOrder','click',None,{'target':'.stamp','label':'Order closed'})],None),
   ('j13','p.pass',13,5,4.2,'.card','Work history updated',[],None)]
TITLES=['1. Confirm the customer’s order.','2. Check which parts are missing.','3. Ask suppliers for a price.','4. The supplier sends a quote.','5. Choose the right supplier.','6. The owner approves the purchase.','7. Record the arriving parts.','8. Check the parts before using them.','9. Send the job to the factory team.','10. Build the pumps. Check the work.','11. Send the pumps and create the bill.','12. Close the order. Keep the record.','The factory’s record grows.']
ROLES=['PRIYA · BUYING TEAM','PRIYA · BUYING TEAM','PRIYA · BUYING TEAM','GANESH · SUPPLIER','PRIYA · BUYING TEAM','FACTORY OWNER','STORES','QUALITY TEAM','FACTORY TEAM','FACTORY TEAM','DISPATCH · ACCOUNTS','ACCOUNTS','FACTORY OWNER']
PHONE={'s.quote','w.po'}
for k,(sid,scr,step,flow,dur,hl,hold,acts,tj) in enumerate(J):
    lab='One complete order · Step %d of 12'%(k+1) if k<12 else 'One complete order · Done'
    sh={'screen':scr,'step':step,'core':True,'flow':flow,'holdLabel':hold,'role':ROLES[k]}
    if hl: sh['highlight']=hl
    if tj: sh['timeJump']=tj
    if scr in PHONE: sh['phone']=True
    if k==12: sh['call']='The factory’s record updates.'
    add_shot(sid,{'title':TITLES[k],'label':lab,'core':True},sh,lead=.3 if k else .35,gaps=[.3],fixed=dur,
             actions=lambda st,t0,acts=acts:[A(*a) for a in acts])
# ---------- close ----------
add_story('close',lead=.6,gaps=[.6],tail=2.6,title='XELOR',label='XELOR')
DUR=round(T,3)
for i,s in enumerate(shots): s['index']=i; s['holdStart']=.8
tl={'duration':DUR,'chapters':chapters,'shots':shots,'story':story}
open('timeline.js','w').write('window.XELOR_TIMELINE='+json.dumps(tl,ensure_ascii=False,indent=0)+';\n')
json.dump(caps,open('captions.json','w'),ensure_ascii=False,indent=1)
json.dump({'vo':vo,'sfx':sfx,'story':story,'duration':DUR},open('audio_plan.json','w'),indent=1)
print('duration',DUR, 'chapters',len(chapters),'shots',len(shots))
for c in chapters: print(round(c['t'],2),round(c['end'],2),c.get('story') or c['title'])
