# Deployment guide

This guide takes you from an empty server to a production GRC Platform, then covers day-to-day running: email, file storage, backups and upgrades.

Each deployment serves **one organisation**. To run the platform for several companies, give each its own deployment and database.

- [Requirements](#requirements)
- [Create a server (step by step)](#create-a-server-step-by-step)
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

## Create a server (step by step)

This section goes from nothing to a running, HTTPS-protected instance. It uses Google Cloud; the steps for [other clouds](#other-clouds) are almost identical once the VM exists.

You'll need:

- a Google Cloud project with billing enabled;
- the [`gcloud` CLI](https://cloud.google.com/sdk/docs/install), signed in with `gcloud auth login`;
- a domain you can add DNS records to.

### 1. Set your variables

Run these in your terminal, then reuse them in every later step. `asia-south1` is Mumbai; pick the [region](https://cloud.google.com/about/locations) closest to your users, and the matching zone.

```bash
PROJECT=my-gcp-project
REGION=asia-south1
ZONE=asia-south1-a
DOMAIN=grc.example.com
BUCKET=$PROJECT-grc-uploads        # must be globally unique

gcloud config set project $PROJECT
gcloud services enable compute.googleapis.com storage.googleapis.com
```

### 2. Reserve a static IP and point your domain at it

```bash
gcloud compute addresses create grc-ip --region=$REGION
gcloud compute addresses describe grc-ip --region=$REGION --format='value(address)'
```

At your DNS provider, create an **A record** for `$DOMAIN` pointing at that IP. Do it now: DNS can take a few minutes to spread, and HTTPS (step 7) needs it.

### 3. Create a service account and a storage bucket

The app runs as its own service account, which can read and write only this bucket. That way the server holds no key file.

```bash
gcloud iam service-accounts create grc-app --display-name="GRC Platform"
SA=grc-app@$PROJECT.iam.gserviceaccount.com

gcloud storage buckets create gs://$BUCKET --location=$REGION \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://$BUCKET --versioning   # keeps deleted/overwritten files recoverable
gcloud storage buckets add-iam-policy-binding gs://$BUCKET \
  --member=serviceAccount:$SA --role=roles/storage.objectAdmin
```

Skipping the bucket? Then uploads are kept on the VM's disk, so include them in your backups.

### 4. Open the firewall for web traffic

```bash
gcloud compute firewall-rules create grc-allow-web \
  --allow=tcp:80,tcp:443,udp:443 --target-tags=grc-web
```

Only ports 80 and 443 are opened (SSH is allowed by the default network rules). The app's port 3000 and Postgres stay closed to the internet.

### 5. Create the VM

`e2-small` (2 vCPU, 2 GB) suits most teams. Use `e2-medium` for heavier use.

```bash
gcloud compute instances create grc \
  --zone=$ZONE --machine-type=e2-small \
  --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB --boot-disk-type=pd-balanced \
  --address=grc-ip --tags=grc-web \
  --service-account=$SA --scopes=cloud-platform \
  --shielded-secure-boot
```

`--scopes=cloud-platform` lets the service account's permissions apply; without it, the VM can only *read* from storage.

### 6. Install Docker and the app

```bash
gcloud compute ssh grc --zone=$ZONE
```

On the VM:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

git clone https://github.com/<owner>/grc-platform.git
cd grc-platform
cp .env.example .env
```

Edit `.env` (for example with `nano .env`):

```bash
NEXTAUTH_SECRET="<output of: openssl rand -base64 48>"
NEXTAUTH_URL="https://grc.example.com"
DOMAIN="grc.example.com"
APP_BIND="127.0.0.1"                 # only Caddy can reach the app
POSTGRES_PASSWORD="<output of: openssl rand -hex 24>"
GCS_BUCKET="my-gcp-project-grc-uploads"
GCS_KEY_FILE=""                      # empty: use the VM's service account
SMTP_HOST="..."                      # see "Email (SMTP)" below
SMTP_USER="..."
SMTP_PASS="..."
SMTP_FROM="grc@example.com"
```

### 7. Start it with HTTPS

```bash
docker compose --profile https up -d --build
docker compose ps
```

The `https` profile adds a [Caddy](https://caddyserver.com) container. It gets a Let's Encrypt certificate for `DOMAIN` and renews it automatically. The first start takes a few minutes while the image builds.

Open `https://grc.example.com`, complete **/setup**, and you're live.

### 8. Turn on backups

- **Database:** add the `pg_dump` command from [Backups](#backups) to the VM's crontab (`crontab -e`) and copy the dumps to the bucket:

  ```
  0 2 * * * cd ~/grc-platform && docker compose exec -T db pg_dump -U grc -Fc grc_platform > ~/grc-$(date +\%F).dump && gcloud storage cp ~/grc-$(date +\%F).dump gs://BUCKET/backups/ && find ~ -name 'grc-*.dump' -mtime +7 -delete
  ```

  Replace `BUCKET` with your bucket name.

- **Whole disk:** take daily snapshots as a second safety net:

  ```bash
  gcloud compute resource-policies create snapshot-schedule grc-daily \
    --region=$REGION --daily-schedule --start-time=03:00 --max-retention-days=14
  gcloud compute disks add-resource-policies grc --zone=$ZONE --resource-policies=grc-daily
  ```

### Other clouds

Once you have a Linux VM with Docker, steps 6–8 are the same everywhere.

- **AWS (Lightsail or EC2):**
  - Use Ubuntu 24.04 with 2 GB RAM and attach a static IP.
  - Allow inbound 80/443 in the instance's firewall or security group.
  - Leave `GCS_BUCKET` empty to keep uploads on disk.
- **DigitalOcean / Hetzner / Linode:**
  - Create an Ubuntu 24.04 droplet or server with 2 GB RAM.
  - Add a cloud firewall allowing only 22, 80 and 443.
  - Turn on the provider's automated backups.
- **Your own hardware:**
  - Any Linux machine that ports 80/443 can be forwarded to.
  - Without a public IP, put [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) in front of it and use plain `docker compose up -d`.

## Configuration reference

All settings are environment variables, normally kept in `.env` (copy `.env.example`). Never commit `.env`.

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string. With Docker Compose it's set for you. |
| `NEXTAUTH_SECRET` | Yes | Signs sessions. At least 32 random characters: `openssl rand -base64 48`. The app won't start in production with the placeholder. Changing it signs everyone out. |
| `NEXTAUTH_URL` | Yes | The public URL, e.g. `https://grc.example.com`. It's used in emailed links, so it must be exact. |
| `POSTGRES_PASSWORD` | Docker only | Password for the bundled Postgres. Set it **before** the first start; the database keeps whatever it started with. |
| `APP_PORT` | No | Host port for the app in Docker Compose (default `3000`). |
| `APP_BIND` | No | Host address the app's port listens on (default `0.0.0.0`). Set `127.0.0.1` when a reverse proxy is the only way in. |
| `DOMAIN` | With the `https` profile | Domain Caddy gets a certificate for. Its DNS must point at the server. |
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

The app speaks plain HTTP on port 3000. The simplest way to add HTTPS is the bundled Caddy service: set `DOMAIN` and `APP_BIND="127.0.0.1"` in `.env`, then run `docker compose --profile https up -d --build`.

To use your own proxy instead: with [Caddy](https://caddyserver.com) installed on the host, the whole config is:

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

If you use a proxy, set `APP_BIND="127.0.0.1"` in `.env` so the app can only be reached through it.

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
