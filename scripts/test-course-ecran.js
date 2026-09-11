#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   COURSE D'ÉCRAN — DEUX TAPS RAPPROCHÉS : L'ÉCRAN FINAL EST LE DERNIER APPELÉ.
   ═══════════════════════════════════════════════════════════════════════════
   showScreen DIFFÈRE son applyScreen de 150 ms (le fondu). Tant que ce timer n'était pas ANNULÉ, un
   2e tap arrivé pendant le fondu s'appliquait bien tout de suite — mais le timer PÉRIMÉ du 1er tap
   retombait 150 ms après et réappliquait SON écran (et son état in-tunnel) PAR-DESSUS. Résultat :
   l'écran final était le PREMIER appelé, jamais le dernier, et comme .lelab-foot (la barre CTA,
   unifiée studio + éditeurs) vit sur body.in-tunnel, elle sautait avec.

   C'EST LA MÊME COURSE, colmatée DEUX FOIS ponctuellement sans jamais être généralisée :
     · boot()      — on a retiré le showScreen('dashboard') par défaut (il gagnait la course) ;
     · customLogout — on est passé en applyScreen DIRECT (pas de fondu derrière une porte opaque).
   La nav runtime (la barre du bas : accueil / mon site / studio) est le 3e chemin qui la rencontre —
   et le seul jamais couvert. Ce fichier la fige.

   CE QU'ON EXIGE :
     A. NON-RÉGRESSION — un showScreen SEUL bascule bien, et le fondu se REFERME (pas de « fading »
        resté collé sur .main).
     B. DERNIER GAGNE (aller)  — « mon site » PUIS « studio » (< 150 ms) → on FINIT au studio, avec
        in-tunnel → la barre CTA RESTE. ⚠️ ROUGE avant le fix : on finissait sur « mon site »,
        in-tunnel retiré, barre disparue.
     C. DERNIER GAGNE (retour) — « studio » PUIS « mon site » (< 150 ms) → on FINIT sur « mon site »,
        SANS in-tunnel. ⚠️ ROUGE avant le fix : le timer périmé du studio rouvrait le studio +
        in-tunnel par-dessus.

   B et C ensemble prouvent « le dernier gagne » DANS LES DEUX SENS — pas juste « le studio finit
   toujours par gagner » (ce qu'un seul sens laisserait passer).

   ⚠️ Il DOIT être ROUGE sur le code d'avant le correctif (showScreen sans clearTimeout), VERT après.

   USAGE :  python3 -m http.server 8080   puis   node scripts/test-course-ecran.js 8080
   PRÉREQUIS : puppeteer-core + un Chrome installé.
   ═══════════════════════════════════════════════════════════════════════════ */
const PORT   = process.argv[2] || '8080';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE   = `http://localhost:${PORT}/admin/`;
const wait   = ms => new Promise(r => setTimeout(r, ms));
const SETTLE = 450;   // > le fondu d'écran (150 ms) + le layout posé

let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e){ console.error('puppeteer-core manquant → npm install'); process.exit(2); }

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true });   // la barre CTA fixe est un comportement MOBILE
  /* Le garde-fou contrôle le boot lui-même → il désactive le bypass dev localhost, sinon boot()
     tournerait tout seul et appliquerait une route avant qu'on ait posé nos taps. */
  await p.evaluateOnNewDocument(() => { window.__NO_DEV_BYPASS = true; });

  await p.goto(BASE, { waitUntil: 'networkidle0' });
  await p.evaluate(async () => { document.body.classList.add('authed'); await loadSassyData(); });

  const fails = [];

  /* L'état RÉEL après un tap : l'écran actif, la présence de in-tunnel (donc de la barre CTA) et si
     le fondu est resté collé. On ne DÉDUIT rien — on lit le DOM. */
  const etat = () => p.evaluate(() => {
    const main = document.querySelector('.main');
    return {
      ecran:  [...document.querySelectorAll('.screen.active')].map(s => s.id).join(',') || '(aucun)',
      tunnel: document.body.classList.contains('in-tunnel'),
      fading: !!(main && main.classList.contains('fading')),
    };
  });
  /* Repart d'un écran neutre SANS passer par showScreen (applyScreen direct = pas de timer armé) :
     aucune course d'un cas ne fuit vers le suivant. */
  const reset = async () => { await p.evaluate(() => applyScreen('dashboard')); await wait(SETTLE); };

  // ── A. NON-RÉGRESSION : un showScreen seul bascule, et le fondu se referme ──────────────────
  await reset();
  await p.evaluate(() => showScreen('monsite'));
  await wait(SETTLE);
  const a = await etat();
  if (a.ecran !== 'screen-monsite')
    fails.push(`REGRESSION/ un showScreen('monsite') SEUL ouvre « ${a.ecran} » — la bascule de base est cassée`);
  if (a.fading)
    fails.push('REGRESSION/ .main porte encore « fading » après le fondu — le fondu ne se referme pas (fading resté collé)');
  if (a.tunnel)
    fails.push('REGRESSION/ « mon site » n\'est pas un tunnel mais in-tunnel y est posé — la barre CTA s\'afficherait à tort');

  // ── B. DERNIER GAGNE (ALLER) : mon site PUIS studio → on finit au STUDIO, barre CTA présente ──
  /* Les deux taps dans le MÊME tick = « plus rapide que le fondu » (le cas le plus serré, et le plus
     déterministe). handlePlusClick est le VRAI chemin du bouton « Publier » → il appelle showScreen('studio'). */
  await reset();
  await p.evaluate(() => { showScreen('monsite'); handlePlusClick(); });
  await wait(SETTLE);
  const bR = await etat();
  if (bR.ecran !== 'screen-studio')
    fails.push(`COURSE/ « mon site » puis « studio » (< 150 ms) → on FINIT sur « ${bR.ecran} » au lieu du studio. Le timer périmé du 1er tap a réappliqué SON écran par-dessus le dernier — c'est LE bug`);
  if (!bR.tunnel)
    fails.push('COURSE/ on finit au studio mais SANS in-tunnel → la barre CTA a disparu. C\'est le symptôme exact rapporté sur iPhone');
  if (bR.fading)
    fails.push('COURSE/ (aller) fading resté collé après deux taps rapprochés');

  // ── C. DERNIER GAGNE (RETOUR) : studio PUIS mon site → on finit sur MON SITE, sans in-tunnel ──
  await reset();
  await p.evaluate(() => { handlePlusClick(); showScreen('monsite'); });
  await wait(SETTLE);
  const cR = await etat();
  if (cR.ecran !== 'screen-monsite')
    fails.push(`COURSE/ « studio » puis « mon site » (< 150 ms) → on FINIT sur « ${cR.ecran} » au lieu de « mon site ». Le timer périmé du studio a rouvert le studio par-dessus le dernier tap`);
  if (cR.tunnel)
    fails.push('COURSE/ on finit sur « mon site » mais in-tunnel y est resté → la barre CTA d\'un tunnel s\'affiche hors tunnel, et la nav du bas est masquée');
  if (cR.fading)
    fails.push('COURSE/ (retour) fading resté collé après deux taps rapprochés');

  await b.close();
  if (fails.length){ console.error('\n❌ COURSE D\'ÉCRAN — ' + fails.length + ' échec(s)\n   ' + fails.join('\n   ') + '\n'); process.exit(1); }
  console.log('\n✅ COURSE D\'ÉCRAN — deux taps < 150 ms : l\'écran final == le dernier appelé, dans les deux sens · in-tunnel cohérent avec lui (la barre CTA reste au studio, disparaît hors tunnel) · le fondu se referme (pas de .fading collé) · un showScreen seul intact.\n');
})();
