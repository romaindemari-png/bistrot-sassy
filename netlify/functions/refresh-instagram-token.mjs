/* ═══════════════════════════════════════════════════════════════════════════
   CRON QUOTIDIEN — le token Instagram ne doit jamais mourir de vieillesse.
   ═══════════════════════════════════════════════════════════════════════════
   Le token long vit ~60 jours. `ig_refresh_token` le remet à 60 jours, et n'a
   besoin QUE du token courant (pas du secret de l'app).

   ⚠️ POURQUOI UN CRON, ET PAS SEULEMENT À L'OUVERTURE DE L'ADMIN
   La cible est un commerçant — un boulanger. S'il ne publie pas pendant deux mois
   (vacances, grosse saison), rien ne tourne, et son token meurt pendant qu'il ne
   regarde pas. **Le cron est la seule option qui survit à un client silencieux.**
   Le rafraîchissement à l'ouverture de l'admin (get-instagram-status) s'y ajoute :
   un client actif n'est jamais à risque, même si le cron tombe.

   Il ne fait RIEN d'autre que d'appeler la règle partagée (netlify/lib/ig-token.mjs) :
   le cron et le statut ne peuvent pas diverger.

   Fonction Netlify v2 (export default + config.schedule) : aucune dépendance en plus.
   Journal : Netlify → Functions → refresh-instagram-token.
   ═══════════════════════════════════════════════════════════════════════════ */
import { igStore, rafraichirSiBesoin, joursRestants } from '../lib/ig-token.mjs';

export const config = { schedule: '@daily' };

export default async () => {
  try {
    const store = igStore();
    const conn  = await store.get('connection', { type: 'json' });
    const r     = await rafraichirSiBesoin(store, conn);
    const j     = joursRestants(r.conn);

    // Un log qui CONSTATE (jamais « ok » par défaut) : c'est la seule trace qu'on aura.
    console.log('[refresh-instagram-token]', r.action,
      j !== null ? `· expire dans ${j} j` : '· expiration inconnue',
      r.erreur ? `· ${r.erreur}` : '');

    if (r.action === 'expire'){
      console.error('[refresh-instagram-token] ⚠️ TOKEN MORT — le client devra reconnecter son compte. '
        + 'Le statut le lui dira dès sa prochaine ouverture (state:expired).');
    }
    return new Response(JSON.stringify({ action: r.action, joursRestants: j }),
      { headers: { 'content-type': 'application/json' } });
  } catch (e) {
    console.error('[refresh-instagram-token] échec:', e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
