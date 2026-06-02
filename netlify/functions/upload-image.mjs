import { getStore } from '@netlify/blobs';

// Toujours cibler l'Identity de prod (même depuis un deploy preview, où process.env.URL = URL du preview)
const SITE_URL = process.env.IDENTITY_URL || 'https://gorgeous-heliotrope-e2e59d.netlify.app';

// Vérifie le jeton Netlify Identity de l'utilisateur connecté
async function verifyIdentity(token) {
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

const isOurKey = (k) => typeof k === 'string' && k.startsWith('photos/');

// POST /.netlify/functions/upload-image  (Authorization: Bearer <jwt Identity>)
//   { target:'slider'|'galerie', dataBase64, oldKey? }  → upload (+ delete oldKey)
//   { action:'delete', key }                            → suppression seule
export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!(await verifyIdentity(token))) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Non autorisé' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON invalide' }) };
  }

  const store = getStore({
    name: 'photos',
    siteID: process.env.SITE_ID,
    token: process.env.NETLIFY_API_TOKEN
  });

  try {
    // — Suppression seule —
    if (body.action === 'delete') {
      if (isOurKey(body.key)) await store.delete(body.key);
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    // — Upload —
    const { target, dataBase64, oldKey } = body;
    if (!['slider', 'galerie'].includes(target) || !dataBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Paramètres manquants' }) };
    }

    const buffer = Buffer.from(dataBase64, 'base64');
    // garde-fou taille (l'image est déjà redimensionnée côté navigateur)
    if (buffer.length > 5 * 1024 * 1024) {
      return { statusCode: 413, body: JSON.stringify({ error: 'Image trop lourde' }) };
    }

    const key = `photos/${target}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    await store.set(key, buffer, { metadata: { contentType: 'image/jpeg' } });

    // supprimer l'ancienne image si c'est bien un de nos blobs
    if (isOurKey(oldKey) && oldKey !== key) {
      try { await store.delete(oldKey); } catch (e) { console.warn('delete oldKey:', e); }
    }

    const url = `/.netlify/functions/serve-image?key=${encodeURIComponent(key)}`;
    return { statusCode: 200, body: JSON.stringify({ success: true, url, key }) };
  } catch (err) {
    console.error('upload-image:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
