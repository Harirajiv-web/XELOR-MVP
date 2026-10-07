#!/bin/bash
cd "$(dirname "$0")/build"
FONTSTYLE="<style id=\"xelor-fonts\">$(cat fonts.css)</style>"
assemble(){ # $1 = font block
  { echo '<title>XELOR Product Demo</title>'; echo "$1"; echo '<style>'; cat head.css base.css xelor.css market.css; echo '</style>'; cat shell.html; echo '<script>'; cat core.js screens.js screens6.js screens7.js boot.js; echo '</script>'; }
}
assemble "$FONTSTYLE" > body.html
assemble "<!--XELOR-FONTS-->" > body-embed.html
wrap(){ { echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'; echo '<meta name="description" content="XELOR product demo: the trusted supplier network, run by an agentic AI ERP. One order followed through six roles, then onto XELOR Market and Xelogram. Demonstration data.">'; python3 - "$1" <<'PY'
import sys;h=open(sys.argv[1]).read();i=h.index('</style>',h.index('<style>\n'))+8
sys.stdout.write(h[:i]+'</head><body>'+h[i:]+'</body></html>')
PY
} ; }
wrap body.html > full.html
wrap body-embed.html > full-embed.html
node -e "const fs=require('fs');const h=fs.readFileSync('full.html','utf8');const js=h.split('<script>')[1].split('</script>')[0];new Function(js);console.log('JS OK',h.length, fs.statSync('full-embed.html').size)"
