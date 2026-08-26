# Deployment Guide

The CMS needs **no PostgreSQL or any other database server**. Content and
uploaded media live in two files on a persistent volume (`DATA_FILE` +
`UPLOAD_DIR`). Any host that gives the container a persistent filesystem works.

## Choosing a host

| Option | Cost | Persistence | Notes |
|---|---|---|---|
| **Fly.io** (recommended) | ~$2–4/mo | Persistent volume | One Docker container, `fly deploy` from your machine. No fixed plan fee; billed per second. Card required. |
| **Self-host with Docker** | $0 (Oracle Cloud Always Free ARM VM, home server) or any cheap VPS | Named Docker volume | `docker compose up -d --build`. You manage TLS (Caddy block included) and updates. |
| Render Web Service (Starter + disk) | ~$8/mo | Persistent disk | Easiest UI; see the Render section below. |
| Render Free / Koyeb free / similar | $0 | ❌ Ephemeral filesystem | **Not viable for the CMS**: free containers wipe `DATA_FILE`/`UPLOAD_DIR` on every restart/deploy, losing all content and media. Fine only as a throwaway demo. |
| Railway | ~$5/mo | Volume attachable | Same Docker image works. |
| Vercel | $0 | ❌ Serverless, no filesystem | Frontend-only (see Render + Vercel section); the API needs a real host. |

> The single-container options below serve the public site, the CMS, and the
> API from one origin, so no CORS configuration is needed. Set
> `CLIENT_URL=https://your-domain` anyway if you ever split the frontend out.

---

## Option 1 — Fly.io (~$2–4/month, recommended)

Cheapest managed host with a persistent filesystem. `fly.toml`, `Dockerfile`,
and `docker-entrypoint.sh` are already in the repo. First boot copies your
committed `data/database.json` onto the volume, so the site starts with your
current content.

```bash
npm install -g flyctl        # or: brew install flyctl
fly auth signup              # card required; pay-as-you-go, no monthly minimum

fly launch --no-deploy       # pick an app name + region (jnb = Johannesburg,
                             # closest to Kigali; fra = Frankfurt, iad = US East)
                             # fly launch imports the existing fly.toml settings

fly secrets set \
  JWT_SECRET="$(openssl rand -hex 32)" \
  ADMIN_EMAIL="you@example.com" \
  ADMIN_PASSWORD="a-strong-password" \
  CLIENT_URL="https://<your-app>.fly.dev"

fly deploy                   # builds the Docker image, creates the 1 GB volume
fly open                     # → https://<your-app>.fly.dev
```

Log in at `https://<your-app>.fly.dev/login` with `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

Notes:

- **Costs** (at the time of writing): `shared-cpu-1x` 256 MB ≈ $1.94/mo
  always-on, 1 GB volume ≈ $0.15/mo, shared IPv4 free (avoid the $2/mo
  dedicated IPv4). `fly.toml` enables auto-stop so an idle portfolio often
  bills well under $2/mo; set `min_machines_running = 1` and
  `auto_stop_machines = "off"` for always-on.
- **Custom domain**: `fly certs add yourdomain.com`, then add the shown A/AAAA
  records, then update `CLIENT_URL` via `fly secrets set`.
- **Logs / shell**: `fly logs`, `fly ssh console`.

## Option 2 — $0 self-hosting with Docker

The same image runs on any Docker host — an **Oracle Cloud Always Free** ARM
VM (genuinely free tier: 4 OCPU / 24 GB RAM / 200 GB disk, card required at
signup but not charged while on free resources), a home server, or any cheap
VPS.

```bash
git clone https://github.com/Jallah-lj/jallah && cd jallah
cp .env.example .env         # set JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up -d --build # site + CMS at http://<host>:8080
```

`docker-compose.yml` mounts the named volume `cms-data` at `/var/data`, so
content and media survive restarts and rebuilds. For automatic HTTPS, point
your domain's DNS at the machine and uncomment the Caddy service in
`docker-compose.yml`, then `docker compose up -d caddy`.

Updates: `git pull && docker compose up -d --build` (data volume untouched).

## Backups & restore (any volume-backed host)

- **One-click**: log in to the CMS and open `GET /api/backup` (or visit
  `/api/backup` while logged in) — downloads all content as JSON, minus the
  password hash. Curl version:
  ```bash
  curl -c c.txt -X POST https://your-host/api/auth/login \
       -H 'Content-Type: application/json' \
       -d '{"email":"you@example.com","password":"..."}'
  curl -b c.txt https://your-host/api/backup > portfolio-backup.json
  ```
- **Everything (data + media)**:
  - Fly: `fly ssh console -C "tar czf - -C /var/data ." > backup.tgz`
  - Docker: `docker exec <container> tar czf - -C /var/data . > backup.tgz`
- **Restore**: stop the app, replace `/var/data/database.json` (and
  `/var/data/uploads/`) with the backup, start the app. A backup without a
  password hash is fine — the admin account is rebuilt from
  `ADMIN_EMAIL`/`ADMIN_PASSWORD` on boot; keep those secrets available.

---

## Alternative: Render Web Service & Vercel

This section explains how to deploy manually using a **Render Web Service**
(without using Render Blueprints or `render.yaml`).

---

### Deployment architecture options

You can deploy in one of two setups:

- **Option A (Recommended): Render Web Service (API) + Vercel (Frontend)**
  - Fast global edge CDN for the React Vite frontend on Vercel
  - Dedicated Express API backend on Render Web Service
- **Option B: All-in-One Web Service on Render (Frontend + API together)**
  - Single Render Web Service hosting both the Express API and the static React frontend bundle

---

### Option A: Render Web Service (API) + Vercel (Frontend)

Deploy the Render API Web Service **first**, then deploy the frontend on Vercel.

### Step 1: Create the Web Service in Render

1. Log into your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** → **Web Service**.
3. Select **Build and deploy from a Git repository** and connect your repository.
4. Fill in the **Service Details**:
   - **Name**: `portfolio-cms-api` (or your chosen name)
   - **Language / Runtime**: `Node`
   - **Region**: Choose the region closest to your users (e.g. `Oregon (US West)` or `Frankfurt (EU Central)`)
   - **Branch**: `main` (or your active branch)
   - **Root Directory**: *(Leave blank)*
   - **Build Command**: `npm ci --include=dev`
   - **Start Command**: `npm run start`
   - **Instance Type**:
     - **Starter** (~$7/mo): Recommended for CMS persistence (allows adding a persistent disk).
     - **Free**: Works for testing, but data and uploads reset when the service restarts or deploys.

### Step 2: Configure Advanced Settings

Scroll down to **Advanced**:
- **Health Check Path**: `/api/health`
- **Auto-Deploy**: `Yes`

### Step 3: Add Persistent Disk (Starter Plan Only)

If using the **Starter** (or higher) plan:
1. Under the **Disks** section, click **Add Disk**.
2. **Name**: `cms-data`
3. **Mount Path**: `/var/data`
4. **Size**: `1 GB` (or larger)

*(Note: On the Free plan, skip this step. Render free instances cannot attach disks.)*

### Step 4: Configure Environment Variables

Under the **Environment Variables** section, add the following:

| Key | Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Enables production security & cookies |
| `JWT_SECRET` | *(Generate a 32+ char random string)* | Secret for admin authentication tokens |
| `ADMIN_EMAIL` | `admin@example.com` *(your email)* | Email for admin login at `/login` |
| `ADMIN_PASSWORD` | `YourStrongPassword123!` *(min 8 chars)* | Password for admin login |
| `SERVER_URL` | `https://portfolio-cms-api.onrender.com` | Your Render service URL (copy after creation) |
| `CLIENT_URL` | `https://placeholder` | Will update with your Vercel URL in Step 6 |
| `DATA_FILE` | `/var/data/database.json` *(with Disk)* **or** `data/database.json` *(Free plan)* | Storage path for CMS JSON data |
| `UPLOAD_DIR` | `/var/data/uploads` *(with Disk)* **or** `uploads` *(Free plan)* | Storage path for uploaded media files |

5. Click **Create Web Service**.
6. When deployment finishes, verify health check at: `https://<your-service>.onrender.com/api/health` (should return `{"ok":true,"status":"healthy",...}`).

---

### Step 5: Deploy Frontend to Vercel

1. Log into [Vercel](https://vercel.com) and click **Add New → Project**.
2. Import your Git repository.
3. Keep **Root Directory** as `./` (repo root).
4. Under **Environment Variables**, add:
   - **Key**: `VITE_API_URL`
   - **Value**: `https://<your-service>.onrender.com` *(no trailing slash)*
5. Click **Deploy**.
6. Vercel will output your live URL (e.g. `https://your-portfolio.vercel.app`).

---

### Step 6: Connect Origins (CORS & Auth)

1. Return to the Render Dashboard → your Web Service → **Environment**.
2. Update `CLIENT_URL` with your actual Vercel URL (e.g. `https://your-portfolio.vercel.app`).
   *(For multiple domains, use a comma-separated list: `https://your-portfolio.vercel.app,https://yourcustomdomain.com`)*.
3. Click **Save Changes** (Render will automatically redeploy/restart the service).

---

### Option B: All-in-one full-stack web service on Render

If you want to host both the React frontend and Express backend on a single Render Web Service:

### Step 1: Create Web Service

1. Render Dashboard → **New +** → **Web Service**.
2. Select your Git repository.
3. Fill in the configuration:
   - **Name**: `my-portfolio`
   - **Language / Runtime**: `Node`
   - **Branch**: `main`
   - **Root Directory**: *(Leave blank)*
   - **Build Command**: `npm ci --include=dev && npm run build && npm run build:server`
   - **Start Command**: `npm run start:prod`
   - **Health Check Path**: `/api/health`

### Step 2: Persistent Disk (Optional / Starter Plan)
- **Mount Path**: `/var/data`
- **Size**: `1 GB`

### Step 3: Environment Variables
Add these environment variables:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SERVE_CLIENT` | `true` |
| `JWT_SECRET` | *(Generate a 32+ character random string)* |
| `ADMIN_EMAIL` | `admin@example.com` |
| `ADMIN_PASSWORD` | `YourStrongPassword123!` |
| `SERVER_URL` | `https://<your-service-name>.onrender.com` |
| `CLIENT_URL` | `https://<your-service-name>.onrender.com` |
| `DATA_FILE` | `/var/data/database.json` *(with Disk)* **or** `data/database.json` *(Free plan)* |
| `UPLOAD_DIR` | `/var/data/uploads` *(with Disk)* **or** `uploads` *(Free plan)* |

Click **Create Web Service**. Your entire application (portfolio site + CMS admin + API) will be available at your Render URL!

---

### Operations & troubleshooting (Render)

- **Admin Login**: Access `/login` directly in your browser. Default login uses `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
- **Reseed Initial Data**: Admin credentials are read when the database file is first created. To reseed, open the Render **Shell** tab and run `rm /var/data/database.json` (or delete the local file), then restart the service.
- **CORS Error**: Ensure `CLIENT_URL` on Render matches your frontend URL exactly (including `https://`, no trailing slash).
- **Session / Cookie Issues**: Ensure `NODE_ENV=production` is set on Render so secure cookies are configured properly.

