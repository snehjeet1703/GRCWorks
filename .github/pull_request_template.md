## What does this change?

<!-- A short summary, and the issue it fixes, e.g. "Fixes #123". -->

## Why?

<!-- The problem this solves, or the context a reviewer needs. -->

## How was it tested?

<!-- Steps you took, and what you checked in the browser. -->

## Checklist

- [ ] `npx tsc --noEmit` reports 0 errors
- [ ] `npm run build` succeeds
- [ ] Schema changes include a migration in `prisma/migrations/` (no `db push`)
- [ ] Data-changing API routes check permissions and write an audit log entry
- [ ] UI changes checked in light and dark mode
- [ ] Docs updated if behaviour or configuration changed
- [ ] Framework/control changes cite the official source and version
