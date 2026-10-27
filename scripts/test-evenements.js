#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LA FEUILLE DES ÉVÉNEMENTS (bout 7b, LELAB-DESIGN §4)
   ═══════════════════════════════════════════════════════════════════════════
   Des GESTES DE CLIENT. events.json servi est une COPIE FIGÉE (scripts/fixtures/evenements-source.json,
   copiée de _data le 27/10) ; save-data est INTERCEPTÉ. L'HORLOGE DE LA PAGE EST FIGÉE au jeudi 1er octobre
   2026, 10 h : sans ça, la sonde dépendrait du jour où on la lance (au 27/10, les trois événements de la
   copie sont passés). « Vendredi prochain » = le 2 octobre.

   1. Le JSON envoyé est EXACTEMENT scripts/fixtures/evenements-attendu.json, écrit À LA MAIN, après :
      avancer « la saison des coquillages » au 2 octobre (elle remonte en tête d'« À venir »), raccourcir la
      précision du concert, « Tout retirer » dans « Passés », ajouter « soirée jazz » à 21:00 (date par défaut
      : vendredi prochain). Les autres clés (photo) sont restituées ; le nouvel événement n'a pas de photo.
   2. « À venir » est triée par date ; « Passés » est REPLIÉE et compte ses événements.
   3. Un événement sans titre (ou sans date) ne part pas : la ligne le dit, le bouton compte, rien n'est envoyé.
   4. La date se lit en toutes lettres, en serif, hors de la ligne active ; sur la ligne active d'un événement
      sans photo, le composant photo vide (« + Ajouter une photo », 7c-3).
   5. La tuile dit « Rien à venir » dès la publication qui retire tout ce qui était à venir.
   6. ALLER-RETOUR : publier sans rien changer réécrit le fichier à l'octet.
   7. Quitter avec des changements déclenche la garde (#quitConfirm).
   8. LES PHOTOS (7c-3), sur la copie scripts/fixtures/evenements-photos-source.json (une photo Blobs publiée
      sur « les vins de Cassis » et sur le concert, une photo du dépôt sur les coquillages) : remplacer celle
      du concert, retirer celle des coquillages, « Tout retirer » les passés, ajouter « soirée jazz » avec une
      photo puis la remplacer. Le JSON envoyé est EXACTEMENT scripts/fixtures/evenements-photos-attendu.json.
      upload-image est intercepté, les suppressions Blobs ESPIONNÉES : la photo de la séance remplacée part
      tout de suite ; vins.jpg et concert.jpg (publiées) seulement après « C'est en ligne » ; galerie3.jpeg
      (dépôt) jamais. Rien n'est écrit avant Publier ; l'aller-retour de cette copie est à l'octet ; cibles ≥
      44 px ; le bouton ne saute pas quand on retire une photo.

   ⚠️ ROUGE sur le code d'avant le bout 7b (ancien formulaire de liste : pas de feuille).
   USAGE :  node <serveur statique> . 8080   puis   node scripts/test-evenements.js 8080
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs'), path = require('path');
const PORT   = process.argv[2] || '8080';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE   = `http://localhost:${PORT}/admin/`;
const SOURCE = fs.readFileSync(path.join(__dirname, 'fixtures', 'evenements-source.json'), 'utf8');
const ATTENDU = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'evenements-attendu.json'), 'utf8'));
const SOURCE_PH  = fs.readFileSync(path.join(__dirname, 'fixtures', 'evenements-photos-source.json'), 'utf8');
const ATTENDU_PH = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'evenements-photos-attendu.json'), 'utf8'));
const FX = n => path.join(__dirname, 'fixtures', 'photos', n);
if (!['photo-tournee.jpg', 'photo.png'].every(n => fs.existsSync(FX(n)))){   // photos de test : ignorées par git
  console.log('Photos de test manquantes → génération par scripts/gen-photos-test.py…');
  require('child_process').execFileSync('python3', [path.join(__dirname, 'gen-photos-test.py')], { stdio: 'inherit' });
}
const pause = ms => new Promise(r => setTimeout(r, ms));
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch (e){ console.error('puppeteer-core manquant → npm install'); process.exit(2); }

const fails = [], lignes = [];
const verdict = (nom, ok, detail) => { lignes.push(`| ${nom} | ${detail} | ${ok ? '✅' : '❌'} |`); if (!ok) fails.push(`${nom} : ${detail}`); };
let b;
async function page(largeur = 390, source = SOURCE){
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: largeur, height: 900, isMobile: largeur < 900 });
  await p.evaluateOnNewDocument(() => { window.__LELAB_TEMPS = 0.02; });   // Publier : la confirmation en ~0,2 s
  /* L'horloge figée : new Date() et Date.now() rendent le 1er octobre 2026, 10 h (heure locale). */
  await p.evaluateOnNewDocument(() => {
    const FIGE = new Date(2026, 9, 1, 10, 0, 0).getTime(), D = Date;
    class DateFigee extends D { constructor(...a){ super(...(a.length ? a : [FIGE])); } static now(){ return FIGE; } }
    window.Date = DateFigee;
  });
  const envois = [];
  /* Le fichier public : la copie, puis, deux relectures après un save-data, ce qui a été envoyé (« en ligne »).
     upload-image : envoi → clé photos/evenements/sonde-N.jpg ; { action:'delete' } → espionné. */
  const espion = { public: source, apres: null, relectures: 0, n: 0, suppressions: [], journal: [], echec: false };
  await p.setRequestInterception(true);
  p.on('request', r => {
    const u = r.url();
    if (/\/_data\/events\.json(\?.*)?$/.test(u)){
      if (espion.apres && ++espion.relectures >= 3){ espion.public = espion.apres; espion.apres = null; espion.journal.push({ t: Date.now(), quoi: 'en ligne' }); }
      return r.respond({ status: 200, contentType: 'application/json', body: espion.public });
    }
    if (u.includes('/.netlify/functions/save-data')){ const j = JSON.parse(r.postData() || '{}'); envois.push(j);
      if (j.section === 'events'){ espion.apres = JSON.stringify(j.data, null, 2) + '\n'; espion.relectures = 0; }
      return r.respond({ status: 200, contentType: 'application/json', body: '{"success":true}' }); }
    if (u.includes('/.netlify/functions/upload-image')){ const j = JSON.parse(r.postData() || '{}');
      if (j.action === 'delete'){ espion.suppressions.push(j.key); espion.journal.push({ t: Date.now(), quoi: 'delete ' + j.key }); return r.respond({ status: 200, contentType: 'application/json', body: '{"success":true}' }); }
      if (espion.echec) return r.respond({ status: 500, contentType: 'application/json', body: '{"error":"sonde : 500"}' });
      const cle = `photos/${j.target}/sonde-${++espion.n}.jpg`;
      return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, url: '/.netlify/functions/serve-image?key=' + encodeURIComponent(cle), key: cle }) }); }
    if (u.includes('/.netlify/functions/serve-image') || u.includes('/.netlify/images'))
      return r.respond({ status: 200, contentType: 'image/png', body: fs.readFileSync(FX('photo-tournee.jpg')) });
    r.continue();
  });
  return { ctx, p, envois, espion };
}
async function ouvrir(p){
  await p.goto(BASE + '#edit/events', { waitUntil: 'networkidle0' });
  const ok = await p.waitForSelector('#feuille .f-cat[data-partie="avenir"]', { timeout: 8000 }).then(() => true).catch(() => false);
  await p.evaluate(() => { session = { access_token: 'sonde', refresh_token: 'sonde', expires_at: Date.now() + 3600e3 }; });
  return ok;
}
/* Un vrai clic sur un élément amené au centre (le bouton Publier, collé en bas, recouvrirait la ligne). */
const clic = async (p, sel, opts) => { await p.$eval(sel, el => el.scrollIntoView({ block: 'center' })); await p.click(sel, opts); };
const ligneDe = titre => `xpath/.//li[contains(@class,"f-ev")][.//input[@data-champ="titre" and @value="${titre}"]]`;
const idDe = (p, titre) => p.evaluate(t => { const i = [...document.querySelectorAll('.f-ev input[data-champ="titre"]')].find(x => x.value === t); return i ? i.closest('.f-ev').dataset.id : null; }, titre);
/* 7a-bis : le cadre. Le surtitre nomme la section comme le client (jamais la clé d'édition), pas de légende
   « Ce que vos clients liront. » sous cette feuille, et « Annuler mes changements » absent tant que rien n'a changé. */
const cadre = p => p.evaluate(() => ({ sur: document.querySelector('.f-sur').textContent, note: !!document.querySelector('.f-note'),
  annuler: (b => b ? b.getClientRects().length > 0 : null)(document.getElementById('feuilleAnnuler')) }));
/* 7a-ter : le bouton Publier ne bouge pas au premier changement. Sous lui, UNE ligne à la hauteur du texte : la
   phrase d'aide au repos, « 1 changement · Annuler » dès un changement, jamais les deux. À 390, le pied collant
   garde la hauteur de HEAD (12 + 8 + 12 autour du bouton et de la phrase). « Annuler » se touche sur 44 px de
   haut : elementFromPoint à ±20 px de son centre tombe sur lui. Mesuré page en haut. */
async function sansSaut(nom, p, geste){
  const lire = () => p.evaluate(() => { window.scrollTo(0, 0);
    const vu = e => !!e && e.getClientRects().length > 0 && e.getBoundingClientRect().height > 0;
    const pub = document.querySelector('.f-pub'), b = document.getElementById('btnFeuille'), ph = document.getElementById('feuillePhrase'), a = document.getElementById('feuilleAnnuler');
    const sous = document.querySelector('.f-sous-bouton') || ph.parentElement;
    let zone = null;
    if (vu(a)){ const r = a.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const touche = dy => { const el = document.elementFromPoint(x, y + dy); return !!el && (el === a || a.contains(el)); };
      zone = { haut: touche(-20), bas: touche(20), centre: touche(0) }; }
    return { haut: b.getBoundingClientRect().top, phrase: vu(ph), annuler: vu(a), pied: pub.getBoundingClientRect().height,
      btnH: b.getBoundingClientRect().height, ligneH: sous.getBoundingClientRect().height, texteH: vu(ph) ? ph.getBoundingClientRect().height : null,
      compte: (document.getElementById('feuilleCompte') || {}).textContent || '', zone, large: innerWidth }; });
  const avant = await lire(); await geste(); await pause(120); const apres = await lire();
  const ecart = Math.round((apres.haut - avant.haut) * 100) / 100;
  verdict(`${nom} · Publier ne bouge pas`, ecart === 0, `haut ${avant.haut.toFixed(1)} → ${apres.haut.toFixed(1)} px (écart ${ecart} px)`);
  verdict(`${nom} · la phrase OU « 1 changement · Annuler »`, avant.phrase && !avant.annuler && !apres.phrase && apres.annuler && apres.compte === '1 changement · ',
    `repos : ${[avant.phrase && 'phrase', avant.annuler && 'Annuler'].filter(Boolean).join(' + ') || '—'} · après : ${[apres.phrase && 'phrase', apres.annuler && '« ' + apres.compte + 'Annuler »'].filter(Boolean).join(' + ') || '—'}`);
  verdict(`${nom} · ligne à la hauteur du texte`, avant.texteH != null && Math.abs(avant.ligneH - avant.texteH) < 0.5 && Math.abs(apres.ligneH - avant.texteH) < 0.5,
    `ligne ${avant.ligneH.toFixed(1)} → ${apres.ligneH.toFixed(1)} px, texte ${avant.texteH == null ? '—' : avant.texteH.toFixed(1)} px`);
  const z = apres.zone;
  verdict(`${nom} · « Annuler » touchable sur 44 px`, !!z && z.haut && z.centre && z.bas, z ? `±20 px : dessus ${z.haut ? 'oui' : 'NON'}, centre ${z.centre ? 'oui' : 'NON'}, dessous ${z.bas ? 'oui' : 'NON'}` : 'lien invisible');
  if (avant.large < 900){
    const attendu = avant.btnH + avant.texteH + 32;   // HEAD : 12 (haut) + 8 (écart) + 12 (bas) autour du bouton et de la phrase
    verdict(`${nom} · pied collant = HEAD`, Math.abs(avant.pied - attendu) < 0.5, `${avant.pied.toFixed(2)} px (HEAD : ${avant.btnH.toFixed(0)} + ${avant.texteH.toFixed(2)} + 32 = ${attendu.toFixed(2)} px)`);
  }
}
const etat = p => p.evaluate(() => ({ btn: document.getElementById('btnFeuille').textContent.trim(), actif: !document.getElementById('btnFeuille').disabled,
  phrase: document.getElementById('feuillePhrase').textContent, chip: document.getElementById('feuilleEtat').textContent }));
const avenir = p => p.$$eval('.f-cat[data-partie="avenir"] .f-ev', ls => ls.map(l => (l.querySelector('[data-champ="titre"]') || {}).value || l.textContent.trim()));

async function gestes(){
  const { ctx, p, envois } = await page();
  if (!await ouvrir(p)){ verdict('feuille ouverte', false, 'pas de feuille « À venir » — l’éditeur n’est pas une feuille'); return ctx.close(); }
  /* 7a-bis : cadre au repos */
  const c0 = await cadre(p);
  verdict('surtitre', /^04 · Événements · /.test(c0.sur), `« ${c0.sur} »`);
  verdict('pas de légende sous la feuille', !c0.note, c0.note ? '« Ce que vos clients liront. » PRÉSENTE' : 'absente');
  verdict('« Annuler » absent au repos', c0.annuler === false, c0.annuler ? 'VISIBLE sans changement' : 'absent');
  /* 2. Tri et repli */
  const a0 = await avenir(p);
  const passes = await p.evaluate(() => { const d = document.querySelector('.f-passes'); return d ? { ouvert: d.open, n: d.querySelector('.f-passes-n').textContent, lignes: d.querySelectorAll('.f-ev').length } : null; });
  verdict('à venir, triée par date', a0.join(' / ') === 'concert — le trio de la Plaine / la saison des coquillages', a0.join(' / '));
  verdict('passés, repliée', !!passes && !passes.ouvert && passes.n === '1', passes ? `${passes.ouvert ? 'OUVERTE' : 'repliée'}, ${passes.n} événement` : 'absente');
  /* 4. La date en toutes lettres, en serif */
  const q = await p.$eval('.f-cat[data-partie="avenir"] .f-ev .f-quand', el => ({ t: el.textContent, f: getComputedStyle(el).fontFamily, vu: getComputedStyle(el).display !== 'none' }));
  verdict('date en toutes lettres, en serif', q.vu && /^samedi 3 octobre, 20:00$/i.test(q.t) && /Instrument Serif/.test(q.f), `« ${q.t} » · ${q.f.split(',')[0]}`);
  /* 1. Les gestes : les coquillages au 2 octobre */
  const idCoq = await idDe(p, 'la saison des coquillages');
  await clic(p, `.f-ev[data-id="${idCoq}"] .f-quand`);
  await p.keyboard.press('Escape');                                  // le calendrier natif s'ouvre : on le ferme et on tape
  await p.keyboard.type('02102026');
  await clic(p, `.f-ev[data-id="${idCoq}"] [data-champ="titre"]`);   // on quitte le champ date
  await p.keyboard.press('Tab'); await pause(100);                   // … puis la ligne : elle se re-range
  await clic(p, '#feuille .f-cat-titre'); await pause(100);
  const a1 = await avenir(p);
  verdict('une date changée se re-range', a1[0] === 'la saison des coquillages', a1.join(' / '));
  /* la précision du concert */
  const idCon = await idDe(p, 'concert — le trio de la Plaine');
  await clic(p, `.f-ev[data-id="${idCon}"] [data-champ="titre"]`);
  await clic(p, `.f-ev[data-id="${idCon}"] [data-champ="description"]`, { clickCount: 3 });
  await p.keyboard.down('Meta'); await p.keyboard.press('KeyA'); await p.keyboard.up('Meta');
  await p.keyboard.type('Guitare, contrebasse et une voix.');
  const c1 = await cadre(p);
  verdict('« Annuler » dès un changement', c1.annuler === true, c1.annuler ? 'visible' : 'ABSENT');
  /* Passés : on déplie, « Tout retirer » */
  await clic(p, '.f-passes-titre'); await pause(80);
  await clic(p, '.f-tout-retirer'); await pause(80);
  const retire = await p.$$eval('.f-passes .f-ev', ls => ls.map(l => l.classList.contains('f-ligne--retiree')));
  verdict('« Tout retirer »', retire.length === 1 && retire.every(Boolean), `${retire.filter(Boolean).length}/${retire.length} retiré(s), annulable`);
  /* Ajouter : vendredi prochain par défaut */
  await clic(p, '.f-ajouter');
  const neuf = await p.evaluate(() => { const li = document.activeElement.closest('.f-ev'); const a = li && li.querySelector('.f-ev-photo [data-action="ajouter"]');
    return li ? { id: li.dataset.id, date: li.querySelector('.f-date').value, photo: a ? a.textContent : '', photoVue: !!a && a.getClientRects().length > 0 } : null; });
  verdict('nouvel événement : vendredi prochain', !!neuf && neuf.date === '2026-10-02', neuf ? neuf.date : 'aucune ligne active');
  verdict('la ligne active propose une photo', !!neuf && neuf.photoVue && neuf.photo === '+ Ajouter une photo', neuf ? `« ${neuf.photo} »${neuf.photoVue ? '' : ' (MASQUÉ)'}` : '—');
  /* 3. Sans titre : bloqué */
  const bloque = await etat(p);
  await p.evaluate(() => saveSection()); await pause(150);
  const msg = await p.$eval(`.f-ev[data-id="${neuf.id}"] .f-manque`, el => el.textContent);
  verdict('sans titre, rien ne part', !bloque.actif && /1 événement à compléter/.test(bloque.btn) && msg === 'Il manque le titre' && envois.length === 0,
    `« ${msg} » · bouton « ${bloque.btn} » · ${envois.length} envoi(s)`);
  await clic(p, `.f-ev[data-id="${neuf.id}"] [data-champ="titre"]`);   // la ligne s'est redessinée pour dire ce qui manque
  await p.keyboard.type('soirée jazz');
  await clic(p, `.f-ev[data-id="${neuf.id}"] [data-champ="titre"]`);
  await clic(p, `.f-ev[data-id="${neuf.id}"] .f-heure`);
  await p.keyboard.type('2100');
  const avant = await etat(p);
  verdict('le bouton compte', avant.btn === 'Publier' && avant.actif && /^4 changements/.test(avant.phrase), `« ${avant.btn} » · « ${avant.phrase} »`);
  /* 7. La garde */
  await clic(p, '.f-retour'); await pause(400);
  const garde = await p.evaluate(() => ({ q: getComputedStyle(document.getElementById('quitConfirm')).display, ecran: document.getElementById('screen-edit').classList.contains('active') }));
  verdict('quitter avec des changements', garde.q === 'flex' && garde.ecran, `#quitConfirm ${garde.q}, feuille ${garde.ecran ? 'toujours là' : 'QUITTÉE'}`);
  await p.evaluate(() => { const q = document.getElementById('quitConfirm'); if (q) q.style.display = 'none'; });
  await clic(p, '#btnFeuille'); await pause(400);
  const e = envois[0];
  const exact = !!e && e.section === 'events' && JSON.stringify(e.data) === JSON.stringify(ATTENDU);
  verdict('JSON envoyé == evenements-attendu.json', exact, e ? (exact ? 'identique, clé par clé et dans l’ordre (photo restituée)' : 'DIFFÉRENT :\n' + JSON.stringify(e.data, null, 1)) : 'RIEN n’a été envoyé');
  await ctx.close();
}

/* 5. La tuile : on retire tout ce qui est à venir, on publie, on revient sur Mon site. */
async function tuile(){
  const { ctx, p } = await page();
  if (!await ouvrir(p)){ verdict('tuile « Rien à venir »', false, 'pas de feuille'); return ctx.close(); }
  const lire = () => p.evaluate(() => { const t = document.querySelector('#siteGrid .tuile[data-bloc="events"] .t-signe'); return t ? t.textContent.trim() : '(pas de tuile)'; });
  const avant = await lire();
  for (const id of await p.$$eval('.f-cat[data-partie="avenir"] .f-ev', ls => ls.map(l => l.dataset.id))){
    await clic(p, `.f-ev[data-id="${id}"] [data-champ="titre"]`); await clic(p, `.f-ev[data-id="${id}"] .f-retirer`);
  }
  await clic(p, '#btnFeuille'); await pause(500);
  const apres = await lire();
  await clic(p, '.f-retour'); await pause(400);
  const vu = await lire();
  verdict('tuile « Rien à venir » dès la publication', /3 oct/.test(avant) && apres === 'Rien à venir' && vu === 'Rien à venir', `avant « ${avant} » → après l’envoi « ${apres} » → sur Mon site « ${vu} »`);
  await ctx.close();
}

/* 6. Aller-retour */
async function allerRetour(){
  const { ctx, p, envois } = await page();
  if (!await ouvrir(p)){ verdict('aller-retour à l’octet', false, 'pas de feuille'); return ctx.close(); }
  await p.evaluate(() => saveSection()); await pause(400);
  const e = envois[0], ecrit = e && JSON.stringify(e.data, null, 2) + '\n';
  verdict('aller-retour à l’octet', ecrit === SOURCE, e ? (ecrit === SOURCE ? `${SOURCE.length} octets identiques (JSON.stringify + '\\n', comme save-data)` : 'DIFFÉRENT') : 'rien envoyé');
  await ctx.close();
}

/* 8. Les photos des événements (7c-3) */
async function photos(){
  const { ctx, p, envois, espion } = await page(390, SOURCE_PH);
  if (!await ouvrir(p)){ verdict('photos · feuille ouverte', false, 'pas de feuille'); return ctx.close(); }
  const choisir = async (sel, fichier) => { await p.$eval(sel, el => el.scrollIntoView({ block: 'center' }));
    const [ch] = await Promise.all([p.waitForFileChooser({ timeout: 4000 }), p.click(sel)]); await ch.accept([fichier]); };
  const attendre = async n => { for (let i = 0; i < 200 && espion.n < n; i++) await pause(40); await pause(250); };
  const activer = async id => { await clic(p, `.f-ev[data-id="${id}"] [data-champ="titre"]`); };
  /* Au repos : la vignette seule (le concert a une photo), rien sur une ligne sans photo. */
  const idCon = await idDe(p, 'concert — le trio de la Plaine'), idCoq = await idDe(p, 'la saison des coquillages');
  const repos = await p.evaluate(id => { const li = document.querySelector(`.f-ev[data-id="${id}"]`); const vu = e => !!e && e.getClientRects().length > 0;
    return { cadre: vu(li.querySelector('.cp-cadre')), actions: vu(li.querySelector('.cp-actions')) }; }, idCon);
  verdict('photos · au repos : la vignette seule', repos.cadre && !repos.actions, `vignette ${repos.cadre ? 'visible' : 'ABSENTE'}, actions ${repos.actions ? 'VISIBLES' : 'masquées'}`);
  /* Remplacer la photo du concert ; retirer celle des coquillages (fichier du dépôt) */
  await activer(idCon); await choisir(`.f-ev[data-id="${idCon}"] [data-action="remplacer"]`, FX('photo.png')); await attendre(1);
  await activer(idCoq); await clic(p, `.f-ev[data-id="${idCoq}"] [data-action="retirer"]`);
  /* Tout retirer les passés (les vins de Cassis, photo Blobs publiée) */
  await clic(p, '.f-passes-titre'); await pause(80); await clic(p, '.f-tout-retirer'); await pause(80);
  /* Un nouvel événement : titre, une photo, puis une autre (la première, de la séance, part tout de suite) */
  await clic(p, '.f-ajouter'); await p.keyboard.type('soirée jazz');
  const idJazz = await idDe(p, 'soirée jazz');
  await choisir(`.f-ev[data-id="${idJazz}"] [data-action="ajouter"]`, FX('photo-tournee.jpg')); await attendre(2);
  await activer(idJazz); await choisir(`.f-ev[data-id="${idJazz}"] [data-action="remplacer"]`, FX('photo.png')); await attendre(3);
  await activer(idJazz);
  const cibles = await p.evaluate(() => [...document.querySelectorAll('#feuille .f-ev [data-action]')].filter(e => e.getClientRects().length)
    .map(e => ({ a: e.dataset.action, h: e.getBoundingClientRect().height })));
  const petites = cibles.filter(c => c.h < 44);
  verdict('photos · cibles ≥ 44 px', cibles.length > 0 && !petites.length, petites.length ? petites.map(c => `${c.a} ${c.h.toFixed(0)} px`).join(', ') : `${cibles.length} cibles, toutes ≥ 44 px`);
  verdict('photos · zéro écriture avant Publier', envois.length === 0, `${envois.length} appel(s) à save-data`);
  verdict('photos · photo de la séance remplacée : supprimée tout de suite', espion.suppressions.join() === 'photos/evenements/sonde-2.jpg', `suppressions : ${espion.suppressions.join(', ') || 'aucune'}`);
  const n0 = espion.suppressions.length;
  const bt = await p.evaluate(() => ({ t: document.getElementById('btnFeuille').textContent, d: document.getElementById('btnFeuille').disabled }));
  verdict('photos · Publier disponible', !bt.d, `« ${bt.t} »`);
  await clic(p, '#btnFeuille');
  for (let i = 0; i < 100 && !envois.length; i++) await pause(40);
  const e = envois[0], exact = !!e && JSON.stringify(e.data) === JSON.stringify(ATTENDU_PH);
  verdict('photos · JSON envoyé == evenements-photos-attendu.json', exact, e ? (exact ? 'identique, clé par clé et dans l’ordre' : 'DIFFÉRENT :\n' + JSON.stringify(e.data, null, 1)) : 'RIEN n’a été envoyé');
  await pause(60);
  const avantPreuve = espion.suppressions.slice(n0);
  for (let i = 0; i < 100 && !espion.journal.some(j => j.quoi === 'en ligne'); i++) await pause(40);
  await pause(500);
  const tEn = (espion.journal.find(j => j.quoi === 'en ligne') || {}).t;
  const apres = espion.journal.filter(j => /^delete /.test(j.quoi) && j.t >= tEn).map(j => j.quoi.slice(7)).sort();
  verdict('photos · publiées remplacées ou retirées : supprimées à « C’est en ligne »', !avantPreuve.length && apres.join() === 'photos/evenements/concert.jpg,photos/evenements/vins.jpg',
    `avant la preuve : ${avantPreuve.join(', ') || 'aucune'} · après : ${apres.join(', ') || 'aucune'}`);
  verdict('photos · aucun fichier du dépôt supprimé', espion.suppressions.every(k => /^photos\//.test(k)), `suppressions : ${espion.suppressions.join(', ')}`);
  await ctx.close();
  /* Une photo en échec : le bouton le dit, et rien ne part */
  { const { ctx: c, p: q, envois: ev, espion: es } = await page(390, SOURCE_PH); await ouvrir(q);
    es.echec = true;
    const id = await idDe(q, 'concert — le trio de la Plaine');
    await clic(q, `.f-ev[data-id="${id}"] [data-champ="titre"]`);
    await q.$eval(`.f-ev[data-id="${id}"] [data-action="remplacer"]`, el => el.scrollIntoView({ block: 'center' }));
    const [ch] = await Promise.all([q.waitForFileChooser({ timeout: 4000 }), q.click(`.f-ev[data-id="${id}"] [data-action="remplacer"]`)]); await ch.accept([FX('photo.png')]);
    for (let i = 0; i < 100 && !(await q.evaluate(i => (document.querySelector(`.f-ev[data-id="${i}"] .cp`) || {}).dataset.etat === 'echec', id)); i++) await pause(40);
    const bt = await q.evaluate(() => ({ t: document.getElementById('btnFeuille').textContent, d: document.getElementById('btnFeuille').disabled }));
    await q.evaluate(() => saveSection()); await pause(200);
    verdict('photos · « Une photo pas encore partie »', bt.t === 'Une photo pas encore partie' && bt.d && ev.length === 0, `« ${bt.t} » ${bt.d ? 'non cliquable' : 'CLIQUABLE'} · ${ev.length} envoi(s)`);
    await c.close(); }
  /* Aller-retour de la copie aux photos ; le bouton ne saute pas quand on retire une photo */
  { const { ctx: c, p: q, envois: ev } = await page(390, SOURCE_PH); await ouvrir(q);
    await q.evaluate(() => saveSection()); await pause(300);
    const ecrit = ev[0] && JSON.stringify(ev[0].data, null, 2) + '\n';
    verdict('photos · aller-retour à l’octet', ecrit === SOURCE_PH, ev[0] ? (ecrit === SOURCE_PH ? `${SOURCE_PH.length} octets identiques` : 'DIFFÉRENT') : 'rien envoyé');
    await c.close(); }
  for (const L of [390, 1280]){
    const { ctx: c, p: q } = await page(L, SOURCE_PH); await ouvrir(q);
    const id = await idDe(q, 'la saison des coquillages');
    await clic(q, `.f-ev[data-id="${id}"] [data-champ="titre"]`);
    await sansSaut(`photos ${L}`, q, () => clic(q, `.f-ev[data-id="${id}"] [data-action="retirer"]`));
    await c.close();
  }
}

(async () => {
  b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=fr-FR'] });
  const sauts = [390, 1280].map(L => async () => { const { ctx, p } = await page(L); await ouvrir(p);
    const id = await idDe(p, 'concert — le trio de la Plaine');
    await sansSaut(`événements ${L}`, p, async () => { await clic(p, `.f-ev[data-id="${id}"] [data-champ="titre"]`); await p.keyboard.press('End'); await p.keyboard.type('!'); });
    await ctx.close(); });
  for (const f of [gestes, tuile, allerRetour, ...sauts, photos]) await f().catch(e => fails.push('exception : ' + e.message));
  await b.close();
  console.log('\n═══ LA FEUILLE DES ÉVÉNEMENTS ═══\n\n| Contrôle | Mesuré | |\n|---|---|---|\n' + lignes.join('\n'));
  if (fails.length){ console.log('\n❌ ' + fails.length + ' échec(s) :\n  - ' + fails.join('\n  - ')); process.exit(1); }
  console.log('\n✅ ÉVÉNEMENTS — le JSON envoyé est celui écrit à la main, l’aller-retour est à l’octet, rien d’incomplet ne part, la tuile suit.');
})();
