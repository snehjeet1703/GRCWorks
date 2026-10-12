# GRC Platform

Open-source governance, risk, and compliance for teams under 50 people.

**MIT-licensed. Self-hosted. No telemetry. All frameworks included, no upcharges.**

Built because the vendors that promised "SOC 2 in a weekend" for $8k turn into a $20k+ renewal the moment you add a second framework. This runs on your own hardware or a $7/mo Fly.io machine, and every framework we ship is in the base image.

## What's in the box

- **Compliance** — Ship-ready seed for **6 frameworks**, all included:
  - SOC 2 Type II (33 controls)
  - ISO 27001:2022 (45 Annex A controls)
  - HIPAA Security Rule (46 controls)
  - PCI-DSS v4.0.1 (62 sub-requirements across 12 top-level requirements)
  - GDPR (31 operationally-relevant articles)
  - NIST CSF 2.0 (22 categories across 6 functions)
- **Risk register** with likelihood × impact scoring, treatments, owners, and control links.
- **Governance** — Policy lifecycle: draft → in-review → approved, with version bumps on approved-content edits and expiry tracking.
- **Evidence** — Upload artifacts against controls. Type-whitelisted (pdf, png, jpg, docx, xlsx, csv, txt, md, json, zip) with a 20MB cap and locally-stored files.
- **Multi-framework control mapping** — One control can satisfy requirements in multiple frameworks (SOC 2 CC6.1 + ISO A.8.5 + HIPAA §164.312(d), etc.).
- **Audit trail** — Every change logged with the actor, entity name, and before/after diff. Survives user deletion.
- **RBAC** — Admin / Editor / Viewer. Last-admin protection built in.

## What we deliberately do not ship (yet)

- No workflow builder.
- No trust center.
- No AI-scored risk narratives.
- No third-party attestation marketplace.
- No telemetry, and never any phone-home.

Those are what expensive incumbents bolt on to justify enterprise pricing. Skipping them is the whole point.

## Deploy in one click

| Platform | One-click | What you get |
|---|---|---|
| **Render** | [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy) | Web service + managed Postgres + 1 GB persistent disk for evidence, wired automatically. |
| **Railway** | [![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template) | App + Postgres in a single project. |
| **Fly.io** | `fly launch --copy-config` then `fly deploy` | Global machines + Fly Postgres, uses [fly.toml](./fly.toml). |
| **Docker Compose** | `docker compose up -d` after building | Local or your own VPS. |
| **Bare metal** | See below | Any Linux + Node 18+ + Postgres 14+. |

For every hosted path: point the "Deploy to Render/Railway" button at your fork of this repo, then set `NEXTAUTH_URL` to the URL the platform gives you. The Postgres URL and `NEXTAUTH_SECRET` are provisioned automatically.

**First run.** Each deployment serves one organisation. On a fresh database, open the app and you'll be taken to `/setup` to name your organisation and create the first administrator; the onboarding wizard then builds your compliance program. `/setup` locks itself once used — invite everyone else from **Settings → Team**.

## Local quick start

```bash
git clone <your-fork>
cd grc-platform
npm install
cp .env.example .env
# Generate a real secret (the app refuses to boot in production with the placeholder):
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
# → paste as NEXTAUTH_SECRET in .env

docker compose up -d          # starts Postgres
npx prisma migrate deploy     # applies migrations
npm run dev
```

Open <http://localhost:3000>: you'll land on `/setup` to create your organisation and admin account.

**Want a pre-filled demo instead?** Before visiting `/setup`, run `npx prisma db seed` and set `DEMO_MODE="true"` in `.env`, then sign in as `admin@demo.com` / `admin123`. The seed loads all 8 frameworks plus sample risks, policies and Trust Vault content. It is for development databases only: it refuses to run once a real organisation exists, and re-running it on the demo database is safe.

## What runs where

- **Framework**: Next.js 16 App Router, React 18, TypeScript.
- **Database**: PostgreSQL 14+ via Prisma.
- **Auth**: NextAuth v4, credentials provider, bcrypt at cost 12.
- **Styling**: Tailwind CSS, Lucide icons.
- **Uploads**: Local filesystem under `./uploads` (swap to S3 by replacing `src/lib/storage.ts`; the S3 env vars in `.env.example` are the target contract).
- **Every mutation** runs inside a Prisma transaction with its audit-log entry, so the trail is never out of sync with the data.

```
src/
├── app/
│   ├── (app)/          # Authenticated pages: dashboard, compliance, risks, governance, evidence, settings
│   ├── api/            # REST endpoints — all writes wrapped in $transaction + audit
│   └── login/          # Sign-in page
├── components/         # Modal, form primitives, toast, filter bar, control picker
├── lib/                # db, auth, audit, permissions, storage, api helpers
└── types/              # NextAuth session typing
prisma/
├── schema.prisma
├── migrations/
└── seed.ts             # Idempotent — safe to re-run
```

## Data portability

Your data is yours. Every table is documented Prisma-first in [prisma/schema.prisma](./prisma/schema.prisma). Postgres backup with the tool of your choice:

```bash
pg_dump "$DATABASE_URL" > grc-backup.sql
```

Evidence files live under `./uploads/` on the app machine — snapshot the volume/disk to include them.

## Security posture

- `NEXTAUTH_SECRET` is verified at boot in production; the app refuses to start on the placeholder value.
- Passwords hashed with bcrypt cost 12.
- Session cookies are `HttpOnly`, `SameSite=Lax`, `Secure` when served over HTTPS.
- All mutating endpoints check the session and, where applicable, an Editor/Admin role.
- Uploaded files are size-capped (20 MB) and extension-and-mime-type-whitelisted.
- File-download endpoint returns `Content-Disposition: attachment` — the browser will never render user content inline.
- No telemetry beacon, no crash reporter, no third-party analytics in the runtime.

## Contributing

PRs welcome — especially for framework updates when regulators publish revisions. Please keep control lists sourced (add the framework version to the PR description).

## License

MIT — see [LICENSE](./LICENSE).
