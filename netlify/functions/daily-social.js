// Scheduled: posts one review to Instagram + Facebook each day. Gated on
// DAILY_SOCIAL_ENABLED=true so it stays off until you switch it on. Time is
// 08:00 UTC (≈9am UK); change the cron below to move it.
import { schedule } from '@netlify/functions';
import { runDailySocial } from '../shared/daily-social.js';

export const handler = schedule('0 8 * * *', async () => {
  const result = await runDailySocial('scheduled');
  console.log('daily-social:', JSON.stringify(result));
  return { statusCode: 200 };
});
