// netlify/functions/publish-instagram.js
// Fonction Netlify pour publier sur Instagram via l'API Meta

exports.handler = async (event) => {

  // Sécurité : POST uniquement
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Connexion via OAuth (Blobs) en priorité, sinon fallback env (transition)
  let ACCESS_TOKEN, INSTAGRAM_ID;
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore({ name: 'instagram', siteID: process.env.SITE_ID, token: process.env.NETLIFY_API_TOKEN });
    const conn = await store.get('connection', { type: 'json' });
    if (conn) { ACCESS_TOKEN = conn.accessToken; INSTAGRAM_ID = conn.igUserId; }
  } catch (e) {
    console.warn('Lecture connexion Instagram (Blobs) échouée, fallback env :', e.message);
  }
  ACCESS_TOKEN = ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN;
  INSTAGRAM_ID = INSTAGRAM_ID || process.env.INSTAGRAM_ACCOUNT_ID;

  if (!ACCESS_TOKEN || !INSTAGRAM_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Instagram non connecté (ni OAuth ni variables d\'environnement)' })
    };
  }

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
      const container = await containerRes.json();
      if (!container.id) throw new Error(container.error?.message || 'Erreur container');

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
      const published = await publishRes.json();
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, id: published.id })
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
          const data = await res.json();
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
      const carousel = await carouselRes.json();
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
      const published = await publishRes.json();
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, id: published.id })
      };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Format inconnu' }) };

  } catch (err) {
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
    const data = await res.json();
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR') throw new Error('Traitement du carrousel échoué côté Instagram');
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error('Délai de traitement du carrousel dépassé');
}
