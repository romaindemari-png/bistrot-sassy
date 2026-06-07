// netlify/functions/disconnect-instagram.mjs
// Déconnecte le compte Instagram : supprime la connexion stockée dans Blobs.
// POST protégé par le JWT Netlify Identity.
import { getStore } from '@netlify/blobs';

const SITE_URL = process.env.IDENTITY_URL || 'https://gorgeous-heliotrope-e2e59d.netlify.app';

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
    const store = getStore({ name: 'instagram', siteID: process.env.SITE_ID, token: process.env.NETLIFY_API_TOKEN });
    await store.delete('connection');
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
