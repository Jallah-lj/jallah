/** Vercel serverless entry point — the Express app in server/src/app.ts is
 *  mounted for every /api/* request via the rewrite in vercel.json. */
export { default } from '../server/src/app.ts';
export { app } from '../server/src/app.ts';
