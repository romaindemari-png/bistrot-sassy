// netlify/functions/save-data.js
// Sauvegarde les données JSON dans GitHub via Git Gateway (Netlify Identity)

exports.handler = async (event) => {

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Récupérer le token Netlify Identity depuis le header Authorization
  const authHeader = event.headers['authorization'] || event.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Non autorisé' }) };
  }
  const netlifyToken = authHeader.replace('Bearer ', '');

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON invalide' }) };
  }

  const { section, data } = body;

  // Mapping section → fichier JSON
  const fileMap = {
    contact:  '_data/general.json',
    horaires: '_data/horaires.json',
    menu:     '_data/carte.json',
    photos:   '_data/photos.json'
  };

  const filePath = fileMap[section];
  if (!filePath) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Section inconnue' }) };
  }

  try {
    // Git Gateway est exposé sur l'origine du site (proxy local), PAS sur api.netlify.com.
    // process.env.URL est injecté automatiquement par Netlify (URL principale du site).
    const gatewayBase = `${process.env.URL}/.netlify/git/github`;

    // 1. Récupérer le fichier actuel (pour avoir son SHA)
    const getRes = await fetch(`${gatewayBase}/contents/${filePath}`, {
      headers: {
        'Authorization': `Bearer ${netlifyToken}`,
        'Content-Type': 'application/json'
      }
    });

    let sha = null;
    if (getRes.ok) {
      const current = await getRes.json();
      sha = current.sha;
    } else if (getRes.status !== 404) {
      // 404 = le fichier n'existe pas encore (création) → on continue sans sha.
      // Tout autre statut = vraie erreur → on s'arrête avec un message lisible.
      const detail = await getRes.text();
      throw new Error(`Lecture du fichier échouée (HTTP ${getRes.status}) : ${detail}`);
    }

    // 2. Encoder le nouveau contenu en base64
    const newContent = JSON.stringify(data, null, 2);
    const encoded = Buffer.from(newContent).toString('base64');

    // 3. Écrire le fichier dans GitHub via Git Gateway
    const putBody = {
      message: `[Admin] Mise à jour ${section}`,
      content: encoded,
      ...(sha ? { sha } : {})
    };

    const putRes = await fetch(`${gatewayBase}/contents/${filePath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${netlifyToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(putBody)
    });

    if (!putRes.ok) {
      // Ne plus supposer du JSON : lire le corps en texte pour remonter la vraie erreur HTTP.
      const detail = await putRes.text();
      throw new Error(`Écriture GitHub échouée (HTTP ${putRes.status}) : ${detail}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, file: filePath })
    };

  } catch (err) {
    console.error('Erreur save-data:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
