import json,re,subprocess,numpy as np,soundfile as sf,base64
SR=44100
subprocess.run('ffmpeg -v error -y -i music-data.mp3 -ar 44100 -ac 2 music.wav && ffmpeg -v error -y -i audio-data.mp3 -ar 44100 -ac 2 narr.wav',shell=True,check=True)
m,_=sf.read('music.wav')
js=open('s3.js').read()
node=subprocess.run(['node','-e',"global.window={};eval(require('fs').readFileSync('s3.js','utf8'));console.log(JSON.stringify(window.KISAN_TIMELINE.shots))"],capture_output=True,text=True,check=True).stdout
shots=json.loads(node)
R=np.random.default_rng(3)
def click(g=.09):
    n=int(.05*SR);t=np.arange(n)/SR;x=R.standard_normal(n)*np.exp(-t/.0015)+.6*np.sin(2*np.pi*2100*t)*np.exp(-t/.006);return g*x/np.abs(x).max()
def tap(g=.08):
    n=int(.08*SR);t=np.arange(n)/SR;x=np.sin(2*np.pi*1150*t)*np.exp(-t/.012)+.3*R.standard_normal(n)*np.exp(-t/.002);return g*x/np.abs(x).max()
def key(g=.045):
    n=int(.03*SR);t=np.arange(n)/SR;x=R.standard_normal(n)*np.exp(-t/.003);return g*x/np.abs(x).max()
fx=np.zeros(len(m))
def put(x,t):
    i=int(t*SR)
    if 0<=i<len(fx): fx[i:i+len(x)]+=x[:len(fx)-i]
for s in shots:
    touch=bool(re.match(r'^[fo]\.',s['screen']))
    for a in s.get('actions',[]):
        at=s['t']+a['at']
        if a['type']=='type':
            span=min(2.8,max(.55,len(a['value'])*.075))
            put(click(),at-span-.22)
            for k in range(len(a['value'])): put(key(),at-span+k*span/len(a['value']))
        else: put(tap() if touch else click(),at)
mix=m+fx[:,None]
sf.write('music_fx.wav',np.clip(mix,-.98,.98).astype(np.float32),SR)
subprocess.run('ffmpeg -v error -y -i music_fx.wav -b:a 128k music_fx.mp3',shell=True,check=True)
s=open('KisanCred-Product-Film.html').read()
mm=re.search(r'(<script id="music-data"[^>]*>)(.*?)(</script>)',s,re.S)
s=s[:mm.start(2)]+base64.b64encode(open('music_fx.mp3','rb').read()).decode()+s[mm.end(2):]
open('KisanCred-Product-Film.html','w').write(s)
subprocess.run('ffmpeg -v error -y -i narr.wav -i music_fx.wav -filter_complex "[0:a][1:a]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 -c:a pcm_s16le final_audio.wav',shell=True,check=True)
print('ok',len(shots))
