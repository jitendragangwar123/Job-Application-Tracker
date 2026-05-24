# Job Application Tracker

Backend for tracking job applications, resumes, and follow-up reminders. See [CLAUDE.md](./CLAUDE.md) for the architecture and step-by-step plan.

## Quickstart (local dev)

```bash
cp .env.example .env
docker compose up -d           # postgres, redis, kafka, minio, mailpit
npm install
npm run dev                    # http://localhost:3000/health
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run with auto-reload (ts-node-dev) |
| `npm run build` | Compile TS to `dist/` |
| `npm start` | Run compiled output |
| `npm test` | Run Jest tests |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## Local services (from docker-compose)

| Service | URL |
|---|---|
| Postgres | `localhost:5432` (user `app`, db `jobtracker`) |
| Redis | `localhost:6379` |
| Kafka | `localhost:9092` |
| MinIO API | `localhost:9000` |
| MinIO Console | http://localhost:9001 (minioadmin / minioadmin) |
| Mailpit SMTP | `localhost:1025` |
| Mailpit UI | http://localhost:8025 |
