// Manual trigger for the daily social post — used to test it once before the
// schedule is trusted, or to fire an extra post on demand. Protected by
// DAILY_SOCIAL_RUN_KEY (?key=…). ?force=1 posts even while the schedule is off
// (DAILY_SOCIAL_ENABLED not yet true), so you can verify end-to-end first.
import { runDailySocial } from '../shared/daily-social.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const q = event.queryStringParameters || {};
  const need = process.env.DAILY_SOCIAL_RUN_KEY;
  // This endpoint posts to live socials, so it's inert until a secret is set.
  if (!need) return { statusCode: 403, headers: CORS, body: 'Set DAILY_SOCIAL_RUN_KEY in Netlify to enable manual runs.' };
  if (q.key !== need) return { statusCode: 403, headers: CORS, body: 'forbidden' };
  const result = await runDailySocial('manual', { force: q.force === '1' });
  return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(result, null, 2) };
};
