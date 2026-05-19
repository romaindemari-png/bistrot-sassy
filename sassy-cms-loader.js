/* ============================================================
   BISTROT SASSY — CMS Loader
   Connecte l'index.html aux fichiers JSON de Decap CMS
   À placer juste avant </body> dans index.html
   ============================================================ */

(async function () {

  /* ── Utilitaire : fetch JSON avec gestion d'erreur ── */
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

  /* ── Utilitaire : injecter du texte si l'élément existe ── */
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

  /* ══════════════════════════════════════════════════
     1. GÉNÉRAL — infos contact, accroche, description
     ══════════════════════════════════════════════════ */
  const general = await loadJSON('/_data/general.json');
  if (general) {
    setText('cms-nom',         general.nom);
    setText('cms-accroche',    general.accroche);
    setText('cms-description', general.description);
    setText('cms-telephone',   general.telephone);
    setText('cms-adresse',     general.adresse);
    setText('cms-email',       general.email);

    // Liens tel: et mailto:
    setAttr('cms-tel-link',   'href', `tel:${general.telephone.replace(/\s/g,'')}`);
    setAttr('cms-email-link', 'href', `mailto:${general.email}`);

    // Bouton WhatsApp flottant
    if (general.whatsapp) {
      setAttr('cms-whatsapp', 'href', `https://wa.me/${general.whatsapp}`);
    }

    // Google Maps iframe
    if (general.maps_url) {
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
        <div class="horaire-ligne ${j.ouvert ? 'ouvert' : 'ferme'}">
          <span class="horaire-jour">${j.jour}</span>
          <span class="horaire-heures">${j.heures}</span>
        </div>
      `).join('');
    }

    setText('cms-horaires-note', horaires.note);
  }

  /* ══════════════════════════════════════════════════
     3. CARTE — entrées, plats, desserts
     ══════════════════════════════════════════════════ */
  const carte = await loadJSON('/_data/carte.json');
  if (carte) {

    function renderPlats(items) {
      if (!items || !items.length) return '';
      return items.map(p => `
        <div class="plat-item">
          <div class="plat-header">
            <span class="plat-nom">${p.nom}</span>
            <span class="plat-prix">${p.prix}</span>
          </div>
          <p class="plat-desc">${p.description}</p>
        </div>
      `).join('');
    }

    setHTML('cms-entrees', renderPlats(carte.entrees));
    setHTML('cms-plats',   renderPlats(carte.plats));
    setHTML('cms-desserts',renderPlats(carte.desserts));
  }

  console.log('[Sassy CMS] Données chargées ✓');

})();
