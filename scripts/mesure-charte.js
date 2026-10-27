#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   MESURE DE LA CHARTE DE L'APP — admin/charte.html (LELAB-DESIGN.md §1, §3)
   ═══════════════════════════════════════════════════════════════════════════
   1. CONTRASTE WCAG de chaque couple texte / fond RÉELLEMENT rendu, dans les deux chromies.
      Seuils : 4,5:1 (texte courant), 3:1 (≥ 24 px). Les seuils ne bougent pas ; une nuance qui
      échoue se corrige dans la nuance.
      ⚠️ LE FOND D'UN TEXTE N'EST PAS LE TOKEN SEUL. Sur le fond de l'app passent deux flous et le
         grain ; sur une surface (papier, à voir), le grain est posé PAR-DESSUS le texte. On retient le
         PIRE des cas composés (en sRGB, comme le navigateur fusionne) :
           fond nu · + flou violet au cœur · + flou jaune au cœur · + les deux (seulement si leurs
           disques se superposent, mesuré en 0.) · chacun + le grain au 1er ET au 99e centile de la tuile
         et, sur une surface grainée, ces deux valeurs posées sur le texte, sur la surface, ou sur les
         deux. Le cœur d'un flou est pris à son opacité pleine : c'est une borne.
      ⚠️ LE GRAIN SE JUGE AU 1er / 99e CENTILE, PLUS AU PIXEL EXTRÊME (décidé le 26/10). Le bruit est
         gaussien et borné à 40–215 : les pixels aux bornes sont 28 sur 16 384, soit 0,17 % de la
         tuile — des points isolés, à 2 px physiques, jamais une plage. 0,17 % des pixels ne font pas
         un fond de texte : juger le contraste sur eux, c'était dimensionner toute la palette sur des
         poussières. Le centile garde 98 % de la tuile dans la mesure et écarte les poussières.
      ⚠️ TOUT EST LU DANS LA PAGE : tuile (background-image calculé), opacité, mode de fusion, et les
         pixels de la tuile eux-mêmes (canvas). Changer le CSS change la mesure, sans toucher ce script.
   1bis. LUMINANCE MOYENNE DES SURFACES : avec grain, à ±1,5 % au plus de la même surface sans grain
      (moyenne sur TOUS les pixels de la tuile). Un grain doit texturer, pas éclaircir ni salir.
   2. LES DEUX COPIES DU BLOC JOUR (attribut / prefers-color-scheme) doivent donner les mêmes tokens.
   3. LES POLICES : Instrument chargées depuis le dépôt, aucune requête Google Fonts.
   4. LES POIDS : les deux tuiles de grain (≤ 20 Ko chacune), chaque woff2, et le total transféré par la page (cache coupé).

   USAGE :  python3 -m http.server 8080   puis   node scripts/mesure-charte.js 8080
            node scripts/mesure-charte.js 8080 /admin/ "#screen-monsite, .barre"   ← la coquille de l'admin
            … "#screen-monsite, .barre" "document.querySelector('.lelab-mini-toggle').click()"   ← après un geste
      Page et zone en paramètres : la page de contrôle par défaut, ou l'admin (bypass dev localhost).
      Seuls les textes VISIBLES de la zone sont mesurés (les écrans masqués de l'admin sont dans le DOM).
   PRÉREQUIS : puppeteer-core + un Chrome installé.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const PORT   = process.argv[2] || '8080';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PAGE   = process.argv[3] || '/admin/charte.html';
const ZONE   = process.argv[4] || 'main';
const GESTE  = process.argv[5] || '';   // JS joué dans la page avant la mesure (ex. basculer un interrupteur)
const URL    = `http://localhost:${PORT}${PAGE}`;
const RACINE = path.join(__dirname, '..');

let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e){ console.error('puppeteer-core manquant → npm install'); process.exit(2); }

// ── Couleur et contraste (WCAG 2.x, sRGB 0–1) ─────────────────────────────────
const rgb = s => { const m = s.match(/[\d.]+/g).map(Number); return { c: m.slice(0, 3).map(v => v / 255), a: m[3] === undefined ? 1 : m[3] }; };
const sur = (base, coul, a) => base.map((b, i) => b * (1 - a) + coul[i] * a);              // coul posée à l'opacité a
const lum = c => { const l = c.map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
/* Les modes de fusion employés (W3C Compositing 1), canal par canal, puis l'opacité du calque. */
const MODES = {
  'normal':     (cb, cs) => cs,
  'multiply':   (cb, cs) => cb * cs,
  'screen':     (cb, cs) => cb + cs - cb * cs,
  'soft-light': (cb, cs) => cs <= 0.5 ? cb - (1 - 2 * cs) * cb * (1 - cb)
                                      : cb + (2 * cs - 1) * ((cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb)) - cb),
};
const fondu = (c, g, grain) => c.map(cb => cb * (1 - grain.a) + MODES[grain.mode](cb, g) * grain.a);
const hex = c => '#' + c.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  const LARGEUR = +(process.env.LARGEUR || 390);   // LARGEUR=1280 : la mise en page desktop (cartes, tickets)
  await p.setViewport({ width: LARGEUR, height: LARGEUR > 960 ? 900 : 844, isMobile: LARGEUR <= 960, deviceScaleFactor: 2 });
  const cdp = await p.target().createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const urls = {}, poids = {};
  cdp.on('Network.requestWillBeSent', e => { urls[e.requestId] = e.request.url; });
  cdp.on('Network.loadingFinished', e => { poids[e.requestId] = e.encodedDataLength; });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await p.goto(URL, { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.fonts.ready);
  /* L'admin écrit sa phrase d'accueil APRÈS le chargement des données : on attend qu'elle soit posée. Les pages de
     contrôle (/admin/charte.html, /admin/photo.html…) ne chargent pas l'admin : rien à attendre. */
  if (!/^\/admin\/[\w-]+\.html$/.test(PAGE)) await p.waitForFunction(() => document.body.classList.contains('authed') && !!document.querySelector('#avatarInit') && document.querySelector('#avatarInit').textContent.trim() !== '', { timeout: 15000 });
  /* ⚠️ TRANSITIONS COUPÉES PENDANT LA MESURE. On bascule la chromie puis on lit aussitôt : un élément qui
     porte `transition: color` rend encore sa couleur d'AVANT. Mesuré le 26/10 sur .lelab-site-link :
     #CDC9C2 (nuit) lu à 0 ms en jour, #2B2347 à 400 ms → un faux ❌ à 1,11:1. On mesure l'état final. */
  await p.addStyleTag({ content: '*,*::before,*::after{transition:none!important}' });
  if (GESTE){ await p.evaluate(GESTE); await new Promise(r => setTimeout(r, 200)); console.log('\n(geste joué avant la mesure : ' + GESTE + ')'); }
  let echecs = 0;

  /* ── 0. LES DEUX FLOUS SE SUPERPOSENT-ILS ? MESURÉ, PAS SUPPOSÉ ──
     Le cas « les deux flous au cœur » n'existe que si leurs disques se rencontrent. On fige chaque
     animation à 5 instants de sa dérive (delay négatif, en pause) et on compare TOUTES les paires de
     positions : les deux durées (22 s / 26 s) ne sont pas synchrones, toute combinaison finit par
     arriver. Un seul chevauchement → le cas est compté. */
  const chevauchement = await p.evaluate(() => {
    const disques = sel => [0, .25, .5, .75, 1].map(f => {
      const e = document.querySelector(sel), s = getComputedStyle(e);
      const d = parseFloat(s.animationDuration);
      e.style.animationPlayState = 'paused'; e.style.animationDelay = (-f * d * .999) + 's';
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
    });
    const v = disques('.flou-violet'), j = disques('.flou-jaune');
    document.querySelectorAll('.flou-violet,.flou-jaune').forEach(e => { e.style.animationPlayState = ''; e.style.animationDelay = ''; });
    return v.some(a => j.some(b => Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r));
  });
  console.log(`\n(flous : cœurs ${chevauchement ? 'SUPERPOSABLES → cas « les deux flous » compté' : 'jamais superposés à 390 px → cas « les deux flous » écarté'})`);

  /* Les pixels d'une tuile, lus par le navigateur (canal R : la tuile est en niveaux de gris). */
  const tuiles = {};
  const pixels = async url => {
    if (!tuiles[url]) tuiles[url] = await p.evaluate(u => new Promise((ok, ko) => {
      const im = new Image();
      im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const x = c.getContext('2d'); x.drawImage(im, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data, out = [];
        for (let i = 0; i < d.length; i += 4) out.push(d[i] / 255);
        ok(out); };
      im.onerror = () => ko(new Error('tuile illisible : ' + u));
      im.src = u;
    }), url);
    return tuiles[url];
  };
  const grainDe = async g => {
    if (!g || !g.url) return null;
    const px = await pixels(g.url);
    const tri = [...px].sort((a, b) => a - b);
    return { ...g, px, bas: tri[Math.floor(tri.length * 0.01)], haut: tri[Math.floor(tri.length * 0.99)], fichier: g.url.replace(/^.*\//, '') };
  };

  // ── 1. CONTRASTE ────────────────────────────────────────────────────────────
  const lignes = [], lignesLum = [];
  for (const chromie of ['nuit', 'jour']){
    const releve = await p.evaluate((ch, ZONE) => {
      document.documentElement.dataset.chromie = ch;
      const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
      const couleur = el => getComputedStyle(el).backgroundColor;
      /* Un calque de grain : sa tuile, son opacité, son mode — tels que calculés. null s'il n'y en a pas. */
      const grainCalque = st => {
        const m = /url\("?([^")]+)"?\)/.exec(st.backgroundImage || '');
        return m ? { url: m[1], a: parseFloat(st.opacity), mode: st.mixBlendMode } : null;
      };
      const flou = sel => { const e = document.querySelector(sel), s = getComputedStyle(e); return { coul: s.backgroundColor, a: parseFloat(s.opacity) }; };
      const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      const dansZone = [...document.querySelectorAll(ZONE.split(',').map(z => z.trim() + ' *').join(','))];
      const textes = dansZone.filter(el =>
        [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && el.closest('[aria-hidden="true"]') === null && visible(el));
      /* ⚠️ LES CHAMPS AUSSI (bout 5) : dans la feuille, le texte que lit le client est la VALEUR d'un champ, pas un
         nœud texte — et un champ vide montre son placeholder. Les ignorer, c'était ne rien mesurer de la feuille. */
      const champs = dansZone.filter(el => el.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]),textarea')
        && visible(el) && (el.value.trim() || el.placeholder));
      /* ⚠️ LES FONDS SEMI-TRANSPARENTS SE COMPOSENT (bout 5) : la ligne active de la feuille est un --a-voir à
         28 % posé SUR le papier. Prendre ce fond pour opaque faussait le contraste. On remonte en empilant les
         couches jusqu'au premier fond opaque, et on compose (sRGB). Lit rgb(a) ET color(srgb …) (color-mix). */
      const lireCouleur = str => {
        let m = str.match(/color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.e-]+))?\)/);
        if (m) return { c: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] };
        m = (str.match(/[\d.]+/g) || [0, 0, 0, 0]).map(Number);
        return { c: m.slice(0, 3).map(v => v / 255), a: m[3] === undefined ? 1 : m[3] };
      };
      const surfaceDe = el => {
        const couches = []; let s = el;
        while (s && s !== document.body){
          const k = lireCouleur(couleur(s));
          if (k.a > 0){ couches.push(k); if (k.a >= 1){
            let c = couches[couches.length - 1].c;
            for (let i = couches.length - 2; i >= 0; i--) c = c.map((v, j) => v * (1 - couches[i].a) + couches[i].c[j] * couches[i].a);
            return { el: s, rgb: 'rgb(' + c.map(v => Math.round(v * 255)).join(', ') + ')' };
          } }
          s = s.parentElement;
        }
        return null;
      };
      const grainDeLEl = (el, surf) => {
        const g = surf && (surf.el.matches('.grain-papier,.grain-a-voir') ? surf.el : el.closest('.grain-papier,.grain-a-voir'));
        return g && g.contains(surf.el) || (g && g === surf.el) ? grainCalque(getComputedStyle(g, '::after')) : null;
      };
      return {
        /* Le fond de la page : celui de <body>, ou — s'il est transparent — celui de <html>. ⚠️ Depuis le 27/10
           le --fond de l'admin vit sur <html> SEUL (un fond sur <body> recouvrait les flous). Lire <body>
           seul rendait « transparent », parsé en noir : de faux contrastes, dans les deux sens. */
        fond: [document.body, document.documentElement].map(couleur).find(c => !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) || couleur(document.documentElement),
        flous: [flou('.flou-violet'), flou('.flou-jaune')],
        grainFond: grainCalque(getComputedStyle(document.querySelector('.grain-fond'))),
        surfaces: ['.tuile--a-jour', '.tuile--a-voir'].filter(sel => document.querySelector(sel)).map(sel => {
          const e = document.querySelector(sel);
          return { nom: sel, couleur: couleur(e), grain: grainCalque(getComputedStyle(e, '::after')) };
        }),
        items: [...textes.map(el => ({ el, txt: el.textContent.trim(), couleurTexte: getComputedStyle(el).color })),
                ...champs.map(el => el.value.trim()
                  ? { el, txt: el.value.trim(), couleurTexte: getComputedStyle(el).color }
                  : { el, txt: 'placeholder : ' + el.placeholder, couleurTexte: getComputedStyle(el, '::placeholder').color })
        ].map(({ el, txt, couleurTexte }) => {
          const surf = surfaceDe(el);
          return {
            nom: (el.className ? '.' + String(el.className).split(' ')[0] : el.tagName.toLowerCase()) + ' « ' + txt.slice(0, 24) + ' »',
            texte: couleurTexte, taille: parseFloat(getComputedStyle(el).fontSize),
            surface: surf ? surf.rgb : null,
            grain: surf ? grainDeLEl(el, surf) : null,
          };
        }),
      };
    }, chromie, ZONE);

    const fond = rgb(releve.fond).c;
    const [fv, fj] = releve.flous.map(f => ({ c: rgb(f.coul).c, a: f.a }));
    const gF = await grainDe(releve.grainFond);
    const extremes = g => g ? [['grain p1', g.bas], ['grain p99', g.haut]] : [];   // centiles, cf. l'en-tête
    const fondsComposes = [
      ['fond nu', fond],
      ['+ flou violet', sur(fond, fv.c, fv.a)],
      ['+ flou jaune', sur(fond, fj.c, fj.a)],
    ].concat(chevauchement ? [['+ les deux flous', sur(sur(fond, fv.c, fv.a), fj.c, fj.a)]] : [])
     .flatMap(([n, c]) => [[n, c], ...extremes(gF).map(([e, v]) => [n + ' + ' + e, fondu(c, v, gF)])]);

    /* 1bis. Luminance moyenne : fond, et chaque surface grainée. */
    const lumMoy = (c, g) => g.px.reduce((s, v) => s + lum(fondu(c, v, g)), 0) / g.px.length;
    const verifLum = (nom, c, g) => {
      if (!g) return;
      const l0 = lum(c), ec = (lumMoy(c, g) - l0) / l0 * 100, ok = Math.abs(ec) <= 1.5;
      if (!ok) echecs++;
      lignesLum.push(`| ${chromie} | ${nom} | ${hex(c)} | ${g.fichier} · ${g.mode} · ${g.a} | ${ec >= 0 ? '+' : ''}${ec.toFixed(2)} % | ${ok ? '✅' : '❌'} |`);
    };
    verifLum('fond', fond, gF);
    for (const sf of releve.surfaces) verifLum(sf.nom, rgb(sf.couleur).c, await grainDe(sf.grain));

    for (const it of releve.items){
      const t = rgb(it.texte).c;
      let cas;
      if (it.surface){
        const s = rgb(it.surface).c;
        const g = await grainDe(it.grain);
        const variantes = c => [['', c], ...extremes(g).map(([e, v]) => [e, fondu(c, v, g)])];
        cas = [];
        /* ⚠️ LE GRAIN MODULE LE FOND, JAMAIS LE TEXTE (27/10) : le calque est SOUS le contenu (z-index:-1 dans
           la surface isolée). Le texte garde sa couleur nominale ; seul le fond prend les centiles du grain. */
        for (const [et, tt] of [['', t]]) for (const [es, ss] of variantes(s))
          cas.push([[es && es + ' sur la surface', et && et + ' sur le texte'].filter(Boolean).join(', ') || 'surface', tt, ss]);
      } else {
        cas = fondsComposes.map(([n, c]) => [n, t, c]);
      }
      const pire = cas.map(([n, tt, bb]) => ({ n, r: ratio(tt, bb), bb })).sort((x, y) => x.r - y.r)[0];
      const nominal = ratio(t, it.surface ? rgb(it.surface).c : fond);
      const seuil = it.taille >= 24 ? 3 : 4.5;
      const ok = pire.r >= seuil;
      if (!ok) echecs++;
      lignes.push(`| ${chromie} | ${it.nom} | ${it.taille} px | ${hex(t)} | ${hex(it.surface ? rgb(it.surface).c : fond)} | ${nominal.toFixed(2)} | ${pire.r.toFixed(2)} (${pire.n}, ${hex(pire.bb)}) | ${seuil} | ${ok ? '✅' : '❌'} |`);
    }
  }
  console.log('\n## Contraste\n');
  console.log('| chromie | élément | taille | texte | fond (token) | ratio nominal | pire cas composé | seuil | |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  lignes.forEach(l => console.log(l));
  console.log('\n## Luminance moyenne des surfaces avec grain (tolérance ±1,5 %)\n');
  console.log('| chromie | surface | couleur | grain | écart | |');
  console.log('|---|---|---|---|---|---|');
  lignesLum.forEach(l => console.log(l));

  // ── 2. LES DEUX COPIES DU BLOC JOUR ─────────────────────────────────────────
  const TOKENS = ['--fond', '--papier', '--encre', '--texte', '--texte-2', '--a-voir', '--a-voir-texte', '--a-voir-texte-2', '--en-ligne',
                  '--violet-encre', '--papier-2', '--filet', '--contour', '--surlignage',
                  '--flou-violet', '--flou-violet-alpha', '--flou-jaune', '--flou-jaune-alpha', '--grain-fond-tuile', '--grain-a-voir-tuile'];
  const lire = () => p.evaluate(T => { const cs = getComputedStyle(document.documentElement); return T.map(t => cs.getPropertyValue(t).trim()); }, TOKENS);
  await p.evaluate(() => { document.documentElement.dataset.chromie = 'jour'; });
  const jourAttr = await lire();
  await p.evaluate(() => { delete document.documentElement.dataset.chromie; });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  const jourAuto = await lire();
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  const nuitAuto = await lire();
  await p.evaluate(() => { document.documentElement.dataset.chromie = 'nuit'; });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  const nuitForcee = await lire();
  const ecarts = TOKENS.filter((t, i) => jourAttr[i] !== jourAuto[i]);
  const ecartsNuit = TOKENS.filter((t, i) => nuitAuto[i] !== nuitForcee[i]);
  console.log('\n## Chromies\n');
  console.log(`- jour par attribut == jour par prefers-color-scheme : ${ecarts.length ? '❌ ' + ecarts.join(', ') : `✅ ${TOKENS.length} variables identiques`}`);
  console.log(`- nuit par défaut (téléphone sombre) == nuit choisie sur un téléphone clair : ${ecartsNuit.length ? '❌ ' + ecartsNuit.join(', ') : `✅ ${TOKENS.length} variables identiques`}`);
  echecs += ecarts.length + ecartsNuit.length;

  // ── 3. POLICES ──────────────────────────────────────────────────────────────
  const polices = await p.evaluate(() => [...document.fonts].map(f => `${f.family.replace(/"/g, '')} ${f.weight} ${f.style} : ${f.status}`));
  const google = Object.values(urls).filter(u => /fonts\.(googleapis|gstatic)\.com/.test(u));
  const nonChargees = polices.filter(l => /unloaded$/.test(l));
  console.log('\n## Polices\n');
  polices.forEach(l => console.log('- ' + l));
  console.log(`- requêtes Google Fonts : ${google.length ? '❌ ' + google.join(', ') : '✅ aucune'}`);
  if (google.length) echecs++;
  /* ⚠️ « error » N'EST PAS « unloaded ». Une graisse que la page n'emploie pas reste « unloaded » (normal) ;
     une graisse demandée qui n'a pas pu se charger est « error » — le texte part alors en police de
     repli sans un mot. La sonde doit rougir. */
  const enErreur = polices.filter(l => /error$/.test(l));
  if (enErreur.length){ echecs += enErreur.length; console.log(`- ❌ en erreur : ${enErreur.join(' · ')}`); }
  // ⚠️ Une graisse déclarée mais pas utilisée dans la page reste « unloaded » : ce n'est pas un échec.
  if (nonChargees.length) console.log(`- non chargées (aucun texte ne les emploie ici) : ${nonChargees.length}`);

  // ── 4. POIDS ────────────────────────────────────────────────────────────────
  console.log('\n## Poids\n');
  console.log('| fichier | sur disque | transféré par la page |');
  console.log('|---|---|---|');
  const transfert = Object.keys(poids).map(id => ({ url: urls[id], o: poids[id] }));
  const fichiers = ['assets/grain.png', 'assets/grain-sombre.png', ...fs.readdirSync(path.join(RACINE, 'assets/fonts')).filter(f => /^instrument-.*\.woff2$/.test(f)).map(f => 'assets/fonts/' + f)];
  for (const f of fichiers){
    const t = transfert.find(x => x.url.endsWith('/' + f));
    console.log(`| ${f} | ${fs.statSync(path.join(RACINE, f)).size} o | ${t ? t.o + ' o' : 'non chargé'} |`);
  }
  for (const t of ['assets/grain.png', 'assets/grain-sombre.png']){
    const o = fs.statSync(path.join(RACINE, t)).size;
    if (o > 20 * 1024){ echecs++; console.log(`❌ ${t} ${o} o > 20 Ko`); }
  }
  transfert.filter(x => !fichiers.some(f => x.url.endsWith('/' + f))).forEach(x => console.log(`| ${x.url.replace(/^https?:\/\/[^/]+\//, '')} | — | ${x.o} o |`));
  const total = transfert.reduce((s, x) => s + x.o, 0);
  console.log(`| **total chargé par la page** | | **${total} o (${(total / 1024).toFixed(1)} Ko), ${transfert.length} requêtes** |`);

  await b.close();
  if (echecs){ console.error(`\n❌ CHARTE — ${echecs} échec(s)\n`); process.exit(1); }
  console.log('\n✅ CHARTE — aucun couple sous son seuil, chromies cohérentes, polices locales, luminance des surfaces préservée, grain sous 20 Ko par tuile.\n');
})();
