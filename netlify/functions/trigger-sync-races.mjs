// HTTP trigger wrapper for sync-races (manual invocation)
import handler from './sync-races.mjs';
export default handler;
export const config = { path: '/api/sync-races' };
