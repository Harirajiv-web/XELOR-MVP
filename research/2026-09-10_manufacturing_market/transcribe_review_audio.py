from pathlib import Path
import wave,json,time,os,requests,numpy as np
os.environ['HF_HUB_DISABLE_XET']='1'
from faster_whisper import WhisperModel

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'evidence'/'video_review'
print('Loading local faster-whisper base multilingual model on CPU/int8.',flush=True)
snapshots=list((OUT/'models').glob('models--Systran--faster-whisper-base/snapshots/*/config.json'))
model_dir=snapshots[0].parent
model_binary=model_dir/'model.bin'
if not model_binary.exists():
    total=0
    with requests.get('https://huggingface.co/Systran/faster-whisper-base/resolve/main/model.bin',stream=True,timeout=(10,25)) as response:
        response.raise_for_status()
        with model_binary.open('wb') as target:
            for chunk in response.iter_content(1024*1024):
                target.write(chunk); total+=len(chunk)
                if total%(20*1024*1024)==0:print(f'Downloaded model weights: {total//(1024*1024)} MiB',flush=True)
    print(f'Public model weights downloaded: {total} bytes; no media uploaded.',flush=True)
model=WhisperModel(str(model_dir),device='cpu',compute_type='int8',cpu_threads=4,num_workers=1,local_files_only=True)
rows=[]
for vi in (1,2):
    p=OUT/f'video_{vi}_audio.wav'
    with wave.open(str(p),'rb') as source:
        rate=source.getframerate()
        raw=np.frombuffer(source.readframes(source.getnframes()),dtype=np.int16).astype(np.float32)/32768.0
    peak=float(np.max(abs(raw)))
    gain=min(100.0,0.7/max(peak,1e-6))
    normalized=np.clip(raw*gain,-1,1)
    n=OUT/f'video_{vi}_audio_normalized.wav'
    with wave.open(str(n),'wb') as target:
        target.setnchannels(1);target.setsampwidth(2);target.setframerate(rate)
        target.writeframes((normalized*32767).astype(np.int16).tobytes())
    print(f'Transcribing video {vi}, original gain and normalized gain {gain:.2f}.',flush=True)
    variants=[]
    for label,data in [('original',raw),('normalized',normalized)]:
        segments,info=model.transcribe(data,beam_size=5,vad_filter=True,vad_parameters={'min_silence_duration_ms':250},condition_on_previous_text=False)
        parsed=[{'start':s.start,'end':s.end,'text':s.text,'avg_logprob':s.avg_logprob,'no_speech_prob':s.no_speech_prob,'compression_ratio':s.compression_ratio} for s in segments]
        variants.append({'variant':label,'language':info.language,'language_probability':info.language_probability,'duration':info.duration,'duration_after_vad':info.duration_after_vad,'segments':parsed})
        print(json.dumps({'video':vi,**variants[-1]},ensure_ascii=True),flush=True)
    rows.append({'video':vi,'model':'faster-whisper base multilingual','device':'CPU int8','sample_rate':rate,'normalization_gain':gain,'normalization_gain_db':float(20*np.log10(gain)),'variants':variants})
    (OUT/'audio_transcription.json').write_text(json.dumps(rows,indent=2),encoding='utf8')
print('Local transcription completed.',flush=True)
