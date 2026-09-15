from pathlib import Path
import cv2, zxingcpp, json

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'evidence' / 'video_review'
OUT.mkdir(parents=True, exist_ok=True)
results=[]
for vi, path in enumerate(sorted((ROOT/'originals').glob('*.mp4')),1):
    cap=cv2.VideoCapture(str(path))
    fps=cap.get(cv2.CAP_PROP_FPS)
    count=0; findings=[]; seen={}
    while True:
        ok, im=cap.read()
        if not ok: break
        count += 1
        for scale in (1,2):
            test=im if scale==1 else cv2.resize(im,None,fx=scale,fy=scale)
            for qr in zxingcpp.read_barcodes(test,formats=zxingcpp.BarcodeFormat.QRCode,try_rotate=True,try_downscale=True,try_invert=True):
                value=qr.text
                entry={'frame':count-1,'time_seconds':round((count-1)/fps,3),'scale':scale,'text':value,'format':str(qr.format)}
                findings.append(entry)
                if value not in seen:
                    seen[value]=entry
                    cv2.imwrite(str(OUT/f'video_{vi}_qr_frame_{count-1}.jpg'),im)
    cap.release()
    results.append({'video':path.name,'frames_scanned':count,'fps':fps,'scales':[1,2],'format_filter':'QRCode','unique_codes':list(seen.values()),'detections':findings})
    print(f'{path.name}: scanned {count} frames; unique codes={len(seen)}',flush=True)
for second in range(24):
    p=ROOT/'video_frames'/'video_2'/f'{second:03d}s.jpg'
    if not p.exists():continue
    im=cv2.imread(str(p))
    # Double-page spreads were filmed sideways; original images stay unchanged.
    if second in [0,1,2,3,7,8,9,14,15,16,22,23]:
        im=cv2.rotate(im,cv2.ROTATE_90_COUNTERCLOCKWISE)
    cv2.imwrite(str(OUT/f'slooze_{second:03d}s_upright.png'),im)
(OUT/'full_frame_qr_scan.json').write_text(json.dumps(results,indent=2),encoding='utf8')
