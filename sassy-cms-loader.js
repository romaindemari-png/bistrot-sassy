/* ============================================================
   BISTROT SASSY â€” CMS Loader v2
   Connecte l'index.html aux fichiers JSON de Decap CMS
   أ€ placer juste avant </body> dans index.html
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

  /* â”€â”€ Rendu d'une liste de plats â”€â”€ */
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

  /* â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
     1. Gأ‰Nأ‰RAL
     â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ */
  const general = await loadJSON('/_data/general.json');
  if (general) {
    setText('cms-nom',         general.nom);
    setText('cms-accroche',    general.accroche);
    setText('cms-description', general.description);
    setText('cms-telephone',   general.telephone);
    setText('cms-adresse',     general.adresse);
    setText('cms-email',       general.email);
    setAttr('cms-tel-link',    'href', `tel:${(general.telephone||'').replace(/\s/g,'')}`);
    setAttr('cms-email-link',  'href', `mailto:${general.email}`);
    if (general.whatsapp) {
      setAttr('cms-whatsapp', 'href', `https://wa.me/${general.whatsapp}`);
    }
    if (general.adresse) {
      const iframe = document.getElementById('cms-maps-iframe');
      if (iframe) {
        const encoded = encodeURIComponent(general.adresse);
        iframe.src = `https://maps.google.com/maps?q=${encoded}&output=embed`;
      }
    }
  }

  /* â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
     2. HORAIRES
     â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ */
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

  /* â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
     3. CARTE
     â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ */
  const carte = await loadJSON('/_data/carte.json');
  if (carte) {
    setHTML('cms-entrees',  renderPlats(carte.entrees));
    setHTML('cms-viandes',  renderPlats(carte.viandes));
    setHTML('cms-vins',     renderPlats(carte.vins));
    setHTML('cms-poissons', renderPlats(carte.poissons));
    setHTML('cms-desserts', renderPlats(carte.desserts));
  }

  console.log('[Sassy CMS] Donnأ©es chargأ©es âœ“');

})();
