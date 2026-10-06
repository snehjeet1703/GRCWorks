# MFA Authentication — Implementation Plan

## Context

Add multi-factor authentication with three methods (Email OTP, TOTP authenticator apps, FIDO2/WebAuthn) plus org-level enforcement. Currently the platform has password-only auth via NextAuth CredentialsProvider with JWT sessions.

## Approach: Two-Phase JWT Login

`authorize()` returns the user with `mfaPending: true` in the JWT when MFA is enabled. New middleware redirects to `/mfa-verify` for any authenticated route while `mfaPending` is true. After successful MFA verification, the API re-encodes the JWT with `mfaPending: false` and sets it as the session cookie.

## Schema Changes (`prisma/schema.prisma`)

**Organization** — add `mfaRequired Boolean @default(false) @map("mfa_required")`

**User** — add:
- `mfaEnabled Boolean @default(false) @map("mfa_enabled")`
- `mfaMethod MfaMethod? @map("mfa_method")`
- `totpSecret String? @map("totp_secret")` (AES-256-GCM encrypted)
- `totpVerifiedAt DateTime? @map("totp_verified_at")`
- `recoveryCodes Json? @map("recovery_codes")` (array of bcrypt hashes)
- `mfaCredentials WebAuthnCredential[]`

**New enum:** `MfaMethod { EMAIL_OTP TOTP WEBAUTHN }`

**New models:**
- `WebAuthnCredential` — id, userId, credentialId (unique, base64url), publicKey (Bytes), counter (BigInt), deviceName, transports (Json), createdAt
- `MfaChallenge` — id, userId, type (MfaMethod), code (hashed OTP), challenge (WebAuthn string), expiresAt, used, createdAt

## Packages

```
npm install otpauth qrcode @simplewebauthn/server @simplewebauthn/browser nodemailer
npm install -D @types/qrcode @types/nodemailer
```

## New Files

### Lib
- `src/lib/mfa.ts` — TOTP generate/verify, recovery code generate/hash/verify, email OTP generate, TOTP secret encrypt/decrypt (AES-256-GCM from NEXTAUTH_SECRET)
- `src/lib/email.ts` — nodemailer SMTP transport wrapper, `sendOtpEmail(to, code)`

### Middleware
- `src/middleware.ts` — reads JWT via `getToken()`, redirects to `/mfa-verify` if `mfaPending=true` (allows `/mfa-verify`, `/api/mfa/*`, `/login`, `/api/auth/*`, `/trust/*`, static assets)

### API Routes
| Route | Methods | Purpose |
|---|---|---|
| `/api/mfa/setup/totp` | POST | Generate TOTP secret + QR code URI |
| `/api/mfa/setup/totp/verify` | POST | Confirm TOTP with code, enable MFA, return recovery codes |
| `/api/mfa/setup/email` | POST | Enable email OTP method |
| `/api/mfa/setup/webauthn/register-options` | POST | WebAuthn registration options |
| `/api/mfa/setup/webauthn/register` | POST | Verify + store WebAuthn credential |
| `/api/mfa/verify` | POST | Main MFA verification during login — validates code, re-encodes JWT with `mfaPending: false` |
| `/api/mfa/verify/email-send` | POST | Send email OTP during login |
| `/api/mfa/verify/webauthn-options` | POST | WebAuthn auth options during login |
| `/api/mfa/recovery` | POST | Verify recovery code, clear mfaPending |
| `/api/mfa/disable` | POST | Disable MFA (requires password, blocked if org enforces) |
| `/api/mfa/recovery-codes/regenerate` | POST | Regenerate recovery codes (requires password) |
| `/api/settings/security` | GET/PUT | Org-level MFA enforcement (uses ORG_MANAGE permission) |

### UI
- `src/app/mfa-verify/page.tsx` — MFA verification page shown after password login. Shows TOTP input, email OTP trigger+input, or WebAuthn prompt based on user's method. Recovery code fallback link. If org requires MFA but user hasn't set up, shows inline setup flow.
- `src/app/(app)/settings/settings-client.tsx` — add 4th "Security" tab with `KeyRound` icon:
  - Org admins: "Require MFA for all users" toggle
  - All users: MFA setup section (status, setup buttons per method, recovery codes, disable)

### Type Updates
- `src/types/next-auth.d.ts` — add `mfaPending?: boolean`, `mfaMethod?: string` to JWT and Session

### Auth Changes
- `src/lib/auth.ts` — in `authorize()`: after password check, query `user.mfaEnabled`/`mfaMethod` and also `organization.mfaRequired`. Return `mfaPending: true` if MFA enabled. JWT/session callbacks propagate the new fields.

## Env Variables

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — for email OTP
- `WEBAUTHN_RP_NAME` (default: "GRC Platform"), `WEBAUTHN_RP_ID` (default: "localhost"), `WEBAUTHN_ORIGIN` (default: "http://localhost:3002")

## Implementation Order

1. Schema + migration + packages
2. `src/lib/mfa.ts` + `src/lib/email.ts` utilities
3. Type updates (`next-auth.d.ts`) + auth.ts changes + middleware
4. TOTP setup APIs + verify API (proves the full MFA flow)
5. `/mfa-verify` page + Security tab in settings (TOTP only first)
6. Email OTP setup + verify APIs + UI
7. WebAuthn setup + verify APIs + UI
8. Recovery codes + org enforcement API + enforcement UI
9. Audit trail across all MFA events
10. Browser verification of all flows

## Verification

1. Enable TOTP → login → redirected to `/mfa-verify` → enter authenticator code → reach dashboard
2. Enable Email OTP → login → receive email → enter code → reach dashboard
3. Enable WebAuthn → login → touch key/biometric → reach dashboard
4. Use recovery code when locked out
5. Admin enables org MFA requirement → user without MFA forced to set up on login
6. User cannot disable MFA when org requires it
7. Audit log shows MFA events
