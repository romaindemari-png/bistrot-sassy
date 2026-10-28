#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LE STUDIO EN TROIS PAS (bout 8, LELAB-DESIGN §5 point 4) — et « Envoyer sur Instagram »
   ═══════════════════════════════════════════════════════════════════════════
   L'ÉCRAN :
     S1. le sujet d'entrée est le plus frais du site : le plat du jour s'il est en ligne et a des produits,
         sinon le prochain événement, sinon la carte — et la phrase d'entrée le dit ;
     S2. un sujet sans matière (aucun événement à venir, plat du jour éteint) se voit mais ne se choisit pas ;
     S3. trois pas, et rien d'autre : plus d'écran 5/5, plus de post final en double, plus de tiroir d'aperçu ;
     S4. téléphone, pas 2 : le pied ne masque jamais le bas de l'aperçu (constaté sur iPhone le 27/10) ;
     S5. téléphone, pas 3 : la vignette ouvre l'image seule en plein écran, fond encre, fermée d'un geste ;
     S6. desktop : l'aperçu est à droite, dans un téléphone, aux trois pas.
     S7. pas 2, SANS DÉFILER : le visuel est entier dans la fenêtre — sous le titre et au-dessus du pied (390×844),
         dans le cadre et dans la fenêtre (1280×800) — en Story comme en Post (maquette, 28/10).
     S8. le cadre Instagram (en-tête de compte, icônes, horodatage, légende) : visible en desktop pour un Post
         seulement ; en Story et dans le pas 2 du téléphone, le visuel seul.
     S9. un sujet indisponible : contour en pointillés, ni papier ni grain, texte en --texte (LELAB-DESIGN §2).
     S10. la carte en Story porte TOUS les plats de Sassy sur l'image (on compte les plats que le studio donne au
          moteur pour peindre l'export, pas une variable d'affichage).
     S11. téléphone 390×844, pas 2, carte : « Modifier dans la carte » est entier au-dessus du pied, sans défiler,
          en Story et en Post.
     S12. pas 2 « Quelle mise en page ? » : trois silhouettes (Classique, Centré, Pleine photo) au format du post ;
          Classique seule choisie ; Centré et Pleine photo inertes (aria-disabled, un toucher ne change rien) ;
          tout se voit sans défiler (silhouettes et légende au-dessus du pied à 390×844 ; Continuer dans la fenêtre
          à 1280×800).
   L'ENVOI (ce qui ENVOIE — rouge sur le code d'avant, vert après) :
     E1. desktop : l'image se télécharge (un fichier par visuel) et la légende + hashtags sont copiés ;
     E2. téléphone : la légende est copiée PUIS le partage du téléphone s'ouvre avec les fichiers, DANS le geste
         (aucune attente entre le toucher et navigator.share — sur iPhone le geste se perdrait) ;
     E3. ce que fait le bouton est écrit AVANT le clic ;
     E4. un sujet photo sans photo ne part pas ;
     E5. rien n'est publié ni écrit : ni publish-instagram, ni upload-image, ni save-data.
   Le réseau est intercepté (generate-caption répond une légende témoin) ; le partage, le presse-papier et les
   téléchargements sont remplacés par des enregistreurs : on mesure ce qui est APPELÉ, avec quoi.

   USAGE :  node scripts/test-studio.js <port>      (serveur statique sur la racine du dépôt)
   ═══════════════════════════════════════════════════════════════════════════ */
const PORT   = process.argv[2] || '8080';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE   = `http://localhost:${PORT}/admin/`;
const wait   = ms => new Promise(r => setTimeout(r, ms));
const fs = require('fs'), path = require('path');
const lire = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', '_data', f), 'utf8'));

let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e){ console.error('puppeteer-core manquant → npm install'); process.exit(2); }

const LEGENDE = 'Ce soir, la carte change. On vous garde une table ?';
const TAGS = ['#bistrotsassy', '#marseille'];

/* Les enregistreurs posés AVANT les scripts de la page : partage, presse-papier, téléchargements. */
function enregistreurs(telephone){
  window.__traces = { copie: [], partage: [], telecharge: [], ordre: [] };
  try { localStorage.setItem('lelab_plan', 'lelab_plus'); } catch (_){}
  window.__LELAB_TEMPS = 0.02;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: t => { window.__traces.copie.push(t); window.__traces.ordre.push('copie'); return Promise.resolve(); } } });
  if (telephone){
    navigator.canShare = d => !!(d && d.files && d.files.length);
    navigator.share = d => {
      window.__traces.partage.push((d.files || []).map(f => ({ nom: f.name, type: f.type, taille: f.size })));
      window.__traces.ordre.push('partage');
      return Promise.resolve();
    };
  } else {
    navigator.canShare = undefined; navigator.share = undefined;
  }
  const clic = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function(){
    if (this.download){ window.__traces.telecharge.push({ nom: this.download, blob: /^blob:/.test(this.href) }); window.__traces.ordre.push('telecharge'); return; }
    return clic.call(this);
  };
}

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const fails = [];
  const ecritures = [];

  /* Une page neuve, dans son propre contexte (stockage vierge). `donnees` remplace des fichiers de _data. */
  async function page(L, { telephone = L < 900, donnees = {} } = {}){
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport({ width: L, height: L < 900 ? 844 : 900, isMobile: telephone, hasTouch: telephone });
    await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await p.evaluateOnNewDocument(enregistreurs, telephone);
    await p.setRequestInterception(true);
    p.on('request', r => {
      const u = r.url();
      if (/publish-instagram|upload-image|save-data/.test(u)){ ecritures.push(u); return r.respond({ status: 500, body: '{}' }); }
      if (/generate-caption/.test(u)) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ caption: LEGENDE, hashtags: TAGS }) });
      const m = u.match(/\/_data\/([a-z-]+\.json)/);
      if (m && donnees[m[1]]) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(donnees[m[1]]) });
      r.continue();
    });
    p.on('pageerror', e => fails.push(`JS/ ${L} px : ${e.message}`));
    await p.goto(BASE, { waitUntil: 'networkidle0' });
    await p.evaluate(() => handlePlusClick());
    await wait(900);
    return { p, ctx };
  }
  /* Une section qui casse ne doit pas taire les suivantes : l'exception devient un échec, nommé. */
  const essai = async (nom, fn) => { try { await fn(); } catch (e){ fails.push(`${nom}/ la sonde n'a pas pu jouer : ${String(e.message).split('\n')[0]}`); } };
  const au = async (p, n) => { await p.evaluate(n => goStep(n), n); await wait(n === 3 ? 2600 : 700); };

  /* ── S1. LE SUJET D'ENTRÉE, LU DANS LES DONNÉES ── */
  const cfg = lire('config.json');
  const cfgDujour = JSON.parse(JSON.stringify(cfg));
  cfgDujour.blocs.optionnels.dujour.actif = true;
  const demain = new Date(Date.now() + 86400000);
  const isoDemain = demain.getFullYear() + '-' + String(demain.getMonth() + 1).padStart(2, '0') + '-' + String(demain.getDate()).padStart(2, '0');
  const evAVenir = [{ date: isoDemain, heure: '20:00', titre: 'SOIRÉE-SONDE', description: '' }];
  await essai('S1', async () => { for (const [cas, donnees, attendu, phrase] of [
    ['rien de frais', { 'events.json': [] }, 'sassy-carte', /carte est prête à poster/],
    ['un événement à venir', { 'events.json': evAVenir }, 'sassy-event', /prochain événement est prêt à poster/],
    ['le plat du jour en ligne', { 'events.json': evAVenir, 'config.json': cfgDujour }, 'sassy-dujour', /plat du jour est prêt à poster/],
  ]){
    const { p, ctx } = await page(390, { donnees });
    const r = await p.evaluate(() => ({ theme: currentTheme, pas: currentStep, phrase: document.getElementById('studioEntree').textContent }));
    if (r.theme !== 'custom:' + attendu) fails.push(`S1/ ${cas} : sujet d'entrée « ${r.theme} » au lieu de « custom:${attendu} »`);
    if (!phrase.test(r.phrase))          fails.push(`S1/ ${cas} : la phrase d'entrée dit « ${r.phrase} »`);
    if (r.pas !== 1)                     fails.push(`S1/ ${cas} : le studio ouvre au pas ${r.pas} au lieu du pas 1`);
    if (cas === 'un événement à venir'){
      const sous = await p.evaluate(() => (document.querySelector('.sujet[data-theme="custom:sassy-event"] .sujet-s') || {}).textContent || '');
      if (!/SOIRÉE-SONDE/.test(sous)) fails.push(`S1/ le sujet événement ne dit pas lequel (« ${sous} »)`);
    }
    await ctx.close();
  } });

  /* ── S2 + S3 + S4 + S5 : téléphone, Sassy tel quel (plat du jour éteint, aucun événement à venir) ── */
  await essai('S2-S5', async () => {
    const { p, ctx } = await page(390, { donnees: { 'events.json': [] } });
    const s2 = await p.evaluate(() => {
      const ev = document.querySelector('.sujet[data-theme="custom:sassy-event"]');
      const dj = document.querySelector('.sujet[data-theme="custom:sassy-dujour"]');
      const avant = currentTheme;
      if (ev) ev.click();
      return { ev: ev && ev.getAttribute('aria-disabled'), dj: dj && dj.getAttribute('aria-disabled'),
               visible: !!(ev && ev.getBoundingClientRect().height), garde: currentTheme === avant };
    });
    if (s2.ev !== 'true' || !s2.visible) fails.push('S2/ l\'événement sans date à venir n\'est pas affiché en sujet sans matière');
    if (s2.dj !== 'true')               fails.push('S2/ le plat du jour, éteint sur le site, reste choisissable');
    if (!s2.garde)                      fails.push('S2/ toucher un sujet sans matière l\'a choisi');

    const s3 = await p.evaluate(() => ({
      pas: [...document.querySelectorAll('#studio-unlocked .step-block')].map(b => b.dataset.stepId).join(','),
      total: STEP_COUNT,
      morts: ['finalPost', 'fpMedia', 'preview-backdrop', 'studioBar', 'igStatusStudio'].filter(id => document.getElementById(id))
               .concat(document.querySelector('.mini-preview') ? ['.mini-preview'] : []),
    }));
    if (s3.pas !== 'quoi,page,legende' || s3.total !== 3) fails.push(`S3/ pas du studio : « ${s3.pas} » (${s3.total}) au lieu de quoi,page,legende`);
    if (s3.morts.length) fails.push(`S3/ restes de l'ancien studio dans le DOM : ${s3.morts.join(', ')}`);

    // S4 — pas 2, on descend au bas de la page : le bas de l'aperçu reste au-dessus du pied.
    await au(p, 2);
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await wait(500);
    const s4 = await p.evaluate(() => {
      const ap = document.querySelector('#apercuPlace .phone-screen'), pied = document.getElementById('studioFoot');
      const a = ap && ap.getBoundingClientRect(), f = pied.getBoundingClientRect();
      return a ? { bas: Math.round(a.bottom), pied: Math.round(f.top), dansLePas: true } : { dansLePas: false };
    });
    if (!s4.dansLePas) fails.push('S4/ téléphone : l\'aperçu n\'est pas dans le pas 2');
    else if (s4.bas > s4.pied + 1) fails.push(`S4/ téléphone, pas 2 : le pied masque le bas de l'aperçu (${s4.bas - s4.pied} px sous le pied)`);

    // S5 — pas 3 : la vignette, puis l'image seule en plein écran, fermée d'un toucher puis par Échap.
    await au(p, 3);
    const v = await p.evaluate(() => { const el = document.getElementById('studioVignette'); const r = el.getBoundingClientRect();
      return { vue: !el.hidden && r.width > 0, src: (el.querySelector('img').getAttribute('src') || '').slice(0, 11) }; });
    if (!v.vue || v.src !== 'data:image/') fails.push(`S5/ pas 3 : pas de vignette de l'image (vue=${v.vue}, src=${v.src})`);
    await p.click('#studioVignette'); await wait(200);
    const pe = await p.evaluate(() => { const el = document.getElementById('pleinEcran'); const r = el.getBoundingClientRect();
      return { ouvert: !el.hidden, couvre: r.width >= innerWidth - 1 && r.height >= innerHeight - 1, fond: getComputedStyle(el).backgroundColor,
               encre: getComputedStyle(document.documentElement).getPropertyValue('--encre').trim() }; });
    if (!pe.ouvert || !pe.couvre) fails.push('S5/ la vignette n\'ouvre pas l\'image en plein écran');
    if (pe.fond !== 'rgb(26, 25, 23)') fails.push(`S5/ plein écran : fond ${pe.fond} au lieu de l'encre ${pe.encre}`);
    await p.mouse.click(195, 300); await wait(200);
    if (await p.evaluate(() => !document.getElementById('pleinEcran').hidden)) fails.push('S5/ un toucher ne ferme pas le plein écran');
    await p.click('#studioVignette'); await wait(150); await p.keyboard.press('Escape'); await wait(150);
    if (await p.evaluate(() => !document.getElementById('pleinEcran').hidden)) fails.push('S5/ Échap ne ferme pas le plein écran');
    await ctx.close();
  });

  /* ── S7 + S8 + S9 ── */
  await essai('S7-S9', async () => {
    for (const [L, H] of [[390, 844], [1280, 800]]) for (const fmt of ['story', 'portrait']){
      const ctx = await b.createBrowserContext(); const p = await ctx.newPage();
      await p.setViewport({ width: L, height: H, isMobile: L < 900, hasTouch: L < 900 });
      await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await p.evaluateOnNewDocument(enregistreurs, L < 900);
      await p.goto(BASE, { waitUntil: 'networkidle0' });
      await p.evaluate(() => handlePlusClick()); await wait(700);
      await p.evaluate(f => { const b = document.querySelector('#fmtRow .fmt[data-fmt="' + f + '"]'); if (b) b.click(); goStep(2); }, fmt);
      await wait(900);
      const r = await p.evaluate(() => {
        const v = document.querySelector('#apercu .phone-screen').getBoundingClientRect();
        const t = document.querySelector('[data-step-id="page"] .studio-q').getBoundingClientRect();
        const pied = document.getElementById('studioFoot').getBoundingClientRect();
        const desk = matchMedia('(min-width:961px)').matches;
        const vis = [...document.querySelectorAll('#apercu .ig-img, #apercu .ig-typo')].find(x => getComputedStyle(x).display !== 'none');
        const iv = vis ? vis.getBoundingClientRect() : null;
        return { desk, scroll: Math.round(scrollY), haut: Math.round(v.top), bas: Math.round(v.bottom), titre: Math.round(t.bottom), pied: Math.round(pied.top),
                 h: innerHeight, w: Math.round(v.width), legende: Math.round(document.getElementById('apercuLegende').getBoundingClientRect().bottom),
                 compteur: (() => { const c = document.getElementById('slideControls'); const q = c.getBoundingClientRect(); return getComputedStyle(c).display === 'none' ? null : Math.round(q.bottom); })(), visHaut: iv && Math.round(iv.top), visBas: iv && Math.round(iv.bottom),
                 cadre: ['.ig-top', '.ig-actions', '.ig-likes', '.ig-cap'].filter(q => { const el = document.querySelector('#apercu ' + q); return el && el.getBoundingClientRect().height > 0; }),
                 mises: (() => { const m = document.getElementById('mises').getBoundingClientRect(); return { haut: Math.round(m.top), bas: Math.round(m.bottom) }; })(),
                 cta: Math.round(document.getElementById('studioPrimaryFoot').getBoundingClientRect().bottom),
                 silos: [...document.querySelectorAll('#mises .mise')].map(m => ({ id: m.dataset.mise, n: m.querySelector('.mise-n').textContent,
                   choisie: m.getAttribute('aria-pressed') === 'true', inerte: m.getAttribute('aria-disabled') === 'true',
                   ratio: (() => { const r = m.querySelector('.silo').getBoundingClientRect(); return +(r.width / r.height).toFixed(2); })() })),
                 legendeMises: (document.querySelector('#mises .mises-l') || {}).textContent || '' };
      });
      const nom = `${L}×${H} ${fmt === 'story' ? 'Story' : 'Post'}`;
      if (r.scroll) fails.push(`S7/ ${nom} : la page est défilée (${r.scroll} px) au pas 2`);
      if (!r.desk){
        if (r.haut < r.titre - 1) fails.push(`S7/ ${nom} : le visuel passe sous le titre (${r.haut} < ${r.titre})`);
        if (r.bas > r.pied + 1)   fails.push(`S7/ ${nom} : le visuel descend sous le pied (${r.bas} > ${r.pied}) — il faudrait défiler`);
        if (r.compteur !== null && r.compteur > r.pied + 1) fails.push(`S7/ ${nom} : le compteur d'images passe sous le pied (${r.compteur} > ${r.pied})`);
      } else {
        if (r.bas > r.h || r.haut < 0) fails.push(`S7/ ${nom} : le cadre de l'aperçu sort de la fenêtre (${r.haut} → ${r.bas}, fenêtre ${r.h})`);
        if (r.legende > r.h) fails.push(`S7/ ${nom} : « Aperçu en taille réelle » sort de la fenêtre (${r.legende} > ${r.h})`);
        if (r.visHaut < r.haut - 1 || r.visBas > r.bas + 1) fails.push(`S7/ ${nom} : le visuel déborde du cadre (${r.visHaut} → ${r.visBas} dans ${r.haut} → ${r.bas})`);
      }
      const cadreAttendu = r.desk && fmt === 'portrait';
      if (cadreAttendu && r.cadre.length !== 4) fails.push(`S8/ ${nom} : le cadre Instagram du Post est incomplet (visibles : ${r.cadre.join(', ') || 'aucun'})`);
      if (!cadreAttendu && r.cadre.length) fails.push(`S8/ ${nom} : un cadre Instagram est visible (${r.cadre.join(', ')}) — attendu : le visuel seul`);
      // S12 — les silhouettes
      const ids = r.silos.map(x => x.id).join(',');
      if (ids !== 'classique,centre,pleine' || r.silos.map(x => x.n).join(',') !== 'Classique,Centré,Pleine photo') fails.push(`S12/ ${nom} : silhouettes « ${r.silos.map(x => x.n).join(', ')} »`);
      if (r.silos.filter(x => x.choisie).map(x => x.id).join() !== 'classique') fails.push(`S12/ ${nom} : choisie(s) : ${r.silos.filter(x => x.choisie).map(x => x.id).join() || 'aucune'} (attendu Classique seule)`);
      if (r.silos.filter(x => x.inerte).map(x => x.id).join() !== 'centre,pleine') fails.push(`S12/ ${nom} : inertes : ${r.silos.filter(x => x.inerte).map(x => x.id).join() || 'aucune'}`);
      const attendu = fmt === 'story' ? 0.56 : 0.8;
      if (r.silos.some(x => Math.abs(x.ratio - attendu) > 0.03)) fails.push(`S12/ ${nom} : silhouettes au rapport ${r.silos.map(x => x.ratio).join('/')} au lieu de ${attendu}`);
      if (r.legendeMises.trim() !== 'Classique · votre mise en page habituelle') fails.push(`S12/ ${nom} : légende des silhouettes « ${r.legendeMises} »`);
      if (!r.desk && r.mises.bas > r.pied + 1) fails.push(`S12/ ${nom} : les silhouettes passent sous le pied (${r.mises.bas} > ${r.pied})`);
      if (r.desk && (r.mises.bas > r.h || r.cta > r.h)) fails.push(`S12/ ${nom} : silhouettes ou Continuer hors de la fenêtre (${r.mises.bas}, ${r.cta} > ${r.h})`);
      const inerte = await p.evaluate(() => { const avant = [...document.querySelectorAll('#mises .mise')].map(m => m.outerHTML).join('');
        document.querySelectorAll('#mises .mise[aria-disabled="true"]').forEach(m => m.click());
        return avant === [...document.querySelectorAll('#mises .mise')].map(m => m.outerHTML).join(''); });
      if (!inerte) fails.push(`S12/ ${nom} : toucher une silhouette indisponible a changé quelque chose`);
      if (L < 900){
        const lien = await p.evaluate(() => { const l = document.getElementById('studioModifier'), f = document.getElementById('studioFoot');
          const a = l.getBoundingClientRect(), b = f.getBoundingClientRect(); return { vu: !l.hidden && a.height > 0, bas: Math.round(a.bottom), pied: Math.round(b.top), haut: Math.round(a.top) }; });
        if (!lien.vu) fails.push(`S11/ ${nom} : « Modifier dans la carte » n'est pas affiché`);
        else if (lien.bas > lien.pied + 1) fails.push(`S11/ ${nom} : « Modifier dans la carte » passe sous le pied (bas ${lien.bas} > pied ${lien.pied}) — il faut défiler pour le lire`);
      }
      if (L < 900 && fmt === 'portrait'){
        const s9 = await p.evaluate(() => {
          goStep(1);
          const c = document.querySelector('.sujet[aria-disabled="true"]');
          if (!c) return null;
          const cs = getComputedStyle(c), apres = getComputedStyle(c, '::after');
          const texte = getComputedStyle(document.documentElement).getPropertyValue('--texte').trim();
          const hex = x => '#' + x.match(/\d+/g).slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('').toUpperCase();
          return { bord: cs.borderTopStyle, fond: cs.backgroundColor, grain: apres.content !== 'none' && apres.backgroundImage !== 'none',
                   sous: hex(getComputedStyle(c.querySelector('.sujet-s')).color), texte: texte.toUpperCase() };
        });
        if (!s9) fails.push('S9/ aucun sujet indisponible à mesurer (setup KO)');
        else {
          if (s9.bord !== 'dashed') fails.push(`S9/ sujet indisponible : contour « ${s9.bord} » au lieu de pointillés`);
          if (s9.fond !== 'rgba(0, 0, 0, 0)') fails.push(`S9/ sujet indisponible : un fond est posé (${s9.fond})`);
          if (s9.grain) fails.push('S9/ sujet indisponible : le grain papier est posé dessus');
          if (s9.sous !== s9.texte) fails.push(`S9/ sujet indisponible : sous-titre en ${s9.sous} au lieu de --texte ${s9.texte}`);
        }
      }
      await ctx.close();
    }
  });

  /* ── S10. LA CARTE EN STORY : TOUS LES PLATS SUR L'IMAGE ── */
  await essai('S10', async () => {
    const carte = lire('carte.json');
    const total = Object.values(carte).filter(Array.isArray).reduce((t, l) => t + l.filter(d => d && d.nom).length, 0);
    const { p, ctx } = await page(390, { donnees: { 'events.json': [] } });
    const n = await p.evaluate(async () => {
      const vrai = MOTEUR_V2.rasteriseur, vus = [];
      MOTEUR_V2.rasteriseur = th => { const f = vrai(th); return f && ((W, h, s, fmt) => { vus.push({ W, s, fmt }); return f(W, h, s, fmt); }); };
      document.querySelector('#fmtRow .fmt[data-fmt="story"]').click();
      await bakeAllVisuals();
      MOTEUR_V2.rasteriseur = vrai;
      const exp = vus.filter(v => v.fmt === 'story' && v.W >= 1000);
      if (!exp.length) return { aucun: true };
      const sl = exp[exp.length - 1].s;
      const plats = sl.cats ? sl.cats.reduce((t, c) => t + c.dishes.length, 0) : (sl.dishes || []).length;
      return { images: exp.length, plats };
    });
    if (n.aucun) fails.push('S10/ aucun export story rasterisé (setup KO)');
    else if (n.plats !== total) fails.push(`S10/ la story de la carte peint ${n.plats} plat(s) sur ${total} — la carte de Sassy doit tenir entière`);
    await ctx.close();
  });

  /* ── S6. DESKTOP : l'aperçu à droite, dans un téléphone, aux trois pas ── */
  await essai('S6-E1', async () => {
    const { p, ctx } = await page(1280, { donnees: { 'events.json': [] } });
    for (const n of [1, 2, 3]){
      await au(p, n);
      const r = await p.evaluate(() => {
        const col = document.getElementById('apercuCol'), ph = col.querySelector('.phone-screen');
        const c = document.querySelector('.compose').getBoundingClientRect(), a = col.getBoundingClientRect();
        return { dansCol: !!col.querySelector('#apercu .phone-screen'), adroite: a.left >= c.right, largeur: ph ? Math.round(ph.getBoundingClientRect().width) : 0,
                 vignette: (() => { const v = document.getElementById('studioVignette'); return v.getBoundingClientRect().width > 0; })() };
      });
      if (!r.dansCol || !r.adroite) fails.push(`S6/ desktop, pas ${n} : l'aperçu n'est pas dans la colonne de droite`);
      if (r.largeur < 330) fails.push(`S6/ desktop 1280×900, pas ${n} : l'écran de l'aperçu mesure ${r.largeur} px (attendu ≥ 330)`);
      if (r.vignette) fails.push(`S6/ desktop, pas ${n} : la vignette du téléphone est affichée (l'aperçu est déjà permanent)`);
    }
    /* ── E1. DESKTOP : télécharger l'image, copier la légende ── */
    const e3 = await p.evaluate(() => ({ promesse: document.getElementById('studioPromesse').textContent, actif: !document.getElementById('studioPrimaryFoot').disabled,
                                          libelle: document.getElementById('studioPrimaryFoot').textContent.trim() }));
    if (e3.libelle !== 'Envoyer sur Instagram' || !e3.actif) fails.push(`E1/ desktop, pas 3 : le bouton dit « ${e3.libelle} » (actif=${e3.actif})`);
    if (!/télécharge/.test(e3.promesse) || !/copie/.test(e3.promesse)) fails.push(`E3/ desktop : avant le clic, le bouton ne dit pas qu'il télécharge et copie (« ${e3.promesse} »)`);
    await p.click('#studioPrimaryFoot'); await wait(400);
    const t = await p.evaluate(() => ({ ...window.__traces, n: (envoiPrep && envoiPrep.fichiers.length) || 0 }));
    if (!t.n || t.telecharge.length !== t.n) fails.push(`E1/ desktop : ${t.telecharge.length} téléchargement(s) pour ${t.n} visuel(s)`);
    if (t.telecharge.some(x => !x.blob || !/\.jpg$|\.png$/.test(x.nom))) fails.push(`E1/ desktop : fichiers téléchargés mal formés : ${JSON.stringify(t.telecharge)}`);
    if (t.copie[0] !== LEGENDE + '\n\n' + TAGS.join(' ')) fails.push(`E1/ desktop : copié « ${t.copie[0]} » au lieu de la légende et ses hashtags`);
    await ctx.close();
  });

  /* ── E2. TÉLÉPHONE : copier, PUIS ouvrir le partage avec les fichiers, dans le geste ── */
  await essai('E2-E4', async () => {
    const { p, ctx } = await page(390, { donnees: { 'events.json': [] } });
    await au(p, 3);
    const avant = await p.evaluate(() => document.getElementById('studioPromesse').textContent);
    if (!/copie/.test(avant) || !/Instagram/.test(avant)) fails.push(`E3/ téléphone : avant le clic, le bouton ne dit pas ce qu'il fait (« ${avant} »)`);
    /* Dans le geste : on mesure que share est appelé PENDANT le clic (synchrone), pas après une attente. */
    const t = await p.evaluate(() => {
      document.getElementById('studioPrimaryFoot').click();
      return { ...window.__traces, n: envoiPrep.fichiers.length };
    });
    if (t.partage.length !== 1) fails.push(`E2/ téléphone : le partage n'est pas ouvert DANS le geste (${t.partage.length} appel(s) pendant le clic)`);
    else {
      if (t.partage[0].length !== t.n) fails.push(`E2/ téléphone : ${t.partage[0].length} fichier(s) partagé(s) pour ${t.n} visuel(s)`);
      if (t.partage[0].some(f => !/^image\/(jpeg|png)$/.test(f.type) || f.taille < 1000)) fails.push(`E2/ téléphone : fichiers partagés mal formés : ${JSON.stringify(t.partage[0])}`);
    }
    if (t.ordre.join(',') !== 'copie,partage') fails.push(`E2/ téléphone : ordre « ${t.ordre.join(',')} » au lieu de copie puis partage`);
    if (t.telecharge.length) fails.push('E2/ téléphone : un téléchargement est parti en plus du partage');

    /* ── E4. UN SUJET PHOTO SANS PHOTO NE PART PAS ── */
    const e4 = await p.evaluate(async () => {
      goStep(1);
      const c = document.querySelector('.sujet[data-theme="custom:sassy-photo"]'); if (c) c.click();
      goStep(3); await new Promise(r => setTimeout(r, 900));
      window.__traces.partage.length = 0;
      const btn = document.getElementById('studioPrimaryFoot');
      btn.click();
      return { inactif: btn.disabled, partage: window.__traces.partage.length, libelle: btn.textContent };
    });
    if (!e4.inactif || e4.partage) fails.push(`E4/ sujet photo sans photo : le bouton « ${e4.libelle} » est actif ou a envoyé (${e4.partage})`);
    await ctx.close();
  });

  if (ecritures.length) fails.push(`E5/ le studio a écrit ou publié : ${[...new Set(ecritures)].join(' · ')}`);

  await b.close();
  if (fails.length){ console.error('\n❌ STUDIO — ' + fails.length + ' échec(s)\n   ' + fails.join('\n   ') + '\n'); process.exit(1); }
  console.log('\n✅ STUDIO — trois pas · sujet d\'entrée lu dans les données (carte · événement · plat du jour) · sujets sans matière visibles, non choisissables · le pied ne masque pas l\'aperçu · vignette → plein écran encre, fermé d\'un geste · aperçu permanent à droite (desktop) · pas 2 « Quelle mise en page ? » : Classique choisie, Centré et Pleine photo inertes, tout visible sans défiler · cadre Instagram en desktop pour le Post seulement · le visuel entier sans défiler (390×844, 1280×800, Story et Post) · sujet indisponible en pointillés, sans grain · la carte entière en story · « Modifier dans la carte » au-dessus du pied · Envoyer : desktop télécharge + copie, téléphone copie puis partage dans le geste · une photo manquante ne part pas · rien n\'est publié ni écrit.\n');
})();
