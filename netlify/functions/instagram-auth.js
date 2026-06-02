// netlify/functions/instagram-auth.js
// Étape 1 OAuth : redirige vers la boîte de dialogue Facebook Login for Instagram
exports.handler = async () => {
  if (!process.env.INSTAGRAM_APP_ID || !process.env.INSTAGRAM_REDIRECT_URI) {
    return { statusCode: 500, body: 'Configuration OAuth manquante (INSTAGRAM_APP_ID / INSTAGRAM_REDIRECT_URI)' };
  }
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID,
    redirect_uri: process.env.INSTAGRAM_REDIRECT_URI,
    scope: 'instagram_basic,instagram_content_publish,pages_show_list,business_management',
    response_type: 'code',
    state: Math.random().toString(36).slice(2)
  });
  return {
    statusCode: 302,
    headers: { Location: `https://www.facebook.com/v19.0/dialog/oauth?${params}` }
  };
};
