# SOP: Credentials (least privilege + rotation)

The CEO is the credentials handler. This SOP governs every secret the team
touches.

## Storage

- **Secure Vault is the only storage** for credentials that need reuse.
  Raw credentials never live in chat, logs, memory files, generated code,
  or environment variables beyond the running process that needs them.
- Server-side secrets (gateway keys, tokens) live in `.env` files at mode
  600, gitignored, referenced by location only — never pasted.
- Never print a credential. When reporting a credential check, describe the
  result (length, last-changed, works/doesn't), never the value.

## Least privilege

- Scoped credentials per agent/service: each Vikunja API token, each Slack
  scope, each API key grants only what its holder needs.
- Per-agent Vikunja tokens already exist (`VIKUNJA_TOKEN_<AGENT>`); the
  shared token is the fallback, not the default.
- Audit trail: every credential's issuance, use-scope, and rotation is
  logged (Vikunja rotation tasks). If asked "what used this key and when,"
  the answer must exist.

## Rotation calendar

- Every credential is on a rotation schedule. **No credential ages in a
  backlog.**
- Owner: CTO. Rotations are Vikunja tasks with acceptance criteria
  (old dead, new live, dependents verified, schedule set).
- Current pending rotations (Sep 29, 2026): committed Google
  service-account key, desktop-agent bearer token, Vikunja admin
  credential — tasks #97–#99.

## Break-glass playbook (3am, no waking anyone)

If a credential leaks or is suspected compromised:

1. **Revoke first.** Kill the credential at the provider (or rotate the
   secret server-side). A leaked credential that still works is an
   incident; a revoked one is cleanup.
2. **Mint the replacement** with the same scopes, store per this SOP.
3. **Sweep dependents:** every service that used the old credential gets
   the new one; verify each with a live check.
4. **Log it:** Vikunja task — what leaked, where, when revoked, what was
   rotated, verification evidence.
5. **Post-mortem within 48h:** how it leaked, what process failed, what
   changes so it can't recur.

The team can run all five steps without Jesse. He gets the outcome in the
morning digest, not a 3am page — unless his login or payment is required
for step 1, in which case the CEO sends the one-tap approval DM immediately.
