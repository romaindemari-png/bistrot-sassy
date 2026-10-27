#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LES FEUILLES DES INFOS — horaires et contact (bout 7a, LELAB-DESIGN §4)
   ═══════════════════════════════════════════════════════════════════════════
   Des GESTES DE CLIENT : clics, frappe, interrupteurs. Les fichiers servis sont des COPIES FIGÉES
   (scripts/fixtures/infos-horaires.json, infos-general.json, copiées de _data le 27/10), interceptées à la
   place de _data/horaires.json et _data/general.json ; save-data est INTERCEPTÉ, rien n'est écrit.

   HORAIRES
   1. Le JSON envoyé est EXACTEMENT scripts/fixtures/horaires-attendu.json, écrit À LA MAIN, après : changer
      les heures du mardi, rouvrir le samedi (fermé, sans heures) et lui en donner, fermer le dimanche (ses
      heures restent dans le fichier), fermer puis rouvrir le lundi (aucun changement), compléter la note.
   2. Un jour ouvert sans heures BLOQUE : « Il manque les heures », le bouton compte les jours, rien ne part.
   3. Fermer un jour MASQUE ses heures sans les effacer ; le jour même porte le point (un seul).
   CONTACT
   4. Le JSON envoyé est EXACTEMENT scripts/fixtures/general-attendu.json : numéro étranger, e-mail sans @
      puis corrigé, Instagram en « @compte » puis en URL ; maps_url (non affiché) restitué.
   5. On AVERTIT sans bloquer : 9 chiffres, un numéro étranger, un e-mail sans @, un réseau sans https://
      → message --violet-encre sur la ligne, et le bouton reste « Publier ».
   6. inputmode : tel pour le téléphone, email pour l'e-mail ; champs ≥ 16 px, cibles ≥ 44 px.
   LES DEUX
   7. ALLER-RETOUR : publier sans rien changer réécrit le fichier À L'OCTET (JSON.stringify(…, null, 2) + '\n',
      ce qu'écrit save-data).
   8. Quitter avec des changements déclenche la garde (#quitConfirm).

   ⚠️ ROUGE sur le code d'avant le bout 7a (ancien formulaire : pas de feuille).
   USAGE :  node <serveur statique> . 8080   puis   node scripts/test-infos.js 8080
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs'), path = require('path');
const PORT   = process.argv[2] || '8080';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE   = `http://localhost:${PORT}/admin/`;
const FX = n => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');
const HORAIRES = FX('infos-horaires.json'), GENERAL = FX('infos-general.json');
const H_ATTENDU = JSON.parse(FX('horaires-attendu.json')), G_ATTENDU = JSON.parse(FX('general-attendu.json'));
const pause = ms => new Promise(r => setTimeout(r, ms));
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch (e){ console.error('puppeteer-core manquant → npm install'); process.exit(2); }

const fails = [], lignes = [];
const verdict = (nom, ok, detail) => { lignes.push(`| ${nom} | ${detail} | ${ok ? '✅' : '❌'} |`); if (!ok) fails.push(`${nom} : ${detail}`); };
let b;
async function page(largeur = 390){
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: largeur, height: 900, isMobile: largeur < 900 });
  const envois = [];
  await p.setRequestInterception(true);
  p.on('request', r => {
    const u = r.url();
    if (/\/_data\/horaires\.json(\?.*)?$/.test(u)) return r.respond({ status: 200, contentType: 'application/json', body: HORAIRES });
    if (/\/_data\/general\.json(\?.*)?$/.test(u)) return r.respond({ status: 200, contentType: 'application/json', body: GENERAL });
    if (u.includes('/.netlify/functions/save-data')){ envois.push(JSON.parse(r.postData() || '{}')); return r.respond({ status: 200, contentType: 'application/json', body: '{"success":true}' }); }
    r.continue();
  });
  return { ctx, p, envois };
}
async function ouvrir(p, section){
  await p.goto(BASE + '#edit/' + section, { waitUntil: 'networkidle0' });
  const ok = await p.waitForSelector('#feuille .f-ligne', { timeout: 8000 }).then(() => true).catch(() => false);
  await p.evaluate(() => { session = { access_token: 'sonde', refresh_token: 'sonde', expires_at: Date.now() + 3600e3 }; });
  return ok;
}
/* Un vrai clic, sur un élément AMENÉ au centre : sur téléphone, le bouton Publier est collé en bas (sticky) et
   recevrait un clic destiné à une ligne qu'il recouvre (constaté : le samedi publiait la feuille). */
const clic = async (p, sel, opts) => { await p.$eval(sel, el => el.scrollIntoView({ block: 'center' })); await p.click(sel, opts); };
const remplacer = async (p, sel, texte) => { await clic(p, sel, { clickCount: 3 }); await p.keyboard.type(texte); };
/* 7a-bis : le cadre. Le surtitre nomme la section comme le client (jamais la clé d'édition), pas de légende
   « Ce que vos clients liront. » sous cette feuille, et « Annuler mes changements » absent tant que rien n'a changé. */
const cadre = p => p.evaluate(() => ({ sur: document.querySelector('.f-sur').textContent, note: !!document.querySelector('.f-note'),
  annuler: (b => b ? !b.hidden && getComputedStyle(b).display !== 'none' : null)(document.getElementById('feuilleAnnuler')) }));
const etat = p => p.evaluate(() => ({ btn: document.getElementById('btnFeuille').textContent.trim(), actif: !document.getElementById('btnFeuille').disabled,
  phrase: document.getElementById('feuillePhrase').textContent, chip: document.getElementById('feuilleEtat').textContent }));
const jour = (i, q = '') => `.f-jour[data-i="${i}"] ${q}`;
/* save-data écrit JSON.stringify(data, null, 2) + '\n'. Un fichier écrit À LA MAIN peut ne pas finir par '\n'
   (horaires.json et general.json de Sassy, au 27/10) : la 1re publication ajoute ce saut de ligne, quoi que
   fasse l'éditeur. On compare donc le CONTENU à l'octet, et on dit si le saut final manque à la source. */
const octets = d => JSON.stringify(d, null, 2);

async function horaires(){
  const { ctx, p, envois } = await page();
  if (!await ouvrir(p, 'horaires')){ verdict('horaires · feuille ouverte', false, 'aucune ligne de feuille — l’éditeur n’est pas une feuille'); return ctx.close(); }
  /* 3. Le point du jour même : un seul, sur le bon jour (même horloge que la page). */
  const auj = await p.evaluate(() => [...document.querySelectorAll('.f-jour')].filter(li => li.querySelector('.f-auj')).map(li => li.querySelector('.f-j-nom').textContent.trim()));
  const attenduAuj = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'][(new Date().getDay() + 6) % 7];
  verdict('horaires · point du jour même', auj.length === 1 && auj[0].startsWith(attenduAuj), `${auj.join(', ') || 'aucun'} (attendu ${attenduAuj})`);
  /* 7a-bis : cadre au repos */
  const c0 = await cadre(p);
  verdict('horaires · surtitre', /^05 · Horaires · /.test(c0.sur), `« ${c0.sur} »`);
  verdict('horaires · pas de légende sous la feuille', !c0.note, c0.note ? '« Ce que vos clients liront. » PRÉSENTE' : 'absente');
  verdict('horaires · « Annuler » absent au repos', c0.annuler === false, c0.annuler ? 'VISIBLE sans changement' : 'absent');
  /* 7a-bis : « Fermé » ne se lit que sur un jour fermé ; l'interrupteur dit le geste */
  const ferme = await p.evaluate(() => [...document.querySelectorAll('.f-jour')].map(li => ({ j: li.querySelector('.f-j-nom').textContent.replace(/\s*\(aujourd’hui\)/, '').trim(),
    mot: getComputedStyle(li.querySelector('.f-ferme-mot')).display !== 'none', aria: li.querySelector('input[type=checkbox]').getAttribute('aria-label') })));
  const okF = ferme.every(f => f.j === 'Samedi' ? (f.mot && f.aria === 'Ouvrir le samedi') : (!f.mot && f.aria === 'Fermer le ' + f.j.toLowerCase()));
  verdict('horaires · « Fermé » seulement sur un jour fermé', okF, ferme.map(f => `${f.j} ${f.mot ? '« Fermé »' : '—'} [${f.aria}]`).join(' · '));
  /* 1. Les gestes */
  await remplacer(p, jour(1, '.f-plage'), '12h – 23h');                       // mardi
  const c1 = await cadre(p);
  verdict('horaires · « Annuler » dès un changement', c1.annuler === true, c1.annuler ? 'visible' : 'ABSENT');
  await clic(p, jour(5, '.f-ferme'));                                         // samedi : rouvert, sans heures
  await pause(80);
  const bloque = await etat(p);
  const manque = await p.evaluate(() => { const li = document.querySelector('.f-jour[data-i="5"]'); return { cls: li.classList.contains('f-ligne--manque'), msg: li.querySelector('.f-manque').textContent }; });
  /* 2. Un jour ouvert sans heures bloque : saveSection() n'envoie RIEN. */
  await p.evaluate(() => saveSection()); await pause(150);
  verdict('horaires · jour ouvert sans heures', manque.cls && manque.msg === 'Il manque les heures' && !bloque.actif && /1 jour sans heures/.test(bloque.btn) && envois.length === 0,
    `« ${manque.msg} » · bouton « ${bloque.btn} » ${bloque.actif ? 'cliquable' : 'non cliquable'} · ${envois.length} envoi(s)`);
  await clic(p, jour(5, '.f-plage')); await p.keyboard.type('18h – 2h');
  await clic(p, jour(6, '.f-ferme'));                                         // dimanche : fermé
  const dimF = await p.evaluate(() => { const li = document.querySelector('.f-jour[data-i="6"]');
    return { mot: getComputedStyle(li.querySelector('.f-ferme-mot')).display !== 'none', aria: li.querySelector('input[type=checkbox]').getAttribute('aria-label') }; });
  verdict('horaires · fermer fait paraître « Fermé »', dimF.mot && dimF.aria === 'Ouvrir le dimanche', `${dimF.mot ? '« Fermé » affiché' : 'RIEN'} · [${dimF.aria}]`);
  await clic(p, jour(0, '.f-ferme')); await clic(p, jour(0, '.f-ferme'));     // lundi : fermé puis rouvert
  const dim = await p.evaluate(() => { const li = document.querySelector('.f-jour[data-i="6"]'), i = li.querySelector('.f-plage');
    return { visible: getComputedStyle(li.querySelector('.f-plages')).display !== 'none', valeur: i.value, ferme: li.querySelector('input[type=checkbox]').checked }; });
  verdict('horaires · fermer masque sans effacer', !dim.visible && dim.valeur === '11h30 – 22h00' && dim.ferme, `heures ${dim.visible ? 'VISIBLES' : 'masquées'}, valeur gardée « ${dim.valeur} »`);
  // « Fin » s'arrête à la fin de la ligne VISUELLE : le curseur est posé en fin de texte, puis on tape.
  await clic(p, '#fNoteHoraires'); await p.$eval('#fNoteHoraires', t => t.setSelectionRange(t.value.length, t.value.length));
  await p.keyboard.type(' (sauf dimanche)');
  const avant = await etat(p);
  verdict('horaires · le bouton compte', avant.btn === 'Publier' && avant.actif && /^4 changements/.test(avant.phrase) && avant.chip === 'Pas encore publié', `« ${avant.btn} » · « ${avant.phrase} » · chip « ${avant.chip} »`);
  /* 8. La garde */
  await p.click('.f-retour'); await pause(400);
  const garde = await p.evaluate(() => ({ q: getComputedStyle(document.getElementById('quitConfirm')).display, ecran: document.getElementById('screen-edit').classList.contains('active') }));
  verdict('horaires · quitter avec des changements', garde.q === 'flex' && garde.ecran, `#quitConfirm ${garde.q}, feuille ${garde.ecran ? 'toujours là' : 'QUITTÉE'}`);
  await p.evaluate(() => { const q = document.getElementById('quitConfirm'); if (q) q.style.display = 'none'; });
  await p.click('#btnFeuille'); await pause(400);
  const e = envois[0];
  const exact = !!e && e.section === 'horaires' && JSON.stringify(e.data) === JSON.stringify(H_ATTENDU);
  verdict('horaires · JSON envoyé == horaires-attendu.json', exact, e ? (exact ? 'identique, clé par clé et dans l’ordre' : 'DIFFÉRENT :\n' + JSON.stringify(e.data, null, 1)) : 'RIEN n’a été envoyé');
  await ctx.close();
}

async function contact(){
  const { ctx, p, envois } = await page();
  if (!await ouvrir(p, 'contact')){ verdict('contact · feuille ouverte', false, 'aucune ligne de feuille — l’éditeur n’est pas une feuille'); return ctx.close(); }
  /* 7a-bis : cadre au repos, et l'explication dit « le plan » (la carte, c'est le menu) */
  const c0 = await cadre(p);
  const explic = await p.$eval('.f-explic', el => el.textContent);
  verdict('contact · surtitre', /^06 · Infos · /.test(c0.sur), `« ${c0.sur} »`);
  verdict('contact · « le plan suit l’adresse »', /le plan suit l’adresse/.test(explic) && !/la carte suit/.test(explic), /le plan suit/.test(explic) ? 'oui' : 'NON');
  verdict('contact · pas de légende sous la feuille', !c0.note, c0.note ? '« Ce que vos clients liront. » PRÉSENTE' : 'absente');
  verdict('contact · « Annuler » absent au repos', c0.annuler === false, c0.annuler ? 'VISIBLE sans changement' : 'absent');
  /* 6. inputmode, tailles */
  const m = await p.evaluate(() => ({
    tel: document.getElementById('fi-telephone').getAttribute('inputmode'), mail: document.getElementById('fi-email').getAttribute('inputmode'),
    roles: [...document.querySelectorAll('.f-role')].map(x => x.textContent),
    min: Math.min(...[...document.querySelectorAll('#feuille .f-champ')].map(x => parseFloat(getComputedStyle(x).fontSize))),
    haut: Math.min(...[...document.querySelectorAll('#feuille .f-champ')].map(x => x.getBoundingClientRect().height)) }));
  verdict('contact · inputmode', m.tel === 'tel' && m.mail === 'email', `téléphone ${m.tel}, e-mail ${m.mail}`);
  verdict('contact · libellés de rôle', m.roles.join(' / ') === 'Où vous trouver / Pour réserver par téléphone / Pour vous écrire / Instagram / Facebook', m.roles.join(' / '));
  verdict('contact · champs ≥ 16 px, cibles ≥ 44 px', m.min >= 16 && m.haut >= 44, `police min ${m.min} px, hauteur min ${m.haut.toFixed(0)} px`);
  /* 5. Avertir sans bloquer */
  const av = async (cle) => { await clic(p, '#fi-adresse'); await pause(50);
    return p.evaluate(c => { const li = document.querySelector(`.f-info[data-cle="${c}"]`), s = li.querySelector('.f-manque');
      return { msg: s.textContent, vu: getComputedStyle(s).display !== 'none', couleur: getComputedStyle(s).color }; }, cle); };
  const violet = await p.evaluate(() => { const t = document.createElement('i'); t.style.color = 'var(--violet-encre)'; document.body.appendChild(t); const c = getComputedStyle(t).color; t.remove(); return c; });
  const cas = [
    ['telephone', '04 91 58 83 0', /10 chiffres/], ['telephone', '+33 4 91 58 83 03', /étranger/],
    ['email', 'contact-bistrotsassy.fr', /@/], ['instagram', '@bistrotsassy', /https:\/\//],
  ];
  for (const [cle, val, re] of cas){
    await remplacer(p, '#fi-' + cle, val);
    const r = await av(cle), e = await etat(p);
    verdict(`contact · avertit « ${val} »`, r.vu && re.test(r.msg) && r.couleur === violet && e.btn === 'Publier' && e.actif,
      `« ${r.msg} » (${r.couleur === violet ? '--violet-encre' : r.couleur}) · bouton « ${e.btn} » ${e.actif ? 'cliquable' : 'BLOQUÉ'}`);
  }
  const c1 = await cadre(p);
  verdict('contact · « Annuler » dès un changement', c1.annuler === true, c1.annuler ? 'visible' : 'ABSENT');
  await remplacer(p, '#fi-email', 'bonjour@bistrotsassy.fr');
  await remplacer(p, '#fi-instagram', 'https://www.instagram.com/bistrotsassy/');
  const ok = await av('instagram');
  verdict('contact · une URL complète ne dit rien', !ok.vu || !ok.msg, ok.msg ? `« ${ok.msg} »` : 'aucun message');
  await p.click('.f-retour'); await pause(400);
  const garde = await p.evaluate(() => ({ q: getComputedStyle(document.getElementById('quitConfirm')).display, ecran: document.getElementById('screen-edit').classList.contains('active') }));
  verdict('contact · quitter avec des changements', garde.q === 'flex' && garde.ecran, `#quitConfirm ${garde.q}, feuille ${garde.ecran ? 'toujours là' : 'QUITTÉE'}`);
  await p.evaluate(() => { const q = document.getElementById('quitConfirm'); if (q) q.style.display = 'none'; });
  await p.click('#btnFeuille'); await pause(400);
  const e = envois[0];
  const exact = !!e && e.section === 'contact' && JSON.stringify(e.data) === JSON.stringify(G_ATTENDU);
  verdict('contact · JSON envoyé == general-attendu.json', exact, e ? (exact ? 'identique, clé par clé et dans l’ordre (maps_url restitué)' : 'DIFFÉRENT :\n' + JSON.stringify(e.data, null, 1)) : 'RIEN n’a été envoyé');
  await ctx.close();
}

/* 7. Aller-retour : on ouvre, on publie SANS RIEN TOUCHER, et on compare aux octets du fichier. */
async function allerRetour(section, source){
  const { ctx, p, envois } = await page();
  if (!await ouvrir(p, section)){ verdict(`${section} · aller-retour`, false, 'pas de feuille'); return ctx.close(); }
  await p.evaluate(() => saveSection()); await pause(400);
  const e = envois[0];
  const corps = source.replace(/\n$/, ''), sautFinal = source.endsWith('\n');
  const pareil = !!e && octets(e.data) === corps;
  verdict(`${section} · aller-retour à l’octet`, pareil, e ? (pareil ? `${corps.length} octets identiques${sautFinal ? '' : ' (la source n’a pas de saut de ligne final : save-data en ajoutera un)'}` : 'DIFFÉRENT :\n' + octets(e.data)) : 'rien envoyé');
  await ctx.close();
}

(async () => {
  b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  for (const f of [horaires, contact, () => allerRetour('horaires', HORAIRES), () => allerRetour('contact', GENERAL)])
    await f().catch(e => fails.push('exception : ' + e.message));
  await b.close();
  console.log('\n═══ LES FEUILLES DES INFOS — horaires et contact ═══\n\n| Contrôle | Mesuré | |\n|---|---|---|\n' + lignes.join('\n'));
  if (fails.length){ console.log('\n❌ ' + fails.length + ' échec(s) :\n  - ' + fails.join('\n  - ')); process.exit(1); }
  console.log('\n✅ INFOS — les JSON envoyés sont ceux écrits à la main, l’aller-retour est à l’octet, on avertit sans bloquer, la garde protège.');
})();
