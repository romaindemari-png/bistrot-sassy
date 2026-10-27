/* ═══ LE COMPOSANT PHOTO (bout 7c-1) ═══════════════════════════════════════════════════════════════════════
   Une case qui porte UNE photo : la feuille Photos (haut de page, galerie) et la ligne d'un événement s'en
   serviront telle quelle (7c-2, 7c-3). Page de contrôle : /admin/photo.html ; sonde : scripts/test-photo.js.

   ÉTATS (data-etat sur .cp) :
     vide ..... « + Ajouter une photo » (toute la case est le bouton)
     envoi .... la case se remplit avec la PROGRESSION RÉELLE (XMLHttpRequest.upload.onprogress) jusqu'à 90 % ;
                les 10 derniers % attendent le 200 d'upload-image
     echec .... la case reste vide : « Ça n'est pas parti. » + « Réessayer » (le même fichier réduit repart)
     pleine ... la vignette, « Remplacer » et « Retirer »
     retiree .. la vignette barrée, « Annuler »
   ⚠️ ENVOYER ≠ PUBLIER (décidé le 27/10). La photo part dans Blobs dès qu'on la choisit ; le JSON du site ne
      s'écrit qu'avec Publier, et ce n'est pas l'affaire du composant : il dit ce qui s'est passé (surChange) et
      la feuille décide. Il n'appelle JAMAIS save-data, ne supprime JAMAIS rien dans Blobs.
   ⚠️ LA RÉDUCTION se fait ICI, avant l'envoi : grand côté 2048 px pour le haut de page (cible « slider »),
      1600 px sinon, JPEG 0,82, orientation EXIF appliquée. Le recodage retire l'EXIF (appareil, GPS).
      Pas de WebP à l'encodage : Safari ne sait pas en écrire depuis un canvas (il rendrait du PNG).
   ⚠️ LA VIGNETTE passe par le CDN d'images (w=240, w=480 en écran dense) et retombe sur l'image brute si le
      CDN ne répond pas. Vraies couleurs : aucun filtre, aucune fusion (les tuiles de Mon site, elles, sont en
      duotone : ne pas réutiliser .mosaique ici).

   creerCasePhoto(racine, { cible, url, alt, ratio, retirable, jeton, surChange }) → { etat, valeur(), afficher(etat, f) }
     cible ..... 'slider' | 'galerie' | 'evenements' : la dimension maximale et la cible envoyée à upload-image
     url ....... la photo en ligne au départ ('' : case vide)
     retirable . false : pas de « Retirer » (le haut de page de Sassy : 3 cases fixes)
     jeton ..... async () => jeton Identity (Authorization: Bearer)
     surChange . (valeur) => … à chaque état stable : { etat, url, cle, precedente, retiree }
     afficher .. réservé à la page de contrôle : figer un état pour le montrer (aucun envoi). */
(function(){
  const DIM_MAX = { slider: 2048 };          // le reste : 1600
  const QUALITE = 0.82;
  const MSG_HEIC = 'Ce format (HEIC) ne s’ouvre pas dans ce navigateur : envoyez la photo depuis l’iPhone, ou exportez-la en JPEG.';
  const MSG_PAS_PHOTO = 'Ce fichier n’est pas une photo. Choisissez un JPEG ou un PNG.';
  const MSG_ECHEC = 'Ça n’est pas parti.';

  const vignette = (url, w) => '/.netlify/images?url=' + encodeURIComponent(url) + '&w=' + w + '&fm=webp';
  const local = url => /^(blob:|data:)/.test(url);
  const e = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  /* HEIC : par le nom, le type, ou la signature (« ftyp » + heic/heix/hevc/mif1/msf1 aux octets 4-12). */
  async function estHeic(file){
    if (/\.hei[cf]$/i.test(file.name || '') || /image\/hei[cf]/i.test(file.type || '')) return true;
    try {
      const t = new TextDecoder('latin1').decode(await file.slice(4, 12).arrayBuffer());
      return /^ftyp(heic|heix|hevc|hevx|mif1|msf1)/.test(t);
    } catch (_){ return false; }
  }

  /* Le fichier choisi → un JPEG réduit, à l'endroit, sans EXIF. Lève { message } si ce n'est pas lisible. */
  async function reduirePhoto(file, maxDim){
    let bm;
    try { bm = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (_){ throw { message: (await estHeic(file)) ? MSG_HEIC : MSG_PAS_PHOTO }; }
    let w = bm.width, h = bm.height;
    if (w > maxDim || h > maxDim){
      if (w >= h){ h = Math.round(h * maxDim / w); w = maxDim; } else { w = Math.round(w * maxDim / h); h = maxDim; }
    }
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bm, 0, 0, w, h);
    if (bm.close) bm.close();
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', QUALITE));
    if (!blob) throw { message: MSG_PAS_PHOTO };
    return blob;
  }
  const enBase64 = blob => new Promise((ok, ko) => { const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => ko(r.error); r.readAsDataURL(blob); });

  window.creerCasePhoto = function(racine, opts){
    const o = Object.assign({ cible: 'galerie', url: '', alt: '', ratio: '1', retirable: true, jeton: async () => '', surChange: () => {} }, opts || {});
    const maxDim = DIM_MAX[o.cible] || 1600;
    const s = { etat: o.url ? 'pleine' : 'vide', url: o.url, cle: null, precedente: null, retiree: false,
                f: 0, apercu: null, envoi: null, message: '' };

    racine.innerHTML = `<div class="cp" style="--cp-ratio:${e(o.ratio)}">
      <div class="cp-cadre">
        <img class="cp-img" alt="${e(o.alt)}" decoding="async">
        <span class="cp-remplissage" aria-hidden="true"></span>
        <svg class="cp-barre" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="100" x2="100" y2="0"/></svg>
        <button type="button" class="cp-ajouter" data-action="ajouter">+ Ajouter une photo</button>
        <span class="cp-echec">${e(MSG_ECHEC)}</span>
      </div>
      <div class="cp-actions">
        <span class="cp-statut" role="status" aria-live="polite"></span>
        <button type="button" class="cp-lien" data-action="remplacer">Remplacer</button>
        <button type="button" class="cp-lien" data-action="retirer">Retirer</button>
        <button type="button" class="cp-lien" data-action="reessayer">Réessayer</button>
        <button type="button" class="cp-lien" data-action="annuler">Annuler</button>
      </div>
      <p class="cp-message" role="alert"></p>
      <input type="file" accept="image/*" class="cp-fichier" hidden>
    </div>`;
    const cp = racine.querySelector('.cp'), img = cp.querySelector('.cp-img'), input = cp.querySelector('.cp-fichier');

    /* La vignette : le CDN (1x et 2x), l'image brute si le CDN ne répond pas ; un aperçu local tel quel. */
    function poserImage(url){
      img.onerror = null;
      if (!url){ img.removeAttribute('src'); img.removeAttribute('srcset'); return; }
      if (local(url)){ img.removeAttribute('srcset'); img.src = url; return; }
      img.onerror = () => { img.onerror = null; img.removeAttribute('srcset'); img.src = url; };
      img.srcset = vignette(url, 240) + ' 1x, ' + vignette(url, 480) + ' 2x';
      img.src = vignette(url, 240);
    }
    function peindre(){
      cp.dataset.etat = s.etat;
      cp.dataset.url = s.url || '';
      cp.dataset.progression = String(s.f);
      cp.style.setProperty('--cp-f', String(s.f));
      const statut = cp.querySelector('.cp-statut');
      statut.textContent = s.etat === 'envoi' ? (s.f >= 0.9 ? 'Envoyée, encore un instant…' : 'Envoi… ' + Math.round(s.f / 0.9 * 100) + ' %')
                         : s.etat === 'retiree' ? 'Retirée à la prochaine publication' : '';
      cp.querySelector('.cp-message').textContent = s.message;
      cp.querySelector('[data-action="annuler"]').hidden = !(s.etat === 'retiree' || s.etat === 'echec');   // échec : on revient à la photo d'avant, ou à la case vide
      cp.querySelector('[data-action="retirer"]').hidden = !o.retirable;
    }
    function changer(){ peindre(); o.surChange(valeur()); }
    const valeur = () => ({ etat: s.etat, url: s.url, cle: s.cle, precedente: s.precedente, retiree: s.etat === 'retiree' });

    /* L'envoi : progression réelle jusqu'à 90 %, le reste à la réponse. */
    function envoyer(){
      const env = s.envoi; if (!env) return;
      s.etat = 'envoi'; s.f = 0; s.message = ''; poserImage(s.apercu); peindre();
      Promise.resolve(o.jeton()).then(jeton => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/.netlify/functions/upload-image');
        xhr.setRequestHeader('Content-Type', 'application/json');
        if (jeton) xhr.setRequestHeader('Authorization', 'Bearer ' + jeton);
        xhr.upload.onprogress = ev => { if (ev.lengthComputable && s.etat === 'envoi'){ s.f = Math.min(0.9, 0.9 * ev.loaded / ev.total); peindre(); } };
        xhr.upload.onload = () => { if (s.etat === 'envoi'){ s.f = 0.9; peindre(); } };
        xhr.onload = () => {
          let r = {}; try { r = JSON.parse(xhr.responseText); } catch (_){}
          if (xhr.status === 200 && r.url){
            if (s.apercu){ URL.revokeObjectURL(s.apercu); s.apercu = null; }
            s.envoi = null; s.etat = 'pleine'; s.f = 1; s.url = r.url; s.cle = r.key || null; poserImage(s.url); changer();
          } else echec();
        };
        xhr.onerror = echec;
        xhr.send(JSON.stringify({ target: o.cible, dataBase64: env.base64 }));
      }, echec);
    }
    function echec(){ s.etat = 'echec'; s.f = 0; poserImage(''); changer(); }

    async function choisi(file){
      if (!file) return;
      s.message = '';
      let blob;
      try { blob = await reduirePhoto(file, maxDim); }
      catch (err){ s.message = (err && err.message) || MSG_PAS_PHOTO; peindre(); return; }   // rien ne part, l'état ne change pas
      if (s.etat === 'pleine' && s.precedente === null) s.precedente = s.url;              // la photo qu'on remplace (à supprimer après publication)
      if (s.apercu) URL.revokeObjectURL(s.apercu);
      s.apercu = URL.createObjectURL(blob);
      s.envoi = { base64: await enBase64(blob) };
      envoyer();
    }

    cp.addEventListener('click', ev => {
      const b = ev.target.closest('[data-action]'); if (!b) return;
      const a = b.dataset.action;
      if (a === 'ajouter' || a === 'remplacer'){ input.value = ''; input.click(); }
      else if (a === 'reessayer') envoyer();
      else if (a === 'retirer'){ s.etat = 'retiree'; changer(); }
      else if (a === 'annuler'){
        if (s.etat === 'retiree'){ s.etat = s.url ? 'pleine' : 'vide'; changer(); }
        else if (s.etat === 'echec'){ s.envoi = null; s.url = s.precedente !== null ? s.precedente : s.url; s.precedente = null; s.etat = s.url ? 'pleine' : 'vide'; poserImage(s.url); changer(); }
      }
    });
    input.addEventListener('change', () => choisi(input.files && input.files[0]));

    poserImage(s.url); peindre();
    return {
      get etat(){ return s.etat; },
      valeur,
      /* Page de contrôle seulement : montrer un état figé (aucun envoi, aucun changement signalé). */
      afficher(etat, f){ s.etat = etat; s.f = f || 0; if (etat === 'echec' || etat === 'vide') poserImage(''); else poserImage(s.url); peindre(); },
    };
  };
})();
