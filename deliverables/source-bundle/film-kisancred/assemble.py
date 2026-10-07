import re
s=open('orig.html').read()
ms=list(re.finditer(r'<script>(.*?)</script>',s,re.S)); assert len(ms)==8
bodies=[m.group(1) for m in ms]
bodies[1]=open('s2p.js').read(); bodies[7]=open('director.js').read()
out=[];last=0
for m,b in zip(ms,bodies): out.append(s[last:m.start(1)]);out.append(b);last=m.end(1)
out.append(s[last:]);s=''.join(out)
old=re.search(r'<svg id="cursor".*?</svg>',s,re.S).group(0)
s=s.replace(old,'<svg id="cursor" viewBox="0 0 24 34" aria-hidden="true"><path d="M2 2V26.2L7.7 20.7 11.5 29.8 15.4 28.1 11.6 19.3H19.4Z" fill="#141114" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/></svg><div class="touch" id="touch"><i></i><b></b></div><div class="touch big" id="touch2"><i></i><b></b></div>')
css="""
#cursor{width:19px!important;height:27px!important;filter:drop-shadow(0 1px 1.4px rgba(0,0,0,.4))!important;transform-origin:2px 2px!important}
#ripple{border:1.6px solid rgba(40,83,62,.75)!important;border-radius:50%;background:none!important}
.touch{position:absolute;z-index:23;width:28px;height:28px;margin:-14px 0 0 -14px;pointer-events:none;display:none}
.touch i,.touch b{position:absolute;inset:0;border-radius:50%;display:block}
.touch i{background:rgba(255,255,255,.62);border:1.5px solid rgba(35,25,30,.38);box-shadow:0 2px 9px rgba(0,0,0,.28)}
.touch b{border:2px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(0,0,0,.12)}
.touch.big{width:46px;height:46px;margin:-23px 0 0 -23px}
"""
i=s.rindex('</style>',0,s.index('<body')); s=s[:i]+css+s[i:]
open('KisanCred-Product-Film.html','w').write(s);print(len(s)/1e6)
