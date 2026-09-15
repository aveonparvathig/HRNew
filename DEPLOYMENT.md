# Deployment & Cutover Runbook

The production stack is one `docker compose` file behind Caddy: a single
origin serves the SPA and proxies `/api` to the backend, so there is no CORS
and HTTPS is automatic once DNS points at the server.

```
Internet ──► Caddy (:80/:443, auto-TLS)
              ├── /api/* , /health ──► backend (Node/Express + Prisma)
              └── everything else ──► frontend (built React SPA)
                        backend ──► postgres (internal network only)
              backup ── nightly pg_dump ──► ./backups (14-day retention)
```

## 1. Provision

Any Linux VPS with Docker works (2 GB RAM is plenty). Alternatively
Railway/Render: deploy `backend/` and `frontend/` as two services with a
managed Postgres and set the same environment variables — the rest of this
runbook still applies, minus Caddy.

```bash
git clone <this repo> && cd Payslip-v2
cp .env.production.example .env.production
# fill in: SITE_ADDRESS + PUBLIC_URL (your domain), DB_PASSWORD,
# JWT_SECRET + JWT_REFRESH_SECRET (openssl rand -hex 32)
```

Point DNS `A` record for the domain at the server **before** first start so
Caddy can obtain certificates.

## 2. Start

```bash
docker compose -p payslip-prod -f docker-compose.prod.yml --env-file .env.production up -d --build
curl -s https://<your-domain>/health     # {"status":"ok",...}
```

Prisma migrations run automatically on every backend start
(`prisma migrate deploy`). The first user to sign up becomes the
organization OWNER.

## 3. Data cutover from the Django app

1. **Freeze writes** on the old app (announce a maintenance window).
2. **Export** from the Django database:
   ```bash
   # SQLite (copy db.sqlite3 from the server first):
   py scripts/export_django_data.py --db path/to/db.sqlite3 --org <org-id> --out scripts/django_export.json
   ```
   The export prints row counts and the reconciliation sums.
3. **Create the owner account** in v2 (sign up through the UI).
4. **Import** — temporarily expose the prod database, run the import, close it:
   ```bash
   docker compose -p payslip-prod -f docker-compose.prod.yml -f deploy/docker-compose.cutover.yml --env-file .env.production up -d postgres

   cd backend
   DATABASE_URL="postgresql://<DB_USER>:<DB_PASSWORD>@localhost:5434/<DB_NAME>" \
     npx ts-node scripts/import-django.ts --file ../scripts/django_export.json --owner <owner-email>

   # close the port again:
   docker compose -p payslip-prod -f docker-compose.prod.yml --env-file .env.production up -d postgres
   ```
5. **Reconcile** — the import prints source-vs-imported sums and exits
   non-zero on any mismatch. All six checks must read `OK`:
   billing net, previous pending, payments, employee packages,
   entry net payable, entry gross. As an independent cross-check,
   Income → Dashboard "Outstanding" must equal
   `billing net + previous pending − payments` from the export.
   The import is idempotent — re-running skips existing rows by natural key
   (client name, client+year, employee name, run period) and inserts nothing.
6. **Spot-check in the UI**: a client's billing sheet against the old app,
   one historical payslip, the employee register export.

## 4. Go live

- Switch the domain's DNS to the new server (or swap the reverse proxy target).
- Keep the Django app running **read-only** for a two-week grace period.
- Rollback = point DNS back; the old app was never modified.

## 5. Operations

| Task | Command |
|---|---|
| Deploy an update | `git pull && docker compose -p payslip-prod -f docker-compose.prod.yml --env-file .env.production up -d --build` |
| Logs | `docker logs payslip-prod-backend --tail 100` |
| Manual backup now | `docker exec payslip-prod-backup sh -c 'pg_dump -h postgres -U $DB_USER payslip \| gzip > /backups/manual-$(date +%F).sql.gz'` |
| Restore a backup | `gunzip -c backups/<file>.sql.gz \| docker exec -i payslip-prod-postgres psql -U <DB_USER> <DB_NAME>` |
| Run the tests | `cd backend && npm test` |

Backups: nightly `pg_dump` gzip files land in `./backups`, pruned after 14
days. Copy them off the server (cron + rclone/S3) for real disaster recovery.
