/* ---------- boot ---------- */
try{const h=location.hash.replace('#','');if(ROLES[h]){ui.role=h;ui.dev=ROLES[h].dev}}catch(_){}
paintTheme();
render();
