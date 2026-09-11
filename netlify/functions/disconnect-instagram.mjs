/* ⚠️ SITE_URL et le jeton des Blobs étaient ÉCRITS EN DUR ici — et pas pareil selon le fork.
   Ils vivent désormais dans netlify/lib/site.mjs : UNE seule vérité, et le fichier redevient
   IDENTIQUE d'un fork à l'autre. (Le repli du master pointait sur « gorgeous-heliotrope », un
   domaine qui n'est même pas le sien ; et un `cp` vers Masa aurait cassé ses Blobs.) */
import { SITE_URL, verifyIdentity, storeOpts } from '../lib/site.mjs';
// netlify/functions/disconnect-instagram.mjs
// Déconnecte le compte Instagram : supprime la connexion stockée dans Blobs.
// POST protégé par le JWT Netlify Identity.
import { getStore } from '@netlify/blobs';




export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!(await verifyIdentity(token))) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Non autorisé' }) };
  }

  try {
    const store = getStore(storeOpts('instagram'));
    await store.delete('connection');
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
