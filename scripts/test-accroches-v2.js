#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   TEST ACCROCHES v2 — le moteur est-il BRANCHÉ, et le repli est-il AUDIBLE ?
   ═══════════════════════════════════════════════════════════════════════════
   POURQUOI CET OUTIL EXISTE
   Le moteur v2 (HTML → SVG → canvas → JPEG) a été écrit, éprouvé template par
   template… et pendant tout ce temps RIEN NE L'APPELAIT. Le bout des accroches
   est celui qui le rend vivant — et donc le seul où ces quatre garanties
   peuvent se rompre :

     A. le v2 peint réellement les six thèmes, et quand il ne peut pas, LE
        BANDEAU LE DIT À L'ÉCRAN. Un `console.warn` n'est lu par personne : le
        client publierait un visuel de secours en croyant publier le bon.
     B. le cadrage au doigt survit aux calques posés sur l'aperçu photo.
     C. LA GARANTIE DU POINT 23 : un thème sans `template` n'exécute AUCUNE
        ligne du moteur. Elle était triviale avant (rien n'appelait) ; elle est
        vérifiable maintenant.
     D. « APERÇU == EXPORT ». Brancher le v2 sur l'export SEUL suffirait à la
        rompre : le client validerait un aperçu canvas et publierait un v2.

   CE QU'IL MESURE, ET C'EST TOUJOURS UNE LECTURE
   · le profileur V8 (`Profiler.takePreciseCoverage`, detailed) donne le NOMBRE
     D'APPELS RÉELS de chaque fonction de moteur-v2.js. Pas un compteur posé à
     la main, pas un log : la machine qui exécute.
     ⚠️ `takePreciseCoverage` REMET LES COMPTEURS À ZÉRO à chaque lecture. Une
        lecture est donc un DELTA depuis la précédente — ne jamais soustraire.
     ⚠️ Une fonction jamais exécutée peut être ABSENTE du rapport (V8 compile
        paresseusement). Absente == zéro appel, c'est le sens qu'on lui donne.
   · le réseau dit si les .woff2 ont été demandés — 153 Ko de polices, le coût
     que la garantie du point 23 promet d'éviter.
   · les gestes sont de VRAIS gestes (`page.mouse` → Pointer Events de
     confiance). Un `dispatchEvent` fabriqué traverserait un
     `pointer-events:none` et la sonde mentirait.

   PRÉREQUIS : puppeteer-core + un Chrome installé, et le site servi :
       python3 -m http.server 8080
       node scripts/test-accroches-v2.js [port]

   ÉPREUVES AU ROUGE (chaque sonde a été vue rouge avant d'être crue verte) :
       --rouge-muet          le repli redevient un console.warn      → A rouge
       --rouge-sans-garde    pointer-events:auto sur les calques      → B2 rouge
       --rouge-hors-hote     un décor posé À CÔTÉ de l'hôte           → B1 rouge
       --rouge-avec-template on donne un template au 7ᵉ thème         → C rouge
       --rouge-sans-moteur   window.MOTEUR_V2 rendu indisponible      → D1,D2 rouge
       --rouge-sans-compteur le garde de course retiré                → D3 rouge
   ═══════════════════════════════════════════════════════════════════════════ */

let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch { console.error('✗ puppeteer-core manquant.  npm i -D puppeteer-core'); process.exit(1); }

const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = (process.argv[2] && /^\d+$/.test(process.argv[2])) ? process.argv[2] : '8080';
const BASE = `http://127.0.0.1:${PORT}`;
const RACINE = path.resolve(__dirname, '..');
const A = f => process.argv.includes(f);

const dodo = ms => new Promise(r => setTimeout(r, ms));
const CAS = [['sassy-carte','portrait'],['sassy-dujour','portrait'],['sassy-infos','portrait'],
             ['sassy-annonce','portrait'],['sassy-photo','story'],['sassy-event','portrait']];

/* ───────────────────────────────────────────────────────────────────────────
   LE HARNAIS
   ⚠️ LE BYPASS localhost EST CE QUI REND CE TEST POSSIBLE : `DEV_LOCAL` fait
      démarrer l'admin sans Netlify Identity. En prod le hostname n'y est pas.
   ⚠️ Les appels /.netlify/* n'ont pas de serveur ici : on répond 404 TOUT DE
      SUITE. Les laisser pendre faisait expirer l'attente de chargement.
   ─────────────────────────────────────────────────────────────────────────── */
async function ouvrirAdmin(opts = {}) {
  const nav = await puppeteer.launch({
    executablePath: CHROME, headless: 'shell',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1']
  });
  const p = await nav.newPage();
  await p.setViewport({ width: 430, height: 900, deviceScaleFactor: 1 });
  const journal = [];
  p.on('console', m => journal.push(m.type() + ' · ' + m.text()));
  p.on('pageerror', e => journal.push('PAGEERROR · ' + e.message));
  if (opts.avantChargement) await p.evaluateOnNewDocument(opts.avantChargement);
  await p.setRequestInterception(true);
  const fontes = [];
  p.on('request', req => {
    const u = req.url();
    if (u.includes('.woff2')) fontes.push(u.replace(BASE, ''));
    if (u.includes('/.netlify/')) return req.respond({ status: 404, contentType: 'application/json', body: '{}' });
    /* Le 7ᵉ thème du point 23 est injecté DANS LA RÉPONSE HTTP, pas dans le
       dépôt : aucun fichier n'est modifié, donc rien à restaurer — et rien à
       oublier de restaurer. */
    if (opts.themesPatch && u.includes('/_data/themes.json')) {
      const j = JSON.parse(fs.readFileSync(path.join(RACINE, '_data/themes.json'), 'utf8'));
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(opts.themesPatch(j)) });
    }
    if (u.startsWith('http') && !u.startsWith(BASE)) return req.abort();
    req.continue();
  });
  await p.goto(BASE + '/admin/', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForFunction("document.body.classList.contains('dev-local')", { timeout: 20000 });
  await p.waitForFunction("document.querySelectorAll('#studio-unlocked .lelab-card[data-theme]').length > 0",
                          { timeout: 15000 }).catch(() => {});
  p.__fontes = fontes;
  return { nav, p, journal };
}

/* Entre dans le studio par le CHEMIN RÉEL : le bouton +, le clic sur le format,
   le clic sur la carte du thème. Aucune fonction interne appelée à la main —
   sinon la sonde prouverait que LE CHEMIN DU TEST marche, pas celui du client.
   ⚠️ `let currentCustomTheme` en portée globale N'EST PAS une propriété de
      `window` : le lire en `window.currentCustomTheme` renvoie `undefined` et
      la sonde conclurait « aucun thème sélectionné » alors qu'il l'est. On lit
      l'identifiant nu. */
async function entrerStudio(p, themeId, fmt) {
  const r = await p.evaluate((themeId, fmt) => {
    /* ⚠️⚠️ ON RECOMMENCE VRAIMENT, ET C'ÉTAIT UN DÉFAUT DE CE HARNAIS. `handlePlusClick`
       est une REPRISE par construction — « le seuil est le travail saisi, jamais l'étape
       atteinte » — donc il NE VIDE PAS `studioPhotos`. En bouclant sur les thèmes, le
       test empilait les photos : relevé 0/1 → 1/2 → 2/3, et `studioPhotoIdx` avançait
       avec elles. Or le texte d'overlay n'est peint que sur la PREMIÈRE slide : à partir
       du deuxième thème, `#igText` restait `none` alors que `studioOverlayText()` rendait
       bien la phrase. D2 mesurait donc le cas SANS texte en croyant mesurer celui AVEC —
       vert, et à côté. Troisième fois aujourd'hui qu'une sonde n'a rien à vérifier ;
       celle-ci venait de l'état qui fuyait d'une itération à l'autre.
       ⚠️ `studioReset()` est le « Recommencer » DE L'ADMIN, pas un vidage écrit ici : le
          harnais déclenche ce que le client déclenche, sinon il éprouve autre chose. */
    if (typeof studioReset === 'function') studioReset();
    const ouvre = document.querySelector('#fabPlus, .fab-plus, [onclick*="handlePlusClick"]');
    if (ouvre) ouvre.click(); else if (typeof handlePlusClick === 'function') handlePlusClick();
    const f = fmt && document.querySelector('#fmtRow .fmt[data-fmt="' + fmt + '"]');
    if (fmt && !f) return { ok: false, ou: 'format ' + fmt + ' absent du DOM' };
    if (f) f.click();
    const card = document.querySelector('#studio-unlocked .lelab-card[data-theme="custom:' + themeId + '"]');
    if (!card) return { ok: false, ou: 'carte du thème ' + themeId + ' non injectée' };
    card.click();
    return { ok: true };
  }, themeId, fmt);
  if (!r.ok) return r;
  await dodo(500);
  return await p.evaluate(() => ({
    ok: true,
    theme: typeof currentCustomTheme !== 'undefined' && currentCustomTheme ? currentCustomTheme.id : null,
    template: typeof currentCustomTheme !== 'undefined' && currentCustomTheme ? (currentCustomTheme.template || null) : null,
    fmt: typeof currentFmt !== 'undefined' ? currentFmt : '?',
    kind: typeof currentKind !== 'undefined' ? currentKind : '?'
  }));
}

/* Remplit le thème comme le ferait le client : carte et plat du jour arrivent
   préremplis du site ; infos et annonce demandent du texte ; photo et événement
   demandent une VRAIE photo, déposée dans le VRAI `<input type=file>`. */
async function remplir(p, themeId) {
  if (themeId === 'sassy-infos' || themeId === 'sassy-annonce') {
    await p.evaluate(() => {
      const t = document.getElementById('infosText');
      t.value = 'Ouvert du mardi au samedi, de 8 h à 19 h.\nBrunch le dimanche, sur réservation.';
      t.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  if (themeId === 'sassy-photo' || themeId === 'sassy-event' || themeId === 'sassy-sans-moteur') {
    const input = await p.$('#studio-photo-input');
    await input.uploadFile(path.join(RACINE, '_data/demo/photo-demo.jpg'));
    await p.waitForFunction("typeof studioPhotos !== 'undefined' && studioPhotos.length > 0", { timeout: 15000 });
    await p.evaluate(() => {
      const t = document.getElementById('storyText');
      if (t) { t.value = 'le comptoir, à 18 h'; t.dispatchEvent(new Event('input', { bubbles: true })); }
    });
  }
  await dodo(400);
}

/* ⚠️ L'APERÇU EST UN VOLET GARÉ HORS ÉCRAN. En mobile `.preview-pane` est
   `position:fixed` avec `translateY(-900px)` jusqu'à ce que le client touche la
   mini-vignette : `getBoundingClientRect` renvoyait y = −628, la souris tapait
   600 px au-dessus de la fenêtre et la sonde concluait « le glissement ne
   marche pas ». Rouge pour une raison étrangère à ce qu'elle mesure. */
const ouvrirVolet = p => p.evaluate(() => {
  if (!document.body.classList.contains('preview-open')) togglePreview();
});

const repli = p => p.evaluate(() => {
  const el = document.getElementById('v2Repli');
  if (!el) return { present: false, visible: false, texte: '' };
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  return { present: true, texte: (el.textContent || '').trim(),
           visible: cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0 && r.height > 0 };
});

async function couvertureOn(p) {
  const s = await p.target().createCDPSession();
  await s.send('Profiler.enable');
  await s.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
  return s;
}
async function couverture(s) {
  const { result } = await s.send('Profiler.takePreciseCoverage');
  const o = {};
  for (const r of result.filter(x => x.url.includes('moteur-v2.js')))
    for (const f of r.functions) {
      const n = f.functionName || '(anonyme)';
      o[n] = (o[n] || 0) + Math.max(...f.ranges.map(x => x.count));
    }
  return o;
}

const T = [];   // le rapport, ligne par ligne
const dire = (s = '') => console.log(s);
const verdict = (nom, ok, detail) => { T.push({ nom, ok }); dire('  ' + (ok ? '✓' : '✗') + ' ' + nom.padEnd(52) + (ok ? 'VERT' : 'ROUGE') + (detail ? '   ' + detail : '')); };

/* ══════════════════ SONDE A ══════════════════════════════════════════════════
   La panne employée est RÉELLE, pas un monkeypatch : les .woff2 répondent 404.
   C'est la panne la plus probable en production — un chemin d'asset qui bouge. */
async function sondeA() {
  dire('\n━━ A · LES SIX ACCROCHES MORDENT, ET LE REPLI EST BRUYANT ━━━━━━━━━━━━━━━━━━━');
  const passe = async cassePolices => {
    const opts = {};
    if (A('--rouge-muet')) opts.avantChargement = () => {
      document.addEventListener('DOMContentLoaded', () => {
        window.signalerRepli = r => console.warn('[v2] repli : ' + r);   // ← le geste qu'on refuse
      });
    };
    const { nav, p, journal } = await ouvrirAdmin(opts);
    if (A('--rouge-muet')) await p.evaluate(() => { window.signalerRepli = r => console.warn('[v2] repli : ' + r); });
    if (cassePolices) await p.evaluate(() => {
      const vrai = window.fetch;
      window.fetch = function (u) {
        if (String(u).indexOf('.woff2') >= 0) return Promise.resolve(new Response('', { status: 404 }));
        return vrai.apply(this, arguments);
      };
    });
    const sess = await couvertureOn(p);
    const out = [];
    for (const [id, fmt] of CAS) {
      await entrerStudio(p, id, fmt);
      await remplir(p, id);
      await couverture(sess);                        // purge : la lecture suivante EST le delta
      const v = await p.evaluate(() => bakeAllVisuals().then(x => x.map(u => (u || '').length)));
      await dodo(500);
      const rast = (await couverture(sess))['rasteriser'] || 0;
      const b = await repli(p);
      out.push({ id, fmt, rast, n: v.length, o: v[0] || 0, bandeau: b.visible, dit: b.texte });
    }
    const warns = journal.filter(l => l.indexOf('[v2] repli') >= 0).length;
    await nav.close();
    return { out, warns };
  };

  const n = await passe(false);
  dire('  marche nominale :');
  n.out.forEach(l => dire('    ' + l.id.padEnd(14) + l.fmt.padEnd(9) + 'rasteriser ×' + String(l.rast).padEnd(3)
    + ' · ' + l.n + ' visuel(s) · bandeau ' + (l.bandeau ? 'VISIBLE ⚠' : 'caché')));
  const c = await passe(true);
  dire('  les .woff2 répondent 404 :');
  c.out.forEach(l => dire('    ' + l.id.padEnd(14) + l.fmt.padEnd(9) + String(l.o).padStart(7) + ' o · bandeau '
    + (l.bandeau ? 'VISIBLE' : 'CACHÉ') + (l.dit ? '  « ' + l.dit + ' »' : '')));
  dire('    console.warn émis : ' + c.warns + '   (ils ne comptent pas : personne ne les lit)');

  verdict('A1 · le v2 peint les 6 thèmes, bandeau caché',
          n.out.every(l => l.rast > 0 && !l.bandeau && l.n > 0));
  /* ⚠️ NE PAS TRONQUER LE MESSAGE AVANT DE LE TESTER : une première version le
     coupait à 80 caractères et le critère lisait « HTT » au lieu de « HTTP 404 ».
     La sonde rougissait sur sa propre troncature. */
  verdict('A2 · la panne crie à l\'écran, la publication tient',
          c.out.every(l => l.bandeau && l.n > 0 && /HTTP 404/.test(l.dit) && /Publier/.test(l.dit)));
}

/* ══════════════════ SONDE B ══════════════════════════════════════════════════
   🔴 CE QUE CETTE SONDE MESURAIT D'ABORD ÉTAIT FAUX, et son épreuve au rouge
      l'a dit. Première version : « on retire pointer-events:none, le glissement
      doit mourir ». Il n'est PAS mort — Δfocal 0,5 dans les deux cas. Raison
      mesurée : les écouteurs vivent sur `#igPhoto` et les calques sont ses
      ENFANTS ; l'événement remonte, quelle que soit la cible.
      → LA GARANTIE PORTANTE EST LA PARENTÉ, pas le CSS (critère B1, et c'est
        elle qu'un remaniement peut rompre en posant le décor ailleurs).
        `pointer-events:none` achète autre chose, réel mais moindre : le calque
        reste TRANSPARENT au test de survol — curseur `grab`, pas de sélection
        sur la signature (critère B2, celui qui rougit quand on l'enlève). */
/* ⚠️⚠️ TOUS LES NOMS DE CALQUE, EN UN SEUL ENDROIT. Le 14/09, le thème photo est passé
   de `.v2-sign` à `.v2-rond`/`.v2-ess` — et ce sélecteur, resté à deux noms, a rendu une
   liste VIDE. B1 et B2 sont alors passées au VERT en ne vérifiant plus rien, et l'épreuve
   au rouge `--rouge-sans-garde` est devenue inerte avec elles : elle mettait
   `pointer-events:auto` sur zéro élément. D'où le critère B0 ci-dessous.
   ⚠️ `.v2-rond` Y RESTE ALORS QUE LE CERCLE A ÉTÉ RETIRÉ LE MÊME JOUR, et c'est
      volontaire : un nom de trop allonge une liste, un nom qui manque la vide. La
      sonde doit voir un calque périmé qui survivrait à un remaniement, pas l'ignorer. */
const SEL_CALQUES = '.v2-voile,.v2-sign,.v2-rond,.v2-ess';

async function sondeB() {
  dire('\n━━ B · LE CADRAGE AU DOIGT SURVIT AUX CALQUES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const { nav, p } = await ouvrirAdmin();
  await entrerStudio(p, 'sassy-photo', 'portrait');
  await remplir(p, 'sassy-photo');
  await ouvrirVolet(p); await dodo(700);
  await p.evaluate(() => document.getElementById('igPhoto').scrollIntoView({ block: 'center' }));
  await dodo(400);

  /* ⚠️ `SEL_CALQUES` est PASSÉ en argument, pas capturé : le corps de `p.evaluate`
     s'exécute dans la page, où les constantes de ce fichier n'existent pas. Une fermeture
     y lèverait un ReferenceError — et comme la sonde attrape ses erreurs plus haut, ça se
     serait vu comme une interruption, pas comme un rouge. */
  if (A('--rouge-sans-garde')) await p.evaluate((sel) =>
    document.querySelectorAll(sel).forEach(e => e.style.pointerEvents = 'auto'), SEL_CALQUES);
  /* Épreuve au rouge de B1. Déplacer les calques EXISTANTS hors de l'hôte ne
     suffit pas : `pose()` les recrée dans l'hôte au rendu suivant (il les
     cherche par `hote.querySelector`). On simule donc la régression qu'on veut
     pouvoir attraper — un décor posé À CÔTÉ de l'hôte, couvrant le cadre et
     testable au survol. */
  if (A('--rouge-hors-hote')) await p.evaluate(() => {
    const r = document.getElementById('igPhoto').getBoundingClientRect();
    const faux = document.createElement('div');
    faux.className = 'v2-faux-decor';
    faux.style.cssText = 'position:fixed;z-index:999;pointer-events:auto;left:' + r.x + 'px;top:' + r.y
                       + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
    document.body.appendChild(faux);
  });

  const e = await p.evaluate((sel) => {
    const h = document.getElementById('igPhoto'), inner = document.getElementById('igPhotoInner');
    const pp = studioPhotos[studioPhotoIdx], r = h.getBoundingClientRect();
    const s = Math.max(inner.clientWidth / pp.bitmap.width, inner.clientHeight / pp.bitmap.height);
    return { r: { x: r.x, y: r.y, w: r.width, h: r.height },
             jeuX: +(pp.bitmap.width * s - inner.clientWidth).toFixed(1),
             jeuY: +(pp.bitmap.height * s - inner.clientHeight).toFixed(1),
             focal: { ...pp.focal },
             calques: [...h.querySelectorAll(sel)].map(x => {
               const b = x.getBoundingClientRect();
               return { cls: x.className, pe: getComputedStyle(x).pointerEvents, dansHote: h.contains(x),
                        z: +getComputedStyle(x).zIndex || 0,
                        cx: b.x + b.width / 2, cy: b.y + b.height / 2,
                        aire: +(b.width * b.height).toFixed(0) };
             }) };
  }, SEL_CALQUES);
  e.calques.forEach(c => dire('    calque ' + c.cls.padEnd(9) + 'pointer-events:' + c.pe.padEnd(5)
    + ' enfant de #igPhoto : ' + c.dansHote + '  z-index ' + c.z));
  dire('    jeu de la photo dans le cadre : ' + e.jeuX + ' px en X, ' + e.jeuY + ' px en Y');

  /* ⚠️⚠️ LE DOIGT SE POSE SUR UN CALQUE RÉEL, ET C'EST LA SECONDE FAUTE DU 14/09.
     Il se posait à 85 % de la hauteur, « sur le voile » — vrai du temps où tout thème
     photo avait un voile plein bas de cadre. Le thème photo n'en a plus, et son médaillon
     est entre 41 et 59 % : le doigt tombait sur la photo NUE. B2 passait donc au vert en
     mesurant que le vide est transparent, ce qui est vrai partout et ne dit rien.
     Le point est maintenant CALCULÉ : le centre du calque le plus haut (plus grand
     z-index, puis plus grande aire). Si le décor bouge, le doigt le suit. */
  const cible = e.calques.slice().sort((a, b) => (b.z - a.z) || (b.aire - a.aire))[0];
  const cx = cible ? cible.cx : e.r.x + e.r.w / 2;
  const cy = cible ? cible.cy : e.r.y + e.r.h * 0.85;
  dire('    le doigt se pose sur : ' + (cible ? cible.cls + ' (z ' + cible.z + ')' : 'AUCUN CALQUE'));
  const survol = await p.evaluate((x, y) => {
    const el = document.elementFromPoint(x, y);
    return { cible: el ? (el.id || el.className || el.tagName) : '(rien)',
             curseur: el ? getComputedStyle(el).cursor : '?' };
  }, cx, cy);
  dire('    sous le doigt : ' + survol.cible + '   curseur : ' + survol.curseur);

  const axe = e.jeuY > 2 ? 'Y' : 'X';
  await p.mouse.move(cx, cy); await p.mouse.down();
  for (let i = 1; i <= 6; i++) { await p.mouse.move(axe === 'Y' ? cx : cx - i * 10, axe === 'Y' ? cy - i * 10 : cy); await dodo(30); }
  await p.mouse.up(); await dodo(300);

  const ap = await p.evaluate(() => ({ focal: { ...studioPhotos[studioPhotoIdx].focal },
                                       bouge: typeof _photoDragMoved !== 'undefined' ? _photoDragMoved : '?' }));
  const d = axe === 'Y' ? Math.abs(ap.focal.y - e.focal.y) : Math.abs(ap.focal.x - e.focal.x);
  dire('    focal ' + JSON.stringify(e.focal) + ' → ' + JSON.stringify(ap.focal) + '   Δ' + axe + ' = ' + d.toFixed(4));
  await nav.close();
  /* ⚠️⚠️ B0 EXISTE PARCE QUE B1 ET B2 SE SONT TUES. Elles mesurent la survie du
     glissement MALGRÉ les calques ; sans calque, elles mesurent la survie du glissement
     tout court — vrai, mais hors sujet, et vert. Le 14/09 la liste est devenue vide et
     les deux ont verdi sur rien.
     Une sonde qui n'a rien à vérifier doit le DIRE. B0 est ce dire : au moins un calque
     de décor, et tous enfants de l'hôte. C'est aussi le critère qui porte la garantie de
     B1 — la PARENTÉ, celle qu'un remaniement rompt en posant le décor ailleurs. */
  const n = e.calques.length;
  verdict('B0 · il y a bien un décor à éprouver (' + n + ' calque(s))',
          n > 0 && e.calques.every(c => c.dansHote));
  verdict('B1 · le geste aboutit (la parenté tient)', d > 0.01 && ap.bouge === true && n > 0);
  verdict('B2 · le calque est transparent au survol',
          survol.cible === 'igPhotoInner' && survol.curseur === 'grab'
          && n > 0 && e.calques.every(c => c.pe === 'none'));
}

/* ══════════════════ SONDE C ══════════════════════════════════════════════════ */
async function sondeC() {
  dire('\n━━ C · LA GARANTIE DU POINT 23, APRÈS BRANCHEMENT ━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const patch = j => {
    const n = JSON.parse(JSON.stringify(j.find(t => t.id === 'sassy-photo')));
    n.id = 'sassy-sans-moteur'; n.nom = 'Thème sans moteur';
    if (A('--rouge-avec-template')) n.template = 'photo'; else delete n.template;
    /* ⚠️ EN TÊTE DE LISTE, ET CE N'EST PAS UN DÉTAIL. Placé en dernier, le thème
       sans moteur n'est jamais le premier sélectionné : `renderCustomThemes()`
       auto-choisit le thème n° 1 (`sassy-carte`, qui A un template), son aperçu
       se rasterise, et la couverture comptait CE rendu-là. La sonde annonçait
       « le moteur s'est réveillé » en montrant les fonctions d'un AUTRE thème —
       un compte juste sous un mauvais nom.
       En tête, rien qui porte un template n'est touché de tout le parcours, et
       la demande des .woff2 redevient un critère valide : les polices sont mises
       en cache dans `_assets` dès le premier rendu v2 ; après lui, l'absence de
       requête ne prouverait plus rien. */
    return [n].concat(j);
  };
  const { nav, p } = await ouvrirAdmin({ themesPatch: patch });
  const sess = await couvertureOn(p);
  const e = await entrerStudio(p, 'sassy-sans-moteur', 'story');
  dire('    thème : ' + e.theme + '   template : ' + (e.template || '— AUCUN') + '   kind : ' + e.kind);
  await remplir(p, 'sassy-sans-moteur');
  await ouvrirVolet(p); await dodo(700);
  await p.evaluate(() => { const f = document.querySelector('#fmtRow .fmt[data-fmt="portrait"]'); if (f) f.click(); });
  await dodo(500);
  const v = await p.evaluate(() => bakeAllVisuals().then(x => x.map(u => (u || '').length)));
  await dodo(600);
  const fns = await couverture(sess);
  const tour = Object.entries(fns).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
  dire('    visuels produits : ' + JSON.stringify(v) + '  (par le canvas)');
  dire('    fonctions de moteur-v2.js appelées :');
  (tour.length ? tour : [['(aucune)', '']]).forEach(([n, c]) => dire('      ' + n.padEnd(22) + (c === '' ? '' : '× ' + c)));
  dire('    .woff2 demandés : ' + (p.__fontes.length ? p.__fontes.join(', ') : 'AUCUN'));
  const PEINTRES = ['rasteriser', 'chargerAssets', 'listeAssets', 'socleCSS', 'xml', 'css', 'corps', 'pose', 'px'];
  const fuites = PEINTRES.filter(n => (fns[n] || 0) > 0);
  await nav.close();
  dire('    peintres réveillés : ' + (fuites.length ? fuites.join(', ') : 'aucun'));
  verdict('C · un thème sans template n\'exécute aucune ligne', fuites.length === 0 && p.__fontes.length === 0);
}

/* ⚠️⚠️ LE SEUIL, ET POURQUOI CELUI-LÀ. L'écart mesuré entre le calque et le template,
   moteur sain, vaut 0,00 pt en portrait et 0,05 pt en story — ces 0,05 sont un CHOIX
   assumé : la taille du cercle reste en pixels pour qu'il reste un cercle, alors que le
   cadre de l'aperçu en story fait 425 px là où 9:16 en veut 423,1.
   La divergence que cette sonde doit attraper valait 34 POINTS (logotype à 93,6 % contre
   cercle à 59,7 %). 0,25 laisse donc 5× la marge du bruit connu et reste 136× sous la
   faute à détecter. Un seuil n'est pas une tolérance qu'on desserre quand ça rougit :
   c'est la distance entre le bruit mesuré et la faute mesurée. */
const SEUIL_GEO = 0.25;

/** Le recouvrement vertical de deux boîtes, en points de pourcentage du cadre. 0 quand
    elles ne se touchent pas. */
function recouvrement(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.min(a.bas, b.bas) - Math.max(a.haut, b.haut));
}

/** L'écart maximum, en points de pourcentage, entre les boîtes de l'aperçu et celles que
    le template annonce. Rend Infinity si un calque attendu manque — un calque absent est
    un écart infini, pas un écart nul. */
function ecartMax(mesure, ref) {
  let m = 0;
  for (const cle of ['ess']) {
    if (!mesure[cle] || !ref[cle]) return Infinity;
    for (const bord of ['haut', 'bas', 'g', 'd']) {
      m = Math.max(m, Math.abs(mesure[cle][bord] - ref[cle][bord]));
    }
  }
  return m;
}

/* ⚠️⚠️ LE SEUIL DE D4, ET POURQUOI CELUI-LÀ. Écart mesuré entre l'aperçu et l'export,
   moteur sain, sur les 4 templates typo × 3 formats : 0,05 à 0,46 point. C'est du bruit de
   rasterisation — antialiasing et arrondis d'une échelle à l'autre — et carré/portrait,
   jamais touchés par le défaut, sont dans la même fourchette.
   La faute que D4 doit attraper valait 19,53 points. 1,00 laisse donc un peu plus du double
   du bruit constaté et reste 19× sous la faute. Un seuil est la distance entre le bruit
   mesuré et la faute mesurée, jamais une tolérance qu'on desserre quand ça rougit. */
const SEUIL_BITMAP = 1.00;

/* Le code posé DANS LA PAGE pour D4 : un lecteur de bandes, et un mouchard sur le moteur.

   `__bandes(src)` rend les BANDES DE CONTENU d'un bitmap — les suites de lignes qui portent
   autre chose que la couleur du premier pixel (le fond d'aplat des templates typo) — en
   POURCENTAGES de la hauteur. C'est la seule unité dans laquelle deux rendus d'échelles
   différentes sont comparables.

   ⚠️⚠️ LE MOUCHARD EST CE QUI REND CETTE SONDE HONNÊTE. On ne RECOPIE pas les largeurs de
      rendu : l'aperçu est à 540, codé en dur dans la fonction d'aperçu du master, et
      l'export lit CLIENT_TOKENS.render.canvasW. Deux nombres écrits à deux endroits, donc
      deux nombres qui peuvent bouger séparément — et une sonde qui les recopierait
      mesurerait son propre accord avec elle-même. Elle ÉCOUTE donc le moteur et apprend de
      lui la largeur ET la slide que l'admin vient d'employer, puis rejoue l'export avec
      CETTE slide. Si les largeurs changent un jour, la sonde suit sans être modifiée.
   ⚠️ Le mouchard n'ajoute rien au moteur : il enveloppe la fabrique, côté test seulement. */
const CODE_D4 = [
  '(function(){',
  '  window.__bandes = function (src) {',
  '    return new Promise(function (ok) {',
  '      var im = new Image();',
  '      im.onload = function () {',
  '        var H = im.naturalHeight, w = im.naturalWidth;',
  '        var cv = document.createElement("canvas"); cv.width = w; cv.height = H;',
  '        var cx = cv.getContext("2d"); cx.drawImage(im, 0, 0);',
  '        var d = cx.getImageData(0, 0, w, H).data;',
  '        var f = [d[0], d[1], d[2]];',
  '        var b = [], deb = null;',
  '        for (var y = 0; y < H; y++) {',
  '          var n = 0;',
  '          for (var x = 0; x < w; x += 2) {',
  '            var o = (y * w + x) * 4;',
  '            if (Math.abs(d[o]-f[0]) + Math.abs(d[o+1]-f[1]) + Math.abs(d[o+2]-f[2]) > 30) n++;',
  '          }',
  '          if (n > 0 && deb === null) deb = y;',
  '          else if (n === 0 && deb !== null) { if (y - deb > 2) b.push([deb, y]); deb = null; }',
  '        }',
  '        if (deb !== null) b.push([deb, H]);',
  '        ok({ H: H, W: w, bandes: b.map(function (p) {',
  '          return [ +(100*p[0]/H).toFixed(2), +(100*p[1]/H).toFixed(2) ]; }) });',
  '      };',
  '      im.onerror = function () { ok(null); };',
  '      im.src = src;',
  '    });',
  '  };',
  '  var vrai = window.MOTEUR_V2.rasteriseur;',
  '  window.__appels = [];',
  '  window.MOTEUR_V2.rasteriseur = function (theme) {',
  '    var f = vrai(theme);',
  '    if (!f) return f;',
  '    return function (W, hab, slide, fmt) {',
  '      window.__appels.push({ W: W, fmt: fmt, slide: slide, hab: hab });',
  '      return f(W, hab, slide, fmt);',
  '    };',
  '  };',
  '})()'
].join('\n');

/** D4 — LE BITMAP DE L'APERÇU CONTRE CELUI DE L'EXPORT, pour les quatre templates typo
    dans les formats QUE L'ADMIN OFFRE — portrait et story, soit 8 cas ; `#fmtRow` ne porte
    pas de bouton carré. Elle parcourt quand même les trois pour que l'écart entre ce que
    `themes.json` déclare et ce que l'interface propose reste VISIBLE dans la sortie.
    Ouvre son propre admin : il lui faut un mouchard posé AVANT que l'admin n'appelle le
    moteur, et un studio propre à chaque thème.

    ⚠️ LE CONTENU EMPLOYÉ EST CELUI QUE L'ADMIN PRÉREMPLIT — on ne fabrique rien. La leçon
       du contenu « hostile » inatteignable vaut ici aussi : un rendu comparé sur des
       données que l'interface ne produit pas ne prouve rien sur ce que le client publie.
       `remplir()` s'en charge pour infos/annonce ; carte et dujour arrivent déjà peuplés. */
async function mesurerD4() {
  const { nav, p } = await ouvrirAdmin();
  await p.evaluate(CODE_D4);
  const lignes = [];
  for (const id of ['sassy-carte', 'sassy-dujour', 'sassy-infos', 'sassy-annonce']) {
    for (const fmt of ['carre', 'portrait', 'story']) {
      const e = await entrerStudio(p, id, fmt);
      /* ⚠️ « NON OFFERT PAR L'ADMIN », PAS « ABSENT DU THÈME » — le premier libellé de cette
         ligne disait le second et c'était faux : `themes.json` déclare `carre` pour les SIX
         thèmes, mais `#fmtRow` ne porte que deux boutons, `portrait` et `story`. Aucun
         client ne peut produire un carré. C'est ce qui fait du rouge `carre · sassy-dujour`
         un rouge sur format MORT, et cette fois c'est mesuré et non supposé.
         ⚠️ Et D4 ne cherche pas à le tester quand même : la leçon du contenu « hostile »
            inatteignable vaut pour les formats. Comparer deux rendus d'un format que
            l'interface n'offre pas ne dit rien de ce que le client publie. */
      if (!e || !e.ok || e.fmt !== fmt) { lignes.push({ id, fmt, nonOffert: true }); continue; }
      await remplir(p, id);
      await ouvrirVolet(p); await dodo(700);
      /* ⚠️ IL FAUT DÉCLENCHER UN RENDU, et c'est ce qui manquait au premier jet : ouvrir
         le volet ne repeint pas l'aperçu typo — `paintCartePreview` part de `renderStudio`.
         Sans ce coup de pouce, D4 rougissait en disant « le moteur n'a pas été appelé »,
         c'est-à-dire qu'elle mesurait son propre défaut de pilotage et pas le rendu. La
         sonde D1 juste au-dessus fait exactement ce geste, pour la même raison. */
      await p.evaluate(() => { window.__appels = [];
        if (typeof renderStudio === 'function') renderStudio(); });
      await dodo(1400);
      const r = await p.evaluate(async () => {
        const cv = document.getElementById('igCarteCv');
        const a = window.__appels;
        if (!cv || !a.length) return { rate: !cv ? 'aucun canvas d\'aperçu' : 'le moteur n\'a pas été appelé' };
        /* Le DERNIER appel est celui qui a peint le canvas visible. On en reprend la slide
           et le gabarit pour rejouer l'export : même contenu, autre échelle. */
        const d = a[a.length - 1];
        const W = window.CLIENT_TOKENS.render.canvasW;
        const bAp = await window.__bandes(cv.toDataURL('image/jpeg', 0.92));
        const u = await window.MOTEUR_V2._interne.rasteriser(
          window.MOTEUR_V2._interne.TEMPLATES[currentCustomTheme.template], W, d.hab, d.slide, d.fmt);
        const bEx = await window.__bandes(u);
        return { wAp: d.W, wEx: W, fmtAp: d.fmt, ap: bAp, ex: bEx };
      });
      if (r.rate) { lignes.push({ id, fmt, rate: r.rate, ok: false }); continue; }
      const n = Math.min(r.ap.bandes.length, r.ex.bandes.length);
      let m = 0;
      for (let i = 0; i < n; i++) m = Math.max(m,
        Math.abs(r.ap.bandes[i][0] - r.ex.bandes[i][0]),
        Math.abs(r.ap.bandes[i][1] - r.ex.bandes[i][1]));
      const memeCompte = r.ap.bandes.length === r.ex.bandes.length;
      lignes.push({ id, fmt, wAp: r.wAp, wEx: r.wEx, hAp: r.ap.H, hEx: r.ex.H,
        nAp: r.ap.bandes.length, nEx: r.ex.bandes.length, ecart: +m.toFixed(2),
        dernierAp: r.ap.bandes[r.ap.bandes.length - 1] || null,
        dernierEx: r.ex.bandes[r.ex.bandes.length - 1] || null,
        /* ⚠️ LE COMPTE DE BANDES COMPTE AUTANT QUE L'ÉCART. Le symptôme le plus grave du
           14/09 n'était pas un décalage : c'était le LOGO ABSENT de l'aperçu. Un élément
           qui disparaît ne produit aucun écart de position — il produit une bande de
           moins. Comparer les écarts seuls aurait manqué le pire. */
        ok: memeCompte && m <= SEUIL_BITMAP });
    }
  }
  await nav.close();
  dire('  aperçu (canvas de l\'admin) contre export (rejoué avec LA MÊME slide) :');
  for (const l of lignes) {
    if (l.nonOffert) { dire('    · ' + (l.id + ' · ' + l.fmt).padEnd(24)
      + 'non offert par l\'admin (aucun bouton #fmtRow) — hors périmètre'); continue; }
    if (l.rate)   { dire('    ' + (l.id + ' · ' + l.fmt).padEnd(26) + '✗ ' + l.rate); continue; }
    dire('    ' + (l.ok ? '✓ ' : '✗ ') + (l.id + ' · ' + l.fmt).padEnd(24)
      + l.wAp + '×' + l.hAp + ' contre ' + l.wEx + '×' + l.hEx
      + '   bandes ' + l.nAp + '/' + l.nEx
      + '   écart max ' + l.ecart.toFixed(2) + ' pt (seuil ' + SEUIL_BITMAP.toFixed(2) + ')');
    if (!l.ok && l.nAp !== l.nEx)
      dire('      '.padEnd(26) + '  ⚠ PAS LE MÊME NOMBRE DE BANDES : un élément manque d\'un côté'
         + '   dernière bande  aperçu ' + (l.dernierAp ? l.dernierAp.join(' → ') : '—')
         + '   export ' + (l.dernierEx ? l.dernierEx.join(' → ') : '—'));
  }
  return lignes;
}

/* ══════════════════ SONDE D ══════════════════════════════════════════════════ */
async function sondeD() {
  dire('\n━━ D · APERÇU == EXPORT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const patch = j => {
    const n = JSON.parse(JSON.stringify(j.find(t => t.id === 'sassy-photo')));
    n.id = 'sassy-sans-moteur'; n.nom = 'Thème sans moteur'; delete n.template;
    return j.concat([n]);
  };
  const { nav, p } = await ouvrirAdmin({ themesPatch: patch,
    avantChargement: A('--rouge-sans-moteur') ? () => {
      Object.defineProperty(window, 'MOTEUR_V2', { get: () => undefined, set: () => {}, configurable: true });
    } : undefined });
  const sess = await couvertureOn(p);

  const typo = [];
  for (const [id, champ, texte] of [['sassy-carte', null, null], ['sassy-dujour', null, null],
                                    ['sassy-infos', 'infosText', 'Ouvert du mardi au samedi.'],
                                    ['sassy-annonce', 'infosText', 'Soirée dégustation vendredi.']]) {
    await entrerStudio(p, id, 'portrait');
    await ouvrirVolet(p); await dodo(500);
    await couverture(sess);
    if (champ) await p.evaluate((c, t) => { const el = document.getElementById(c); el.value = t; el.dispatchEvent(new Event('input', { bubbles: true })); }, champ, texte);
    else await p.evaluate(() => { if (typeof renderStudio === 'function') renderStudio(); });
    await dodo(900);
    const rast = (await couverture(sess))['rasteriser'] || 0;
    const cv = await p.evaluate(() => { const c = document.getElementById('igCarteCv'); return c ? c.width + '×' + c.height : 'absent'; });
    typo.push({ id, rast });
    dire('    ' + id.padEnd(14) + 'rasteriser ×' + String(rast).padEnd(3) + ' · canvas d\'aperçu ' + cv);
  }

  const calques = [];
  /* ⚠️⚠️ `sassy-photo` EST ÉPROUVÉ DANS LES DEUX FORMATS, ET C'EST INDISPENSABLE. Ce
     parcours ne connaissait que `portrait` — or `ZONE_SURE.portrait` vaut 0 en bas et
     `sassy-photo` ne déclare sa `zoneTexte` qu'en STORY. Les deux garanties ajoutées le
     14/09 — « le signe tient dans la zone sûre » et « il cède la place au texte du
     client » — étaient donc mesurées là où elles ne peuvent PAS échouer : vertes, et
     vides. C'est le motif « une sonde qui n'a rien à vérifier », pour la troisième fois
     de la journée ; cette fois il vient du FORMAT choisi, pas du sélecteur. */
  for (const [id, fmt] of [['sassy-photo', 'portrait'], ['sassy-photo', 'story'],
                           ['sassy-event', 'portrait'], ['sassy-sans-moteur', 'portrait']]) {
    await entrerStudio(p, id, fmt);
    await remplir(p, id);
    await ouvrirVolet(p); await dodo(700);
    const r = await p.evaluate(() => {
      const h = document.getElementById('igHabillage');
      const hote = document.getElementById('igPhoto');
      const hr = hote.getBoundingClientRect();
      /* Chaque calque, en POURCENTAGES du cadre : la seule unité dans laquelle l'aperçu
         et le template sont comparables sans supposer une échelle. */
      const boite = function (sel) {
        const el = document.querySelector(sel); if (!el) return null;
        const r = el.getBoundingClientRect();
        return { haut: +(100 * (r.top - hr.top) / hr.height).toFixed(2),
                 bas:  +(100 * (r.bottom - hr.top) / hr.height).toFixed(2),
                 g:    +(100 * (r.left - hr.left) / hr.width).toFixed(2),
                 d:    +(100 * (r.right - hr.left) / hr.width).toFixed(2) };
      };
      /* ⚠️ LA RÉFÉRENCE VIENT DU MOTEUR, PAS D'UN CALCUL RECOPIÉ ICI. `medaillonGeo` est
         la source unique que le template ET l'aperçu lisent ; la sonde la lit aussi et
         compare. Une sonde qui refait le calcul ne mesurerait que son propre accord
         avec elle-même. La hauteur vient du PNG de gabarit, comme dans `rasteriser`. */
      let ref = null;
      const I = window.MOTEUR_V2 && window.MOTEUR_V2._interne;
      if (I && I.signeGeo && h.naturalWidth) {
        const W = 1080, H = Math.round(1080 * h.naturalHeight / h.naturalWidth);
        const f = (currentCustomTheme.formats || {})[currentFmt] || {};
        const t = document.querySelector('.ig-text');
        const vu = !!(t && getComputedStyle(t).display !== 'none');
        const Z = I.ZONE_SURE[currentFmt] || I.ZONE_SURE.portrait;
        const g = I.signeGeo(W, H, Z, vu ? (f.zoneTexte || null) : null);
        ref = { ess: { haut: +(100 * g.haut / H).toFixed(2), bas: +(100 * (g.haut + g.h) / H).toFixed(2),
                       g: +(100 * g.gauche / W).toFixed(2), d: +(100 * (g.gauche + g.w) / W).toFixed(2) },
                /* ⚠️ Le bas de la ZONE SÛRE, pour que D2 puisse dire si le signe tombe
                   dans la bande qu'Instagram recouvre — c'est le défaut trouvé le 14/09,
                   et une fois trouvé il doit être surveillé. */
                limiteSure: +(100 * (H - Z.bas) / H).toFixed(2),
                texteVu: vu };
      }
      /* La bande de texte du client, si elle est peinte : c'est l'autre moitié du
         conflit que D2 doit voir. */
      const t = document.querySelector('.ig-text');
      const zTexte = (t && getComputedStyle(t).display !== 'none') ? boite('.ig-text') : null;
      return { hab: getComputedStyle(h).display, drapeau: h.dataset.v2Masque || '—',
               voile: !!document.querySelector('.v2-voile'), sign: !!document.querySelector('.v2-sign'),
               rond: !!document.querySelector('.v2-rond'), ess: boite('.v2-ess'),
               zTexte: zTexte, ref: ref };
    });
    calques.push({ id, fmt, ...r });
    dire('    ' + (id + ' · ' + fmt).padEnd(26) + '#igHabillage display:' + r.hab.padEnd(6) + ' drapeau:' + String(r.drapeau).padEnd(3)
       + ' voile:' + r.voile + ' signe:' + !!r.ess + ' cercle:' + r.rond + ' signature:' + r.sign);
    if (r.ess && r.ref) {
      const ec = ecartMax(r, r.ref);
      dire('      '.padEnd(26) + '  le S  calque ' + r.ess.haut + ' → ' + r.ess.bas
         + '   template ' + r.ref.ess.haut + ' → ' + r.ref.ess.bas
         + '   écart max ' + ec.toFixed(2) + ' pt (seuil ' + SEUIL_GEO + ')');
      dire('      '.padEnd(26) + '  bas de la zone sûre ' + r.ref.limiteSure + ' %'
         + '   le S finit à ' + r.ess.bas + ' %  → '
         + (r.ess.bas <= r.ref.limiteSure ? 'DANS la zone sûre' : 'SOUS l\'interface d\'Instagram'));
      if (r.zTexte) dire('      '.padEnd(26) + '  texte du client ' + r.zTexte.haut + ' → ' + r.zTexte.bas
         + ' %   recouvrement avec le S : ' + recouvrement(r.ess, r.zTexte).toFixed(2) + ' pt');
    }
  }

  /* ⚠️ ÉPREUVE AU ROUGE DE D3 — le premier essai était INOPÉRANT : il faisait
     `window.v2ApercuGen = undefined`, or `let v2ApercuGen` en portée globale
     n'est pas une propriété de `window` (le même piège que plus haut). Le garde
     restait intact et l'épreuve « passait » sans rien avoir désarmé. Ce qui EST
     une propriété de `window`, c'est une DÉCLARATION DE FONCTION : on remplace
     donc `apercuV2Canvas` par la même, privée de son compteur. */
  if (A('--rouge-sans-compteur')) await p.evaluate(() => {
    window.apercuV2Canvas = function (theme, cv, hab, slide, fmt) {
      const r = v2De(theme);
      if (!r) return Promise.resolve(false);
      return r(540, hab, slide, fmt).then(u => {
        if (!u) return false;
        return new Promise(res => {
          const im = new Image();
          im.onload = () => { cv.width = im.naturalWidth; cv.height = im.naturalHeight;
                              cv.getContext('2d').drawImage(im, 0, 0); res(true); };
          im.onerror = () => res(false);
          im.src = u;
        });
      }).catch(() => false);
    };
  });

  await entrerStudio(p, 'sassy-infos', 'portrait');
  await ouvrirVolet(p); await dodo(500);
  /* On RALENTIT le rendu du texte périmé pour qu'il arrive APRÈS le récent :
     c'est la course réelle (un rendu lancé sur « Ouv » qui revient après celui
     de « Ouvert… »), forcée au lieu d'être espérée. */
  const emp = await p.evaluate(async () => {
    if (!window.MOTEUR_V2) return { saute: true };
    const attendre = ms => new Promise(r => setTimeout(r, ms));
    const el = document.getElementById('infosText');
    const hash = () => { const c = document.getElementById('igCarteCv'); if (!c) return 'aucun';
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let h = 0; for (let i = 0; i < d.length; i += 997) h = (h * 31 + d[i]) | 0; return String(h); };
    const vrai = MOTEUR_V2.rasteriseur;
    MOTEUR_V2.rasteriseur = function (t) {
      const f = vrai.call(MOTEUR_V2, t);
      if (!f) return f;
      return function (W, hab, slide, fmt) {
        const lent = slide && String(slide.texte || '').indexOf('PERIME') >= 0;
        return f(W, hab, slide, fmt).then(u => lent ? attendre(1400).then(() => u) : u);
      };
    };
    const pose = t => { el.value = t; el.dispatchEvent(new Event('input', { bubbles: true })); };
    pose('RECENT seul'); await attendre(1800); const hRecent = hash();
    pose('PERIME lent'); await attendre(60); pose('RECENT seul'); await attendre(2600);
    return { hRecent, hFinal: hash() };
  });
  if (!emp.saute) dire('    empreinte du rendu récent seul : ' + emp.hRecent + '   après la course : ' + emp.hFinal);
  await nav.close();

  const photo = calques.filter(c => c.id !== 'sassy-sans-moteur');
  const sans = calques.find(c => c.id === 'sassy-sans-moteur');
  const d4 = await mesurerD4();
  verdict('D1 · l\'aperçu typo passe par le rasteriseur', typo.every(t => t.rast > 0));
  /* ⚠️ LES DEUX SENS COMPTENT. Le module masquait l'habillage par
     `removeProperty('display')` — or la feuille de l'admin déclare
     `.ig-habillage{display:none}` : retirer le style en ligne ne « rend pas la
     main », ça CACHE le PNG que `composeCustomPreview` vient de poser à `block`.
     Un thème sans template perdait son habillage, en silence. D'où le drapeau,
     et d'où le troisième cas testé ici. */
  /* ⚠️⚠️ LE DÉCOR ATTENDU N'EST PLUS LE MÊME POUR LES DEUX THÈMES PHOTO, ET CE CRITÈRE
     A DÛ ÊTRE RÉÉCRIT LE 14/09. Il exigeait un voile pour TOUT thème de type `photo` —
     c'était le contrat de M3/M4, quand `habillerApercuPhoto` branchait sur `theme.type`.
     Depuis que le thème photo n'a plus de voile (décision de DA : le logo crème se pose
     directement sur l'image), l'aperçu branche sur `theme.template`, et le critère doit
     dire la vérité PAR TEMPLATE :

       template `photo` → PAS de voile, une signature (le logo centré)
       template `event` → un voile, une signature      (inchangé, et son export
                          porte en plus une carte que l'aperçu ne dessine pas —
                          divergence connue, documentée au BACKLOG, autre chantier)
       sans template    → ni voile ni signature, et l'habillage RESTE visible

     ⚠️ Le critère n'a pas été ASSOUPLI, il a été rendu plus précis : il teste désormais
        trois contrats distincts au lieu d'un seul approximatif. C'est la règle du dépôt —
        quand une sonde rougit sur un cas légitime, on change ce qu'elle MESURE. */
  /* ⚠️⚠️ ET CE CRITÈRE A DÛ ÊTRE RENDU PLUS PRÉCIS UNE SECONDE FOIS, LE 14/09 AU SOIR.
     Il constatait qu'un élément EXISTE (`!!document.querySelector('.v2-sign')`), pas
     qu'il tombe au bon endroit. Le médaillon a été posé dans le template seul : l'aperçu
     a continué de peindre le logotype en bas (93,6 → 96,9 %) pendant que l'export peignait
     le cercle au milieu (59,7 → 72,1 %). Ce critère a rougi — mais PAR ACCIDENT, parce
     que le nom de classe avait changé de `.v2-sign` à `.v2-rond`/`.v2-ess`. En gardant le
     même nom et en laissant le calque en bas, il serait resté VERT sur une divergence de
     34 points. Une sonde qui vérifie un nom ne vérifie pas une mise en page.
     Il COMPARE donc maintenant la géométrie du calque à celle que le template annonce,
     bord par bord, en lisant la référence dans `medaillonGeo` — la source unique que les
     deux côtés lisent. Ce n'est pas un assouplissement : c'est l'énoncé de la section D,
     « aperçu == export », enfin mesuré pour le thème photo au lieu d'être supposé. */
  const attendu = {
    photo: { voile: false, sign: false, signe: true },   // le S seul, PAS le logotype
    event: { voile: true,  sign: true,  signe: false }  // inchangé (divergence connue au BACKLOG)
  };
  const d2 = photo.every(c => {
    const t = c.id === 'sassy-photo' ? 'photo' : 'event';
    const a = attendu[t];
    /* ⚠️ `!c.rond` VAUT POUR LES DEUX THÈMES : le cercle a été retiré le 14/09 et aucun
       template n'a le droit de le faire revenir. Un calque périmé qui survit à un
       remaniement, c'est ce que la sonde doit voir. */
    const base = c.hab === 'none' && c.drapeau === '1' && !c.rond
              && c.voile === a.voile && c.sign === a.sign && !!c.ess === a.signe;
    if (!base) return false;
    if (!a.signe) return true;
    /* ⚠️ PAS DE RÉFÉRENCE = ROUGE. Si `signeGeo` n'est pas exposée ou si le gabarit n'est
       pas décodé, la sonde n'a RIEN à comparer — et une sonde sans référence doit le
       dire, pas verdir. C'est la faute qu'on vient de corriger sur B. */
    if (!c.ref) return false;
    /* ⚠️ ET LE SIGNE DOIT TENIR DANS LA ZONE SÛRE. C'est le défaut trouvé le 14/09 :
       l'ancienne signature était posée à 59,4 px du bord, soit 190 px SOUS l'interface
       d'Instagram en story. Une fois mesuré, surveillé.
       ⚠️ ET IL NE DOIT PAS RECOUVRIR LE TEXTE DU CLIENT. `signeGeo` lui cède la place,
          mais cette cession est BORNÉE par la zone sûre : si une `zoneTexte` descend trop,
          le S se cale au plus bas et le conflit devient réel. Mesuré sur une bande
          injectée finissant à 90 % : 171,3 px de recouvrement. Ce cas n'existe pas dans le
          dépôt d'aujourd'hui — et c'est justement pour ça qu'il est surveillé plutôt que
          commenté. */
    return ecartMax(c, c.ref) <= SEUIL_GEO && c.ess.bas <= c.ref.limiteSure
        && recouvrement(c.ess, c.zTexte) === 0;
  }) && !!sans && sans.hab === 'block' && !sans.voile && !sans.sign
     && !sans.rond && !sans.ess;
  verdict('D2 · le décor tombe où le template l\'annonce, et dans la zone sûre', d2);
  if (emp.saute) dire('  · D3 · pas de rendu périmé affiché                     sans objet (aucun moteur)');
  else verdict('D3 · pas de rendu périmé affiché', emp.hFinal === emp.hRecent);
  /* ⚠️⚠️ D4 EXISTE PARCE QUE LA SECTION S'APPELAIT « APERÇU == EXPORT » SANS LE MESURER.
     Pour les quatre templates typo, D1 vérifiait seulement que le rasteriseur avait été
     APPELÉ — pas que les deux bitmaps disent la même chose. C'est ce trou qui a laissé
     vivre la divergence d'échelle du 14/09 : `ZONE_SURE` en pixels absolus, l'aperçu
     rendu à 540 et l'export à 1080, 19,53 points d'écart et le logo carrément absent de
     l'aperçu en story. Réintroduit, le défaut laissait le garde-fou à 9 verts sur 9.
     ⚠️ Un titre de section n'est pas une garantie. Celui-ci en est une maintenant. */
  /* ⚠️⚠️ UN CAS SAUTÉ NE COMPTE PAS COMME RÉUSSI, et le premier jet de ce verdict faisait
     l'inverse : les lignes « non offert » portaient `ok: true` et entraient dans le
     `every`. D4 aurait donc pu verdir en ne mesurant plus rien — le motif de la journée,
     pour la cinquième fois, cette fois écrit de ma main dans la sonde censée le corriger.
     Le verdict compte donc les cas RÉELLEMENT mesurés et exige le compte attendu : le jour
     où l'admin cesse d'offrir un format, D4 rougit au lieu de mesurer moins en silence. */
  const mesures = d4.filter(r => !r.nonOffert);
  const ATTENDU_D4 = 8;   // 4 templates typo × { portrait, story } — le carré n'est pas offert
  verdict('D4 · le bitmap de l\'aperçu == celui de l\'export (' + mesures.length + '/'
          + ATTENDU_D4 + ' cas mesurés)',
          mesures.length === ATTENDU_D4 && mesures.every(r => r.ok));
}

(async () => {
  dire('═══ ACCROCHES v2 — bistrot-sassy ' + '═'.repeat(42));
  const drapeaux = process.argv.filter(a => a.startsWith('--rouge'));
  if (drapeaux.length) dire('  ⚠ ÉPREUVE AU ROUGE : ' + drapeaux.join(' ') + '  (le ROUGE est le résultat attendu)');
  try {
    await sondeA(); await sondeB(); await sondeC(); await sondeD();
  } catch (e) {
    dire('\n✗ le test s\'est interrompu : ' + (e && e.message || e));
    dire('  (le site est-il servi ?  python3 -m http.server ' + PORT + ')');
    process.exit(2);
  }
  const rouges = T.filter(t => !t.ok);
  dire('\n' + '═'.repeat(76));
  dire('  ' + (T.length - rouges.length) + ' vert(s), ' + rouges.length + ' rouge(s) sur ' + T.length);
  rouges.forEach(r => dire('    ✗ ' + r.nom));
  dire('═'.repeat(76));
  process.exit(rouges.length ? 1 : 0);
})();
