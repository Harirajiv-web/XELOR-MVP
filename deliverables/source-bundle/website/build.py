"""Build the XELOR website from src.html: inline the WebP images as data URIs.
Writes xelor-site.html (artifact form, no <html>/<head>) and index.html (standalone page for Vercel or any host)."""
import base64, re, pathlib
here = pathlib.Path(__file__).parent
s = (here / 'src.html').read_text()
for k in set(re.findall(r'\{\{([a-z0-9-]+)\}\}', s)):
    s = s.replace('{{%s}}' % k, 'data:image/webp;base64,' + base64.b64encode((here / 'img' / f'{k}.webp').read_bytes()).decode())
(here / 'xelor-site.html').write_text(s)
i = s.index('</style>') + 8
(here / 'index.html').write_text('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + s[:i] + '\n</head>\n<body>\n' + s[i:] + '\n</body>\n</html>\n')
print('built', len(s), 'bytes')
