// HTTP trigger wrapper for sync-drivers (manual invocation)
import handler from './sync-drivers.mjs';
export default handler;
export const config = { path: '/api/sync-drivers' };
