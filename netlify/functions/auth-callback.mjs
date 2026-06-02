import { getStore } from '@netlify/blobs';

const GRAPH = 'https://graph.facebook.com/v19.0';

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

  const { INSTAGRAM_APP_ID: APP_ID, INSTAGRAM_APP_SECRET: APP_SECRET, INSTAGRAM_REDIRECT_URI: REDIRECT } = process.env;
  if (!APP_ID || !APP_SECRET || !REDIRECT) {
    return page(500, 'Configuration manquante', 'INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET / INSTAGRAM_REDIRECT_URI à définir.');
  }

  try {
    // 1) code → token court
    const tok = await (await fetch(`${GRAPH}/oauth/access_token?` + new URLSearchParams({
      client_id: APP_ID, client_secret: APP_SECRET, redirect_uri: REDIRECT, code: q.code
    }))).json();
    if (!tok.access_token) throw new Error(tok.error?.message || 'Échec de l’échange du code');

    // 2) token court → token long (≈60 j)
    const long = await (await fetch(`${GRAPH}/oauth/access_token?` + new URLSearchParams({
      grant_type: 'fb_exchange_token', client_id: APP_ID, client_secret: APP_SECRET, fb_exchange_token: tok.access_token
    }))).json();
    const userToken = long.access_token || tok.access_token;

    // — Diagnostic Login for Business : identité + permissions réellement accordées —
    const me = await (await fetch(`${GRAPH}/me?` + new URLSearchParams({ fields: 'id,name', access_token: userToken }))).json();
    console.log('me:', JSON.stringify(me));
    const perms = await (await fetch(`${GRAPH}/me/permissions?` + new URLSearchParams({ access_token: userToken }))).json();
    console.log('me/permissions:', JSON.stringify(perms));

    // 3) Récupérer les Pages — via les Business Portfolios (les Pages d'un Business
    //    n'apparaissent PAS dans /me/accounts), avec fallback /me/accounts.
    let candidates = [];

    // 3a) Business portfolios du user → owned_pages
    const biz = await (await fetch(`${GRAPH}/me/businesses?` + new URLSearchParams({
      fields: 'id,name', access_token: userToken
    }))).json();
    console.log('me/businesses:', JSON.stringify(biz));
    for (const b of (biz.data || [])) {
      const owned = await (await fetch(`${GRAPH}/${b.id}/owned_pages?` + new URLSearchParams({
        fields: 'id,name,access_token,instagram_business_account', access_token: userToken
      }))).json();
      console.log(`business ${b.id} (${b.name}) owned_pages:`, JSON.stringify({
        ...owned,
        data: (owned.data || []).map(p => ({
          id: p.id, name: p.name, has_token: !!p.access_token,
          instagram_business_account: p.instagram_business_account || null
        }))
      }));
      candidates.push(...(owned.data || []));
    }

    // 3b) Fallback : Pages gérées directement (hors Business)
    if (!candidates.length) {
      const pages = await (await fetch(`${GRAPH}/me/accounts?` + new URLSearchParams({
        fields: 'id,name,access_token,tasks,instagram_business_account', access_token: userToken
      }))).json();
      console.log('me/accounts:', JSON.stringify({
        ...pages,
        data: (pages.data || []).map(p => ({
          id: p.id, name: p.name, has_token: !!p.access_token,
          instagram_business_account: p.instagram_business_account || null
        }))
      }));
      candidates = pages.data || [];
    }

    // Sélection : 1ère Page liée à un compte Instagram (fallback requête directe par Page)
    let page0 = candidates.find(p => p.instagram_business_account?.id);
    if (!page0) {
      for (const p of candidates) {
        const ig = await (await fetch(`${GRAPH}/${p.id}?` + new URLSearchParams({
          fields: 'instagram_business_account', access_token: p.access_token || userToken
        }))).json();
        console.log(`page ${p.id} (${p.name}) → instagram_business_account:`, JSON.stringify(ig));
        if (ig.instagram_business_account?.id) {
          page0 = { ...p, instagram_business_account: ig.instagram_business_account };
          break;
        }
      }
    }

    // Sécurité : garantir un page access token (parfois absent d'owned_pages)
    if (page0 && !page0.access_token) {
      const t = await (await fetch(`${GRAPH}/${page0.id}?` + new URLSearchParams({
        fields: 'access_token', access_token: userToken
      }))).json();
      if (t.access_token) page0.access_token = t.access_token;
      console.log(`page ${page0.id} token récupéré:`, !!t.access_token);
    }

    if (!page0) return page(400, 'Aucun compte Instagram',
      'Aucune Page Facebook reliée à un compte Instagram professionnel n’a été trouvée. Vérifie que ton Instagram est en mode pro et relié à une Page.');

    // 4) stocker la connexion (Blobs privé, par site = par client)
    const store = getStore({ name: 'instagram', siteID: process.env.SITE_ID, token: process.env.NETLIFY_API_TOKEN });
    await store.setJSON('connection', {
      igAccountId: page0.instagram_business_account.id,
      pageId: page0.id,
      pageName: page0.name,
      pageAccessToken: page0.access_token,
      connectedAt: new Date().toISOString()
    });

    return page(200, 'Instagram connecté ✅',
      `Le compte lié à la Page « ${page0.name} » est prêt. Tu peux maintenant publier depuis l’espace.`);
  } catch (err) {
    console.error('auth-callback:', err);
    return page(500, 'Erreur de connexion', err.message);
  }
};
