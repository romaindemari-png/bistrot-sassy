/* ============================================================
   LA CHROMIE (jour / nuit) ET LE LOGO DE LA BARRE — bistrot-sassy (28/10), reprise de bapu-site B7
   Chez Sassy : config.json → "chromie": "nuit" ; l'interrupteur « Nuit » part coché ; logo LeLab+ blanc la nuit.
   Usage :  python3 -m http.server <port>   (à la racine du dépôt)
            node scripts/test-chromie.js [http://localhost:<port>]

   Seul /_data/config.json est intercepté (copie gelée scripts/fixtures/chromie-config.json, déclinée EN MÉMOIRE
   pour les autres cas) ; les autres _data sont ceux du dépôt, lus seulement. Rien n'est écrit.
   Délais courts partout : 10 s par appel au navigateur, 3 s par élément attendu, élément absent nommé.

   1. PAR DÉFAUT : la chromie est celle de config.json, quel que soit le réglage du téléphone
      (jour sur un téléphone sombre, nuit sur un téléphone clair) ; sans clé, le téléphone décide.
   2. PAS DE FLASH : config.json servi avec 600 ms de retard → à la PREMIÈRE image, la page n'affiche
      aucune chromie (attente masquée), jamais l'autre ; puis la bonne.
   2bis. 2e CHARGEMENT : la chromie lue dans config.json est gardée sur l'appareil (lelab_chromie_config, à part du
      choix de l'utilisateur) et s'applique dès la première image au chargement suivant, sans masquer la page ;
      le choix de l'utilisateur reste prioritaire.
   3. L'INTERRUPTEUR « Nuit » du volet compte bascule tout de suite, sans rechargement ; le choix est
      retenu (localStorage) et prend le pas sur config.json au rechargement.
   4. localStorage INDISPONIBLE (accès qui lève) : chromie de config.json, aucune erreur ; l'interrupteur
      bascule quand même (le choix n'est simplement pas retenu).
   5. LE LOGO de la barre : 51 px de haut (34 × 1,5), à 390 et à 1280, le fichier fourni (PNG du master).
   ============================================================ */
const fs = require('fs');
const path = require('path');
let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e) { console.error('puppeteer-core manquant → npm install'); process.exit(2); }

const BASE = (process.argv[2] || 'http://localhost:8765').replace(/\/$/, '');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/* Seul config.json est intercepté : sa COPIE GELÉE est scripts/fixtures/chromie-config.json ("chromie": "nuit"). */
const FIX = f => fs.readFileSync(path.join(__dirname, 'fixtures', 'chromie-' + f + '.json'), 'utf8');
const pause = ms => new Promise(r => setTimeout(r, ms));

let echecs = 0, total = 0;
function ok(nom, cond, detail){ total++; if (!cond) echecs++; console.log((cond ? '✓ ' : '✗ ') + nom + (cond || detail === undefined ? '' : '\n    → ' + detail)); }

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 10000 });
  async function trouver(p, sel, nom){
    const e = await p.waitForSelector(sel, { visible: true, timeout: 3000 }).catch(() => null);
    if (!e) throw new Error('élément absent : ' + nom + ' (' + sel + ')');
    return e;
  }
  async function section(nom, f){ try { await f(); } catch (e){ ok(nom + ' : la section a pu aller au bout', false, e.message.split('\n')[0]); } }

  /* Un CONTEXTE par cas : localStorage neuf. config : objet (ou null = fixture), retard en ms. */
  async function ouvrir({ config = null, retard = 0, telephone = 'dark', largeur = 390, sansStockage = false, ctx = null } = {}){
    const c = ctx || await b.createBrowserContext();
    const p = await c.newPage();
    await p.setViewport({ width: largeur, height: largeur > 960 ? 900 : 844, isMobile: largeur <= 960, deviceScaleFactor: 2 });
    await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: telephone }]);
    const erreurs = [];
    p.on('pageerror', e => erreurs.push(e.message));
    /* La chromie à la PREMIÈRE image : relevée au premier requestAnimationFrame, avant tout le reste. */
    await p.evaluateOnNewDocument(sansStock => {
      if (sansStock) Object.defineProperty(window, 'localStorage', { get(){ throw new Error('stockage refusé (sonde)'); } });
      requestAnimationFrame(() => {
        const h = document.documentElement, cs = getComputedStyle(document.body || h);
        window.__premiere = { chromie: h.dataset.chromie || null, attente: h.classList.contains('chromie-attente'),
                              visible: getComputedStyle(h).visibility !== 'hidden' && (!document.body || cs.visibility !== 'hidden'),
                              fond: getComputedStyle(h).backgroundColor };
      });
    }, sansStockage);
    await p.setRequestInterception(true);
    p.on('request', r => {
      const u = new URL(r.url());
      if (u.pathname.startsWith('/.netlify/functions/')) return r.respond({ status: 200, contentType: 'application/json', body: '{"success":true}' });
      const m = u.pathname.match(/^\/_data\/([a-z0-9-]+)\.json$/);
      if (!m) return r.continue();
      if (m[1] !== 'config') return r.continue();
      const corps = config ? JSON.stringify(config) : FIX('config');
      setTimeout(() => r.respond({ status: 200, contentType: 'application/json', body: corps }).catch(() => {}), m[1] === 'config' ? retard : 0);
    });
    await p.goto(BASE + '/admin/', { waitUntil: 'networkidle0' });
    await p.waitForFunction(() => document.body.classList.contains('authed') && !!document.querySelector('#avatarInit') && document.querySelector('#avatarInit').textContent.trim() !== '', { timeout: 8000 })
      .catch(() => ok('admin prêt en moins de 5 s', false));
    return { p, ctx: c, erreurs };
  }
  const chromie = p => p.evaluate(() => ({ attr: document.documentElement.dataset.chromie || null,
    fond: getComputedStyle(document.documentElement).backgroundColor, attente: document.documentElement.classList.contains('chromie-attente') }));
  const NUIT = 'rgb(26, 21, 38)', JOUR = 'rgb(202, 180, 255)';
  const cfg = ch => { const c = JSON.parse(FIX('config')); if (ch) c.chromie = ch; else delete c.chromie; return c; };

  /* 1. PAR DÉFAUT */
  await section('défaut', async () => {
    for (const [nom, conf, tel, attr, fond] of [['config « jour », téléphone sombre', cfg('jour'), 'dark', 'jour', JOUR],
                                                ['config « nuit », téléphone clair', cfg('nuit'), 'light', 'nuit', NUIT],
                                                ['config sans clé, téléphone clair', cfg(null), 'light', null, JOUR]]){
      const { p, ctx } = await ouvrir({ config: conf, telephone: tel });
      const c = await chromie(p);
      ok(`défaut : ${nom} → ${attr || 'le téléphone'} (${fond === JOUR ? 'jour' : 'nuit'})`, c.attr === attr && c.fond === fond && !c.attente, JSON.stringify(c));
      await ctx.close();
    }
  });

  /* 2. PAS DE FLASH */
  await section('flash', async () => {
    for (const [conf, tel] of [[cfg('jour'), 'dark'], [cfg('nuit'), 'light']]){
      const { p, ctx } = await ouvrir({ config: conf, telephone: tel, retard: 600 });
      const prem = await p.evaluate(() => window.__premiere);
      const attendu = conf.chromie;
      ok(`pas de flash (config « ${attendu} » en retard, téléphone ${tel === 'dark' ? 'sombre' : 'clair'}) : première image masquée ou déjà « ${attendu} »`,
        prem && (prem.chromie === attendu || (!prem.visible && prem.attente)), JSON.stringify(prem));
      const c = await chromie(p);
      ok(`puis « ${attendu} », page visible`, c.attr === attendu && !c.attente, JSON.stringify(c));
      await ctx.close();
    }
  });

  /* 2bis. 2e CHARGEMENT */
  await section('2e chargement', async () => {
    const { p, ctx } = await ouvrir({ config: cfg('nuit'), telephone: 'light', retard: 600 });
    const garde = await p.evaluate(() => { try { return [localStorage.getItem('lelab_chromie_config'), localStorage.getItem('lelab_chromie')]; } catch (e){ return ['erreur']; } });
    ok('1er chargement : la chromie de config.json est gardée sur l’appareil, à part du choix de l’utilisateur', garde[0] === 'nuit' && garde[1] === null, JSON.stringify(garde));
    await p.close();
    const second = await ouvrir({ config: cfg('nuit'), telephone: 'light', retard: 600, ctx });
    const prem = await second.p.evaluate(() => window.__premiere);
    ok('2e chargement : « nuit » dès la première image, page non masquée (config.json en retard)', prem && prem.chromie === 'nuit' && !prem.attente && prem.visible, JSON.stringify(prem));
    await second.p.close();
    /* Le choix de l'utilisateur reste prioritaire sur la chromie gardée. */
    const pc = await ctx.newPage();
    await pc.goto(BASE + '/admin/charte.html'); await pc.evaluate(() => localStorage.setItem('lelab_chromie', 'jour')); await pc.close();
    const troisieme = await ouvrir({ config: cfg('nuit'), telephone: 'dark', retard: 600, ctx });
    const prem3 = await troisieme.p.evaluate(() => window.__premiere);
    ok('choix de l’utilisateur (« jour ») prioritaire sur la chromie gardée (« nuit »), dès la première image', prem3 && prem3.chromie === 'jour' && !prem3.attente, JSON.stringify(prem3));
    await ctx.close();
  });

  /* 3. L'INTERRUPTEUR */
  await section('interrupteur', async () => {
    const { p, ctx, erreurs } = await ouvrir();
    await (await trouver(p, '#avatarInit', 'l’avatar')).click();
    const inter = await trouver(p, '#voletCompte .vc-nuit', 'l’interrupteur « Nuit » du volet');
    const avant = await p.evaluate(() => ({ coche: document.querySelector('#voletCompte .vc-nuit input').checked, txt: document.querySelector('#voletCompte .vc-nuit').innerText.trim() }));
    ok('interrupteur : « Nuit », coché en nuit', /^Nuit/.test(avant.txt) && avant.coche === true, JSON.stringify(avant));
    await inter.click();
    const c1 = await chromie(p);
    const memo = await p.evaluate(() => { try { return localStorage.getItem('lelab_chromie'); } catch (e){ return 'erreur'; } });
    ok('interrupteur : bascule en jour tout de suite, sans rechargement', c1.attr === 'jour' && c1.fond === JOUR, JSON.stringify(c1));
    ok('interrupteur : le choix est retenu sur l’appareil', memo === 'jour', memo);
    const logo = await p.evaluate(() => [...document.querySelectorAll('.barre-logo img')].filter(i => i.getClientRects().length).map(i => i.getAttribute('src')));
    ok('interrupteur : le logo suit (noir en jour)', logo.length === 1 && /noir-h\.png$/.test(logo[0]), JSON.stringify(logo));
    await p.reload({ waitUntil: 'networkidle0' });
    await p.waitForFunction(() => document.body.classList.contains('authed'), { timeout: 5000 }).catch(() => {});
    const c2 = await chromie(p);
    ok('rechargement : le choix de l’appareil prend le pas sur config.json (« nuit »)', c2.attr === 'jour' && c2.fond === JOUR, JSON.stringify(c2));
    await (await trouver(p, '#avatarInit', 'l’avatar')).click();
    await (await trouver(p, '#voletCompte .vc-nuit', 'l’interrupteur « Nuit »')).click();
    const c3 = await chromie(p);
    ok('interrupteur : retour en nuit', c3.attr === 'nuit' && c3.fond === NUIT, JSON.stringify(c3));
    ok('interrupteur : aucune erreur JS', erreurs.length === 0, JSON.stringify(erreurs));
    await ctx.close();
  });

  /* 4. localStorage INDISPONIBLE */
  await section('sans stockage', async () => {
    const { p, ctx, erreurs } = await ouvrir({ sansStockage: true });
    const c = await chromie(p);
    ok('sans stockage : chromie de config.json (« nuit »), page visible', c.attr === 'nuit' && c.fond === NUIT && !c.attente, JSON.stringify(c));
    await (await trouver(p, '#avatarInit', 'l’avatar')).click();
    await (await trouver(p, '#voletCompte .vc-nuit', 'l’interrupteur « Nuit »')).click();
    const c2 = await chromie(p);
    ok('sans stockage : l’interrupteur bascule quand même', c2.attr === 'jour', JSON.stringify(c2));
    ok('sans stockage : aucune erreur JS', erreurs.length === 0, JSON.stringify(erreurs));
    await ctx.close();
  });

  /* 5. LE LOGO */
  await section('logo', async () => {
    for (const largeur of [390, 1280]){
      const { p, ctx } = await ouvrir({ largeur });
      const l = await p.evaluate(() => [...document.querySelectorAll('.barre-logo img')].filter(i => i.getClientRects().length)
        .map(i => ({ src: i.getAttribute('src'), h: Math.round(i.getBoundingClientRect().height), ratio: +(i.naturalWidth / i.naturalHeight).toFixed(3), rendu: +(i.getBoundingClientRect().width / i.getBoundingClientRect().height).toFixed(3) })));
      ok(`logo (${largeur}) : 51 px de haut (34 × 1,5), le PNG fourni, sans déformation`, l.length === 1 && l[0].h === 51 && /logo-lelab(-plus)?-blanc-h\.png$/.test(l[0].src) && Math.abs(l[0].ratio - l[0].rendu) < 0.02, JSON.stringify(l));
      await ctx.close();
    }
  });

  await b.close();
  console.log(`\n${total - echecs}/${total} vérifications passées`);
  process.exit(echecs ? 1 : 0);
})();
