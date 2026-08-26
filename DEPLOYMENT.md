# Deployment Guide: Render Web Service & Vercel

This guide explains how to deploy this project manually using a **Render Web Service** (without using Render Blueprints or `render.yaml`).

---

## Deployment Architecture Options

You can deploy in one of two setups:

- **Option A (Recommended): Render Web Service (API) + Vercel (Frontend)**
  - Fast global edge CDN for the React Vite frontend on Vercel
  - Dedicated Express API backend on Render Web Service
- **Option B: All-in-One Web Service on Render (Frontend + API together)**
  - Single Render Web Service hosting both the Express API and the static React frontend bundle

---

## Option A: Render Web Service (API) + Vercel (Frontend)

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

## Option B: All-in-One Full-Stack Web Service on Render

If you want to host both the React frontend and Express backend on a single Render Web Service:

### Step 1: Create Web Service

1. Render Dashboard → **New +** → **Web Service**.
2. Select your Git repository.
3. Fill in the configuration:
   - **Name**: `my-portfolio`
   - **Language / Runtime**: `Node`
   - **Branch**: `main`
   - **Root Directory**: *(Leave blank)*
   - **Build Command**: `npm ci --include=dev && npm run build`
   - **Start Command**: `npm run start`
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

## Operations & Troubleshooting

- **Admin Login**: Access `/login` directly in your browser. Default login uses `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
- **Reseed Initial Data**: Admin credentials are read when the database file is first created. To reseed, open the Render **Shell** tab and run `rm /var/data/database.json` (or delete the local file), then restart the service.
- **CORS Error**: Ensure `CLIENT_URL` on Render matches your frontend URL exactly (including `https://`, no trailing slash).
- **Session / Cookie Issues**: Ensure `NODE_ENV=production` is set on Render so secure cookies are configured properly.

