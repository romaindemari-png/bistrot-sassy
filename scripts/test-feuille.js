#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LA FEUILLE — l'éditeur unique de la carte (bout 5, LELAB-DESIGN §4 et §6)
   ═══════════════════════════════════════════════════════════════════════════
   Des GESTES DE CLIENT, pas des appels de fonction : clics, frappe, glisser à la souris, Alt+↑.
   La carte servie est une COPIE FIGÉE (scripts/fixtures/feuille-carte.json, interceptée à la place de
   _data/carte.json — l'original n'est ni lu ni écrit) ; save-data est INTERCEPTÉ.

   1. LE JSON ENVOYÉ est EXACTEMENT scripts/fixtures/feuille-attendu.json, écrit À LA MAIN (pas généré par
      le code testé) après : renommer un plat, changer un prix, ajouter un plat (nom, précision, prix),
      en retirer un, en retirer un autre puis Annuler, réordonner par GLISSER et par Alt+↑.
      Le bouton annonce le bon nombre de changements avant l'envoi.
   2. UN PLAT SANS NOM BLOQUE L'ENVOI : la ligne dit « Il manque le nom », le bouton compte les lignes à
      compléter, et saveSection() n'envoie RIEN.
   3. QUITTER AVEC DES CHANGEMENTS déclenche la garde (#quitConfirm).
   4. LE STUDIO LIT LES PLATS : champs en lecture seule, ni ajout ni suppression, et « Modifier dans la
      carte » ouvre la feuille.

   ⚠️ Il DOIT être ROUGE sur le code d'avant le bout 5 (pas de feuille), VERT après.
   USAGE :  python3 -m http.server 8080   puis   node scripts/test-feuille.js 8080
   PRÉREQUIS : puppeteer-core + un Chrome installé.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs'), path = require('path');
const PORT   = process.argv[2] || '8080';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE   = `http://localhost:${PORT}/admin/`;
const SOURCE  = fs.readFileSync(path.join(__dirname, 'fixtures', 'feuille-carte.json'), 'utf8');
const ATTENDU = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'feuille-attendu.json'), 'utf8'));
const pause = ms => new Promise(r => setTimeout(r, ms));

let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e){ console.error('puppeteer-core manquant → npm install'); process.exit(2); }

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const fails = [], lignes = [];
  const verdict = (nom, ok, detail) => { lignes.push(`| ${nom} | ${detail} | ${ok ? '✅' : '❌'} |`); if (!ok) fails.push(`${nom} : ${detail}`); };

  const page = async (largeur = 390) => {
    const p = await b.newPage();
    await p.setViewport({ width: largeur, height: 844, isMobile: largeur < 900, hasTouch: false });
    const envois = [];
    await p.setRequestInterception(true);
    p.on('request', r => {
      if (r.url().endsWith('/_data/carte.json')) return r.respond({ status: 200, contentType: 'application/json', body: SOURCE });
      if (r.url().includes('/.netlify/functions/save-data')){ envois.push(JSON.parse(r.postData() || '{}')); return r.respond({ status: 200, contentType: 'application/json', body: '{"success":true}' }); }
      r.continue();
    });
    return { p, envois };
  };
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
  const champ = (cat, n, quoi) => `.f-cat[data-cat="${cat}"] .f-lignes > .f-ligne:nth-child(${n}) .f-${quoi}`;
  const remplacer = async (p, sel, texte) => { await p.click(sel, { clickCount: 3 }); await p.keyboard.type(texte); };

  /* ── 1. Les gestes, puis le JSON envoyé ───────────────────────────────────────────────────── */
  {
    const { p, envois } = await page();
    await p.goto(BASE + '#edit/menu', { waitUntil: 'networkidle0' });
    const ok = await p.waitForSelector('#feuille .f-ligne', { timeout: 8000 }).then(() => true).catch(() => false);
    if (!ok){ verdict('feuille ouverte sur #edit/menu', false, 'aucune ligne de feuille — la feuille n\'existe pas'); }
    else {
      await p.evaluate(() => { session = { access_token: 'sonde', refresh_token: 'sonde', expires_at: Date.now() + 3600e3 }; });
      /* 7a-bis : le surtitre nomme la section comme le client (« La carte », pas la clé « menu ») ; la carte garde
         sa légende ; « Annuler mes changements » n'apparaît qu'avec un changement pas encore envoyé. */
      const annulerVu = () => p.evaluate(() => { const b = document.getElementById('feuilleAnnuler'); return !!b && b.getClientRects().length > 0; });
      const c0 = await p.evaluate(() => ({ sur: document.querySelector('.f-sur').textContent, note: (document.querySelector('.f-note') || {}).textContent }));
      verdict('surtitre sans nom technique', /^02 · La carte · /.test(c0.sur), `« ${c0.sur} »`);
      verdict('la carte garde sa légende', c0.note === 'Ce que vos clients liront.', `« ${c0.note || '(absente)'} »`);
      const a0 = await annulerVu();
      await remplacer(p, champ('entrees', 1, 'nom'), 'Salade d\'automne');
      const a1 = await annulerVu();
      verdict('« Annuler » seulement avec des changements', !a0 && a1, `repos : ${a0 ? 'VISIBLE' : 'absent'} · après un changement : ${a1 ? 'visible' : 'ABSENT'}`);
      await remplacer(p, champ('entrees', 2, 'prix'), '10€');
      await p.click('.f-cat[data-cat="desserts"] .f-ajouter');
      await p.keyboard.type('Riz au lait'); await p.keyboard.press('Tab');
      await p.keyboard.type('6€'); await p.keyboard.press('Tab');
      await p.keyboard.type('vanille');
      await p.click(champ('entrees', 3, 'nom')); await p.click(champ('entrees', 3, 'retirer'));          // Verrine : retirée
      await p.click(champ('desserts', 2, 'nom')); await p.click(champ('desserts', 2, 'retirer'));        // Crème brûlée : retirée…
      await p.click('.f-cat[data-cat="desserts"] .f-lignes > .f-ligne:nth-child(2) .f-annuler');           // … puis rétablie
      /* Le glisser : la poignée de « Tarte du moment » (3e dessert) monte au-dessus du 1er. */
      const h = await p.$eval(champ('desserts', 3, 'poignee'), e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      const cible = await p.$eval('.f-cat[data-cat="desserts"] .f-lignes > .f-ligne:nth-child(1)', e => e.getBoundingClientRect().top + 4);
      await p.mouse.move(h.x, h.y); await p.mouse.down();
      for (let i = 1; i <= 12; i++){ await p.mouse.move(h.x, h.y + (cible - h.y) * i / 12); await pause(16); }
      await p.mouse.up(); await pause(100);
      /* Alt+↑ : la Burrata (2e entrée) remonte en tête. */
      await p.click(champ('entrees', 2, 'nom')); await p.keyboard.down('Alt'); await p.keyboard.press('ArrowUp'); await p.keyboard.up('Alt');
      await pause(100);
      const avant = await p.evaluate(() => ({ btn: document.getElementById('btnFeuille').textContent.trim(), phrase: document.getElementById('feuillePhrase').textContent,
        chip: document.getElementById('feuilleEtat').textContent, garde: editDirty }));
      verdict('bouton avant l\'envoi', avant.btn === 'Publier' && /^6 changements/.test(avant.phrase) && avant.chip === 'Pas encore publié',
        `« ${avant.btn} » · « ${avant.phrase} » · chip « ${avant.chip} » (attendu : Publier · 6 changements · Pas encore publié)`);
      await p.click('#btnFeuille'); await pause(400);
      const e = envois[0];
      const exact = !!e && e.section === 'menu' && JSON.stringify(e.data) === JSON.stringify(ATTENDU);
      verdict('JSON envoyé == feuille-attendu.json', exact, e ? `section « ${e.section} », ${exact ? 'identique, clé par clé et dans l\'ordre' : 'DIFFÉRENT :\n' + JSON.stringify(e.data, null, 1)}` : 'RIEN n\'a été envoyé');
      const apres = await p.evaluate(() => ({ btn: document.getElementById('btnFeuille').textContent.trim(), ecran: document.getElementById('screen-edit').classList.contains('active') }));
      verdict('après l\'envoi', apres.btn === 'Envoyé · mise en ligne…' && apres.ecran, `« ${apres.btn} », feuille ${apres.ecran ? 'toujours ouverte' : 'FERMÉE'}`);

      /* ── 2. Un plat sans nom bloque l'envoi ─────────────────────────────────────────────────── */
      await p.click('.f-cat[data-cat="plats"] .f-ajouter');
      await p.keyboard.press('Tab'); await p.keyboard.type('12€');
      await p.click('.f-titre'); await pause(100);   // la ligne n'est plus active : son message se montre
      const n0 = envois.length;
      const manque = await p.evaluate(async () => {
        const li = document.querySelector('.f-cat[data-cat="plats"] .f-ligne');
        const msg = li && li.querySelector('.f-manque');
        const b = document.getElementById('btnFeuille');
        await saveSection(); await new Promise(r => setTimeout(r, 300));
        return { classe: li && li.classList.contains('f-ligne--manque'), msg: msg && getComputedStyle(msg).display !== 'none' ? msg.textContent : '(caché)',
                 btn: b.textContent.trim(), off: b.disabled };
      });
      verdict('plat sans nom', manque.classe && manque.msg === 'Il manque le nom' && manque.btn === '1 ligne à compléter' && manque.off && envois.length === n0,
        `ligne « ${manque.msg} » · bouton « ${manque.btn} » (${manque.off ? 'non cliquable' : 'CLIQUABLE'}) · ${envois.length - n0} envoi(s) après saveSection()`);

      /* ── 3. Quitter avec des changements → la garde ─────────────────────────────────────────── */
      await p.click('.f-retour'); await pause(400);
      const garde = await p.evaluate(() => ({ q: getComputedStyle(document.getElementById('quitConfirm')).display, ecran: document.getElementById('screen-edit').classList.contains('active') }));
      verdict('quitter avec des changements', garde.q === 'flex' && garde.ecran, `#quitConfirm ${garde.q}, feuille ${garde.ecran ? 'toujours là' : 'QUITTÉE'}`);
    }
    await p.close();
  }

  /* ── 4. Le studio lit les plats ──────────────────────────────────────────────────────────────── */
  {
    const { p } = await page();
    await p.goto(BASE, { waitUntil: 'networkidle0' });
    await pause(600);
    const s = await p.evaluate(async () => {
      handlePlusClick(); await new Promise(r => setTimeout(r, 300));
      const carte = document.querySelector('#themeGrid .lelab-card[data-theme="custom:sassy-carte"]');
      if (carte) selectTheme(carte);
      goStep(stepNum('page')); await new Promise(r => setTimeout(r, 300));   // bout 8 : les plats se lisent au pas 2 (le visuel)
      const champs = [...document.querySelectorAll('#dishEdit .d-name, #dishEdit .d-price')];
      const lien = document.getElementById('studioModifier');
      return { n: champs.length, lecture: champs.filter(i => i.readOnly).length,
               suppr: document.querySelectorAll('#dishEdit .dish-del').length, ajout: document.querySelectorAll('#dishEdit .add-dish, #addDishFlat').length,
               lien: lien && !lien.hidden ? lien.textContent : '(absent)' };
    });
    verdict('studio : plats en lecture', s.n > 0 && s.lecture === s.n && s.suppr === 0 && s.ajout === 0,
      `${s.lecture}/${s.n} champs en lecture seule · ${s.suppr} croix · ${s.ajout} bouton d'ajout`);
    /* Comme un client : on fait défiler jusqu'en bas (le pied fixe du studio couvre le bas de l'écran ; sans
       défiler, le clic tombait sur son « Retour » — mesuré le 27/10 : lien à 822 px, pied à 775 px). */
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await pause(300);
    const ouvert = s.lien === 'Modifier dans la carte'
      ? await p.click('#studioModifier').then(() => pause(500)).then(() => p.evaluate(() => ({ hash: location.hash, feuille: document.getElementById('screen-edit').classList.contains('edit--feuille') && document.getElementById('screen-edit').classList.contains('active') })))
      : { hash: '—', feuille: false };
    verdict('studio : « Modifier dans la carte »', ouvert.feuille && ouvert.hash === '#edit/menu', `lien « ${s.lien} » → ${ouvert.hash}, feuille ${ouvert.feuille ? 'ouverte' : 'NON ouverte'}`);
    await p.close();
  }

  for (const L of [390, 1280]){
    const { p } = await page(L);
    await p.goto(BASE + '#edit/menu', { waitUntil: 'networkidle0' });
    await p.waitForSelector('#feuille .f-ligne', { timeout: 8000 }).catch(() => {});
    await sansSaut(`carte ${L}`, p, async () => { await p.$eval(champ('entrees', 1, 'nom'), e => e.scrollIntoView({ block: 'center' })); await p.click(champ('entrees', 1, 'nom')); await p.keyboard.press('End'); await p.keyboard.type('!'); });
    await p.close();
  }

  await b.close();
  console.log('\n| cas | constat | |\n|---|---|---|');
  lignes.forEach(l => console.log(l));
  if (fails.length){ console.error('\n❌ FEUILLE — ' + fails.length + ' échec(s)\n   ' + fails.join('\n   ') + '\n'); process.exit(1); }
  console.log('\n✅ FEUILLE — le JSON envoyé est celui écrit à la main, un plat sans nom ne part pas, la garde protège, le studio lit.\n');
})();
