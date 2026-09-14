/* ============================================================
   BISTROT SASSY — CMS Loader v3
   Connecte l'index.html aux fichiers JSON de Decap CMS
   À placer juste avant </body> dans index.html
   ============================================================ */

(async function () {

  async function loadJSON(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`[Sassy CMS] Impossible de charger ${path}`, e);
      return null;
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     L'ÉCHAPPEMENT — TOUTE donnée client qui entre dans un innerHTML passe ici.
     ══════════════════════════════════════════════════════════════════════
     ⚠️ CE FICHIER CONSTRUISAIT SON HTML PAR CONCATÉNATION, SANS ÉCHAPPER.
        Mesuré le 11/09/2026 avec un plat nommé `Steak <maison> "du chef"` et
        un descriptif `<img src=x onerror="…"> & compagnie` :
          · le nom rendu perdait « <maison> » — lu comme une BALISE, pas du texte ;
          · et une vraie balise <img> porteuse d'un attribut `onerror` entrait
            dans le DOM de la page publique.
        La donnée vient de l'admin : c'est le CLIENT qui la tape.

     ⚠️ DEUX ÉCHAPPEURS, PAS UN — le contexte décide.
        · `eTxt`  pour du CONTENU (entre deux balises) : & < > suffisent.
        · `eAttr` pour une VALEUR D'ATTRIBUT (src="…", alt="…") : il faut EN PLUS
          " et ', sinon la valeur se referme et on écrit un attribut voisin.
        Employer `eTxt` dans un attribut laisserait passer `" onerror="…`.

     ⚠️ `setText` / `setTextAll` n'en ont PAS besoin : `textContent` ne parse pas.
        `setAttr` / `setAttrAll` non plus : `setAttribute` ne parse pas.
        Seul `innerHTML` parse — c'est lui, et lui seul, qu'on protège. */
  const eTxt  = v => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const eAttr = v => eTxt(v).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el && value !== undefined) el.textContent = value;
  }

  function setHTML(id, value) {
    const el = document.getElementById(id);
    if (el && value !== undefined) el.innerHTML = value;
  }

  function setAttr(id, attr, value) {
    const el = document.getElementById(id);
    if (el && value !== undefined) el.setAttribute(attr, value);
  }

  /* Variantes par CLASSE : pilotent TOUS les éléments .className d'un coup
     (pour un champ affiché à plusieurs endroits, ex. téléphone). */
  function setTextAll(className, value) {
    if (value === undefined) return;
    document.querySelectorAll('.' + className).forEach(el => { el.textContent = value; });
  }

  function setAttrAll(className, attr, value) {
    if (value === undefined) return;
    document.querySelectorAll('.' + className).forEach(el => { el.setAttribute(attr, value); });
  }

  function renderCarte(carte) {
    if (!carte) return '';
    // Categories possibles, dans l'ordre d'affichage + libelles
    var ORDER = [
      ['entrees',  'Entrées'],
      ['poissons', 'Poissons'],
      ['viandes',  'Viandes'],
      ['plats',    'Plats'],
      ['legumes',  'Légumes'],
      ['vins',     'Vins'],
      ['desserts', 'Desserts']
    ];
    var out = ORDER.map(function (cat) {
      var items = carte[cat[0]];
      if (!items || !items.length) return '';   // categories reelles uniquement
      var plats = items.map(function (p) {
        var desc = p.description ? '<p class="plat-desc">' + eTxt(p.description) + '</p>' : '';
        return '<div class="ardoise-plat">'
             +   '<div class="plat-head">'
             +     '<span class="plat-nom">' + eTxt(p.nom) + '</span>'
             +     '<span class="plat-dots" aria-hidden="true"></span>'
             +     '<span class="plat-prix">' + eTxt(p.prix) + '</span>'
             +   '</div>'
             +   desc
             + '</div>';
      }).join('');
      return '<div class="ardoise-cat">'
           +   '<h3 class="ardoise-cat-title">' + cat[1] + '</h3>'
           +   plats
           + '</div>';
    }).join('');
    return out || '<p class="ardoise-empty">La carte arrive très bientôt.</p>';
  }

  /* ══════════════════════════════════════════════════
     0. BLOCS / VISIBILITÉ
     Lit _data/config.json et pilote la visibilité des sections
     des blocs OPTIONNELS, DANS LES DEUX SENS :
       · actif === false ......... masquée (display:none)
       · actif absent ou vrai .... rendue visible SI elle était
                                   masquée (display:revert)

     ⚠️ LE REPLI EST « AFFICHÉ », ET C'EST UNE DÉCISION, PAS UN
        EFFET DE BORD. Un `actif` absent ne masque RIEN — le
        contrat reste « on ne masque QUE ce qui est explicitement
        désactivé ». Tranché par Romain le 14/09/2026 : un config
        mal écrit doit faire apparaître une section de trop, jamais
        faire disparaître le site. Même raison pour config absent,
        vide ou illisible : tout reste affiché.

     ⚠️⚠️ LE SOCLE RESTE HORS DU MÉCANISME, ET CE N'EST PAS UN OUBLI.
        Seul `blocs.optionnels` est parcouru. `blocs.socle` — carte,
        photos (hero + galerie), infos (horaires + contact) — n'est
        JAMAIS touché, quoi qu'il déclare, et `about` et `quote` non
        plus : ce sont les sections sans lesquelles le site n'est
        plus un site. NE PAS « ARRANGER » ÇA en parcourant
        `blocs` entier : un `actif:false` mal recopié dans le socle
        effacerait la carte ou le hero d'un client en production.
     ══════════════════════════════════════════════════ */
  const config = await loadJSON('/_data/config.json');
  try {
    const optionnels = config && config.blocs && config.blocs.optionnels;
    if (optionnels && typeof optionnels === 'object') {
      Object.values(optionnels).forEach(bloc => {
        if (!bloc || !Array.isArray(bloc.sections)) return;
        bloc.sections.forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;                     // section déclarée mais absente du site
          if (bloc.actif === false) { el.style.display = 'none'; return; }

          /* ⚠️⚠️ ET LE SENS INVERSE, DEPUIS LE 14/09/2026. Ce bloc ne savait que
             MASQUER : il n'avait aucune branche pour `actif !== false`. Un
             `#events { display:none }` statique traînait dans `index.html` avec un
             commentaire annonçant « réactivable via config.json » — trois documents
             l'affirmaient, aucun mécanisme ne le faisait. L'interrupteur écrivait
             `actif: true`, ce code le lisait, et la règle statique gagnait.

             ⚠️ `display = ''` NE SUFFIT PAS, ET C'EST MESURÉ : sur une section
                masquée par une règle de feuille de style, `''` et
                `removeProperty('display')` laissent le calculé à `none` — ils ne
                retirent qu'un style EN LIGNE, qui n'existe pas ici. Relevé :
                  ''                 → none   ✗        revert  → block  ✓
                  removeProperty     → none   ✗        'block' → block  ✓
                  'initial'          → inline ✗ (casse la mise en page)
                `revert` est retenu : il écarte les règles de l'auteur et rend la
                valeur du navigateur pour cette balise, au lieu d'imposer une valeur
                qu'on aurait inventée.

             ⚠️ ON N'AGIT QUE SI LA SECTION EST EFFECTIVEMENT MASQUÉE, et c'est une
                garde, pas une optimisation. `#hero` est en `display: grid` et
                `revert` lui donnerait `block` — mesuré. Il appartient au socle, donc
                hors d'atteinte ici, mais le jour où une section pilotée porte une
                mise en page en flex ou en grid, un `revert` aveugle la casserait.
                Une section déjà visible n'a rien à réparer : on la laisse. */
          if (getComputedStyle(el).display === 'none') el.style.display = 'revert';
        });
      });
    }
  } catch (e) {
    console.warn('[Sassy CMS] config illisible — tout reste affiché', e);
  }

  /* ══════════════════════════════════════════════════
     1. GÉNÉRAL
     ══════════════════════════════════════════════════ */
  const general = await loadJSON('/_data/general.json');
  if (general) {
    setText('cms-nom',         general.nom);
    setText('cms-accroche',    general.accroche);
    setText('cms-description', general.description);
    setTextAll('cms-telephone', general.telephone);
    setText('cms-adresse',     general.adresse);
    setText('cms-email',       general.email);
    setAttrAll('cms-tel-link', 'href', `tel:${(general.telephone||'').replace(/\s/g,'')}`);
    setAttr('cms-email-link',  'href', `mailto:${general.email}`);
    if (general.whatsapp) {
      // Numéro piloté par la donnée ; message pré-rempli conservé EN DUR (identique à l'existant)
      const waText = '?text=Bonjour%2C+je+voudrais+réserver+une+table+au+Bistrot+Sassy';
      setAttrAll('cms-whatsapp', 'href', `https://wa.me/${general.whatsapp}${waText}`);
    }
    if (general.adresse) {
      const iframe = document.getElementById('cms-maps-iframe');
      if (iframe) {
        const encoded = encodeURIComponent(general.adresse);
        iframe.src = `https://maps.google.com/maps?q=${encoded}&output=embed`;
      }
    }
  }

  /* ══════════════════════════════════════════════════
     2. HORAIRES
     ══════════════════════════════════════════════════ */
  const horaires = await loadJSON('/_data/horaires.json');
  if (horaires && horaires.jours) {
    const ABBR = { Lundi:'lun', Mardi:'mar', Mercredi:'mer', Jeudi:'jeu',
                   Vendredi:'ven', Samedi:'sam', Dimanche:'dim' };
    const abbr = d => ABBR[d] || d.toLowerCase().slice(0, 3);

    // Regrouper les jours adjacents de mêmes horaires
    const groups = [];
    horaires.jours.forEach(j => {
      const last = groups[groups.length - 1];
      const key  = j.ouvert ? j.heures : 'FERME';
      if (last && last.key === key) last.days.push(j.jour);
      else groups.push({ key, ouvert: j.ouvert, heures: j.heures, days: [j.jour] });
    });

    // Emplacement A : section #horaires (.horaires-row)
    const listA = document.getElementById('cms-horaires');
    if (listA) {
      listA.innerHTML = groups.map(g => {
        const label = g.days.length > 1
          ? `${abbr(g.days[0])} – ${abbr(g.days[g.days.length - 1])}`
          : g.days[0].toLowerCase();
        const val = g.ouvert ? `<span>${eTxt(g.heures)}</span>`
                             : `<span class="closed">fermé</span>`;
        return `<div class="horaires-row"><strong>${eTxt(label)}</strong>${val}</div>`;
      }).join('');
    }

    // Emplacement B : bloc contact (.ci-block-val)
    const listB = document.getElementById('cms-horaires-compact');
    if (listB) {
      listB.innerHTML = groups.map(g => {
        const label = g.days.length > 1
          ? `${abbr(g.days[0])}–${abbr(g.days[g.days.length - 1])}`
          : abbr(g.days[0]);
        return `${eTxt(label)}&nbsp;: ${g.ouvert ? eTxt(g.heures) : 'fermé'}`;
      }).join('<br/>');
    }

    setText('cms-horaires-note', horaires.note);
  }

  /* ══════════════════════════════════════════════════
     3. CARTE
     ══════════════════════════════════════════════════ */
  const carte = await loadJSON('/_data/carte.json');
  if (carte) {
    setHTML('cms-carte', renderCarte(carte));
  }

  /* ══════════════════════════════════════════════════
     4. PHOTOS — slider et galerie
     ══════════════════════════════════════════════════ */
  const photos = await loadJSON('/_data/photos.json');
  if (photos) {

    // Slider — 3 cards fixes
    if (photos.slider && photos.slider.length) {
      photos.slider.forEach((item, i) => {
        const card = document.getElementById(`card-${i}`);
        if (card) {
          const img = card.querySelector('img');
          if (img) {
            img.src = item.image;
            if (item.alt) img.alt = item.alt;
          }
        }
      });
    }

    // Galerie — cells dynamiques
    if (photos.galerie && photos.galerie.length) {
      const grid = document.querySelector('.galerie-grid');
      if (grid) {
        grid.innerHTML = photos.galerie.map(item => `
          <div class="galerie-cell">
            <img src="${eAttr(item.image)}" alt="${eAttr(item.legende || 'Bistrot Sassy')}">
          </div>
        `).join('');

        // Carousel si plus de 4 photos (sinon grille classique)
        const inner = grid.closest('.galerie-inner');
        const isCarousel = photos.galerie.length > 4;
        if (inner) inner.classList.toggle('has-carousel', isCarousel);

        if (inner && isCarousel) {
          const nav  = inner.querySelector('.galerie-nav');
          const prev = nav && nav.querySelector('[data-dir="prev"]');
          const next = nav && nav.querySelector('[data-dir="next"]');
          const step = () => {
            const cell = grid.querySelector('.galerie-cell');
            return cell ? cell.getBoundingClientRect().width + 12 : grid.clientWidth * 0.8;
          };
          const update = () => {
            if (prev) prev.disabled = grid.scrollLeft <= 4;
            if (next) next.disabled = grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 4;
          };
          if (prev) prev.onclick = () => grid.scrollBy({ left: -step(), behavior: 'smooth' });
          if (next) next.onclick = () => grid.scrollBy({ left:  step(), behavior: 'smooth' });
          grid.addEventListener('scroll', update, { passive: true });
          update();
        }
      }
    }
  }

  console.log('[Sassy CMS] Données chargées ✓');

})();
