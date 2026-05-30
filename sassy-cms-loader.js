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

  function renderPlats(items) {
    if (!items || !items.length) return '';
    return items.map(p => `
      <div style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.1)">
        <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px">
          <span style="font-weight:600">${p.nom}</span>
          <span style="opacity:0.7; white-space:nowrap">${p.prix}</span>
        </div>
        <p style="margin:2px 0 0; opacity:0.6; font-size:0.85em">${p.description}</p>
      </div>
    `).join('');
  }

  /* ══════════════════════════════════════════════════
     0. BLOCS / VISIBILITÉ
     Lit _data/config.json et masque les sections des blocs
     OPTIONNELS désactivés (actif === false). Le socle, ainsi
     que about et quote, ne sont JAMAIS masqués.
     Fallback par construction : config absent / vide / illisible
     ⇒ tout reste affiché. On ne masque QUE ce qui est
     explicitement désactivé dans un config valide.
     ══════════════════════════════════════════════════ */
  const config = await loadJSON('/_data/config.json');
  try {
    const optionnels = config && config.blocs && config.blocs.optionnels;
    if (optionnels && typeof optionnels === 'object') {
      Object.values(optionnels).forEach(bloc => {
        if (bloc && bloc.actif === false && Array.isArray(bloc.sections)) {
          bloc.sections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
          });
        }
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
  if (horaires) {
    const container = document.getElementById('cms-horaires');
    if (container && horaires.jours) {
      container.innerHTML = horaires.jours.map(j => `
        <div style="display:flex; justify-content:space-between; padding:4px 0; opacity:${j.ouvert ? '1' : '0.4'}">
          <span>${j.jour}</span>
          <span>${j.heures}</span>
        </div>
      `).join('');
    }
    setText('cms-horaires-note', horaires.note);
  }

  /* ══════════════════════════════════════════════════
     3. CARTE
     ══════════════════════════════════════════════════ */
  const carte = await loadJSON('/_data/carte.json');
  if (carte) {
    setHTML('cms-entrees',  renderPlats(carte.entrees));
    setHTML('cms-viandes',  renderPlats(carte.viandes));
    setHTML('cms-vins',     renderPlats(carte.vins));
    setHTML('cms-poissons', renderPlats(carte.poissons));
    setHTML('cms-desserts', renderPlats(carte.desserts));
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
            <img src="${item.image}" alt="${item.legende || 'Bistrot Sassy'}">
          </div>
        `).join('');
      }
    }
  }

  console.log('[Sassy CMS] Données chargées ✓');

})();
