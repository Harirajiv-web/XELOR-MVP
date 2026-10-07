import re, json, base64, subprocess
F='../film/'
s=open(F+'orig.html').read()
subprocess.run('ffmpeg -v error -y -i narration.wav -ac 1 -b:a 96k narration.mp3 && ffmpeg -v error -y -i music_fx.wav -ac 1 -b:a 128k music_fx.mp3',shell=True,check=True)
b64=lambda p: base64.b64encode(open(p,'rb').read()).decode()
def rep_block(s,id_,body):
    m=re.search(r'(<script id="%s"[^>]*>)(.*?)(</script>)'%id_,s,re.S); assert m,id_
    return s[:m.start(2)]+body+s[m.end(2):]
s=rep_block(s,'audio-data',b64('narration.mp3'))
s=rep_block(s,'music-data',b64('music_fx.mp3'))
s=rep_block(s,'caption-data',open('captions.json').read())
TL=open('timeline.js').read()
DUR=json.load(open('audio_plan.json'))['duration']
cov={"film":"XELOR product film, revision 4","runtimeSeconds":DUR,"structure":["Problem (story scenes)","XELOR reveal","How the network works","Three products","XELOR Market (flagship) on the real product","Pricing","Xelogram on the supplier phone and feed","The engine: agentic AI ERP","One complete order on the real product","Close"],"notes":"Product screens are the real demo with demonstration data. Pointer moves are Fitts-timed with overshoot and settle; phone screens use touch taps."}
s=rep_block(s,'coverage-data',json.dumps(cov,indent=1))
# scripts without id
ms=[m for m in re.finditer(r'<script>(.*?)</script>',s,re.S)]
assert len(ms)==6
s2=open('s2.js').read()
s5=open(F+'s5.js').read().replace("<strong>One shared order.</strong><span>Everyone sees the same updates.</span>","<strong>Works alongside Tally.</strong><span>No need to switch.</span>")
new=[open(F+'s1.js').read(),s2,TL,open(F+'s4.js').read(),s5,open('story.js').read()+'\n</script>\n<script>'+open('director.js').read()]
out=[];last=0
for m,body in zip(ms,new):
    out.append(s[last:m.start(1)]);out.append(body);last=m.end(1)
out.append(s[last:]); s=''.join(out)
# css
imgs=json.load(open('imgs.json'))
extra=open('story.css').read()+"""
#cursor{width:19px;height:27px;filter:drop-shadow(0 1px 1.4px rgba(0,0,0,.4));transform-origin:2px 2px}
#ripple{width:22px;height:22px;border:1.6px solid rgba(122,41,69,.7);border-radius:50%}
.touch{position:absolute;z-index:23;width:28px;height:28px;margin:-14px 0 0 -14px;pointer-events:none;display:none}
.touch i,.touch b{position:absolute;inset:0;border-radius:50%;display:block}
.touch i{background:rgba(255,255,255,.62);border:1.5px solid rgba(35,25,30,.38);box-shadow:0 2px 9px rgba(0,0,0,.28)}
.touch b{border:2px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(0,0,0,.12)}
.touch.big{width:46px;height:46px;margin:-23px 0 0 -23px}
"""
s=s.replace('</style></head>',extra+'</style></head>',1)
# markup
cur_old=re.search(r'<svg id="cursor".*?</svg>',s,re.S).group(0)
s=s.replace(cur_old,'<svg id="cursor" viewBox="0 0 24 34"><path d="M2 2V26.2L7.7 20.7 11.5 29.8 15.4 28.1 11.6 19.3H19.4Z" fill="#141114" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/></svg><div class="touch" id="touch"><i></i><b></b></div><div class="touch big" id="touch2"><i></i><b></b></div>')
story=open('story.html').read().replace('{{IMG_MKT}}',imgs['mkt']).replace('{{IMG_ERP}}',imgs['erp']).replace('{{IMG_GRAM}}',imgs['gram'])
s=s.replace('<div id="progressline"></div>',story+'<div id="progressline"></div>',1)
mm=lambda t:f"{int(t//60)}:{int(t%60):02d}"
reps=[('<span class="film-name">One connected factory</span>','<span class="film-name">The trusted network</span>'),
('<span class="sample">Manufacturing workspace</span>','<span class="sample">Demonstration data</span>'),
('<p>A complete product overview, followed by an end-to-end order journey. Clear narration. Real interface. Every team connected.</p>','<p>Why finding a trusted supplier is still so hard, how the XELOR network fixes it, then XELOR Market, Xelogram and one complete order on the real product.</p>'),
('2 min 33 sec · English narration & subtitles · Best viewed fullscreen',f'{int(DUR//60)} min {int(DUR%60)} sec · English narration & subtitles · Best viewed fullscreen'),
('0:00 / 2:33','0:00 / '+mm(DUR)),('max="153"','max="%s"'%DUR),
('2:33 · Problem → What XELOR does → Product tour → One complete order',mm(DUR)+' · The problem → The network → XELOR Market → Xelogram → The engine → One order')]
for a,b in reps:
    assert a in s,a; s=s.replace(a,b)
open('XELOR-Product-Film.html','w').write(s)
print(len(s)/1e6,'MB')
