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
   4. La date se lit en toutes lettres, en serif, hors de la ligne active ; « Photo : bientôt ici » sur la
      ligne active d'un événement sans photo.
   5. La tuile dit « Rien à venir » dès la publication qui retire tout ce qui était à venir.
   6. ALLER-RETOUR : publier sans rien changer réécrit le fichier à l'octet.
   7. Quitter avec des changements déclenche la garde (#quitConfirm).

   ⚠️ ROUGE sur le code d'avant le bout 7b (ancien formulaire de liste : pas de feuille).
   USAGE :  node <serveur statique> . 8080   puis   node scripts/test-evenements.js 8080
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs'), path = require('path');
const PORT   = process.argv[2] || '8080';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE   = `http://localhost:${PORT}/admin/`;
const SOURCE = fs.readFileSync(path.join(__dirname, 'fixtures', 'evenements-source.json'), 'utf8');
const ATTENDU = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'evenements-attendu.json'), 'utf8'));
const pause = ms => new Promise(r => setTimeout(r, ms));
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch (e){ console.error('puppeteer-core manquant → npm install'); process.exit(2); }

const fails = [], lignes = [];
const verdict = (nom, ok, detail) => { lignes.push(`| ${nom} | ${detail} | ${ok ? '✅' : '❌'} |`); if (!ok) fails.push(`${nom} : ${detail}`); };
let b;
async function page(){
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 390, height: 900, isMobile: true });
  /* L'horloge figée : new Date() et Date.now() rendent le 1er octobre 2026, 10 h (heure locale). */
  await p.evaluateOnNewDocument(() => {
    const FIGE = new Date(2026, 9, 1, 10, 0, 0).getTime(), D = Date;
    class DateFigee extends D { constructor(...a){ super(...(a.length ? a : [FIGE])); } static now(){ return FIGE; } }
    window.Date = DateFigee;
  });
  const envois = [];
  await p.setRequestInterception(true);
  p.on('request', r => {
    const u = r.url();
    if (/\/_data\/events\.json(\?.*)?$/.test(u)) return r.respond({ status: 200, contentType: 'application/json', body: SOURCE });
    if (u.includes('/.netlify/functions/save-data')){ envois.push(JSON.parse(r.postData() || '{}')); return r.respond({ status: 200, contentType: 'application/json', body: '{"success":true}' }); }
    r.continue();
  });
  return { ctx, p, envois };
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
const etat = p => p.evaluate(() => ({ btn: document.getElementById('btnFeuille').textContent.trim(), actif: !document.getElementById('btnFeuille').disabled,
  phrase: document.getElementById('feuillePhrase').textContent, chip: document.getElementById('feuilleEtat').textContent }));
const avenir = p => p.$$eval('.f-cat[data-partie="avenir"] .f-ev', ls => ls.map(l => (l.querySelector('[data-champ="titre"]') || {}).value || l.textContent.trim()));

async function gestes(){
  const { ctx, p, envois } = await page();
  if (!await ouvrir(p)){ verdict('feuille ouverte', false, 'pas de feuille « À venir » — l’éditeur n’est pas une feuille'); return ctx.close(); }
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
  /* Passés : on déplie, « Tout retirer » */
  await clic(p, '.f-passes-titre'); await pause(80);
  await clic(p, '.f-tout-retirer'); await pause(80);
  const retire = await p.$$eval('.f-passes .f-ev', ls => ls.map(l => l.classList.contains('f-ligne--retiree')));
  verdict('« Tout retirer »', retire.length === 1 && retire.every(Boolean), `${retire.filter(Boolean).length}/${retire.length} retiré(s), annulable`);
  /* Ajouter : vendredi prochain par défaut */
  await clic(p, '.f-ajouter');
  const neuf = await p.evaluate(() => { const li = document.activeElement.closest('.f-ev'); return li ? { id: li.dataset.id, date: li.querySelector('.f-date').value, photo: (li.querySelector('.f-ev-photo') || {}).textContent,
    photoVue: !!li.querySelector('.f-ev-photo') && getComputedStyle(li.querySelector('.f-ev-photo')).display !== 'none' } : null; });
  verdict('nouvel événement : vendredi prochain', !!neuf && neuf.date === '2026-10-02', neuf ? neuf.date : 'aucune ligne active');
  verdict('« Photo : bientôt ici » sur la ligne', !!neuf && neuf.photoVue && neuf.photo === 'Photo : bientôt ici', neuf ? `« ${neuf.photo} »${neuf.photoVue ? '' : ' (MASQUÉ)'}` : '—');
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

(async () => {
  b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=fr-FR'] });
  for (const f of [gestes, tuile, allerRetour]) await f().catch(e => fails.push('exception : ' + e.message));
  await b.close();
  console.log('\n═══ LA FEUILLE DES ÉVÉNEMENTS ═══\n\n| Contrôle | Mesuré | |\n|---|---|---|\n' + lignes.join('\n'));
  if (fails.length){ console.log('\n❌ ' + fails.length + ' échec(s) :\n  - ' + fails.join('\n  - ')); process.exit(1); }
  console.log('\n✅ ÉVÉNEMENTS — le JSON envoyé est celui écrit à la main, l’aller-retour est à l’octet, rien d’incomplet ne part, la tuile suit.');
})();
