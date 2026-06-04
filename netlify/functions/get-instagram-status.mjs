// netlify/functions/get-instagram-status.mjs
// Statut de connexion Instagram (lecture Blobs). GET protégé par le JWT Netlify Identity.
// Ne renvoie JAMAIS le token — uniquement { connected, username }.
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
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!(await verifyIdentity(token))) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Non autorisé' }) };
  }

  try {
    const store = getStore({ name: 'instagram', siteID: process.env.SITE_ID, token: process.env.NETLIFY_API_TOKEN });
    const conn = await store.get('connection', { type: 'json' });
    const connected = !!(conn && conn.accessToken && conn.igUserId);
    return {
      statusCode: 200,
      body: JSON.stringify({ connected, username: connected ? (conn.username || null) : null })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
