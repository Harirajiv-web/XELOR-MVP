import json, soundfile as sf, os
from kokoro_onnx import Kokoro
from script import SEG
K=Kokoro('../kokoro/kokoro-v1.0.onnx','../kokoro/voices-v1.0.bin')
VOICE=os.environ.get('VOICE','af_heart'); SPEED=float(os.environ.get('SPEED','1.0'))
out={}
for sid,kind,lines in SEG:
    for i,(cap,sp) in enumerate(lines):
        text=sp or cap.replace('\n',' ')
        fn=f'vo/{sid}_{i}.wav'
        s,sr=K.create(text,voice=VOICE,speed=SPEED,lang='en-us')
        sf.write(fn,s,sr); out[f'{sid}_{i}']=len(s)/sr
        print(sid,i,round(len(s)/sr,2),flush=True)
json.dump(out,open('vo/durations.json','w'),indent=1)
print('total',sum(out.values()))
