#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   TEST DES LISTES — « ajouter une ligne » doit ajouter une ligne VISIBLE.
   ═══════════════════════════════════════════════════════════════════════════
   POURQUOI CET OUTIL EXISTE
   Le bouton « + Ajouter une entrée » de La Carte était câblé sur showToast() —
   ET SUR RIEN D'AUTRE. Il n'a JAMAIS rien ajouté. Personne ne l'a vu pendant des
   mois, et aucun harnais ne l'a attrapé, parce que :

     · le TOAST confirmait l'action → l'écran ne se contredisait pas ;
     · les tests comptaient les lignes DANS LE DOM, jamais ce qui est VISIBLE.

   C'est la famille de bugs de toute cette session (fitFinalPost, adjustStepsHeight,
   la card annonce coupée, les horaires décalés) : **un contenu coupé ne crie pas, et
   un retour qui ne LIT pas l'état réel ment en silence.**

   CE QU'IL VÉRIFIE, pour CHAQUE bouton d'ajout de l'app
     1. le nombre de lignes augmente RÉELLEMENT de 1 ;
     2. la nouvelle ligne a une hauteur et une largeur > 0 ;
     3. elle est PEINTE : display, visibility, opacity ;
     4. ⚠️ elle est ATTEIGNABLE : après scrollIntoView, son rectangle tombe bien
        DANS la zone visible de chacun de ses ancêtres qui rognent (overflow
        hidden/clip/auto/scroll). Une hauteur figée sur un contenu variable la
        laisserait « dans le DOM » mais hors du cadre — c'est précisément le piège ;
     5. elle est SAISISSABLE : son premier champ accepte une valeur ;
     6. et elle ARRIVE DANS LA SAUVEGARDE : on intercepte le POST réel de
        saveSection et on vérifie que la ligne saisie est dans la charge utile.

   USAGE
     1. servir le site :  python3 -m http.server 8080
     2. lancer le test :  node scripts/test-listes.js 8080
   Sortie non nulle si une seule liste échoue → utilisable en garde-fou.

   PRÉREQUIS : puppeteer-core + un Chrome installé.
   ═══════════════════════════════════════════════════════════════════════════ */
const PORT   = process.argv[2] || '8080';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch { console.error('✗ puppeteer-core manquant.  npm i -D puppeteer-core'); process.exit(1); }

/* ⚠️ IL N'Y A PLUS DE LISTE ÉCRITE EN DUR — et c'est le cœur de ce fichier.
   Avant, il connaissait « dujour », « #btn-add-dujour », « .dujour-item »… soit le NOM DES BLOCS
   D'UN CLIENT. Chez Masa le bloc s'appelle « cematin » : le garde-fou n'y aurait rien testé, et
   serait resté VERT. Un garde-fou qui ne connaît qu'un fork ne garde rien.

   Il DÉCOUVRE désormais tout, et ne suppose rien :
     · les sections éditables → les onclick openEdit() des cards de « Mon site » ;
     · les listes             → chaque bouton .btn-add trouvé dans la section ;
     · la LIGNE ajoutée       → en comparant le DOM avant/après le clic. On ne sait pas quelle
       classe portera la nouvelle ligne, et on n'a pas à le savoir : c'est celle dont le nombre
       augmente de 1. La structure peut changer, le test tient.
     · le CHAMP à saisir      → le premier <input>/<textarea> de la ligne apparue. */

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const erreursJS = [];
  p.on('pageerror', e => erreursJS.push(e.message));
  await p.goto(`http://localhost:${PORT}/admin/`, { waitUntil: 'networkidle0' });

  const res = await p.evaluate(async () => {
    const pause = ms => new Promise(r => setTimeout(r, ms));

    /* ⚠️ Les sections et les blocs sont DÉCOUVERTS, jamais écrits en dur (cf. l'en-tête). */
    window.__blocsDeConfig = async () => {
      const cfg = await fetch('/_data/config.json').then(r => r.ok ? r.json() : null).catch(() => null);
      const b = (cfg && cfg.blocs) || {};
      return Object.keys({ ...(b.socle || {}), ...(b.optionnels || {}) });
    };
    /* ⚠️ LE PORTEUR DE L'ACTION EST CHERCHÉ DANS LA CARD, JAMAIS À UN EMPLACEMENT FIGÉ.
       Cette sonde lisait `card.getAttribute('onclick')` : elle supposait que la CARD portait
       l'ouverture. Le jour où l'action est descendue sur un <button> interne (une card <div> n'est
       pas focusable — la nav était injoignable au clavier), la découverte a rendu une liste VIDE,
       donc ZÉRO écran testé. Le scan a refusé de passer et c'est ce qui l'a fait voir ; il n'en
       reste pas moins qu'il a fallu le réparer pour une raison qui ne le concernait pas.
       → On interroge la CARD PUIS ses descendants, et on prend le premier `openEdit(...)` trouvé.
         La card d'abord, et ce n'est pas cosmétique : un fork non encore porté la garde sur le
         <div>. La sonde tourne sur les DEUX formes sans avoir à savoir laquelle elle regarde.
       → RÈGLE : une sonde nomme CE QU'ELLE CHERCHE (une action `openEdit` dans une card), jamais
         OÙ ça se trouve. Le prochain déplacement ne doit plus la casser. */
    window.__sectionsEditables = () => [...document.querySelectorAll('#screen-monsite .site-card')]
      .map(c => {
        const m = [c, ...c.querySelectorAll('[onclick]')]
          .map(el => (el.getAttribute('onclick') || '').match(/openEdit\('([^']+)'\)/))
          .find(Boolean);
        return m && m[1];
      })
      .filter(Boolean);
    window.__donneesDesBlocs = async (fabrique) => {
      const out = {};
      for (const cle of await window.__blocsDeConfig()){
        const reel = await fetch('/_data/' + cle + '.json').then(r => r.ok ? r.json() : null).catch(() => null);
        if (reel !== null) out[cle] = fabrique ? fabrique(cle, reel) : reel;
      }
      return out;
    };

    /* ⚠️ LE CŒUR DU TEST : « présent dans le DOM » ≠ « visible ».
       On scrolle jusqu'à l'élément, puis on vérifie que son rectangle tombe DANS la
       zone visible de chaque ancêtre qui rogne. Sinon il est là… et invisible. */
    const estVraimentVisible = (el) => {
      const pb = [];
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      if (r.height <= 0 || r.width <= 0) pb.push(`taille nulle (${Math.round(r.width)}×${Math.round(r.height)})`);
      const cs = getComputedStyle(el);
      if (cs.display === 'none')      pb.push('display:none');
      if (cs.visibility === 'hidden') pb.push('visibility:hidden');
      if (parseFloat(cs.opacity) === 0) pb.push('opacity:0');
      let n = el.parentElement;
      while (n && n !== document.body) {
        const a = getComputedStyle(n);
        if (/hidden|clip|auto|scroll/.test(a.overflow + a.overflowY + a.overflowX)) {
          const c = n.getBoundingClientRect();
          const dedans = r.bottom > c.top + 1 && r.top < c.bottom - 1;
          if (!dedans) {
            const nom = (n.id ? '#' + n.id : '.' + (n.className || '').toString().trim().split(/\s+/)[0]);
            pb.push(`ROGNÉE par ${nom} (hauteur figée ? h=${a.height}, overflow=${a.overflow}) — la ligne existe mais tombe hors du cadre`);
          }
        }
        n = n.parentElement;
      }
      return pb;
    };

    const out = [];
    // Données réalistes : une entrée existante, le reste vide (le cas d'un client qui démarre).
    const donnees = () => ({
      themes: window.__themes,
      /* ⚠️ On part de la VRAIE config.json (ses `blocs`), en ne surchargeant que le plan : sans les
      blocs, aucune card n'est générée et le scan ne teste RIEN. */
      config: { ...window.__config, plan: 'lelab_plus', famille: 'food' },
      general: {},
      carte: { entrees: [{ nom: 'Tartare', description: 'Au couteau', prix: '12 €' }], plats: [], desserts: [] },
      photos: { slider: [], galerie: [] }, events: [], horaires: null,
      ...window.__blocsVides,
    });
    window.__themes = await fetch('/_data/themes.json').then(r => r.json());
    window.__config = await fetch('/_data/config.json').then(r => r.json()).catch(() => ({}));
    window.__blocsVides = await window.__donneesDesBlocs(() => []);   // chaque bloc déclaré → liste VIDE
    document.body.classList.add('authed');

    // Empreinte du DOM : combien d'éléments par classe. La ligne ajoutée est celle qui apparaît.
    const empreinte = (racine) => {
      const m = new Map();
      racine.querySelectorAll('[class]').forEach(el => {
        (el.className || '').toString().trim().split(/\s+/).filter(Boolean)
          .forEach(c => m.set(c, (m.get(c) || 0) + 1));
      });
      return m;
    };

    sassyData = donnees();
    applyPlan('lelab_plus'); renderCustomThemes(); studioReady = true;
    /* ⚠️ Les cards de « Mon site » sont GÉNÉRÉES depuis config.json : sans cet appel, la grille
       est VIDE, aucune section n'est découverte — et le scan passerait au VERT en ne testant
       RIEN. Un garde-fou qui ne trouve rien doit HURLER, pas se taire (cf. le contrôle plus bas). */
    renderSiteCards(); enregistrerSourcesDeBlocs();
    showScreen('monsite'); await pause(500);
    const sections = window.__sectionsEditables();
    if (!sections.length) return [{ nom: '(découverte)', pb: ['aucune section éditable trouvée sur « Mon site »'] }];

    for (const section of sections) {
      sassyData = donnees();
      applyPlan('lelab_plus'); renderCustomThemes(); studioReady = true;
      renderSiteCards(); enregistrerSourcesDeBlocs();
      window.__envoye = null;
      window.getToken = async () => 'jeton-de-test';
      window.authedFetch = async (url, body) => { window.__envoye = body; return { ok: true, json: async () => ({ ok: true }) }; };

      openEdit(section); await pause(700);
      const racine = document.getElementById('screen-edit');
      const boutons = [...racine.querySelectorAll('.btn-add')];
      if (!boutons.length) continue;   // section sans liste (Horaires, Infos) : rien à tester ici

      for (let i = 0; i < boutons.length; i++) {
        const r = { nom: section + (boutons.length > 1 ? ' · ' + (boutons[i].textContent || '').trim() : ''), pb: [] };
        const btn = racine.querySelectorAll('.btn-add')[i];
        const avant = empreinte(racine);

        /* ⚠️ Certains boutons d'ajout n'ajoutent PAS une ligne : ils ouvrent un SÉLECTEUR DE FICHIER
           (les photos). On ne les reconnaît PAS à leur nom — on les CONSTATE : on intercepte le clic
           sur un <input type="file">. Un test qui devine d'après un libellé se trompera au premier
           renommage ; un test qui observe le comportement, non. */
        let fichierOuvert = false;
        const clicOrigine = HTMLInputElement.prototype.click;
        HTMLInputElement.prototype.click = function(){
          if (this.type === 'file'){ fichierOuvert = true; return; }
          return clicOrigine.call(this);
        };
        try { btn.click(); await pause(400); }
        finally { HTMLInputElement.prototype.click = clicOrigine; }
        if (fichierOuvert){ r.ignore = 'sélecteur de fichier (hors périmètre de ce test)'; out.push(r); continue; }

        const apres = empreinte(racine);

        // La classe dont le compte augmente de 1 EST celle de la ligne ajoutée. On ne la suppose pas.
        let classeLigne = null;
        for (const [c, n] of apres) if (n === (avant.get(c) || 0) + 1 && !/^btn|^fld|^sc-/.test(c)) {
          if (!classeLigne || racine.querySelectorAll('.' + c).length < racine.querySelectorAll('.' + classeLigne).length) classeLigne = c;
        }
        if (!classeLigne) {
          r.pb.push('AUCUNE LIGNE AJOUTÉE — le bouton ne fait rien (aucune classe n’apparaît dans le DOM)');
          out.push(r); continue;
        }
        const lignes = racine.querySelectorAll('.' + classeLigne);
        const nouvelle = lignes[lignes.length - 1];
        r.compte = `${(avant.get(classeLigne) || 0)} → ${lignes.length} (.${classeLigne})`;

        r.pb.push(...estVraimentVisible(nouvelle));

        const champ = nouvelle.querySelector('input:not([type=checkbox]):not([type=hidden]), textarea');
        if (!champ) r.pb.push('aucun champ de saisie dans la ligne ajoutée');
        else {
          champ.focus(); champ.value = 'ZZTEST';
          champ.dispatchEvent(new Event('input', { bubbles: true }));
          if (document.activeElement !== champ) r.pb.push('le champ ne prend pas le focus');
        }

        try {
          await saveSection(); await pause(200);
          const charge = JSON.stringify(window.__envoye || {});
          if (!window.__envoye) r.pb.push('la sauvegarde n’a rien envoyé');
          else if (!charge.includes('ZZTEST')) r.pb.push('la ligne saisie N’EST PAS dans la charge utile envoyée');
        } catch (e) { r.pb.push('saveSection a levé : ' + e.message); }

        out.push(r);
      }
    }
    return out;
  });

  console.log('\n═══ LES LISTES DE L’ÉDITEUR — « ajouter » ajoute-t-il une ligne VISIBLE ? ═══\n');
  let ko = 0;
  res.forEach(r => {
    if (r.ignore) { console.log(`  · ${r.nom.padEnd(34)} ${r.ignore}`); return; }
    if (!r.pb.length) { console.log(`  ✓ ${r.nom.padEnd(34)} ${r.compte} · visible · saisissable · sauvegardée`); return; }
    ko++;
    console.log(`  ✗ ${r.nom.padEnd(22)} ${r.compte || ''}`);
    r.pb.forEach(x => console.log(`      → ${x}`));
  });
  if (erreursJS.length) console.log('\n  ⚠️ erreurs JS : ' + erreursJS.join(' | '));
  console.log(`\n──── ${ko === 0 ? '✓ ' + res.length + '/' + res.length + ' listes saines' : ko + ' liste(s) CASSÉE(S)'} ────\n`);
  await b.close();
  process.exit(ko ? 1 : 0);
})();
