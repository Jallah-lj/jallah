# Atlas Portfolio CMS

A premium, responsive developer portfolio and authenticated content management dashboard. The public experience is entirely data-driven; the CMS provides persistent CRUD, publishing controls, media uploads, messages, appearance tokens, and activity tracking.

## Highlights

- Responsive public portfolio with projects, skills, experience, services, testimonials, and contact
- Secure email/password admin login (bcrypt, signed HttpOnly JWT cookie, SameSite protection)
- CRUD editors for projects, skills, experience, education, certifications, services, testimonials, articles, resumes, and messages
- Media library with image/PDF validation, 5 MB limits, preview, and deletion
- Persistent appearance editor using live CSS design tokens
- Rate-limited contact form and login; Helmet security headers; Zod server validation
- Search, status labels, confirmations, empty/loading/error states, and activity log
- Normalized production PostgreSQL data model in `prisma/schema.prisma`

## Architecture

```text
client/             React + TypeScript + Vite UI
server/src/         Express API, auth, validation, persistence
prisma/             Normalized PostgreSQL schema
uploads/            Local development media storage
data/                Zero-configuration development data store
Dockerfile          Production image: API + UI + volume-backed JSON store
fly.toml            Fly.io deployment (~$2–4/mo, persistent volume, no DB)
docker-compose.yml  Self-hosting ($0: Oracle Free Tier / VPS / home server)
```

The included zero-configuration development adapter persists atomically to `data/database.json`, allowing the complete preview to run without infrastructure. For a single-server production deployment **no database is required at all**: the same JSON store runs in production behind a persistent volume — see `DEPLOYMENT.md` for Fly.io (~$2–4/mo, `fly deploy`) and $0 self-hosting (`docker compose up`) recipes. If you later outgrow a single writer, the normalized Prisma/PostgreSQL schema is the production data contract: provision PostgreSQL, set `DATABASE_URL`, run migrations, and connect the repository methods in `server/src/store.ts` to Prisma Client. Media metadata belongs in PostgreSQL; binaries use the storage adapter boundary (`uploads/` locally, S3/Cloudinary in production).

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`. Default local-only credentials (change before deployment):

- Email: `admin@atlas.dev`
- Password: `ChangeMe123!`

Environment credentials are read when the development data store is created. Delete `data/database.json` to reseed after changing them.

## Commands

```bash
npm run dev          # API + Vite development server
npm run build        # type check and optimized client build
npm run start        # serve API (and built UI with NODE_ENV=production)
npm run lint         # strict TypeScript checks
npm run test         # Vitest
npm run db:generate  # generate Prisma Client from the explicit schema path
npm run db:migrate   # deploy Prisma migrations from the explicit schema path
npm run db:seed      # seed hook
```

## PostgreSQL setup

1. Create a PostgreSQL 15+ database.
2. Set `DATABASE_URL` in `.env`.
3. Install/generate the Prisma client for your chosen Prisma version.
4. During development run `npx prisma migrate dev --name init`; in production run `npm run db:migrate`.
5. Use a least-privilege database account and TLS in production.

The schema includes unique constraints, cascade/set-null behavior, relationship tables, and indexes for publication, ordering, message state, and activity.

## Production checklist

- Set a random 32+ character `JWT_SECRET` and strong admin password.
- Serve behind TLS; secure cookies turn on with `NODE_ENV=production`.
- Restrict `CLIENT_URL` to the canonical HTTPS origin.
- Replace local uploads with an S3-compatible implementation; use signed URLs and malware scanning.
- Back up PostgreSQL and object storage; configure retention and monitoring.
- Add an external reverse-proxy rate limiter and transactional email provider.
- Run dependency, SAST, authorization, upload, and browser accessibility tests in CI.

## Authentication and security

Passwords are bcrypt-hashed and never returned. Sessions are seven-day signed JWTs in HttpOnly, SameSite=Strict cookies. Admin routes enforce authorization middleware. Helmet, CORS allowlisting, request-size limits, rate limits, ORM-safe schema design, MIME validation, randomized upload names, generic errors, and honeypot spam defense are included. For multi-admin/high-risk deployments, add server-side session revocation, CSRF tokens, MFA, password reset, account lockout, and an audit sink.

## Media storage

`POST /api/upload` accepts JPEG, PNG, WEBP, GIF, and PDF up to 5 MB. Files are stored outside the database and only metadata/URLs are persisted. `UPLOAD_DIR` selects local storage. The service boundary is intentionally small so the disk writer can be swapped for S3, R2, MinIO, or Cloudinary without changing UI forms.

## Deployment

Build with `npm run build`, set production environment variables, migrate PostgreSQL, then run `NODE_ENV=production npm start`. Put the process behind Nginx, Caddy, a managed container ingress, or a platform load balancer. Persist object storage externally; never rely on an ephemeral container filesystem.

## Deployment (Render Web Service + Vercel or Full-Stack)

The public navigation intentionally contains no admin link. The owner can still sign in at `/login`. See `DEPLOYMENT.md` for full step-by-step instructions.

### 1. Deploy as a Render Web Service (Manual setup without Blueprint)

Push the repository to GitHub/GitLab, choose **New + → Web Service** in Render, and select the repository.

**Web Service Settings:**
- **Runtime**: `Node`
- **Build Command**: `npm ci --include=dev` *(or `npm ci --include=dev && npm run build` if serving full-stack)*
- **Start Command**: `npm run start`
- **Health Check Path**: `/api/health`
- **Persistent Disk** *(Starter plan ~$7/mo)*: Name `cms-data`, Mount Path `/var/data`, Size `1 GB`

**Environment Variables:**
```env
NODE_ENV=production
CLIENT_URL=https://your-portfolio.vercel.app
SERVER_URL=https://your-api.onrender.com
ADMIN_EMAIL=your-private-admin@example.com
ADMIN_PASSWORD=use-a-long-unique-password
JWT_SECRET=replace-with-at-least-32-random-characters
DATA_FILE=/var/data/database.json
UPLOAD_DIR=/var/data/uploads
```

*Note: On the Free tier without a persistent disk, set `DATA_FILE=data/database.json` and `UPLOAD_DIR=uploads` (ephemeral).*

### 2. Deploy the frontend to Vercel

Import the same repository in Vercel. The root `vercel.json` supplies the Vite build and SPA route fallback. Add this production environment variable:

```env
VITE_API_URL=https://your-api.onrender.com
```

Do not include a trailing slash. Deploy again after changing a Vite environment variable because it is embedded at build time.

### 3. Complete the origin allowlist

Once Vercel gives you the final URL, copy it into Render's `CLIENT_URL` in the Environment tab and save. Authentication uses a Secure, HttpOnly, `SameSite=None` cookie for the cross-origin Vercel/Render arrangement.

Verify:

```text
https://your-api.onrender.com/api/health
https://your-portfolio.vercel.app
https://your-portfolio.vercel.app/login
```

For private browsing configurations that block all third-party cookies, use custom domains under the same parent domain or proxy `/api` through the frontend domain.

> Current storage note: the deployed runtime continues to use the persistent JSON repository on the Render disk until the Prisma repository milestone is completed. The PostgreSQL schema and service are provisioned, but migration alone does not switch the API repository.
