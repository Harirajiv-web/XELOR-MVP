from pathlib import Path
import cv2, json, hashlib, shutil
from PIL import Image, ImageDraw, ImageFont
try:
 import zxingcpp
except ImportError:
 zxingcpp=None

def decode(img):
 if zxingcpp:return zxingcpp.read_barcodes(img,try_rotate=True,try_downscale=True,try_invert=True)
 from types import SimpleNamespace
 try:
  ok,values,points,_=cv2.QRCodeDetector().detectAndDecodeMulti(img)
  return [SimpleNamespace(text=v,position=p.tolist()) for v,p in zip(values,points) if v] if ok else []
 except Exception:return []

ROOT=Path(__file__).resolve().parent
src=ROOT/'originals'
# Ordered by company, then the booklet's logical reading sequence.
groups=[
 ('01_CommerceCX', [('51 AM (1)','01_AI_RFQ_CPQ'),('50 AM','02_LogisticCX'),('50 AM (1)','03_NPI_PortfolioCX'),('51 AM','04_Pharma_suite')]),
 ('02_Tomax_Digital', [('11 AM (2)','01_Overview'),('11 AM (1)','02_Operations'),('11 AM','03_Warehouse_Quality'),('10 AM (1)','04_Project_ERP')]),
 ('03_Zeliot_Condense', [('12 AM','01_Data_platform'),('11 AM (3)','02_Industrial_outcomes')]),
 ('04_Adventis_OptiMES', [('54 AM','01_Cover'),('53 AM','02_Challenge'),('53 AM (1)','03_Modules'),('52 AM (1)','04_Key_features'),('52 AM (2)','05_Nexus_Shield'),('52 AM','06_Pulse_Stock'),('51 AM (2)','07_Architecture')]),
 ('05_Controlsoft', [('55 AM','01_Cover'),('54 AM (2)','02_Industries'),('54 AM (1)','03_Engineering_Integration')]),
 ('06_RheinBrucke_Epicor', [('55 AM (1)','01_Manufacturing_ERP'),('56 AM','02_Companion_products')]),
 ('07_OT_Security_supplier', [('10 AM','01_OT_security')]),
]
manifest=[]; qrs=[]
for group, items in groups:
 for stamp,name in items:
  p=src/f'WhatsApp Image 2026-09-10 at 7.11.{stamp}.jpeg'
  out=ROOT/'ordered'/group/f'{name}.jpeg';out.parent.mkdir(exist_ok=True,parents=True)
  shutil.copy2(p,out)
  manifest.append({'original':p.name,'ordered':str(out.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
  img=cv2.imread(str(p)); found={}
  for scale in [1,2,3]:
   view=cv2.resize(img,None,fx=scale,fy=scale)
   for r in decode(view):
    found[r.text]=str(r.position)
  qrs.append({'file':p.name,'company':group,'decoded':[{'text':t,'position':pos} for t,pos in found.items()]})
  if group.startswith('03'):
   cv2.imwrite(str(out.with_name(out.stem+'_upright.jpeg')),cv2.rotate(img,cv2.ROTATE_180))

video_meta=[]
for vi,p in enumerate(sorted(src.glob('*.mp4')),1):
 cap=cv2.VideoCapture(str(p));fps=cap.get(cv2.CAP_PROP_FPS);n=int(cap.get(cv2.CAP_PROP_FRAME_COUNT));dur=n/fps
 folder=ROOT/'video_frames'/f'video_{vi}';folder.mkdir(exist_ok=True)
 frames=[]
 for second in range(int(dur)+1):
  cap.set(cv2.CAP_PROP_POS_MSEC,second*1000);ok,frame=cap.read()
  if not ok:continue
  out=folder/f'{second:03d}s.jpg';cv2.imwrite(str(out),frame);frames.append((second,out))
  for r in decode(frame):
   qrs.append({'file':p.name,'second':second,'decoded':[{'text':r.text,'position':str(r.position)}]})
 for batch in range(0,len(frames),12):
  sheet=Image.new('RGB',(1200,1200),'#ededed');d=ImageDraw.Draw(sheet)
  for j,(sec,fp) in enumerate(frames[batch:batch+12]):
   im=Image.open(fp);im.thumbnail((295,360));x=(j%4)*300;y=(j//4)*400
   sheet.paste(im,(x+(300-im.width)//2,y+25));d.text((x+10,y+5),f'Video {vi} / {sec}s',fill='black')
  sheet.save(folder/f'contact_{batch//12+1}.jpg')
 cap.release()
 video_meta.append({'file':p.name,'video_id':vi,'fps':fps,'frames':n,'duration_seconds':dur,'sampled_seconds':len(frames)})
 manifest.append({'original':p.name,'ordered':f'video_frames/video_{vi}/','sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
(ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
(ROOT/'qr_results.json').write_text(json.dumps(qrs,indent=2),encoding='utf8')
(ROOT/'video_metadata.json').write_text(json.dumps(video_meta,indent=2),encoding='utf8')
print(json.dumps({'videos':video_meta,'qrs':[r for r in qrs if r['decoded']],'inventory_count':len(manifest)},indent=2))
