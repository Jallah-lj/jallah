# Atlas Portfolio CMS

A premium, responsive developer portfolio and authenticated content management dashboard. The public experience is entirely data-driven; the CMS provides persistent CRUD, publishing controls, media uploads, messages, appearance tokens, and activity tracking.

## Highlights

- Responsive public portfolio with projects, skills, experience, services, testimonials, and contact
- Admin login backed by Supabase Auth (signed HttpOnly JWT cookie)
- CRUD editors for projects, skills, experience, education, certifications, services, testimonials, articles, resumes, and messages
- Media library with image/PDF validation, 4.5 MB limits, preview, and deletion (Supabase Storage)
- Persistent appearance editor using live CSS design tokens
- Rate-limited contact form and login; Helmet security headers; Zod server validation
- Search, status labels, confirmations, empty/loading/error states, and activity log
- Content persisted as JSONB documents in Supabase Postgres via Prisma

## Architecture

```text
client/             React + TypeScript + Vite UI
server/src/         Express API, auth, validation, persistence (app.ts + store.ts)
api/index.ts        Vercel serverless entry — mounts the Express app for /api/*
prisma/             Prisma schema + migrations (CmsDocument JSONB store)
uploads/            Local development media storage (fallback when Supabase is unset)
data/               Legacy JSON data — import with npm run migrate:json
```

Each CMS collection (profile, settings, projects, …) is one JSONB document in Supabase Postgres, read and written through Prisma (`server/src/store.ts`). This keeps the exact JSON shapes the admin UI uses while making the data durable and SQL-queryable. Authentication delegates credential checks to Supabase Auth; uploads go to a public Supabase Storage bucket. Without Supabase keys the API falls back to local dev modes (env-var login, `uploads/` disk) so the UI can run without infrastructure.

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`. Local login (when Supabase keys are absent) uses the `ADMIN_EMAIL` / `ADMIN_PASSWORD` values from `.env`. With Supabase configured, the same credentials are verified by Supabase Auth instead.

## Commands

```bash
npm run dev          # API + Vite development server
npm run build        # type check and optimized client build
npm run start        # serve API (and built UI with NODE_ENV=production)
npm run lint         # strict TypeScript checks
npm run test         # Vitest
npm run db:generate  # generate Prisma Client from the explicit schema path
npm run db:migrate   # deploy Prisma migrations from the explicit schema path
npm run db:seed      # seed content, storage bucket, and Supabase Auth admin
npm run theme:apply  # one-off: push the default palette to an existing database
npm run migrate:json # one-time import of legacy data/database.json + uploads/
```

## Database setup

The production database is Supabase Postgres:

1. Create a Supabase project and copy the credentials (see `.env.example` and `DEPLOYMENT.md`).
2. `npm run db:migrate` — creates the `CmsDocument` table.
3. `npm run db:seed` — seeds default content, the public `media` storage bucket, and the Supabase Auth administrator.

Local development can point `DATABASE_URL`/`DIRECT_URL` at any PostgreSQL 15+ instance instead.

## Production checklist

- Set a random 32+ character `JWT_SECRET` and strong admin password.
- Serve behind TLS; secure cookies turn on with `NODE_ENV=production`.
- Restrict `CLIENT_URL` to the canonical HTTPS origin.
- Keep the `service_role` key server-side only; never prefix it with `VITE_`.
- Back up Supabase (automated daily backups on paid plans) and review Storage usage.
- Run dependency, SAST, authorization, upload, and browser accessibility tests in CI.

## Authentication and security

Credentials are verified by Supabase Auth (bcrypt-hashed there); the API then issues seven-day signed JWTs in HttpOnly cookies. Admin routes enforce authorization middleware. Helmet, CORS allowlisting, request-size limits, rate limits, MIME validation, randomized upload names, generic errors, and honeypot spam defense are included. For multi-admin/high-risk deployments, add server-side session revocation, CSRF tokens, MFA, password reset, account lockout, and an audit sink.

## Media storage

`POST /api/upload` accepts JPEG, PNG, WEBP, GIF, and PDF up to 4.5 MB (Vercel's request-body limit). Files are stored in the public Supabase Storage bucket `media` and only metadata/URLs are persisted in the database. Without Supabase keys, uploads fall back to the local `uploads/` directory for development.

## Deployment

Everything runs on **Supabase + Vercel**: the Express API is deployed as a Vercel serverless function (`api/index.ts` + `vercel.json`), content lives in Supabase Postgres, auth in Supabase Auth, and media in Supabase Storage. The public navigation intentionally contains no admin link — the owner can sign in at `/login`.

See **`DEPLOYMENT.md`** for the full step-by-step guide (Supabase setup, Vercel import, environment variables, migrating legacy data, and troubleshooting).

> Current storage note: the deployed runtime continues to use the persistent JSON repository on the Render disk until the Prisma repository milestone is completed. The PostgreSQL schema and service are provisioned, but migration alone does not switch the API repository.
