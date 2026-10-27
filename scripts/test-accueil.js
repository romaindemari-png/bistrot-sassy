#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LA PHRASE D'ACCUEIL — elle dit l'état RÉEL du site, et elle suit les données (LELAB-DESIGN §4).
   ═══════════════════════════════════════════════════════════════════════════
   Au 26/10, AUCUNE donnée de Sassy ne fait passer une section « à voir » (relevé champ par champ :
   pas de date d'ardoise, pas de date de fin) : SOURCES_A_VOIR est vide, la phrase est donc fixe. Mais la
   mécanique 0 / 1 / n est câblée, et c'est elle qu'on prouve ici, sur une SOURCE SIMULÉE branchée en
   mémoire — jamais en écrivant dans _data.

   1. LE RÉEL : sans source, « Votre site est à jour. » et pas de chip « à voir ».
   2. 0 / 1 / 2 sections à voir → la phrase et la chip changent (« Une carte vous attend. », « 2 cartes
      vous attendent. », chip « 2 à voir »).
   3. MASQUÉE GAGNE : un bloc `actif:false` (dujour chez Sassy) ne compte JAMAIS « à voir », même si une
      source le désigne. Masquée = strictement actif:false (§2).
   4. LE SALUT : « Bonjour » jusqu'à 17 h 59, « Bonsoir » dès 18 h 00 ; le prénom s'ajoute s'il est rempli.
   5. L'AVATAR NE DÉCONNECTE PAS : il ouvre un volet ; dehors, Échap, second toucher le ferment ; seul
      « Se déconnecter » déconnecte.

   ⚠️ Il DOIT être ROUGE sur le code d'avant le bout 3 (renderAccueil n'existe pas), VERT après.

   USAGE :  python3 -m http.server 8080   puis   node scripts/test-accueil.js 8080
   PRÉREQUIS : puppeteer-core + un Chrome installé.
   ═══════════════════════════════════════════════════════════════════════════ */
const PORT   = process.argv[2] || '8080';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE   = `http://localhost:${PORT}/admin/`;

let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e){ console.error('puppeteer-core manquant → npm install'); process.exit(2); }

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true });
  await p.evaluateOnNewDocument(() => { window.__NO_DEV_BYPASS = true; });
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  const pret = await p.evaluate(async () => {
    if (typeof renderAccueil !== 'function' || typeof SOURCES_A_VOIR === 'undefined') return false;
    document.body.classList.add('authed');
    await loadSassyData();
    return true;
  });
  if (!pret){ console.error('\n❌ ACCUEIL — renderAccueil / SOURCES_A_VOIR absents : la phrase d\'accueil n\'existe pas\n'); await b.close(); process.exit(1); }

  const fails = [];
  /* Rend l'accueil avec une source simulée (les clés désignées sont « à voir ») et une heure donnée. */
  const rendre = (cles, heure, prenom) => p.evaluate((cles, heure, prenom) => {
    SOURCES_A_VOIR.length = 0;
    if (cles) SOURCES_A_VOIR.push(bloc => cles.includes(bloc.cle) ? 'simulé' : null);
    sassyData.config.commerce.prenom = prenom || '';
    const d = new Date(2026, 9, 26, heure[0], heure[1]);
    renderAccueil(d);
    const chip = document.getElementById('chipAVoir');
    return {
      salut: document.getElementById('accueilSalut').textContent,
      etat:  document.getElementById('accueilEtat').textContent,
      chip:  chip.hidden ? null : chip.textContent,
      blocs: tousLesBlocs().map(x => x.cle + (x.actif === false ? ':off' : '')).join(' '),
    };
  }, cles, heure, prenom);

  const lignes = [];
  const verifier = (nom, r, etat, chip) => {
    const ok = r.etat === etat && r.chip === chip;
    lignes.push(`| ${nom} | ${r.etat} | ${r.chip === null ? '(masquée)' : r.chip} | ${ok ? '✅' : '❌'} |`);
    if (!ok) fails.push(`${nom} : « ${r.etat} » / chip ${r.chip} — attendu « ${etat} » / chip ${chip}`);
  };

  // 1. Le réel : aucune source
  verifier('réel (aucune source)', await rendre(null, [10, 0]), 'Votre site est à jour.', null);
  // 2. Source simulée : 0, 1, 2 sections à voir (blocs ACTIFS de Sassy)
  verifier('simulé · 0 à voir', await rendre([], [10, 0]), 'Votre site est à jour.', null);
  verifier('simulé · 1 à voir (carte)', await rendre(['carte'], [10, 0]), 'Une carte vous attend.', '1 à voir');
  const r2 = await rendre(['carte', 'events'], [10, 0]);
  verifier('simulé · 2 à voir (carte, events)', r2, '2 cartes vous attendent.', '2 à voir');
  // 3. Masquée gagne : dujour est actif:false chez Sassy
  if (!/dujour:off/.test(r2.blocs)) fails.push(`setup/ dujour n'est pas actif:false dans la config lue (${r2.blocs}) — le cas 3 ne prouverait rien`);
  verifier('masquée désignée (dujour)', await rendre(['dujour'], [10, 0]), 'Votre site est à jour.', null);
  verifier('masquée + 1 active (dujour, carte)', await rendre(['dujour', 'carte'], [10, 0]), 'Une carte vous attend.', '1 à voir');

  // 4. Le salut
  const saluts = [
    [[17, 59], '', 'Bonjour.'], [[18, 0], '', 'Bonsoir.'],
    [[9, 0], 'Vincent', 'Bonjour Vincent.'], [[21, 30], 'Vincent', 'Bonsoir Vincent.'],
  ];
  for (const [h, prenom, attendu] of saluts){
    const r = await rendre(null, h, prenom);
    const ok = r.salut === attendu;
    lignes.push(`| salut ${String(h[0]).padStart(2, '0')}:${String(h[1]).padStart(2, '0')}${prenom ? ' · ' + prenom : ''} | ${r.salut} | — | ${ok ? '✅' : '❌'} |`);
    if (!ok) fails.push(`salut à ${h.join(':')} (prénom « ${prenom} ») : « ${r.salut} » au lieu de « ${attendu} »`);
  }

  /* 5. L'AVATAR NE DÉCONNECTE PAS. Un toucher ouvre le volet (nom du commerce + « Se déconnecter ») ;
     dehors, Échap ou un second toucher le referment ; SEUL le bouton du volet déconnecte.
     ⚠️ De VRAIS clics (p.click / p.mouse) et une vraie touche : appeler les fonctions prouverait les
        fonctions, pas le geste. */
  const compte = () => p.evaluate(() => ({
    authed: document.body.classList.contains('authed'),
    ouvert: !document.getElementById('voletCompte').hidden,
    expanded: document.getElementById('avatarInit').getAttribute('aria-expanded'),
    nom: document.getElementById('voletNom').textContent,
  }));
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const etape = async (nom, geste, attendu) => {
    await geste(); await pause(150);
    const c = await compte();
    const ok = c.authed === attendu.authed && c.ouvert === attendu.ouvert;
    lignes.push(`| ${nom} | ${c.authed ? 'connecté' : 'DÉCONNECTÉ'} | volet ${c.ouvert ? 'ouvert' : 'fermé'} | ${ok ? '✅' : '❌'} |`);
    if (!ok) fails.push(`${nom} : connecté=${c.authed}, volet ouvert=${c.ouvert} — attendu connecté=${attendu.authed}, ouvert=${attendu.ouvert}`);
    return c;
  };
  const dehors = async () => { const r = await p.evaluate(() => { const b = document.getElementById('accueilEtat').getBoundingClientRect(); return [b.left + 10, b.top + 10]; }); await p.mouse.click(r[0], r[1]); };
  const c1 = await etape('avatar · 1er toucher', () => p.click('#avatarInit'), { authed: true, ouvert: true });
  if (c1.expanded !== 'true') fails.push(`aria-expanded vaut « ${c1.expanded} » volet ouvert`);
  if (c1.nom !== 'Bistrot Sassy') fails.push(`le volet affiche « ${c1.nom} » au lieu du nom du commerce`);
  /* Le premier toucher a déconnecté → l'app est masquée, aucun geste suivant n'a de sens : on s'arrête
     ici avec CE verdict, au lieu de planter sur un clic impossible. */
  if (!c1.authed) fails.push('un SEUL toucher sur l\'avatar déconnecte le client — c\'est le geste accidentel que le volet doit empêcher');
  else {
    await etape('toucher dehors', dehors, { authed: true, ouvert: false });
    await etape('avatar · rouvre', () => p.click('#avatarInit'), { authed: true, ouvert: true });
    await etape('Échap', () => p.keyboard.press('Escape'), { authed: true, ouvert: false });
    await etape('avatar · rouvre', () => p.click('#avatarInit'), { authed: true, ouvert: true });
    await etape('avatar · 2e toucher', () => p.click('#avatarInit'), { authed: true, ouvert: false });
    await etape('avatar · rouvre', () => p.click('#avatarInit'), { authed: true, ouvert: true });
    await etape('« Se déconnecter »', () => p.click('#voletCompte .vc-sortie'), { authed: false, ouvert: false });
  }

  console.log('\n| cas | phrase | chip | |\n|---|---|---|---|');
  lignes.forEach(l => console.log(l));
  await b.close();
  if (fails.length){ console.error('\n❌ ACCUEIL — ' + fails.length + ' échec(s)\n   ' + fails.join('\n   ') + '\n'); process.exit(1); }
  console.log('\n✅ ACCUEIL — la phrase et la chip suivent l\'état des sections (0 / 1 / n), une section masquée ne compte jamais, le salut suit l\'heure et le prénom, l\'avatar ouvre un volet et seul son bouton déconnecte.\n');
})();
