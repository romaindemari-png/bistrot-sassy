// netlify/functions/generate-caption.mjs
// Génère une légende Instagram + hashtags via Claude API (Instagram studio LeLab+).
// POST protégé par le JWT Netlify Identity. Clé ANTHROPIC_API_KEY côté serveur uniquement.

// Toujours cibler l'Identity de prod (même depuis un deploy preview)
const SITE_URL = process.env.IDENTITY_URL || 'https://gorgeous-heliotrope-e2e59d.netlify.app';

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

const THEME_LABEL = {
  plat: 'photo d\'un plat', menu: 'menu du jour (visuel typographique)',
  ambiance: 'photo d\'ambiance', event: 'événement'
};
const FORMAT_LABEL = { square: 'post carré', portrait: 'portrait', story: 'story' };

// Extrait le 1er objet JSON d'un texte (tolère ```json … ``` ou texte autour)
function parseJson(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a === -1 || b === -1 || b < a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!(await verifyIdentity(token))) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Non autorisé' }) };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY manquante' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON invalide' }) };
  }

  const nom   = (body.nom   || 'le commerce').toString().slice(0, 80);
  const type  = (body.type  || 'restaurant').toString().slice(0, 40);
  const ville = (body.ville || 'Marseille').toString().slice(0, 60);
  const theme = THEME_LABEL[body.theme] || 'publication';
  const format = FORMAT_LABEL[body.format] || 'post';
  const contentText = (body.contentText || '').toString().slice(0, 600);

  const system = `Tu es community manager pour un ${type} nommé "${nom}" à ${ville}. ` +
    `Tu écris des légendes Instagram en français : chaleureuses, concises (2 à 3 phrases), ` +
    `emojis avec parcimonie (1 à 3), sans superlatifs creux ni clichés marketing. ` +
    `Tu proposes aussi 3 à 5 hashtags pertinents et locaux (incluant la ville et le type de commerce), en minuscules.`;

  const userMsg =
    `Contexte de la publication :\n` +
    `- Type de visuel : ${theme}\n` +
    `- Format : ${format}\n` +
    (contentText ? `- Contenu mis en avant : ${contentText}\n` : '') +
    `\nRéponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format :\n` +
    `{"caption": "la légende", "hashtags": ["#tag1", "#tag2", "#tag3"]}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        system,
        messages: [{ role: 'user', content: userMsg }]
      })
    });

    const data = await res.json();
    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: data.error?.message || 'Erreur Claude API' }) };
    }

    const text = (data.content && data.content[0] && data.content[0].text) || '';
    const parsed = parseJson(text);

    let caption, hashtags;
    if (parsed && typeof parsed.caption === 'string') {
      caption = parsed.caption.trim();
      hashtags = Array.isArray(parsed.hashtags)
        ? parsed.hashtags.map(h => String(h).trim()).filter(Boolean).map(h => h.startsWith('#') ? h : '#' + h).slice(0, 5)
        : [];
    } else {
      // Fallback : pas de JSON exploitable → tout le texte en légende
      caption = text.trim();
      hashtags = [];
    }

    return { statusCode: 200, body: JSON.stringify({ caption, hashtags }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
