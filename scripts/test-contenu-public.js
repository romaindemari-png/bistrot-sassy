#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   CONTENU PUBLIC — CE QUE LE CLIENT SAISIT ATTEINT-IL SON SITE ?
   ═══════════════════════════════════════════════════════════════════════════
   ⚠️ LE GARDE-FOU QUI MANQUAIT — ET LE BUG QU'IL AURAIT ATTRAPÉ IL Y A DES SEMAINES.

   Le loader nommait ses catégories EN DUR : entrees/viandes/vins/poissons/desserts. L'admin, lui,
   en déclare trois dans config.json : entrees, PLATS, desserts. Résultat :
     · « plats » n'était JAMAIS lu → tout ce que le client y saisissait tombait dans le vide, sans
       le moindre message. L'admin confirmait « publié » sur du contenu qui n'irait nulle part ;
     · viandes/vins/poissons avaient un conteneur qu'AUCUN écran ne pouvait remplir ;
     · « légumes » avait un intitulé et pas même un conteneur : mort à vie.
   Trois sources nommaient les catégories, et les trois se contredisaient. Personne ne les comparait.

   ⚠️ POURQUOI PERSONNE NE L'A VU : carte.json porte `plats: []` sur le master. La catégorie fautive
      était VIDE dans la démo. « Ça marche sur mon jeu de test » — le défaut de la journée.
      → CE TEST SERT DONC SON PROPRE JEU : chaque catégorie déclarée reçoit un plat au nom UNIQUE,
        et on le cherche dans le TEXTE de la page. Aucune donnée de démo ne peut le rendre aveugle.

   Il lit la config DU DÉPÔT où il tourne → il vaut pour le master ET pour chaque fork, dont le site
   est fabriqué à la main. C'est LUI qui garantit qu'un fork ne retombe pas dans le trou, pas la
   discipline de portage.

   USAGE :  python3 -m http.server 8080   puis   node scripts/test-contenu-public.js 8080
   ═══════════════════════════════════════════════════════════════════════════ */
const PORT   = process.argv[2] || '8080';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE   = `http://localhost:${PORT}`;

let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e){ console.error('puppeteer-core manquant → npm install'); process.exit(2); }

const fs = require('fs'), path = require('path');
const RACINE = path.join(__dirname, '..');
const lire = f => JSON.parse(fs.readFileSync(path.join(RACINE, '_data', f), 'utf8'));

(async () => {
  const fails = [];
  const config = lire('config.json');

  /* Les catégories DÉCLARÉES — la même source que l'admin. Jamais une liste écrite ici : « entrees »
     est le vocabulaire d'UN client ; un caviste dira « rouges », un boulanger « pains ». */
  let cats = [];
  try { cats = (config.blocs.socle.carte.textes.categories || []).filter(c => c && c.cle); } catch (e){}
  if (!cats.length){ console.error('❌ aucune catégorie déclarée dans config.json — le test ne prouverait rien'); process.exit(2); }

  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 900 });

  /* On sert une carte où CHAQUE catégorie déclarée porte un plat identifiable. Le nom est unique et
     improbable : on le cherchera dans le texte rendu, sans dépendre d'un sélecteur (un mauvais
     sélecteur ment — il a menti quatre fois pendant l'enquête qui a mené à ce test). */
  const marque = c => `ZZ-${c.cle}-TEMOIN`;
  const faux = {};
  cats.forEach(c => { faux[c.cle] = [{ nom: marque(c), description: 'témoin de rendu', prix: '1€' }]; });
  /* Un nom PIÉGÉ : si le rendu n'échappe pas, il casse le HTML de la page du client. */
  faux[cats[0].cle].push({ nom: 'Salade "du chef" <b>', description: 'Steak <maison> & frites', prix: '2€' });

  let servie = false;
  await p.setRequestInterception(true);
  p.on('request', r => /_data\/carte\.json/.test(r.url())
    ? (servie = true, r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(faux) }))
    : r.continue());

  await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  if (!servie) fails.push('setup/ carte.json n\'a pas été interceptée — le test ne prouverait rien');

  const vu = await p.evaluate(() => ({
    texte: document.body.innerText,
    html:  document.body.innerHTML,
    /* Les conteneurs `cms-*` de la carte qui traîneraient encore : chacun devrait avoir un écran
       pour le remplir. Il n'en reste aucun — les colonnes sont montées par attribut. */
    cmsCarte: [...document.querySelectorAll('[id^="cms-"]')].map(e => e.id),
    subs: [...document.querySelectorAll('.carte-item-sub')].map(e => e.textContent.trim()),
    noms: [...document.querySelectorAll('.carte-item-name')].map(e => e.textContent.trim()),
  }));

  /* ── 1. CHAQUE CATÉGORIE DÉCLARÉE ATTEINT LE SITE ─────────────────────────────────────────
     C'est LE test. Un plat saisi dans une catégorie que l'admin propose DOIT apparaître en ligne. */
  cats.forEach(c => {
    if (!vu.texte.includes(marque(c)))
      fails.push(`CARTE/ « ${c.label || c.cle} » est saisissable dans l'admin mais son contenu N'ATTEINT PAS le site — le client publie dans le vide, sans message (c'est le bug de « plats »)`);
    if (!vu.noms.some(n => n === (c.label || c.cle)))
      fails.push(`CARTE/ l'intitulé « ${c.label || c.cle} » ne s'affiche pas sur le site alors que la catégorie porte du contenu`);
  });

  /* ── 2. AUCUN INTITULÉ QUE LA CONFIG NE DÉCLARE ────────────────────────────────────────────
     L'inverse du même mal : le site montrait « viandes », « vins », « poissons », « légumes » —
     quatre catégories qu'aucun écran ne pouvait remplir. Une promesse sans porte. */
  const declares = cats.map(c => (c.label || c.cle));
  vu.noms.forEach(n => {
    if (!declares.includes(n))
      fails.push(`CARTE/ le site affiche « ${n} », que config.json NE DÉCLARE PAS — aucun écran ne peut la remplir (conteneur mort)`);
  });

  /* ── 3. LE SOUS-TITRE SUIT LA DONNÉE ───────────────────────────────────────────────────────── */
  cats.forEach(c => {
    if (c.sub && !vu.subs.includes(c.sub))
      fails.push(`CARTE/ le sous-titre « ${c.sub} » de « ${c.label || c.cle} » est déclaré mais pas rendu`);
  });
  const subsDeclares = cats.map(c => c.sub).filter(Boolean);
  vu.subs.forEach(s => {
    if (s && !subsDeclares.includes(s))
      fails.push(`CARTE/ le site affiche le sous-titre « ${s} », absent de config.json (écrit en dur ?)`);
  });

  /* ── 4. L'ÉCHAPPEMENT ───────────────────────────────────────────────────────────────────────
     renderPlats sortait `${p.nom}` brut. Un plat « Salade "du chef" » ou « Steak <maison> » — que
     le client tape sans y penser — cassait le HTML de son site. */
  if (/<b>\s*<\/b>|Steak <maison>/.test(vu.html))
    fails.push('CARTE/ le nom/la description d\'un plat est injecté SANS échappement — un plat « Salade "du chef" » ou « Steak <maison> » casse le HTML du site');

  /* ── 5. UNE CATÉGORIE VIDE NE S'AFFICHE PAS (et n'est pas un bug) ────────────────────────────
     ⚠️ LA DISTINCTION QUI COMPTE : « vide → masquée » est un CHOIX (on ne montre pas un intitulé
        suivi du néant) ; « pleine → invisible » était une PERTE DE CONTENU. Ce test tient les deux :
        au-dessus on exige que le plein s'affiche, ici que le vide se taise. */
  const vide = {};
  cats.forEach((c, i) => { vide[c.cle] = i === 0 ? [{ nom: marque(c), description: 'd', prix: '1€' }] : []; });
  await p.setRequestInterception(false);
  await p.setRequestInterception(true);
  p.removeAllListeners('request');
  p.on('request', r => /_data\/carte\.json/.test(r.url())
    ? r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(vide) })
    : r.continue());
  await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  const v2 = await p.evaluate(() => ({
    noms: [...document.querySelectorAll('.carte-item-name')].map(e => e.textContent.trim()),
    nums: [...document.querySelectorAll('.carte-item-num')].map(e => e.textContent.trim()),
  }));
  if (v2.noms.length !== 1)
    fails.push(`CARTE/ ${v2.noms.length} intitulé(s) affiché(s) alors qu'UNE SEULE catégorie porte du contenu — une catégorie vide ne doit pas montrer son titre suivi du néant`);
  /* Le numéro compte ce qu'on VOIT : avec des catégories masquées, « 01 » puis « 03 » se lirait
     comme un bug. Il numérote les rendues. */
  if (v2.nums.length && v2.nums[0] !== '01')
    fails.push(`CARTE/ la première catégorie rendue porte le numéro « ${v2.nums[0] }» au lieu de « 01 » — le numéro doit compter les catégories VISIBLES, pas le rang déclaré (sinon il montre des trous)`);

  await b.close();
  if (fails.length){ console.error('\n❌ CONTENU PUBLIC — ' + fails.length + ' échec(s)\n   ' + fails.join('\n   ') + '\n'); process.exit(1); }
  console.log('\n✅ CONTENU PUBLIC — chaque catégorie déclarée atteint le site · aucun intitulé sans écran · sous-titres pilotés par la donnée · échappement · vide = masqué.\n');
})();
