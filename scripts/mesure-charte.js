#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   MESURE DE LA CHARTE DE L'APP — admin/charte.html (LELAB-DESIGN.md §1, §3)
   ═══════════════════════════════════════════════════════════════════════════
   1. CONTRASTE WCAG de chaque couple texte / fond RÉELLEMENT rendu, dans les deux chromies.
      Seuils : 4,5:1 (texte courant), 3:1 (≥ 24 px). Les seuils ne bougent pas ; une nuance qui
      échoue se corrige dans la nuance.
      ⚠️ LE FOND D'UN TEXTE N'EST PAS LE TOKEN SEUL. Sur le fond de l'app passent deux flous et le
         grain ; sur un papier, le grain est en multiply PAR-DESSUS le texte. On retient le PIRE des
         cas composés (en sRGB, comme le navigateur fusionne) :
           fond nu · + flou violet au cœur · + flou jaune au cœur · + les deux (seulement si leurs
           disques se superposent, mesuré en 0.) · chacun + le grain
         et, sur une surface grainée, le pixel noir du grain posé sur le côté qui perd du contraste.
         Le cœur d'un flou est pris à son opacité pleine : c'est une borne, le flou réel est plus doux.
   2. LES DEUX COPIES DU BLOC JOUR (attribut / prefers-color-scheme) doivent donner les mêmes tokens.
   3. LES POLICES : Instrument chargées depuis le dépôt, aucune requête Google Fonts.
   4. LES POIDS : grain.png, chaque woff2, et le total transféré par la page (cache coupé).

   USAGE :  python3 -m http.server 8080   puis   node scripts/mesure-charte.js 8080
   PRÉREQUIS : puppeteer-core + un Chrome installé.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const PORT   = process.argv[2] || '8080';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL    = `http://localhost:${PORT}/admin/charte.html`;
const RACINE = path.join(__dirname, '..');

let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e){ console.error('puppeteer-core manquant → npm install'); process.exit(2); }

// ── Couleur et contraste (WCAG 2.x, sRGB 0–1) ─────────────────────────────────
const rgb = s => { const m = s.match(/[\d.]+/g).map(Number); return { c: m.slice(0, 3).map(v => v / 255), a: m[3] === undefined ? 1 : m[3] }; };
const sur = (base, coul, a) => base.map((b, i) => b * (1 - a) + coul[i] * a);              // coul posée à l'opacité a
const lum = c => { const l = c.map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
const hex = c => '#' + c.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
  const cdp = await p.target().createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const urls = {}, poids = {};
  cdp.on('Network.requestWillBeSent', e => { urls[e.requestId] = e.request.url; });
  cdp.on('Network.loadingFinished', e => { poids[e.requestId] = e.encodedDataLength; });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await p.goto(URL, { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.fonts.ready);
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

  // ── 1. CONTRASTE ────────────────────────────────────────────────────────────
  const lignes = [];
  for (const chromie of ['nuit', 'jour']){
    const releve = await p.evaluate(ch => {
      document.documentElement.dataset.chromie = ch;
      const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
      const couleur = el => getComputedStyle(el).backgroundColor;
      const flou = sel => { const e = document.querySelector(sel), s = getComputedStyle(e); return { coul: s.backgroundColor, a: parseFloat(s.opacity) }; };
      const textes = [...document.querySelectorAll('main *')].filter(el =>
        [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && el.closest('[aria-hidden="true"]') === null);
      return {
        fond: couleur(document.body),
        flous: [flou('.flou-violet'), flou('.flou-jaune')],
        grainFond: { a: parseFloat(getComputedStyle(document.querySelector('.grain-fond')).opacity), mode: v('--grain-fond-mode') },
        items: textes.map(el => {
          let s = el, surface = null;
          while (s && s !== document.body){ const bg = couleur(s); if (!/rgba\(0, 0, 0, 0\)|transparent/.test(bg)){ surface = s; break; } s = s.parentElement; }
          const st = getComputedStyle(el);
          return {
            nom: (el.className ? '.' + String(el.className).split(' ')[0] : el.tagName.toLowerCase()) + ' « ' + el.textContent.trim().slice(0, 24) + ' »',
            texte: st.color, taille: parseFloat(st.fontSize),
            surface: surface ? couleur(surface) : null,
            grainPapier: !!(surface && surface.classList.contains('grain-papier')),
            grainA: surface && surface.classList.contains('grain-papier') ? parseFloat(getComputedStyle(surface, '::after').opacity) : 0,
          };
        }),
      };
    }, chromie);

    const fond = rgb(releve.fond).c;
    const [fv, fj] = releve.flous.map(f => ({ c: rgb(f.coul).c, a: f.a }));
    const gF = releve.grainFond;
    const grainSurFond = c => gF.mode === 'screen' ? sur(c, [1, 1, 1], gF.a) : sur(c, [0, 0, 0], gF.a);
    const fondsComposes = [
      ['fond nu', fond],
      ['+ flou violet', sur(fond, fv.c, fv.a)],
      ['+ flou jaune', sur(fond, fj.c, fj.a)],
    ].concat(chevauchement ? [['+ les deux flous', sur(sur(fond, fv.c, fv.a), fj.c, fj.a)]] : [])
     .flatMap(([n, c]) => [[n, c], [n + ' + grain', grainSurFond(c)]]);

    for (const it of releve.items){
      const t = rgb(it.texte).c;
      let cas;
      if (it.surface){
        const s = rgb(it.surface).c;
        cas = [['surface', t, s]];
        if (it.grainPapier){
          const k = 1 - it.grainA;                                   // pixel noir du grain en multiply
          cas.push(['grain sur la surface', t, s.map(x => x * k)], ['grain sur le texte', t.map(x => x * k), s]);
        }
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

  // ── 2. LES DEUX COPIES DU BLOC JOUR ─────────────────────────────────────────
  const TOKENS = ['--fond', '--papier', '--encre', '--texte', '--texte-2', '--a-voir', '--a-voir-texte', '--a-voir-texte-2', '--en-ligne',
                  '--violet-encre', '--papier-2', '--filet', '--contour',
                  '--flou-violet', '--flou-violet-alpha', '--flou-jaune', '--flou-jaune-alpha', '--grain-fond-mode'];
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
  const nonChargees = polices.filter(l => !/loaded$/.test(l));
  console.log('\n## Polices\n');
  polices.forEach(l => console.log('- ' + l));
  console.log(`- requêtes Google Fonts : ${google.length ? '❌ ' + google.join(', ') : '✅ aucune'}`);
  if (google.length) echecs++;
  // ⚠️ Une graisse déclarée mais pas utilisée dans la page reste « unloaded » : ce n'est pas un échec.
  if (nonChargees.length) console.log(`- non chargées (aucun texte ne les emploie ici) : ${nonChargees.length}`);

  // ── 4. POIDS ────────────────────────────────────────────────────────────────
  console.log('\n## Poids\n');
  console.log('| fichier | sur disque | transféré par la page |');
  console.log('|---|---|---|');
  const transfert = Object.keys(poids).map(id => ({ url: urls[id], o: poids[id] }));
  const fichiers = ['assets/grain.png', ...fs.readdirSync(path.join(RACINE, 'assets/fonts')).filter(f => /^instrument-.*\.woff2$/.test(f)).map(f => 'assets/fonts/' + f)];
  for (const f of fichiers){
    const t = transfert.find(x => x.url.endsWith('/' + f));
    console.log(`| ${f} | ${fs.statSync(path.join(RACINE, f)).size} o | ${t ? t.o + ' o' : 'non chargé'} |`);
  }
  const grain = fs.statSync(path.join(RACINE, 'assets/grain.png')).size;
  if (grain > 12 * 1024){ echecs++; console.log(`❌ grain.png ${grain} o > 12 Ko`); }
  transfert.filter(x => !fichiers.some(f => x.url.endsWith('/' + f))).forEach(x => console.log(`| ${x.url.replace(/^https?:\/\/[^/]+\//, '')} | — | ${x.o} o |`));
  const total = transfert.reduce((s, x) => s + x.o, 0);
  console.log(`| **total chargé par la page** | | **${total} o (${(total / 1024).toFixed(1)} Ko), ${transfert.length} requêtes** |`);

  await b.close();
  if (echecs){ console.error(`\n❌ CHARTE — ${echecs} échec(s)\n`); process.exit(1); }
  console.log('\n✅ CHARTE — aucun couple sous son seuil, chromies cohérentes, polices locales, grain sous 12 Ko.\n');
})();
