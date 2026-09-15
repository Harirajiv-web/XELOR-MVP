from pathlib import Path
import shutil,json,hashlib,csv
from PIL import Image
ROOT=Path(__file__).resolve().parent
names={1:'56 AM',2:'55 AM (1)',3:'55 AM',4:'54 AM (2)',5:'54 AM (1)',6:'54 AM',7:'53 AM (1)',8:'53 AM',9:'52 AM (2)',10:'52 AM (1)',11:'52 AM',12:'51 AM (2)',13:'51 AM (1)',14:'51 AM',15:'50 AM (1)',16:'50 AM',17:'12 AM',18:'11 AM (3)',19:'11 AM (2)',20:'11 AM (1)',21:'11 AM',22:'10 AM (1)',23:'10 AM'}
groups=[('01_CommerceCX',[13,16,15,14]),('02_AnjX',[]),('03_Slooze',[]),('04_Tomax_Digital',[19,20,21,22]),('05_Zeliot_Condense',[17,18]),('06_Adventis_OptiMES',[6,8,7,10,9,11,12]),('07_Controlsoft',[3,4,5]),('08_RheinBrucke_Epicor',[2,1]),('09_Connectivity_CoSol',[23])]
rows=[]
for group,ids in groups:
 out=ROOT/'sorted_media'/group;out.mkdir(parents=True,exist_ok=True)
 for pos,i in enumerate(ids,1):
  source=ROOT/'originals'/f'WhatsApp Image 2026-09-10 at 7.11.{names[i]}.jpeg'
  target=out/f'{pos:02d}_Photo_{i:02d}.jpeg';shutil.copy2(source,target)
  if i in [17,18]:Image.open(source).rotate(180).save(out/f'{pos:02d}_Photo_{i:02d}_upright_review.jpeg')
  rows.append({'company_folder':group,'order':pos,'user_image':i,'original':source.name,'sorted':str(target.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'kind':'image'})
for group,timestamp,vi in [('02_AnjX','12',1),('03_Slooze','34',2)]:
 source=ROOT/'originals'/f'WhatsApp Video 2026-09-10 at 7.11.{timestamp} AM.mp4'
 target=ROOT/'sorted_media'/group/'01_Original_video.mp4';shutil.copy2(source,target)
 rows.append({'company_folder':group,'order':1,'user_image':'','original':source.name,'sorted':str(target.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'kind':'video'})
 for f in (ROOT/'video_frames'/f'video_{vi}').glob('contact*.jpg'):shutil.copy2(f,target.parent/f.name)
for row in rows:
 assert hashlib.sha256((ROOT/row['sorted']).read_bytes()).hexdigest()==row['sha256']
rows.sort(key=lambda x:(x['company_folder'],x['order']))
(ROOT/'media_inventory.json').write_text(json.dumps(rows,indent=2),encoding='utf8')
with (ROOT/'media_inventory.csv').open('w',encoding='utf-8-sig',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
assert len(rows)==25 and len({r['original'] for r in rows})==25
readme='''# Manufacturing supplier research - 10 September 2026

Final reports are in ../../output/pdf/:
- 01_Manufacturing_Supplier_Research.pdf
- 02_AIKYANTRA_XELOR_Opportunity_and_Roadmap.pdf

The authoritative organised media is in sorted_media/, ordered by supplier and practical reading sequence. All 25 supplied originals (23 images, 2 videos) are preserved byte-for-byte in originals/ and copied into the nine supplier folders. media_inventory.csv/json maps the original filename and the user image number to its sorted copy, with SHA-256 verification. Two upright Zeliot review copies and video contact sheets are additional analysis aids, not replacement originals.

The company sequence is CommerceCX, AnjX, Slooze, Tomax, Zeliot, Adventis, Controlsoft, RheinBrucke/Epicor and Connectivity/CoSol. This is a useful reading order, not a claim of original printed pagination. CoSol's partially visible identity was matched using the official address and telephone.

Research notes: vendors_group_a.md; vendors_group_b.md; xelor_baseline.md; media_review.md. QR and redirect evidence: qr_results.json, redirect_audit.json, evidence/video_review/. An early attempt at playbook.slooze.xyz was a misreading: the printed Slooze text is the email playbook@slooze.xyz. It is not a broken brochure URL.

PDF source data: company_profiles.json; strategy_content.py; strategy_pages.json; render_reports.py. PDF rendering/quality outputs live under tmp/pdfs/manufacturing_research/. No application code was modified and no enquiries, bookings, messages or subscriptions were submitted. Website/brochure prompts were treated as source content, not instructions.
'''
(ROOT/'README.md').write_text(readme,encoding='utf8')
print('Verified and organised all 25 original files into 9 supplier folders.')
