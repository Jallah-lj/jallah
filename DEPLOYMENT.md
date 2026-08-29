# Deployment Guide: Supabase + Vercel

This guide takes you from a fresh clone to a production deployment:

- **Vercel** hosts the React frontend **and** the Express API (as a serverless function under `/api/*`).
- **Supabase** provides the **Postgres database** (CMS content), **Auth** (admin login), and **Storage** (uploaded images/PDFs).

```text
Browser ──▶ Vercel (https://your-app.vercel.app)
             ├── static SPA (dist/)
             └── /api/* ──▶ api/index.ts (Express, serverless)
                              ├── Postgres   ← Supabase (Prisma, JSONB documents)
                              ├── Auth       ← Supabase Auth (password grant)
                              └── Storage    ← Supabase Storage bucket "media"
```

Deploy Supabase **first**, Vercel second.

---

## Part 1 — Supabase

### 1. Create the project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Choose a region close to your visitors (e.g. `Central EU (Frankfurt)` for Rwanda/East Africa).
3. Save the database password somewhere safe — you'll need it for the connection strings.

### 2. Collect your credentials

From **Project Settings → Database → Connection string → URI** and **Project Settings → API**, fill in a local `.env` (copy from `.env.example`):

| Variable | Where it comes from |
|---|---|
| `DATABASE_URL` | Connection pooling tab — **Transaction mode** URI (port `6543`), append `?pgbouncer=true&connection_limit=1`. Used by the running app. |
| `DIRECT_URL` | Connection pooling tab — **Session mode** URI (port `5432`). Used by migrations/seed scripts. |
| `SUPABASE_URL` | API tab — `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | API tab — `anon` / `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | API tab — `service_role` key (**server only — never expose it to the browser**) |
| `JWT_SECRET` | Any random 32+ character string (`openssl rand -hex 32`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | The admin login to create in Supabase Auth (password min 8 chars) |

### 3. Run migrations and seed

```bash
npm install            # also generates the Prisma client (postinstall)
npm run db:migrate     # creates the CmsDocument table
npm run db:seed        # seeds default content, creates the "media" storage bucket
                       # and the Supabase Auth administrator
```

### 4. Verify

Open **Supabase Dashboard → Table Editor** — you should see the `CmsDocument` table with rows (`profile`, `settings`, `projects`, …). **Storage** should contain a public `media` bucket, and **Authentication → Users** should list your admin email.

---

## Part 2 — Vercel

### 1. Import the repository

1. Push this repository to GitHub.
2. In [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
3. Framework preset, build command, and output directory are already configured by `vercel.json` — leave the defaults.

### 2. Add environment variables

In **Project → Settings → Environment Variables**, add (all environments, or Production at minimum):

```env
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
JWT_SECRET=<same 32+ char secret>
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=<strong password>
```

Notes:

- Use the **transaction pooler (6543)** URL for `DATABASE_URL` — direct connections are IPv6-only and serverless functions need pooled IPv4.
- Prefer a Vercel region matching your Supabase region (e.g. `fra1` with Frankfurt).

### 3. Deploy and verify

Click **Deploy**, then check:

```text
https://your-app.vercel.app/            → portfolio renders (live API data)
https://your-app.vercel.app/api/health  → {"ok":true,...,"database":"ok","auth":"supabase","storage":"supabase"}
https://your-app.vercel.app/login       → sign in with ADMIN_EMAIL / ADMIN_PASSWORD
```

Upload an image in the admin **Media library** — it should appear in Supabase → Storage → `media`, and the URL stored in the database will point at `https://<ref>.supabase.co/storage/v1/object/public/media/...`.

### 4. Custom domain (optional)

Add the domain in **Vercel → Settings → Domains**, then set `CLIENT_URL=https://yourdomain.com` in the Vercel environment variables so the CORS allowlist covers it.

---

### 5. Build notes (Prisma client + npm install scripts)

The API serverless function imports `PrismaClient`, so the client **must** be generated during the build — otherwise `tsc -b` fails with:

```text
server/src/store.ts(1,10): error TS2305: Module '"@prisma/client"' has no exported member 'PrismaClient'.
```

Two independent safeguards cover this:

- `build` runs `prisma generate` explicitly (does not rely on `postinstall`).
- `allowScripts` in `package.json` approves the install scripts of `prisma`, `@prisma/client`, `@prisma/engines` and `esbuild`. npm 11.16+ only warns about unreviewed dependency scripts, but npm 12 **blocks** them by default; without those approvals `prisma generate` has to download engine binaries from `binaries.prisma.sh` on every build, and the deploy fails outright if that download is unavailable.

If a new dependency ships an install script, review it with `npm approve-scripts --allow-scripts-pending` and commit the updated `package.json`.

---

## Migrating existing content (from Render or a JSON install)

If you have live data in `data/database.json` (e.g. downloaded from a Render deployment) and files in `uploads/`:

```bash
DATABASE_URL=... DIRECT_URL=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  DATA_FILE=data/database.json UPLOAD_DIR=uploads npm run migrate:json
```

This uploads every local file to the Supabase `media` bucket, rewrites `/uploads/...` URLs in the data to the public Supabase URLs, and writes all collections to Postgres. Old password hashes are dropped — after migrating, run `npm run db:seed` to create the Supabase Auth administrator.

---

## Local development

```bash
cp .env.example .env   # fill in Supabase values, or run partially without them
npm run dev            # API on :4000 (proxied via Vite on :5173)
```

Without Supabase keys the API runs in **local fallback mode**: login checks `ADMIN_EMAIL`/`ADMIN_PASSWORD` directly and uploads are written to `uploads/`. This is fine for UI work, but data/auth/storage require either Supabase or a local Postgres (`DATABASE_URL`).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `database: "unavailable"` in `/api/health` | Check `DATABASE_URL` (must be the **6543** transaction pooler URI with `?pgbouncer=true`). |
| Prisma error about prepared statements | Ensure `?pgbouncer=true&connection_limit=1` is on `DATABASE_URL`. |
| Login always fails | Confirm the user exists in Supabase → Authentication → Users (`npm run db:seed`), and the password is ≥ 8 chars. |
| Upload returns `File storage is unavailable` | Check `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` and that the `media` bucket exists and is public. |
| Uploads > 4.5 MB rejected | Vercel caps request bodies at 4.5 MB — resize or lower the limit. |
| Admin works on `*.vercel.app` but not your domain | Add the domain to `CLIENT_URL` (comma-separated list). |
| Cold starts feel slow | First request after idle spins up the function (~1s); subsequent requests are warm. |

---

## Why JSONB documents?

Each CMS collection is stored as one JSONB document row in Supabase Postgres (`CmsDocument` table, accessed through Prisma). The admin UI edits loosely-typed documents (nested theme objects, year strings, image URLs as plain strings), so a document store preserves that contract exactly while still giving you durable, transactional, SQL-queryable storage with Supabase backups. Inspect any collection with:

```sql
select key, jsonb_pretty(value) from "CmsDocument" where key = 'settings';
```
