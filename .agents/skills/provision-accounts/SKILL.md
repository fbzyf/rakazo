---
name: provision-accounts
description: Create verified app accounts on a closed-registration self-host without public signup. Use when the maintainer asks to open, bootstrap, or batch-provision ordinary email/password accounts, including a first account or a cohort of colleagues.
---

# Provision closed-registration accounts

Public signup is off (`SIGNUPS_ENABLED=false`). Create ordinary verified accounts with the
server-side `bootstrap-owner` CLI. App accounts never administer the server.

A cloud agent cannot SSH to the production host. When the maintainer pastes into SSH, **one
command per turn**. Do not ask them to paste private keys or `.env` values. Talk to this
fork's maintainer in Chinese.

Public-repo rules: no hostnames, IPs, emails, account names, or secret values in commits or PRs.
Credentials stay in the SSH session and in mail the maintainer sends.

## Why the old command failed

The API image `WORKDIR` is `/app`. Compose sets the API service working directory to
`/app/apps/api` for the long-running process only. `docker compose exec` often uses `/app`, so
`node dist/cli/bootstrap-owner.js` looks for `/app/dist/cli/bootstrap-owner.js` and throws
`MODULE_NOT_FOUND`. Always pass `-w /app/apps/api` (or the absolute path
`/app/apps/api/dist/cli/bootstrap-owner.js`).

Do not wrap the exec in `set -e` *before* credentials are printed. The CLI prints a TSV row
as soon as the user exists, then creates the personal workspace. Capture stdout even if the
process later exits non-zero.

## One command (preferred)

From the compose root (`.env` + `docker-compose.images.yml`). Stdin is `email` or
`email<TAB>name`. Omit `OWNER_PASSWORD` so each new account gets a unique generated password.

```bash
docker compose --env-file .env -f docker-compose.images.yml exec -T -w /app/apps/api \
  api node --enable-source-maps dist/cli/bootstrap-owner.js <<'EOF'
pat@example.com	Pat
sam@example.com
EOF
```

Until this CLI is in the running image, generate the password on the host, **write the TSV
row first**, then exec one account (still with `-w /app/apps/api`):

```bash
OWNER_EMAIL=pat@example.com
OWNER_PASSWORD="$(openssl rand -hex 12)Aa1"
printf 'created\t%s\t%s\n' "$OWNER_EMAIL" "$OWNER_PASSWORD"
docker compose --env-file .env -f docker-compose.images.yml exec -T -w /app/apps/api \
  -e OWNER_EMAIL -e OWNER_PASSWORD \
  api node --enable-source-maps dist/cli/bootstrap-owner.js
```

Do not put `#` in a password if any wrapping `sh -c` might treat it as a comment.

## Output

Header plus one row per account: `status`, `email`, `password`.

| status | meaning |
|---|---|
| `created` | new verified account; password column is the credential |
| `verified` | existing unverified account; supplied password matched |
| `reset` | `OWNER_RESET_PASSWORD=1` set a new password |
| `exists` | already verified; password column empty; not changed |

An existing unverified account is not verified unless the supplied password matches. Re-running
for a verified account is a no-op unless `OWNER_RESET_PASSWORD=1`.

## After a successful TSV

1. Send each person the login origin, their email, and (for `created`/`reset`/`verified`) the
   password. Tell them to change it after first sign-in. If the deployment has transactional
   email, they can also use a sign-in code or a password-reset mail; still send the password
   when the CLI printed one.
2. Do not CC credentials to a public channel or a pull request.
3. Mark the operator's own tracking list as opened. Do not write that list into this repository.

## Checks

- Password auth stays enabled; this CLI does not open public signup.
- Computer/sandbox access is not granted by creating an account. Leave those off unless the
  person needs them.
- Source checkouts use `-f infra/compose/docker-compose.yml` instead of the images file.
