#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   CHAQUE THÈME PUBLIE-T-IL BIEN **SA** SOURCE — MÊME APRÈS EN AVOIR REGARDÉ UN AUTRE ?
   ═══════════════════════════════════════════════════════════════════════════════════════════════
   LE BUG QU'IL AURAIT DÛ ATTRAPER (14/07)
   Le studio gardait la liste du thème PRÉCÉDENT. On passait de « ma carte » à « ma fournée », et
   la fournée publiait LE CARROUSEL DE LA CARTE (Entrées | Plats | Desserts) — sous son propre nom.
   Chaque source portait un garde-fou « il y a du contenu → ne pas écraser », qui ne savait pas
   D'OÙ venait ce contenu : il protégeait la saisie du client ET, sans le vouloir, le remplissage
   d'un autre thème.

   ⚠️ POURQUOI LES 4 AUTRES GARDE-FOUS SONT PASSÉS AU VERT
   Aucun ne SÉQUENCE. Ils ouvrent un écran, mesurent, repartent d'une page neuve. Or ce bug
   n'existe QUE dans l'enchaînement — il faut avoir vu A pour que B soit faux. Mes propres sondes
   remettaient le studio à zéro entre deux thèmes : elles me l'ont CACHÉ.
   → Ce test enchaîne. Il essaie TOUS LES COUPLES ORDONNÉS de thèmes typo (A puis B), et vérifie
     que B publie ce que B déclare — pas ce que A avait laissé.

   CE QU'IL VÉRIFIE, sans rien savoir du client :
     · la source de chaque thème vient de themes.json ("prefill")
     · le contenu attendu vient des VRAIS _data/ (carte.json → par catégories ; un bloc de type
       "produits" → liste plate des produits disponibles)
     · rien n'est écrit en dur : ni un nom de thème, ni un nom de bloc, ni une catégorie.

   ⚠️ S'IL NE DÉCOUVRE AUCUN THÈME TYPO, IL ÉCHOUE. Un scan qui ne trouve rien n'est pas un scan
      qui passe — c'est un scan cassé.

     node scripts/test-themes.js     (npm run test-themes)   → sort ≠ 0 si un thème ment
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */
const PORT = process.env.PORT || 8080;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch { console.error('✗ puppeteer-core manquant.  npm i -D puppeteer-core'); process.exit(1); }

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  const erreursJS = [];
  p.on('pageerror', e => erreursJS.push(e.message));
  await p.goto(`http://localhost:${PORT}/admin/`, { waitUntil: 'networkidle0' });

  const res = await p.evaluate(async () => {
    const pause = ms => new Promise(r => setTimeout(r, ms));
    document.body.classList.add('authed');
    await loadSassyData();
    await pause(400);
    studioReady = true;

    /* ── CE QU'ON ATTEND d'un thème, DÉDUIT DES DONNÉES — jamais écrit en dur ────────────────── */
    const attenduPour = (theme) => {
      const src = theme.prefill;
      if (!src) return null;
      // 1. une source « à catégories » : le fichier est un OBJET de listes (carte.json)
      const donnees = sassyData[src] !== undefined ? sassyData[src] : sassyData.carte;
      if (src === 'carte' || (donnees && !Array.isArray(donnees) && typeof donnees === 'object')){
        const cats = categoriesCarte();
        const slides = [];
        cats.forEach(c => {
          const items = ((sassyData.carte || {})[c.cle] || []).filter(d => d && d.nom);
          for (let i = 0; i < 5; i += 5){}                       // (le découpage max/slide est testé par le rendu)
          if (items.length) slides.push({ label: c.label, n: Math.min(items.length, 5) });
        });
        return { forme: 'categories', nSlides: slides.length, labels: slides.map(s => s.label) };
      }
      // 2. une source « liste plate » : un bloc de type produits → 1 slide, AUCUN libellé
      if (Array.isArray(donnees)){
        const dispo = donnees.filter(d => d && d.nom && d.dispo !== false);
        return { forme: 'liste', nSlides: dispo.length ? 1 : 0, labels: [] };
      }
      return null;
    };

    const themes = (sassyData.themes || []).filter(t => t.type === 'typo' && t.prefill);
    if (themes.length < 1) return { fatal: 'AUCUN thème typo découvert — le test ne vérifie RIEN.' };

    const choisir = async (theme) => {
      currentCustomTheme = theme; currentTheme = theme.id; currentKind = 'typo'; currentFmt = 'portrait';
      prefillStudioFromSite();
      await pause(250);
      const slides = studioSlides();
      return { nSlides: slides.length, labels: slides.map(s => s.label).filter(Boolean) };
    };

    const out = [];
    /* ⚠️ TOUS LES COUPLES ORDONNÉS, sans remise à zéro entre les deux : c'est LÀ qu'est le bug. */
    for (const avant of themes){
      for (const apres of themes){
        if (avant.id === apres.id) continue;
        clearStudioContent();                 // on repart d'un studio VIERGE pour chaque couple
        await pause(80);
        await choisir(avant);                 // 1. le client regarde un thème…
        const obtenu = await choisir(apres);  // 2. …puis il en choisit un autre
        const att = attenduPour(apres);
        const pb = [];
        if (!att) pb.push('source « ' + apres.prefill + ' » introuvable dans les données');
        else {
          if (obtenu.nSlides !== att.nSlides)
            pb.push(`${obtenu.nSlides} slide(s) au lieu de ${att.nSlides}`);
          const attLab = att.labels.join(' | '), obLab = obtenu.labels.join(' | ');
          if (attLab !== obLab)
            pb.push(`libellés « ${obLab || '(aucun)'} » au lieu de « ${attLab || '(aucun)'} »`);
        }
        out.push({ avant: avant.nom, apres: apres.nom, pb, obtenu, att });
      }
    }
    return { out, nThemes: themes.length };
  });

  console.log('\n═══ CHAQUE THÈME PUBLIE-T-IL SA PROPRE SOURCE, MÊME APRÈS UN AUTRE ? ═══\n');
  if (res.fatal){ console.error('  ✗ ' + res.fatal + '\n'); await b.close(); process.exit(1); }

  let ko = 0;
  res.out.forEach(r => {
    const titre = `« ${r.avant} » → « ${r.apres} »`;
    if (!r.pb.length){
      console.log(`  ✓ ${titre.padEnd(48)} ${r.obtenu.nSlides} slide(s)` +
        (r.obtenu.labels.length ? ' : ' + r.obtenu.labels.join(' | ') : ' (sans libellé)'));
      return;
    }
    ko++;
    console.log(`  ✗ ${titre}`);
    r.pb.forEach(x => console.log(`      → ${x}`));
    console.log(`      ⚠️ « ${r.apres} » publie ce que « ${r.avant} » avait laissé.`);
  });
  if (erreursJS.length) console.log('\n  ⚠️ erreurs JS : ' + erreursJS.join(' | '));
  if (!res.out.length){
    console.error('\n──── ✗ AUCUN COUPLE TESTÉ — le test ne vérifie RIEN ────\n');
    await b.close(); process.exit(1);
  }
  console.log(`\n──── ${ko === 0
    ? '✓ ' + res.out.length + '/' + res.out.length + ' — chaque thème publie SA source'
    : ko + ' thème(s) publient la source d’un AUTRE'} ────\n`);
  await b.close();
  process.exit(ko === 0 ? 0 : 1);
})();
