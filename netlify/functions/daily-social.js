// Scheduled: posts one review to Instagram + Facebook each day. Gated on
// DAILY_SOCIAL_ENABLED=true so it stays off until you switch it on. Cron is UTC:
// 17:00 UTC = 6pm UK while BST is in effect (mid-Mar–late-Oct). When the clocks
// go back it becomes 5pm UK — change to '0 18 * * *' then to hold 6pm.
import { schedule } from '@netlify/functions';
import { runDailySocial } from '../shared/daily-social.js';

export const handler = schedule('0 17 * * *', async () => {
  const result = await runDailySocial('scheduled');
  console.log('daily-social:', JSON.stringify(result));
  return { statusCode: 200 };
});
