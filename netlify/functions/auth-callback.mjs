import { getStore } from '@netlify/blobs';

const IG_OAUTH = 'https://api.instagram.com/oauth/access_token';
const IG_GRAPH = 'https://graph.instagram.com';

function html(title, msg){
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
  <style>body{font-family:system-ui,sans-serif;background:#FAFAF8;color:#0A0A0A;display:flex;min-height:100vh;
  align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}.card{max-width:380px}
  h1{font-size:20px;margin:0 0 8px}p{color:#6B6B6B;font-size:14px;line-height:1.5}
  a{display:inline-block;margin-top:18px;background:#0A0A0A;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px}</style>
  </head><body><div class="card"><h1>${title}</h1><p>${msg}</p><a href="/admin/">← Retour à l'espace</a></div></body></html>`;
}
const page = (status, title, msg) => ({
  statusCode: status, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: html(title, msg)
});

export const handler = async (event) => {
  const q = event.queryStringParameters || {};
  if (q.error) return page(400, 'Connexion annulée', q.error_description || q.error);
  if (!q.code) return page(400, 'Connexion impossible', 'Code d’autorisation manquant.');

  const { IG_APP_ID, IG_APP_SECRET, INSTAGRAM_REDIRECT_URI: REDIRECT } = process.env;
  if (!IG_APP_ID || !IG_APP_SECRET || !REDIRECT) {
    return page(500, 'Configuration manquante', 'IG_APP_ID / IG_APP_SECRET / INSTAGRAM_REDIRECT_URI à définir.');
  }

  try {
    // 1) code → token court + user_id (form-urlencoded)
    const short = await (await fetch(IG_OAUTH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: IG_APP_ID, client_secret: IG_APP_SECRET,
        grant_type: 'authorization_code', redirect_uri: REDIRECT, code: q.code
      })
    })).json();
    if (!short.access_token) throw new Error(short.error_message || 'Échec de l’échange du code');

    // 2) token court → token long (~60 j)
    const long = await (await fetch(`${IG_GRAPH}/access_token?` + new URLSearchParams({
      grant_type: 'ig_exchange_token', client_secret: IG_APP_SECRET, access_token: short.access_token
    }))).json();
    const token = long.access_token || short.access_token;

    // 3) infos compte (username) — best effort
    const me = await (await fetch(`${IG_GRAPH}/me?` + new URLSearchParams({
      fields: 'user_id,username', access_token: token
    }))).json();
    console.log('ig me:', JSON.stringify(me));
    const igUserId = me.user_id || String(short.user_id);

    // 4) stocker la connexion (Blobs privé, par site = par client)
    const store = getStore({ name: 'instagram', siteID: process.env.SITE_ID, token: process.env.NETLIFY_API_TOKEN });
    await store.setJSON('connection', {
      igUserId,
      accessToken: token,
      username: me.username || null,
      connectedAt: new Date().toISOString()
    });

    return page(200, 'Instagram connecté ✅',
      `Le compte ${me.username ? '@' + me.username : 'Instagram'} est connecté. Tu peux maintenant publier depuis l’espace.`);
  } catch (err) {
    console.error('auth-callback:', err);
    return page(500, 'Erreur de connexion', err.message);
  }
};
