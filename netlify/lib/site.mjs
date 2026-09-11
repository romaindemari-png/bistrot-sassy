/* ═══════════════════════════════════════════════════════════════════════════
   LE SITE COURANT — une seule vérité, pour toutes les fonctions.
   ═══════════════════════════════════════════════════════════════════════════
   ⚠️ CE FICHIER N'EST PAS UNE FONCTION. Il vit dans netlify/lib/ (hors du dossier
   des fonctions) : Netlify ne le déploie pas, esbuild le regroupe via les imports.

   POURQUOI IL EXISTE
   Deux valeurs étaient ÉCRITES EN DUR dans CHAQUE fonction, et pas de la même façon
   selon le fork. C'était LA divergence qui rendait le portage impossible — et,
   accessoirement, deux bugs :

   1. LE DOMAINE DE VALIDATION DES JETONS (SITE_URL)
        const SITE_URL = process.env.IDENTITY_URL || 'https://gorgeous-heliotrope-e2e59d.netlify.app';  // master
        const SITE_URL = process.env.IDENTITY_URL || 'https://masamadre-site.netlify.app';              // Masa
      C'est le domaine contre lequel on VALIDE LES JETONS Netlify Identity. Le repli
      était codé en dur, et **pas le même site selon le fork**. Le master n'a PAS
      IDENTITY_URL dans ses variables : il retombait donc sur « gorgeous-heliotrope »,
      **un domaine qui n'est même pas le sien**. Si IDENTITY_URL venait à manquer chez
      un client, on validerait ses jetons contre le site d'un AUTRE client.
      → process.env.URL : Netlify le fournit toujours, et il désigne LE SITE COURANT.

   2. LE JETON D'ACCÈS AUX BLOBS
        token: process.env.NETLIFY_API_TOKEN   // master
        token: process.env.BLOBS_TOKEN         // Masa
      Même rôle, même valeur, DEUX NOMS — écrits dans le code de chaque fonction.
      ⚠️ Un `cp` du master vers Masa aurait donc CASSÉ SA PRODUCTION : plus de
      publication Instagram, plus d'envoi de photo, et ses photos ne s'affichaient
      plus (upload-image, serve-image, publish-instagram, disconnect-instagram lisent
      toutes ce jeton). → On accepte LES DEUX noms.

   ⚠️ RÈGLE (LELAB.md) : tout repli codé en dur qui désigne UN SITE est une divergence
   de fork déguisée. Elle ne se voit pas — le repli ne sert jamais… jusqu'au jour où il
   sert — elle se duplique à chaque fork, et elle diverge en silence.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Le site COURANT — jamais un domaine nommé. Sert à valider les jetons Netlify Identity. */
export const SITE_URL = process.env.IDENTITY_URL || process.env.URL;

/** Le jeton des Blobs. Les deux noms cohabitent : le fichier reste identique d'un fork à l'autre. */
export const BLOBS_TOKEN = process.env.BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;

/** Les options d'un store Blobs — un seul endroit qui sait les fabriquer. */
export function storeOpts(name){
  return { name, siteID: process.env.SITE_ID, token: BLOBS_TOKEN };
}

/** Vérifie un JWT Netlify Identity contre LE SITE COURANT. */
export async function verifyIdentity(token){
  if (!token) return false;
  try {
    const res = await fetch(`${SITE_URL}/.netlify/identity/user`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.ok;
  } catch {
    return false;
  }
}
