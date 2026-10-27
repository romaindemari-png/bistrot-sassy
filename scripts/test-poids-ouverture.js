#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LE POIDS À L'OUVERTURE DE L'ADMIN (bout 7c-4)
   ═══════════════════════════════════════════════════════════════════════════
   La sonde sert le dépôt (cache coupé) et passe /.netlify/images au VRAI CDN de prod : les vignettes pèsent
   ce que le client télécharge. Elle ouvre l'admin sur Mon site, à 390 ×2 et 1280 ×1, et compte :
     · toutes les requêtes, et les images (nombre, octets), avec le détail des logos et de photo-demo.jpg ;
   puis vérifie :
   1. photo-demo.jpg N'EST PAS chargée à l'ouverture… et l'EST à l'ouverture du studio (Mon Instagram) ;
   2. UN SEUL logo LeLab est chargé : la variante utile (chromie nuit/jour × LeLab/LeLab+), celle qu'on voit —
      à la première visite comme à la suivante (plan retenu, téléphone en clair) ;
   2ter. lecture des données en échec : la barre montre quand même le logo LeLab (un seul) — déjà vrai sur HEAD,
      gardé ici comme garde-fou ;
   3. la vignette d'une photo d'événement est en 16:9, object-fit: cover (le cadrage du site, index.html:979) ;
      la feuille Photos garde ses carrés.
   ⚠️ ROUGE sur le code d'avant 7c-4 (photo-demo préchargée au script, six logos chargés).
   USAGE :  node scripts/test-poids-ouverture.js [port]   (port par défaut 8795 ; réseau requis pour le CDN)
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs'), path = require('path'), http = require('http'), https = require('https');
const RACINE = path.join(__dirname, '..');
const PORT   = +(process.argv[2] || 8795);
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROD   = 'https://bistrot-sassy.netlify.app';
const EVTS_PH = fs.readFileSync(path.join(__dirname, 'fixtures', 'evenements-photos-source.json'), 'utf8');
const pause = ms => new Promise(r => setTimeout(r, ms));
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch (e){ console.error('puppeteer-core manquant → npm install'); process.exit(2); }

const fails = [], lignes = [];
const verdict = (nom, ok, detail) => { lignes.push(`| ${nom} | ${detail} | ${ok ? '✅' : '❌'} |`); if (!ok) fails.push(`${nom} : ${detail}`); };
const Ko = o => Math.round(o / 1024) + ' Ko';

const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png',
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2', '.svg':'image/svg+xml' };
const cdn = new Map();
let evenementsAvecPhotos = false, donneesEn500 = false;
const serveur = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (donneesEn500 && /^\/_data\/[^/]+\.json$/.test(u.pathname)){ r.writeHead(500); return r.end('{}'); }
  if (evenementsAvecPhotos && u.pathname === '/_data/events.json'){ r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end(EVTS_PH); }
  if (u.pathname === '/.netlify/functions/serve-image'){   // une photo « Blobs » d'événement : une image du dépôt, paysage
    r.writeHead(200, { 'Content-Type': 'image/webp' }); return fs.createReadStream(path.join(RACINE, 'assets/photos/devanture-vitrine.webp')).pipe(r); }
  if (u.pathname === '/.netlify/images'){
    const src = u.searchParams.get('url') || '';
    if (/serve-image/.test(src)){ r.writeHead(200, { 'Content-Type': 'image/webp' }); return fs.createReadStream(path.join(RACINE, 'assets/photos/devanture-vitrine.webp')).pipe(r); }
    if (cdn.has(q.url)){ r.writeHead(200, { 'Content-Type': 'image/webp' }); return r.end(cdn.get(q.url)); }
    return https.get(PROD + q.url, res => { const m = []; res.on('data', c => m.push(c)); res.on('end', () => { const b = Buffer.concat(m);
      if (res.statusCode === 200) cdn.set(q.url, b); r.writeHead(res.statusCode, { 'Content-Type': res.headers['content-type'] || 'image/webp' }); r.end(b); }); })
      .on('error', () => { r.writeHead(502); r.end(); });
  }
  let f = path.join(RACINE, decodeURIComponent(u.pathname));
  if (!f.startsWith(RACINE)){ r.writeHead(403); return r.end(); }
  if (f.endsWith('/')) f += 'index.html';
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()){ r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Content-Length': st.size });
    fs.createReadStream(f).pipe(r);
  });
});

(async () => {
  await new Promise(r => serveur.listen(PORT, r));
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const ouvrir = async (largeur, dpr, chemin = '/admin/', avant) => {
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage();
    if (avant) await avant(p);
    await p.setViewport({ width: largeur, height: largeur > 900 ? 900 : 844, deviceScaleFactor: dpr, isMobile: largeur < 900 });
    const cdp = await p.target().createCDPSession(); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    const req = {};
    cdp.on('Network.requestWillBeSent', e => { if (!/^data:/.test(e.request.url)) req[e.requestId] = { url: e.request.url.replace(/^https?:\/\/[^/]+/, ''), type: e.type, octets: 0 }; });
    cdp.on('Network.loadingFinished', e => { if (req[e.requestId]) req[e.requestId].octets = e.encodedDataLength; });
    await p.goto(`http://localhost:${PORT}${chemin}`, { waitUntil: 'networkidle0' });
    await pause(1500);
    return { ctx, p, req };
  };
  const bilan = req => {
    const tout = Object.values(req), imgs = tout.filter(x => x.type === 'Image');
    const logos = imgs.filter(x => /logo-lelab/.test(x.url)), demo = imgs.filter(x => /photo-demo/.test(x.url));
    return { n: tout.length, octets: tout.reduce((t, x) => t + x.octets, 0), nImg: imgs.length, octImg: imgs.reduce((t, x) => t + x.octets, 0),
      logos, demo, autres: imgs.filter(x => !/logo-lelab|photo-demo/.test(x.url)) };
  };

  try {
    for (const [L, dpr] of [[390, 2], [1280, 1]]){
      const { ctx, p, req } = await ouvrir(L, dpr);
      const o = bilan(req);
      const visible = await p.evaluate(() => [...document.querySelectorAll('img')].filter(i => /logo-lelab/.test(i.currentSrc || i.src || '') && i.getClientRects().length)
        .map(i => (i.currentSrc || i.src).replace(/^https?:\/\/[^/]+/, '')));
      console.log(`\n── Ouverture de Mon site · ${L} ×${dpr} ──`);
      console.log(`  ${o.n} requêtes, ${Ko(o.octets)} au total · images : ${o.nImg} requêtes, ${Ko(o.octImg)}`);
      console.log(`  logos (${o.logos.length}) : ${o.logos.map(x => x.url.split('/').pop() + ' ' + Ko(x.octets)).join(', ') || 'aucun'}`);
      console.log(`  photo-demo : ${o.demo.map(x => Ko(x.octets)).join(', ') || 'non chargée'}`);
      console.log(`  autres images : ${o.autres.map(x => decodeURIComponent(x.url).replace(/&fm=webp/, '').replace('/.netlify/images?url=', 'CDN ') + ' ' + Ko(x.octets)).join(' · ')}`);
      verdict(`${L} ×${dpr} · photo-demo absente à l’ouverture`, !o.demo.length, o.demo.length ? `chargée (${Ko(o.demo[0].octets)})` : 'non chargée');
      verdict(`${L} ×${dpr} · un seul logo, celui qu’on voit`, o.logos.length === 1 && visible.length === 1 && o.logos[0].url === visible[0],
        `${o.logos.length} logo(s) chargé(s) : ${o.logos.map(x => x.url.split('/').pop()).join(', ')} · affiché : ${visible.map(v => v.split('/').pop()).join(', ') || 'aucun'}`);
      lignes.push(`| ${L} ×${dpr} · bilan (mesuré) | ${o.n} requêtes, ${Ko(o.octets)} · images ${o.nImg} req., ${Ko(o.octImg)} | — |`);
      /* Le studio : photo-demo arrive à son ouverture */
      const n0 = Object.values(req).filter(x => /photo-demo/.test(x.url)).length;
      await p.evaluate(() => handlePlusClick()); await pause(1500);
      const n1 = Object.values(req).filter(x => /photo-demo/.test(x.url)).length;
      verdict(`${L} ×${dpr} · photo-demo à l’ouverture du studio`, n1 >= 1, n1 > n0 ? 'demandée à l’ouverture du studio' : n1 ? 'déjà là (chargée à l’ouverture de l’admin)' : 'PAS chargée');
      await ctx.close();
    }

    /* 2bis. Deuxième visite, téléphone en clair : le plan retenu pose le logo de l'attente — toujours un seul logo. */
    { const { ctx, p, req } = await ouvrir(390, 2, '/admin/', async q => {
        await q.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
        await q.evaluateOnNewDocument(() => { try { localStorage.setItem('lelab_plan', 'lelab_plus'); } catch (_){} }); });
      const o = bilan(req);
      verdict('2e visite, jour · un seul logo', o.logos.length === 1 && /logo-lelab-plus-noir-h\.png$/.test(o.logos[0].url), `${o.logos.length} logo(s) : ${o.logos.map(x => x.url.split('/').pop()).join(', ')}`);
      await ctx.close(); }

    /* 2ter. Lecture des données en échec (toutes les /_data/*.json en 500) : le plan n'est jamais lu, la barre doit
       quand même montrer le logo LeLab de la chromie courante (applyPlan('lelab'), repli de loadSassyData). Un seul. */
    donneesEn500 = true;
    { const { ctx, p, req } = await ouvrir(390, 2);
      const o = bilan(req);
      const vu = await p.evaluate(() => [...document.querySelectorAll('.barre img')].filter(i => i.getClientRects().length)
        .map(i => ({ f: (i.currentSrc || '').split('/').pop(), charge: i.complete && i.naturalWidth > 0 })));
      verdict('données en 500 · le logo LeLab est là', vu.length === 1 && vu[0].charge && vu[0].f === 'logo-lelab-blanc-h.png' && o.logos.length === 1,
        `affiché : ${vu.map(v => v.f + (v.charge ? '' : ' (VIDE)')).join(', ') || 'AUCUN'} · ${o.logos.length} logo(s) chargé(s)`);
      await ctx.close(); }
    donneesEn500 = false;

    /* 3. Cadrages : événement 16:9 cover, feuille Photos carrée */
    evenementsAvecPhotos = true;
    { const { ctx, p } = await ouvrir(390, 1, '/admin/#edit/events');
      await p.waitForSelector('.f-ev .cp-cadre', { timeout: 6000 }).catch(() => {});
      const c = await p.evaluate(() => { const v = [...document.querySelectorAll('.f-ev .cp')].find(x => x.dataset.etat === 'pleine'); if (!v) return null;
        const r = v.querySelector('.cp-cadre').getBoundingClientRect(), i = v.querySelector('.cp-img');
        return { l: r.width, h: r.height, fit: getComputedStyle(i).objectFit, vu: r.width > 0 }; });
      verdict('vignette d’événement en 16:9, cover', !!c && c.vu && Math.abs(c.l / c.h - 16 / 9) < 0.02 && c.fit === 'cover',
        c ? `${c.l.toFixed(0)}×${c.h.toFixed(0)} px (ratio ${(c.l / c.h).toFixed(3)}, 16:9 = 1,778), object-fit ${c.fit}` : 'aucune vignette pleine');
      await ctx.close(); }
    evenementsAvecPhotos = false;
    { const { ctx, p } = await ouvrir(390, 1, '/admin/#edit/photos');
      await p.waitForSelector('.f-ph .cp-cadre', { timeout: 6000 }).catch(() => {});
      const c = await p.evaluate(() => { const r = document.querySelector('.f-photos[data-partie="galerie"] .cp-cadre').getBoundingClientRect(); return { l: r.width, h: r.height }; });
      verdict('feuille Photos : des carrés', Math.abs(c.l / c.h - 1) < 0.02, `${c.l.toFixed(0)}×${c.h.toFixed(0)} px`);
      await ctx.close(); }
  } catch (err){ fails.push('exception : ' + err.message); }

  await b.close(); serveur.close();
  console.log('\n═══ LE POIDS À L’OUVERTURE ═══\n\n| Contrôle | Mesuré | |\n|---|---|---|\n' + lignes.join('\n'));
  if (fails.length){ console.log('\n❌ ' + fails.length + ' échec(s) :\n  - ' + fails.join('\n  - ')); process.exit(1); }
  console.log('\n✅ POIDS — photo-demo attend le studio, un seul logo, les cadrages sont ceux du site.');
})();
