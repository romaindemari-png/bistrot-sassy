#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LA FEUILLE DES PHOTOS (bout 7c-2) — le composant photo de 7c-1, branché
   ═══════════════════════════════════════════════════════════════════════════
   La sonde est SON PROPRE SERVEUR : elle sert le dépôt, et répond elle-même à
     · /_data/photos.json ... la COPIE scripts/fixtures/photos-source.json (la photo.json de Sassy + une photo
                              Blobs déjà publiée, « ancienne.jpg », pour voir quand on la supprime) ; après un
                              save-data, la copie publique reste périmée deux relectures, puis devient l'envoi ;
     · save-data ............ enregistré, jamais écrit ;
     · upload-image ......... envoi → clé photos/<cible>/sonde-N.jpg ; { action:'delete' } → ESPIONNÉ ;
     · serve-image .......... une petite image ;
     · /.netlify/images ..... le VRAI CDN de prod (bistrot-sassy.netlify.app) pour les fichiers du dépôt : les
                              poids mesurés sont ceux que le client téléchargera.
   Horloge de Publier × 0,02 (window.__LELAB_TEMPS) : la confirmation en ligne arrive en ~0,2 s.

   1. Gestes : 3e photo du haut avancée deux fois (Alt + ↑) ; la photo Blobs de la galerie remplacée ; une photo
      du dépôt retirée ; une photo glissée à la poignée en tête ; une photo ajoutée ; une autre ajoutée puis
      retirée. Le JSON envoyé est EXACTEMENT scripts/fixtures/photos-attendu.json, écrit à la main.
   2. Zéro écriture avant Publier ; l'image envoyée puis retirée est supprimée de Blobs TOUT DE SUITE ;
      l'image publiée remplacée ne l'est qu'APRÈS « C'est en ligne » ; aucun fichier du dépôt n'est supprimé.
   3. « Annuler mes changements » et la sortie confirmée suppriment tout de suite l'image envoyée.
   4. Aller-retour sans modification : à l'octet. Garde de sortie. Bouton Publier : 0 px de saut à 390 et 1280.
      Cibles ≥ 44 px. La tuile Photos suit dès l'envoi.
   5. Poids des images chargées à l'ouverture de la feuille : < 300 Ko (390 en écran dense, 1280).

   ⚠️ ROUGE sur le code d'avant 7c-2 (ancien éditeur : sauvegarde automatique, images brutes).
   USAGE :  node scripts/test-photos-feuille.js [port]      (port par défaut 8791 ; réseau requis pour le CDN)
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs'), path = require('path'), http = require('http'), https = require('https'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const RACINE = path.join(__dirname, '..');
const PORT   = +(process.argv[2] || 8791);
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROD   = 'https://bistrot-sassy.netlify.app';
const SOURCE = fs.readFileSync(path.join(__dirname, 'fixtures', 'photos-source.json'), 'utf8');
const ATTENDU = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'photos-attendu.json'), 'utf8'));
const FX = n => path.join(__dirname, 'fixtures', 'photos', n);
const pause = ms => new Promise(r => setTimeout(r, ms));
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch (e){ console.error('puppeteer-core manquant → npm install'); process.exit(2); }

const fails = [], lignes = [];
const verdict = (nom, ok, detail) => { lignes.push(`| ${nom} | ${detail} | ${ok ? '✅' : '❌'} |`); if (!ok) fails.push(`${nom} : ${detail}`); };

/* Les photos de test (ignorées par git) : générées si absentes. */
if (!['photo-24mpx.jpg', 'photo-tournee.jpg', 'photo.png'].every(n => fs.existsSync(FX(n)))){
  console.log('Photos de test manquantes → génération par scripts/gen-photos-test.py…');
  execFileSync('python3', [path.join(__dirname, 'gen-photos-test.py')], { stdio: 'inherit' });
}
/* Une petite image pour serve-image (une photo « Blobs ») : la photo tournée, réduite à 240 px. */
const PETITE = path.join(require('os').tmpdir(), 'sonde-photos-petite.jpg');
execFileSync('sips', ['-Z', '240', '-s', 'format', 'jpeg', FX('photo.png'), '--out', PETITE], { stdio: 'ignore' });

/* ── Le serveur de la sonde ─────────────────────────────────────────────────────────────────────── */
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png',
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2', '.svg':'image/svg+xml' };
const etat = { public: SOURCE, apresEnvoi: null, relectures: 0, saves: [], envois: 0, suppressions: [], journal: [], echec: false };
const note = quoi => etat.journal.push({ t: Date.now(), quoi });
function reinit(){ Object.assign(etat, { public: SOURCE, apresEnvoi: null, relectures: 0, saves: [], envois: 0, suppressions: [], journal: [], echec: false }); }
const cdn = new Map();
const serveur = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const corps = () => new Promise(ok => { const m = []; q.on('data', c => m.push(c)); q.on('end', () => ok(Buffer.concat(m).toString('utf8'))); });
  if (u.pathname === '/_data/photos.json'){
    if (etat.apresEnvoi && ++etat.relectures >= 3){ etat.public = etat.apresEnvoi; etat.apresEnvoi = null; note('en ligne'); }
    r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end(etat.public);
  }
  if (u.pathname === '/.netlify/functions/save-data') return corps().then(b => {
    const j = JSON.parse(b || '{}'); etat.saves.push(j); note('save-data');
    if (j.section === 'photos'){ etat.apresEnvoi = JSON.stringify(j.data, null, 2) + '\n'; etat.relectures = 0; }
    r.writeHead(200, { 'Content-Type': 'application/json' }); r.end('{"success":true}');
  });
  if (u.pathname === '/.netlify/functions/upload-image') return corps().then(b => {
    const j = JSON.parse(b || '{}');
    if (j.action === 'delete'){ etat.suppressions.push(j.key); note('delete ' + j.key); r.writeHead(200); return r.end('{"success":true}'); }
    if (etat.echec){ r.writeHead(500, { 'Content-Type': 'application/json' }); return r.end('{"error":"sonde : 500"}'); }
    const cle = `photos/${j.target}/sonde-${++etat.envois}.jpg`; note('envoi ' + cle);
    r.writeHead(200, { 'Content-Type': 'application/json' });
    r.end(JSON.stringify({ success: true, url: '/.netlify/functions/serve-image?key=' + encodeURIComponent(cle), key: cle }));
  });
  if (u.pathname === '/.netlify/functions/serve-image'){ r.writeHead(200, { 'Content-Type': 'image/jpeg' }); return fs.createReadStream(PETITE).pipe(r); }
  if (u.pathname === '/.netlify/images'){
    const src = u.searchParams.get('url') || '';
    if (/serve-image/.test(src)){ r.writeHead(200, { 'Content-Type': 'image/jpeg' }); return fs.createReadStream(PETITE).pipe(r); }
    const k = q.url;
    const fin = buf => { r.writeHead(200, { 'Content-Type': 'image/webp' }); r.end(buf); };
    if (cdn.has(k)) return fin(cdn.get(k));
    return https.get(PROD + q.url, res => { const m = []; res.on('data', c => m.push(c)); res.on('end', () => { const b = Buffer.concat(m); if (res.statusCode === 200) cdn.set(k, b); r.writeHead(res.statusCode, { 'Content-Type': res.headers['content-type'] || 'image/webp' }); r.end(b); }); })
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

/* 7a-ter : le bouton Publier ne bouge pas au premier changement (même mesure que les autres feuilles). */
async function sansSaut(nom, p, geste){
  const lire = () => p.evaluate(() => { window.scrollTo(0, 0); return document.getElementById('btnFeuille').getBoundingClientRect().top; });
  const avant = await lire(); await geste(); await pause(150); const apres = await lire();
  const ecart = Math.round((apres - avant) * 100) / 100;
  verdict(`${nom} · Publier ne bouge pas`, ecart === 0, `haut ${avant.toFixed(1)} → ${apres.toFixed(1)} px (écart ${ecart} px)`);
}

(async () => {
  await new Promise(r => serveur.listen(PORT, r));
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = async (largeur = 390, dpr = 1, mesurer = false) => {
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport({ width: largeur, height: 844, deviceScaleFactor: dpr, isMobile: largeur < 900 });
    await p.evaluateOnNewDocument(() => { window.__LELAB_TEMPS = 0.02; });
    let poids = null;
    if (mesurer){
      const cdp = await p.target().createCDPSession(); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      const req = {}; poids = { req };
      cdp.on('Network.responseReceived', e => { req[e.requestId] = { url: e.response.url, type: e.type }; });
      cdp.on('Network.loadingFinished', e => { if (req[e.requestId]) req[e.requestId].octets = e.encodedDataLength; });
    }
    await p.goto(`http://localhost:${PORT}/admin/#edit/photos`, { waitUntil: 'networkidle0' });
    await p.evaluate(() => { session = { access_token: 'sonde', refresh_token: 'sonde', expires_at: Date.now() + 3600e3 }; });
    const ok = await p.waitForSelector('#feuille .f-ph .cp', { timeout: 6000 }).then(() => true).catch(() => false);
    return { ctx, p, ok, poids };
  };
  /* Les images de la FEUILLE : ce que les cases chargent (CDN, serve-image, ou image brute en repli). */
  const poidsFeuille = (poids, urlsFeuille) => Object.values(poids.req).filter(x => x.type === 'Image' && urlsFeuille.has(x.url.replace(/^https?:\/\/[^/]+/, '')))
    .reduce((t, x) => t + (x.octets || 0), 0);
  const urlsDeLaFeuille = p => p.evaluate(() => [...document.querySelectorAll('#screen-edit img')].map(i => i.currentSrc.replace(/^https?:\/\/[^/]+/, '')).filter(Boolean));
  const choisir = async (p, sel, fichier) => {
    await p.$eval(sel, el => el.scrollIntoView({ block: 'center' }));
    const [ch] = await Promise.all([p.waitForFileChooser({ timeout: 4000 }), p.click(sel)]);
    await ch.accept([fichier]);
  };
  const clic = async (p, sel) => { await p.$eval(sel, el => el.scrollIntoView({ block: 'center' })); await p.click(sel); };
  const attendreEnvois = async n => { for (let i = 0; i < 200 && etat.envois < n; i++) await pause(50); await pause(250); };
  const celluleDe = (p, image) => p.evaluate(img => { const c = [...document.querySelectorAll('#feuille .f-ph[data-id]')].find(x => (x.querySelector('.cp') || {}).dataset && x.querySelector('.cp').dataset.url === img); return c ? c.dataset.id : null; }, image);

  try {
    /* ── 5. Le poids à l'ouverture ─────────────────────────────────────────────────────────── */
    for (const [L, dpr] of [[390, 2], [1280, 1]]){
      reinit();
      const { ctx, p, ok, poids } = await page(L, dpr, true);
      if (!ok){ verdict('feuille ouverte', false, 'aucune case photo — l’éditeur Photos n’est pas une feuille'); await ctx.close(); throw new Error('stop'); }
      await pause(1200);
      const urls = new Set(await urlsDeLaFeuille(p));
      const o = poidsFeuille(poids, urls);
      /* Seuil relevé de 200 à 300 Ko, décision Romain : 480 px pour la netteté sur iPhone ×3 ; mesuré 258 Ko à 390 ×2,
         contre 6,3 Mo pour l'ancien éditeur. */
      verdict(`poids à l’ouverture · ${L} px (×${dpr})`, o > 0 && o < 300 * 1024, `${Math.round(o / 1024)} Ko pour ${urls.size} vignette(s) chargée(s) (ancien éditeur : 6 279 Ko, images brutes)`);
      await ctx.close();
    }

    /* ── 1-2. Les gestes, l'envoi, les suppressions ───────────────────────────────────────── */
    reinit();
    const { ctx, p } = await page(390, 1);
    const ids = {};
    for (const [n, img] of [['s3', '/assets/photos/lettre-s.png'], ['g1', '/galerie1.png'], ['g3', '/galerie3.jpeg'], ['piments', '/assets/photos/piments.webp'],
      ['ancienne', '/.netlify/functions/serve-image?key=photos%2Fgalerie%2Fancienne.jpg']]) ids[n] = await celluleDe(p, img);
    /* Haut de page : la 3e avance deux fois, au clavier (Alt + ↑), le focus sur sa poignée. */
    await p.focus(`.f-ph[data-id="${ids.s3}"] .f-ph-poignee`);
    await p.keyboard.down('Alt'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); await p.keyboard.up('Alt');
    const hautAucunRetirer = await p.evaluate(() => [...document.querySelectorAll('.f-photos[data-partie="slider"] [data-action="retirer"], .f-photos[data-partie="slider"] .f-ph--ajout')].filter(e => e.getClientRects().length).length);
    verdict('haut de page : ni Retirer ni Ajouter', hautAucunRetirer === 0, `${hautAucunRetirer} Retirer / case d’ajout visible(s)`);
    /* Galerie : remplacer la photo Blobs publiée */
    await choisir(p, `.f-ph[data-id="${ids.ancienne}"] [data-action="remplacer"]`, FX('photo.png'));
    await attendreEnvois(1);
    /* Retirer une photo du dépôt */
    await clic(p, `.f-ph[data-id="${ids.g1}"] [data-action="retirer"]`);
    /* Glisser galerie3 sur piments (tête de galerie), à la poignée */
    await p.$eval(`.f-ph[data-id="${ids.g3}"] .f-ph-poignee`, el => el.scrollIntoView({ block: 'center' }));
    const de = await p.$eval(`.f-ph[data-id="${ids.g3}"] .f-ph-poignee`, el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const vers = await p.$eval(`.f-ph[data-id="${ids.piments}"] .cp-cadre`, el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.mouse.move(de.x, de.y); await p.mouse.down();
    for (let i = 1; i <= 14; i++){ await p.mouse.move(de.x + (vers.x - de.x) * i / 14, de.y + (vers.y - de.y) * i / 14); await pause(16); }
    await p.mouse.up(); await pause(100);
    /* Ajouter une photo, puis une autre qu'on retire aussitôt */
    await choisir(p, '.f-photos[data-partie="galerie"] .f-ph--ajout [data-action="ajouter"]', FX('photo-tournee.jpg'));
    await attendreEnvois(2);
    await choisir(p, '.f-photos[data-partie="galerie"] .f-ph--ajout [data-action="ajouter"]', FX('photo.png'));
    await attendreEnvois(3);
    const id3 = await celluleDe(p, '/.netlify/functions/serve-image?key=photos%2Fgalerie%2Fsonde-3.jpg');
    await clic(p, `.f-ph[data-id="${id3}"] [data-action="retirer"]`);
    await pause(200);
    verdict('zéro écriture avant Publier', etat.saves.length === 0, `${etat.saves.length} appel(s) à save-data`);
    verdict('envoyée puis retirée : supprimée tout de suite', etat.suppressions.join() === 'photos/galerie/sonde-3.jpg', `suppressions : ${etat.suppressions.join(', ') || 'aucune'}`);
    const cibles = await p.evaluate(() => [...document.querySelectorAll('#feuille [data-action]')].filter(e => e.getClientRects().length)
      .map(e => ({ a: e.dataset.action, h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width })));
    const petites = cibles.filter(c => c.h < 44 || (c.a === 'poignee' && c.w < 44));
    verdict('cibles ≥ 44 px', cibles.length > 0 && !petites.length, petites.length ? petites.map(c => `${c.a} ${c.h.toFixed(0)} px`).join(', ') : `${cibles.length} cibles, toutes ≥ 44 px`);
    /* La garde */
    await clic(p, '.f-retour'); await pause(400);
    const garde = await p.evaluate(() => ({ q: getComputedStyle(document.getElementById('quitConfirm')).display, ecran: document.getElementById('screen-edit').classList.contains('active') }));
    verdict('quitter avec des changements', garde.q === 'flex' && garde.ecran, `#quitConfirm ${garde.q}, feuille ${garde.ecran ? 'toujours là' : 'QUITTÉE'}`);
    await p.click('#quitConfirm .btn--ghost'); await pause(150);   // « Rester »
    /* Publier */
    const avantEnvoi = etat.suppressions.length;
    await clic(p, '#btnFeuille');
    for (let i = 0; i < 100 && !etat.saves.length; i++) await pause(50);
    const e = etat.saves[0];
    const exact = !!e && e.section === 'photos' && JSON.stringify(e.data) === JSON.stringify(ATTENDU);
    verdict('JSON envoyé == photos-attendu.json', exact, e ? (exact ? 'identique, clé par clé et dans l’ordre' : 'DIFFÉRENT :\n' + JSON.stringify(e.data, null, 1)) : 'RIEN n’a été envoyé');
    await pause(80);
    const avantEnLigne = etat.suppressions.slice(avantEnvoi);
    for (let i = 0; i < 100 && !etat.journal.some(j => j.quoi === 'en ligne'); i++) await pause(50);
    await pause(600);
    const tEnLigne = (etat.journal.find(j => j.quoi === 'en ligne') || {}).t, tSupp = (etat.journal.find(j => j.quoi === 'delete photos/galerie/ancienne.jpg') || {}).t;
    verdict('publiée remplacée : supprimée après « C’est en ligne »', !avantEnLigne.length && tSupp && tEnLigne && tSupp >= tEnLigne,
      `avant la preuve : ${avantEnLigne.join(', ') || 'aucune'} · ancienne.jpg ${tSupp ? 'supprimée ' + (tSupp - tEnLigne) + ' ms après « en ligne »' : 'JAMAIS supprimée'}`);
    const depot = etat.suppressions.filter(k => !/^photos\//.test(k));
    verdict('aucun fichier du dépôt supprimé', !depot.length && !etat.suppressions.some(k => /galerie1/.test(k)), `suppressions : ${etat.suppressions.join(', ')}`);
    const tuile = await p.evaluate(() => [...document.querySelectorAll('#siteGrid .tuile[data-bloc="photos"] img')].map(i => i.getAttribute('data-brut') || i.getAttribute('src')));
    verdict('la tuile Photos suit dès l’envoi', /lettre-s/.test(tuile[0] || ''), `1re image de la tuile : ${tuile[0] || '—'}`);
    await ctx.close();

    /* ── 3. Annuler mes changements, sortie confirmée ─────────────────────────────────────── */
    for (const [nom, geste] of [['« Annuler »', async q => clic(q, '#feuilleAnnuler')],
                                ['sortie confirmée', async q => { await clic(q, '.f-retour'); await pause(300); await q.click('#quitConfirm .confirm-danger'); }]]){
      reinit();
      const { ctx: c, p: q } = await page(1280, 1);
      await choisir(q, '.f-photos[data-partie="galerie"] .f-ph--ajout [data-action="ajouter"]', FX('photo-tournee.jpg'));
      await attendreEnvois(1);
      await geste(q); await pause(300);
      verdict(`${nom} : l’image envoyée est supprimée tout de suite`, etat.suppressions.join() === 'photos/galerie/sonde-1.jpg' && !etat.saves.length,
        `suppressions : ${etat.suppressions.join(', ') || 'aucune'} · ${etat.saves.length} écriture(s)`);
      await c.close();
    }

    /* ── Une photo publiée dont le remplacement échoue : le bouton le dit (pas « Tout est en ligne »), rien ne part ── */
    reinit(); etat.echec = true;
    { const { ctx: c, p: q } = await page(390, 1);
      const g = await celluleDe(q, '/galerie2.jpeg');
      await choisir(q, `.f-ph[data-id="${g}"] [data-action="remplacer"]`, FX('photo.png'));
      for (let i = 0; i < 100 && (await q.evaluate(id => (document.querySelector(`.f-ph[data-id="${id}"] .cp`) || {}).dataset.etat, g)) !== 'echec'; i++) await pause(40);
      const bt = await q.evaluate(() => ({ t: document.getElementById('btnFeuille').textContent, d: document.getElementById('btnFeuille').disabled }));
      await q.evaluate(() => saveSection()); await pause(200);
      verdict('remplacement en échec : « Une photo pas encore partie »', bt.t === 'Une photo pas encore partie' && bt.d && !etat.saves.length, `« ${bt.t} » ${bt.d ? 'non cliquable' : 'CLIQUABLE'} · ${etat.saves.length} écriture(s)`);
      await c.close(); }

    /* ── 4. Aller-retour, saut du bouton ──────────────────────────────────────────────────── */
    reinit();
    { const { ctx: c, p: q } = await page(390, 1);
      await q.evaluate(() => saveSection()); await pause(300);
      const s = etat.saves[0], ecrit = s && JSON.stringify(s.data, null, 2) + '\n';
      verdict('aller-retour à l’octet', ecrit === SOURCE, s ? (ecrit === SOURCE ? `${SOURCE.length} octets identiques` : 'DIFFÉRENT') : 'rien envoyé');
      await c.close(); }
    for (const L of [390, 1280]){
      reinit();
      const { ctx: c, p: q } = await page(L, 1);
      const g = await celluleDe(q, '/galerie2.jpeg');
      await sansSaut(`photos ${L}`, q, () => clic(q, `.f-ph[data-id="${g}"] [data-action="retirer"]`));
      await c.close();
    }
  } catch (err){ if (err.message !== 'stop') fails.push('exception : ' + err.message); }

  await b.close(); serveur.close();
  console.log('\n═══ LA FEUILLE DES PHOTOS ═══\n\n| Contrôle | Mesuré | |\n|---|---|---|\n' + lignes.join('\n'));
  if (fails.length){ console.log('\n❌ ' + fails.length + ' échec(s) :\n  - ' + fails.join('\n  - ')); process.exit(1); }
  console.log('\n✅ PHOTOS — le JSON envoyé est celui écrit à la main, rien n’est écrit avant Publier, Blobs n’est vidé qu’au bon moment, le dépôt jamais.');
})();
