/** Local development / standalone server entry. On Vercel the same app is
 *  exported as a serverless function from api/index.ts instead. */
import app from './app.ts';

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, '0.0.0.0', () => console.log(`API listening on http://0.0.0.0:${PORT} — auth/storage mode is configured via Supabase env vars (see .env.example)`));
