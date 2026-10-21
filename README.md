# GRCWorks

Open-source governance, risk and compliance for small teams.

**MIT-licensed. Self-hosted. No telemetry. Every framework included, no upcharges.**

Built because the vendors that promise "SOC 2 in a weekend" for $8k turn into a $20k+ renewal the moment you add a second framework. This runs on your own server or a small cloud machine, and each deployment belongs to one organisation: your data never shares a database with anyone else's.

## What's in the box

- **Compliance**: 8 frameworks ready to go: SOC 2 Type II, ISO 27001:2022, ISO 27701:2019, HIPAA Security Rule, PCI-DSS v4.0.1, GDPR, NIST CSF 2.0 and India's DPDP Act 2023.
- **Cross-framework controls**: implement a control once and it counts towards every framework that cites it (SOC 2 CC6.1 + ISO A.8.5 + HIPAA §164.312(d), and so on).
- **Evidence**: upload proof against controls (type-checked, 20 MB cap).
- **Risk register** with likelihood × impact scoring, treatments, owners and control links.
- **Policies**: draft → review → approved, with versioning and expiry tracking.
- **Findings and exceptions**: track gaps and time-boxed, approved exceptions.
- **Vendor risk**: vendor inventory, security questionnaires, and an **external vendor portal** where vendors answer and upload files after verifying their email with a one-time code.
- **Trust Center** (`/trust/<your-slug>`): a public page for your badges, controls, sub-processors and documents.
  - Customers request access to private documents.
  - You approve per file (**view only** or **download**) for 7, 15, 30 or 60 days, or with no expiry.
  - View-only files are shown in the browser, watermarked with the viewer's email.
  - Customers get their link by email and can sign back in later with an emailed code.
  - Optional NDA click-through before private documents open.
- **Audit trail**: every change logged with who, what, and a before/after diff.
- **Access control**: 7 built-in roles (Admin, Compliance Manager, Editor, Auditor, Risk Analyst, Policy Admin, Viewer) plus custom roles, optionally scoped to specific frameworks.
- **Sign-in security**: MFA (authenticator app, email code, or passkeys/security keys) with recovery codes, optional Microsoft Entra ID SSO, and organisation-wide MFA enforcement.

## Quick start with Docker

You need Docker with Compose.

```bash
git clone <your-fork> grc-platform
cd grc-platform
cp .env.example .env
```

Edit `.env` and set at least:

- `NEXTAUTH_SECRET`: a long random value. Generate one with `openssl rand -base64 48`.
- `NEXTAUTH_URL`: the address people will use, e.g. `https://grc.yourcompany.com`.
- `POSTGRES_PASSWORD`: a strong database password.
- The `SMTP_*` settings, so the app can send email (see below).

Then start it:

```bash
docker compose up -d --build
```

Open the app and you'll be taken to **/setup** to name your organisation and create the first administrator. `/setup` locks itself once used; invite everyone else from **Settings → Team**.

Database migrations run automatically every time the container starts.

For automatic HTTPS, also set `DOMAIN` and `APP_BIND="127.0.0.1"` in `.env` and run `docker compose --profile https up -d --build`. The bundled Caddy container gets and renews the certificate.

Starting from scratch? **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md#create-a-server-step-by-step)** walks through creating the server on Google Cloud (static IP, firewall, storage bucket, VM, HTTPS, backups), with notes for AWS, DigitalOcean and your own hardware. It also covers email, SSO, upgrades and troubleshooting.

## Other ways to deploy

| Platform | How | Notes |
|---|---|---|
| **Render** | [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy) | Uses [render.yaml](./render.yaml): web service, Postgres and a disk for uploads. |
| **Railway** | [![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template) | Uses [railway.json](./railway.json). Add a Postgres plugin and a volume at `/app/uploads`. |
| **Fly.io** | `fly launch --copy-config` | Uses [fly.toml](./fly.toml); its header lists the exact commands. |
| **Your own server** | `docker compose up -d --build` | See above. Put it behind a reverse proxy for HTTPS. |

On every platform, set `NEXTAUTH_URL` to the final public URL and configure SMTP.

## Email is required in production

The app sends:

- Trust Center access links, and new-request alerts to admins.
- Sign-in codes: for returning Trust Center customers, the vendor portal and email-based MFA.
- Vendor questionnaire invitations.

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` in `.env`. Any SMTP provider works (Amazon SES, SendGrid, Postmark, Microsoft 365, Google Workspace).

During local development, leaving `SMTP_HOST` empty prints every email to the server log instead.

## Local development

```bash
npm install
cp .env.example .env              # set NEXTAUTH_SECRET
docker compose up -d db           # Postgres only
npx prisma migrate deploy
npm run dev                       # http://localhost:3002
```

**Want demo data?** On a fresh database, before visiting `/setup`, run `npx prisma db seed` and set `DEMO_MODE="true"`. Then sign in as `admin@demo.com` / `admin123`.

- The seed loads all 8 frameworks, sample risks and policies, and a full Trust Center including sample PDFs at `/trust/demo`. Every sample PDF is stamped "SAMPLE".
- The seed refuses to run once a real organisation exists, and it's safe to run again on the demo database.

Checks:

```bash
npx tsc --noEmit                  # type check
npm run build                     # production build
```

## How it's built

- **App**: Next.js 16 (App Router), React 18, TypeScript, Tailwind CSS.
- **Database**: PostgreSQL 14+ through Prisma. Migrations live in `prisma/migrations`.
- **Auth**: NextAuth v4 with bcrypt passwords, TOTP / email / WebAuthn MFA, and optional Entra ID SSO.
- **Files**: local disk under `./uploads` by default, or Google Cloud Storage when `GCS_BUCKET` is set.
- **Consistency**: every change runs in a database transaction together with its audit-log entry.

```
src/
├── app/
│   ├── (app)/           # Signed-in pages: dashboard, compliance, risks, vendors, trust-vault, settings…
│   ├── api/             # REST endpoints
│   ├── trust/[slug]/    # Public Trust Center
│   └── vendor-portal/   # External questionnaire portal
├── components/
└── lib/                 # auth, audit, permissions, storage, email, rate limiting…
prisma/
├── schema.prisma
├── migrations/
├── seed.ts              # Demo data (development only)
└── sample-documents.ts  # Generates the demo Trust Center PDFs
```

## Security

- **Startup checks**: the app refuses to start in production without a proper `NEXTAUTH_SECRET`.
- **Sessions**: passwords use bcrypt; sessions expire after 12 hours by default (`SESSION_MAX_AGE_HOURS`). Cookies are `HttpOnly` and `SameSite=Lax`, and `Secure` over HTTPS.
- **Security headers**: CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy` and HSTS.
- **Rate limits**: on sign-in, MFA, one-time codes, access requests and public document routes.
- **Token storage**: Trust Center and vendor-portal links are random 256-bit tokens, and only their SHA-256 hashes are stored. One-time codes are bcrypt-hashed, expire after 10 minutes and allow 5 attempts.
- **Uploads**: checked by type, size and file signature, and served with `nosniff`.
- **Privacy**: no telemetry, crash reporting or third-party analytics.

Found a vulnerability? Please report it privately as described in [SECURITY.md](./SECURITY.md), not as a public issue.

## Data portability

Your data is yours. Back up the database with any Postgres tool:

```bash
pg_dump "$DATABASE_URL" > grc-backup.sql
```

Uploaded files live in `./uploads` (the `uploads` Docker volume), or in your GCS bucket. See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md#backups) for a full backup and restore routine.

## Contributing

PRs welcome, especially framework updates when regulators publish revisions. See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, conventions and the checks to run.

## License

MIT. See [LICENSE](./LICENSE).
