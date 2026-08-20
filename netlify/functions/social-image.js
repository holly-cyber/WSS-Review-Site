// Serves a composed social image that was stashed in Netlify Blobs by
// social-publish, so the Instagram Graph API (which requires a public image_url)
// can fetch it. Short-lived: social-publish deletes the blob right after the IG
// container is created, so these URLs are only live for the few seconds a
// publish takes.
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const id = (event.queryStringParameters && event.queryStringParameters.id) || '';
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(id)) return { statusCode: 400, body: 'bad id' };
  try {
    const store = getStore('social-images');
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
