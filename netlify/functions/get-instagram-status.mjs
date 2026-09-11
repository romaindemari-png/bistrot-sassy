// netlify/functions/get-instagram-status.mjs
// Statut de connexion Instagram. GET protégé par le JWT Netlify Identity.
// Lit le token dans les Blobs (jamais exposé au front) et appelle Graph API en live
// pour renvoyer le triplet { connected, user_id, username, profile_picture_url }.
import { igStore, rafraichirSiBesoin, tokenMort, inscrireMort, joursRestants } from '../lib/ig-token.mjs';
import { verifyIdentity } from '../lib/site.mjs';   // ⚠️ SITE_URL et verifyIdentity vivent dans UN seul fichier

const IG_GRAPH = 'https://graph.instagram.com';


export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!(await verifyIdentity(token))) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Non autorisé' }) };
  }

  const deconnecte = (raison) => ({
    statusCode: 200,
    body: JSON.stringify({ connected: false, reason: raison, user_id: null, username: null, profile_picture_url: null })
  });

  try {
    const store = igStore();
    let conn = await store.get('connection', { type: 'json' });
    if (!(conn && conn.accessToken && conn.igUserId)) return deconnecte('jamais-connecte');
    if (conn.state === 'expired') return deconnecte('expired');   // verdict déjà inscrit par le cron

    // RAFRAÎCHISSEMENT OPPORTUNISTE — l'admin appelle ce statut à chaque ouverture. La règle
    // partagée ne fait rien si le token a moins de 24 h : aucun appel Meta superflu.
    // Le cron protège le client SILENCIEUX ; ceci protège le client ACTIF si le cron tombe.
    const maj = await rafraichirSiBesoin(store, conn);
    if (maj.action === 'expire') return deconnecte('expired');
    conn = maj.conn;

    /* ⚠️ ICI ÉTAIT LE BUG. C'était :
           if (me && !me.error) { … }        // token EXPIRÉ ⇒ me.error ⇒ on IGNORE
           return { connected: true, … };    // et on répondait « connecté » QUAND MÊME
       L'intention était bonne (« ne pas casser la connexion sur un aléa réseau »), mais elle rendait
       un token MORT indiscernable d'un HOQUET DE RÉSEAU. Le badge affichait « connecté ✅ » pour
       l'éternité, et le client découvrait la panne au moment de publier, après tout le travail.
       Un affichage doit CONSTATER, jamais SUPPOSER (cf. LELAB.md).
       Les deux échecs sont désormais séparés :
         · Meta RÉPOND avec un 190  → VERDICT : le token est mort. On l'inscrit et on le DIT.
         · Meta NE RÉPOND PAS       → IGNORANCE : on garde le dernier état connu (c'est légitime). */
    let user_id = conn.igUserId;
    let username = conn.username || null;
    let profile_picture_url = null;
    try {
      const me = await (await fetch(`${IG_GRAPH}/me?` + new URLSearchParams({
        fields: 'user_id,username,profile_picture_url',
        access_token: conn.accessToken
      }))).json();

      if (tokenMort(me)) {                                   // ← LE VERDICT
        await inscrireMort(store, conn);                     // la MÊME écriture que le cron et publish
        console.error('[ig-status] token MORT (190) — le client doit reconnecter son compte.');
        return deconnecte('expired');
      }
      if (me && !me.error) {
        user_id = me.user_id || me.id || user_id;
        username = me.username || username;
        profile_picture_url = me.profile_picture_url || null;
      }
    } catch (e) {
      console.warn('[ig-status] Graph /me sans réponse → dernier état connu conservé:', e.message);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        connected: true, user_id, username, profile_picture_url,
        expiresAt: conn.expiresAt || null,
        joursRestants: joursRestants(conn)                   // null = inconnu (connexion d'avant ce correctif)
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
