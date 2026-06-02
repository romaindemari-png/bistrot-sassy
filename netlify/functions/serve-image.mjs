import { getStore } from '@netlify/blobs';

// Sert publiquement une image stockée dans Netlify Blobs.
// GET /.netlify/functions/serve-image?key=photos/...
export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const key = event.queryStringParameters?.key;
  // On ne sert que nos propres clés (préfixe photos/)
  if (!key || !key.startsWith('photos/')) {
    return { statusCode: 400, body: 'Clé invalide' };
  }

  try {
    const store = getStore({
      name: 'photos',
      siteID: process.env.SITE_ID,
      token: process.env.NETLIFY_API_TOKEN
    });
    const result = await store.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!result || !result.data) {
      return { statusCode: 404, body: 'Image introuvable' };
    }

    const contentType = (result.metadata && result.metadata.contentType) || 'image/jpeg';
    const base64 = Buffer.from(result.data).toString('base64');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        // clés uniques par upload → contenu immuable, cache long
        'Cache-Control': 'public, max-age=31536000, immutable'
      },
      isBase64Encoded: true,
      body: base64
    };
  } catch (err) {
    console.error('serve-image:', err);
    return { statusCode: 500, body: 'Erreur serveur' };
  }
};
