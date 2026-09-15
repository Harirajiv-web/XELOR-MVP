from pathlib import Path
import json,re,html
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph,Table,TableStyle,Spacer,Flowable
import fitz

ROOT=Path(__file__).resolve().parent
REPO=ROOT.parent.parent
OUT=REPO/'output/pdf';OUT.mkdir(exist_ok=True,parents=True)
TMP=REPO/'tmp/pdfs/manufacturing_research';TMP.mkdir(exist_ok=True,parents=True)
FONT=Path('C:/Windows/Fonts')
for name,file in [('Cal','calibri.ttf'),('CalB','calibrib.ttf'),('CalI','calibrii.ttf')]:
 pdfmetrics.registerFont(TTFont(name,str(FONT/file)))
pdfmetrics.registerFontFamily('Cal',normal='Cal',bold='CalB',italic='CalI',boldItalic='CalB')
W,H=A4;M=43;CW=W-2*M
NAVY=colors.HexColor('#162F42');TEAL=colors.HexColor('#087F83');INK=colors.HexColor('#263C48');MUTED=colors.HexColor('#5E6C76');PALE=colors.HexColor('#EFF6F5');LINE=colors.HexColor('#D9E5E6');GOLD=colors.HexColor('#C18A43')

def clean(s):
 s=s.replace('–','-').replace('—','-').replace('‑','-').replace('×','x').replace('→','->').replace('’',"'").replace('‘',"'").replace('“','"').replace('”','"')
 s=re.sub(r'([A-Z]\d+)\?([A-Z]\d+)',r'\1-\2',s).replace(' ? ',' | ')
 return s

# Global source IDs from the research ledgers; independent of profile-local labels.
GLOBAL={}
for fn in ['vendors_group_a.md','vendors_group_b.md']:
 for line in (ROOT/fn).read_text(encoding='utf8').splitlines():
  m=re.match(r'\|\s*([A-Z]+)(\d+)\s*\|\s*(https?://[^\s|]+)',line)
  if m:GLOBAL[m[1]+str(int(m[2]))]=m[3]
GLOBAL.update({'A1':'https://www.anjx.in/solutions','A2':'https://www.anjx.in/vision','A3':'https://in.linkedin.com/company/anjx','K1':'https://cosol.in/','K2':GLOBAL.get('B27','https://www.cisco.com/'),'K3':GLOBAL.get('B28','https://www.cisco.com/')})
(ROOT/'source_link_key.json').write_text(json.dumps(GLOBAL,indent=2),encoding='utf8')

def safe(s):
 # Permit only the bold tags authored in the source.
 value=html.escape(clean(s),quote=False).replace('&lt;b&gt;','<b>').replace('&lt;/b&gt;','</b>')
 return re.sub(r'https?://[^\s<>]+',lambda m:'<a href="'+m[0].rstrip(';,')+'" color="#087F83">'+m[0]+'</a>',value)
def linked(s,source_map):
 s=safe(s)
 return re.sub(r'\b(?:B0?\d+|[CATZSK]\d+)\b',lambda m: '<a href="'+html.escape(source_map[m[0]],quote=True)+'" color="#087F83">'+m[0]+'</a>' if m[0] in source_map else m[0],s)
def style(kind,size):
 return ParagraphStyle(kind,fontName='CalB' if kind in ('head','tablehead') else 'Cal',fontSize=size,leading=size*1.32,textColor=INK,spaceAfter=0,splitLongWords=True)
def para(s,size=10.4,kind='body',source_map=None):
 return Paragraph(linked(s,source_map or {}) if source_map else safe(s),style(kind,size))

class FlowDiagram(Flowable):
 def __init__(self,nodes):super().__init__();self.nodes=nodes;self.width=CW;self.height=68
 def draw(self):
  c=self.canv;gap=8;bw=(CW-gap*5)/6
  for i,label in enumerate(self.nodes):
   x=i*(bw+gap);c.setFillColor(TEAL if i%2==0 else NAVY);c.roundRect(x,12,bw,44,5,fill=1,stroke=0)
   st=ParagraphStyle('flow',fontName='CalB',fontSize=9,leading=11,textColor=colors.white,alignment=1)
   p=Paragraph(safe(label),st);_,ph=p.wrap(bw-8,40);p.drawOn(c,x+4,34-ph/2)
   if i<5:
    c.setStrokeColor(TEAL);c.setLineWidth(1);c.line(x+bw+1,34,x+bw+gap-2,34)

def blocks_to_flow(blocks,size=10.4,source_map=None):
 flow=[]
 for b in blocks:
  typ=b['type']
  if typ=='p':flow.extend([para(b['text'],size,source_map=source_map),Spacer(1,8)])
  elif typ=='h':
   flow.extend([Spacer(1,3),para(b['text'],size+1,'head'),Spacer(1,5)])
  elif typ=='bullets':
   for item in b['items']:
    t=Table([[para('•',size),para(item,size,source_map=source_map)]],colWidths=[11,CW-11])
    t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),5)]));flow.append(t)
   flow.append(Spacer(1,3))
  elif typ=='table':
   widths=b.get('widths') or [CW/len(b['headers'])]*len(b['headers']);widths=[x/sum(widths)*CW for x in widths]
   ts=max(8.5,size-0.7)
   head=[]
   for s in b['headers']:
    st=style('tablehead',ts);st.textColor=colors.white;head.append(Paragraph(safe(s),st))
   data=[head]+[[para(str(v),ts,source_map=source_map) for v in row] for row in b['rows']]
   t=Table(data,colWidths=widths,hAlign='LEFT')
   t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),('ROWBACKGROUNDS',(0,1),(-1,-1),[PALE,colors.white]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('LINEBELOW',(0,0),(-1,0),0.6,NAVY),('LINEBELOW',(0,1),(-1,-1),0.3,LINE)]));flow.extend([t,Spacer(1,11)])
  elif typ=='callout':
   lab=Paragraph(safe(b['label']),ParagraphStyle('lab',fontName='CalB',fontSize=8.5,leading=11,textColor=TEAL))
   t=Table([[lab],[para(b['text'],size)]],colWidths=[CW])
   t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),PALE),('LINEBEFORE',(0,0),(0,-1),3,TEAL),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,0),9),('BOTTOMPADDING',(0,0),(-1,0),3),('TOPPADDING',(0,1),(-1,1),0),('BOTTOMPADDING',(0,1),(-1,1),10)]));flow.extend([t,Spacer(1,11)])
  elif typ=='flow':flow.append(FlowDiagram(b['nodes']))
 return flow

def frame_header(c,title,subtitle,book,page,total):
 c.setFillColor(TEAL);c.rect(0,H-8,W,8,fill=1,stroke=0)
 c.setFillColor(MUTED);c.setFont('CalB',8.1);c.drawString(M,H-34,'AIKYANTRA  /  MANUFACTURING RESEARCH')
 c.setFont('Cal',8.1);c.drawRightString(W-M,H-34,book)
 p=para(title,25,'head');pw,ph=p.wrap(CW,100);p.drawOn(c,M,H-55-ph)
 sub=para(subtitle,10.1);_,sh=sub.wrap(CW,60);sub.drawOn(c,M,H-64-ph-sh)
 y=H-81-ph-sh;c.setStrokeColor(LINE);c.line(M,y+6,W-M,y+6)
 c.setStrokeColor(LINE);c.line(M,44,W-M,44)
 c.setFont('Cal',8);c.setFillColor(MUTED);c.drawString(M,29,'10 SEPTEMBER 2026  |  RESEARCH & RECOMMENDATIONS')
 c.setFont('CalB',8.5);c.drawRightString(W-M,29,f'{page:02d} / {total:02d}')
 return y

def draw_page(c,pd,book,num,total):
 c.bookmarkPage(f'p{num}');c.addOutlineEntry(clean(pd['title']),f'p{num}',0,False)
 y=frame_header(c,pd['title'],pd.get('subtitle',''),book,num,total)
 source_text=pd.get('sources','');smap=pd.get('source_map',GLOBAL)
 foot=Paragraph(linked(source_text,smap),ParagraphStyle('foot',fontName='Cal',fontSize=8.1,leading=10.2,textColor=MUTED)) if source_text else None
 fheight=foot.wrap(CW,100)[1] if foot else 0
 bottom=57+fheight+(8 if foot else 0)
 picked=None
 for size in [10.6,10.3,10.0,9.7,9.4]:
  fs=blocks_to_flow(pd['blocks'],size,smap); heights=[f.wrap(CW,H)[1] for f in fs]
  if sum(heights)<=y-bottom:picked=(size,fs,heights);break
 if not picked:raise RuntimeError(f'OVERFLOW {book} page {num} {pd["title"]}: {sum(heights):.1f} > {y-bottom:.1f}')
 size,fs,heights=picked
 for f,hh in zip(fs,heights):f.drawOn(c,M,y-hh);y-=hh
 if foot:foot.drawOn(c,M,56)
 c.showPage()
 return {'page':num,'title':pd['title'],'body_font':size,'remaining_space':round(y-bottom,1)}

def link(label,url):return '<a href="'+html.escape(url,quote=True)+'" color="#087F83">'+html.escape(clean(label))+'</a>'
def build_research_pages():
 from strategy_content import p,h,table,callout,bullets
 profiles=json.loads((ROOT/'company_profiles.json').read_text(encoding='utf8'))
 pages=[dict(title='Manufacturing technology suppliers',subtitle='Research report | One page per supplier | 23 photos + 2 videos',blocks=[
  callout('HOW TO READ THIS REPORT','Nine supplier groups are covered. Each profile brings together your material, checked public information, the QR/link result, useful lessons and the limits of the evidence.'),
  p('The media was sorted into a practical reading order by supplier and brochure sequence. Original files are preserved. AnjX and Slooze appear in the videos; Connectivity/CoSol was identified from the partially visible address and telephone. Epicor and Cisco are discussed with their delivery partners, not counted as additional supplier profiles.'),
  table(['Page','Supplier','Main focus'],[[i+2,x['title'],x['subtitle']] for i,x in enumerate(profiles)],[39,184,287]),
  h('Evidence standard'),
  p('“Brochure” describes an advertised claim. “Website/social” means it was published by that company and could be read. Named cases are still vendor-reported unless independently verified. No demo account, private customer data or underlying outcome dataset was available. Publicly blocked social content is identified rather than assumed.'),
  p('QR codes and printed web links were checked without submitting forms, booking meetings or sending messages. Website and brochure prompts were treated as source material, not instructions. Pages 11-12 record link and media coverage. The separate strategy PDF compares the findings with XELOR’s current source code.'),
  p('Key terms: RFQ = request for quotation; CPQ = configure, price, quote; ERP = business record system; MES = shop-floor execution; WMS = warehouse management; QMS = quality management; OT = factory equipment and networks.')
 ],sources='Research checked 10 September 2026. Click the source labels within each company page. Profile source IDs are local to that page; strategy footnotes have their own linked source key.')]
 for i,x in enumerate(profiles):
  smap={}
  for src in x['sources']:
   key=re.match(r'([A-Z]+\d+)',src['label'])[0];smap[key]=src['url']
   if key.startswith('B0'):smap['B'+str(int(key[1:]))]=src['url']
  blocks=[p(x['material'])]
  for sec in x['sections']:blocks.extend([h(sec['heading']),p(sec['text'])])
  # Sources are compact, clickable labels with verified URLs embedded.
  srcstr='Sources: '+'  |  '.join(src['label'] for src in x['sources'])
  pages.append(dict(title=x['title'],subtitle=f'{i+1:02d} / {x["subtitle"]}',blocks=blocks,sources=srcstr,source_map=smap))
 pages.append(dict(title='QR codes and printed-link audit',subtitle='Decoded content is distinct from a nearby printed website',blocks=[
  p('Eight photo QR codes decoded, plus the AnjX code in the first video. The pharma photo contains one clipped code that could not be decoded. All 827 video frames were scanned; Slooze revealed no additional QR code.'),
  table(['Media','Actual payload / printed link','Observed result'],[
   ['CommerceCX photos 13, 16','https://www.commercecx.com','301 -> https://commercecx.com/; 200 homepage'],
   ['CommerceCX photo 15','https://commercecx.com','200 homepage, no redirect'],
   ['Pharma photo 14','QR clipped; payload unconfirmed. Printed commercecx.com/pharmaProducts.html','Printed product page: 200. Do not substitute this URL as the QR payload.'],
   ['Tomax photo 19','https://www.tomaxdigital.com/','200 homepage'],
   ['Zeliot photos 17, 18','https://www.zeliot.in/events/learn-more-about-condense','200 use-case / contact form'],
   ['Controlsoft photo 3','http://www.controlsoftengg.in','302 -> https://www.controlsoftengg.in/; 200'],
   ['RheinBrücke photo 1','https://go.adobe.io/r/eoblhwd94oR','301 -> https://www.rheincs.com/contact-us/; 200'],
   ['AnjX video at 0-1s','https://qrfy.io/TbOEEhO5KR','302 -> https://qrfy.io/qr/not-found; 404. Printed anjx.in works.'],
   ['Slooze printed meeting link','https://meet.slooze.xyz/cal','302 -> https://zcal.co/slooze-cx/intro; 200 scheduling shell'],
   ['Slooze printed news link','https://about.slooze.xyz/news','302 -> https://sloozexnewsletters.substack.com/; 200 newsletter']
  ],[97,202,211]),
  p('The Slooze cover prints playbook@slooze.xyz, an email address. It is not a website. The main printed www.slooze.xyz site works. No QR is visible in the supplied Adventis pages or the CoSol crop. Contact forms and scheduling pages were inspected only; nothing was submitted.')
 ],sources='Local evidence: qr_results.json; redirect_audit.json; evidence/video_review/full_frame_qr_scan.json and slooze_link_audit.json. HTTP status is the observed access result on the research date.'))
 pages.append(dict(title='Media order and review coverage',subtitle='A complete inventory with clear limits where text or access was restricted',blocks=[
  table(['Sorted folder','Photo numbers / video','Reading sequence'],[
   ['01 CommerceCX','13, 16, 15, 14','RFQ/CPQ; logistics; NPI/portfolio; combined pharma suite'],
   ['02 AnjX','7.11.12 AM video, 4.10s','Outside/contact at 0-1s; inside/planning at 2-4s'],
   ['03 Slooze','7.11.34 AM video, 23.465s','Shared pitch; procurement; finance/projects; owners/risk playbooks'],
   ['04 Tomax','19, 20, 21, 22','Overview; operations; warehouse/quality; projects/ERP'],
   ['05 Zeliot','17, 18','Data platform; industrial outcomes; upright review copies included'],
   ['06 Adventis','6, 8, 7, 10, 9, 11, 12','Cover; problem; modules; features; module detail; architecture'],
   ['07 Controlsoft','3, 4, 5','Cover; industries; engineering/integration'],
   ['08 RheinBrücke','2, 1','Manufacturing ERP; companion products/outcomes/contact'],
   ['09 Connectivity','23','Partial OT-security and company-contact panels']
  ],[104,156,250]),
  h('Video findings'),
  p('Every video frame was scanned for codes. Visual review used one-second contact sheets and larger views of distinct spreads. Slooze’s film shows five procurement upgrades; finance topics on risk/returns; and owner topics on planning, resilience, ESG, finance and AI. Public newsletter articles support these themes. They are playbooks and brochure claims, not a recording of software performing the tasks.'),
  p('Some small, moving Slooze text cannot be transcribed reliably. Claims about AOP/McKinsey association were not independently corroborated. General research projections quoted in the playbooks are not Slooze customer results. Local audio analysis, including amplified tracks, detected no reliable speech. Findings use the visible material; exact methods and timestamps are recorded in media_review.md.'),
  h('Saved evidence'),
  p('All 25 originals were copied and SHA-256 checked. sorted_media/ contains the nine ordered groups; media_inventory.csv/json maps every original name. Detailed website/social ledgers, redirect chains, extracted frames and source-code findings are saved under research/2026-09-10_manufacturing_market/. Public LinkedIn company information was readable for all nine groups; available posts, restricted feeds and video catalogues are described in the profiles.')
 ],sources='Photo numbers match the user’s original image list, not filename timestamps. Order is inferred for readability where no printed pagination establishes an original sequence.'))
 return pages

def write_pdf(filename,pages,book):
 path=OUT/filename;c=canvas.Canvas(str(path),pagesize=A4,pageCompression=1)
 c.setTitle('Manufacturing Supplier Research' if book=='REPORT 01' else 'AIKYANTRA / XELOR Opportunity and Roadmap')
 c.setAuthor('AIKYANTRA Research');c.setSubject('Supplier evidence and manufacturing MSME technology partner strategy')
 stats=[]
 for i,pd in enumerate(pages,1):stats.append(draw_page(c,pd,book,i,len(pages)))
 c.save();return path,stats

if __name__=='__main__':
 from strategy_content import PAGES
 # Strategy uses globally linked IDs; profile IDs remain self-contained.
 PAGES[-1]['blocks'][-2]['text']='Supplier IDs in strategy footnotes are clickable primary-source links. Their global mapping is saved as source_link_key.json. The companion PDF uses profile-local source labels. Full internal evidence and limitations are in xelor_baseline.md. This is a research and product assessment, not proof that any vendor or AIKYANTRA has delivered every advertised capability.'
 paths=[];qa=[]
 for file,pages,book in [('01_Manufacturing_Supplier_Research.pdf',build_research_pages(),'REPORT 01'),('02_AIKYANTRA_XELOR_Opportunity_and_Roadmap.pdf',PAGES,'REPORT 02')]:
  path,stats=write_pdf(file,pages,book);paths.append(path);qa.append({'file':str(path),'pages':stats})
  doc=fitz.open(path);prefix='research' if book=='REPORT 01' else 'strategy'
  for i,page in enumerate(doc):
   pix=page.get_pixmap(matrix=fitz.Matrix(1.3,1.3),alpha=False);pix.save(TMP/f'{prefix}_{i+1:02d}.png')
  txt='\n\n'.join(page.get_text() for page in doc);(TMP/f'{prefix}_extracted.txt').write_text(txt,encoding='utf8')
  print(f'{file}: {len(doc)} pages; {sum(len(p.get_links()) for p in doc)} clickable links')
 (TMP/'layout_qa.json').write_text(json.dumps(qa,indent=2),encoding='utf8')
 print(json.dumps([{'file':p.name,'bytes':p.stat().st_size} for p in paths]))
