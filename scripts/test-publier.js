#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   PUBLIER JUSQU'AU BOUT (bout 6, LELAB-DESIGN §6)
   ═══════════════════════════════════════════════════════════════════════════
   save-data ET le fichier public (/_data/carte.json, /_data/config.json) sont INTERCEPTÉS : la sonde décide
   quand le « déploiement » a eu lieu. La carte servie est la copie figée scripts/fixtures/feuille-carte.json.

   HORLOGE : la sonde pose window.__LELAB_TEMPS = K (0,02) avant le chargement : courbe 40 s → 0,8 s,
   relecture 3 s → 60 ms, délai max 120 s → 2,4 s. Les contrôles de durée sont exprimés en NOMINAL × K.
   0. SANS la variable, dureesPublier() rend les nominales (40 000 / 3 000 / 120 000 ms) et echelleTemps() 1 :
      lecture DIRECTE des constantes, page ouverte comme en prod. Le facteur ne fuit pas.

   A. 2 relectures périmées puis 1 bonne → « ✓ C'est en ligne » APRÈS la 3e, jamais avant ; repos 3 s après.
   B. Le fichier public ne change jamais → au délai max, phrase du délai long ; JAMAIS « en ligne ».
   C. save-data 500 → retour à « Publier », changements intacts, AUCUNE relecture du fichier public.
   D. prefers-reduced-motion → aucun remplissage ni animation, mêmes textes, fond jaune plein à la fin.
   E. On quitte la feuille pendant la confirmation → la relecture continue, l'accueil dit « Une publication
      est en cours. » jusqu'à la preuve.
   F. Mon site (interrupteur → config.json) : même enchaînement que A.
   Partout : le remplissage n'atteint JAMAIS 85 % (a fortiori 100 %) avant la confirmation.

   ⚠️ ROUGE sur le code d'avant le bout 6 (pas de relecture, « ✓ Envoyé » puis « Tout est en ligne » à 3 s).
   USAGE :  node <serveur statique> . 8080   puis   node scripts/test-publier.js 8080 > sortie.txt   (< 20 s)
            CAS=AD pour isoler des cas (0 = les durées nominales).
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs'), path = require('path');
const PORT   = process.argv[2] || '8080';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE   = `http://localhost:${PORT}/admin/`;
const SOURCE = fs.readFileSync(path.join(__dirname, 'fixtures', 'feuille-carte.json'), 'utf8');
const CONFIG = fs.readFileSync(path.join(__dirname, '..', '_data', 'config.json'), 'utf8');
const K = 0.02;                                   // facteur d'échelle de temps posé dans la page
const NOMINAL = { courbe: 40000, intervalle: 3000, delaiMax: 120000 };
const INTERVALLE = NOMINAL.intervalle * K, DELAI_MAX = NOMINAL.delaiMax * K;
const SAVE_MS = 300;                              // un vrai save-data n'est pas instantané : « Publication… » se voit
const REPOS_MS = 3000;                            // le retour au repos après « ✓ C'est en ligne » n'est PAS mis à l'échelle
const pause = ms => new Promise(r => setTimeout(r, ms));
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch (e){ console.error('puppeteer-core manquant → npm install'); process.exit(2); }

const fails = [], lignes = [];
const verdict = (cas, nom, ok, detail) => { lignes.push(`| ${cas} | ${nom} | ${detail} | ${ok ? '✅' : '❌'} |`); if (!ok) fails.push(`${cas} · ${nom} : ${detail}`); };
let navigateur;

/* publicBon(n) : la n-ième relecture APRÈS l'envoi renvoie-t-elle ce qui a été envoyé ?
   Toutes les heures (échantillons, relectures, envoi) sont des Date.now() ABSOLUS : une seule horloge. */
async function ouvrir({ fichier, publicBon, saveStatus = 200, reduit = false, echelle = K }){
  const ctx = await navigateur.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true });
  if (reduit) await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (echelle != null) await p.evaluateOnNewDocument(k => { window.__LELAB_TEMPS = k; }, echelle);
  const journal = { envoi: null, tEnvoi: 0, relectures: [] };
  await p.setRequestInterception(true);
  p.on('request', r => {
    const u = r.url();
    if (u.includes('/.netlify/functions/save-data')){
      journal.envoi = JSON.parse(r.postData() || '{}'); journal.tEnvoi = Date.now();
      return setTimeout(() => r.respond({ status: saveStatus, contentType: 'application/json', body: saveStatus === 200 ? '{"success":true}' : '{"error":"sonde : 500"}' }), SAVE_MS);
    }
    const m = u.match(/\/_data\/(carte|config)\.json(\?.*)?$/);
    if (m){
      const base = m[1] === 'carte' ? SOURCE : CONFIG;
      if (m[1] !== fichier || !journal.envoi) return r.respond({ status: 200, contentType: 'application/json', body: base });
      const n = journal.relectures.length + 1;
      const bon = publicBon(n);
      journal.relectures.push({ t: Date.now(), bon, antiCache: !!m[2] });
      return r.respond({ status: 200, contentType: 'application/json', body: bon ? JSON.stringify(journal.envoi.data, null, 2) + '\n' : base });
    }
    r.continue();
  });
  /* Échantillonneur DANS la page : libellé, classe, remplissage, fond, phrases, animations — toutes les 10 ms. */
  await p.evaluateOnNewDocument(() => {
    window.__echantillons = [];
    setInterval(() => {
      [['btnFeuille', 'feuillePhrase'], ['btn-publish-sections', 'publierPhrase']].forEach(([b, ph]) => {
        const btn = document.getElementById(b); if (!btn) return;
        const ex = document.getElementById(ph), acc = document.getElementById('accueilEtat');
        const an = btn.getAnimations ? btn.getAnimations({ subtree: true }) : [];
        window.__echantillons.push({ t: Date.now(), b, txt: btn.textContent, cls: btn.className,
          f: btn.classList.contains('remplit') ? +(btn.dataset.remplissage || 0) : null,
          phrase: ex ? ex.textContent : '', phraseVue: !!ex && ex.getClientRects().length > 0, bg: getComputedStyle(btn).backgroundColor, accueil: acc ? acc.textContent : '',
          anims: an.length, animNoms: an.map(a => a.animationName || a.transitionProperty).join(',') });
      });
    }, 10);
  });
  return { ctx, p, journal };
}
const session = p => p.evaluate(() => { session = { access_token: 'sonde', refresh_token: 'sonde', expires_at: Date.now() + 3600e3 }; });
async function feuilleModifiee(p){
  await p.goto(BASE + '#edit/menu', { waitUntil: 'networkidle0' });
  await p.waitForSelector('#feuille .f-ligne', { timeout: 8000 });
  await session(p);
  const sel = '.f-cat[data-cat="entrees"] .f-lignes > .f-ligne:nth-child(1) .f-prix';
  await p.click(sel, { clickCount: 3 }); await p.keyboard.type('11€');
  return sel;
}
const echantillons = p => p.evaluate(() => window.__echantillons);
/* Suite des libellés DISTINCTS CONSÉCUTIFS à partir de « Publication… ». */
const suite = (ech, b) => { const out = []; ech.filter(e => e.b === b).forEach(e => { if (out[out.length - 1] !== e.txt) out.push(e.txt); }); const i = out.indexOf('Publication…'); return i < 0 ? out : out.slice(i); };
const premier = (ech, b, re) => (ech.find(e => e.b === b && re.test(e.txt)) || {}).t;
/* Contrôles communs : jamais « en ligne » avant la bonne relecture, remplissage < 85 % avant. */
function avantPreuve(cas, ech, tPreuve, b){
  const tous = ech.filter(e => e.b === b), i0 = tous.findIndex(e => /Publication/.test(e.txt));
  const avant = tous.slice(Math.max(0, i0)).filter(e => tPreuve == null || e.t < tPreuve);
  const dit = i0 < 0 ? { txt: '« Publication… » jamais vu', t: 0 } : avant.find(e => /C’est en ligne|Tout est en ligne/.test(e.txt));
  verdict(cas, 'jamais « en ligne » sans preuve', !dit, dit ? `« ${dit.txt} » à ${dit.t - tous[i0].t} ms de « Publication… »` : `${avant.length} échantillons`);
  const fMax = Math.max(0, ...avant.map(e => e.f || 0));
  verdict(cas, 'remplissage avant preuve', fMax < 0.85, `max ${(fMax * 100).toFixed(1)} %`);
}
const cadence = (cas, r) => {
  const pas = r.slice(1).map((x, i) => x.t - r[i].t);
  verdict(cas, `cadence ${INTERVALLE} ms (3 s × K)`, pas.length > 0 && pas.every(d => d >= INTERVALLE - 5 && d <= INTERVALLE + 120), pas.join(' ms, ') + ' ms');
};

async function cas0(){
  const cas = '0 · prod (sans variable)';
  const { ctx, p } = await ouvrir({ fichier: 'carte', publicBon: () => false, echelle: null });
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  const d = await p.evaluate(() => ({ variable: typeof window.__LELAB_TEMPS, echelle: echelleTemps(), durees: dureesPublier(),
    constantes: { courbe: PUBLIER_COURBE, intervalle: PUBLIER_INTERVALLE, delaiMax: PUBLIER_DELAI_MAX } }));
  const ok = d.variable === 'undefined' && d.echelle === 1 && JSON.stringify(d.durees) === JSON.stringify(NOMINAL) && JSON.stringify(d.constantes) === JSON.stringify(NOMINAL);
  verdict(cas, 'durées nominales', ok, `__LELAB_TEMPS ${d.variable} · échelle ${d.echelle} · courbe ${d.durees.courbe} · relecture ${d.durees.intervalle} · délai max ${d.durees.delaiMax} ms`);
  /* Valeurs hors bornes : jamais prises (0, négatif, > 1, texte). */
  const bornes = await p.evaluate(() => [0, -1, 2, '0.02', NaN].map(v => { window.__LELAB_TEMPS = v; const k = echelleTemps(); delete window.__LELAB_TEMPS; return k; }));
  verdict(cas, 'valeurs invalides → 1', bornes.every(k => k === 1), bornes.join(', '));
  await ctx.close();
}

async function casA(){
  const cas = 'A · 2 périmées puis 1 bonne';
  const { ctx, p, journal } = await ouvrir({ fichier: 'carte', publicBon: n => n >= 3 });
  await feuilleModifiee(p);
  await p.click('#btnFeuille');
  await pause(SAVE_MS + 3 * INTERVALLE + 350 + REPOS_MS + 600);
  const ech = await echantillons(p), r = journal.relectures, b = 'btnFeuille';
  verdict(cas, 'relectures', r.length === 3 && r.every(x => x.antiCache), `${r.length} relecture(s) à ${r.map(x => x.t - journal.tEnvoi + ' ms').join(', ')} de l'envoi, anti-cache ${r.every(x => x.antiCache) ? 'oui' : 'non'}`);
  cadence(cas, r);
  const tEnLigne = premier(ech, b, /C’est en ligne/), tBonne = r[2] && r[2].t;
  verdict(cas, '« ✓ C’est en ligne » après la 3e relecture', tEnLigne != null && tBonne != null && tEnLigne >= tBonne && tEnLigne <= tBonne + 800,
    tEnLigne == null ? 'jamais affiché' : `${tEnLigne - tBonne} ms après la 3e relecture`);
  avantPreuve(cas, ech, tBonne, b);
  const seq = suite(ech, b);
  verdict(cas, 'enchaînement', JSON.stringify(seq) === JSON.stringify(['Publication…', 'Envoyé · mise en ligne…', '✓ C’est en ligne', 'Tout est en ligne']), seq.join(' → '));
  /* 7a-ter : sous le bouton, pendant l'envoi, le délai ; dans l'état Envoyé, sa propre phrase (rien d'ajouté). */
  const lignesDe = re => [...new Set(ech.filter(e => e.b === b && re.test(e.txt)).map(e => e.phraseVue ? e.phrase : '(invisible)'))];
  const pEnvoi = lignesDe(/^Publication/), pEnvoye = lignesDe(/^Envoyé · mise en ligne/);
  verdict(cas, 'ligne pendant l’envoi', pEnvoi.join() === 'En ligne en moins d’une minute.' && pEnvoye.join() === 'En ligne dans moins d’une minute.',
    `« Publication… » → ${pEnvoi.map(x => '« ' + x + ' »').join(', ')} · « Envoyé » → ${pEnvoye.map(x => '« ' + x + ' »').join(', ')}`);
  /* À la preuve, les 15 derniers pour cent se remplissent (350 ms) puis le bouton est jaune plein. */
  const fFin = Math.max(...ech.filter(e => e.b === b && e.f != null).map(e => e.f));
  const conf = ech.find(e => e.b === b && /C’est en ligne/.test(e.txt));
  verdict(cas, 'remplissage complet à la preuve', fFin > 0.85 && conf && conf.bg === 'rgb(255, 242, 140)', `max échantillonné ${(fFin * 100).toFixed(1)} %, puis fond ${conf ? conf.bg : '—'}`);
  const repos = ech.find(e => e.b === b && e.txt === 'Tout est en ligne' && e.t > tEnLigne);
  verdict(cas, 'repos 3 s après', repos && repos.t - tEnLigne >= 2950 && repos.t - tEnLigne <= 3300, repos ? `${repos.t - tEnLigne} ms` : 'pas de retour au repos');
  await ctx.close();
}

async function casB(){
  const cas = 'B · jamais à jour';
  const { ctx, p, journal } = await ouvrir({ fichier: 'carte', publicBon: () => false });
  await feuilleModifiee(p);
  await p.click('#btnFeuille');
  await pause(SAVE_MS + DELAI_MAX + 600);
  const ech = await echantillons(p), b = 'btnFeuille';
  avantPreuve(cas, ech, null, b);
  const longue = ech.find(e => e.b === b && /prend plus de temps que d’habitude, elle se fera seule/.test(e.phrase));
  verdict(cas, 'phrase du délai long', !!longue, longue ? `bouton « ${longue.txt} »` : 'absente');
  const dt = longue ? longue.t - journal.tEnvoi - SAVE_MS : null;
  verdict(cas, `au plus ${DELAI_MAX} ms (120 s × K)`, dt != null && dt >= DELAI_MAX - 2 * INTERVALLE && dt <= DELAI_MAX + 150, dt != null ? `${dt} ms après la réponse de save-data` : '—');
  const fin = ech.filter(e => e.b === b).pop();
  verdict(cas, 'état final', !/C’est en ligne|Tout est en ligne/.test(fin.txt) && !fin.cls.includes('remplit') && fin.cls.includes('pub--en-ligne'), `« ${fin.txt} » · ${fin.cls.replace('btn btn--block btn-pub ', '')}`);
  const n = journal.relectures.length;
  cadence(cas, journal.relectures);
  await pause(10 * INTERVALLE);
  verdict(cas, 'relecture arrêtée', journal.relectures.length === n, `${n} relectures, ${journal.relectures.length - n} après le délai`);
  await ctx.close();
}

async function casC(){
  const cas = 'C · save-data 500';
  const { ctx, p, journal } = await ouvrir({ fichier: 'carte', publicBon: () => true, saveStatus: 500 });
  const sel = await feuilleModifiee(p);
  await p.click('#btnFeuille');
  await pause(SAVE_MS + 10 * INTERVALLE + 600);
  const ech = await echantillons(p), b = 'btnFeuille';
  const fin = ech.filter(e => e.b === b).pop();
  verdict(cas, 'retour à « Publier »', fin.txt === 'Publier' && !fin.cls.includes('remplit'), `« ${fin.txt} »`);
  verdict(cas, 'phrase', fin.phrase === 'Ça n’est pas parti. Vos changements sont gardés, réessayez.', `« ${fin.phrase} »`);
  const prix = await p.$eval(sel, e => e.value);
  const actif = await p.$eval('#btnFeuille', e => !e.disabled);
  verdict(cas, 'changement gardé', prix === '11€' && actif, `prix « ${prix} », bouton ${actif ? 'cliquable' : 'non cliquable'}`);
  verdict(cas, 'rien relu', journal.relectures.length === 0, `${journal.relectures.length} relecture(s) du fichier public`);
  /* 7a-ter : la phrase d'erreur est VISIBLE (elle prend la ligne sous le bouton, pas « n changements · Annuler »)…
     puis, au geste suivant, le lien revient. */
  const ligne = () => p.evaluate(() => { const vu = e => !!e && e.getClientRects().length > 0;
    const ph = document.getElementById('feuillePhrase'), l = document.getElementById('feuilleLien');
    return { phrase: vu(ph) ? ph.textContent : null, lien: vu(l) ? l.textContent : null }; });
  const l1 = await ligne();
  verdict(cas, 'phrase d’erreur visible', l1.phrase === 'Ça n’est pas parti. Vos changements sont gardés, réessayez.' && l1.lien === null,
    `phrase ${l1.phrase === null ? 'INVISIBLE' : '« ' + l1.phrase + ' »'} · lien ${l1.lien === null ? 'masqué' : 'VISIBLE « ' + l1.lien + ' »'}`);
  await p.$eval(sel, e => e.scrollIntoView({ block: 'center' })); await p.click(sel); await p.keyboard.press('End'); await p.keyboard.type('0');
  await pause(100);
  const l2 = await ligne();
  verdict(cas, 'le lien revient au geste suivant', l2.lien === '1 changement · Annuler' && l2.phrase === null,
    `lien ${l2.lien === null ? 'MASQUÉ' : '« ' + l2.lien + ' »'} · phrase ${l2.phrase === null ? 'masquée' : 'VISIBLE'}`);
  const tErr = (ech.find(x => x.b === b && x.phrase.startsWith('Ça n’est')) || { t: 1e15 }).t;
  const chute = ech.filter(e => e.b === b && e.f != null && e.t >= tErr);
  verdict(cas, 'le jaune redescend', chute.length === 0 || chute[chute.length - 1].f <= chute[0].f, chute.length ? `${(chute[0].f * 100).toFixed(1)} % → ${(chute[chute.length - 1].f * 100).toFixed(1)} %` : 'déjà vide');
  await ctx.close();
}

async function casD(){
  const cas = 'D · mouvement réduit';
  const { ctx, p } = await ouvrir({ fichier: 'carte', publicBon: n => n >= 3, reduit: true });
  await feuilleModifiee(p);
  await p.click('#btnFeuille');
  await pause(SAVE_MS + 3 * INTERVALLE + 800);
  const ech = await echantillons(p), b = 'btnFeuille';
  const f = ech.filter(e => e.b === b);
  verdict(cas, 'aucun remplissage', f.every(e => e.f == null), `${f.filter(e => e.f != null).length} échantillon(s) avec remplissage`);
  verdict(cas, 'aucune animation', f.every(e => e.anims === 0), `max ${Math.max(...f.map(e => e.anims))} animation(s) ${[...new Set(f.map(e => e.animNoms).filter(Boolean))].join(' ; ')}`);
  const seq = suite(ech, b);
  verdict(cas, 'mêmes textes', JSON.stringify(seq) === JSON.stringify(['Publication…', 'Envoyé · mise en ligne…', '✓ C’est en ligne']), seq.join(' → '));
  const fond = await p.$eval('#btnFeuille', e => getComputedStyle(e).backgroundColor);
  verdict(cas, 'fond plein à la fin', fond === 'rgb(255, 242, 140)', fond);
  await ctx.close();
}

async function casE(){
  const cas = 'E · on quitte la feuille';
  /* Quitter la feuille → accueil affiché (écran actif, fondu fini, phrase posée) : 156 à 171 ms mesurés sur
     5 essais (fondu de showScreen : 150 ms). La sonde attend 300 ms, puis lit l'accueil vers la 7e relecture
     (pas mesuré : 62-64 ms). La preuve à la 20e laisse ~13 relectures (~800 ms) de marge ; « lues < BONNE »
     ci-dessous refuse un contrôle qui arriverait APRÈS la preuve. */
  const BONNE = 20;
  const { ctx, p, journal } = await ouvrir({ fichier: 'carte', publicBon: n => n >= BONNE });
  await feuilleModifiee(p);
  await p.click('#btnFeuille');
  await pause(SAVE_MS + 2 * INTERVALLE);
  await p.click('.f-retour');
  await pause(300);   // ≥ 171 ms mesurés pour quitter la feuille, + marge
  const pendant = await p.$eval('#accueilEtat', e => e.textContent).catch(() => '(absent)');
  const ecran = await p.evaluate(() => document.querySelector('.screen.active') && document.querySelector('.screen.active').id);
  const lues = journal.relectures.length;
  verdict(cas, 'accueil pendant', pendant === 'Une publication est en cours.' && ecran === 'screen-monsite' && lues < BONNE, `${ecran} · « ${pendant} » (${lues} relecture(s) à ce moment)`);
  await pause(BONNE * INTERVALLE + 600);
  verdict(cas, 'relecture en arrière-plan', journal.relectures.length === BONNE, `${journal.relectures.length} relecture(s)`);
  const apres = await p.$eval('#accueilEtat', e => e.textContent).catch(() => '(absent)');
  verdict(cas, 'accueil après la preuve', apres !== 'Une publication est en cours.', `« ${apres} »`);
  await ctx.close();
}

async function casF(){
  const cas = 'F · Mon site';
  const BONNE = 20;
  const { ctx, p, journal } = await ouvrir({ fichier: 'config', publicBon: n => n >= BONNE });
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  await p.evaluate(async () => { document.body.classList.add('authed'); await loadSassyData(); });
  await session(p);
  const t = await p.$$('#screen-monsite .lelab-mini-toggle[data-bloc]');
  if (!t.length){ verdict(cas, 'interrupteur', false, 'aucun'); return ctx.close(); }
  await t[0].click();
  await p.click('#btn-publish-sections');
  await pause(SAVE_MS + 3 * INTERVALLE);
  const acc = await p.$eval('#accueilEtat', e => e.textContent);
  verdict(cas, 'accueil pendant', acc === 'Une publication est en cours.', `« ${acc} » (${journal.relectures.length} relecture(s) à ce moment)`);
  await pause(BONNE * INTERVALLE + 350 + REPOS_MS + 600);
  const ech = await echantillons(p), b = 'btn-publish-sections', r = journal.relectures;
  const tBonne = r[BONNE - 1] && r[BONNE - 1].t;
  avantPreuve(cas, ech, tBonne, b);
  const seq = suite(ech, b);
  verdict(cas, 'enchaînement', JSON.stringify(seq) === JSON.stringify(['Publication…', 'Envoyé · mise en ligne…', '✓ C’est en ligne', 'Tout est en ligne']), seq.join(' → '));
  verdict(cas, 'relectures', r.length === BONNE, `${r.length} relecture(s) de config.json`);
  cadence(cas, r);
  await ctx.close();
}

(async () => {
  const debut = Date.now();
  console.log(`\n═══ PUBLIER JUSQU’AU BOUT — horloge × ${K} ═══\n`);
  navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const tous = { 0: cas0, A: casA, B: casB, C: casC, D: casD, E: casE, F: casF };
  const choisis = (process.env.CAS || '0ABCDEF').split('').filter(k => tous[k]);
  /* Un navigateur, un contexte isolé par cas, deux cas à la fois : au-delà, les minuteurs de 60 ms dérivent
     (constaté à six Chrome en parallèle : 2 relectures au lieu de 3). */
  const file = [...choisis];
  const ouvrier = async () => { while (file.length){ const k = file.shift(); await tous[k]().catch(e => fails.push(k + ' · exception : ' + e.message)); } };
  await Promise.all([ouvrier(), ouvrier()]);
  await navigateur.close();
  console.log('| Cas | Contrôle | Mesuré | |\n|---|---|---|---|\n' + lignes.sort().join('\n'));
  console.log(`\nDurée de la sonde : ${((Date.now() - debut) / 1000).toFixed(1)} s`);
  if (fails.length){ console.log('\n❌ ' + fails.length + ' échec(s) :\n  - ' + fails.join('\n  - ')); process.exit(1); }
  console.log('\n✅ Publier jusqu’au bout : la preuve, rien que la preuve — et en prod, les durées nominales.');
})();
