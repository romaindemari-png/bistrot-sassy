/* ═══════════════════════════════════════════════════════════════════════════
   LE TOKEN INSTAGRAM — sa durée de vie, et la seule règle qui compte.
   ═══════════════════════════════════════════════════════════════════════════
   ⚠️ CE FICHIER N'EST PAS UNE FONCTION. Il vit dans netlify/lib/ (hors du dossier
   des fonctions) : Netlify ne le déploie pas, esbuild le regroupe via les imports.
   Le cron ET le statut appellent LE MÊME code — jamais deux copies qui divergent.

   LE PROBLÈME
   Le token long d'Instagram vit ~60 jours. Rien ne le renouvelait. Environ 60 jours
   après sa connexion, le client était déconnecté — et RIEN ne le lui disait : le
   statut répondait « connecté » quand même, parce qu'il AVALAIT l'erreur de Meta.
   Il découvrait la panne au moment de publier, après avoir fait tout le travail.

   LES DEUX ÉCHECS QU'IL FAUT DISTINGUER — c'est tout le correctif
     · Meta RÉPOND, avec error.code 190 (OAuthException)  → le token est MORT.
       C'est un VERDICT. On l'inscrit (state:'expired') et on le DIT au client.
     · Meta NE RÉPOND PAS (réseau, timeout)               → on n'en sait rien.
       Là, et là SEULEMENT, on garde le dernier état connu.
   L'ancien code appliquait la seconde règle aux deux cas : un token mort devenait
   indiscernable d'un hoquet de réseau. Une bonne intention (« ne pas casser la
   connexion sur un aléa ») qui rendait l'expiration INVISIBLE.

   POURQUOI UN CRON, ET PAS SEULEMENT À L'OUVERTURE DE L'APP
   La cible est un boulanger. S'il ne publie pas pendant deux mois — vacances, grosse
   saison — rien ne tourne, et le token meurt. Le cron quotidien est la SEULE option
   qui survit à un client silencieux. Le rafraîchissement à l'ouverture s'y ajoute :
   un client actif n'est jamais à risque, même si le cron tombe.

   ⚠️ ig_refresh_token N'A PAS BESOIN DU SECRET DE L'APP — juste du token courant.
   (Le secret ne sert QU'à la connexion initiale, dans auth-callback.)
   ═══════════════════════════════════════════════════════════════════════════ */
import { getStore } from '@netlify/blobs';
import { storeOpts } from './site.mjs';   // ⚠️ le jeton des Blobs vit dans UN seul fichier

const IG_GRAPH = 'https://graph.instagram.com';
const JOUR     = 24 * 60 * 60 * 1000;
const AGE_MINI = JOUR + 60 * 60 * 1000;        // Meta REFUSE de rafraîchir un token de < 24 h. 1 h de marge.
const VIE_DEFAUT = 60 * 24 * 3600;             // 60 jours, en secondes — si Meta omet expires_in

export function igStore(){ return getStore(storeOpts('instagram')); }

/**
 * Meta a-t-il rendu un VERDICT de mort ? (≠ « Meta n'a pas répondu », ≠ « Meta est fâché »)
 * ⚠️ SEUL LE CODE 190 fait foi. Ne PAS se fier au `type` : Meta étiquette « OAuthException »
 *    quantité d'erreurs qui n'ont RIEN à voir avec un token expiré — le RATE LIMIT (code 4, 17, 32)
 *    en premier. Déclarer le token mort sur un pic de trafic déconnecterait le client pour rien,
 *    et l'obligerait à refaire tout le parcours OAuth. Un verdict se rend sur une preuve, pas sur
 *    une étiquette.
 *    190 = « Access token has expired / has been invalidated ». C'est le seul qui dit la mort.
 */
export function tokenMort(reponse){
  const e = reponse && reponse.error;
  return !!e && Number(e.code) === 190;
}

/**
 * INSCRIT le verdict de mort. À n'appeler QUE sur une preuve — c'est-à-dire quand tokenMort() est
 * vrai — JAMAIS sur un silence de Meta : inscrire « expired » sur un hoquet réseau déconnecterait
 * le client pour rien et l'obligerait à refaire tout le parcours OAuth.
 * ⚠️ EXISTE POUR QU'IL N'Y AIT QU'UNE SEULE ÉCRITURE DU VERDICT. Le cron, le statut et la
 * publication constatent la mort à trois endroits différents ; s'ils l'écrivaient chacun à leur
 * façon, c'est la forme même du verdict qui divergerait d'un fork à l'autre.
 */
export async function inscrireMort(store, conn){
  const mort = { ...conn, state: 'expired', expiredAt: new Date().toISOString() };
  await store.setJSON('connection', mort);
  return mort;
}

/**
 * Rafraîchit le token long si c'est UTILE et PERMIS. Ne lève JAMAIS : renvoie l'état constaté.
 * @returns {{conn: object|null, action: string, erreur?: string}}
 *   action ∈ 'rafraichi' | 'trop-recent' | 'deja-expire' | 'expire' | 'echec-reseau' | 'aucune-connexion'
 */
export async function rafraichirSiBesoin(store, conn){
  if (!conn || !conn.accessToken) return { conn: null, action: 'aucune-connexion' };
  if (conn.state === 'expired')   return { conn, action: 'deja-expire' };

  const now = Date.now();
  const repere = Date.parse(conn.lastRefreshAt || conn.connectedAt || '') || 0;
  // Pas de repère (connexion d'avant ce correctif) → on rafraîchit : c'est ce qui STAMPE expiresAt.
  if (repere && (now - repere) < AGE_MINI) return { conn, action: 'trop-recent' };

  let r;
  try {
    r = await (await fetch(`${IG_GRAPH}/refresh_access_token?` + new URLSearchParams({
      grant_type: 'ig_refresh_token', access_token: conn.accessToken
    }))).json();
  } catch (e) {
    // Meta n'a pas répondu : on ne sait RIEN. On ne touche à rien.
    return { conn, action: 'echec-reseau', erreur: e.message };
  }

  if (tokenMort(r)){
    const mort = await inscrireMort(store, conn);         // ⚠️ on INSCRIT le verdict : le statut n'aura plus à le redemander
    return { conn: mort, action: 'expire', erreur: r.error.message };
  }
  if (!r.access_token){
    // Réponse inattendue, mais pas un verdict de mort → on n'écrit rien.
    return { conn, action: 'echec-reseau', erreur: (r.error && r.error.message) || 'réponse sans access_token' };
  }

  const neuf = {
    ...conn,
    accessToken:   r.access_token,
    expiresAt:     new Date(now + (Number(r.expires_in) || VIE_DEFAUT) * 1000).toISOString(),
    lastRefreshAt: new Date(now).toISOString(),
    state:         'connected',
  };
  await store.setJSON('connection', neuf);
  return { conn: neuf, action: 'rafraichi' };
}

/** Jours restants avant expiration — null si on ne sait pas encore (connexion d'avant ce correctif). */
export function joursRestants(conn){
  const t = conn && Date.parse(conn.expiresAt || '');
  return t ? Math.floor((t - Date.now()) / JOUR) : null;
}
