/* ⚠️ SITE_URL et le jeton des Blobs étaient ÉCRITS EN DUR ici — et pas pareil selon le fork.
   Ils vivent désormais dans netlify/lib/site.mjs : UNE seule vérité, et le fichier redevient
   IDENTIQUE d'un fork à l'autre. (Le repli du master pointait sur « gorgeous-heliotrope », un
   domaine qui n'est même pas le sien ; et un `cp` vers Masa aurait cassé ses Blobs.)

   ⚠️ LE TOKEN NE SE LIT PLUS EN DIRECT DANS LE BLOB.
   publish était la SEULE fonction de la chaîne branchée dessus sans passer par la règle partagée
   (netlify/lib/ig-token.mjs). Elle publiait avec un token que PERSONNE n'avait rafraîchi, ne
   regardait pas state:'expired' — donc elle tentait de publier avec un token dont le cron avait
   DÉJÀ inscrit la mort — et ne reconnaissait pas le code 190. Résultat : l'expiration sortait en
   500 portant le message BRUT de Meta (« Error validating access token… »), affiché au client dans
   son studio, après qu'il avait fait tout le travail. Le cron savait, le statut savait ; la seule
   fonction qui rencontre VRAIMENT le token, non. Une règle, trois appelants. */
import { verifyIdentity } from '../lib/site.mjs';
import { igStore, rafraichirSiBesoin, tokenMort, inscrireMort } from '../lib/ig-token.mjs';
// netlify/functions/publish-instagram.js
// Fonction Netlify pour publier sur Instagram via l'API Meta

/* « RECONNEXION NÉCESSAIRE » — UN SEUL état, quel que soit l'endroit où on l'apprend : à l'entrée
   (verdict déjà inscrit) ou EN PLEIN VOL (Meta répond 190 au milieu de la publication).
   409 et pas 500 : ce n'est pas une panne du site, c'est un compte à reconnecter — le client peut
   agir. Le front sait déjà l'afficher : mapPublishError() (admin/index.html) reconnaît « expirée »,
   et le badge bascule sur « Reconnecter Instagram » à la relecture du statut.
   ⚠️ Le token n'apparaît nulle part ici : il ne sort JAMAIS vers le browser. */
const reconnexionNecessaire = () => ({
  statusCode: 409,
  body: JSON.stringify({
    error: 'Connexion Instagram expirée — reconnectez votre compte.',
    reason: 'expired',
    reconnect: true
  })
});

/* ⚠️ LE 190 PEUT TOMBER EN PLEIN VOL. Le token vivait à l'entrée, et Meta le refuse trois appels
   plus loin (container, poll, publish) — un cron d'invalidation, un mot de passe changé, l'appli
   retirée depuis le téléphone. Sans cette classe, l'erreur remontait dans le catch générique et
   ressortait en 500 brut. Elle ne fait que TRANSPORTER le verdict jusqu'au catch ; le verdict
   lui-même est rendu par tokenMort(), donc sur le code 190 SEUL — le rate limit porte lui aussi
   l'étiquette « OAuthException » (cf. netlify/lib/ig-token.mjs). */
class TokenMort extends Error {}

/** Passe une réponse Graph au tamis du 190 AVANT tout autre traitement. */
function refuserSiMort(reponse){
  if (tokenMort(reponse)) throw new TokenMort(reponse.error.message);
  return reponse;
}

exports.handler = async (event) => {

  // Sécurité : POST uniquement
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Sécurité : utilisateur authentifié (JWT Netlify Identity)
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!(await verifyIdentity(idToken))) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Non autorisé' }) };
  }

  /* LA CONNEXION — le blob, et RIEN d'autre.
     ⚠️ LES DEUX REPLIS D'ENVIRONNEMENT SONT PARTIS, et le second était le plus dangereux :
     INSTAGRAM_ACCESS_TOKEN et INSTAGRAM_ACCOUNT_ID étaient repliés SÉPARÉMENT. Un fork dont le blob
     rend un token mais pas d'igUserId publiait donc le contenu du client A vers l'ID de compte
     resté dans les variables du template. En multi-fork, une variable qui traîne ne se voit pas —
     jusqu'au jour où elle sert, et ce jour-là elle publie chez quelqu'un d'autre. Un refus franc
     vaut mieux : le client voit « connectez votre compte », il ne voit pas son post partir ailleurs. */
  const store = igStore();
  let conn;
  try {
    conn = await store.get('connection', { type: 'json' });
  } catch (e) {
    // On ne SAIT pas si le compte est connecté — on ne le dit donc pas. 503 : réessayer a du sens.
    console.error('[publish] lecture de la connexion impossible:', e.message);
    return { statusCode: 503, body: JSON.stringify({ error: 'Connexion Instagram illisible, réessayez dans un instant.' }) };
  }
  if (!(conn && conn.accessToken && conn.igUserId)) {
    return {
      statusCode: 409,
      body: JSON.stringify({ error: 'Instagram non connecté — connectez votre compte.', reason: 'jamais-connecte', reconnect: true })
    };
  }

  /* RAFRAÎCHISSEMENT AVANT PUBLICATION — la même règle que le cron et le statut, pas une copie.
     Ne coûte rien si le token a moins de 24 h (Meta refuse de rafraîchir plus tôt, la règle le sait).
     'deja-expire' = le verdict était déjà inscrit ; 'expire' = Meta vient de le rendre. Même réponse. */
  const maj = await rafraichirSiBesoin(store, conn);
  if (maj.action === 'expire' || maj.action === 'deja-expire') {
    console.error('[publish] refus :', maj.action, '— le client doit reconnecter son compte.');
    return reconnexionNecessaire();
  }
  conn = maj.conn;

  const ACCESS_TOKEN = conn.accessToken;
  const INSTAGRAM_ID = conn.igUserId;

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON invalide' }) };
  }

  const { format, imageUrl, caption, slides } = body;

  try {

    // ── POST SIMPLE ──────────────────────────────────────────
    if (format === 'post') {
      // Étape 1 : créer le container média
      const containerRes = await fetch(
        `https://graph.instagram.com/v21.0/${INSTAGRAM_ID}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: imageUrl,
            caption: caption,
            access_token: ACCESS_TOKEN
          })
        }
      );
      const container = refuserSiMort(await containerRes.json());
      if (!container.id) throw new Error(container.error?.message || 'Erreur container');

      // attendre que le container soit prêt (FINISHED) avant de publier
      await waitForContainer(container.id, ACCESS_TOKEN);

      // Étape 2 : publier
      const publishRes = await fetch(
        `https://graph.instagram.com/v21.0/${INSTAGRAM_ID}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creation_id: container.id,
            access_token: ACCESS_TOKEN
          })
        }
      );
      const published = refuserSiMort(await publishRes.json());
      if (!published.id) throw new Error(published.error?.message || 'Publication échouée');
      const permalink = await fetchPermalink(published.id, ACCESS_TOKEN);
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, id: published.id, permalink })
      };
    }

    // ── CARROUSEL ────────────────────────────────────────────
    if (format === 'carousel') {
      // Garde Instagram : un carrousel contient entre 2 et 10 médias
      if (!Array.isArray(slides) || slides.length < 2 || slides.length > 10) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Un carrousel doit contenir entre 2 et 10 photos' })
        };
      }
      // Étape 1 : créer un container pour chaque slide
      const childIds = await Promise.all(
        slides.map(async (slide) => {
          const res = await fetch(
            `https://graph.instagram.com/v21.0/${INSTAGRAM_ID}/media`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                image_url: slide.imageUrl,
                is_carousel_item: true,
                access_token: ACCESS_TOKEN
              })
            }
          );
          const data = refuserSiMort(await res.json());
          if (!data.id) throw new Error(data.error?.message || 'Erreur slide');
          return data.id;
        })
      );

      // Étape 2 : créer le container carrousel
      const carouselRes = await fetch(
        `https://graph.instagram.com/v21.0/${INSTAGRAM_ID}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_type: 'CAROUSEL',
            children: childIds.join(','),
            caption: caption,
            access_token: ACCESS_TOKEN
          })
        }
      );
      const carousel = refuserSiMort(await carouselRes.json());
      if (!carousel.id) throw new Error(carousel.error?.message || 'Erreur carrousel');

      // Étape 2bis : attendre que le container parent soit prêt (FINISHED) avant de publier
      await waitForContainer(carousel.id, ACCESS_TOKEN);

      // Étape 3 : publier
      const publishRes = await fetch(
        `https://graph.instagram.com/v21.0/${INSTAGRAM_ID}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creation_id: carousel.id,
            access_token: ACCESS_TOKEN
          })
        }
      );
      const published = refuserSiMort(await publishRes.json());
      if (!published.id) throw new Error(published.error?.message || 'Publication échouée');
      const permalink = await fetchPermalink(published.id, ACCESS_TOKEN);
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, id: published.id, permalink })
      };
    }

    // ── STORY ────────────────────────────────────────────────
    if (format === 'story') {
      // Story = image unique 9:16, media_type STORIES. PAS de caption (Meta ne l'affiche pas ;
      // le texte overlay est déjà cuit dans le PNG). Même mécanisme container→publish que le post.
      const containerRes = await fetch(
        `https://graph.instagram.com/v21.0/${INSTAGRAM_ID}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: imageUrl,
            media_type: 'STORIES',
            access_token: ACCESS_TOKEN
          })
        }
      );
      const container = refuserSiMort(await containerRes.json());
      if (!container.id) throw new Error(container.error?.message || 'Erreur container story');

      // attendre que le container soit prêt (FINISHED) avant de publier
      await waitForContainer(container.id, ACCESS_TOKEN);

      // publier
      const publishRes = await fetch(
        `https://graph.instagram.com/v21.0/${INSTAGRAM_ID}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creation_id: container.id,
            access_token: ACCESS_TOKEN
          })
        }
      );
      const published = refuserSiMort(await publishRes.json());
      if (!published.id) throw new Error(published.error?.message || 'Publication story échouée');
      // Une story n'a pas toujours de permalink permanent (elle expire à 24h) → best-effort, peut être null.
      const permalink = await fetchPermalink(published.id, ACCESS_TOKEN);
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, id: published.id, permalink })
      };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Format inconnu' }) };

  } catch (err) {
    /* LE VERDICT REND SON JUGEMENT ICI — et pas ailleurs. Meta a répondu 190 pendant la publication :
       le token est mort. On l'INSCRIT (comme le cron et le statut, par la même fonction), pour que
       le prochain statut n'ait plus à le redemander à Meta — et on renvoie l'état que le client peut
       ACTIONNER, au lieu du message brut de Meta qui ne lui dit rien. */
    if (err instanceof TokenMort) {
      // ⚠️ l'inscription ne doit jamais masquer le refus : si le blob refuse l'écriture, on le dit
      //    au journal et on répond quand même — le client doit reconnecter, blob ou pas.
      try { await inscrireMort(store, conn); }
      catch (e) { console.error('[publish] verdict NON inscrit (blob):', e.message); }
      console.error('[publish] token MORT (190) en cours de publication —', err.message);
      return reconnexionNecessaire();
    }
    console.error('Erreur publication Instagram:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};

// Poll le statut d'un container média jusqu'à FINISHED (recommandé pour le carrousel)
async function waitForContainer(containerId, accessToken, maxTries = 20, delayMs = 2000) {
  for (let i = 0; i < maxTries; i++) {
    const res = await fetch(
      `https://graph.instagram.com/v21.0/${containerId}?fields=status_code&access_token=${accessToken}`
    );
    const data = refuserSiMort(await res.json());
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR') throw new Error('Traitement du carrousel échoué côté Instagram');
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error('Délai de traitement du carrousel dépassé');
}

/* Récupère le lien public du média publié (best-effort).
   ⚠️ PAS DE TAMIS 190 ICI, ET C'EST VOLONTAIRE : à ce stade LE POST EST DÉJÀ EN LIGNE. Un token qui
   meurt entre la publication et la lecture du permalien ne doit pas transformer un succès en refus —
   le client verrait « reconnectez votre compte » alors que sa photo est publiée. Le permalien
   retombe à null, le statut constatera la mort à la prochaine ouverture. */
async function fetchPermalink(mediaId, accessToken) {
  try {
    const res = await fetch(`https://graph.instagram.com/v21.0/${mediaId}?fields=permalink&access_token=${accessToken}`);
    const data = await res.json();
    return data.permalink || null;
  } catch {
    return null;
  }
}
