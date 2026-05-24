# Job Application Tracker

A backend service for tracking job applications, with resume uploads, follow-up reminders, and event-driven notifications.

Users add jobs they've applied to, upload resumes, and get follow-up reminders. The system nudges them when an application has gone stale (e.g., "It's been 7 days since you applied to X — send a follow-up?").

> **Note:** This project is being built incrementally. See [CLAUDE.md](./CLAUDE.md) for the full step-by-step plan. The instructions below describe **what's working today** (through Step 2 — DB layer).

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
│   ├── app.ts                  # Express app factory + /health
│   ├── config/                 # env loader
│   ├── db/                     # Prisma Client singleton
│   ├── routes/                 # (Step 3+) auth, applications, resumes...
│   ├── services/               # (Step 3+) business logic
│   ├── middleware/             # (Step 3+) auth, rate-limit, error handler
│   ├── events/                 # (Step 6) Kafka producers/consumers
│   └── jobs/                   # (Step 7) cron jobs
└── tests/
```

---

## Build status (vs. plan in CLAUDE.md)

| Step | Status |
|---|---|
| 1. Project scaffold | ✅ done |
| 2. Database layer (Prisma + migrations + seed) | ✅ done |
| 3. Auth (JWT + Redis rate limit) | ⏳ next |
| 4. Core CRUD (applications, companies, contacts) | — |
| 5. Resume uploads (MinIO) | — |
| 6. Kafka event bus | — |
| 7. Cron + follow-up reminders | — |
| 8. Dashboard + Redis cache | — |
| 9. Observability + hardening | — |
| 10. Tests (unit + integration + e2e) | — |
