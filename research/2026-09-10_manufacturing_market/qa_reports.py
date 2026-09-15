from pathlib import Path
import json,re,fitz
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parent;REPO=ROOT.parent.parent
TMP=REPO/'tmp/pdfs/manufacturing_research'
files=list(sorted(TMP.glob('research_*.png')))+list(sorted(TMP.glob('strategy_*.png')))
for start in range(0,len(files),6):
 sheet=Image.new('RGB',(1200,1190),'#dddddd');d=ImageDraw.Draw(sheet)
 for j,f in enumerate(files[start:start+6]):
  im=Image.open(f);im.thumbnail((395,565));x=(j%3)*400;y=(j//3)*595
  sheet.paste(im,(x,y+22));d.text((x+8,y+4),f.stem,fill='black')
 sheet.save(TMP/f'contact_{start//6+1:02d}.jpg')
checks=[]
for file,expected in [('01_Manufacturing_Supplier_Research.pdf',12),('02_AIKYANTRA_XELOR_Opportunity_and_Roadmap.pdf',24)]:
 doc=fitz.open(REPO/'output/pdf'/file);assert len(doc)==expected
 bad=[]
 for i,page in enumerate(doc):
  for block in page.get_text('dict')['blocks']:
   if 'lines' not in block:continue
   for line in block['lines']:
    for span in line['spans']:
     x0,y0,x1,y1=span['bbox']
     if x0<35 or x1>page.rect.width-35 or y0<15 or y1>page.rect.height-15:bad.append([i+1,span['text'],span['bbox']])
 text='\n'.join(page.get_text() for page in doc)
 assert '\ufffd' not in text and '\u25a0' not in text
 assert not bad,bad
 checks.append({'file':file,'pages':len(doc),'links':sum(len(p.get_links()) for p in doc),'boundary_violations':bad,'words':len(text.split()),'text_and_glyph_checks':'pass'})
profiles=json.loads((ROOT/'company_profiles.json').read_text(encoding='utf8'))
missing=[]
for profile in profiles:
 keys={re.match(r'[A-Z]+\d+',s['label'])[0] for s in profile['sources']}
 for sec in profile['sections']:
  for mark in re.findall(r'\[([^]]+)\]',sec['text']):
   ids=re.findall(r'[A-Z]+\d+',mark)
   for key in ids:
    if key not in keys:missing.append({'profile':profile['id'],'id':key})
(TMP/'quality_checks.json').write_text(json.dumps({'pdf_checks':checks,'profile_source_labels_not_listed':missing},indent=2),encoding='utf8')
print(json.dumps({'pdf_checks':checks,'profile_source_labels_not_listed':missing},indent=2))
