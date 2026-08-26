# Deployment guide: Vercel (frontend) + Render (API)

Architecture: **Vercel** hosts the React/Vite frontend (`client/` → `dist/`),
**Render** hosts the Express API. The browser calls the API cross-origin via
`VITE_API_URL`; the admin session is a Secure, `SameSite=None` HttpOnly cookie.
At runtime the API persists to a JSON data file + an uploads folder — no
PostgreSQL is needed for this setup (Prisma is the future production data
contract, not the running store).

Deploy the API **first**, because the frontend build wants the API URL.

---

## Phase 1 — Deploy the API to Render

1. Push this repository to GitHub (Render and Vercel both import from there).
2. Sign up at <https://render.com> with your GitHub account and authorize the
   repository.
3. Dashboard → **New → Blueprint** → select this repository. Render reads
   `render.yaml` and creates the `portfolio-cms-api` web service.
   - Manual alternative: **New → Web Service**, Build command
     `npm ci --include=dev`, Start command `npm run start`, Health check path
     `/api/health`, then add the disk and env vars below yourself.
4. Render prompts for the `sync: false` blueprint variables — enter:

   | Variable        | Value                                                        |
   |-----------------|--------------------------------------------------------------|
   | `ADMIN_EMAIL`   | Your private admin login email                               |
   | `ADMIN_PASSWORD`| A long, unique password (login requires ≥ 8 characters)      |
   | `CLIENT_URL`    | Placeholder for now, e.g. `https://placeholder` — updated in Phase 3. Comma-separated for multiple origins. |
   | `SERVER_URL`    | `https://portfolio-cms-api.onrender.com` (your service URL after the first deploy) |

   `JWT_SECRET` is auto-generated; `DATA_FILE=/var/data/database.json` and
   `UPLOAD_DIR=/var/data/uploads` are preset by the blueprint.
5. Click **Deploy**. When it goes live, verify
   `https://<your-service>.onrender.com/api/health` returns
   `{"ok":true,"status":"healthy",...}`.

### Persistence / plan note

The blueprint mounts a **1 GB persistent disk at `/var/data`** (Starter plan,
~$7/mo) so CMS edits and uploaded media survive deploys and restarts.
The free plan cannot attach disks: to test free, set `plan: free` and delete the
`disk:` block in `render.yaml` — but **all data resets on every deploy/restart**,
and free services sleep after ~15 min of inactivity (cold start ~30–60 s; the UI
shows a "waking up" message while you retry).

---

## Phase 2 — Deploy the frontend to Vercel

1. Sign up at <https://vercel.com> with GitHub and import this repository
   (**Add New → Project**).
2. Leave the **Root Directory** at the repo root. Vercel auto-detects Vite from
   `vercel.json` (install `npm install`, build `npm run build`, output `dist`,
   SPA rewrites included).
3. Under **Environment Variables** add one value — **no trailing slash**:

   ```
   VITE_API_URL=https://<your-service>.onrender.com
   ```

4. Click **Deploy**. The build runs `scripts/generate-public-data.mjs`, which
   bakes a public snapshot of `data/database.json` into the bundle, so the
   public portfolio renders even while the free Render API is asleep.
5. When finished you get a URL like `https://your-portfolio.vercel.app`.

---

## Phase 3 — Connect the two origins

1. Copy your final Vercel URL.
2. In Render → service → **Environment** → set `CLIENT_URL` to that URL
   (comma-separate any custom domains, e.g.
   `https://your-portfolio.vercel.app,https://portfolio.com`).
3. **Manual Deploy → Deploy latest commit** (or restart) so Render picks it up.
4. Test end to end:
   - Open the Vercel site, go to `/login` (no admin link is shown publicly).
   - Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
   - Create a project and upload an image; confirm it saves, survives a page
     refresh, and the image loads from `https://<api>.onrender.com/uploads/...`.
   - The API also allows all `*.vercel.app` origins, so Vercel preview/branch
     deploys work without extra configuration.

> Changing `VITE_API_URL` later requires a **Vercel redeploy** — it is embedded
> at build time. Changing `CLIENT_URL` requires a Render restart/redeploy.

---

## Custom domains (optional)

- Vercel: Project → **Settings → Domains** → add your domain and follow the DNS
  instructions (A/CNAME records).
- Render: service → **Settings → Custom Domains** → add e.g.
  `api.portfolio.com` and add the CNAME record Render shows.
- Afterward: put the final API URL in `VITE_API_URL` and redeploy Vercel; add
  the final web origin(s) to Render's `CLIENT_URL` and redeploy Render.

---

## Operations notes

- **Admin credentials only seed once.** They are read when
  `/var/data/database.json` is first created. To reseed, open the Render
  service **Shell** and delete the file (`rm /var/data/database.json`); the API
  recreates it on next restart with the current env values. Password can also
  be changed from the account page in the dashboard.
- **Backups:** with the Starter disk, download `/var/data/database.json`
  periodically (Render Shell or SSH). For real production use, migrate the
  store to Prisma/PostgreSQL (`prisma/schema.prisma` is the data contract) and
  media to S3/R2/Cloudinary per the README checklist.
- **Troubleshooting login:** a browser-console CORS error means the Vercel
  origin isn't in `CLIENT_URL` (or Render wasn't restarted after the change).
  A cookie not being set means one side isn't HTTPS or `NODE_ENV` isn't
  `production` on Render.
