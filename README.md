# Job Application Tracker

A backend service for tracking job applications, with resume uploads, follow-up reminders, and event-driven notifications.

Users add jobs they've applied to, upload resumes, and get follow-up reminders. The system nudges them when an application has gone stale (e.g., "It's been 7 days since you applied to X — send a follow-up?").

> **Note:** This project is being built incrementally. See [CLAUDE.md](./CLAUDE.md) for the full step-by-step plan. The instructions below describe **what's working today** (through Step 7 — Cron + follow-up reminders).

---

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │           Express API (Node/TS)         │
                    │  /auth  /applications  /resumes  /...   │
                    └───┬─────────────┬────────────┬──────────┘
                        │             │            │
              JWT auth  │             │ Prisma     │ producer
              + Redis   │             │            │
              ratelimit │             ▼            ▼
                        │       ┌──────────┐  ┌────────┐
                        │       │ Postgres │  │ Kafka  │
                        │       └──────────┘  └────┬───┘
                        ▼                          │
                  ┌──────────┐                     │ consumers
                  │  Redis   │                     ▼
                  └──────────┘          ┌───────────────────────┐
                                        │ email · analytics ·   │
                                        │ notifications         │
                                        └───────────────────────┘
                  ┌──────────┐
                  │  Cron    │ daily → finds stale applications
                  └──────────┘        → emits `followup.due` to Kafka

  Resumes → S3 / MinIO (pre-signed upload + download URLs)
```

| Concern | Tech | Purpose |
|---|---|---|
| Auth | JWT (access + refresh) | Stateless session tokens for API access |
| Primary DB | Postgres 16 + Prisma ORM | Stores `users`, `companies`, `applications`, `contacts`, `resumes`, `events` |
| Event bus | Kafka (KRaft mode) | Topics: `application.created`, `status.changed`, `interview.scheduled`, `followup.due` |
| Cache / rate limit | Redis 7 | Caches dashboard view; rate-limits login attempts |
| Scheduler | Cron job inside the API process | Daily scan for stale applications |
| File storage | MinIO (S3-compatible) | Resume uploads (PDF/DOCX) via pre-signed URLs |
| Email (local) | Mailpit | Captures outbound SMTP for inspection at http://localhost:8025 |

### Data model

| Table | Key fields |
|---|---|
| `users` | id, email (unique), password_hash, created_at |
| `companies` | id, name, website, notes |
| `applications` | id, user_id, company_id, role, **status**, applied_at, last_followed_up_at |
| `contacts` | id, company_id, name, email, role |
| `resumes` | id, user_id, s3_key, filename, size_bytes, uploaded_at |
| `events` | id, type, payload (JSON), occurred_at — audit log mirroring Kafka events |

`ApplicationStatus` enum: `APPLIED`, `INTERVIEW`, `OFFER`, `REJECTED`, `WITHDRAWN`.

### Event topics

| Topic | Emitted when | Consumers |
|---|---|---|
| `application.created` | `POST /applications` succeeds | email, analytics |
| `status.changed` | Application status updates | email, analytics, notifications, cache invalidation |
| `interview.scheduled` | Interview date set on an application | email, notifications |
| `followup.due` | Daily cron finds a stale application | email |

---

## Prerequisites

- **Node.js ≥ 20** (developed on Node 25)
- **Docker Desktop** (for Postgres, Redis, Kafka, MinIO, Mailpit)
- **npm ≥ 10**

---

## Run the application

### 1. Install dependencies

```bash
npm install
```

### 2. Create the local env file

```bash
cp .env.example .env
```

The defaults in `.env.example` are wired to the docker-compose services — no edits needed for local dev.

### 3. Start backing services

```bash
docker compose up -d
```

This brings up Postgres, Redis, Kafka, MinIO, and Mailpit. You can start them individually too:

```bash
docker compose up -d postgres        # just Postgres (enough for Step 2)
docker compose up -d postgres redis  # Steps 3+
```

Confirm Postgres is ready:

```bash
docker exec jobtracker-postgres pg_isready -U app -d jobtracker
```

### 4. Apply database migrations

```bash
npm run db:migrate                   # equivalent to: npx prisma migrate dev
```

This creates the schema in Postgres and generates the typed Prisma Client.

### 5. Seed demo data (optional but recommended)

```bash
npm run db:seed
```

Inserts 2 demo users (`alice@example.com`, `bob@example.com`), 2 companies, 3 applications (one intentionally stale so the future cron has something to find), and 1 contact.

### 6. Start the API

```bash
npm run dev                          # auto-reload via ts-node-dev
# or
npm run build && npm start           # production-style
```

Then hit:

```bash
curl http://localhost:3000/health
# → {"status":"ok","uptime":...}
```

---

## npm scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the API with auto-reload (ts-node-dev) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled output from `dist/` |
| `npm test` | Run the Jest test suite |
| `npm run test:watch` | Jest in watch mode |
| `npm run lint` | ESLint over `src/` and `tests/` |
| `npm run lint:fix` | ESLint with autofix |
| `npm run format` | Prettier over `src/` and `tests/` |
| `npm run db:migrate` | Create + apply a Prisma migration (dev) |
| `npm run db:reset` | Drop + recreate the DB and re-run seed |
| `npm run db:seed` | Run `prisma/seed.ts` |
| `npm run db:studio` | Open Prisma Studio (browse DB at http://localhost:5555) |

---

## Local services (from docker-compose)

| Service | URL / Port | Credentials |
|---|---|---|
| Postgres | `localhost:5432`, db `jobtracker` | user `app` / password `app` |
| Redis | `localhost:6379` | — |
| Kafka | `localhost:9092` | — (PLAINTEXT, KRaft mode) |
| MinIO API | `localhost:9000` | `minioadmin` / `minioadmin` |
| MinIO Console | http://localhost:9001 | `minioadmin` / `minioadmin` |
| Mailpit SMTP | `localhost:1025` | — |
| Mailpit UI | http://localhost:8025 | — |

### Stopping services

```bash
docker compose down            # stop containers, keep data
docker compose down -v         # stop AND wipe all volumes (fresh slate)
```

---

## API reference

Base URL: `http://localhost:3000`

All request/response bodies are JSON (`Content-Type: application/json`). Endpoints marked **🔒 Auth** require `Authorization: Bearer <accessToken>`.

### Error shape

Every error response uses this format:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Invalid credentials" } }
```

| Code | HTTP | When |
|---|---|---|
| `INVALID_INPUT` | 400 | Validation failed (zod) or referenced FK doesn't exist |
| `UNAUTHORIZED` | 401 | Missing/invalid/expired token, or bad credentials |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `NOT_FOUND` | 404 | Resource doesn't exist (or isn't yours) |
| `CONFLICT` | 409 | Duplicate (e.g., email already registered) |
| `RATE_LIMITED` | 429 | Too many requests — see `Retry-After` header |
| `INTERNAL` | 500 | Unexpected — check server logs |

---

### Auth

#### `POST /auth/register`

Create a new user and immediately receive a token pair.

**Body**
```json
{
  "email": "you@example.com",
  "password": "correct-horse-battery"
}
```

**Constraints**
- `email` — valid email, ≤ 254 chars
- `password` — 8–128 chars

**Response `201`**
```json
{
  "user": { "id": "8f3e...e7", "email": "you@example.com" },
  "tokens": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi..."
  }
}
```

**Errors:** `400 INVALID_INPUT`, `409 CONFLICT` (email exists)

---

#### `POST /auth/login`

Exchange credentials for a fresh token pair. Rate-limited to **5 attempts per email per 15 minutes**.

**Body** — same shape as register.

**Response `200`** — same shape as register, with status `200`.

**Errors:** `400 INVALID_INPUT`, `401 UNAUTHORIZED` (wrong email or password — same message either way), `429 RATE_LIMITED`

Response headers on every login attempt: `X-RateLimit-Limit`, `X-RateLimit-Remaining`. On 429: `Retry-After: <seconds>`.

---

#### `POST /auth/refresh`

Swap a refresh token for a new pair.

**Body**
```json
{ "refreshToken": "eyJhbGciOi..." }
```

**Response `200`**
```json
{
  "tokens": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi..."
  }
}
```

**Errors:** `400 INVALID_INPUT`, `401 UNAUTHORIZED` (invalid/expired token, or access token sent instead of refresh)

---

#### `GET /auth/me`   🔒 Auth

Return the currently authenticated user.

**Response `200`**
```json
{ "user": { "id": "8f3e...e7", "email": "you@example.com" } }
```

**Errors:** `401 UNAUTHORIZED`

---

### Applications   🔒 Auth (user-scoped)

Every application belongs to the authenticated user. You can only see/modify your own.

`ApplicationStatus` is one of: `APPLIED`, `INTERVIEW`, `OFFER`, `REJECTED`, `WITHDRAWN`. Default on create: `APPLIED`.

#### `POST /applications`

**Body**
```json
{
  "companyId": "0b3e7d2c-...-uuid",
  "role": "Senior Backend Engineer",
  "status": "APPLIED",
  "appliedAt": "2026-05-20T12:00:00Z",
  "notes": "Referred by a friend"
}
```

**Constraints**
- `companyId` — UUID of an existing company (else `400 INVALID_INPUT`)
- `role` — 1–200 chars
- `status` — optional, defaults to `APPLIED`
- `appliedAt` — ISO-8601, optional, defaults to now
- `notes` — optional, ≤ 10,000 chars

**Response `201`**
```json
{
  "id": "ab12...",
  "userId": "8f3e...",
  "companyId": "0b3e...",
  "role": "Senior Backend Engineer",
  "status": "APPLIED",
  "appliedAt": "2026-05-20T12:00:00.000Z",
  "lastFollowedUpAt": null,
  "notes": "Referred by a friend",
  "createdAt": "2026-05-26T...",
  "updatedAt": "2026-05-26T..."
}
```

---

#### `GET /applications`

List the caller's applications with optional filters. Ordered by `appliedAt desc`.

**Query params** (all optional)

| Param | Type | Notes |
|---|---|---|
| `status` | enum | One of `APPLIED`, `INTERVIEW`, `OFFER`, `REJECTED`, `WITHDRAWN` |
| `companyId` | UUID | Filter to a single company |
| `appliedFrom` | ISO date | Inclusive lower bound on `appliedAt` |
| `appliedTo` | ISO date | Inclusive upper bound on `appliedAt` |
| `limit` | int (1–100) | Default `20` |
| `offset` | int (≥0) | Default `0` |

**Example**
```
GET /applications?status=APPLIED&appliedFrom=2026-05-01&limit=10
```

**Response `200`**
```json
{
  "items": [
    { "id": "ab12...", "role": "Senior Backend Engineer", "status": "APPLIED", "...": "..." }
  ],
  "pagination": { "limit": 10, "offset": 0, "total": 1 }
}
```

---

#### `GET /applications/:id`

**Response `200`** — the application object.

**Errors:** `404 NOT_FOUND` (also if it exists but belongs to another user — by design)

---

#### `PATCH /applications/:id`

Partial update. Send only the fields you want to change.

**Body** (all fields optional, must send at least one)
```json
{
  "status": "INTERVIEW",
  "lastFollowedUpAt": "2026-05-26T09:00:00Z",
  "notes": "Phone screen scheduled for next Tuesday"
}
```

Allowed fields: `role`, `status`, `appliedAt`, `lastFollowedUpAt` (nullable), `notes` (nullable).
`companyId` is **not** updatable — delete and recreate if you applied under the wrong company.

**Response `200`** — the updated application.

**Errors:** `400 INVALID_INPUT` (empty body or invalid value), `404 NOT_FOUND`

---

#### `DELETE /applications/:id`

Hard delete.

**Response `204`** — no content.

**Errors:** `404 NOT_FOUND`

---

### Companies   🔒 Auth (global scope)

Companies are shared across all users.

#### `POST /companies`

**Body**
```json
{
  "name": "Acme Corp",
  "website": "https://acme.example",
  "notes": "Series B, ~200 people"
}
```

**Constraints**
- `name` — 1–200 chars, required
- `website` — valid URL, ≤ 500 chars, optional
- `notes` — ≤ 10,000 chars, optional

**Response `201`** — the created company.

---

#### `GET /companies`

List companies, optionally filtered by name. Ordered by `name asc`.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `name` | string | Case-insensitive *contains* match |
| `limit` | int (1–100) | Default `20` |
| `offset` | int (≥0) | Default `0` |

**Example**
```
GET /companies?name=acme
```

**Response `200`**
```json
{
  "items": [
    { "id": "0b3e...", "name": "Acme Corp", "website": "https://acme.example", "notes": null, "createdAt": "..." }
  ],
  "pagination": { "limit": 20, "offset": 0, "total": 1 }
}
```

---

#### `GET /companies/:id`

Returns the company with its full contact list included.

**Response `200`**
```json
{
  "id": "0b3e...",
  "name": "Acme Corp",
  "website": "https://acme.example",
  "notes": null,
  "createdAt": "...",
  "contacts": [
    { "id": "...", "name": "Jane Recruiter", "email": "jane@acme.example", "role": "Recruiter" }
  ]
}
```

**Errors:** `404 NOT_FOUND`

---

### Contacts   🔒 Auth (global scope)

#### `POST /contacts`

**Body**
```json
{
  "companyId": "0b3e7d2c-...-uuid",
  "name": "Jane Recruiter",
  "email": "jane@acme.example",
  "role": "Recruiter"
}
```

**Constraints**
- `companyId` — UUID of existing company (else `400 INVALID_INPUT`)
- `name` — 1–200 chars, required
- `email` — valid email, optional
- `role` — ≤ 200 chars, optional

**Response `201`** — the created contact.

---

#### `GET /contacts`

List contacts, optionally filtered by company. Ordered by `name asc`.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `companyId` | UUID | Filter to a single company |
| `limit` | int (1–100) | Default `20` |
| `offset` | int (≥0) | Default `0` |

**Example**
```
GET /contacts?companyId=0b3e7d2c-...
```

**Response `200`** — paginated list shape (same as the others).

---

### Resumes   🔒 Auth (user-scoped)

Resumes are uploaded as **multipart/form-data** (no JSON body for `POST /resumes`).

**Limits**
- File size: **5 MB max** per file
- Per-user storage: **50 MB total**
- Accepted MIME types: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (i.e., PDF/DOC/DOCX)

#### `POST /resumes`

Upload a resume. Stored in MinIO; metadata persisted in Postgres.

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer <accessToken>` |
| `Content-Type` | `multipart/form-data` (Postman sets the boundary automatically) |

**Body** (form-data)

| Key | Type | Value |
|---|---|---|
| `file` | **File** | The resume PDF/DOC/DOCX. The field name must be exactly `file`. |

**Response `201`**
```json
{
  "id": "5cb13990-d900-4436-a876-30a753f02e70",
  "filename": "resume.pdf",
  "sizeBytes": 321,
  "uploadedAt": "2026-05-28T20:48:05.838Z"
}
```

**Errors**
- `400 INVALID_INPUT` — missing `file` field, unsupported MIME type, file too large, or quota exceeded (response message indicates which)
- `401 UNAUTHORIZED`

---

#### `GET /resumes`

List the caller's resumes. Ordered by `uploadedAt desc`.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `limit` | int (1–100) | Default `20` |
| `offset` | int (≥0) | Default `0` |

**Response `200`**
```json
{
  "items": [
    {
      "id": "5cb13990-...",
      "filename": "resume.pdf",
      "sizeBytes": 321,
      "uploadedAt": "2026-05-28T20:48:05.838Z"
    }
  ],
  "pagination": { "limit": 20, "offset": 0, "total": 1 }
}
```

---

#### `GET /resumes/:id`

Returns the resume metadata plus a **pre-signed download URL** (valid for 15 minutes). The URL points directly at MinIO; the browser/curl can fetch it without any auth header, but it expires.

**Response `200`**
```json
{
  "id": "5cb13990-...",
  "filename": "resume.pdf",
  "sizeBytes": 321,
  "uploadedAt": "2026-05-28T20:48:05.838Z",
  "downloadUrl": "http://localhost:9000/resumes/users/.../resume-id.pdf?X-Amz-Algorithm=...",
  "downloadUrlExpiresIn": 900
}
```

Open `downloadUrl` in a browser or `curl -O "$URL"` to download the file. Content-Disposition is set so it saves with the original filename.

**Errors:** `404 NOT_FOUND` (also returned if the resume exists but belongs to another user)

---

#### `DELETE /resumes/:id`

Removes the metadata row and the object in MinIO.

**Response `204`** — no content.

**Errors:** `404 NOT_FOUND`

---

### Jobs   🔒 Auth

Background jobs that normally run on a schedule, exposed via HTTP for manual triggering.

A `node-cron` task fires **`runFollowupScan()` every day at `09:00 UTC`** automatically. The endpoint below exists so you can run it on demand (useful for testing or kicking off a scan after data import).

#### `POST /jobs/followup-scan`

Scans all applications across the system where `status = 'APPLIED'` and either:
- `lastFollowedUpAt` is set but older than `FOLLOWUP_REMINDER_DAYS` (default **7**), or
- `lastFollowedUpAt` is `null` and `appliedAt` is older than that threshold.

For each match, the server:
1. Publishes a `followup.due` event to Kafka (rich payload: application + company + userEmail + days)
2. Sets `lastFollowedUpAt = now()` so the next scan won't re-fire until the window elapses again
3. The `email-service` consumer renders + sends a reminder email via SMTP (Mailpit locally)

**Body** — none. Auth is the only requirement.

**Response `200`**
```json
{
  "scanned": 1,
  "applicationIds": ["5d2c3fa9-d292-4bf8-bb53-a3981a8a0377"]
}
```

**Effects you can verify**
- `applications.last_followed_up_at` advances on each matched row
- `events` table gets a new `followup.due` row (the analytics consumer writes it)
- Email lands in Mailpit at http://localhost:8025

**Idempotency.** Re-running the scan immediately returns `scanned: 0` — applications won't be re-flagged for another `FOLLOWUP_REMINDER_DAYS`.

**Errors:** `401 UNAUTHORIZED`

---

### End-to-end Postman flow

A typical session covering everything above:

```
1.  POST /auth/register   → save accessToken + refreshToken as env vars
2.  POST /companies       → body {"name":"Acme"} → save id as companyId
3.  POST /contacts        → body {"companyId":"{{companyId}}","name":"Jane"}
4.  POST /applications    → body {"companyId":"{{companyId}}","role":"Backend Engineer",
                                  "appliedAt":"2026-05-15T00:00:00Z"}    ← old date = scan candidate
5.  GET  /applications?status=APPLIED
6.  PATCH /applications/:id → body {"status":"INTERVIEW"}
                                  ↳ emits status.changed + interview.scheduled to Kafka
7.  POST /resumes         → form-data, field "file" = pick a .pdf  → save id as resumeId
8.  GET  /resumes/{{resumeId}}   → grab downloadUrl, open in browser to verify
9.  POST /jobs/followup-scan
                                  ↳ emits followup.due, sends email — check Mailpit UI at :8025
10. GET  /auth/me
11. POST /auth/refresh    → save the new token pair
12. DELETE /resumes/{{resumeId}} → cleanup
```

See [Step 4 — Postman setup](#) in the docs above for a Postman **Tests** snippet that auto-captures `accessToken` and `refreshToken` after register/login/refresh.

---

## Project layout

```
job-application-tracker/
├── CLAUDE.md                   # architecture + step-by-step build plan
├── docker-compose.yml          # postgres, redis, kafka, minio, mailpit
├── prisma/
│   ├── schema.prisma           # data model
│   ├── migrations/             # generated SQL migrations
│   └── seed.ts                 # demo data
├── src/
│   ├── index.ts                # boot + graceful shutdown
│   ├── app.ts                  # Express app factory + route mounts
│   ├── config/
│   │   └── env.ts              # env loader + validation
│   ├── db/
│   │   ├── prisma.ts           # Prisma Client singleton
│   │   ├── redis.ts            # ioredis singleton
│   │   └── s3.ts               # S3 client (MinIO) + ensureBucket/put/delete/signed-URL helpers
│   ├── routes/
│   │   ├── auth.ts             # /auth/register, /login, /refresh, /me
│   │   ├── applications.ts     # /applications CRUD (emits Kafka events)
│   │   ├── companies.ts        # /companies (POST, GET)
│   │   ├── contacts.ts         # /contacts (POST, GET)
│   │   ├── resumes.ts          # /resumes (POST upload, GET list, GET, DELETE)
│   │   ├── jobs.ts             # POST /jobs/followup-scan (manual cron trigger)
│   │   └── pagination.ts       # shared zod schemas + list shape
│   ├── services/
│   │   ├── auth.ts             # register/login/refresh logic
│   │   ├── password.ts         # bcrypt hash/verify
│   │   ├── jwt.ts              # sign/verify access + refresh tokens
│   │   ├── applications.ts     # application business logic + event emits
│   │   ├── companies.ts        # company business logic
│   │   ├── contacts.ts         # contact business logic
│   │   ├── resumes.ts          # upload (with quota), list, get + signed URL, delete
│   │   ├── mail.ts             # nodemailer SMTP singleton + sendMail()
│   │   └── errors.ts           # AppError + Errors factory
│   ├── middleware/
│   │   ├── auth.ts             # requireAuth (verify Bearer JWT)
│   │   ├── rateLimit.ts        # Redis-backed fixed-window limiter
│   │   ├── upload.ts           # multer config + MIME/size limits
│   │   └── errorHandler.ts     # JSON error response (zod + AppError)
│   ├── events/
│   │   ├── types.ts            # Topic constants + per-event payload types
│   │   ├── kafka.ts            # idempotent producer, ensureTopics, publishEvent
│   │   ├── index.ts            # startEvents / stopEvents lifecycle
│   │   └── consumers/
│   │       ├── email.ts        # renders + sends follow-up email; logs others
│   │       ├── analytics.ts    # persists every event to the events table
│   │       └── notifications.ts # stub (logs status.changed + interview.scheduled)
│   └── jobs/
│       ├── followupScan.ts     # scan stale APPLIED apps + emit followup.due
│       └── index.ts            # node-cron schedule (09:00 UTC daily)
└── tests/
    ├── health.test.ts
    └── auth.test.ts            # register/login/me/refresh + rate limit
```

---

## Build status (vs. plan in CLAUDE.md)

| Step | Status |
|---|---|
| 1. Project scaffold | ✅ done |
| 2. Database layer (Prisma + migrations + seed) | ✅ done |
| 3. Auth (JWT + Redis rate limit) | ✅ done |
| 4. Core CRUD (applications, companies, contacts) | ✅ done |
| 5. Resume uploads (MinIO) | ✅ done |
| 6. Kafka event bus | ✅ done |
| 7. Cron + follow-up reminders | ✅ done |
| 8. Dashboard + Redis cache | ⏳ next |
| 9. Observability + hardening | — |
| 10. Tests (unit + integration + e2e) | — |
