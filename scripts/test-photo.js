#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LE COMPOSANT PHOTO (bout 7c-1) — sur sa page de contrôle, /admin/photo.html
   ═══════════════════════════════════════════════════════════════════════════
   La sonde est SON PROPRE SERVEUR : elle sert le dépôt (fichiers statiques) et répond elle-même à
   upload-image, en trois humeurs — LENT, 500, puis OK. ⚠️ « Lent » = le DÉBIT MONTANT du navigateur bridé à
   48 Ko/s (émulation réseau de Chrome) : lire le corps lentement côté serveur ne suffit pas, la boucle locale
   avale 111 Ko d'un coup et la progression saute de 0 à 100 % (constaté). Les fichiers choisis sont ceux de scripts/fixtures/photos/
   (générés par scripts/gen-photos-test.py, jamais pris dans un dossier client — et générés par la sonde s'ils
   manquent : ils ne sont pas dans le dépôt), par le vrai sélecteur de fichier (clic → file chooser).

   1. PROGRESSION RÉELLE : pendant un envoi lent, la case passe par plusieurs valeurs croissantes, jamais
      au-delà de 90 % avant la réponse ; 100 % et « pleine » seulement après le 200.
   2. 500 → « Réessayer » ; Réessayer (serveur OK) → pleine. Deux envois, le même fichier.
   3. LE FICHIER ENVOYÉ : un JPEG, grand côté ≤ 1600 px (galerie, événements) ou ≤ 2048 px (haut de page),
      SANS EXIF (ni appareil ni GPS).
   4. LA PHOTO TOURNÉE PAR EXIF (orientation 6) sort À L'ENDROIT : portrait, rouge en haut, bleu en bas.
   5. LE FAUX .jpg et LE HEIC donnent chacun leur message, et rien n'est envoyé.
   6. Retirer → barrée avec « Annuler » ; Annuler → pleine. Cibles ≥ 44 px.
   7. LA VIGNETTE passe par le CDN (w=240, w=480 en écran dense) ; CDN en panne → l'image brute s'affiche.
      Vraies couleurs : aucun filtre ni fusion sur l'image ; rayon 10 px.
   8. AUCUNE DONNÉE ÉCRITE : aucun appel à save-data, _data/ identique à l'octet avant et après.

   ⚠️ ROUGE tant que /admin/photo.html et le composant n'existent pas.
   USAGE :  node scripts/test-photo.js [port]      (sert lui-même le dépôt ; port par défaut 8790)
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto');
const RACINE = path.join(__dirname, '..');
const PORT   = +(process.argv[2] || 8790);
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FX     = n => path.join(__dirname, 'fixtures', 'photos', n);
const pause  = ms => new Promise(r => setTimeout(r, ms));
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch (e){ console.error('puppeteer-core manquant → npm install'); process.exit(2); }

const fails = [], lignes = [];
const verdict = (nom, ok, detail) => { lignes.push(`| ${nom} | ${detail} | ${ok ? '✅' : '❌'} |`); if (!ok) fails.push(`${nom} : ${detail}`); };

/* ── Le serveur de la sonde ─────────────────────────────────────────────────────────────────────── */
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png',
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2', '.svg':'image/svg+xml' };
const etat = { humeur: 'ok', cdn: false, envois: [], saveData: 0 };
const serveur = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/.netlify/functions/save-data'){ etat.saveData++; r.writeHead(500); return r.end('{"error":"interdit en sonde"}'); }
  if (u.pathname === '/.netlify/functions/upload-image'){
    const morceaux = [];
    q.on('data', c => morceaux.push(c));
    q.on('end', () => {
      const corps = Buffer.concat(morceaux).toString('utf8');
      let j = {}; try { j = JSON.parse(corps); } catch (_){}
      etat.envois.push({ humeur: etat.humeur === 'lent' ? 'ok' : etat.humeur, target: j.target, octets: corps.length, image: j.dataBase64 ? Buffer.from(j.dataBase64, 'base64') : null });
      if (etat.humeur === '500'){ r.writeHead(500, { 'Content-Type': 'application/json' }); return r.end('{"error":"sonde : 500"}'); }
      const cle = 'photos/' + (j.target || 'x') + '/sonde-' + etat.envois.length + '.jpg';
      r.writeHead(200, { 'Content-Type': 'application/json' });
      r.end(JSON.stringify({ success: true, url: '/.netlify/functions/serve-image?key=' + encodeURIComponent(cle), key: cle }));
    });
    return;
  }
  if (u.pathname === '/.netlify/functions/serve-image'){   // la photo « envoyée » : on renvoie la dernière reçue
    const e = etat.envois.filter(x => x.image).pop();
    if (!e){ r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': 'image/jpeg' }); return r.end(e.image);
  }
  if (u.pathname === '/.netlify/images'){                  // le CDN : en panne (404) ou rendu (l'image source, telle quelle)
    if (!etat.cdn){ r.writeHead(404); return r.end(); }
    const src = u.searchParams.get('url') || '';
    const f = path.join(RACINE, decodeURIComponent(src.split('?')[0]));
    if (!src.startsWith('/') || !fs.existsSync(f)){ r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r);
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

/* ── Lire un JPEG reçu : dimensions (SOFn) et présence d'EXIF (APP1 « Exif ») ─────────────────────── */
function lireJpeg(buf){
  if (!buf || buf[0] !== 0xFF || buf[1] !== 0xD8) return { jpeg: false };
  let i = 2, exif = false, l = 0, h = 0;
  while (i < buf.length - 4){
    if (buf[i] !== 0xFF){ i++; continue; }
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m === 0xE1 && buf.slice(i + 4, i + 8).toString('latin1') === 'Exif') exif = true;
    if (m >= 0xC0 && m <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(m)){ h = buf.readUInt16BE(i + 5); l = buf.readUInt16BE(i + 7); break; }
    if (m === 0xDA) break;
    i += 2 + len;
  }
  return { jpeg: true, exif, largeur: l, hauteur: h };
}
const hashData = () => {
  const h = crypto.createHash('sha256');
  const tour = d => fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).forEach(e => {
    const p = path.join(d, e.name); if (e.isDirectory()) tour(p); else { h.update(p); h.update(fs.readFileSync(p)); } });
  tour(path.join(RACINE, '_data')); return h.digest('hex');
};

/* Les photos de test ne sont pas dans le dépôt (.gitignore : 11 Mo, et Netlify publie tout le dépôt) :
   générées à la demande par scripts/gen-photos-test.py. */
function fixtures(){
  const manquent = ['photo-24mpx.jpg', 'photo-tournee.jpg', 'photo.png', 'faux.jpg', 'photo.heic'].filter(n => !fs.existsSync(FX(n)));
  if (!manquent.length) return console.log('Photos de test : déjà là (scripts/fixtures/photos/).');
  console.log(`Photos de test manquantes (${manquent.join(', ')}) → génération par scripts/gen-photos-test.py…`);
  require('child_process').execFileSync('python3', [path.join(__dirname, 'gen-photos-test.py')], { stdio: 'inherit' });
}

(async () => {
  fixtures();
  const avant = hashData();
  await new Promise(r => serveur.listen(PORT, r));
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = async (largeur = 390, dpr = 1) => {
    const p = await b.newPage();
    await p.setViewport({ width: largeur, height: 900, deviceScaleFactor: dpr, isMobile: largeur < 900 });
    const r = await p.goto(`http://localhost:${PORT}/admin/photo.html`, { waitUntil: 'networkidle0' });
    return { p, ok: r && r.ok() && await p.evaluate(() => typeof creerCasePhoto === 'function' && !!document.querySelector('[data-case="vide"] .cp')) };
  };
  /* Choisir un fichier comme un client : clic sur l'élément, le sélecteur s'ouvre, on donne le fichier. */
  const choisir = async (p, sel, fichier) => {
    const [ch] = await Promise.all([p.waitForFileChooser({ timeout: 4000 }), p.click(sel)]);
    await ch.accept([fichier]);
  };
  /* Attendre qu'une case atteigne un état (la réduction prend quelques centaines de ms avant l'envoi). */
  const attendre = async (p, nom, etats, ms = 15000) => { const t = Date.now(); let c;
    do { c = await lireCase(p, nom); if (etats.includes(c.etat)) return c; await pause(40); } while (Date.now() - t < ms); return c; };
  const lireCase = (p, nom) => p.evaluate(n => { const c = document.querySelector(`[data-case="${n}"] .cp`);
    const vu = e => !!e && e.getClientRects().length > 0;
    return { etat: c.dataset.etat, f: +(c.dataset.progression || 0), message: (c.querySelector('.cp-message') || {}).textContent || '',
      reessayer: vu(c.querySelector('[data-action="reessayer"]')), annuler: vu(c.querySelector('[data-action="annuler"]')),
      remplacer: vu(c.querySelector('[data-action="remplacer"]')), retirer: vu(c.querySelector('[data-action="retirer"]')),
      barre: vu(c.querySelector('.cp-barre')), url: c.dataset.url || '' }; }, nom);

  try {
    const { p, ok } = await page();
    if (!ok){ verdict('page de contrôle', false, '/admin/photo.html ou creerCasePhoto absents — le composant n’existe pas'); throw new Error('stop'); }

    /* 1. Envoi lent : la progression monte, ≤ 90 % avant la réponse */
    etat.humeur = 'lent';
    const cdp = await p.target().createCDPSession();
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: -1, uploadThroughput: 48 * 1024 });
    await choisir(p, '[data-case="vide"] [data-action="ajouter"]', FX('photo-24mpx.jpg'));
    const vus = []; const t0 = Date.now();
    while (Date.now() - t0 < 30000){
      const c = await lireCase(p, 'vide'); vus.push({ e: c.etat, f: c.f });
      if (c.etat === 'pleine' || c.etat === 'echec') break;
      await pause(30);
    }
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const envoi = vus.filter(v => v.e === 'envoi').map(v => v.f);
    const distincts = [...new Set(envoi.map(f => f.toFixed(3)))];
    const croissant = envoi.every((f, i) => i === 0 || f >= envoi[i - 1]);
    verdict('progression réelle pendant l’envoi', distincts.length >= 4 && croissant && Math.max(...envoi) <= 0.9,
      `${distincts.length} valeurs distinctes, ${croissant ? 'croissantes' : 'NON croissantes'}, de ${(Math.min(...envoi) * 100).toFixed(0)} à ${(Math.max(...envoi) * 100).toFixed(0)} % avant la réponse`);
    const fin = vus[vus.length - 1];
    verdict('pleine après le 200', fin.e === 'pleine' && fin.f === 1, `état « ${fin.e} », ${(fin.f * 100).toFixed(0)} %`);
    const e1 = etat.envois[etat.envois.length - 1], j1 = lireJpeg(e1 && e1.image);
    verdict('galerie : ≤ 1600 px, JPEG, sans EXIF', j1.jpeg && Math.max(j1.largeur, j1.hauteur) <= 1600 && !j1.exif && e1.target === 'galerie',
      `${j1.jpeg ? 'JPEG' : 'PAS un JPEG'} ${j1.largeur}×${j1.hauteur}, EXIF ${j1.exif ? 'PRÉSENT' : 'absent'}, cible « ${e1 && e1.target} », ${Math.round((e1 && e1.octets || 0) / 1024)} Ko envoyés (source 6,2 Mo)`);

    /* 2. 500 → Réessayer → OK */
    etat.humeur = '500';
    const n0 = etat.envois.length;
    await choisir(p, '[data-case="galerie"] [data-action="remplacer"]', FX('photo.png'));
    const ech = await attendre(p, 'galerie', ['echec']);
    verdict('500 → « Réessayer »', ech.etat === 'echec' && ech.reessayer && !ech.remplacer, `état « ${ech.etat} », Réessayer ${ech.reessayer ? 'visible' : 'ABSENT'}, « ${ech.message} »`);
    etat.humeur = 'ok';
    await p.click('[data-case="galerie"] [data-action="reessayer"]');
    const reu = await attendre(p, 'galerie', ['pleine']);
    const deux = etat.envois.slice(n0);
    verdict('Réessayer → pleine, même fichier', reu.etat === 'pleine' && deux.length === 2 && deux[0].octets === deux[1].octets,
      `état « ${reu.etat} », ${deux.length} envoi(s), ${deux.map(x => Math.round(x.octets / 1024) + ' Ko').join(' / ')}`);
    const jp = lireJpeg(deux[1] && deux[1].image);
    verdict('PNG → JPEG ≤ 1600 px', jp.jpeg && Math.max(jp.largeur, jp.hauteur) <= 1600, `${jp.jpeg ? 'JPEG' : 'PAS un JPEG'} ${jp.largeur}×${jp.hauteur}`);

    /* 3. Haut de page : 2048 px */
    const nh = etat.envois.length;
    await choisir(p, '[data-case="hero"] [data-action="remplacer"]', FX('photo-24mpx.jpg'));
    for (let i = 0; i < 300 && etat.envois.length === nh; i++) await pause(50);
    await attendre(p, 'hero', ['pleine']);
    const eh = etat.envois[etat.envois.length - 1], jh = lireJpeg(eh && eh.image);
    verdict('haut de page : 2048 px, sans EXIF', jh.jpeg && Math.max(jh.largeur, jh.hauteur) === 2048 && !jh.exif && eh.target === 'slider',
      `${jh.largeur}×${jh.hauteur}, EXIF ${jh.exif ? 'PRÉSENT' : 'absent'}, cible « ${eh && eh.target} », ${Math.round((eh && eh.octets || 0) / 1024)} Ko envoyés`);

    /* 4. Photo tournée par EXIF : à l'endroit */
    const nt = etat.envois.length;
    await choisir(p, '[data-case="galerie"] [data-action="remplacer"]', FX('photo-tournee.jpg'));
    for (let i = 0; i < 300 && etat.envois.length === nt; i++) await pause(50);
    await attendre(p, 'galerie', ['pleine']);
    const et = etat.envois[etat.envois.length - 1], jt = lireJpeg(et && et.image);
    const px = await p.evaluate(async b64 => {
      const blob = await (await fetch('data:image/jpeg;base64,' + b64)).blob();
      const bm = await createImageBitmap(blob, { imageOrientation: 'none' });   // les PIXELS tels qu'envoyés
      const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
      const x = c.getContext('2d'); x.drawImage(bm, 0, 0);
      const lire = (u, v) => Array.from(x.getImageData(Math.round(u * bm.width), Math.round(v * bm.height), 1, 1).data.slice(0, 3));
      return { l: bm.width, h: bm.height, haut: lire(.5, .1), bas: lire(.5, .9), gauche: lire(.1, .5) };
    }, et.image.toString('base64'));
    const rouge = c => c[0] > 150 && c[2] < 100, bleu = c => c[2] > 150 && c[0] < 100;
    verdict('photo tournée (EXIF 6) à l’endroit', px.h > px.l && rouge(px.haut) && bleu(px.bas) && !jt.exif,
      `${px.l}×${px.h}, haut rgb(${px.haut}) ${rouge(px.haut) ? 'rouge' : '—'}, bas rgb(${px.bas}) ${bleu(px.bas) ? 'bleu' : '—'}, EXIF ${jt.exif ? 'PRÉSENT' : 'absent'}`);

    /* 5. Faux .jpg et HEIC : un message, rien d'envoyé */
    for (const [f, re, nom] of [['faux.jpg', /n’est pas une photo/, 'faux .jpg'], ['photo.heic', /HEIC/, 'HEIC']]){
      const n = etat.envois.length;
      await choisir(p, '[data-case="echecs"] [data-action="ajouter"]', FX(f));
      await pause(800);
      const c = await lireCase(p, 'echecs');
      verdict(`${nom} → son message, rien d’envoyé`, re.test(c.message) && etat.envois.length === n && c.etat === 'vide', `« ${c.message} » · état « ${c.etat} » · ${etat.envois.length - n} envoi(s)`);
    }

    /* 6. Retirer / Annuler, cibles */
    await p.click('[data-case="galerie"] [data-action="retirer"]');
    const ret = await lireCase(p, 'galerie');
    await p.click('[data-case="galerie"] [data-action="annuler"]');
    const ann = await lireCase(p, 'galerie');
    verdict('Retirer → barrée, Annuler → pleine', ret.etat === 'retiree' && ret.barre && ret.annuler && ann.etat === 'pleine' && !ann.barre,
      `retirée : ${ret.etat}, barre ${ret.barre ? 'oui' : 'NON'}, Annuler ${ret.annuler ? 'oui' : 'NON'} → ${ann.etat}`);
    const cibles = await p.evaluate(() => [...document.querySelectorAll('.cp [data-action]')].filter(e => e.getClientRects().length)
      .map(e => ({ a: e.dataset.action, h: e.getBoundingClientRect().height })));
    const petites = cibles.filter(c => c.h < 44);
    verdict('cibles ≥ 44 px', cibles.length > 0 && !petites.length, petites.length ? petites.map(c => `${c.a} ${c.h.toFixed(0)} px`).join(', ') : `${cibles.length} cibles, toutes ≥ 44 px`);
    await p.close();

    /* 7. Vignettes : CDN (w=240, w=480 en 2x), repli quand il est en panne, vraies couleurs, rayon 10 px */
    for (const [cdn, dpr] of [[false, 1], [true, 2]]){
      etat.cdn = cdn;
      const { p: q } = await page(390, dpr);
      await pause(400);
      const v = await q.evaluate(() => { const i = document.querySelector('[data-case="galerie"] .cp-img'), cadre = i.closest('.cp-cadre');
        const filtres = []; for (let e = i; e && !e.classList.contains('cp'); e = e.parentElement){ const s = getComputedStyle(e);
          if (s.filter !== 'none' || s.mixBlendMode !== 'normal' || +s.opacity < 1) filtres.push(e.className + ' ' + s.filter + ' ' + s.mixBlendMode + ' ' + s.opacity); }
        return { src: i.currentSrc, srcset: i.getAttribute('srcset') || '', charge: i.complete && i.naturalWidth > 0, filtres, rayon: getComputedStyle(cadre).borderRadius }; });
      if (!cdn) verdict('CDN en panne → image brute', v.charge && /\/assets\/photos\/piments\.webp$/.test(v.src) && !/netlify\/images/.test(v.src), `affichée : ${v.src.replace(/^https?:\/\/[^/]+/, '')}`);
      else verdict('CDN : w=240, w=480 en écran dense', v.charge && /\/\.netlify\/images\?url=.*w=480/.test(v.src) && /w=240/.test(v.srcset + ' ' + v.src),
        `affichée (2x) : ${v.src.replace(/^https?:\/\/[^/]+/, '')}`);
      if (cdn) verdict('vraies couleurs, rayon 10 px', !v.filtres.length && v.rayon === '10px', `${v.filtres.length ? 'FILTRES : ' + v.filtres.join(' ; ') : 'aucun filtre, aucune fusion, opacité 1'} · rayon ${v.rayon}`);
      await q.close();
    }
  } catch (e){ if (e.message !== 'stop') fails.push('exception : ' + e.message); }

  /* 8. Aucune donnée écrite */
  const apres = hashData();
  verdict('aucune donnée écrite', etat.saveData === 0 && avant === apres, `${etat.saveData} appel(s) à save-data · _data/ ${avant === apres ? 'identique à l’octet' : 'MODIFIÉ'}`);
  await b.close(); serveur.close();
  console.log('\n═══ LE COMPOSANT PHOTO ═══\n\n| Contrôle | Mesuré | |\n|---|---|---|\n' + lignes.join('\n'));
  if (fails.length){ console.log('\n❌ ' + fails.length + ' échec(s) :\n  - ' + fails.join('\n  - ')); process.exit(1); }
  console.log('\n✅ PHOTO — la progression est réelle, l’échec se rattrape, le fichier envoyé est réduit et sans EXIF, à l’endroit, la vignette vient du CDN avec son repli, rien n’est écrit.');
})();
