# Contributing to GRC Platform

Thanks for helping. Bug reports, framework updates, docs fixes and features are all welcome.

## Ground rules

- **Security issues go through [SECURITY.md](./SECURITY.md)**, never public issues.
- **For larger changes, open an issue first** so we can agree on the approach before you invest time.
- **Keep the project's promises:** no telemetry, no phone-home, no paid-only features, and every framework stays included.
- **Be kind.** Assume good intent and review the code, not the person.

## Development setup

You need Node.js 20.12+ (22 recommended) and Docker, or your own PostgreSQL 14+.

```bash
git clone https://github.com/<you>/grc-platform.git
cd grc-platform
npm install
cp .env.example .env
# set NEXTAUTH_SECRET: openssl rand -base64 48

docker compose up -d db           # Postgres on localhost:5432
npx prisma migrate deploy
npx prisma db seed                # optional demo data: admin@demo.com / admin123
npm run dev                       # http://localhost:3002
```

With `SMTP_HOST` empty in development, every email (sign-in codes, access links, invitations) is printed to the terminal running `npm run dev`.

## Making changes

1. Create a branch from `main`: `git checkout -b fix/short-description`.
2. Make your change and keep it focused: one fix or feature per pull request.
3. Run the checks:

   ```bash
   npx tsc --noEmit      # must report 0 errors
   npm run build         # must succeed
   ```

4. Run the API test suites in `tests/` that cover your change. Each suite creates and cleans up its own organisations, users and data through a running server on port 3002, so point that server at a **separate test database**, never your real one:

   ```bash
   # once: create the test database and apply migrations
   DATABASE_URL=postgresql://grc:grc_dev_password@localhost:5432/grc_test npx prisma migrate deploy
   # terminal 1: the app, using the test database
   DATABASE_URL=postgresql://grc:grc_dev_password@localhost:5432/grc_test npm run dev
   # terminal 2: one suite at a time
   DATABASE_URL=postgresql://grc:grc_dev_password@localhost:5432/grc_test npx tsx tests/tc-evidence.ts
   ```

   Sign-in is rate-limited to 30 attempts per IP every 15 minutes, and the suites sign in often. If a suite fails with "Login failed … no session cookie", restart the dev server (the limit is kept in memory) and run the rest.

5. Try the change in the browser, including both light and dark mode if you touched the UI.
6. Open a pull request using the template.

### Database changes

The schema lives in `prisma/schema.prisma`. Every schema change needs a **migration**; never use `prisma db push` for anything you commit.

```bash
npx prisma migrate dev --name short_description
```

Commit the generated folder under `prisma/migrations/`. Migrations must be safe on existing data: backfill new required columns, and never drop data without a migration path. They run automatically on every deployment.

### Conventions

- **Every write is audited:** API routes that change data run in a Prisma transaction together with a `logAudit` call.
- **Every route checks access:** use `requirePermission(...)` with the narrowest permission that fits. Public routes (Trust Center, vendor portal) need rate limits and must not reveal whether an email or token exists.
- **Validate input with Zod**, using `.strict()` objects, and return errors through `handleError`.
- **Never store secrets in plain text:** tokens are stored as SHA-256 hashes, one-time codes as bcrypt hashes.
- **UI** uses Tailwind with the existing CSS-variable theme tokens; avoid hard-coded colours so dark mode keeps working.
- **Match the surrounding code** in naming, comment style and structure.

### Framework and control updates

When a regulator publishes a revision, update the citations in `prisma/seed.ts` and the shared mappings in `prisma/control-mappings.ts`. In the PR description, include the **official source and version** of the control list.

## Commit messages

Use the imperative mood and explain the *why* in the body when it isn't obvious:

```
Trust Vault: let admins choose how long customer access lasts

The approval modal offers 7, 15, 30 or 60 days, or Always...
```

## Licence

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
