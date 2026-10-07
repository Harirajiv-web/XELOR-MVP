import json, numpy as np, soundfile as sf, subprocess
SR=44100
plan=json.load(open('audio_plan.json')); DUR=plan['duration']; ST=plan['story']
N=int((DUR+0.5)*SR)
def rs(x,sr):  # resample linear
    if sr==SR: return x
    t=np.arange(int(len(x)*SR/sr))/SR; return np.interp(t,np.arange(len(x))/sr,x)
# narration
nar=np.zeros(N)
for cid,t in plan['vo']:
    x,sr=sf.read(f'vo/{cid}.wav'); x=rs(x,sr); i=int(t*SR); nar[i:i+len(x)]+=x[:N-i]
nar=nar/np.max(np.abs(nar))*0.89
sf.write('narration.wav',nar.astype(np.float32),SR)
R=np.random.default_rng(5)
def env(n,a,d): t=np.arange(n)/SR; return np.minimum(1,t/max(a,1e-4))*np.exp(-t/d)
def lp(x,a):  # one-pole lowpass, a in (0,1)
    y=np.zeros_like(x); s=0.0
    for i in range(len(x)): s+=a*(x[i]-s); y[i]=s
    return y
def impact(g=.8):
    n=int(2.2*SR); t=np.arange(n)/SR; f=38+52*np.exp(-t*7); ph=2*np.pi*np.cumsum(f)/SR
    x=np.sin(ph)*np.exp(-t/0.75)+0.5*np.sin(ph*0.5)*np.exp(-t/1.1)
    nb=R.standard_normal(n)*env(n,.001,.05); x+=lp(nb,.08)*1.6
    return g*x/np.max(np.abs(x))
def whoosh(d=1.0,g=.22):
    n=int(d*SR); t=np.arange(n)/SR; nz=R.standard_normal(n); e=np.sin(np.pi*t/d)**2
    y=np.zeros(n); s=0.0; s2=0.0
    for i in range(n):
        a=0.02+0.25*e[i]; s+=a*(nz[i]-s); s2+=0.5*(s-s2)
    y=(s:=None) or 0
    # vectorized approx: lowpass with time-varying via blocks
    out=np.zeros(n); blk=512; st=0.0
    for b in range(0,n,blk):
        a=0.02+0.3*e[min(n-1,b+blk//2)]; seg=nz[b:b+blk]
        for j in range(len(seg)): st+=a*(seg[j]-st); out[b+j]=st
    out=out*e; return g*out/np.max(np.abs(out))
def click(g=.10):
    n=int(.05*SR); t=np.arange(n)/SR; x=R.standard_normal(n)*np.exp(-t/.0015)+0.6*np.sin(2*np.pi*2100*t)*np.exp(-t/.006)
    return g*x/np.max(np.abs(x))
def tap(g=.08):
    n=int(.08*SR); t=np.arange(n)/SR; x=np.sin(2*np.pi*1150*t)*np.exp(-t/.012)+0.3*R.standard_normal(n)*np.exp(-t/.002)
    return g*x/np.max(np.abs(x))
def pop(g=.07):
    n=int(.09*SR); t=np.arange(n)/SR; f=520+480*t/.09; x=np.sin(2*np.pi*np.cumsum(f)/SR)*np.sin(np.pi*t/.09)
    return g*x
def key(g=.05):
    n=int(.03*SR); t=np.arange(n)/SR; x=R.standard_normal(n)*np.exp(-t/.003); return g*lp(x,.5)/0.3
def chime(g=.12,f0=880):
    n=int(1.2*SR); t=np.arange(n)/SR; x=(np.sin(2*np.pi*f0*t)+.6*np.sin(2*np.pi*f0*1.5*t)+.3*np.sin(2*np.pi*f0*2*t))*env(n,.004,.35)
    return g*x/np.max(np.abs(x))
def shimmer(d=2.5,g=.1):
    n=int(d*SR); t=np.arange(n)/SR; x=sum(np.sin(2*np.pi*f*t+k) for k,f in enumerate([1320,1760,2217,2637]))*np.sin(np.pi*t/d)**2*(0.6+0.4*np.sin(2*np.pi*6*t))
    return g*x/np.max(np.abs(x))
fx=np.zeros(N)
def put(x,t):
    i=int(t*SR)
    if i<0 or i>=N: return
    fx[i:i+len(x)]+=x[:N-i]
# drone under the problem (0 -> cost cue2), tension rising
c=ST['cost']['cues']; rv=ST['reveal']['t']
dn=int(c[2]*SR)+int(1.2*SR); t=np.arange(dn)/SR
dr=np.zeros(dn)
for f,a in [(55,1),(82.41,.6),(110,.45),(164.8,.18),(58.3,.25)]:
    dr+=a*(np.sin(2*np.pi*f*t)+.3*np.sin(4*np.pi*f*t+1))
lfo=0.75+0.25*np.sin(2*np.pi*0.18*t)
rise=0.55+0.45*np.clip(t/c[2],0,1)
fade=np.clip(t/3,0,1)*np.clip((c[2]+1.0-t)/1.0,0,1)
dr=lp(dr*lfo*rise*fade,.05)
# heartbeat in the cost scene
for k in range(6):
    bt=c[0]+k*1.05
    if bt<c[2]-.3:
        n=int(.35*SR); tt=np.arange(n)/SR; hb=np.sin(2*np.pi*48*tt)*np.exp(-tt/.09); put(.18*hb/np.max(np.abs(hb)),bt); put(.12*hb/np.max(np.abs(hb)),bt+.24)
fx[:dn]+=0.11*dr/np.max(np.abs(dr))
# transitions
for sid in ['guess','scramble','inside','cost','network','three','price','close']:
    put(whoosh(.9,.12),ST[sid]['t']-.45)
for sid in ['guess']:
    put(impact(.35),ST['guess']['cues'][0]+2.55)
for k,tt in enumerate([c[0],c[0]+1.3,c[0]+2.55]): put(impact(.45),tt)
put(impact(.9),c[2])                         # "Nobody can see who actually delivers."
put(whoosh(1.6,.16),rv+0.0)
put(shimmer(2.6,.08),rv+.2)
put(impact(.6),rv+1.15+.58); put(chime(.14,660),rv+1.15+.6)
# scramble: message pops, call buzz, typing
sc=ST['scramble']['cues']
for i in range(9): put(pop(.06),sc[1]+.15+i*.47)
for i in range(16): put(key(.035),sc[1]+2.0+i*(1.0/28)*1.75)
ins=ST['inside']['cues']
for w in range(4):
    for k in range(3): put(key(.05),ins[2]+.23+w*.45+k*.08)
nw=ST['network']['cues']
put(chime(.10,990),nw[0]+1.9); put(chime(.10,1180),nw[2]+2.6); put(chime(.08,880),nw[3]+1.25)
for i in range(54): put(tap(.025),nw[4]-.6+i*.05)
# UI sounds
for e in plan['sfx']:
    put(click(.09) if e['kind']=='click' else tap(.08) if e['kind']=='tap' else key(.05), e['t'])
cl_=ST['close']['cues']; put(impact(.4),cl_[1]-.25+.58); put(chime(.12,660),cl_[1]+.35)
# music bed from the reveal: loop original with crossfades
m,sr=sf.read('../film/music.wav'); m=rs(m if m.ndim==1 else m.mean(1),sr)
start=rv+1.4; need=int((DUR-start+1)*SR); xf=int(3*SR)
bed=m.copy()
while len(bed)<need:
    seg=m[int(8*SR):]; fade=np.linspace(0,1,xf)
    bed=np.concatenate([bed[:-xf],bed[-xf:]*(1-fade)+seg[:xf]*fade,seg[xf:]])
bed=bed[:need]; tt=np.arange(need)/SR
bed*=np.clip(tt/2.5,0,1)*np.clip((DUR-start-tt)/3.0,0,1)
i0=int(start*SR); fx[i0:i0+need]+=bed[:N-i0]*1.15
fx=np.clip(fx,-.98,.98)
sf.write('music_fx.wav',fx.astype(np.float32),SR)
print('ok',DUR)
