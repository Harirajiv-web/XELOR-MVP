from pathlib import Path
import subprocess,json,imageio_ffmpeg,wave,numpy as np
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'evidence'/'video_review'
OUT.mkdir(parents=True,exist_ok=True)
rows=[]
for vi,path in enumerate(sorted((ROOT/'originals').glob('*.mp4')),1):
    target=OUT/f'video_{vi}_audio.wav'
    result=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-nostdin','-y','-i',str(path),'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',str(target)],capture_output=True,text=True)
    row={'source':path.name,'output':str(target.relative_to(ROOT)),'exit_code':result.returncode}
    if result.returncode==0:
        with wave.open(str(target),'rb') as audio:
            data=np.frombuffer(audio.readframes(audio.getnframes()),dtype=np.int16).astype(np.float64)
            row.update({'duration_seconds':len(data)/audio.getframerate(),'sample_rate':audio.getframerate(),'peak_dbfs':float(20*np.log10(max(abs(data).max()/32768,1e-10))),'rms_dbfs':float(20*np.log10(max(np.sqrt(np.mean(data**2))/32768,1e-10)))})
    else: row['error']=result.stderr[-2000:]
    rows.append(row)
(OUT/'audio_metadata.json').write_text(json.dumps(rows,indent=2),encoding='utf8')
print(json.dumps(rows,indent=2))
