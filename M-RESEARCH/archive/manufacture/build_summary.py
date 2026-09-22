"""Three-page, plain-language summary of the completed manufacturing research."""
from pathlib import Path
import json

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer, PageBreak
from build_report import register_fonts, normalise, qa_pdf

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'output/pdf/Manufacturing_Ideas_Simple_3_Page_Summary.pdf'
register_fonts()
INK = colors.HexColor('#171717')
WIDTH = A4[0] - 84
body = ParagraphStyle('BriefBody', fontName='ReportArial', fontSize=10.3, leading=13.8,
                      textColor=INK, spaceAfter=7, allowWidows=0, allowOrphans=0)
title = ParagraphStyle('BriefTitle', parent=body, fontName='ReportArial-Bold', fontSize=20,
                       leading=24, spaceAfter=10, keepWithNext=True)
head = ParagraphStyle('BriefHead', parent=body, fontName='ReportArial-Bold', fontSize=14.2,
                      leading=18, spaceBefore=7, spaceAfter=7, keepWithNext=True)
small = ParagraphStyle('BriefSmall', parent=body, fontSize=9, leading=11.7, spaceAfter=6)
cell = ParagraphStyle('BriefCell', parent=body, fontSize=9.2, leading=12, spaceAfter=0,
                      allowWidows=1, allowOrphans=1)
cellhead = ParagraphStyle('BriefCellHead', parent=cell, fontName='ReportArial-Bold')

sources = [
 ('ABB', 'Karnataka expansion', '11 Mar 2026', 'https://new.abb.com/news/detail/134105/abb-deepens-karnataka-footprint-with-new-investments-to-serve-high-growth-emerging-sectors'),
 ('IEA', 'Energy and AI', '16 Apr 2026', 'https://www.iea.org/reports/key-questions-on-energy-and-ai/executive-summary'),
 ('IEA', 'EV battery industry', '20 May 2026', 'https://www.iea.org/reports/global-ev-outlook-2026/electric-vehicle-batteries'),
 ('Government of India', 'Bulk-drug production update', '7 Aug 2026', 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2295928&amp;lang=1&amp;reg=1'),
 ('Karnataka Government', 'Industrial-policy guidelines', '10 Apr 2026', 'https://investkarnataka.co.in/wp-content/uploads/2026/04/Karnataka.pdf'),
 ('USTR', 'Trade-duty action', '23 Jul 2026', 'https://www.ustr.gov/about/policy-offices/press-office/press-releases/2026/july/ustr-takes-action-forced-labor-section-301-investigations'),
]

def cite(n):
    return f'<super><link href="{sources[n-1][3]}" color="#202020">[{n}]</link></super>'

def p(text, style=body):
    return Paragraph(normalise(text), style)

def table(rows, ratios, fontsize=None):
    vals = [[p(t, cellhead if i==0 else cell) for t in row] for i,row in enumerate(rows)]
    t = Table(vals, colWidths=[WIDTH*r for r in ratios], repeatRows=1,
              splitByRow=1, splitInRow=0, hAlign='LEFT', spaceAfter=8)
    t.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LEFTPADDING',(0,0),(-1,-1),6), ('RIGHTPADDING',(0,0),(-1,-1),6),
        ('TOPPADDING',(0,0),(-1,-1),5), ('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e9e9e9')),
        ('LINEBELOW',(0,0),(-1,0),.6,colors.HexColor('#666666')),
        ('LINEBELOW',(0,1),(-1,-1),.3,colors.HexColor('#dddddd')),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f7f7f7')]),
    ]))
    return t

story = []
story.append(p('Manufacturing Ideas for Bengaluru', title))
story.append(p('A simple summary for a ₹1-30 crore investment. Research cutoff: 11 September 2026.',small))
story.append(p('<b>My first choice: custom electrical parts.</b> Make shaped copper or aluminium conductors, insulation and mounting parts for companies building power-backup and industrial electrical equipment. Bengaluru has relevant manufacturers and engineers.'+cite(1)+' Start with one product family and expand after repeat orders.'))
story.append(p('<b>Close second: industrial filters and replacement parts.</b> These can bring repeat sales when factories replace worn filters. Precision machining is another strong option if you have an experienced technical partner and customers.'))
story.append(p('The most promising ideas',head))
story.append(p('<b>Budget guide:</b> rough estimates for a small, focused operation in rented premises, including money for stock and customer payments. Land purchase is excluded. Actual costs can vary by more than 50%; these are not quotations or promised returns.',small))
story.append(table([
 ['Idea','What it means and my view','Rough budget'],
 ['1. Electrical parts','Copper/aluminium conductor kits for power equipment. <b>First choice to test.</b> Quality and fast delivery matter; copper prices can squeeze profit.','₹4-10 cr'],
 ['2. Industrial filters','Filter housings and selected replacement filters for water and factory use. <b>Close second.</b> Prove better performance and repeat demand.','₹3-8 cr'],
 ['3. Cables and wiring','Ready-to-fit wire bundles for machines. <b>Good smaller-budget option.</b> Reliable connections and consistent assembly are essential.','₹1-5 cr'],
 ['4. Precision machining','Accurate metal parts for machines, aircraft or medical equipment. <b>Good with expertise.</b> Customer approval and idle machines are risks.','₹8-25 cr'],
 ['5. Clean process equipment','Stainless tanks, pipes and cleaning systems for food/pharma plants. <b>Consider with an experienced team.</b> Testing and installation add work.','₹5-12 cr'],
 ['6. Cooling components','Pipes, manifolds and metal parts for data-centre cooling. <b>Consider with a buyer.</b> Leak-free performance is critical.','₹5-15 cr'],
 ['7. Electronics assembly','Assemble and test electronic boards/products. <b>Customer-led only.</b> Imported parts, defects and unused capacity affect profit.','₹8-30 cr'],
 ['8. Automation equipment','Factory test fixtures, tools and special machines. <b>Good with design skills.</b> Custom projects can create uneven sales.','₹3-12 cr'],
 ['9. Medical/lab supplies','Selected consumables or moulded parts. <b>Product-specific opportunity.</b> Check quality rules, tooling costs and buyers first.','₹3-15 cr'],
 ],[.24,.59,.17]))
story.append(p('<b>Start narrow:</b> these are alternative businesses. Buying equipment for several unrelated product lines would spread money and management too thin.',small))

story.append(PageBreak())
story.append(p('The other ideas considered',title))
story.append(p('Some can work very well with the right experience or customers. A growing industry alone does not make every new factory profitable. Budget estimates use the same assumptions as page 1.',small))
story.append(table([
 ['Idea','What it means and my view','Budget / fit'],
 ['10. Food processing','Ingredients or food made for other brands. <b>Consider with reliable suppliers and buyers.</b> Spoilage, food safety and price competition matter.','₹2-10 cr'],
 ['11. Packaging and labels','Medicine cartons, labels and protective industrial packs. <b>Works with regular buyers.</b> General packaging faces strong local competition.','₹3-10 cr'],
 ['12. Pharma APIs','APIs are the active ingredients in medicines; related chemicals are also options. <b>Only with chemistry and quality experts.</b> Approvals and waste treatment are demanding.','₹15-30 cr or more'],
 ['13. Battery packs / storage','Buy cells and combine them into usable battery systems. <b>Only with a clear application and buyer.</b> Safety, battery life and warranties are major responsibilities.','₹5-30 cr for a narrow operation'],
 ['14. Complete EVs / chargers','Build vehicles or charging equipment. <b>Not my default first venture.</b> Product development, approvals, sales and after-sales service require substantial resources.','Budget alone is not enough'],
 ['15. Solar modules','Assemble solar panels. <b>Lower priority.</b> Established competition, changing technology and export duties can weaken profits.','A line may fit; returns uncertain'],
 ['16. Battery cells / chips / magnets','Make cells, fabricate semiconductor chips or build an integrated rare-earth magnet plant. <b>Avoid for this first project.</b> Scale and technical difficulty are too high.','Generally beyond this budget/profile'],
 ['17. Everyday products','Textiles, furniture, household plastics and building products. <b>Consider only with an advantage</b> in selling, sourcing or production.','Varies by product'],
 ['18. Special chemicals','Adhesives, coatings and other specialised mixtures. <b>Consider with proven formulas and customers.</b> Raw materials and environmental requirements matter.','Varies greatly'],
 ['19. Recycling / recovery','Recover useful material from waste. <b>Secure waste supply and buyers first.</b> Sorting, recovery rates and legal disposal determine profit.','Varies greatly'],
 ],[.24,.59,.17]))
story.append(p('How EVs, AI and pharma affect the choice',head))
story.append(p('<b>EVs:</b> component opportunities exist, but making battery cells is much harder than assembling packs.'+cite(3)+' <b>AI:</b> data centres need electrical power and cooling, creating possible demand for suppliers.'+cite(2)+' <b>Pharma:</b> medicine ingredients have demand, but a finished factory can still wait for commercial production and customer acceptance.'+cite(4)))
story.append(p('<b>My preference:</b> supply useful parts to several established manufacturers. Depending on one EV brand, one AI project or one medicine ingredient makes the business more fragile.'))

story.append(PageBreak())
story.append(p('My recommendation and starting plan',title))
story.append(p('<b>I would first test electrical conductor assemblies and industrial filters with real customers.</b> Electrical is my provisional winner for Bengaluru. Filters could win if trials show better repeat sales and profit. An existing customer network or specialist experience could change the ranking.'))
story.append(p('Use the budget in stages',head))
story.append(table([
 ['Money available','What I would do'],
 ['₹1-3 crore','Start small: wiring/assembly or electrical parts with some work done by specialist suppliers. Keep enough money for stock and unpaid invoices.'],
 ['₹5-10 crore','After successful samples and credible orders, consider a focused electrical factory costing roughly ₹5-8 crore in total. Rent the building.'],
 ['₹10-20 crore','Use the same careful start. Add machines and capacity when repeat demand justifies them; keep cash for delays and growth.'],
 ['₹20-30 crore','Also consider buying or partnering with an existing capable manufacturer. Check its customers, debts, equipment and approvals carefully.'],
 ],[.22,.78]))
story.append(p('The factors that matter most',head))
for text in [
 '<b>Customers:</b> a large market is not an order. Get actual drawings, prices, sample approvals and payment terms before major spending.',
 '<b>Cash:</b> sales are not profit, and profit is not cash in the bank. At ₹12 crore yearly sales, waiting 90 days for payment ties up about ₹3 crore before stock and supplier credit.',
 '<b>India and international risks:</b> Chinese competition, imported parts, copper/oil prices, shipping delays, the rupee and changing export duties can affect costs. Recheck duties for the exact product.'+cite(6),
 '<b>Bengaluru site and team:</b> compare rent, access to buyers, skilled workers, electricity, water, waste handling and permissions. Hire an experienced production/quality leader.',
 '<b>Government support:</b> incentives depend on the location and project. Plan to survive without subsidies that have not been approved.'+cite(5),
 ]:
    story.append(p('- '+text))
story.append(p('Before buying major machinery',head))
story.append(p('<b>1.</b> Speak to 20-30 potential buyers and collect real requirements. <b>2.</b> Make samples, preferably secure paid trials, and calculate full costs. <b>3.</b> Proceed only with two credible customer routes, a capable team and enough cash to handle a six-month delay. These are suggested checks, not guarantees.'))
story.append(p('<b>Simple conclusion:</b> start with one useful product that customers will pay for repeatedly. For your location and budget, I would investigate electrical parts first and industrial filters second. Grow after proving demand.'))
story.append(p('Selected sources - click to open',head))
for i,(org,name,date,url) in enumerate(sources,1):
    story.append(p(f'{i}. {org}: <link href="{url}" color="#222222"><u>{name}</u></link> ({date}).',small))

def page_number(canvas,doc):
    canvas.saveState()
    canvas.setFont('ReportArial',8)
    canvas.setFillColor(colors.HexColor('#555555'))
    canvas.drawCentredString(A4[0]/2,22,f'{doc.page} / 3')
    canvas.restoreState()

OUT.parent.mkdir(parents=True,exist_ok=True)
doc=SimpleDocTemplate(str(OUT),pagesize=A4,leftMargin=42,rightMargin=42,
                      topMargin=36,bottomMargin=38,title='Manufacturing Ideas for Bengaluru - Simple Summary',
                      author='',allowSplitting=1)
doc.build(story,onFirstPage=page_number,onLaterPages=page_number)
qa=qa_pdf(OUT,ROOT/'tmp/pdfs/short_summary',dpi=120)
print(json.dumps({'output':str(OUT),'pages':qa['pages'],'links':qa['clickable_links'],
                  'overflow':qa['page_bounds_overflow'],
                  'replacement_characters':qa['replacement_character_count']},indent=2))
if qa['pages'] != 3:
    raise RuntimeError(f"Expected 3 pages, got {qa['pages']}; adjust layout before delivery")
