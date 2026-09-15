from pathlib import Path
import requests,json,concurrent.futures
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'evidence'/'video_review'
OUT.mkdir(parents=True,exist_ok=True)
def get(url):
    try:
        response=requests.get(url,timeout=(15,25),headers={'User-Agent':'Mozilla/5.0'})
        soup=BeautifulSoup(response.text,'html.parser')
        return {'input':url,'chain':[{'url':r.url,'status':r.status_code,'location':r.headers.get('Location')} for r in response.history], 'final':response.url,'status':response.status_code,'title':soup.title.get_text() if soup.title else '', 'preview':soup.get_text(' ',strip=True)[:8000], 'links':[{'text':a.get_text(' ',strip=True),'href':a['href']} for a in soup.find_all('a',href=True)]}
    except Exception as error:return {'input':url,'error':str(error)}
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    rows=list(pool.map(get,['https://meet.slooze.xyz/cal','https://about.slooze.xyz/news']))
(OUT/'slooze_link_audit.json').write_text(json.dumps(rows,indent=2),encoding='utf8')
print(json.dumps(rows,indent=2))
