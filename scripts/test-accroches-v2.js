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
   `pointer-events:auto` sur zéro élément. D'où le critère B0 ci-dessous. */
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

/** L'écart maximum, en points de pourcentage, entre les boîtes de l'aperçu et celles que
    le template annonce. Rend Infinity si un calque attendu manque — un calque absent est
    un écart infini, pas un écart nul. */
function ecartMax(mesure, ref) {
  let m = 0;
  for (const cle of ['rond', 'ess']) {
    if (!mesure[cle] || !ref[cle]) return Infinity;
    for (const bord of ['haut', 'bas', 'g', 'd']) {
      m = Math.max(m, Math.abs(mesure[cle][bord] - ref[cle][bord]));
    }
  }
  return m;
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
  for (const id of ['sassy-photo', 'sassy-event', 'sassy-sans-moteur']) {
    await entrerStudio(p, id, 'portrait');
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
      if (I && I.medaillonGeo && h.naturalWidth) {
        const W = 1080, H = Math.round(1080 * h.naturalHeight / h.naturalWidth);
        const f = (currentCustomTheme.formats || {})[currentFmt] || {};
        const t = document.querySelector('.ig-text');
        const vu = !!(t && getComputedStyle(t).display !== 'none');
        const g = I.medaillonGeo(W, H, vu ? (f.zoneTexte || null) : null);
        ref = { rond: { haut: +(100 * g.haut / H).toFixed(2), bas: +(100 * (g.haut + g.d) / H).toFixed(2),
                        g: +(100 * g.gauche / W).toFixed(2), d: +(100 * (g.gauche + g.d) / W).toFixed(2) },
                ess:  { haut: +(100 * g.sHaut / H).toFixed(2), bas: +(100 * (g.sHaut + g.sh) / H).toFixed(2),
                        g: +(100 * g.sGauche / W).toFixed(2), d: +(100 * (g.sGauche + g.sw) / W).toFixed(2) },
                texteVu: vu };
      }
      return { hab: getComputedStyle(h).display, drapeau: h.dataset.v2Masque || '—',
               voile: !!document.querySelector('.v2-voile'), sign: !!document.querySelector('.v2-sign'),
               rond: boite('.v2-rond'), ess: boite('.v2-ess'), ref: ref };
    });
    calques.push({ id, ...r });
    dire('    ' + id.padEnd(18) + '#igHabillage display:' + r.hab.padEnd(6) + ' drapeau:' + String(r.drapeau).padEnd(3)
       + ' voile:' + r.voile + ' medaillon:' + !!(r.rond && r.ess) + ' signature:' + r.sign);
    if (r.rond && r.ref) {
      const ec = ecartMax(r, r.ref);
      dire('      '.padEnd(18) + '  cercle calque ' + r.rond.haut + ' → ' + r.rond.bas
         + '   template ' + r.ref.rond.haut + ' → ' + r.ref.rond.bas
         + '   écart max ' + ec.toFixed(2) + ' pt (seuil ' + SEUIL_GEO + ')'
         + (r.ref.texteVu ? '   [texte affiché : le médaillon cède la place]' : ''));
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
    photo: { voile: false, sign: false, medaillon: true },   // le médaillon, PAS le logotype
    event: { voile: true,  sign: true,  medaillon: false }   // inchangé (divergence connue au BACKLOG)
  };
  const d2 = photo.every(c => {
    const t = c.id === 'sassy-photo' ? 'photo' : 'event';
    const a = attendu[t];
    const base = c.hab === 'none' && c.drapeau === '1'
              && c.voile === a.voile && c.sign === a.sign
              && !!(c.rond && c.ess) === a.medaillon;
    if (!base) return false;
    if (!a.medaillon) return true;
    /* ⚠️ PAS DE RÉFÉRENCE = ROUGE. Si `medaillonGeo` n'est pas exposée ou si le gabarit
       n'est pas décodé, la sonde n'a RIEN à comparer — et une sonde sans référence doit
       le dire, pas verdir. C'est la faute qu'on vient de corriger sur B. */
    if (!c.ref) return false;
    return ecartMax(c, c.ref) <= SEUIL_GEO;
  }) && !!sans && sans.hab === 'block' && !sans.voile && !sans.sign
     && !sans.rond && !sans.ess;
  verdict('D2 · le décor de l\'aperçu tombe où le template l\'annonce', d2);
  if (emp.saute) dire('  · D3 · pas de rendu périmé affiché                     sans objet (aucun moteur)');
  else verdict('D3 · pas de rendu périmé affiché', emp.hFinal === emp.hRecent);
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
