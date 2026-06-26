// netlify/functions/get-instagram-status.mjs
// Statut de connexion Instagram. GET protégé par le JWT Netlify Identity.
// Lit le token dans les Blobs (jamais exposé au front) et appelle Graph API en live
// pour renvoyer le triplet { connected, user_id, username, profile_picture_url }.
import { getStore } from '@netlify/blobs';

const SITE_URL = process.env.IDENTITY_URL || 'https://gorgeous-heliotrope-e2e59d.netlify.app';
const IG_GRAPH = 'https://graph.instagram.com';

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
    if (!connected) {
      return {
        statusCode: 200,
        body: JSON.stringify({ connected: false, user_id: null, username: null, profile_picture_url: null })
      };
    }

    // Appel Graph API LIVE — le token reste côté Function, jamais renvoyé au browser.
    let user_id = conn.igUserId;
    let username = conn.username || null;
    let profile_picture_url = null;
    try {
      const me = await (await fetch(`${IG_GRAPH}/me?` + new URLSearchParams({
        fields: 'user_id,username,profile_picture_url',
        access_token: conn.accessToken
      }))).json();
      // Log unique pour vérifier le nom exact du champ ID (user_id vs id selon la version API)
      console.log('ig me (status):', JSON.stringify(me));
      if (me && !me.error) {
        user_id = me.user_id || me.id || user_id;
        username = me.username || username;
        profile_picture_url = me.profile_picture_url || null;
      }
    } catch (e) {
      console.warn('Graph /me échec, fallback Blob:', e.message);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ connected: true, user_id, username, profile_picture_url })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
