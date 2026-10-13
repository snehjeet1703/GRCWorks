# Deployment guide

This guide takes you from an empty server to a production GRC Platform, then covers day-to-day running: email, file storage, backups and upgrades.

Each deployment serves **one organisation**. To run the platform for several companies, give each its own deployment and database.

- [Requirements](#requirements)
- [Configuration reference](#configuration-reference)
- [Deploy with Docker Compose](#deploy-with-docker-compose)
- [HTTPS and the reverse proxy](#https-and-the-reverse-proxy)
- [Email (SMTP)](#email-smtp)
- [File storage](#file-storage)
- [Single sign-on (Microsoft Entra ID)](#single-sign-on-microsoft-entra-id)
- [Hosted platforms](#hosted-platforms)
- [Backups](#backups)
- [Upgrading](#upgrading)
- [Scaling beyond one server](#scaling-beyond-one-server)
- [Troubleshooting](#troubleshooting)

## Requirements

- **Docker deployment:** a Linux server with Docker Engine 24+ and the Compose plugin. 1 vCPU and 1 GB RAM is enough for a small team; 2 GB is more comfortable.
- **Without Docker:** Node.js 20.9+ (22 recommended) and PostgreSQL 14+.
- **A domain name** pointing at the server, for HTTPS.
- **An SMTP account** for outgoing email.

## Configuration reference

All settings are environment variables, normally kept in `.env` (copy `.env.example`). Never commit `.env`.

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string. With Docker Compose it's set for you. |
| `NEXTAUTH_SECRET` | Yes | Signs sessions. At least 32 random characters: `openssl rand -base64 48`. The app won't start in production with the placeholder. Changing it signs everyone out. |
| `NEXTAUTH_URL` | Yes | The public URL, e.g. `https://grc.example.com`. It's used in emailed links, so it must be exact. |
| `POSTGRES_PASSWORD` | Docker only | Password for the bundled Postgres. Set it **before** the first start; the database keeps whatever it started with. |
| `APP_PORT` | No | Host port for the app in Docker Compose (default `3000`). |
| `SESSION_MAX_AGE_HOURS` | No | How long a sign-in lasts (default `12`, maximum `720`). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Yes in production | Outgoing email. See [Email](#email-smtp). |
| `GCS_BUCKET`, `GCS_KEY_FILE` | No | Store uploads in Google Cloud Storage instead of local disk. |
| `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` | No | Microsoft Entra ID single sign-on. |
| `DEMO_MODE` | No | Development only: shows the demo login hint. Keep `false` in production. |

## Deploy with Docker Compose

```bash
git clone <your-fork> grc-platform
cd grc-platform
cp .env.example .env
```

Edit `.env`:

```bash
NEXTAUTH_SECRET="<output of: openssl rand -base64 48>"
NEXTAUTH_URL="https://grc.example.com"
POSTGRES_PASSWORD="<a long random password>"
SMTP_HOST="email-smtp.eu-west-1.amazonaws.com"
SMTP_PORT="587"
SMTP_USER="..."
SMTP_PASS="..."
SMTP_FROM="grc@example.com"
```

Start everything:

```bash
docker compose up -d --build
docker compose ps        # both services should become "healthy"
docker compose logs -f app
```

Then open `NEXTAUTH_URL` and complete **/setup**.

What this gives you:

- **`db`**: PostgreSQL 16 with data in the `pgdata` volume. Its port is bound to `127.0.0.1` only, so it isn't reachable from the internet.
- **`app`**: the application on port 3000.
  - It applies database migrations on every start.
  - It keeps uploads in the `uploads` volume.
  - It reports health at `/api/health`.

## HTTPS and the reverse proxy

The app speaks plain HTTP on port 3000. Put a reverse proxy in front of it to handle HTTPS. With [Caddy](https://caddyserver.com), which gets certificates automatically, the whole config is:

```
grc.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

With nginx:

```nginx
server {
    listen 443 ssl;
    server_name grc.example.com;
    # ssl_certificate / ssl_certificate_key from certbot

    client_max_body_size 55m;   # Trust Center uploads can be up to 50 MB

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;   # overwrite, don't append
    }
}
```

If you use a proxy, change the app's port mapping in `docker-compose.yml` to `"127.0.0.1:3000:3000"`, so the app can only be reached through it.

> **Important: client IP addresses.** Rate limits (sign-in, codes, access requests) are counted per client IP, read from the `Fly-Client-IP`, `X-Forwarded-For` or `X-Real-IP` header. Those headers can be faked by anyone who can reach the app directly. Make sure:
> 1. the app is only reachable through your proxy or load balancer, and
> 2. the proxy **overwrites** `X-Forwarded-For` with the real client address instead of appending to it, as in the nginx example above.
>
> Render, Fly.io and Railway already do this.

## Email (SMTP)

Email is needed for:

- Trust Center access links, and the "new access request" alert to admins.
- One-time sign-in codes: returning Trust Center customers, the vendor portal, and email MFA.
- Vendor questionnaire invitations.

Any SMTP provider works:

| Provider | `SMTP_HOST` | `SMTP_PORT` / `SMTP_SECURE` |
|---|---|---|
| Amazon SES | `email-smtp.<region>.amazonaws.com` | `587` / `false` |
| SendGrid | `smtp.sendgrid.net` (user `apikey`) | `587` / `false` |
| Postmark | `smtp.postmarkapp.com` | `587` / `false` |
| Microsoft 365 | `smtp.office365.com` | `587` / `false` |
| Google Workspace | `smtp.gmail.com` (app password) | `465` / `true` |

`SMTP_FROM` must be an address your provider is allowed to send from. Set up SPF and DKIM for that domain, or the emails will land in spam.

**To test email:** request access on your Trust Center page with a work address. Admins should get the alert, and the requester gets their link when you approve.

## File storage

Evidence, Trust Center documents, logos and vendor uploads are stored:

- **On local disk by default**, at `/app/uploads` inside the container (the `uploads` volume). This is fine for a single server; include it in your backups.
- **In Google Cloud Storage** when you set `GCS_BUCKET`:
  1. Create a private bucket with uniform bucket-level access.
  2. Grant the app's service account **Storage Object Admin** on that bucket.
  3. Set `GCS_KEY_FILE` to a mounted JSON key, or leave it empty to use the machine's own identity (GKE, Cloud Run, GCE).

Files are never served directly from storage. Every download goes through the app, which checks permissions.

## Single sign-on (Microsoft Entra ID)

1. In the Entra admin centre, register an app with this redirect URI: `https://grc.example.com/api/auth/callback/azure-ad`.
2. Create a client secret.
3. Set `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET` and `AZURE_AD_TENANT_ID` (your tenant's GUID; `common` is refused).
4. Restart the app. A "Sign in with Microsoft" button appears.

New SSO users are created as **Viewers**. Promote them in **Settings → Team**.

## Hosted platforms

All of these build the same `Dockerfile`, and migrations run on start.

- **Render**:
  - [render.yaml](../render.yaml) creates the web service, Postgres, a 1 GB disk at `/app/uploads`, and a generated `NEXTAUTH_SECRET`.
  - Afterwards, set `NEXTAUTH_URL` and the `SMTP_*` variables in the dashboard.
- **Fly.io**:
  - Follow the commands at the top of [fly.toml](../fly.toml).
  - Set the email settings with `fly secrets set SMTP_HOST=... SMTP_PASS=...`.
- **Railway**:
  - Deploy the repo, then add a PostgreSQL plugin. `DATABASE_URL` is filled in automatically.
  - Add a volume mounted at `/app/uploads`.
  - Set `NEXTAUTH_SECRET`, `NEXTAUTH_URL` and the `SMTP_*` variables.

## Backups

Back up **both** the database and the uploaded files, at the same time.

```bash
# Database (Docker Compose)
docker compose exec -T db pg_dump -U grc -Fc grc_platform > grc-$(date +%F).dump

# Uploaded files (skip if you use GCS; turn on bucket versioning instead)
docker run --rm -v grc-platform_uploads:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads-$(date +%F).tgz -C /data .
```

The volume name is the project folder's name plus `_uploads`; `docker volume ls` shows it.

Schedule these daily (cron or a systemd timer), copy them off the server, and test a restore now and then:

```bash
docker compose exec -T db pg_restore -U grc -d grc_platform --clean --if-exists < grc-2026-10-13.dump
docker run --rm -v grc-platform_uploads:/data -v "$PWD":/backup alpine \
  sh -c "cd /data && tar xzf /backup/uploads-2026-10-13.tgz"
```

## Upgrading

```bash
docker compose exec -T db pg_dump -U grc -Fc grc_platform > pre-upgrade.dump   # always back up first
git pull
docker compose up -d --build
docker compose logs -f app     # watch the migrations apply
```

Migrations only move forward. To roll back, restore the pre-upgrade backup and check out the previous version.

## Scaling beyond one server

One app container comfortably serves a typical compliance team. Before you run more than one copy behind a load balancer:

- **Rate limits are kept in each app instance's memory**, so with N instances the effective limits are N times higher. That's acceptable for a few instances; for strict limits, move `src/lib/rate-limit.ts` to a shared store such as Redis.
- **Uploads must be shared**: use `GCS_BUCKET` instead of local disk.
- **Only one instance should run migrations at a time.** Prisma takes a lock, so concurrent starts are safe, just slower.

## Troubleshooting

| Symptom | Fix |
|---|---|
| App exits with "NEXTAUTH_SECRET is missing…" | Set a real secret of at least 32 characters in `.env`. |
| `docker compose up` says "Set NEXTAUTH_SECRET in .env" | Same: Compose checks for it before starting. |
| Emailed links point to `localhost` | Set `NEXTAUTH_URL` to the public URL and restart. |
| No emails arrive | Run `docker compose logs app | grep "email failed"` to see the SMTP error, check `SMTP_FROM` is an allowed sender, and check SPF/DKIM. |
| "password authentication failed" for Postgres | `POSTGRES_PASSWORD` changed after the database was first created. Change it back, or update the password inside Postgres. |
| Uploads fail at the proxy with 413 | Raise the proxy's body size limit (`client_max_body_size 55m` in nginx). |
| Everyone was signed out | `NEXTAUTH_SECRET` changed. That's expected; people just sign in again. |
| Health check | `curl https://grc.example.com/api/health` should return `{"status":"ok"}`. |
