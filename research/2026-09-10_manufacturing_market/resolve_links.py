from pathlib import Path
import requests,json,concurrent.futures
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parent
urls=sorted({d['text'] for row in json.loads((ROOT/'qr_results.json').read_text()) for d in row['decoded']})
urls += ['https://commercecx.com/pharmaProducts.html','https://www.rheincs.com','https://www.slooze.xyz','https://playbook.slooze.xyz','https://www.anjx.in']
def get(url):
 try:
  r=requests.get(url,timeout=30,headers={'User-Agent':'Mozilla/5.0'})
  soup=BeautifulSoup(r.text,'html.parser')
  row={'input':url,'chain':[{'url':v.url,'status':v.status_code,'location':v.headers.get('Location')} for v in r.history], 'final':r.url,'status':r.status_code,'title':soup.title.get_text() if soup.title else '', 'social_links':sorted({a.get('href') for a in soup.find_all('a',href=True) if any(x in a['href'] for x in ['linkedin.com','facebook.com','instagram.com','twitter.com','x.com','youtube.com'])}), 'preview':soup.get_text(' ',strip=True)[:1600]}
  return row
 except Exception as e:return {'input':url,'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex: rows=list(ex.map(get,urls))
(ROOT/'redirect_audit.json').write_text(json.dumps(rows,indent=2),encoding='utf8')
print(json.dumps(rows,indent=2))
