// netlify/functions/instagram-auth.js
// Étape 1 OAuth — Instagram API with Instagram Login (compte IG direct, sans Page Facebook)
exports.handler = async () => {
  if (!process.env.IG_APP_ID || !process.env.INSTAGRAM_REDIRECT_URI) {
    return { statusCode: 500, body: 'Configuration OAuth manquante (IG_APP_ID / INSTAGRAM_REDIRECT_URI)' };
  }
  const params = new URLSearchParams({
    client_id: process.env.IG_APP_ID,
    redirect_uri: process.env.INSTAGRAM_REDIRECT_URI,
    response_type: 'code',
    scope: 'instagram_business_basic,instagram_business_content_publish',
    state: Math.random().toString(36).slice(2)
  });
  return {
    statusCode: 302,
    headers: { Location: `https://www.instagram.com/oauth/authorize?${params}` }
  };
};
