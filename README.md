# PitchMatch — Backend API

Self-contained **NestJS + MySQL (Prisma)** backend for PitchMatch.
Authentication is handled entirely here — **no Supabase, no external auth provider.**

- JWT access + refresh tokens (refresh tokens are hashed & stored, so they can be revoked)
- Email/phone **OTP** verification (pluggable sender — logs the code until an SMTP/SMS provider is wired)
- Password hashing with bcrypt
- Every route requires auth by default; public routes opt out with `@Public()`
- Swagger docs at `/<API_PREFIX>/docs`

> This is milestone **M1** (auth + user core). Profiles, discovery, swipes/quota,
> billing, matching and chat come in later milestones — see `../PITCHMATCH_BUILD_CHECKLIST.md`.

---

## Endpoints (v1)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET  | `/api/v1/health`        | public | Liveness + DB check |
| POST | `/api/v1/auth/register` | public | Register Investor / Innovator / Mediator |
| POST | `/api/v1/auth/otp/verify` | public | Verify OTP → returns tokens |
| POST | `/api/v1/auth/otp/resend` | public | Resend OTP |
| POST | `/api/v1/auth/login`    | public | Email + password → tokens |
| POST | `/api/v1/auth/refresh`  | public | Rotate refresh token |
| POST | `/api/v1/auth/logout`   | public | Revoke a refresh token |
| GET  | `/api/v1/me`            | Bearer | Current user |
| PUT  | `/api/v1/me`            | Bearer | Update profile fields |
| DELETE | `/api/v1/me`          | Bearer | Soft-delete account |

Interactive docs: `http://localhost:3000/api/v1/docs`

---

## Local development

```bash
npm install                 # installs deps + runs `prisma generate`
cp .env.example .env        # then fill in DATABASE_URL + JWT secrets
npm run prisma:migrate:dev  # creates tables in your MySQL
npm run start:dev           # http://localhost:3000/api/v1
```

Generate strong JWT secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Create the bootstrap admin (admins can't self-register):

```bash
npm run db:seed:admin       # reads ADMIN_* vars from .env
```

The OTP code is printed to the server log until an email/SMS provider is added —
look for a line like `[OTP:EMAIL] user=... code=123456`.

---

## Deploy to Hostinger via GitHub

Hostinger **Business/Cloud Web Hosting** runs managed Node.js apps directly from a Git repo.

1. **Push this folder as its own GitHub repo**

   ```bash
   cd backend
   git init && git add . && git commit -m "PitchMatch backend: auth"
   git branch -M main
   git remote add origin https://github.com/<you>/pitchmatch-backend.git
   git push -u origin main
   ```

2. **Create the MySQL database** in hPanel → *Databases → MySQL*. Copy the host,
   database name, user and password into a connection string:
   `mysql://USER:PASSWORD@HOST:3306/DATABASE`

3. **Create the Node.js app** in hPanel → *Website → Node.js* (or *Web Apps*):
   - **Repository:** connect your GitHub repo, branch `main`
   - **Node version:** 20 (or 22)
   - **Build command:** `npm ci && npx prisma migrate deploy && npm run build`
   - **Start command:** `npm run start:prod`
   - **App / entry:** `dist/main.js`

4. **Set environment variables** in the app panel (from `.env.example`):
   `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `API_PREFIX`,
   `CORS_ORIGINS`, `OTP_*`. **Do not** set `PORT` — Hostinger injects it, and the
   app already listens on `process.env.PORT`.

5. **Deploy.** On each push to `main`, redeploy from the panel (or enable
   auto-deploy). Migrations run in the build step via `prisma migrate deploy`.

6. **Verify:** open `https://api.yourdomain.com/api/v1/health` → `{"status":"ok","db":"up"}`

> A `.github/workflows/ci.yml` build check is included so compile errors are caught
> in GitHub before you redeploy.

---

## Notes on the architecture choice

- **Everything is on this backend + your MySQL.** No Supabase/Firebase for auth or data.
- Real-time chat (a later milestone) will also stay backend-native on this managed
  host (REST + short-poll / SSE against MySQL) rather than Firestore. The only
  Google piece that's unavoidable later is **FCM** — but purely as the Android push
  *transport*, not for storing any data.
