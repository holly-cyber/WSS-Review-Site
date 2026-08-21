// Serves a composed social image that was stashed in Netlify Blobs by
// social-publish, so the Instagram Graph API (which requires a public image_url)
// can fetch it. Short-lived: social-publish deletes the blob right after the IG
// container is created, so these URLs are only live for the few seconds a
// publish takes.
const { getStore } = require('@netlify/blobs');

// Netlify Blobs normally auto-configures inside Functions, but some deploy
// runtimes don't inject that context (you get "environment has not been
// configured to use Netlify Blobs"). When NETLIFY_BLOBS_TOKEN is set we
// configure the store manually with siteID + token instead.
function socialStore() {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.BLOBS_SITE_ID || process.env.SITE_ID || '66c21efb-4d43-4271-b164-37081de5da02';
  return token ? getStore({ name: 'social-images', siteID, token }) : getStore('social-images');
}

exports.handler = async (event) => {
  const id = (event.queryStringParameters && event.queryStringParameters.id) || '';
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(id)) return { statusCode: 400, body: 'bad id' };
  try {
    const store = socialStore();
    const res = await store.getWithMetadata(id, { type: 'arrayBuffer' });
    if (!res || !res.data) return { statusCode: 404, body: 'not found' };
    const ct = (res.metadata && res.metadata.ct) || 'image/png';
    return {
      statusCode: 200,
      headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=300' },
      body: Buffer.from(res.data).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (e) {
    return { statusCode: 500, body: 'error: ' + e.message };
  }
};
