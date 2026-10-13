# Security policy

GRC Platform stores sensitive compliance data, so we take vulnerabilities seriously and appreciate responsible disclosure.

## Reporting a vulnerability

**Please do not open a public issue, discussion or pull request for security problems.**

Report privately through GitHub instead: open the repository's **Security** tab, then click **Report a vulnerability**. Only the maintainers can see the report.

Please include:

- what the issue is and what an attacker could do with it;
- the steps to reproduce it, or a proof of concept;
- the affected version or commit, and your deployment setup if it matters (Docker, reverse proxy, SSO, storage backend);
- whether you'd like to be credited, and under what name.

## What to expect

| Stage | Target time |
|---|---|
| Acknowledgement of your report | 3 working days |
| Initial assessment and severity | 7 working days |
| Fix released for critical and high issues | 30 days |
| Public advisory | Once a fix is available, coordinated with you |

We'll keep you updated as we go. If the report is accepted, we publish a GitHub Security Advisory with a CVE where appropriate, and credit you unless you'd rather stay anonymous.

## Supported versions

Security fixes go into the latest release on the `main` branch. Please upgrade to the latest version before reporting, and keep your deployment up to date (see [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md#upgrading)).

## Scope

In scope, for example:

- authentication, MFA, SSO or session bypasses;
- access-control flaws: seeing or changing data your role shouldn't reach;
- Trust Center or vendor-portal token, one-time-code or watermark bypasses;
- injection (SQL, XSS, header, CSV formula), SSRF and path traversal;
- file-upload problems: type checks, stored XSS, serving active content;
- secrets or personal data leaking through logs, errors or responses.

Out of scope:

- vulnerabilities in deployments that ignore [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md), for example the app exposed without a reverse proxy, which lets clients spoof IP headers and dodge rate limits;
- the demo seed data and its published demo password (development only);
- denial of service by volumetric traffic;
- missing best-practice headers that have no demonstrable impact;
- issues in third-party dependencies with no exploitable path in this app (please report those upstream).

## Safe harbour

We won't pursue legal action against good-faith research that follows this policy. That means you:

- test only against your own deployment;
- don't access or change other people's data;
- don't degrade service for others;
- give us reasonable time to fix the issue before disclosing it.
